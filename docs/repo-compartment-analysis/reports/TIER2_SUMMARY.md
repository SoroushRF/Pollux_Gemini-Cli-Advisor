# Tier-2 Compartment Summary

Consolidated synthesis of the four **Tier-2 (high-leverage)** compartment
reports. Preserves technical depth and cross-cutting claims relevant to Pollux.
Compartment-level detail, quotes, and full evidence matrices live in the
individual reports under `reports/NN-<slug>/report.md`.

- **Commit analyzed**: `c8127045c5832b0e66cb1efd04e0dd6800ce78e7`.
- **Compartments covered**: 03, 08, 11, 14.
- **Status**: all four `done` in `INDEX.md`.
- **Upstream producers consumed**: 01, 02, 04, 06, 07 (Tier-1).
- **Downstream consumers produced to**: 12, 13, 15, 16 (Tier-3/4 + governance).

---

## 1. Cross-compartment map

Tier-2 sits one layer inside Tier-1. Where T1 owns how a turn moves, T2 owns
**how turn inputs/outputs are conditioned, measured, and parallelized**: runtime
mode selection, context shaping, telemetry emission, and the harness that
validates all of it.

| #   | Compartment                                   | Layer          | Owns                                                                                               | Primary artefact                                                   |
| --- | --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 03  | Agent Runtime and Modes                       | CLI + Core     | 4-driver mode matrix, `LegacyAgentSession` adapter, `AgentRegistry`, local/remote invocation       | `reports/03-agent-runtime-and-modes/report.md`                     |
| 08  | Context, Memory, and Compression              | Core           | `ChatCompressionService`, `ContextCompressionService`, `ToolOutputMaskingService`, `MemoryService` | `reports/08-context-memory-and-compression/report.md`              |
| 11  | Telemetry, Observability, and Billing Signals | Core + Scripts | OTel SDK, billing events, `LlmRole`-tagged token capture, activity monitor                         | `reports/11-telemetry-observability-and-billing-signals/report.md` |
| 14  | Testing and Evaluation Architecture           | Repo-wide      | Unit, integration (`TestRig`), evals (`ALWAYS_PASSES`/`USUALLY_PASSES`), memory + perf harness     | `reports/14-testing-and-evaluation-architecture/report.md`         |

### T2 sitting relative to T1

```
T1 01 CLI driver selection        → T2 03 Mode matrix (which driver, via which adapter)
T1 02 Turn lifecycle              → T2 08 Context shaping + compression within processTurn
                                  → T2 11 Per-chunk token capture inside GeminiChat
                                  → T2 14 TestRig orchestrates the whole turn in integration mode
T1 04 Tool platform               → T2 08 Tool output masking/distillation
                                  → T2 14 Integration fixtures exercise tools end-to-end
T1 06 Settings                    → T2 11 Telemetry config resolution (argv > env > settings)
                                  → T2 14 No harness overrides yet exist for Pollux fairness pins
T1 07 Routing + loop              → T2 11 Routing tokens flow through same LlmRole pipe
                                  → T2 14 Pollux benchmarks need router/loop suppression (not built)
```

### The four verified "Pollux pivot points" at Tier-2

1. **03** — three of the four drivers do not go through the single
   `GeminiClient → Turn` seam that Pollux spec §3 assumes.
2. **08** — `ChatCompressionService.compress(chat: GeminiChat, ...)` already
   reads `chat.getHistory(true)` directly; spec §14 "don't touch GeminiChat" is
   too absolute.
3. **11** — per-chunk token capture at `geminiChat.ts:915-921` plus
   `LoggingContentGenerator.ApiResponseEvent` already do what spec §8 TurnLog
   proposes.
4. **14** — no benchmark knob in the repo suppresses router or loop-detector LLM
   calls; Condition A/E "zero extra API calls" is unreproducible.

All four are Pollux blockers surfaced into the synthesis systemic-risk set.

---

## 2. Compartment summaries

### 2.1 Compartment 03 — Agent Runtime and Modes

**Key claim**: the CLI owns two interactive + two non-interactive stream
sources, each selectable by feature flag at **mount time**; the
`LegacyAgentSession` adapter shims the Gemini client into the AgentProtocol so
agent-session drivers still reach the same tool loop, but ACP bypasses the
client entirely.

**Mode matrix** (T2 VT-03.1, VT-03.2):

| Mode                          | Source                                                          | Flag                                     |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| Interactive legacy            | `useGeminiStream` → `geminiClient.sendMessageStream`            | default                                  |
| Interactive agent-session     | `useAgentStream` → `LegacyAgentProtocol` → `LegacyAgentSession` | `getAgentSessionInteractiveEnabled()`    |
| Non-interactive legacy        | `runNonInteractive` → `geminiClient.sendMessageStream`          | default                                  |
| Non-interactive agent-session | `runNonInteractiveAgentSession` → `LegacyAgentSession.send`     | `getAgentSessionNoninteractiveEnabled()` |
| ACP (`GeminiAgent.prompt`)    | bypasses `Turn` **and** `GeminiClient.sendMessageStream`        | `--experimental-acp`                     |

**Adapter anchor** (VT-03.3): `packages/core/src/agent/legacy-agent-session.ts`
is a single file that translates `AgentProtocol` to legacy Gemini events. Both
interactive and non-interactive agent-session drivers reuse it.

**AgentRegistry load order** (VT-03.4,
`packages/core/src/agents/registry.ts:117-263`): built-in → user-level →
project-level → extension-provided. Discovery events are observability-visible
via `CoreEvent.AgentsDiscovered` and `CoreEvent.AgentsRefreshed`.

**Two invocation paths for subagents** (VT-03.5, VT-03.6):

- `LocalSubagentInvocation` runs via `LocalAgentExecutor` and bridges its stream
  activity to the parent tool's output (isolated `ToolRegistry` +
  `PromptRegistry`, VT-03.7).
- `RemoteAgentInvocation` bypasses the local executor and calls
  `A2AClientManager` directly — no Pollux interceptor on that path.

**Contradiction** (C-03.1, `deferred → 02`): Pollux spec assumes one interceptor
suffices; only two of four drivers flow through
`GeminiClient.sendMessageStream`.

**Top risks**:

- **R-03.4 (high)**: `AppContainer.tsx:1186-1216` disables `rules-of-hooks` to
  switch between `useAgentStream` and `useGeminiStream`. Mid-session flip of
  `getAgentSessionInteractiveEnabled()` corrupts React state.
- **R-03.1 (medium)**: no test enforces Pollux-event parity across the 4
  drivers.
- **R-03.2 (medium)**: remote invocation has no `ModelAvailabilityService`-gated
  retry path.

**Coverage gaps** (T2 specific):

- No test asserts Pollux-event parity across drivers (R-03.1).
- No guard against mid-session flag flip (R-03.4).

### 2.2 Compartment 08 — Context, Memory, and Compression

**Key claim**: context shaping happens in four independent services, each with
its own budget constant; Pollux advisor-context trimming (spec §12 Risk 3) would
be the fifth, and must serialize with the existing ones.

**Service inventory**:

- **`ChatCompressionService`**
  (`packages/core/src/context/chatCompressionService.ts`):
  - Reverse Token Budget = **50,000 tokens** for function responses; older large
    tool responses truncated to **30 lines** (VT-08.1, lines 135-235).
  - `compress(chat: GeminiChat, ...)` directly reads `chat.getHistory(true)`
    (VT-08.2, lines 237-247). **This is a structural exception to spec §14
    "don't touch `GeminiChat` directly"** (forensic F-09).
  - Probe verification step after summary generation to catch critical-detail
    loss (VT-08.3, lines 382-405).
- **`ContextCompressionService`**: batches file-read outputs to an LLM which
  returns routing levels `FULL`/`PARTIAL`/`SUMMARY`/`EXCLUDED` and caches the
  decision (VT-08.4, lines 224-232).
- **`ToolOutputMaskingService`**: protects newest **50,000 tool tokens** and
  optionally the entire latest turn from masking (VT-08.5, lines 94-138).
- **`ToolOutputDistillationService`**: exempts `read_file` and `read_many_files`
  from distillation (VT-08.6, lines 83-87).
- **`MemoryService`**: background `SkillExtractionAgent` runs on sessions that
  are idle ≥ **3 h** and have ≥ **10 user messages** (VT-08.7, lines 268-283).
- **`MemoryContextManager`**: just-in-time discovery walks **upwards** from any
  accessed path to collect `GEMINI.md` files (VT-08.8, lines 141-172).
- **`SessionSummaryService`** (T2 addition, analyst-added path): Gemini
  Flash-Lite with first-N + last-N window (MAX_MESSAGES=20, TIMEOUT=5 s)
  produces a 1-line session summary (VT-08.9,
  `services/sessionSummaryService.ts:14-85`).

**Observability**: `ChatCompressionEvent`, `ToolOutputTruncatedEvent`,
`ToolOutputMaskingEvent`, `CoreEvent.MemoryChanged`.

**Contradiction** (C-08.1, `deferred → 02`, forensic **F-09**): spec §14 forbids
direct `GeminiChat` access, but `ChatCompressionService.compress` already does
it. Pollux advisor-context trimming has precedent.

**Top risks**:

- **R-08.2 (high)**: Probe may miss omissions; stale summaries retain critical
  constraint loss.
- **R-08.5 (medium)**: Pollux trim + compression collide on the same turn →
  suggested per-turn lock held inside `ChatCompressionService`.
- **R-08.1 (medium)**: over-truncation could break
  `functionCall`/`functionResponse` pairs if the boundary falls between them.
- **R-08.3 (medium)**: `ToolOutputMaskingService` can mask context still needed
  for long-running tasks.
- **R-08.4 (medium)**: memory drift — `SkillExtractionAgent` may duplicate
  existing skills.

**Coverage gaps**:

- OQ-08.1 (→ 14): large-file handling in context compression routing.
- No test asserts Pollux trim + compression non-interference (R-08.5).

### 2.3 Compartment 11 — Telemetry, Observability, and Billing Signals

**Key claim**: telemetry is already **end-to-end per call** and **per chunk** —
any Pollux "new logger" duplicates existing capture.

**Configuration precedence** (VT-11.1, `telemetry/config.ts:49-123`): **argv >
environment variables > `settings.json`**. No merge-strategy ambiguity.

**OTel SDK targets** (VT-11.2, `telemetry/sdk.ts:268-333`): direct GCP, OTLP
HTTP, OTLP gRPC, file, console. Initialization is **deferred** when CLI auth is
required but credentials are not yet available (VT-11.7, lines 194-212).

**Tracing** (VT-11.3, `telemetry/trace.ts:55-78`): `runInDevTraceSpan`
auto-truncates large input/output payloads to **10,000 chars**.

**Sanitization** (VT-11.4, `telemetry/metrics.ts:1572-1578` +
`telemetry/sanitize.ts:26-52`): hook names are always sanitized before metric
emission to prevent leaking paths/args.

**Billing events** (VT-11.5, `telemetry/billingEvents.ts:27-256`): strongly
typed classes that serialize to both OpenTelemetry attributes **and** log
bodies, so the same event carries to metrics backends and plain-text logs.

**Activity monitor** (VT-11.6, `telemetry/activity-monitor.ts:45-56`): buffers
up to **100** recent events and triggers memory snapshots on specific activity
types.

**Per-chunk token capture** (VT-11.8, critical for Pollux):
`GeminiChat.processStreamResponse` forwards each chunk's `usageMetadata` to
`chatRecordingService.recordMessageTokens(...)` (`geminiChat.ts:915-921` →
`services/chatRecordingService.ts:486-515`). Writes input, output, cached,
thoughts, tool, and total token counts onto the last gemini message in the
conversation file.

**Pre-existing `LlmRole` taxonomy** (from 02 T9, re-confirmed in 11): 11 values,
7 of which are `UTILITY_*`. Every router, loop-detector, compressor, and
next-speaker call passes through `LoggingContentGenerator.ApiResponseEvent` /
`ApiErrorEvent` with this tag.

**Observability signals published**: `gemini_cli.tool.call.count`,
`gemini_cli.api.request.count`, `gemini_cli.token.usage`,
`gemini_cli.overage_option_selected`.

**Contradiction** (C-11.1, forensic **F-10**, `deferred → 16`): Pollux spec §8
TurnLog proposes a new logger; per-chunk capture is already persisted. A Pollux
TurnLog should extend this sink, not replace it.

**Top risks**:

- **R-11.3 (medium)**: Pollux TurnLog writing to a parallel sink drifts from
  persisted conversation record and `gemini_cli.token.usage`. Suggested guard:
  integration test asserting totals match.
- **R-11.2 (medium)**: memory-monitor snapshots can thrash if
  `snapshotThrottleMs` is too low — needs a hard lower bound.
- **R-11.1 (low)**: telemetry buffer can drop events on crash before
  `flushTelemetryBuffer` completes.

**Coverage gaps**:

- No snapshot-throttle test (R-11.2).
- No integration test `gemini_cli.token.usage` ≡ conversation-file totals
  (R-11.3).

### 2.4 Compartment 14 — Testing and Evaluation Architecture

**Key claim**: four test dimensions exist (unit/integration, evals, memory,
perf), each with its own harness, but **none of them today can produce a fair
"zero-baseline" Pollux benchmark** because none suppresses router or
loop-detector LLM calls.

**Test dimensions** (VT-14.1, `package.json:43-57`):

1. Unit/integration (`vitest` per-package + repo-root integration).
2. Behavioral evals in `evals/`, split into `ALWAYS_PASSES` (CI-blocking) and
   `USUALLY_PASSES` (nightly-monitored) — VT-14.4, `evals/README.md:98-103`.
3. Memory regression — `perf-tests/memory-usage.test.ts` with forced GC, V8 heap
   snapshots, 10% tolerance (VT-14.5, `memory-test-harness.ts:252-253`).
4. Performance regression — wall-clock, CPU, event-loop delay, 15% tolerance
   (VT-14.6, `perf-test-harness.ts:253-256`).

**Integration harness** (VT-14.3): `TestRig` lives in
`packages/test-utils/src/test-rig.ts:21-77`. `integration-tests/test-helper.ts`
is a thin re-export — the real orchestrator is in `test-utils`. Only extra field
added at re-export is `skipFlaky`.

**Mocked LLM responses** (VT-14.2, `docs/integration-tests.md:61-65`):
binary-under-test approach with `.responses` files; mocks don't cover router
decisions or loop-check LLM calls.

**Sandbox matrix** (VT-14.7, `package.json:51`): `none`, `docker`, `podman`.

**Negative finding (VT-14.8, critical)**: "No benchmark harness in the repo
suppresses or isolates the in-core router or the loop detector for benchmark
runs". Integration tests inherit production routing; evals mock responses but
not strategies.

**Contradiction** (C-14.1, forensic **F-07**, `deferred → 07`): spec §9 claims
"zero extra API calls / zero latency" baseline. T1 07 VT-07.3 shows router fires
up to one `UTILITY_ROUTER` call per prompt; loop detector fires 0–2 calls from
turn 30 onward. No harness suppresses either.

**Top risks**:

- **R-14.3 (high)**: Condition A/E report biased numbers without an
  `OverrideStrategy`-only router and
  `LoopDetectionService.llmCheckInterval = Infinity` for the run.
- **R-14.1 (medium)**: stale `.responses` fixtures mask LLM-protocol
  regressions.
- **R-14.2 (low)**: flaky `USUALLY_PASSES` evals ignored without nightly
  monitoring.

**Coverage gaps**:

- Protocol output + agent branching (OQ-14.1 → 12).
- Router/loop suppression owner (OQ-14.2 → 07).

---

## 3. Cross-cutting themes (Tier-2)

### 3.1 Four of five Pollux blockers surface at T2

T1 found "Pollux is not implemented"; T2 pinpoints **what, specifically**, has
to change in pre-existing code for a Pollux implementation to be honest:

1. **Driver parity** (03): four + ACP = five; one interceptor covers two.
2. **Direct `GeminiChat` precedent** (08): `ChatCompressionService.compress`
   does it; spec §14 is overbroad.
3. **Token logger duplication** (11): `recordMessageTokens` already exists.
4. **Benchmark harness missing** (14): no router/loop suppression dial.

These become synthesis systemic risks SR-1, SR-2, SR-3 (plus the §14 overbroad
guidance contributes to SR-7).

### 3.2 `LegacyAgentSession` is a transitional artefact

03 VT-03.3 is clear: the adapter is named "Legacy" and marked for replacement
once native `AgentSession` lands. **Pollux built against the adapter will need a
second migration** when the native implementation ships. Spec should either cite
the adapter's expected deprecation window or target the native seam.

### 3.3 "Direct `GeminiChat` access" is already a supported pattern

The most aggressive spec constraint (§14 "don't touch `GeminiChat` directly") is
contradicted by `chatCompressionService.ts:237-247` passing `chat: GeminiChat`
as a parameter and calling `chat.getHistory(true)`. The actual constraint
enforceable today is **"do not mutate `GeminiChat.history` externally"**, not
"do not read it" (cross-reference 02 C-02.4). Pollux advisor-context trimming
has precedent.

### 3.4 `LlmRole` is the already-built "advisor token ledger"

11 VT-11.8 + 02 T9 together show `LlmRole` is the correct shape for
`UTILITY_ADVISOR`:

- `LoggingContentGenerator` emits `ApiResponseEvent` per LLM call.
- `ChatRecordingService.recordMessageTokens` persists per-chunk usage.
- Metric export (`gemini_cli.token.usage`) is `LlmRole`-tagged.

Adding a 12th `LlmRole` (NA-4 in synthesis) wires advisor tokens into all three
sinks with **no new file**. A parallel `pollux/logger.ts` drifts.

### 3.5 `TestRig` is the correct harness to extend, not replace

14 VT-14.3 confirms the real orchestrator is
`packages/test-utils/src/test-rig.ts`, not `integration-tests/test-helper.ts`.
Synthesis NA-2's `BenchmarkHarness` should wrap `TestRig`, not reinvent it.
Already pre-existing knobs: sandbox matrix, `.responses` mocks, `skipFlaky`.
Knobs to add: `OverrideStrategy` router, `disableLoopDetection=true`,
availability reset.

### 3.6 `chatRecordingService` is the single persistent token sink

Three compartments cite it: 02 T6, 08 (compression writes into the same
history), 11 VT-11.8. A fourth (14) will depend on it for baseline integrity.
Anything that writes token counts _without_ going through `recordMessageTokens`
will show up as drift in the integration test proposed in R-11.3.

### 3.7 Tier-2 observability signals

Collected from the four sidecars, grouped by layer:

| Layer               | Signals                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Agent runtime (03)  | `CoreEvent.AgentsDiscovered`, `CoreEvent.AgentsRefreshed`, `MessageBusType.SUBAGENT_ACTIVITY`                                |
| Context/memory (08) | `ChatCompressionEvent`, `ToolOutputTruncatedEvent`, `ToolOutputMaskingEvent`, `CoreEvent.MemoryChanged`                      |
| Telemetry (11)      | `gemini_cli.tool.call.count`, `gemini_cli.api.request.count`, `gemini_cli.token.usage`, `gemini_cli.overage_option_selected` |
| Testing (14)        | Nightly eval pass rates, memory baseline deltas, perf baseline deltas                                                        |

Pollux telemetry adds an `LlmRole` value, a billing-event class, and one extra
row in the metric export for `UTILITY_ADVISOR`. No new sink is required.

---

## 4. Risk heat map (Tier-2)

| Risk                                                                        | Compartment | Severity | Pollux impact                                                               |
| --------------------------------------------------------------------------- | ----------- | -------- | --------------------------------------------------------------------------- |
| `AppContainer` `rules-of-hooks` bypass on mid-session flag flip             | 03          | high     | Agent-session flag toggled after Pollux boot corrupts React state           |
| `ChatCompressionService` probe may miss critical constraint omissions       | 08          | high     | Pollux trim writing into an already-probed summary loses deeper context     |
| No benchmark harness suppresses router/loop-detector LLM calls              | 14          | high     | Condition A/E numbers biased; spec claim of "zero extra API calls" is false |
| Pollux trim + `ChatCompressionService.compress` collide on the same turn    | 08          | medium   | Race corrupts `GeminiChat.history`; needs per-turn lock                     |
| Pollux TurnLog writing to a parallel sink drifts from `recordMessageTokens` | 11          | medium   | Conversation file totals ≠ exported metric; hard to detect offline          |
| Memory-monitor snapshot throttling is not lower-bounded                     | 11          | medium   | Pollux-triggered activity spikes add perf noise                             |
| `LegacyAgentSession` is transitional; Pollux built on it needs migration    | 03          | medium   | Pollux will need rework when native `AgentSession` ships                    |
| Subagent concurrent workspace contention                                    | 03          | low      | Pollux advisor running via subagent against busy workspace resources        |
| Stale `.responses` fixtures mask LLM-protocol regressions                   | 14          | medium   | Pollux integration fixtures drift undetected                                |
| Flaky `USUALLY_PASSES` evals invisible without nightly monitoring           | 14          | low      | Pollux regression visible only the next morning                             |

---

## 5. Pollux-relevant design implications

Pulled verbatim from T2 contradictions and escalated open questions.

1. **Driver parity is a Tier-1 handoff resolved by Tier-2 data** (03 → 02): a
   Pollux interceptor at `GeminiClient` does **not** reach `LegacyAgentSession`
   callers. Either re-attach per driver or move the seam down to `GeminiChat`.
   Synthesis NA-1 tracks this.
2. **Advisor trim is allowed to touch `GeminiChat`** (08 → 02): precedent is
   `ChatCompressionService.compress(chat: GeminiChat, ...)`. Rewrite spec §14 as
   "don't mutate `.history` externally" to match runtime reality.
3. **Advisor telemetry = new `LlmRole` + no new logger** (11 → 16, F-10):
   replace spec §8 TurnLog with a 1-line integration contract. Persisted
   conversation file and metric export already carry the shape.
4. **Benchmark harness is net-new but thin** (14 → 07): wrap `TestRig` with
   `OverrideStrategy` + `disableLoopDetection=true` + availability reset. Pin
   list lives in 07 §8.
5. **Serialize advisor context trim with compression** (08 R-08.5): hold a
   per-turn lock inside `ChatCompressionService`. Feature-flag by Pollux flag so
   the lock is a no-op pre-launch.
6. **Mount-time-only agent-session contract** (03 R-03.4): codify; remove the
   conditional `rules-of-hooks` disable by splitting `AppContainer` into two
   mount branches. Synthesis NA-10 tracks this.

---

## 6. Coverage audit

### 6.1 What Tier-2 verified

- Four-driver mode matrix (03 VT-03.1, 03 VT-03.2).
- `LegacyAgentSession` adapter as the single shared artefact for agent-session
  modes (03 VT-03.3).
- `AgentRegistry` discover order: built-in → user → project → extension (03
  VT-03.4).
- `LocalSubagentInvocation` vs `RemoteAgentInvocation` split (03 VT-03.5/6),
  isolated per-subagent registries (03 VT-03.7).
- Context-shaping service taxonomy with explicit budget constants (08
  VT-08.1..VT-08.9).
- `compress(chat: GeminiChat, ...)` direct-access precedent (08 VT-08.2).
- Probe verification step in compression (08 VT-08.3).
- JIT `GEMINI.md` upward walk (08 VT-08.8).
- 3 h / 10-message threshold for `MemoryService` extraction (08 VT-08.7).
- Telemetry precedence argv > env > settings (11 VT-11.1).
- OTel SDK exporter targets + deferred init (11 VT-11.2, VT-11.7).
- 10 kchar payload truncation (11 VT-11.3); hook-name sanitization (11 VT-11.4).
- Billing events serialize to both attrs and logs (11 VT-11.5).
- Activity monitor 100-event buffer (11 VT-11.6).
- Per-chunk token capture at `geminiChat.ts:915-921` (11 VT-11.8).
- Test dimensions + `TestRig` authoritative location (14 VT-14.1..VT-14.3).
- ALWAYS/USUALLY eval split, memory 10%, perf 15% (14 VT-14.4..VT-14.6).
- Sandbox matrix (14 VT-14.7).
- Negative: no harness suppresses router/loop LLM calls (14 VT-14.8).

### 6.2 Known gaps left for Tier-3+ and synthesis

- Pollux-event parity across drivers (03 R-03.1) — parks under synthesis SR-1.
- Mid-session agent-session flag flip guard (03 R-03.4) — synthesis NA-10.
- Pollux trim + compression non-interference (08 R-08.5).
- `ChatCompressionService` probe failure-rate monitoring (08 R-08.2).
- Memory-monitor snapshot throttling (11 R-11.2).
- `gemini_cli.token.usage` ≡ conversation file totals (11 R-11.3) — synthesis
  NA-4.
- Router/loop suppression knobs (14 R-14.3, OQ-14.2) — synthesis SR-3 / NA-2.
- Protocol output + agent-branching test gaps (14 OQ-14.1) — to 12.

---

## 7. Handoff summary

Outgoing from the T2 set (producers → consumers):

- 03 → 11, 12, 13 (subagent telemetry, agent-session JSONL emission, A2A
  consumer).
- 08 → 14 (compression harness gaps, large-file routing).
- 11 → 7 (routing + loop events are the main `gemini_cli.*` emitters).
- 14 → 15 (test taxonomy is the input to CI gates).

Incoming to the T2 set (consumers ← producers):

- 03 ← 1, 2, 4 (driver matrix, turn engine, tools).
- 08 ← 2, 4 (turn lifecycle + tool output shape).
- 11 ← 2 (per-chunk token capture).
- 14 ← 1, 3, 4, 5, 7, 8, 10 (virtually every compartment feeds the harness).

Open questions escalated to synthesis or other compartments:

- 03 OQ-03.1 (LegacyAgentSession deprecation window) → 2.
- 03 OQ-03.2 (interceptor reach via LegacyAgentSession) → 2.
- 08 OQ-08.1 (extremely large files in context compression) → 14.
- 11 OQ-11.1 (perf/memory metric validation) → 14.
- 11 OQ-11.2 (advisor message type vs role tag) → 2.
- 14 OQ-14.1 (protocol output + agent branching gaps) → 12.
- 14 OQ-14.2 (harness router/loop suppression owner) → 7.

All seven clusters land in synthesis §8 (clusters A, C, D, F).

---

## 8. Reading order for Tier-3+

- **05 Extensibility (Skills/Hooks/Commands)** → 03 (subagent registry +
  `PromptRegistry` isolation) + 11 (hook-name sanitization pipe).
- **09 Policy, Trust, Safety** → 03 (subagent isolation applies to
  policy-checked tools) + 08 (compression hooks are policy-scoped today).
- **12 Output Protocol / ACP** → 03 (ACP bypasses client → bypasses Pollux) + 11
  (JSONL vs telemetry event parity).
- **10 Sandbox / Shell / Filesystem** → 08 (tool-output masking vs shell
  outputs) + 14 (sandbox matrix in harness).
- **13 Integration Products (SDK / VS Code / A2A / DevTools)** → 03 (A2A's
  `CoderAgentExecutor` is the 5th driver) + 14 (cross-package test
  orchestration).
- **14's own consumers** → 15 CI gates, 16 docs audit.
- **15 Build / Packaging / Release / CI** → 14 (test gates) + 11 (telemetry
  bundling).
- **16 Docs / Specs / Governance** → all four T2 compartments feed forensic
  findings (F-07, F-09, F-10) into the doc-update register.

---

## 9. Definition of Done for the Tier-2 summary

- [x] Every T2 compartment represented with its verified truths summarized.
- [x] Every T2 contradiction relevant to Pollux surfaced in §3.
- [x] Every high-severity risk replayed in §4.
- [x] Every Pollux design implication mapped to a compartment citation in §5.
- [x] Coverage gaps preserved verbatim in §6 so T3+ can pick them up.
- [x] Handoffs preserved in §7.
- [x] Reading order in §8 aligns with `POLLUX_PRIORITY.md` tiers and the
      synthesis cluster graph.
- [x] All citations follow `path:line` format; no new code quotes — readers who
      want code quotes go to the individual compartment reports.

_For the full evidence (code quotes, per-service risks, migration notes, and
forensic F-IDs), see each compartment's `report.md` and `report.json` under
`reports/NN-<slug>/`._
