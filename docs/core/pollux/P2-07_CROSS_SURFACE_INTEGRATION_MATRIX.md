# P2-07 Cross-Surface Integration Matrix Report

Version: 1.0 Date: 2026-04-18 Status: Phase 2 exit artifact Purpose: Close the
P2-07 deliverable in IMPLEMENTATION_PLAN.md and demonstrate that cross-surface
observable behavior is parity-verified across every in-scope Pollux runtime
surface (D1–D5) with D6 held as an explicit bypass.

---

## 1) Scope and purpose

This report consolidates the per-surface Cell A–D matrix evidence produced by
P2-01 through P2-06 into a single cross-surface view so that:

1. Phase 2 exit gates TG-2 (cross-surface parity), TG-3 (no double prompts),
   TG-6 (Pollux-specific integration tests green), and TG-8 (ACP advisor
   regression) can be signed off together.
2. Reviewers can confirm every driver in the P0-01 interceptor matrix has a
   named, line-level test that pins its observable contract.
3. Future changes to the advisor seam can be regression-checked against a
   single, versioned artifact rather than re-deriving per-surface evidence.

Non-goals:

1. This report does not re-implement per-surface seams. Those are owned by
   P2-01..P2-06 and their linked source files.
2. This report does not relax the one-surface-per-PR guardrail; it simply
   records that all five in-scope surfaces reached Cell A–D green at the same
   commit.
3. Detector behavior (P3) is explicitly out of scope. Every matrix cell below
   uses the P2 surface-gating contract with the packaged default ALLOW rule and
   `advisor.enabled=false` for detector harness purposes.

---

## 2) Matrix dimensions

### 2.1 Rows (runtime surfaces)

Rows are the Pollux runtime surfaces defined in
`packages/core/src/pollux/types.ts` (`PolluxRuntimeSurface`) and
`docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md`:

| Row | Surface                       | Enum value                      | Caller seam                                                   | In scope |
| --- | ----------------------------- | ------------------------------- | ------------------------------------------------------------- | -------- |
| D1  | Legacy interactive (CLI REPL) | `LEGACY_INTERACTIVE`            | `packages/cli/src/ui/hooks/useGeminiStream.ts`                | Yes      |
| D2  | Legacy non-interactive        | `LEGACY_NON_INTERACTIVE`        | `GeminiClient.sendMessageStream` default (non-interactive)    | Yes      |
| D3  | Interactive agent-session     | `AGENT_SESSION_INTERACTIVE`     | `packages/cli/src/ui/AppContainer.tsx` + legacy-agent adapter | Yes      |
| D4  | Non-interactive agent-session | `AGENT_SESSION_NON_INTERACTIVE` | `packages/cli/src/nonInteractiveCliAgentSession.ts`           | Yes      |
| D5  | ACP (agent client protocol)   | `ACP`                           | `packages/cli/src/acp/acpClient.ts` `Session.prompt`          | Yes      |
| D6  | A2A CoderAgentExecutor        | `A2A_DEFERRED`                  | `packages/a2a-server/src/agent/task.ts`                       | Deferred |

### 2.2 Columns (Cell A–D)

Columns are the standard Pollux behavior cells required by every in-scope
surface (P0-01 §2, PHASE2_GUARDRAILS.md §3):

| Cell | Configuration                             | Observable contract                                                                                                                    |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Pollux off                                | Baseline-identical visible stream events. Zero policy check, zero advisor call, zero budget mutation.                                  |
| B    | Pollux on, policy ALLOW                   | Advisor runs on the utility channel, visible stream events unchanged, `LlmRole.UTILITY_ADVISOR` tag emitted, no `GeminiChat` mutation. |
| C    | Pollux on, policy DENY (or advisor error) | Fail-open: visible stream events unchanged, executor continues, no user-facing error.                                                  |
| D    | Pollux on, advisor timeout                | Fail-open: visible stream events unchanged, executor continues, timeout budget incremented internally.                                 |

For D6 there is no Cell A–D. The only cell is **Bypass**: seam-level no-op on
the `A2A_DEFERRED` surface plus call-site tagging on every `sendMessageStream`
invocation (P2-06 / BP-06).

---

## 3) Coverage matrix

Each cell below points to the authoritative test file and the `it(...)` line
number that pins the contract. Line numbers are captured at HEAD commit
`d71a823b2` (P2-06 landing commit).

### 3.1 D1 – Legacy interactive

| Cell | Test                                                                                  | Location                                                                     |
| ---- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A    | `keeps legacy interactive output baseline-identical when Pollux is disabled (Cell A)` | `packages/core/src/core/client.test.ts:833`                                  |
| B    | `runs advisor internally on allow and preserves visible stream events (Cell B)`       | `packages/core/src/core/client.test.ts:870`                                  |
| C    | `fails open when advisor policy denies (Cell C)`                                      | `packages/core/src/core/client.test.ts:930`                                  |
| D    | `fails open on advisor timeout and keeps executor stream stable (Cell D)`             | `packages/core/src/core/client.test.ts:973`                                  |
| Tag  | D1 caller tags turns with `PolluxRuntimeSurface.LEGACY_INTERACTIVE`                   | `packages/cli/src/ui/hooks/useGeminiStream.test.tsx` (10 tagging assertions) |

### 3.2 D2 – Legacy non-interactive

| Cell | Test                                                                                         | Location                                                   |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A    | `keeps legacy non-interactive output baseline-identical when Pollux is disabled (D2 Cell A)` | `packages/core/src/core/client.test.ts:1025`               |
| B    | `runs advisor internally on allow and preserves non-interactive stream events (D2 Cell B)`   | `packages/core/src/core/client.test.ts:1062`               |
| C    | `fails open for legacy non-interactive when advisor policy denies (D2 Cell C)`               | `packages/core/src/core/client.test.ts:1122`               |
| D    | `fails open on advisor timeout and keeps non-interactive executor stream stable (D2 Cell D)` | `packages/core/src/core/client.test.ts:1165`               |
| Tag  | D2 default routing propagates `PolluxRuntimeSurface.LEGACY_NON_INTERACTIVE`                  | `packages/core/src/agent/legacy-agent-session.test.ts:208` |

### 3.3 D3 – Interactive agent-session

| Cell | Test                                                                                                   | Location                                                       |
| ---- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| A    | `keeps interactive agent-session output baseline-identical when Pollux is disabled (D3 Cell A)`        | `packages/core/src/core/client.test.ts:1217`                   |
| B    | `runs advisor internally on allow and preserves interactive agent-session stream events (D3 Cell B)`   | `packages/core/src/core/client.test.ts:1254`                   |
| C    | `fails open for interactive agent-session when advisor policy denies (D3 Cell C)`                      | `packages/core/src/core/client.test.ts:1314`                   |
| D    | `fails open on advisor timeout and keeps interactive agent-session executor stream stable (D3 Cell D)` | `packages/core/src/core/client.test.ts:1357`                   |
| Tag  | Adapter propagates `PolluxRuntimeSurface.AGENT_SESSION_INTERACTIVE`                                    | `packages/core/src/agent/legacy-agent-session.test.ts:216,243` |

### 3.4 D4 – Non-interactive agent-session

| Cell | Test                                                                                                       | Location                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A    | `keeps non-interactive agent-session output baseline-identical when Pollux is disabled (D4 Cell A)`        | `packages/core/src/core/client.test.ts:1409`                                    |
| B    | `runs advisor internally on allow and preserves non-interactive agent-session stream events (D4 Cell B)`   | `packages/core/src/core/client.test.ts:1446`                                    |
| C    | `fails open for non-interactive agent-session when advisor policy denies (D4 Cell C)`                      | `packages/core/src/core/client.test.ts:1506`                                    |
| D    | `fails open on advisor timeout and keeps non-interactive agent-session executor stream stable (D4 Cell D)` | `packages/core/src/core/client.test.ts:1549`                                    |
| Tag  | D4 caller tags turns with `PolluxRuntimeSurface.AGENT_SESSION_NON_INTERACTIVE`                             | `packages/cli/src/nonInteractiveCliAgentSession.test.ts` (9 tagging assertions) |

### 3.5 D5 – ACP

| Cell    | Test                                                                                                         | Location                                      |
| ------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| A       | `keeps ACP output baseline-identical when Pollux is disabled (D5 Cell A)`                                    | `packages/core/src/core/client.test.ts:1601`  |
| B       | `runs advisor internally on allow and preserves ACP stream events (D5 Cell B)`                               | `packages/core/src/core/client.test.ts:1638`  |
| C       | `fails open for ACP when advisor policy denies (D5 Cell C)`                                                  | `packages/core/src/core/client.test.ts:1698`  |
| D       | `fails open on advisor timeout and keeps ACP executor stream stable (D5 Cell D)`                             | `packages/core/src/core/client.test.ts:1741`  |
| TG-3    | `invokes runPolluxAdvisorConsultation with ACP surface before chat.sendMessageStream` (no permission prompt) | `packages/cli/src/acp/acpClient.test.ts:2299` |
| TG-8    | `fails open when advisor seam throws and keeps the executor stream stable`                                   | `packages/cli/src/acp/acpClient.test.ts:2334` |
| Guard   | `is a no-op when GeminiClient does not expose runPolluxAdvisorConsultation (defensive guard)`                | `packages/cli/src/acp/acpClient.test.ts:2366` |
| Wrapper | `runPolluxAdvisorConsultation invokes advisor for ACP surface (P2-05 public wrapper)`                        | `packages/core/src/core/client.test.ts:1812`  |

### 3.6 D6 – A2A (deferred, bypass-only)

| Cell     | Test                                                                                                                  | Location                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| BP-06-01 | `tags acceptUserMessage turns with the A2A_DEFERRED runtime surface`                                                  | `packages/a2a-server/src/agent/task.test.ts:511` |
| BP-06-02 | `tags sendCompletedToolsToLlm turns with the A2A_DEFERRED runtime surface`                                            | `packages/a2a-server/src/agent/task.test.ts:533` |
| Negative | `never engages legacy-non-interactive Pollux routing on A2A turns`                                                    | `packages/a2a-server/src/agent/task.test.ts:555` |
| BP-06-03 | `runPolluxAdvisorConsultation is a no-op for unknown runtime surfaces (P2-05 guard)` (covers A2A_DEFERRED seam no-op) | `packages/core/src/core/client.test.ts:1793`     |

### 3.7 Enum invariants (cross-row)

| Invariant                                                                                    | Location                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `PolluxRuntimeSurface` enum exposes exactly the six surfaces above with stable string values | `packages/core/src/pollux/types.test.ts` (8 tests) |

---

## 4) Observable-behavior invariants verified across all rows

For every active row (D1–D5) and every Cell A–D the following invariants are
simultaneously pinned by the tests in section 3:

1. **Stream-event ordering**: the set and order of visible events emitted by
   `GeminiClient.sendMessageStream` / `GeminiChat.sendMessageStream` is
   identical in Cell A (Pollux off) and Cell B (Pollux on, allow). Advisor
   traffic never appears on the visible channel. (P0-01 §4 Invariant I-1.)
2. **Continuation behavior**: when the advisor denies (Cell C) or times out
   (Cell D), the executor stream still completes with the same sequence of
   visible events as Cell A. No surface observes a user-facing error caused by
   Pollux. (P0-01 §4 Invariant I-2, POLLUX_SPEC.md §5 fail-open contract.)
3. **No `GeminiChat` history mutation**: `maybeRunPolluxAdvisorConsultation` is
   forbidden from touching chat history. The Cell B advisor-allow tests on every
   surface assert that `GeminiChat.recordHistory` / equivalent is not called by
   the advisor seam. (P0-01 §4 Invariant I-3.)
4. **Policy routing**: every advisor call goes through `PolicyEngine.check` with
   action `advisor_consultation`. Cells A and D6 assert zero policy checks;
   Cells B/C/D assert exactly one policy check per advisor attempt. (P0-02
   §2.1.)
5. **No redundant permission prompts on ACP**: D5 Cell B and the ACP integration
   tests explicitly assert that `connection.requestPermission` is not invoked on
   the advisor-only path. TG-3 / TG-8 are satisfied by the `acpClient.test.ts`
   block.
6. **Role tag on advisor traffic**: every Cell B test asserts that the advisor
   call goes out with `LlmRole.UTILITY_ADVISOR`, keeping advisor traffic
   separable from conversation traffic in telemetry. (P1-05, TG-4 prep.)
7. **Budget and max-call safeguards**: the seam exits before any visible-stream
   work when the per-turn budget is exhausted (Cell D timeout path and budget
   tests). The surface-agnostic test `packages/core/src/core/client.test.ts`
   `describe('maybeRunPolluxAdvisorConsultation')` block covers this (P1-07,
   TG-3/TG-6).
8. **D6 explicit bypass**: the seam allow-list in
   `GeminiClient#maybeRunPolluxAdvisorConsultation` contains exactly
   `{LEGACY_INTERACTIVE, LEGACY_NON_INTERACTIVE, AGENT_SESSION_INTERACTIVE, AGENT_SESSION_NON_INTERACTIVE, ACP}`.
   `A2A_DEFERRED` is absent by design and the BP-06 tests (section 3.6) pin this
   at both the call-site and seam levels.

---

## 5) Consolidated test-run evidence

All four Pollux-scoped test surfaces were executed in isolation on the same HEAD
commit (`d71a823b2`) on 2026-04-18. Summary:

| Workspace                                   | Test files                                                                                                        | Tests passed | Skipped |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ | ------- |
| `@google/gemini-cli-core`                   | `src/core/client.test.ts`, `src/agent/legacy-agent-session.test.ts`, `src/pollux/types.test.ts`                   | 147          | 1       |
| `@google/gemini-cli-a2a-server`             | `src/agent/task.test.ts`                                                                                          | 13           | 0       |
| `@google/gemini-cli`                        | `src/acp/acpClient.test.ts`, `src/nonInteractiveCliAgentSession.test.ts`, `src/ui/hooks/useGeminiStream.test.tsx` | 193          | 0       |
| **Total (Pollux-scoped cross-surface run)** |                                                                                                                   | **353**      | **1**   |

Commands executed (each in its respective workspace):

1. `npx vitest run src/core/client.test.ts src/agent/legacy-agent-session.test.ts src/pollux/types.test.ts`
   in `packages/core` → 3 files / 147 passed / 1 skipped.
2. `npx vitest run src/agent/task.test.ts` in `packages/a2a-server` → 1 file /
   13 passed.
3. `npx vitest run src/acp/acpClient.test.ts src/nonInteractiveCliAgentSession.test.ts src/ui/hooks/useGeminiStream.test.tsx`
   in `packages/cli` → 3 files / 193 passed.

The single skipped test in `client.test.ts` is an unrelated long-running
integration scenario marked `.skip` before P2; it is not part of the Pollux
matrix and is excluded from the TG-6 sign-off by design.

Per-surface historical commit evidence (see IMPLEMENTATION_PLAN.md Phase 2
evidence log for full output):

1. `df68732cf` – P2-01 D1 integration + matrix tests.
2. `97a67416f` – P2-02 D2 integration + matrix tests.
3. `54af0a45a` – P2-03 D3 integration + matrix tests.
4. `7abf26911` – P2-04 D4 integration + matrix tests.
5. `32b89cbe6` – P2-05 D5 ACP advisor seam + permission-safe tests.
6. `d71a823b2` – P2-06 D6 A2A deferred bypass + BP-06 assertions.

---

## 6) Test-gate sign-off

| Gate  | Description                                                | Evidence                                                                                                                                          |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| TG-2  | Cross-surface behavior parity (legacy, agent-session, ACP) | Section 3.1–3.5 Cell A–D rows, all green at commit `d71a823b2`. Bypass row 3.6 closes D6. Observable invariants section 4 pinned across all rows. |
| TG-3  | Advisor policy path avoids double prompt                   | D5 ACP tests `acpClient.test.ts:2299, 2334, 2366` + section 4 invariant 5. Non-interactive surfaces have no confirmation channel by construction. |
| TG-6  | Pollux-specific integration tests exist and are green      | Section 5 consolidated run: 353/354 Pollux-scoped tests green (1 unrelated pre-existing skip). Per-file references in sections 3.1–3.7.           |
| TG-8  | ACP advisor flow regression test                           | `acpClient.test.ts` `Pollux ACP advisor seam (P2-05)` block (3 tests) + D5 Cell A–D in `client.test.ts`.                                          |
| TG-10 | Doc/spec drift check for Pollux files (A2A deferred scope) | `docs/core/pollux/P2-06_A2A_DEFERRED_BYPASS.md`, BP-06 tests in `task.test.ts`, seam allow-list audit in section 4 invariant 8.                   |

TG-1, TG-4, TG-5, TG-7, TG-9 are owned by later phases and are intentionally out
of scope for this artifact.

---

## 7) Phase 2 exit checklist

Phase 2 exit criteria from IMPLEMENTATION_PLAN.md §4 are closed by this report:

1. [x] TG-2 green (section 6, rows D1–D5 × cells A–D).
2. [x] TG-3 green (section 6, ACP no-permission-prompt evidence).
3. [x] TG-6 green (section 5 consolidated run, 353 Pollux-scoped tests pass).
4. [x] TG-8 green (section 6, ACP regression block).
5. [x] No event ordering or continuation regressions in any in-scope surface
       (section 4 invariants 1–2 pinned per row in section 3).
6. [x] D6 remains an explicit bypass with documented reason and assertion tests
       (section 3.6 + P2-06_A2A_DEFERRED_BYPASS.md).

Phase 2 is ready to close. Phase 3 (detector work, P3-01 et seq.) unblocks on
this artifact per the dependency declaration in IMPLEMENTATION_PLAN.md (P3-01
depends on P2-07).

---

## 8) Reproducing the matrix

Any reviewer can reproduce the full matrix run locally by executing the three
commands in section 5 from a clean checkout at HEAD. Each command is scoped so
that unrelated flaky or long-running suites (for example
`shellBackgroundTools.integration.test.ts`) do not gate Pollux sign-off.

If a future change to the advisor seam or to any surface caller breaks a cell,
the failure will surface in exactly one of the files referenced in sections
3.1–3.7, making the regression directly attributable to a row/cell in this
matrix.

---

## 9) References

1. IMPLEMENTATION_PLAN.md §4 (Phase 2 task table and exit criteria), §6
   (mandatory test gates TG-1..TG-10).
2. POLLUX_SPEC.md §3 (runtime reality and coverage matrix), §5 (fail-open
   contract).
3. docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md (driver rows D1–D6,
   invariants I-1..I-3, BP-01..BP-06 blueprints).
4. docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md (advisor_consultation policy
   routing, ACP no-permission-prompt contract).
5. docs/core/pollux/PHASE2_GUARDRAILS.md (one-surface-per-PR, fail-open,
   per-surface seam wrapper, matrix test requirement).
6. docs/core/pollux/P2-06_A2A_DEFERRED_BYPASS.md (D6 bypass contract and
   reactivation preconditions).
7. packages/core/src/pollux/types.ts (`PolluxRuntimeSurface` canonical enum).
8. packages/core/src/core/client.ts (`maybeRunPolluxAdvisorConsultation` seam
   and `runPolluxAdvisorConsultation` public wrapper).
9. packages/core/src/core/client.test.ts (D1–D5 Cell A–D matrix tests and
   A2A_DEFERRED seam no-op guard).
10. packages/cli/src/acp/acpClient.test.ts (ACP advisor-seam regression tests).
11. packages/a2a-server/src/agent/task.test.ts (BP-06 A2A deferred assertions).
12. packages/core/src/pollux/types.test.ts (enum invariants).
