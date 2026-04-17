# P0-01 Driver Interceptor Matrix and Seam Ownership Map

Version: 1.0 Date: 2026-04-17 Status: Draft for G1 closure Purpose: Phase 0 task
artifact for P0-01 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This document closes the P0-01 deliverable by defining, in one place:

1. The Pollux interception seam for each runtime driver in scope for Phase 1.
2. The explicit deferred behavior for A2A.
3. The seam ownership map used for review authority and change control.
4. One integration test blueprint per in-scope surface.

This document is a control artifact. Runtime code changes are out of scope.

---

## 2) Driver and Interceptor Matrix

| Driver ID | Surface                       | Runtime entry path                                                   | Pollux interception seam (Phase 1)                                                                                 | Owner(s)                  | Phase 1 status          | Integration test blueprint                 |
| --------- | ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------- | ------------------------------------------ |
| D1        | Interactive legacy            | AppContainer -> useGeminiStream -> GeminiClient.sendMessageStream    | Core turn seam at GeminiClient.processTurn (per-turn orchestration contract)                                       | 02 primary, 01 support    | In scope                | BP-01 legacy interactive escalation        |
| D2        | Non-interactive legacy        | runNonInteractive -> GeminiClient.sendMessageStream                  | Core turn seam at GeminiClient.processTurn (non-interactive parity contract)                                       | 02 primary, 01 support    | In scope                | BP-02 legacy non-interactive parity        |
| D3        | Interactive agent-session     | AppContainer -> useAgentStream -> LegacyAgentSession                 | Agent-session seam in LegacyAgentSession send/stream adapter path; must preserve legacy behavioral contract        | 03 primary, 01/02 support | In scope                | BP-03 agent-session interactive parity     |
| D4        | Non-interactive agent-session | runNonInteractiveAgentSession -> LegacyAgentSession                  | Agent-session seam in LegacyAgentSession non-interactive driver path; must preserve output and continuation parity | 03 primary, 01/02 support | In scope                | BP-04 agent-session non-interactive parity |
| D5        | ACP                           | GeminiAgent.prompt -> Session.prompt -> GeminiChat.sendMessageStream | ACP seam in Session.prompt orchestration path with advisor policy-safe handling                                    | 12 primary, 09/02 support | In scope                | BP-05 ACP advisor permission-safe flow     |
| D6        | A2A CoderAgentExecutor        | a2a-server executor path                                             | No Pollux interception in Phase 1. Explicit no-op/bypass with documented reason and assertion tests only.          | 13 primary, 16 support    | Deferred (out of scope) | BP-06 A2A deferred bypass assertion        |

Notes:

1. processTurn-level integration is necessary but not sufficient for full
   coverage.
2. D3, D4, and D5 require non-processTurn seams to maintain cross-surface
   parity.
3. D6 must remain explicit bypass in Phase 1 with tests that verify the bypass.

---

## 3) Seam Ownership Map

| Seam                                                     | Primary owner | Supporting owners | Approval required for changes | Files and paths under control                                                                                                                   |
| -------------------------------------------------------- | ------------- | ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| S1: Core turn seam                                       | 02            | 01, 07            | 02 + one supporting owner     | packages/core/src/core/client.ts, packages/core/src/core/turn.ts                                                                                |
| S2: Legacy interactive and non-interactive driver wiring | 01            | 02                | 01 + 02                       | packages/cli/src/ui/hooks/useGeminiStream.ts, packages/cli/src/nonInteractiveCli.ts                                                             |
| S3: Agent-session seam                                   | 03            | 01, 02            | 03 + one supporting owner     | packages/cli/src/ui/hooks/useAgentStream.ts, packages/cli/src/nonInteractiveCliAgentSession.ts, packages/core/src/agent/legacy-agent-session.ts |
| S4: ACP seam                                             | 12            | 09, 02            | 12 + 09                       | packages/cli/src/acp/acpClient.ts, packages/cli/src/acp/commandHandler.ts                                                                       |
| S5: Advisor policy channel                               | 09            | 04, 12            | 09 + 12                       | packages/core/src/policy/\*\*, packages/core/src/scheduler/policy.ts, packages/core/src/confirmation-bus/message-bus.ts                         |
| S6: A2A deferred bypass                                  | 13            | 16                | 13 + 16                       | packages/a2a-server/src/agent/executor.ts, docs updates for deferred-scope contract                                                             |
| S7: Governance lock for seam docs                        | 16            | 15                | 16                            | POLLUX_SPEC.md, IMPLEMENTATION_PLAN.md, POLLUX_DOC_CORRECTIONS.md                                                                               |

Change-control rules:

1. Any change to S1-S6 requires updating this matrix and the related test
   blueprint entry.
2. Any scope change for D6 (A2A) requires explicit plan/spec amendment before
   code work.
3. Seam changes cannot be merged without matching TG mapping in PR description.

---

## 4) Integration Test Blueprints

The following are blueprint-level contracts for implementation. They define what
must be proven before the corresponding gate can be considered satisfied.

### BP-01 legacy interactive escalation

Objective: Validate Pollux behavior on interactive legacy path without
event-order regressions.

Setup:

1. Interactive legacy driver selected.
2. Pollux feature flag OFF and ON runs with identical prompts.
3. Deterministic fixtures for tool calls and advisor responses.

Assertions:

1. Pollux OFF output matches baseline behavior.
2. Pollux ON preserves observable event ordering.
3. Tool-call continuation loop behavior remains stable.
4. Advisor failures fail open to executor path.

TG mapping: TG-2, TG-6.

### BP-02 legacy non-interactive parity

Objective: Validate Pollux behavior on non-interactive legacy path with output
stability.

Setup:

1. Legacy non-interactive driver selected.
2. Runs executed for Pollux OFF and ON.
3. Output formats include json and stream-json.

Assertions:

1. Pollux OFF remains baseline-identical.
2. Pollux ON maintains output schema and ordering guarantees.
3. No silent policy-denied advisor path under non-interactive mode.

TG mapping: TG-2, TG-3.

### BP-03 agent-session interactive parity

Objective: Validate parity between interactive agent-session and legacy
interactive contracts.

Setup:

1. Agent-session interactive flag enabled.
2. Equivalent prompt corpus used for legacy and agent-session paths.

Assertions:

1. Pollux ON parity holds for continuation behavior and observable outcomes.
2. No regression in cancellation and completion behavior.
3. Fail-open semantics match legacy contract.

TG mapping: TG-2, TG-6.

### BP-04 agent-session non-interactive parity

Objective: Validate non-interactive agent-session path parity and output
contract stability.

Setup:

1. Agent-session non-interactive flag enabled.
2. Pollux OFF and ON runs over identical prompts.

Assertions:

1. Output contract remains stable and comparable to legacy non-interactive.
2. Continuation and tool-result behavior remain deterministic.
3. No hidden regressions in response finalization.

TG mapping: TG-2, TG-6.

### BP-05 ACP advisor permission-safe flow

Objective: Validate ACP advisor semantics with no redundant permission prompts.

Setup:

1. ACP runtime path selected.
2. Advisor consultation path enabled.
3. Non-interactive-like policy constraints represented in harness.

Assertions:

1. Advisor consultation does not trigger unexpected requestPermission prompts.
2. Policy path behaves as intended for advisor consultation.
3. Fail-open behavior is preserved when advisor path is unavailable.

TG mapping: TG-3, TG-8.

### BP-06 A2A deferred bypass assertion

Objective: Enforce deferred scope for A2A in Phase 1.

Setup:

1. A2A CoderAgentExecutor path exercised with Pollux flags both OFF and ON.

Assertions:

1. Pollux interception does not occur on A2A path in Phase 1.
2. Bypass behavior is explicit and documented.
3. Test output includes deferred-scope reason marker.

TG mapping: TG-10.

---

## 5) G1 Closure Checklist

This artifact closes G1 when all items below are true:

1. Interceptor contract is documented per in-scope surface (D1-D5).
2. Explicit out-of-scope A2A bypass is documented (D6).
3. One integration test blueprint exists per in-scope surface (BP-01 through
   BP-05).
4. Seam ownership and approval map is defined (S1-S7).
5. Owners 01/02/03/12 sign off on matrix semantics; owner 13 signs off on bypass
   semantics.

---

## 6) References

1. IMPLEMENTATION_PLAN.md (G1 and P0-01 task definition)
2. POLLUX_SPEC.md (runtime coverage matrix and Phase 1 scope)
3. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-1 and NA-1)
4. docs/repo-compartment-analysis/reports/01-cli-runtime-surface/report.md
5. docs/repo-compartment-analysis/reports/03-agent-runtime-and-modes/report.md
6. docs/repo-compartment-analysis/reports/12-output-protocol-and-acp-adapters/report.md
7. docs/repo-compartment-analysis/reports/13-integration-products-sdk-vscode-a2a-devtools/report.md
