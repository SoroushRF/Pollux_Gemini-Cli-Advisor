# P2-06 A2A Deferred-Scope Bypass Contract

Version: 1.0 Date: 2026-04-18 Status: Draft for Phase 2 closure Purpose: Phase 2
task artifact for P2-06 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

D6 (A2A CoderAgentExecutor) is explicitly out of scope for Pollux Phase 1 and
Phase 2 per P0-01 §D6 and POLLUX_SPEC.md §3. This document closes the P2-06
deliverable by defining:

1. Why A2A is deferred.
2. The explicit-bypass contract that MUST hold on every A2A turn while D6 is
   deferred.
3. The call-site and seam-level assertion tests that pin the contract.
4. The deferred-scope reason marker surfaced on every A2A turn.

Runtime reactivation of A2A is out of scope for this artifact. Enabling Pollux
on A2A requires an explicit plan amendment plus a dedicated seam artifact (see
§6).

---

## 2) Reason for deferral

1. A2A CoderAgentExecutor is an inter-agent RPC surface with its own
   authorization, telemetry, and session-identity model. Those surfaces were not
   part of the G1 driver matrix sign-off (P0-01).
2. A2A has no in-band human confirmation channel equivalent to ACP's
   `requestPermission`, so the policy-channel invariants verified in G2 (P0-02)
   cannot be enforced identically on A2A without additional design.
3. A2A sessions are owned by compartment 13 (integration products) with
   supporting owner 16. Pollux instrumentation on A2A requires sign-off from
   both per P0-01 §3 S6 change-control rules.

---

## 3) Bypass contract

For the duration of Phase 1 and Phase 2:

1. Every invocation of `GeminiClient.sendMessageStream` originating from
   `packages/a2a-server/src/agent/task.ts` MUST pass
   `PolluxRuntimeSurface.A2A_DEFERRED` as the `runtimeSurface` argument.
2. The advisor seam helper (`GeminiClient#maybeRunPolluxAdvisorConsultation`)
   MUST NOT list `A2A_DEFERRED` in its surface allow-list. When called with that
   surface the helper is a no-op and exits before any policy check, budget
   increment, advisor generateContent call, or debug-event emission.
3. A2A turns MUST NOT rely on the default `runtimeSurface` of
   `LEGACY_NON_INTERACTIVE`. Relying on the default would silently engage the D2
   advisor path whenever `pollux.enabled=true`, which violates the D6
   explicit-bypass contract.
4. No Pollux module, rule, detector, or telemetry channel is permitted to import
   or observe A2A-specific runtime state in Phase 1/Phase 2.

---

## 4) Deferred-scope reason marker

`PolluxRuntimeSurface.A2A_DEFERRED` (string value `'a2a_deferred'`, defined in
`packages/core/src/pollux/types.ts`) is the canonical reason marker for this
bypass. It appears:

1. At every A2A `sendMessageStream` call site in
   `packages/a2a-server/src/agent/task.ts` (by construction).
2. In the BP-06 assertion tests in `packages/a2a-server/src/agent/task.test.ts`
   under `Pollux A2A deferred bypass (P2-06 / BP-06)`.
3. In the seam-level no-op test
   `runPolluxAdvisorConsultation is a no-op for unknown runtime surfaces (P2-05 guard)`
   in `packages/core/src/core/client.test.ts`, which exercises the
   `A2A_DEFERRED` surface through the public wrapper and asserts zero policy
   checks and zero advisor invocations with `pollux.enabled=true`.

The presence of this marker is the observable contract. Reviewers can grep for
`A2A_DEFERRED` across the A2A package to confirm every outbound
`sendMessageStream` call site is tagged.

---

## 5) Acceptance tests (BP-06)

### BP-06-01 A2A user-message call site tagging

Objective: Verify that `Task#acceptUserMessage` tags its
`GeminiClient.sendMessageStream` invocation with the `A2A_DEFERRED` surface.

Assertions:

1. `sendMessageStream` is called exactly once per user text message.
2. The 8th positional argument is `'a2a_deferred'`.
3. The 8th positional argument is not the default `'legacy_non_interactive'`.

TG mapping: TG-10.

### BP-06-02 A2A tool-completion call site tagging

Objective: Verify that `Task#sendCompletedToolsToLlm` tags its
`GeminiClient.sendMessageStream` invocation with the `A2A_DEFERRED` surface.

Assertions:

1. `sendMessageStream` is called exactly once per completed-tool batch.
2. The 8th positional argument is `'a2a_deferred'`.

TG mapping: TG-10.

### BP-06-03 Seam-level no-op on A2A_DEFERRED

Objective: Verify that even when Pollux is enabled, the advisor seam exits
immediately for the `A2A_DEFERRED` surface and performs no policy check, no
advisor invocation, and no budget mutation.

Assertions:

1. `PolicyEngine.check` is not invoked.
2. `GeminiClient#generateContent` is not invoked with `LlmRole.UTILITY_ADVISOR`.
3. No advisor debug event is emitted.

This assertion is already covered by
`runPolluxAdvisorConsultation is a no-op for unknown runtime surfaces (P2-05 guard)`
in `packages/core/src/core/client.test.ts`.

TG mapping: TG-10.

---

## 6) Reactivation preconditions

A2A instrumentation may be introduced only after:

1. A Phase 3+ plan amendment explicitly moves D6 in-scope.
2. A new artifact `PX-YY_A2A_INTERCEPTION_SEAM.md` is produced under
   `docs/core/pollux/`, analogous to P0-01 for D1–D5 and P0-02 for the policy
   channel.
3. Owners 13 and 16 sign off on the seam per P0-01 §3 S6 change-control rules.
4. `A2A_DEFERRED` is either removed from `PolluxRuntimeSurface` or kept only for
   historical compatibility (with tests updated accordingly).

---

## 7) References

1. IMPLEMENTATION_PLAN.md (P2-06 task definition and Phase 2 evidence log).
2. docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md (D6 row, BP-06 blueprint,
   S6 seam ownership).
3. docs/core/pollux/PHASE2_GUARDRAILS.md (one-surface-per-PR rule, no-default-
   surface-leak pattern).
4. POLLUX_SPEC.md §3 (runtime reality and coverage matrix, A2A deferred).
5. packages/core/src/pollux/types.ts (canonical `PolluxRuntimeSurface` enum).
6. packages/a2a-server/src/agent/task.ts (call-site contract).
7. packages/a2a-server/src/agent/task.test.ts (BP-06 assertion tests).
8. packages/core/src/core/client.test.ts (seam-level no-op guard).
