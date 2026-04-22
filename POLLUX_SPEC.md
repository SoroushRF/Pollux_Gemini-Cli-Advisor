# Pollux Master Specification (Reconciled)

Version: 2.1 Date: 2026-04-18 Status: Implementation-ready only after start
gates in IMPLEMENTATION_PLAN.md are complete Scope: Pollux advisor integration
for gemini-cli fork with benchmarkable behavior and governance controls

---

## Section implementation status

Legend: contracted = design/contract locked in this spec and linked P0
artifacts; planned = described but not yet contract-locked; implemented =
runtime behavior shipped and test-gated in-tree. Status is tracked here to
satisfy IMPLEMENTATION_PLAN.md G5 "Unimplemented sections marked as such".

| Section                                   | Status                                            |
| ----------------------------------------- | ------------------------------------------------- |
| 1 Purpose                                 | contracted                                        |
| 2 Goals and non-goals                     | contracted                                        |
| 3 Runtime reality and coverage matrix     | contracted                                        |
| 4 Pollux component model                  | contracted                                        |
| 5 Interceptor contract                    | contracted                                        |
| 6 Advisor invocation and policy contract  | contracted                                        |
| 7 Escalation detector contract            | contracted (7.5 timing contract added 2026-04-20) |
| 8 Settings and configuration contract     | contracted                                        |
| 9 Telemetry and token accounting contract | contracted                                        |
| 10 Benchmark protocol                     | contracted                                        |
| 11 Command and output surface contract    | implemented                                       |
| 12 CI, test, and release contract         | contracted                                        |
| 13 Security and safety contract           | contracted                                        |
| 14 Documentation and governance contract  | contracted                                        |
| 15 Acceptance criteria                    | contracted                                        |
| Appendix A Driver/interceptor matrix      | contracted                                        |
| Appendix B Benchmark fairness checklist   | contracted                                        |
| Appendix C Terminology                    | contracted                                        |

Section 11 is implemented in-tree (P5-01/P5-02 evidence in
IMPLEMENTATION_PLAN.md). All other sections remain contracted until their
phase-gated runtime and CI evidence is complete.

---

## 1) Purpose

Pollux adds an adaptive advisor path so a fast executor model can escalate
selected decisions to a stronger advisor model. The objective is to improve
hard-task success without paying full premium-model cost for every turn.

This spec defines execution contracts, not just architecture intent.

---

## 2) Goals and non-goals

### Goals

1. Improve hard-task completion quality over flash-only baseline.
2. Keep token and latency overhead controlled and measurable.
3. Preserve deterministic runtime behavior across supported surfaces.
4. Keep observability, policy, and configuration inside existing platform
   mechanisms.

### Non-goals for Phase 1

1. Full A2A runtime interception.
2. New standalone telemetry sink for token accounting.
3. New protocol event taxonomy for advisor-specific stream events.

---

## 3) Runtime reality and coverage matrix

Pollux is specified against actual runtime entry points.

| Surface                       | Entry path                                          | Phase 1 status       | Pollux expectation                                   |
| ----------------------------- | --------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| Interactive legacy            | useGeminiStream -> GeminiClient.sendMessageStream   | In scope             | Full behavior                                        |
| Non-interactive legacy        | runNonInteractive -> GeminiClient.sendMessageStream | In scope             | Full behavior                                        |
| Interactive agent-session     | useAgentStream -> LegacyAgentSession                | In scope             | Behavioral parity                                    |
| Non-interactive agent-session | runNonInteractiveAgentSession -> LegacyAgentSession | In scope             | Behavioral parity                                    |
| ACP                           | GeminiAgent.prompt                                  | In scope             | Pollux-compatible advisor policy/permission behavior |
| A2A CoderAgentExecutor        | a2a-server executor path                            | Out of scope Phase 1 | Explicit documented bypass and tests                 |

Important: processTurn-level integration is necessary but not sufficient for
cross-surface coverage.

---

## 4) Pollux component model

All Pollux modules live under packages/core/src/pollux/.

Required modules:

1. types.ts
2. models.ts
3. prompts.ts
4. advisor.ts
5. detector.ts
6. interceptor.ts
7. benchmark/runner.ts
8. benchmark/tasks.ts
9. benchmark/report.ts

No dedicated pollux/logger.ts token sink is defined in this spec.

---

## 5) Interceptor contract

### 5.1 Core behavior

On eligible turns:

1. Evaluate shouldEscalate(context).
2. If false: continue unchanged.
3. If true: consult advisor with bounded context.
4. Inject advisor guidance through approved injection path.
5. Resume executor path.

### 5.2 Safety behavior

1. Fail-open on advisor timeout/parse errors/policy denial.
2. Bound advisor calls per turn and per session.
3. Never mutate event ordering guarantees.
4. Never regress Pollux-off behavior.

### 5.3 Surface expectations

1. Legacy and agent-session paths must satisfy same observable contract.
2. ACP path must not introduce unexpected human permission prompts for
   advisor-only flow.

---

## 6) Advisor invocation and policy contract

### 6.1 Primary invocation shape

Preferred shape: advisor_consultation synthetic tool routed through scheduler
policy path.

### 6.2 Policy defaults

advisor_consultation must have a packaged default ALLOW rule, gated by Pollux
feature flag.

Policy decisions remain allow/deny/ask_user. Pollux does not introduce a new
policy decision type.

### 6.3 ACP behavior

ACP integration must prevent redundant requestPermission prompts for
advisor-only synthetic consultation.

### 6.4 Runtime policy constraints

1. No unbounded per-turn policy mutation.
2. No extension-based ALLOW dependency for advisor path.
3. Policy bypass is prohibited unless explicitly documented and tested.

### 6.5 Example packaged rule (illustrative)

```toml
[[rules]]
match_tool = "advisor_consultation"
decision = "allow"
when_feature_flag = "pollux.enabled"
scope = "built_in_default"
```

---

## 7) Escalation detector contract

### 7.1 Detector architecture

The detector is observer-backed: a `LiveExecutorObserver` watches
`ServerGeminiStreamEvent`s emitted by the Turn loop, a fusion layer combines
signals from pluggable sensors (thought, tool-pattern, self-report, loop bridge,
risk gate), and the confidence gate (§7.5) decides whether to escalate.
Eligibility gates (surface, config, budget) remain unchanged from §§3–6.

Historical note: an earlier draft of §7 enumerated three monolithic detector
"strategies" (heuristic / structured / hybrid). These have been replaced by
sensor-based composition per `docs/core/pollux/DETECTOR_IMPLEMENTATION_PLAN.md`.
Legacy strategy enum values and the legacy `detector.ts` surface have been
deleted (Phase I).

### 7.2 Required detector properties

1. Deterministic reason codes.
2. Threshold-driven behavior from config.
3. Explicit false-positive and false-negative test coverage.

### 7.3 Structured confidence / status tag behavior

1. Tag extraction and stripping must not leak to user-visible output.
2. Missing/malformed tags must fail-open.
3. Applies to both `<pollux:confidence:N>` and `<pollux:status>` tags.

### 7.4 Baseline purity constraint

The detector must not add extra LLM calls during baseline conditions that claim
no advisor behavior. Sensors are pure/synchronous; the confidence gate is
deterministic.

### 7.5 Escalation timing contract

Status: contracted (implementation governed by
`docs/core/pollux/DETECTOR_IMPLEMENTATION_PLAN.md` §2a).

The detector uses a **hybrid timing policy**. An escalation request carries a
required `escalationTiming` field whose value is either `same_turn` or
`next_turn`:

1. **`same_turn`** — the advisor is invoked during the current executor turn, at
   an event boundary, before the turn completes. Triggered only when the
   detector is confident the executor is struggling (the "confidence gate" — see
   Decision Note §2a in the plan). Three classes qualify: (a) any hard-precision
   sensor signal (`precisionPrior >= 0.85` and `hardPrecision=true`) — currently
   risk-gate, hard-loop, and structured `<pollux:status stuck_on>`; (b) fusion
   composite with `netScore >= sameTurnThreshold` and ≥2 distinct signal
   categories; (c) reserved for explicit user-driven escalation requests
   (future).
2. **`next_turn`** — the advisor is invoked at the start of the next user turn.
   All other (soft/composite, sub-confidence) signals default here.

The following MUST hold:

- **T1 Explicit timing**: every escalation reason code (including every value
  added to `PolluxEscalationReasonCode`) has a canonical `same_turn | next_turn`
  assignment tested by snapshot (invariant I10 in the plan).
- **T2 Single-shot per turn**: at most one same-turn advisor invocation per
  executor turn. Additional qualifying signals downgrade to `next_turn`.
- **T3 Policy parity**: same-turn invocations route through the identical
  `ADVISOR_CONSULTATION_TOOL_NAME` policy gate as next-turn invocations (§6). A
  DENY result is fail-open — the executor resumes its turn untouched. No new
  policy bypass is introduced.
- **T4 Budget parity**: a same-turn invocation consumes exactly one slot of the
  advisor-invocation budget (§6). Budget exhaustion at trigger time downgrades
  the request to `next_turn`; it never silently skips.
- **T5 Fail-open**: any exception in the observer, confidence gate, pause
  handler, or advisor call resumes the executor turn as if the escalation was
  not requested. No exception aborts the stream (baseline purity §7.4 plus
  invariant I3).
- **T6 No mid-part interruption**: pause points are event boundaries only
  (`ToolCallRequest` dispatch for pre-tool, end-of-event dispatch otherwise).
  The detector does not split a streaming content part mid-delivery.
- **T7 No recursion**: advisor-conditioned continuation inside a turn runs with
  the single-shot flag already set; it cannot trigger another same-turn
  escalation within the same turn.
- **T8 Deterministic downgrades**: a downgrade caused by T2/T4/kill-switch is
  reported via `sameTurnDowngraded: true` and the effective
  `escalationTiming: 'next_turn'` in the `PolluxAdvisorPhasePayload`.

Kill switch: `experimental.pollux.detector.timing.sameTurnEnabled=false` forces
every request to `next_turn`. Policy T1–T8 still apply.

---

## 8) Settings and configuration contract

### 8.1 Phase 1 settings path

Phase 1 uses experimental.pollux.\* through CLI schema and loader.

### 8.2 Example settings block

When `experimental.pollux.enabled` is `true`,
`experimental.pollux.executorModel` is the source of truth for the executor
model — it supersedes `settings.model.name`. See §8.3 for the full precedence
rule.

```json
{
  "experimental": {
    "pollux": {
      "enabled": true,
      "executorModel": "gemini-2.5-flash",
      "advisorModel": "gemini-3.1-pro-preview",
      "maxAdvisorCallsPerTurn": 2,
      "maxAdvisorCallsPerSession": 20,
      "emitAdvisorDebug": false,
      "advisorRequestTimeoutMs": 120000,
      "detector": {
        "riskGate": {
          "enabled": false,
          "mode": "blocklist",
          "denyPatterns": []
        },
        "observer": {
          "enabled": false,
          "maxThoughtWindowChars": 16384,
          "maxToolEventWindow": 64,
          "decayHalfLifeMs": 15000
        },
        "selfReport": { "enabled": false, "promptPrimingEnabled": false },
        "fusion": {
          "targetEscalationRate": 0.05,
          "requireComposite": true,
          "lowPrecisionFloor": 0.5,
          "sameTurnThresholdMultiplier": 1.5,
          "sameTurnAbsoluteFloor": 3.5
        },
        "timing": {
          "sameTurnEnabled": true,
          "maxSameTurnEscalationsPerTurn": 1
        }
      }
    }
  }
}
```

The `experimental.pollux.detector` subtree matches the CLI settings schema and
core merge defaults (`mergePolluxExperimentalConfig`). Authoritative per-key
descriptions and defaults for every leaf live in
`docs/reference/configuration.md` (autogenerated from
`packages/cli/src/config/settingsSchema.ts`).

### 8.3 Precedence and migration

The CLI resolves the executor model from the following sources, highest priority
first:

1. `argv.model` (i.e. `--model <name>` on the command line).
2. `GEMINI_MODEL` environment variable.
3. `experimental.pollux.executorModel`, but only when
   `experimental.pollux.enabled === true`. When Pollux is enabled the executor
   model is sourced from this field (or its schema default) rather than from
   `settings.model.name`, because Pollux's contract is "fast executor, smart
   advisor" and the executor model must be Pollux-controlled. When the override
   fires and `settings.model.name` was set to a different value, the CLI emits a
   single `debugLogger` startup line so users can discover why their pinned
   model was bypassed.
4. `settings.model.name`.
5. Built-in default (`PREVIEW_GEMINI_MODEL_AUTO`).

When `experimental.pollux.enabled` is `false`,
`experimental.pollux.executorModel` has no effect on routing and rule 4 wins
over rule 3. The advisor model is always sourced from
`experimental.pollux.advisorModel`; it is never affected by
`settings.model.name` or `argv.model`.

Migration to top-level `pollux.\*` is a post-stability milestone.

### 8.4 Required quality gates

1. schema generation check in CI.
2. ConfigParameters mapping invariant tests.

---

## 9) Telemetry and token accounting contract

### 9.1 Required extension

Add LlmRole.UTILITY_ADVISOR to existing role taxonomy.

### 9.2 Required sinks

1. LoggingContentGenerator events.
2. ChatRecordingService token persistence.
3. Existing metrics export path.

### 9.3 Prohibited patterns

1. Parallel token sink that becomes source-of-truth.
2. Advisor-only logging path that bypasses standard role-tagged accounting.

### 9.4 Reconciliation requirement

Token totals in metrics and conversation record must reconcile in automated
integration tests.

---

## 10) Benchmark protocol

### 10.1 Conditions

| ID  | Executor | Advisor | Strategy                                |
| --- | -------- | ------- | --------------------------------------- |
| A   | Flash    | None    | None                                    |
| E   | Pro      | None    | None                                    |
| F   | Flash    | Pro     | Redesigned detector — observer + fusion |

### 10.2 Fairness pins (mandatory)

All benchmark runs used for A-E comparison must enforce:

1. Router pinned to explicit model override for the condition.
2. Loop detector LLM checks disabled for baseline fairness mode.
3. Availability state reset between runs.
4. Dynamic model configuration features fixed and deterministic.
5. Fresh isolated session IDs per iteration.

### 10.3 Run validity

A run is invalid if fairness pins are not active and recorded.

### 10.4 Metrics

1. Accuracy (binary pass/fail by oracle).
2. Executor/advisor tokens and totals.
3. End-to-end latency.
4. Escalation precision and recall.
5. Confidence intervals for reported rates.

---

## 11) Command and output surface contract

### 11.1 /pollux command registration

The `/pollux` command is required on all in-scope command surfaces and is
implemented as a single parity contract:

1. Builtin command loader path.
2. ACP command registry path.

A2A command registration is Phase 2 scope and must be explicitly documented as
deferred.

Implemented registration contract:

1. Legacy interactive, agent-session interactive, and non-interactive surfaces
   resolve `/pollux` through `BuiltinCommandLoader` to
   `packages/cli/src/ui/commands/polluxCommand.ts`.
2. ACP resolves `/pollux` through `acp/commandHandler.ts` to
   `packages/cli/src/acp/commands/pollux.ts`.
3. Legacy + ACP share the same parser/formatter helpers from `polluxCommand.ts`
   to keep output and argument semantics byte-identical.

### 11.2 /pollux output and UX contract

`/pollux` remains read-only status output. It MUST NOT mutate runtime state.

Accepted syntax:

1. `/pollux`
2. `/pollux status`
3. `/pollux --debug`
4. `/pollux status --debug`

All other argument combinations return usage text:
`Usage: /pollux [status] [--debug]`.

Default status output includes minimal UX indicators:

1. Pollux state indicator: `[ENABLED]` or `[DISABLED]`.
2. Executor alignment indicator: `[MATCH]` or `[DRIFT]` (resolved vs configured
   executor model).
3. Existing config snapshot lines (executor/advisor/detector-flags/budget/
   timeout/debug flag/settings path).

When `--debug` is present, the output appends an optional debug-details block
including machine-readable indicator keys and the raw snapshot payload.

### 11.3 Stream output contract

Phase 1 reuses existing tool_use/tool_result semantics for advisor interactions.

No new JSON stream event type is required for Phase 1 unless proven necessary by
test failures.

### 11.4 Live advisor lifecycle UI surface

Beyond the read-only `/pollux` snapshot in §11.2, the interactive surfaces MUST
expose the live advisor consultation as it happens, so the user can distinguish
"executor is thinking" from "Pollux escalated and the advisor is being
consulted." This is required to make the otherwise opaque advisor pause
explicable without forcing the user to tail `pollux-debug.log`.

#### 11.4.1 Lifecycle event contract

The core advisor pipeline MUST emit a single broadcast event per consultation
phase change on `coreEvents`:

| Phase        | Emitted when                                                                     |
| ------------ | -------------------------------------------------------------------------------- |
| `pending`    | Detector + policy have approved escalation, advisor model resolved, prompt built |
| `consulting` | Immediately before the advisor `generateContent` call is awaited                 |
| `done`       | In the consultation `finally` block (success, fail-open, or unexpected throw)    |

Required guarantees:

1. Every `pending` event MUST be paired with a terminal `done` event, even on
   timeout or thrown error. This mirrors the §5.2 fail-open contract: the UI
   override must always clear, regardless of advisor outcome.
2. Turns where the detector skips escalation MUST NOT emit any phase event.
3. Phase events are transient (not buffered): subscribers that attach late MUST
   NOT see stale events from a previous turn.
4. Each event payload MUST carry the canonical executor model id; `pending` and
   `consulting` payloads MUST also carry the canonical advisor model id so the
   UI can reflect which model is actively running.
5. When an escalation is produced by the live executor observer path, the
   `PolluxAdvisorPhasePayload` MUST include `escalationTiming` (and, for
   same-turn escalations, `pauseBoundary` when applicable) consistent with
   `POLLUX_ESCALATION_TIMING` for the escalation reason code; it SHOULD include
   `contributingSignalIds` for attribution. When a same-turn request is
   downgraded to next-turn per the timing guardrails, the payload MUST set
   `sameTurnDowngraded: true` and reflect the effective `escalationTiming` (see
   §7.5).

Reference implementation: `CoreEvent.PolluxAdvisorPhase` and
`coreEvents.emitPolluxAdvisorPhase()` in `packages/core/src/utils/events.ts`,
emitted from `maybeRunPolluxAdvisorConsultation` in
`packages/core/src/core/client.ts`.

#### 11.4.2 Status row UX contract

Interactive surfaces (legacy interactive, agent-session interactive, ACP) MUST
override the default `Thinking...` status row text with phase-specific phrases
while a consultation is in flight:

| Phase        | Status row text                                    |
| ------------ | -------------------------------------------------- |
| `pending`    | `Advising required...`                             |
| `consulting` | `Advising in progress...`                          |
| `done`       | `Advising done.` for ≤1.5s, then revert to default |

The override MUST take precedence over the executor model's `thought` subject
during the consultation window, because the advisor call runs _before_ the
executor stream produces any thoughts and the user needs explicit feedback that
extra work is happening. After the brief `done` window the row reverts to the
normal `Thinking...` / thought-subject behavior with no further intervention.

#### 11.4.3 Footer model name contract

The footer's `model-name` cell MUST display the live advisor model id while a
consultation is in flight (`pending` or `consulting`), and MUST revert to the
executor model id on `done`. This swap is purely cosmetic and MUST NOT affect:

1. Context-window usage calculations (which remain anchored on the executor
   model that owns the conversation history).
2. Token accounting attribution (which is governed by §9 and by `LlmRole`
   tagging on the underlying request, not by the footer display).
3. The `currentModel` value reported by `/pollux` (read-only snapshot, §11.2).

The footer override is an _observation_ of which model is doing work right now,
not a state change.

#### 11.4.4 Failure semantics

If the advisor consultation fails open (timeout, parse error, empty response, or
unexpected throw), the `done` event MUST still fire. The UI MUST NOT treat
fail-open as a distinct user-visible state in this surface; surfacing fail-open
diagnostics remains the responsibility of `pollux-debug.log` (§9, §13.3) and the
`/pollux --debug` snapshot (§11.2). This keeps the interactive surface silent
about internal recovery and consistent with §5.2 ("consultation never blocks the
executor path").

---

## 12) CI, test, and release contract

Required release-blocking gates:

1. Cross-surface parity tests.
2. Advisor policy double-prompt avoidance tests.
3. Token reconciliation tests.
4. Benchmark fairness gate tests.
5. Schema and config mapping tests.
6. Pollux-scoped binary build and perf/memory workflows.

No latest-channel promotion without all release-blocking gates green.

---

## 13) Security and safety contract

1. Pollux must respect existing trust and policy mechanisms.
2. Advisor behavior must not silently degrade into denied headless behavior.
3. Pollux must fail-open to executor path if advisor path is unavailable.
4. No unmanaged policy sprawl through per-turn rule append behavior.

---

## 14) Documentation and governance contract

Required updates as part of Pollux rollout:

1. Keep this spec and IMPLEMENTATION_PLAN.md versioned and synchronized.
2. Maintain explicit implemented status markers for major sections.
3. Keep ownership coverage for POLLUX\_\*.md and repo-compartment-analysis docs.
4. Keep per-finding correction ledger tied to implementation PR sequence.

---

## 15) Acceptance criteria

Pollux Phase 1 is accepted only when:

1. Pollux-off behavior is baseline-identical.
2. Pollux-on behavior is validated across all in-scope surfaces.
3. Advisor policy works in non-interactive and ACP modes without surprise
   prompts.
4. Token accounting is reconciled across all required sinks.
5. Benchmark A-E results are produced under documented fairness pins.
6. CI and governance contracts are fully green.

---

## Appendix A: Driver/interceptor matrix (Phase 1)

| Surface                       | Interceptor responsibility                      | Expected test                             |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Interactive legacy            | Pollux orchestration + event-order preservation | end-to-end interactive escalation test    |
| Non-interactive legacy        | Pollux orchestration + text/json stability      | end-to-end non-interactive parity test    |
| Interactive agent-session     | Pollux parity semantics with legacy             | agent-session interactive parity test     |
| Non-interactive agent-session | Pollux parity semantics with legacy             | agent-session non-interactive parity test |
| ACP                           | advisor policy/permission-safe integration      | ACP advisor prompt behavior test          |
| A2A (deferred)                | explicit bypass behavior only                   | documented bypass assertion test          |

---

## Appendix B: Benchmark fairness checklist

Each benchmark run artifact must record:

1. model override state
2. loop detector state
3. availability reset state
4. dynamic config state
5. session isolation state

Missing any item invalidates comparison claims.

---

## Appendix C: Terminology

1. Executor: default task-performing model.
2. Advisor: escalation model consulted by Pollux.
3. Fairness pins: controls that neutralize non-Pollux utility call noise.
4. In-scope surface: runtime path required to satisfy Phase 1 acceptance.
