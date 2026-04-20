# Detector V2 — Implementation Plan

Version: 0.1 (Draft) Date: 2026-04-20 Status: Proposed — not started Owner:
Pollux working group

This document is the **execution contract** for rebuilding the Pollux escalation
detector around live executor observation. The conceptual case is made in
`docs/core/pollux/DETECTOR_REDESIGN_BRAINSTORM.md`; this file says **what ships,
when, in what order, guarded by which flags, with which tests**.

Related documents:

- `docs/core/pollux/DETECTOR_REDESIGN_BRAINSTORM.md` — north-star design notes
- `POLLUX_SPEC.md` §7 — current detector contract (heuristic / structured /
  hybrid)
- `docs/core/pollux/P3-05_ESCALATION_CALIBRATION_TUNING_GUIDE.md` — v1
  calibration corpus
- `docs/core/pollux/P0-07_IMPLEMENTATION_PR_TEMPLATE_TG_MAPPING.md` — TG matrix
- `IMPLEMENTATION_PLAN.md` — overall Pollux delivery plan

---

## 1) Scope

### 1.1 In scope

1. A new **live executor observer** that watches `ServerGeminiStreamEvent`
   events emitted by the Turn loop and accumulates behavioral signals
   (thought-stream, tool patterns, self-reported status, tool risk).
2. A **fusion layer** that combines signals with weighted scoring, precision
   priors, composite-evidence gates, negative signals, and time decay.
3. A new detector strategy: `live` (or `hybrid_v2`), composable with the
   existing `heuristic` / `structured` / `hybrid` strategies under a
   `detectorVersion` flag (`v1` default, `v2` opt-in).
4. New telemetry: additional escalation reason codes, per-signal attribution,
   and outcome capture for closed-loop calibration.
5. A v2 calibration harness and corpus.
6. Default flip from `v1 → v2` only after a full green cycle.

### 1.2 Out of scope for v2

1. **Speculative escalation** (kicking advisor off while executor streams) —
   reserved for v2.1.
2. **Branch-and-merge** turn forking — post-stability experiment.
3. **Shadow advisor** continuous sampling — post-stability experiment.
4. **Learned weights (logistic regression / online learning)** — requires
   telemetry data that phase G only begins to collect.
5. **A2A deferred surface** — remains explicitly non-Pollux
   (`docs/core/pollux/P2-06_A2A_DEFERRED_BYPASS.md`).
6. Deletion of v1 heuristic/structured/hybrid detectors — they remain callable
   under the `v1` flag for a deprecation window of ≥2 minor releases.

### 1.3 Non-goals

- Replacing the existing `LoopDetectionService` — we _read_ it, we do not
  rewrite it.
- Replacing the existing `<pollux:confidence:N>` tag mechanism — we extend it
  with a richer structured tag.
- Touching the policy channel (`ADVISOR_CONSULTATION_TOOL_NAME`) or the budget
  check (`checkAdvisorInvocationBudget`) beyond adding new reason codes — the
  escalation funnel stays intact.

---

## 2) Invariants (MUST HOLD every phase)

These are load-bearing. A phase is **not complete** until every applicable
invariant has an explicit test.

| #   | Invariant                                                                                                                                                                                                               | Current source of truth                                      | V2 test location                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | **Baseline purity**: with `experimental.pollux.enabled=false`, no v2 code runs and no allocations happen on the hot path.                                                                                               | `POLLUX_SPEC.md` §7.4                                        | `packages/core/src/pollux/observer/observer.test.ts` — assert observer factory returns a no-op when disabled                                                                                              |
| I2  | **Deterministic reason codes** — all escalation outcomes use `PolluxEscalationReasonCode` enum values.                                                                                                                  | `packages/core/src/pollux/types.ts:47–59`                    | Add new codes in same enum; snapshot test in `types.test.ts`                                                                                                                                              |
| I3  | **Fail-open**: observer exceptions never abort the executor turn.                                                                                                                                                       | `packages/core/src/pollux/safeguards.ts`                     | `observer.test.ts` — throw-in-sensor cases                                                                                                                                                                |
| I4  | **No extra LLM calls inside the detector**. Observer sensors are pure/synchronous.                                                                                                                                      | `POLLUX_SPEC.md` §7.4                                        | Existing detector purity tests — extend for observer.                                                                                                                                                     |
| I5  | **Policy channel unchanged** — still routed through `ADVISOR_CONSULTATION_TOOL_NAME` with full policy check.                                                                                                            | `packages/core/src/core/client.ts:784–799`                   | `client.test.ts` — existing policy-deny test must still pass under v2                                                                                                                                     |
| I6  | **Budget caps unchanged** — `checkAdvisorInvocationBudget` is the single source of truth.                                                                                                                               | `packages/core/src/pollux/safeguards.ts:40–71`               | Existing budget tests extended                                                                                                                                                                            |
| I7  | **Cross-surface parity** — legacy, agent-session, ACP behave identically under v2. A2A deferred remains a no-op.                                                                                                        | `docs/core/pollux/P2-07_CROSS_SURFACE_INTEGRATION_MATRIX.md` | New cross-surface matrix for v2 in that same doc                                                                                                                                                          |
| I8  | **Token accounting** — all advisor model calls continue to tag `LlmRole.UTILITY_ADVISOR`.                                                                                                                               | `packages/core/src/telemetry/llmRole.ts:20`                  | `uiTelemetry.test.ts` aggregate test                                                                                                                                                                      |
| I9  | **v1 detectors stay callable and tested** for the full deprecation window.                                                                                                                                              | N/A                                                          | `detector.test.ts` keeps running unmodified in CI                                                                                                                                                         |
| I10 | **Timing policy is explicit**: every escalation reason code is annotated `same_turn` or `next_turn` per §2a; the observer NEVER queues a high-confidence signal for next-turn when the confidence gate (§2a.2) is met.  | `DETECTOR_V2_IMPLEMENTATION_PLAN.md §2a`                     | `types.test.ts` — snapshot asserts a `timing` entry exists for every `PolluxEscalationReasonCode` value; `observer.test.ts` — high-confidence signal produces a `SameTurnIntent`, not a `NextTurnIntent`. |
| I11 | **Same-turn budget guardrail**: at most one same-turn escalation per executor turn; additional high-confidence signals during the same turn are either suppressed or merged into the next-turn queue, never re-entered. | §2a.4 (guardrails)                                           | `observer.test.ts` — two same-turn triggers in one turn produce exactly one advisor invocation.                                                                                                           |

---

## 2a) Timing policy — Decision Note (MUST READ BEFORE PHASE B)

Status: **Locked**. Version: 1.0. Supersedes any wording elsewhere in this plan
that implies "next-turn only" or "never interrupt current stream" as an absolute
rule. Where older wording conflicts with this section, **this section wins**.

### 2a.1 Policy

Pollux v2 uses a **hybrid timing policy**:

- **Default = next-turn.** Soft / composite signals (thought hedges, subject
  loops under the hard-precision bar, `tool.search_without_decide`, generic
  fusion composites) are queued as a `NextTurnIntent` and consumed by
  `maybeRunPolluxAdvisorConsultation` at the start of the next user turn.
- **Same-turn when confident.** Whenever the observer is _confident_ the
  executor is struggling (§2a.2 confidence gate), it emits a `SameTurnIntent`
  **during the current turn**, pauses the executor at the nearest safe event
  boundary, and invokes the advisor immediately. The advisor's guidance is
  injected back into the executor's context and the turn resumes (or is
  replaced) with advisor influence.

The rule is content-agnostic: it does **not** matter _why_ the executor is
struggling (risk-gated tool, confirmed loop, explicit self-report, or emphatic
fusion composite). If the confidence gate trips, the advisor is called
same-turn.

### 2a.2 The confidence gate

A signal or composite evaluation qualifies for same-turn escalation iff **any**
of the following hold:

1. **Hard-precision signal**: any `SensorSignal` with `hardPrecision: true` AND
   `precisionPrior ≥ 0.85` AND post-decay weight > 0. These are currently:
   - `risk.pre_tool_high` (risk gate, precision 0.95)
   - `loop.hard_confirmed` (LoopDetectionService bridge, precision 0.85)
   - `self.structured_status_stuck` (non-trivial `<pollux:status stuck_on>`,
     precision 0.95)
2. **Emphatic composite**: fusion `netScore ≥ sameTurnThreshold` where
   `sameTurnThreshold = max(threshold × 1.5, minAbsoluteSameTurnThreshold)`,
   `minAbsoluteSameTurnThreshold = 3.5` (default), AND the composite-evidence
   rule (§9.5) is satisfied (≥2 distinct categories contributing). This captures
   cases like "thought subject loop + failure cascade + exit-code regression all
   firing together" — no single signal is hard-precision, but the stack of
   evidence is unambiguous.
3. **Explicit escalation request**: future hook — reserved for user-driven "help
   me" UI affordance (out of scope for v2.0, reason code `V2_USER_REQUEST`).

Everything else is `NextTurnIntent`.

### 2a.3 Trigger matrix (canonical mapping)

Every reason code added in Phase A MUST declare its timing in
`PolluxEscalationReasonCode` metadata and be snapshot-tested per I10.

| Reason code                    | Timing        | Trigger                                                     | Precision prior |
| ------------------------------ | ------------- | ----------------------------------------------------------- | --------------- |
| `V2_RISK_GATE_BLOCK`           | **same_turn** | pending tool matches high-risk pattern                      | 0.95            |
| `V2_HARD_LOOP`                 | **same_turn** | `LoopDetectionService.peekState()` reports confirmed loop   | 0.85            |
| `V2_SELF_REPORT_STUCK`         | **same_turn** | `<pollux:status stuck_on="...">` with non-trivial obstacle  | 0.95            |
| `V2_FUSION_COMPOSITE_EMPHATIC` | **same_turn** | composite netScore ≥ `sameTurnThreshold` with ≥2 categories | computed        |
| `V2_FUSION_COMPOSITE`          | next_turn     | composite netScore ≥ `threshold` but < `sameTurnThreshold`  | computed        |
| `V2_LIVE_OBSERVER_MATCH`       | next_turn     | any non-hard-precision signal crossing normal threshold     | ≥ 0.50          |
| `V2_FUSION_BUDGET_TARGET`      | next_turn     | auto-calibrator lowered threshold to hit target rate        | auto            |

### 2a.4 Guardrails on same-turn escalation

All of these are MUST and have dedicated tests in Phase F:

1. **Single-shot per turn.** At most one same-turn advisor invocation per
   executor turn. The observer holds a boolean `sameTurnFiredThisTurn` flag,
   reset in `beginTurn()`. Additional same-turn qualifying signals after the
   first are either (a) suppressed if advisor output already addresses them, or
   (b) merged into a `NextTurnIntent`.
2. **No recursion.** The executor continuation that runs _after_ a same-turn
   advisor invocation runs with `sameTurnFiredThisTurn = true`; it cannot
   trigger another same-turn escalation. Additional signals during the
   continuation queue a next-turn intent.
3. **Policy channel unchanged (invariant I5).** Same-turn invocations still
   route through `ADVISOR_CONSULTATION_TOOL_NAME`, run the policy check, and
   honor DENY decisions. DENY → fail-open, executor continues its turn
   untouched.
4. **Budget unchanged (invariant I6).** A same-turn invocation consumes exactly
   one slot of `checkAdvisorInvocationBudget`. If the budget is exhausted, the
   signal is downgraded to a `NextTurnIntent` (which itself may be suppressed by
   budget) and the executor continues.
5. **Fail-open (invariant I3).** If the observer, the confidence gate evaluator,
   the pause mechanism, or the advisor call itself throws, the turn resumes as
   if no escalation was requested. No exception is allowed to abort the
   executor.
6. **No mid-stream policy re-entry.** The pause point is an **event boundary**
   (end of a `ServerGeminiStreamEvent` dispatch), never mid-part. The observer
   does not interrupt partial content delivery.
7. **Risk gate is pre-tool.** The `V2_RISK_GATE_BLOCK` pause point is the
   `ToolCallRequest` event boundary, _before_ the tool executes, so the advisor
   can actually influence the decision. The tool scheduler already has a
   confirmation seam we can hook into (see §7.B for details).
8. **Other same-turn triggers are post-event.** `V2_HARD_LOOP`,
   `V2_SELF_REPORT_STUCK`, and `V2_FUSION_COMPOSITE_EMPHATIC` pause after the
   triggering event's dispatch completes. They do not try to rewind in-flight
   work.

### 2a.5 Telemetry timing field

Every `PolluxAdvisorPhasePayload` MUST carry an explicit
`escalationTiming: 'same_turn' | 'next_turn'` field (Phase A). This makes CI
assertions unambiguous and makes fail-open storms detectable by filtering on
`escalationTiming='same_turn' AND advisorOutcome='failed'`.

### 2a.6 What this closes / what it does NOT open

**Closed:**

- The safety gap where `rm -rf /` could execute before advisor advice.
- The UX gap where a confirmed loop burns another full turn of tokens before
  help arrives.
- The test ambiguity where "should this have escalated now or later?" depended
  on reader interpretation.

**NOT opened (deliberately deferred to v2.1+):**

- Speculative escalation (kick advisor off while executor _keeps streaming_ in
  parallel). §1.2 exclusion still holds; pause-and-resume is sequential.
- Branch-and-merge turn forking.
- Mid-part streaming interruption (pause is at event boundary only).
- User-facing "stop and ask advisor" button (reserved for `V2_USER_REQUEST`).

---

## 3) Architecture overview

### 3.1 Conceptual flow under v2

```
                 ┌────────────────────────────────────────────────────────┐
                 │ GeminiClient.processTurn  (client.ts:893)              │
                 │                                                        │
 user request ──▶│  maybeRunPolluxAdvisorConsultation                     │
                 │    └── v1: detector.shouldEscalate (one-shot)          │
                 │    └── v2: consume pending NextTurnIntent (if any)     │
                 │            then seed LiveExecutorObserver for turn     │
                 │                                                        │
                 │  turn.run → stream events ──────────────────────────┐  │
                 │                                                     ▼  │
                 │     ┌──────────────────────────────────────────────────┐
                 │     │ LiveExecutorObserver (NEW)                     │ │
                 │     │   ThoughtSensor · ToolPatternSensor            │ │
                 │     │   SelfReportSensor · LoopBridge · RiskGate     │ │
                 │     │        │                                       │ │
                 │     │        ▼                                       │ │
                 │     │   FusionLayer → ConfidenceGate (§2a.2)         │ │
                 │     └──────────────────────────────────────────────────┘
                 │             │                         │                │
                 │             │ confident? YES          │ confident? NO  │
                 │             ▼                         ▼                │
                 │     ┌───────────────────┐   ┌────────────────────┐     │
                 │     │ SameTurnIntent    │   │ NextTurnIntent      │    │
                 │     │ (pause at event   │   │ (queued; consumed   │    │
                 │     │  boundary, invoke │   │  at next turn start)│    │
                 │     │  advisor NOW,     │   │                     │    │
                 │     │  inject guidance, │   │                     │    │
                 │     │  resume)          │   │                     │    │
                 │     └───────────────────┘   └────────────────────┘     │
                 │             │                                          │
                 │             └─── both paths go through ────────────────┤
                 │                  ADVISOR_CONSULTATION_TOOL_NAME        │
                 │                  (policy gate + budget check)          │
                 └────────────────────────────────────────────────────────┘
```

Key properties:

1. The observer **never interrupts mid-part content delivery**. Same-turn pauses
   always happen at an event boundary (`ToolCallRequest` for risk gate;
   end-of-event for all other same-turn triggers).
2. The observer emits **exactly one** of `SameTurnIntent` or `NextTurnIntent`
   per triggering evaluation. The confidence gate (§2a.2) decides which.
3. Both paths funnel through the same `ADVISOR_CONSULTATION_TOOL_NAME`
   policy/budget channel. Same-turn is a **timing** change only, not a policy
   bypass.
4. Per turn, at most **one** same-turn advisor invocation (I11). Any additional
   high-confidence signals in the same turn become `NextTurnIntent`s.
5. Fail-open everywhere: if any step in the same-turn path throws, the executor
   resumes its turn untouched.

### 3.2 New module layout

```
packages/core/src/pollux/
├── detector.ts               (unchanged; v1 lives here, stays exported)
├── types.ts                  (extended: new reason codes, v2 config fields)
├── prompts.ts                (extended: <pollux:status> parser)
├── safeguards.ts             (unchanged)
├── observer/                 (NEW)
│   ├── index.ts              re-exports
│   ├── observer.ts           LiveExecutorObserver orchestrator
│   ├── fusion.ts             FusionLayer: scoring, negative signals, decay
│   ├── sensors/
│   │   ├── base.ts           Sensor interface + helpers
│   │   ├── thought.ts        ThoughtSensor (subject-loop, hedges, contradictions)
│   │   ├── toolPattern.ts    identical-call, exit-code, cascade, search-only
│   │   ├── selfReport.ts     <pollux:status>, asymmetric confidence
│   │   ├── loopBridge.ts     LoopDetectionService → observer adapter
│   │   └── riskGate.ts       pending-tool risk classifier
│   └── calibrationV2.ts      v2 corpus + harness
└── index.ts                  (adds observer/* re-exports)
```

### 3.3 How existing code plugs in

1. **`client.ts:985`** (`maybeRunPolluxAdvisorConsultation`) — unchanged entry
   point. Under `detectorVersion='v2'` it also:
   - Consumes any pending `NextTurnIntent` from the previous turn.
   - Is re-enterable from inside the stream loop to service a `SameTurnIntent`
     (new in v2; guarded by the single-shot flag from §2a.4 guardrail 1).
2. **`client.ts:1067–1092`** (`for await (const event of resultStream)`) —
   observer receives every event here in parallel with
   `loopDetector.addAndCheck`. After each event dispatch completes, the loop
   checks `observer.peekSameTurnIntent()`; if set, it runs the same-turn
   pause/advisor/resume sequence (Phase F) before processing the next event.
3. **`services/loopDetectionService.ts`** — unchanged externally. A thin bridge
   in `observer/sensors/loopBridge.ts` reads the service's existing result
   (`LoopDetectionResult`) via a new read-only accessor. When the service
   reports a confirmed loop, the bridge emits a hard-precision signal and the
   confidence gate promotes it to a `SameTurnIntent`.
4. **`core/turn.ts:310–317`** (Thought event emission) — unchanged; observer
   consumes the event stream that already exists.
5. **`core/prompts.ts` / `PromptProvider.getCoreSystemPrompt`** — phase E adds a
   conditional block when `detectorVersion='v2'` is active.
6. **Tool scheduler confirmation seam** — Phase B hooks the existing
   pre-execution confirmation path to insert the risk-gate advisor call _before_
   a high-risk tool actually runs, instead of racing it.

---

## 4) Config surface changes

All new fields gated by `experimental.pollux.detectorVersion`. The whole v2
subtree is a no-op when `detectorVersion='v1'` (default).

### 4.1 `PolluxExperimentalConfig` additions

`packages/core/src/pollux/types.ts`:

```ts
export const PolluxDetectorVersion = {
  V1: 'v1',
  V2: 'v2',
} as const;
export type PolluxDetectorVersion =
  (typeof PolluxDetectorVersion)[keyof typeof PolluxDetectorVersion];

export interface PolluxV2Config {
  readonly enabled: boolean; // master for v2 subtree; default false
  readonly riskGate: {
    readonly enabled: boolean; // default true when v2.enabled
    readonly mode: 'allowlist' | 'blocklist';
    readonly denyPatterns: readonly string[];
  };
  readonly observer: {
    readonly enabled: boolean; // default true when v2.enabled
    readonly maxThoughtWindowChars: number; // default 16384
    readonly maxToolEventWindow: number; // default 64
    readonly decayHalfLifeMs: number; // default 15000
  };
  readonly selfReport: {
    readonly enabled: boolean; // default true when v2.enabled
    readonly promptPrimingEnabled: boolean; // default true
  };
  readonly fusion: {
    readonly targetEscalationRate: number; // 0..1; default 0.05
    readonly requireComposite: boolean; // default true
    readonly lowPrecisionFloor: number; // default 0.5
    // Same-turn emphatic-composite threshold (see §2a.2 rule 2).
    // netScore >= max(threshold * sameTurnThresholdMultiplier,
    //                 sameTurnAbsoluteFloor)  → SameTurnIntent
    readonly sameTurnThresholdMultiplier: number; // default 1.5
    readonly sameTurnAbsoluteFloor: number; // default 3.5
  };
  readonly timing: {
    // Hard kill-switch for same-turn escalation. Policy (§2a) still applies
    // when enabled; flipping false forces everything to next-turn (legacy
    // behavior from the pre-decision-note draft).
    readonly sameTurnEnabled: boolean; // default true when v2.enabled
    // Guardrail I11 cap. Keep at 1 unless you know why you're changing it.
    readonly maxSameTurnEscalationsPerTurn: number; // default 1
  };
}

export interface PolluxExperimentalConfig {
  // ...existing fields...
  readonly detectorVersion: PolluxDetectorVersion; // default 'v1'
  readonly v2: PolluxV2Config;
}
```

### 4.2 Defaults (`DEFAULT_POLLUX_EXPERIMENTAL_CONFIG`)

```ts
detectorVersion: PolluxDetectorVersion.V1,
v2: {
  enabled: false,
  riskGate: { enabled: false, mode: 'blocklist', denyPatterns: [] },
  observer: { enabled: false, maxThoughtWindowChars: 16384, maxToolEventWindow: 64, decayHalfLifeMs: 15000 },
  selfReport: { enabled: false, promptPrimingEnabled: false },
  fusion: {
    targetEscalationRate: 0.05,
    requireComposite: true,
    lowPrecisionFloor: 0.5,
    sameTurnThresholdMultiplier: 1.5,
    sameTurnAbsoluteFloor: 3.5,
  },
  timing: { sameTurnEnabled: false, maxSameTurnEscalationsPerTurn: 1 },
}
```

When a user sets `detectorVersion='v2'`, `mergePolluxExperimentalConfig` flips
the subtree `enabled` flags to `true` unless explicitly overridden.

### 4.3 Settings schema deltas

`packages/cli/src/config/settingsSchema.ts:2221` — under
`experimental.pollux.*`, add:

- `detectorVersion` (enum: v1 | v2; default v1; `requiresRestart: true`)
- `v2` (object) with nested objects for `riskGate`, `observer`, `selfReport`,
  `fusion`. Each leaf mirrors the shape in §4.1 with `showInDialog: false`.

### 4.4 Config accessor

No new accessor needed. `config.getPolluxExperimentalConfig()` already returns
the merged shape; v2 fields come for free.

### 4.5 Migration behavior (v1 → v2)

1. **Silent default**: upgrading the CLI version does not enable v2.
2. When users opt in (`detectorVersion='v2'`), the system emits one startup
   `debugLogger` line explaining the change.
3. Telemetry continues under the same roles. New reason codes listed in §6.

---

## 5) Phase roadmap

| Phase | Focus                                                                                                      | PR size | Gate                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| A     | Foundation: flag, module scaffolding, reason codes, telemetry hooks — all no-ops behind `v2.enabled=false` | S       | All existing tests green; new invariant I1 test added                                                            |
| B     | Risk gate (Tier 5) — high-precision pre-action escalation                                                  | M       | Unit tests + integration test covering `rm -rf` / `git push` paths                                               |
| C     | LoopDetectionService bridge — reroute existing high-precision signal                                       | S       | Integration test: loop-triggered turn produces a queued escalation intent instead of being silently halted       |
| D     | Live executor observer core + fusion layer (Tier 1 + Tier 2 + Tier 6.fusion)                               | L       | Full observer test suite; precision/recall unit tests on v2 corpus                                               |
| E     | Self-report channel — structured `<pollux:status>` tag and asymmetric confidence                           | M       | Prompt priming test; parser test; sensor integration test                                                        |
| F     | Full v2 detector composition + budget-targeted threshold                                                   | M       | End-to-end test: v2 detector runs through `maybeRunPolluxAdvisorConsultation` and fails-open on sensor exception |
| G     | Outcome telemetry (collect only, no behavior change)                                                       | M       | New telemetry event shape added to `P3-06_TELEMETRY_RECONCILIATION_REPORT.md`                                    |
| H     | V2 calibration corpus + benchmark condition F                                                              | M       | Benchmark run produces precision/recall metrics for v2                                                           |
| I     | Default flip `v1 → v2` + v1 deprecation timeline in spec                                                   | S       | Full CI green + TG-1..10 green under v2 defaults                                                                 |

Phases A-C are parallelizable in principle but should ship in order so each PR
is reviewable against a settled baseline. Phase D depends on A. Phase F depends
on D + E. Phase I depends on H.

---

## 6) Phase A — Foundation (flag + scaffolding)

### A.1 Tasks

1. Add `PolluxDetectorVersion` enum + `PolluxV2Config` type in
   `packages/core/src/pollux/types.ts`.
2. Update `DEFAULT_POLLUX_EXPERIMENTAL_CONFIG` and
   `mergePolluxExperimentalConfig` to handle the new subtree with safe defaults
   (all `false`, except leaf flags that cascade from `v2.enabled`).
3. Update schema in `packages/cli/src/config/settingsSchema.ts:2221` with the
   new nested properties.
4. Create the observer directory skeleton (§3.2) — all files exist but export
   pure no-ops (`observer.shouldEscalate()` returns
   `{ escalate: false, reasonCode: NONE, strategy: HEURISTIC }`).
5. Add new reason codes to `PolluxEscalationReasonCode`, each paired with a
   canonical **timing** entry per §2a.3 (enforced by invariant I10):
   - `V2_LIVE_OBSERVER_MATCH` — `next_turn`
   - `V2_RISK_GATE_BLOCK` — `same_turn`
   - `V2_HARD_LOOP` — `same_turn`
   - `V2_SELF_REPORT_STUCK` — `same_turn`
   - `V2_FUSION_COMPOSITE` — `next_turn`
   - `V2_FUSION_COMPOSITE_EMPHATIC` — `same_turn` (new; netScore ≥
     `sameTurnThreshold`)
   - `V2_FUSION_BUDGET_TARGET` — `next_turn`

   Export a const map
   `POLLUX_ESCALATION_TIMING: Readonly<Record<PolluxEscalationReasonCode, 'same_turn' | 'next_turn'>>`
   adjacent to the enum. Every reason code present in the enum MUST have a key
   in this map — enforced by a snapshot test.

6. Define the two intent shapes in `packages/core/src/pollux/observer/types.ts`
   (new file; co-located with the observer module):

   ```ts
   export interface BaseEscalationIntent {
     readonly reasonCode: PolluxEscalationReasonCode;
     readonly netScore: number;
     readonly contributingSignalIds: readonly string[];
     readonly queuedAtMs: number;
   }

   export interface SameTurnIntent extends BaseEscalationIntent {
     readonly timing: 'same_turn';
     readonly pauseBoundary: 'pre_tool' | 'post_event';
     // When pauseBoundary='pre_tool', the observer also carries the
     // pending ToolCallRequestInfo so the advisor can reason about the
     // specific action it is gating.
     readonly pendingTool?: ToolCallRequestInfo;
   }

   export interface NextTurnIntent extends BaseEscalationIntent {
     readonly timing: 'next_turn';
   }

   export type EscalationIntent = SameTurnIntent | NextTurnIntent;
   ```

7. Extend `emitPolluxAdvisorPhase` (no new event). Add to
   `PolluxAdvisorPhasePayload` in `packages/core/src/utils/events.ts`:
   - `detectorVersion?: 'v1' | 'v2'`
   - `escalationTiming?: 'same_turn' | 'next_turn'` (REQUIRED under v2 when the
     payload describes an escalation; invariant I10 snapshot test asserts it is
     always set for v2 phases)
   - `contributingSignalIds?: readonly string[]`

### A.2 Files touched

- `packages/core/src/pollux/types.ts` (types, defaults, merge)
- `packages/core/src/pollux/index.ts` (re-exports)
- `packages/core/src/pollux/observer/**` (new)
- `packages/cli/src/config/settingsSchema.ts:2221` (schema delta)
- `packages/core/src/utils/events.ts:199–204` (payload delta)
- `docs/reference/configuration.md` (document the new flags)
- `POLLUX_SPEC.md` (add §7.5 placeholder referencing this plan)

### A.3 Tests

- `packages/core/src/pollux/types.test.ts` — snapshot of defaults, merge rules
  for v2 subtree; **plus** the invariant I10 assertion that every
  `PolluxEscalationReasonCode` enum value has a matching entry in
  `POLLUX_ESCALATION_TIMING`, and the timing values exactly match §2a.3.
- `packages/core/src/pollux/observer/observer.test.ts` (new) — no-op observer
  returns `{ escalate: false, NONE }` under default config; never throws. Also
  asserts that under default config, `peekSameTurnIntent()` and
  `consumePendingIntent()` both return `undefined`.
- `packages/cli/src/config/settingsSchema.test.ts` — schema generation check,
  ConfigParameters mapping invariant (POLLUX_SPEC §8.4).

### A.4 Acceptance criteria

- All existing tests green.
- `git diff` shows no behavior change under default config.
- Invariant I1 verified by unit test.

### A.5 Rollback

Revert PR. Schema default was `v1`, so no user was exercising new code paths.

---

## 7) Phase B — Risk gate (Tier 5)

### B.1 Rationale

Highest-precision signal available and the most defensible Pro spend. A
`rm -rf /`, `git push --force origin main`, `DROP TABLE`, or a 20-file refactor
should _always_ get a second opinion regardless of other signals.

### B.2 Tasks

1. Implement `observer/sensors/riskGate.ts`:
   - Input: `ToolCallRequestInfo` (name + args).
   - Output: `{ risk: 'low' | 'elevated' | 'high', reason?: string }`.
   - Classification:
     - **high**: `run_shell_command` with patterns matching denylist
       (`rm\s+-rf`, `git\s+push\s+--force`, `DROP\s+TABLE`, `DELETE\s+FROM`
       without `WHERE`, `chmod\s+777`, `> /dev/sd`); `delete_file`; `write_file`
       to `.env`, `migrations/`, top-level `package.json` `dependencies` key.
     - **elevated**: edit/write that touches >N files (N=5 default) or crosses
       package boundaries; `write_file` under `/etc`.
     - **low**: everything else.
   - Patterns come from `config.v2.riskGate.denyPatterns` and hardcoded defaults
     merged.
2. Signal emission: `high` → `risk.pre_tool_high` sensor signal with
   `hardPrecision: true` and `precisionPrior: 0.95`. The confidence gate (§2a.2
   rule 1) promotes it to a `SameTurnIntent` with
   `reasonCode: V2_RISK_GATE_BLOCK` and `pauseBoundary: 'pre_tool'`.
3. Wire into observer: the risk sensor fires **before** tool execution, at the
   `ToolCallRequest` event boundary. Concretely, inside the
   `client.ts:1067–1092` for-await loop, when
   `event.type === ServerGeminiEventType.ToolCallRequest`, the observer's
   `ingest(event, ...)` runs FIRST and synchronously evaluates the risk sensor.
   If `peekSameTurnIntent()` returns a `pre_tool` intent:
   - The client calls `maybeRunPolluxAdvisorConsultation(intent)` BEFORE handing
     the `ToolCallRequestInfo` to the scheduler.
   - The advisor result is injected into the conversation (same mechanism as the
     existing post-turn advisor path) and the executor can either proceed with
     the original tool call, modify it, or abandon it — the decision belongs to
     the executor on resume. We do not block the tool outright; we ensure the
     advisor was consulted first.
   - If the advisor call is DENIED by policy, BUDGET-capped, or THROWS, the
     observer clears the intent, logs fail-open, and the scheduler proceeds as
     if no escalation was requested (invariants I3, I5, I6 and §2a.4 guardrails
     3–5).
4. **Same-turn budget accounting**: the single-shot flag (§2a.4 guardrail 1) is
   set here. Subsequent same-turn-eligible signals in the same turn downgrade to
   `NextTurnIntent`.

### B.3 Files touched

- `packages/core/src/pollux/observer/sensors/riskGate.ts` (new)
- `packages/core/src/pollux/observer/observer.ts` (wire sensor)
- `packages/core/src/pollux/types.ts` (already added in phase A)

### B.4 Tests

- `riskGate.test.ts` — pattern coverage for each classification level; arg
  shapes from both `shell` and `edit` tools.
- `observer.test.ts` (extended) — observer produces a
  `SameTurnIntent{ reasonCode: V2_RISK_GATE_BLOCK, pauseBoundary: 'pre_tool' }`
  synchronously when a high-risk `ToolCallRequest` is ingested, BEFORE any tool
  result event is seen.
- `client.test.ts` (extended) — integration: a `rm -rf /tmp/*` tool request
  causes `maybeRunPolluxAdvisorConsultation` to be invoked **in the same turn**,
  **before** the tool scheduler executes the call. Assertion order: advisor
  phase `request` emitted, then tool scheduler called.
- `client.test.ts` — fail-open: advisor call throws → tool still executes, no
  exception escapes the turn loop.
- `client.test.ts` — policy DENY on risk-gate path: advisor consultation denied
  → tool still executes (I5); reason code `V2_RISK_GATE_BLOCK` and
  `advisorOutcome: 'denied'` in telemetry.
- `client.test.ts` — single-shot guardrail (I11): two high-risk tool requests in
  the same turn → exactly one advisor invocation; second request's signal is
  downgraded to `NextTurnIntent`.

### B.5 Acceptance criteria

- Zero false negatives on a seeded list of 20 known-dangerous commands.
- Zero false positives on 50 benign shell commands (e.g. `ls`, `git status`,
  `npm test`).
- Existing shell-tool confirmation flow unchanged (this is additive escalation,
  not a new block).

### B.6 Rollback

Flip `v2.riskGate.enabled = false`. Fully independent from other phases.

---

## 8) Phase C — LoopDetectionService bridge (Tier 2)

### C.1 Rationale

`LoopDetectionService` at `packages/core/src/services/loopDetectionService.ts`
already detects tool-call repetition (≥5 identical calls) and content chanting,
plus a periodic LLM-based loop check (`LLM_CONFIDENCE_THRESHOLD = 0.9`). Today,
when it fires, it emits `GeminiEventType.LoopDetected` and the turn halts
(client.ts:999–1015, 1067–1097). Under v2, we want the same detection to
escalate instead of (or in addition to) halting.

### C.2 Tasks

1. Add read-only telemetry accessor on `LoopDetectionService`:
   - `peekState(): { loopDetected: boolean; lastLoopType?: LoopType; detail?: string; confirmedByModel?: string }`.
   - No state mutation; used by the observer bridge.
2. Implement `observer/sensors/loopBridge.ts`:
   - On every event in the streaming loop, poll
     `loopDetectionService.peekState()`.
   - When a loop is confirmed, emit signal `loop.hard_confirmed` with
     `hardPrecision: true`, `precisionPrior: 0.85`. The confidence gate (§2a.2
     rule 1) promotes it to a
     `SameTurnIntent{ reasonCode: V2_HARD_LOOP, pauseBoundary: 'post_event' }`.
3. Integrate in `client.ts:1067–1097`: when v2 is enabled AND the observer is
   active AND `v2.timing.sameTurnEnabled=true`, a confirmed loop:
   - Still raises the existing `GeminiEventType.LoopDetected` so v1 halt
     behavior is unchanged (invariant I9 spirit — don't break v1 path).
   - **Also** emits a `SameTurnIntent`. The current client halt path is replaced
     under v2 by: pause → run advisor with the intent → inject advisor guidance
     → resume with advisor-conditioned prompt. The turn is NOT silently dropped
     anymore.
   - If `v2.timing.sameTurnEnabled=false` (or advisor fails / is DENIED /
     budget-capped), fall back to the legacy halt behavior AND queue a
     `NextTurnIntent` so the user's next turn benefits from advisor help.
4. Phase F consumes whichever intent was produced. Phase C ships with
   `sameTurnEnabled=false` defaulted (so behavior is identical to the
   pre-decision-note draft); Phase F flips the default to `true` with the
   integration test coverage in place.

### C.3 Files touched

- `packages/core/src/services/loopDetectionService.ts` — add `peekState()`
  (non-invasive; no existing tests break).
- `packages/core/src/pollux/observer/sensors/loopBridge.ts` (new)
- `packages/core/src/pollux/observer/observer.ts` (wire sensor)
- `packages/core/src/core/client.ts:1067–1097` — conditional observer hook under
  `v2.observer.enabled`.

### C.4 Tests

- `loopBridge.test.ts` — bridge emits `loop.hard_confirmed` when service reports
  a loop, does not emit when idle.
- `client.test.ts` — under v2 with `sameTurnEnabled=false` (Phase C default), a
  loop-detected turn still halts AND queues a `NextTurnIntent` with
  `reasonCode: V2_HARD_LOOP`.
- `client.test.ts` — under v2 with `sameTurnEnabled=true` (exercised here to
  unblock Phase F), a loop-detected turn pauses, invokes advisor, and resumes
  with advisor guidance prepended. No silent drop.
- `client.test.ts` — fail-open: `loopDetectionService.peekState()` throws →
  observer emits no signal; executor path unchanged.

### C.5 Acceptance criteria

- Existing `LoopDetectionService` tests unchanged and passing.
- With `sameTurnEnabled=false`: loop detection halts exactly as today, and
  additionally queues a `NextTurnIntent` (purely additive).
- With `sameTurnEnabled=true`: loop detection produces a `SameTurnIntent` that,
  when consumed, replaces the silent halt with an advisor-in-the- loop
  continuation. If advisor is unavailable (DENY / budget / throw), behavior
  gracefully degrades to the legacy halt + `NextTurnIntent`.

### C.6 Rollback

Flip `v2.observer.enabled = false`.

---

## 9) Phase D — Live executor observer core (Tier 1 + fusion base)

### D.1 Rationale

This is the heart of v2: sensors that watch the executor's behavior _as it
happens_ and feed a fusion layer.

### D.2 Sensor contracts

`observer/sensors/base.ts`:

```ts
export interface SensorInput {
  readonly event: ServerGeminiStreamEvent;
  readonly turnElapsedMs: number;
  readonly toolEventWindow: readonly ToolEventRecord[]; // bounded
  readonly thoughtWindow: readonly ThoughtSummary[]; // bounded
}

export interface SensorSignal {
  readonly id: string; // stable, e.g. 'thought.subject_loop'
  readonly weight: number; // positive or negative
  readonly precisionPrior: number; // 0..1
  readonly category: 'thought' | 'tool' | 'self' | 'longitudinal' | 'risk';
  readonly hardPrecision?: boolean; // bypass composite-evidence
  readonly tsMs: number; // for decay
  readonly attribution?: string; // human-readable reason
}

export interface Sensor {
  readonly id: string;
  observe(input: SensorInput): readonly SensorSignal[];
}
```

All sensors are **pure over their input**; internal state lives in the observer
(bounded windows), not in the sensor.

### D.3 Thought sensor features (`sensors/thought.ts`)

Signals this sensor can emit:

| Signal id                    | Weight | Precision prior | Detection                                                                                                               |
| ---------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `thought.subject_loop`       | 2      | 0.75            | Same subject (normalized, Levenshtein ≤ 3) appears ≥3 times in the window                                               |
| `thought.hedge_density`      | 1      | 0.40            | Token ratio of hedges above threshold (`maybe`, `perhaps`, `I think`, `might`, `let me try`, `actually`, `wait`, `hmm`) |
| `thought.self_contradiction` | 1      | 0.55            | Matches "`actually no`", "`wait that's wrong`", "`scratch that`", "`on second thought`"                                 |
| `thought.stall`              | 1      | 0.50            | Same subject twice with longer description the second time                                                              |
| `thought.entropy_spike`      | 1      | 0.45            | Count of distinct subjects per minute crosses 2× session median                                                         |

Windowing rules:

- Bounded by `observer.maxThoughtWindowChars` (16384 default).
- FIFO on character budget; subject dedup for loop detection done on normalized
  lowercase trimmed strings.

### D.4 Tool-pattern sensor (`sensors/toolPattern.ts`)

| Signal id                    | Weight | Precision prior | Detection                                                                                                                                                                                   |
| ---------------------------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool.identical_repeat`      | 2      | 0.75            | Same `(name, argsHash)` ≥ 3 times (less strict than LoopDetectionService's 5, bridged to capture earlier)                                                                                   |
| `tool.exit_regression`       | 1      | 0.50            | Shell exit code oscillates 1→0→1→0 across consecutive runs                                                                                                                                  |
| `tool.failure_cascade`       | 2      | 0.80            | ≥3 consecutive non-zero exits or schema errors                                                                                                                                              |
| `tool.search_without_decide` | 1      | 0.45            | ≥8 read-only tool calls with 0 mutations AND user prompt matches non-exploratory pattern (`fix\|implement\|add\|make.*work`). Sensor returns **no signal** if the prompt looks exploratory. |
| `tool.token_burn`            | 1      | 0.55            | Turn has consumed > 2× session-median successful-turn token count                                                                                                                           |

All tool events tracked via a ring buffer of size `maxToolEventWindow` (64).

### D.5 Fusion layer (`observer/fusion.ts`)

```ts
export interface FusionInput {
  readonly signals: readonly SensorSignal[];
  readonly config: FusionConfig;
  readonly nowMs: number;
}

export interface FusionOutput {
  readonly escalate: boolean;
  readonly reasonCode: PolluxEscalationReasonCode;
  readonly netScore: number;
  readonly threshold: number;
  readonly contributingSignalIds: readonly string[];
}
```

Algorithm:

1. Apply exponential decay to every signal with
   `factor = exp(-ln(2) * ageMs / decayHalfLifeMs)`. Hard-precision signals skip
   decay.
2. Separate positive from negative signals.
3. **Hard-precision short-circuit**: if any `hardPrecision` positive signal has
   decayed weight > 0, escalate immediately with the signal's reason code.
4. **Low-precision floor**: drop positive signals whose `precisionPrior` is
   below `fusion.lowPrecisionFloor` (0.5) UNLESS the same category already has
   another signal above the floor.
5. **Composite-evidence check** (when `fusion.requireComposite=true`): at least
   2 _distinct categories_ must have surviving positive signals.
6. Net score = sum(weights × precisionPriors × decay) − sum(negative).
7. Threshold comes from `fusion.targetEscalationRate` via a rolling per-session
   auto-calibrator (see §9.6).

### D.6 Auto-calibrating threshold

`FusionLayer` maintains a rolling record of the last N (= 200) completed turns
per session: `(netScore, escalated)`. The threshold is the
`(1 - targetEscalationRate)` quantile of recent netScores, clamped to
`[minAbsoluteThreshold, maxAbsoluteThreshold]` (e.g. 1.0 to 10.0). This keeps
the escalation rate near the operator-set target even when the executor's
behavior drifts.

Persistence: in-memory only; resets per session. Phase G can persist if needed.

### D.7 Negative signals

Implemented as sensors that emit negative-weight signals:

| Signal id                    | Weight | Category     | Detection                                                                        |
| ---------------------------- | ------ | ------------ | -------------------------------------------------------------------------------- |
| `neg.exit_zero`              | −1     | tool         | Last tool exit was 0                                                             |
| `neg.concrete_subject`       | −1     | thought      | Last thought subject matches action regex (`editing\|writing\|running\|applied`) |
| `neg.confident_close`        | −2     | thought      | Final content part is long (>80 tokens) and contains no hedges                   |
| `neg.recent_advisor_success` | −1     | longitudinal | Advisor consultation in last K=3 turns was followed by a non-cancelled turn      |
| `neg.early_turn`             | −1     | longitudinal | Fewer than 2 tool calls made this turn (too early to conclude stuck)             |

### D.8 Files touched

- `packages/core/src/pollux/observer/observer.ts` (orchestrator)
- `packages/core/src/pollux/observer/fusion.ts` (new)
- `packages/core/src/pollux/observer/sensors/thought.ts` (new)
- `packages/core/src/pollux/observer/sensors/toolPattern.ts` (new)
- `packages/core/src/pollux/observer/sensors/negatives.ts` (new)
- `packages/core/src/core/client.ts:1067–1092` — pump events into observer
  inside the existing for-await loop, alongside `loopDetector.addAndCheck`.
  Two-line integration; wrapped in `try/catch` for fail-open.

### D.9 Tests

Each sensor gets its own test file with minimum 10 cases:

- Positive: each detection rule fires.
- Negative: adjacent non-detections do NOT fire.
- Bounded: window overflow drops oldest; no unbounded growth.
- Fail-open: throwing regex / malformed event → sensor returns empty.

Observer tests:

- Fusion composition: 2 distinct categories → escalate; 2 same-category → no
  escalate.
- Hard-precision bypass: risk gate fires alone → escalate.
- Decay: a 60s-old signal below threshold does not escalate.
- Invariant I3 (fail-open): throwing sensor does not abort the run.

### D.10 Acceptance criteria

- All sensor tests pass.
- Observer runs without measurable perf regression on a 50-event turn (< 5 ms
  added latency in CI benchmark).
- Invariants I1–I9 verified.

### D.11 Rollback

Flip `v2.observer.enabled = false`.

---

## 10) Phase E — Structured self-report (Tier 3)

### E.1 Tasks

1. **Prompt priming** (`core/prompts.ts`): when
   `v2.selfReport.promptPrimingEnabled=true`, the core system prompt receives an
   additional block:

   ```
   You may emit a structured status tag during reasoning, with this shape:
     <pollux:status stuck_on="<concrete obstacle>" next="<proposed next step>"/>
   - Use it when you notice yourself repeating, backtracking, or unsure how to proceed.
   - The tag is stripped before the user sees your output.
   - Concrete answers only; 'nothing' or 'n/a' in stuck_on is treated as not stuck.
   ```

2. **Parser** (`pollux/prompts.ts`): add
   `parsePolluxStatusTag(text) => { stuckOn?: string; next?: string }[]` and
   `stripPolluxStatusTags(text) => string`. Mirror the existing
   `pollux:confidence` tag patterns.
3. **Sensor** (`observer/sensors/selfReport.ts`):
   - `self.structured_status_stuck` — weight 3, precision 0.95,
     `hardPrecision: true`. Fires when any parsed tag has a non-trivial
     `stuck_on` string (≥2 tokens, not in `{ 'nothing', 'n/a', 'no', 'none' }`).
     The confidence gate (§2a.2 rule 1) promotes it to a
     `SameTurnIntent{ reasonCode: V2_SELF_REPORT_STUCK, pauseBoundary: 'post_event' }`.
     The executor is literally asking for help — waiting for the next user turn
     would be absurd.
   - `self.confidence_low` — weight 2, precision 0.85, **not** `hardPrecision`.
     Asymmetric: fires only when `<pollux:confidence:N>` has N ≤ 3. High-N
     values are ignored (see brainstorm §1 Tier 3 rationale). Contributes to
     composite score; can still promote to `V2_FUSION_COMPOSITE_EMPHATIC`
     (same-turn) if it stacks with another category.

### E.2 Files touched

- `packages/core/src/core/prompts.ts` (conditional block)
- `packages/core/src/pollux/prompts.ts` (new parser)
- `packages/core/src/pollux/observer/sensors/selfReport.ts` (new)
- System prompt snapshot tests in
  `packages/core/src/core/__snapshots__/prompts.test.ts.snap` — update snapshot
  (review carefully).

### E.3 Tests

- Parser tests in `prompts.test.ts` covering multiple tags, malformed tags,
  interleaving with `confidence` tags.
- Sensor tests: stuck_on = 'nothing' → no signal; stuck_on with real text →
  signal flagged `hardPrecision: true` (asserts §2a.3 timing row); confidence=9
  → no signal; confidence=2 → signal with `hardPrecision: false`.
- Observer integration test: a `<pollux:status stuck_on="...">` tag mid stream
  produces a `SameTurnIntent` on the very next event-boundary tick, not at turn
  end. Fail-open: throwing parser → no intent; executor continues.
- Leakage test: `stripPolluxStatusTags` removes all tags before content reaches
  the user — must cover both attribute orderings.

### E.4 Acceptance criteria

- No tag text ever reaches `ServerGeminiContentEvent` downstream consumers.
- System prompt snapshot diff is human-reviewed.
- Existing `pollux:confidence` behavior unchanged under v1.

### E.5 Rollback

Flip `v2.selfReport.enabled = false` (disables sensor and prompt priming).

---

## 11) Phase F — Full v2 detector composition

### F.1 Tasks

1. Add `PolluxDetectorStrategy.LIVE` (value `'live'`) alongside the existing
   three strategies. Under `v1`, requesting `'live'` falls back to hybrid with a
   deprecation log (mirrors existing hybrid-default behavior at
   `client.ts:114–124`).
2. Implement `createLiveDetector()` that:
   - Runs all eligibility gates (surface, config, budget — same shape as
     `isHeuristicPathEligible` et al.).
   - Consumes the observer's **pending `NextTurnIntent`** from the previous
     turn.
   - If no pending intent, falls back to `createHybridDetector()` for backward
     compatibility on first-turn scenarios (no observer history yet).
3. Wire `buildPolluxDetector` in `client.ts:114` to include the new strategy.
4. Implement the **split intent queue** on `GeminiClient`:
   - `private polluxPendingNextTurnIntent?: NextTurnIntent` — the previous
     turn's queued next-turn help; consumed exactly once at the top of
     `maybeRunPolluxAdvisorConsultation` and cleared.
   - `private polluxPendingSameTurnIntent?: SameTurnIntent` — produced during
     the current turn by `observer.ingest(...)`; consumed synchronously by the
     in-stream handler (see task 5) and cleared.
   - **Never** cross-wired: a same-turn intent is not silently demoted to the
     next-turn slot; downgrades go through the explicit guardrail path in
     task 6.
5. Implement the **in-stream same-turn handler** in `client.ts:1067–1092`:

   ```ts
   // After each event dispatch, before the next iteration:
   const intent = this.polluxObserver?.consumeSameTurnIntent();
   if (intent && !this.sameTurnFiredThisTurn) {
     this.sameTurnFiredThisTurn = true;
     try {
       await this.maybeRunPolluxAdvisorConsultation({
         trigger: intent,
         timing: 'same_turn',
       });
       // Advisor output, if any, is injected into the conversation via
       // the same mechanism as the existing post-turn advisor path.
       // Turn continues with advisor-conditioned context.
     } catch (err) {
       // I3 fail-open: swallow, continue the turn untouched.
       this.polluxDebugLog('same-turn advisor failed open', err);
     }
   }
   ```

   For `pauseBoundary: 'pre_tool'` intents specifically, the handler runs BEFORE
   the `ToolCallRequest` is dispatched to the scheduler (see Phase B.B.2 step
   3).

6. Implement the **guardrail chain** (§2a.4):
   - Single-shot flag `sameTurnFiredThisTurn` on `GeminiClient`, reset at
     `processTurn` entry.
   - When the observer would produce a same-turn intent but
     `sameTurnFiredThisTurn === true`, **or**
     `v2.timing.sameTurnEnabled === false`, **or**
     `checkAdvisorInvocationBudget` would reject, it produces a `NextTurnIntent`
     instead (downgrade path). Reason code is preserved; only `timing` and
     `pauseBoundary` change. A `POLLUX_ESCALATION_TIMING` lookup at the _payload
     emission_ site still reports `escalationTiming: 'next_turn'` per the
     downgraded intent — the map is indexed by intent.timing, not by reason code
     alone, so downgraded emphatic composites are faithfully reported.
   - Advisor consultation errors / DENY → fail-open, executor continues, no
     re-entry.

7. Implement the **fusion same-turn promotion** in `observer/fusion.ts`:
   - Existing composite-evidence check continues to run.
   - If
     `netScore ≥ max(threshold × sameTurnThresholdMultiplier, sameTurnAbsoluteFloor)`
     AND composite satisfied AND `sameTurnEnabled`, reason code is
     `V2_FUSION_COMPOSITE_EMPHATIC`, `timing: 'same_turn'`,
     `pauseBoundary: 'post_event'`.
   - Otherwise, if `netScore ≥ threshold`, reason code is `V2_FUSION_COMPOSITE`,
     `timing: 'next_turn'`.

8. Emit telemetry attribution: `PolluxAdvisorPhasePayload` carries
   `detectorVersion`, `escalationTiming`, and `contributingSignalIds` for every
   v2 emission (see §A.7 in Phase A).

### F.2 Files touched

- `packages/core/src/pollux/types.ts` (enum addition)
- `packages/core/src/pollux/detector.ts` (live detector factory + shared
  eligibility helper)
- `packages/core/src/core/client.ts:114, 985, 719–891` (build + consume intent)
- `packages/core/src/utils/events.ts:199–204` (payload delta)

### F.3 Tests

- `detector.test.ts` — parity tests for `createLiveDetector`: eligibility gates
  return same codes as v1 for disabled/surface/budget.
- `client.test.ts` — **next-turn lifecycle**: soft-composite signals → observer
  queues `NextTurnIntent` → next turn advisor consulted with correct reason
  code + `escalationTiming: 'next_turn'` → budget counter increments.
- `client.test.ts` — **same-turn lifecycle (risk gate)**: high-risk
  `ToolCallRequest` → observer produces
  `SameTurnIntent{ pauseBoundary: 'pre_tool' }` → advisor invoked BEFORE tool
  scheduler → advisor output injected → tool scheduler called afterwards →
  telemetry shows `escalationTiming: 'same_turn'`,
  `reasonCode: V2_RISK_GATE_BLOCK`.
- `client.test.ts` — **same-turn lifecycle (hard loop)**: confirmed loop
  mid-stream → advisor invoked in-turn → turn resumes with advisor guidance (no
  silent drop).
- `client.test.ts` — **same-turn lifecycle (self-report)**:
  `<pollux:status stuck_on="foo">` in a thought → advisor invoked on the next
  event boundary → `escalationTiming: 'same_turn'`.
- `client.test.ts` — **emphatic composite**: stacked soft signals with
  `netScore ≥ sameTurnThreshold` produce a `SameTurnIntent` with
  `reasonCode: V2_FUSION_COMPOSITE_EMPHATIC`.
- `client.test.ts` — **single-shot guardrail (I11)**: two same-turn qualifying
  signals in one turn → exactly one advisor invocation; the second signal
  appears as a `NextTurnIntent` in the next turn's payload.
- `client.test.ts` — **no recursion**: during the advisor-conditioned resume
  after a same-turn escalation, further signals do NOT trigger a second
  same-turn advisor call in the same turn.
- `client.test.ts` — **policy DENY fail-open (I5)**: same-turn advisor call
  denied by policy → executor resumes untouched; payload shows
  `advisorOutcome: 'denied'`, `escalationTiming: 'same_turn'`; tool (if pre-tool
  path) still executes.
- `client.test.ts` — **budget cap downgrade (I6)**: budget exhausted at
  same-turn trigger time → intent downgraded to `NextTurnIntent`; telemetry
  reflects `escalationTiming: 'next_turn'`.
- `client.test.ts` — **observer throws mid-stream (I3)**: no escalation queued
  or fired; no regression in executor path.
- `client.test.ts` — **kill switch**: `v2.timing.sameTurnEnabled=false` → all
  same-turn-eligible signals become `NextTurnIntent`; no mid-turn advisor
  invocations.

### F.4 Acceptance criteria

- All TG-1..10 tests pass under `detectorVersion='v2'`.
- Invariants I1–I9 verified.

### F.5 Rollback

Flip `detectorVersion='v1'`.

---

## 12) Phase G — Outcome telemetry (collect only)

### G.1 Tasks

1. Define `PolluxOutcomeEvent`:

   ```ts
   export interface PolluxOutcomeEvent {
     readonly turnId: string;
     readonly outcome:
       | 'accepted'
       | 'cancelled'
       | 'retyped'
       | 'edited'
       | 'unknown';
     readonly advisorConsulted: boolean;
     readonly contributingSignalIds: readonly string[];
     readonly userActionMs: number; // time between response and user action
   }
   ```

2. Capture from the UI layer (`packages/cli/src/ui/hooks/useGeminiStream.ts`,
   `useAgentStream.ts`):
   - ESC during stream → `cancelled`
   - New prompt with ≥0.85 cosine similarity to prior → `retyped` (add a
     lightweight in-memory token-set-similarity utility; no embeddings)
   - Edit-then-accept on a diff → `edited`
   - Default after turn completes without negative signals → `accepted`
3. Emit as `coreEvents` events; route through existing telemetry sinks
   (`LoggingContentGenerator`, `ChatRecordingService`, metrics export) — do NOT
   introduce a parallel sink (POLLUX_SPEC §9.3).
4. Add export format to
   `docs/core/pollux/P3-06_TELEMETRY_RECONCILIATION_REPORT.md`.

### G.2 Acceptance criteria

- Events generated but NOT consumed by any code path that affects runtime
  behavior.
- Token totals in metrics and conversation record reconcile (POLLUX_SPEC §9.4).

### G.3 Rollback

Revert PR. No behavior depends on these events yet.

---

## 13) Phase H — v2 calibration and benchmark

### H.1 V2 corpus (`observer/calibrationV2.ts`)

The v1 corpus (21 string-based entries in `calibration.ts`) is inadequate for
stream-based sensors because it has no temporal dimension. The v2 corpus is a
set of **scripted event traces**:

```ts
export interface CalibrationTraceEntry {
  readonly id: string;
  readonly category: 'true_positive' | 'true_negative' | 'boundary';
  readonly description: string;
  readonly userPrompt: string;
  readonly events: readonly ScriptedEvent[];
  readonly expected: {
    readonly escalate: boolean;
    readonly expectedSignalIds?: readonly string[];
  };
}
```

Scripted events are a narrow subset of `ServerGeminiStreamEvent` plus explicit
timing offsets. The trace is replayed through the observer deterministically.

Target corpus size: **≥60 traces**, with explicit coverage for each signal id
and each negative signal.

### H.2 Metrics

For every detector version × corpus run, compute:

- Precision = TP / (TP + FP)
- Recall = TP / (TP + FN)
- F1
- False-positive rate per category (thought / tool / self)
- Mean contributing-signal count on escalations

Report template: `docs/core/pollux/P4-07_DETECTOR_V2_CALIBRATION_REPORT.md`
(new, modeled on P3-05).

### H.3 Benchmark condition F

Add to `POLLUX_SPEC.md §10.1`:

| ID  | Executor | Advisor | Strategy  |
| --- | -------- | ------- | --------- |
| F   | Flash    | Pro     | Live (v2) |

Run under the same fairness pins as A-E (POLLUX_SPEC §10.2). Required metrics
are identical (§10.4).

### H.4 Acceptance criteria

- V2 F1 ≥ v1 F1 on a shared task set (chosen from the existing benchmark corpus,
  `packages/core/src/pollux/benchmark/tasks.ts`).
- V2 precision on the true-negative corpus ≥ 0.90. (This is the bill-saving
  metric.)

### H.5 Rollback

Calibration corpus is a test artifact; revert PR.

---

## 14) Phase I — Default flip

### I.1 Preconditions

Every single one must hold:

- Phases A-H merged.
- Invariants I1-I9 verified in CI on every PR.
- V2 F1 ≥ v1 F1 AND V2 precision ≥ 0.90 on the true-negative corpus.
- TG-1..10 green under `detectorVersion='v2'`.
- At least 2 weeks of `emitAdvisorDebug=true` runs by the working group with no
  fail-open storms.

### I.2 Tasks

1. Change `DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.detectorVersion` to `'v2'`.
2. Update `POLLUX_SPEC.md` §7.5 (newly added section) to make v2 the primary
   contract; move v1 into an appendix with deprecation notice.
3. Update `P3-05_ESCALATION_CALIBRATION_TUNING_GUIDE.md` to link the v2 report
   as the active tuning guide.
4. Add a `debugLogger` startup line when `detectorVersion` was explicitly set to
   `v1` (migration aid).
5. Announce deprecation timeline for v1: remove in +2 minor releases.

### I.3 Rollback

Revert the default flip PR. Because users can still set `detectorVersion='v1'`
explicitly, this is a simple flag change, not a code removal.

---

## 15) Testing strategy

### 15.1 Test pyramid

| Layer                  | Location                                                               | Coverage target                                                       |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Pure sensor units      | `observer/sensors/**.test.ts`                                          | 100% of detection rules (positive + negative + fail-open)             |
| Fusion logic           | `observer/fusion.test.ts`                                              | Composite gate, decay, auto-calibration, negative signals             |
| Observer orchestration | `observer/observer.test.ts`                                            | Invariant I1, I3, I4                                                  |
| Detector integration   | `detector.test.ts` (extended)                                          | `createLiveDetector` parity, eligibility gates                        |
| Client wiring          | `client.test.ts` (extended)                                            | Intent queue, fail-open under sensor exception, policy gate unchanged |
| Cross-surface          | `acpClient.test.ts`, `a2a-server/**/task.test.ts`, agent session tests | Invariant I7                                                          |
| Calibration            | `observer/calibrationV2.test.ts` (new)                                 | ≥60 traces, deterministic results                                     |
| Schema                 | `packages/cli/src/config/settingsSchema.test.ts`                       | Schema-config invariant (POLLUX_SPEC §8.4)                            |
| Telemetry              | `uiTelemetry.test.ts` (extended), `telemetryReconciliation.test.ts`    | Token reconciliation with v2 signals                                  |

### 15.2 TG additions for v2 PRs

Add rows to the PR template in
`docs/core/pollux/P0-07_IMPLEMENTATION_PR_TEMPLATE_TG_MAPPING.md`:

| Gate  | Author requirement                                                      | Reviewer check                                                                                                          |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| TG-11 | V2 observer fail-open evidence attached                                 | Assert sensor exception does not abort stream                                                                           |
| TG-12 | V2 risk-gate precision evidence attached                                | Review seeded dangerous/benign command set                                                                              |
| TG-13 | V2 calibration report attached                                          | Precision ≥ 0.90 on true-negative corpus                                                                                |
| TG-14 | V2 timing-contract evidence attached (same-turn tests named in §11.F.3) | Assert §2a.3 trigger matrix is honored by tests; advisor invoked BEFORE `rm -rf` executes; single-shot guardrail proven |
| TG-15 | V2 fail-open evidence for same-turn path attached                       | Policy DENY / budget cap / observer throw during same-turn path all resume executor untouched                           |

Update TG-1..10 rows where v2 changes the expected evidence shape.

### 15.3 Timing-matrix test (MANDATORY)

`packages/core/src/pollux/types.test.ts` MUST contain a test asserting that
`POLLUX_ESCALATION_TIMING` exactly matches §2a.3 on every enum value. If a PR
changes timing, the matrix table in §2a.3 must be updated in the same PR — this
is how invariant I10 is enforced in CI.

---

## 16) Telemetry and observability

### 16.1 New reason codes

Added in `PolluxEscalationReasonCode` (phase A). Timing column is canonical per
§2a.3 and enforced by invariant I10.

| Code                           | Timing        | Meaning                                                                           |
| ------------------------------ | ------------- | --------------------------------------------------------------------------------- |
| `V2_LIVE_OBSERVER_MATCH`       | next_turn     | Fusion layer produced a score above the auto-calibrated threshold                 |
| `V2_FUSION_COMPOSITE`          | next_turn     | Composite-evidence rule satisfied (≥2 categories), netScore below same-turn floor |
| `V2_FUSION_COMPOSITE_EMPHATIC` | **same_turn** | Composite satisfied AND netScore ≥ same-turn threshold (§2a.2 rule 2)             |
| `V2_FUSION_BUDGET_TARGET`      | next_turn     | Auto-calibrator lowered threshold to hit target escalation rate                   |
| `V2_RISK_GATE_BLOCK`           | **same_turn** | Hard-precision risk signal; pre-tool pause                                        |
| `V2_HARD_LOOP`                 | **same_turn** | LoopDetectionService bridge fired; post-event pause                               |
| `V2_SELF_REPORT_STUCK`         | **same_turn** | Non-trivial `<pollux:status stuck_on>`; post-event pause                          |

### 16.2 Event payload additions

- `PolluxAdvisorPhasePayload.detectorVersion: 'v1' | 'v2'`
- `PolluxAdvisorPhasePayload.escalationTiming?: 'same_turn' | 'next_turn'` —
  REQUIRED for every v2 escalation emission. Derived from the consumed intent's
  `timing` field (not from the reason code alone, so downgrades are reported
  faithfully).
- `PolluxAdvisorPhasePayload.pauseBoundary?: 'pre_tool' | 'post_event'` —
  present only when `escalationTiming='same_turn'`.
- `PolluxAdvisorPhasePayload.contributingSignalIds?: readonly string[]`
- `PolluxAdvisorPhasePayload.sameTurnDowngraded?: boolean` — true iff a signal
  that would have been `same_turn` per §2a.2 was downgraded to `next_turn` due
  to single-shot / budget / kill-switch guardrails.

### 16.3 Debug logging

When `emitAdvisorDebug=true` AND v2 is active, every escalation decision logs
with explicit timing:

```
Pollux v2 escalate: timing=same_turn reason=V2_RISK_GATE_BLOCK pauseBoundary=pre_tool signals=[risk.pre_tool_high] tool=run_shell_command
Pollux v2 escalate: timing=next_turn reason=V2_FUSION_COMPOSITE netScore=2.4 threshold=2.1 signals=[tool.failure_cascade,thought.subject_loop]
Pollux v2 downgrade: intended=same_turn (V2_FUSION_COMPOSITE_EMPHATIC) effective=next_turn cause=single_shot_guardrail
```

Mirrored for `skipped` outcomes with the dominant _negative_ signal named.

### 16.4 Metrics

Existing sinks carry everything. No new sinks (POLLUX_SPEC §9.3 prohibition).

---

## 17) Rollout and rollback

| Stage            | Audience                | Flag state                                               |
| ---------------- | ----------------------- | -------------------------------------------------------- |
| Internal dogfood | Working group only      | `detectorVersion='v2'` in repo `~/.gemini/settings.json` |
| Opt-in preview   | External users via docs | Default still `v1`; docs recommend trying `v2`           |
| Default flip     | All users               | Phase I                                                  |
| V1 removal       | +2 minor releases       | Delete v1 detectors                                      |

Each stage has one required artifact: a run report attached to the phase PR (or
a follow-up report PR for the default flip), with TG evidence and at least 100
completed turns of `emitAdvisorDebug=true` logs summarized.

Rollback at every stage is **flag-level** — no code revert required until v1
removal.

---

## 18) Risk register and open questions

| #   | Risk / question                                                                                | Mitigation                                                                                                                                                                          | Resolve by |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R1  | Observer hot-path perf regression                                                              | Perf benchmark in CI; target <5ms per 50-event turn                                                                                                                                 | Phase D    |
| R2  | Cross-surface parity drift under v2                                                            | Reuse `P2-07_CROSS_SURFACE_INTEGRATION_MATRIX.md` test surface                                                                                                                      | Phase F    |
| R3  | Sensor exception cascades (memory leak via bounded buffers?)                                   | Bounded windows + fail-open + dedicated test                                                                                                                                        | Phase D    |
| R4  | Prompt priming destabilizes the executor (new tag confuses small models)                       | A/B test at phase E with `promptPrimingEnabled=false`                                                                                                                               | Phase E    |
| R5  | Auto-calibrator oscillation (threshold too reactive)                                           | Use quantile over rolling window of 200 turns, not EMA                                                                                                                              | Phase D    |
| R6  | Intent queue re-entrancy (what if turn N+1 never happens?)                                     | Queue is per-session and cleared on session end; explicit test                                                                                                                      | Phase F    |
| R7  | Same-turn pause/resume leaks state or double-charges tokens                                    | `sameTurnFiredThisTurn` single-shot flag (I11); fail-open on every step; token-reconciliation test re-run with same-turn path exercised (POLLUX_SPEC §9.4)                          | Phase F    |
| R8  | Executor-contract drift: does injecting advisor output mid-turn confuse the executor?          | Inject via existing post-turn advisor mechanism (same content shape); A/B test at Phase F with `sameTurnEnabled=false` as control                                                   | Phase F    |
| R9  | Advisor latency blows up perceived responsiveness on same-turn path                            | Surface an `awaiting-advisor` UI hint (reuses existing advisor-running indicator); record `advisorSameTurnLatencyMs` in telemetry; hard cap via existing advisor timeout            | Phase F    |
| R10 | Pre-tool pause race: tool starts before advisor returns                                        | Observer evaluation is synchronous on the `ToolCallRequest` event dispatch; advisor invocation awaited before tool scheduler receives the call (dedicated ordering test in §11.F.3) | Phase B/F  |
| Q1  | Do we persist observer state across CLI restarts?                                              | Default no; phase G can revisit                                                                                                                                                     |            |
| Q2  | Should `tool.search_without_decide` also consume IDE-context signals (e.g. open file changes)? | Defer to v2.1                                                                                                                                                                       |            |
| Q3  | Policy engine DENY on advisor — should v2 try a fallback critic?                               | Explicitly no; preserves I5                                                                                                                                                         |            |
| Q4  | Should user-facing "ask advisor now" button map to `V2_USER_REQUEST`?                          | Reserved, out of scope for v2.0; mentioned in §2a.2 rule 3                                                                                                                          |            |

---

## 19) References

- `packages/core/src/pollux/detector.ts` — v1 detector (baseline)
- `packages/core/src/pollux/types.ts:47–59` — existing reason codes and config
  shape
- `packages/core/src/pollux/safeguards.ts:40–71` — budget check
- `packages/core/src/pollux/prompts.ts` — existing tag parsers
- `packages/core/src/core/client.ts:985` — advisor consultation seam
- `packages/core/src/core/client.ts:1067–1092` — streaming event loop (observer
  pump site)
- `packages/core/src/core/turn.ts:307–319` — Thought event emission
- `packages/core/src/services/loopDetectionService.ts:186–312` — loop detector
- `packages/core/src/utils/thoughtUtils.ts` — `parseThought` + `ThoughtSummary`
- `packages/core/src/utils/events.ts:194–204, 229–267, 481–487` —
  `coreEvents.emitPolluxAdvisorPhase`
- `packages/core/src/telemetry/llmRole.ts:20` — `LlmRole.UTILITY_ADVISOR`
- `packages/cli/src/config/settingsSchema.ts:2221` — Pollux schema root
- `packages/cli/src/ui/hooks/useGeminiStream.ts:1444` — Thought consumer (UI
  side, telemetry input)

---

## Appendix A — Code sketches (non-final)

### A.1 Observer skeleton

```ts
// packages/core/src/pollux/observer/observer.ts
// Intent types are defined in observer/types.ts (see §6.A.1 task 6).

export class LiveExecutorObserver {
  private readonly sensors: readonly Sensor[];
  private readonly windows: {
    thought: ThoughtSummary[];
    tool: ToolEventRecord[];
  };
  private signals: SensorSignal[] = [];
  private pendingSameTurn: SameTurnIntent | undefined;
  private pendingNextTurn: NextTurnIntent | undefined;
  private sameTurnFiredThisTurn = false;

  constructor(config: PolluxV2Config, sensors: readonly Sensor[]) {
    /* ... */
  }

  beginTurn(): void {
    this.sameTurnFiredThisTurn = false;
    this.pendingSameTurn = undefined;
    this.signals = [];
  }

  ingest(event: ServerGeminiStreamEvent, nowMs: number): void {
    if (!this.config.observer.enabled) return;
    try {
      this.updateWindows(event);
      const newSignals: SensorSignal[] = [];
      for (const s of this.sensors) {
        newSignals.push(
          ...s.observe({ event, turnElapsedMs: nowMs, ...this.windows }),
        );
      }
      this.signals.push(...newSignals);
      // Immediate confidence-gate evaluation for hard-precision signals so
      // they surface on the very event they appear on (risk gate, hard
      // loop, self-report). See §2a.2 rule 1.
      this.evaluateConfidenceGate(newSignals, event, nowMs);
    } catch {
      // I3: fail-open
    }
  }

  private evaluateConfidenceGate(
    newSignals: readonly SensorSignal[],
    event: ServerGeminiStreamEvent,
    nowMs: number,
  ): void {
    if (!this.config.timing.sameTurnEnabled) return;
    if (this.sameTurnFiredThisTurn) return;
    if (this.pendingSameTurn) return;
    for (const s of newSignals) {
      if (!s.hardPrecision || s.precisionPrior < 0.85) continue;
      this.pendingSameTurn = {
        timing: 'same_turn',
        reasonCode: reasonCodeForSignal(s.id),
        pauseBoundary:
          event.type === ServerGeminiEventType.ToolCallRequest
            ? 'pre_tool'
            : 'post_event',
        pendingTool:
          event.type === ServerGeminiEventType.ToolCallRequest
            ? event.value
            : undefined,
        netScore: s.weight * s.precisionPrior,
        contributingSignalIds: [s.id],
        queuedAtMs: nowMs,
      };
      return;
    }
  }

  peekSameTurnIntent(): SameTurnIntent | undefined {
    return this.pendingSameTurn;
  }

  consumeSameTurnIntent(): SameTurnIntent | undefined {
    const i = this.pendingSameTurn;
    this.pendingSameTurn = undefined;
    if (i) this.sameTurnFiredThisTurn = true;
    return i;
  }

  finalizeTurn(nowMs: number): NextTurnIntent | undefined {
    const out = fuse({
      signals: this.signals,
      config: this.config.fusion,
      nowMs,
      sameTurnEnabled:
        this.config.timing.sameTurnEnabled && !this.sameTurnFiredThisTurn,
    });
    this.signals = [];
    if (!out.escalate) return this.pendingNextTurn;
    if (out.timing === 'same_turn' && !this.sameTurnFiredThisTurn) {
      // Fusion promoted to same-turn but finalization is post-stream;
      // downgrade to next-turn so the user's next turn sees it.
      this.pendingNextTurn = {
        timing: 'next_turn',
        reasonCode: out.reasonCode,
        netScore: out.netScore,
        contributingSignalIds: out.contributingSignalIds,
        queuedAtMs: nowMs,
      };
    } else if (out.timing === 'next_turn') {
      this.pendingNextTurn = { timing: 'next_turn', ...out.payload };
    }
    return this.pendingNextTurn;
  }

  consumePendingNextTurnIntent(): NextTurnIntent | undefined {
    const i = this.pendingNextTurn;
    this.pendingNextTurn = undefined;
    return i;
  }
}
```

### A.2 Client integration (minimal diff)

Turn entry (Phase D + F):

```ts
// processTurn entry, before the for-await loop
this.polluxObserver?.beginTurn();
this.sameTurnFiredThisTurn = false;
```

Per-event pump with same-turn interception (Phase B/C/E/F):

```ts
// packages/core/src/core/client.ts inside the for-await at ~1067
const nowMs = Date.now();
this.polluxObserver?.ingest(event, nowMs); // phase D

// Same-turn pause point #1: pre-tool risk gate (phase B).
if (event.type === ServerGeminiEventType.ToolCallRequest) {
  const intent = this.polluxObserver?.peekSameTurnIntent();
  if (intent?.pauseBoundary === 'pre_tool' && !this.sameTurnFiredThisTurn) {
    await this.#runSameTurnAdvisor(
      this.polluxObserver!.consumeSameTurnIntent()!,
    );
    // Executor's next iteration will re-see the tool request with advisor
    // context now in scope.
  }
}

const loopResult = this.loopDetector.addAndCheck(event); // unchanged
// ...existing loop handling...

// Same-turn pause point #2: post-event for hard-loop / self-report /
// emphatic-composite (phase C/E/F).
const postEventIntent = this.polluxObserver?.peekSameTurnIntent();
if (
  postEventIntent?.pauseBoundary === 'post_event' &&
  !this.sameTurnFiredThisTurn
) {
  await this.#runSameTurnAdvisor(this.polluxObserver!.consumeSameTurnIntent()!);
}
```

Same-turn advisor helper (Phase F):

```ts
async #runSameTurnAdvisor(intent: SameTurnIntent): Promise<void> {
  if (!this.checkAdvisorInvocationBudget()) {
    // Downgrade: queue for next turn, skip now.
    this.polluxObserver?.queueNextTurnFromDowngrade(intent, 'budget');
    return;
  }
  this.sameTurnFiredThisTurn = true;
  try {
    await this.maybeRunPolluxAdvisorConsultation({
      trigger: intent,
      timing: 'same_turn',
    });
  } catch (err) {
    // I3 fail-open
    this.polluxDebugLog('same-turn advisor failed open', err);
  }
}
```

Turn finalization (Phase D + F):

```ts
// at turn end, around line 1110
this.polluxPendingNextTurnIntent = this.polluxObserver?.finalizeTurn(
  Date.now(),
);
```

Next-turn consumption at the top of `maybeRunPolluxAdvisorConsultation`:

```ts
if (experimental.detectorVersion === 'v2' && !triggerFromSameTurn) {
  const intent = this.polluxObserver?.consumePendingNextTurnIntent();
  if (intent) {
    // bypass detector.shouldEscalate; run advisor with
    // intent.reasonCode and escalationTiming='next_turn'
  }
}
```

### A.3 System prompt block (phase E)

Appended conditionally by `PromptProvider.getCoreSystemPrompt`:

```
# Pollux status channel (experimental)

You may emit, inside any thought or response, a structured tag:

    <pollux:status stuck_on="<concrete obstacle, 1 short phrase>" next="<proposed next step>"/>

- Use when you notice yourself repeating, backtracking, or uncertain how to proceed.
- Tags are stripped before the user sees your output.
- Use 'nothing' in stuck_on when unambiguously on track — treated as no signal.

Example:
    <pollux:status stuck_on="ci fails with EACCES on node_modules" next="retry install with --unsafe-perm"/>
```

### A.4 Fusion algorithm pseudo-code

Hard-precision signals are surfaced synchronously by `evaluateConfidenceGate`
(see §A.1) at `ingest()` time, so by the time fusion runs (on `finalizeTurn` OR
the same-turn composite-check tick) the same-turn intent may already be pending.
Fusion still produces the _next-turn_ intent for composite evidence, plus the
emphatic promotion.

```
decay(signal) = signal.weight * exp(-ln2 * age / halfLife) unless hardPrecision
positives = signals with weight > 0 after decay
negatives = signals with weight < 0 after decay

// Note: hardPrecision signals already fired same-turn via
// evaluateConfidenceGate(); they are still included here for netScore
// accounting but do not double-escalate.

positives' = drop p where precisionPrior < floor
             and no sibling in same category has precisionPrior >= floor

if requireComposite and distinctCategories(positives') < 2:
  return SKIP

net = sum(positives' * precisionPriors) - sum(|negatives|)
threshold = quantile(recentNetScores, 1 - targetEscalationRate)
            clamped to [minAbs, maxAbs]

if net < threshold:
  return SKIP

sameTurnThreshold = max(threshold * sameTurnThresholdMultiplier,
                        sameTurnAbsoluteFloor)

if sameTurnEnabled and net >= sameTurnThreshold:
  // §2a.2 rule 2: emphatic composite, same-turn.
  return ESCALATE(timing=same_turn,
                  reason=V2_FUSION_COMPOSITE_EMPHATIC,
                  pauseBoundary=post_event,
                  net, threshold)

return ESCALATE(timing=next_turn,
                reason=V2_FUSION_COMPOSITE,
                net, threshold)
```
