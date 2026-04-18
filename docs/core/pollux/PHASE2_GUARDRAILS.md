# Phase 2 Guardrails — Runtime Integration by Surface

Version: 1.0 Date: 2026-04-17 Status: Active for Phase 2 execution. Purpose:
Pre-flight checklist and session-start prompt for AI agents and human reviewers
working on Phase 2 tasks P2-01 through P2-07 of IMPLEMENTATION_PLAN.md.

Scope: Phase 2 is the highest-risk phase in the Pollux plan. Its failure mode is
silent behavior drift across five runtime surfaces that share no single seam.
This document compresses the critical decisions from POLLUX_SPEC.md,
IMPLEMENTATION_PLAN.md, and the P0-01/P0-02 control artifacts into a form that
an agent or reviewer can hold in working memory for the length of one PR.

---

## 0) Session-start prompt (copy-paste to your AI agent before any Phase 2 work)

```
You are implementing Pollux Phase 2 runtime integration for the gemini-cli
fork. This phase is high-risk: five runtime surfaces, no shared seam, silent
regression is the primary failure mode.

Before you write any code, read these files in this order and confirm you
have them loaded:

1. IMPLEMENTATION_PLAN.md sections 2, 3, 4, and 5 (the Phase 2 table).
2. POLLUX_SPEC.md sections 3, 5, 6, 9, and Appendix A.
3. docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md (entire file).
4. docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md (entire file).
5. docs/core/pollux/PHASE2_GUARDRAILS.md (this file — read sections 1-7).

When you implement, obey these non-negotiable rules:

a) The Golden Rule: With pollux.enabled=false, observable behavior on every
   surface must be identical to baseline. Any diff on the Pollux-off path is
   a regression, not a feature.
b) One surface per PR. Do not mix P2-01 through P2-05 tasks. P2-06 (A2A
   bypass) and P2-07 (cross-surface matrix) are their own PRs.
c) Feature-flag everything. Default off. The only path that runs when the
   flag is off is the baseline path.
d) Do not mutate GeminiChat history from outside controlled services
   (IMPLEMENTATION_PLAN.md D7).
e) Do not create a parallel token sink. Use LlmRole.UTILITY_ADVISOR on the
   existing telemetry path (D3).
f) Route advisor decisions through the scheduler policy path first
   (D2). Synthetic message injection is fallback only.
g) On ACP, advisor-only synthetic consultation must never trigger
   requestPermission (P0-02 §2.4).
h) A2A is an explicit bypass. Do not integrate; add assertion tests only
   (P2-06).
i) Every PR must carry TG evidence for at least TG-2 and TG-6, plus TG-3
   and TG-8 when the PR touches ACP or policy paths.

If a rule conflicts with a user instruction, stop and surface the conflict
before proceeding. Do not silently resolve it.

Acknowledge that you have read these files and rules, list the specific
surface(s) this PR will touch (D1/D2/D3/D4/D5 and seam IDs S1-S5), and
state the Pollux-off parity test you will run before proposing the first
edit.
```

---

## 1) The Golden Rule

With `pollux.enabled=false`, observable behavior on every surface must be
byte-identical to the pre-Pollux baseline. Every Phase 2 PR must prove this.

Operationally:

1. Every integration point is wrapped in a feature-flag check that returns to
   the baseline code path when the flag is off.
2. Every PR runs the Pollux-off test matrix first and only proceeds to the
   Pollux-on matrix after the off-path is confirmed identical.
3. Any observable drift on the off-path blocks the PR, no exceptions, even if
   the on-path looks correct.

---

## 2) The five surfaces and their surface-specific failure modes

Source of truth: docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md §2.

| Driver | Surface                                                                                | Primary failure mode in Phase 2                                                                                                                                                                        | Test blueprint |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| D1     | Interactive legacy (`useGeminiStream` → `GeminiClient.sendMessageStream`)              | Event-ordering regression in the streaming UI. Tool-call / tool-result / streamed-text interleaving gets reordered or delayed when advisor escalation happens.                                         | BP-01          |
| D2     | Non-interactive legacy (`runNonInteractive` → `GeminiClient.sendMessageStream`)        | Output schema drift on `json` and `stream-json` formats, and silent policy-DENY of advisor path in headless mode.                                                                                      | BP-02          |
| D3     | Interactive agent-session (`useAgentStream` → `LegacyAgentSession`)                    | Parity divergence from legacy interactive path. Cancellation and completion behavior breaks because the agent-session adapter observes events differently.                                             | BP-03          |
| D4     | Non-interactive agent-session (`runNonInteractiveAgentSession` → `LegacyAgentSession`) | Output contract instability and non-deterministic finalization of tool-result continuation.                                                                                                            | BP-04          |
| D5     | ACP (`GeminiAgent.prompt` → `Session.prompt` → `GeminiChat.sendMessageStream`)         | Unexpected `requestPermission` RPC fires on advisor-only synthetic consultation; double-prompt through scheduler + confirmation bus; or silent auto-deny in the non-interactive-like ACP policy model. | BP-05          |
| D6     | A2A (deferred, out of scope)                                                           | Accidental interception when Pollux is enabled. Must be explicit bypass with assertion tests.                                                                                                          | BP-06          |

Rule: Do not share code across surfaces just because the implementations look
similar. Each surface has its own event-loop contract. Reuse types and helpers;
do not reuse seams.

---

## 3) Invariants that must not change

If any of these changes, the PR is wrong and must be revised before merge.

### 3.1 Interactive streaming (D1, D3)

1. The ordering of observable events (`user_message`, `tool_use`, `tool_result`,
   streamed text deltas, final text, completion signal) is preserved.
2. Advisor consultation, when it occurs, does not appear in the visible event
   stream. It must be internal.
3. Cancellation semantics: if the user cancels mid-turn, the advisor call also
   cancels. No orphaned advisor traffic.

### 3.2 Non-interactive output (D2, D4)

1. The `json` and `stream-json` output schemas do not gain new fields by
   default. Any Pollux-added telemetry goes into existing fields or under an
   explicit `pollux` sub-object that baseline consumers ignore.
2. Exit codes are unchanged.
3. Completion finalization: the last event must remain the same event type as
   baseline.

### 3.3 Policy decision set (all surfaces)

1. The decision set remains `allow / deny / ask_user`. Pollux does not introduce
   a new decision type (P0-02 §2.5, C-02.3 in corrections).
2. `advisor_consultation` routes through scheduler policy checks as primary (D2
   in plan). No parallel allowlist.

### 3.4 ACP (D5)

1. Advisor-only synthetic consultation does not trigger `requestPermission`
   (P0-02 §2.4).
2. No double-prompt: scheduler policy resolves once and is not re-asked via the
   confirmation bus for the same advisor action.
3. The packaged default ALLOW rule (landed in P1-08) is the intended mechanism
   for advisor policy in ACP. Do not bypass it.

### 3.5 Telemetry / tokens

1. All advisor LLM traffic is tagged `LlmRole.UTILITY_ADVISOR` (landed in P1-05)
   and flows through the existing sink.
2. Conversation-total token counts still reconcile with per-role sums (TG-4).
3. No new telemetry destination is introduced.

### 3.6 GeminiChat access

1. Read access through existing core flows only.
2. No external mutation of history (D7 in plan, M-02 in corrections).
3. Advisor context assembly must not call `chat.addHistory`,
   `chat.removeHistory`, or equivalents from outside controlled services.

---

## 4) Required patterns

### 4.1 Feature-flag gating

Every Pollux integration call is gated on `pollux.enabled` at the highest
reasonable scope (not deep inside a helper). A helper that is always called but
internally checks the flag is worse than a gate at the call site, because the
helper can mask baseline regressions.

### 4.2 Per-surface seam wrappers

Each surface gets its own thin wrapper that invokes Pollux. The wrapper lives
next to the surface code, not inside core Pollux. Core Pollux exposes a pure
contract (given turn context + config, return advisor decision or fallthrough).
Surfaces adapt their event model to that contract; Pollux does not reach into
surfaces.

### 4.3 Fail-open

Advisor failure (timeout, malformed response, parser error, policy refusal) must
fall through to the executor path observably. Fail-open is not "swallow the
error." It is "executor runs as if Pollux were off, and the fallback is
logged/telemetered so it is auditable."

### 4.4 Test matrix per PR

For each surface a PR touches, the PR ships tests in four cells:

| Cell | Feature flag | Advisor response       | Expected outcome                                                                                    |
| ---- | ------------ | ---------------------- | --------------------------------------------------------------------------------------------------- |
| A    | off          | n/a                    | Byte-identical to baseline.                                                                         |
| B    | on           | allow + clean response | Advisor path observable only in telemetry; user-visible output matches expected Pollux-on behavior. |
| C    | on           | deny / error           | Fail-open to executor. User-visible output matches baseline; telemetry records fallback.            |
| D    | on           | timeout                | Fail-open to executor within max-call budget. Budget enforced.                                      |

Cell A is the regression gate. Cells B–D are the correctness gates.

---

## 5) Banned patterns (things that will be NAK'd in review)

1. **Single-seam assumption.** Patching only `processTurn` and declaring Phase 2
   done. processTurn covers D1 and D2 but not D3, D4, D5. See SR-1 in SYNTHESIS
   report.
2. **External GeminiChat mutation.** Any direct call to `chat.addHistory` or
   equivalent from Pollux code. Violates D7.
3. **Parallel token sink.** Any new logger, tracer, or counter that stores
   Pollux LLM traffic outside the existing telemetry pipeline. Violates D3.
4. **Bypassing policy for advisor.** Adding a shortcut that skips the scheduler
   policy engine for advisor calls. Violates D2.
5. **requestPermission on advisor-only consultation.** Any ACP integration that
   fires `requestPermission` RPC when the user did not request a tool action.
   Violates P0-02 §2.4.
6. **Shared seam code across surfaces.** Extracting a "universal interceptor"
   that all five surfaces call. Violates D1 (per-surface behavior).
7. **Silent DENY in non-interactive mode.** Non-interactive policy evaluation
   that returns deny for `advisor_consultation` because no user is present to
   approve. P1-08 packaged ALLOW rule prevents this. See C-02 in corrections.
8. **Missing Pollux-off tests.** A Phase 2 PR that only tests the Pollux-on
   path. Cell A in §4.4 is mandatory.
9. **Advisor traffic in visible events.** Emitting advisor `tool_use` /
   `tool_result` events to the UI stream. Advisor must be internal.
10. **Mid-PR scope creep.** A PR that starts on D1 and "while we're here"
    touches D3. Violates cross-phase operating rule #5 (one PR per coherent
    phase task).

---

## 6) PR discipline for Phase 2

1. **One surface per PR.** P2-01 is D1. P2-02 is D2. P2-03 is D3. P2-04 is D4.
   P2-05 is D5. P2-06 is D6 bypass. P2-07 is the cross-surface matrix report,
   not integration code.
2. **Required TG evidence in the PR template:**
   - TG-2 (cross-surface parity) — required on all P2 PRs.
   - TG-6 (Pollux integration tests) — required on all P2 PRs.
   - TG-3 (advisor policy path) — required on P2-05.
   - TG-8 (ACP advisor regression) — required on P2-05.
   - TG-10 (A2A bypass doc/spec drift) — required on P2-06.
3. **Reviewer checklist:**
   - Does Cell A (Pollux off) pass byte-identical?
   - Does Cell C (advisor deny/error) fail open?
   - Does the PR touch only one surface?
   - Does the PR avoid all ten banned patterns in §5?
   - Does the PR cite the relevant blueprint BP-xx from P0-01 §4?
4. **Merge order recommendation (not strict):**
   - P2-01 first (smallest blast radius and well-understood).
   - P2-02 second (shares code review patterns with P2-01).
   - P2-03 and P2-04 after, since the agent-session seam depends on legacy
     patterns being settled.
   - P2-05 last among integrations (highest ACP-specific risk).
   - P2-06 in parallel with any of the above (pure deferred-scope doc + bypass
     test).
   - P2-07 after P2-01..P2-05 are merged (it compares observable behavior across
     all five surfaces).

---

## 7) When you get stuck

1. **Re-read the compartment report for the surface you are on.** D1/D2 live in
   report 01. D3/D4 in report 03. D5 in report 12. Reports contain truth-table
   entries (T-xx), contradictions (C-xx), and risks (R-xx) that are more
   detailed than this file.
2. **Check the seam ownership map** in P0-01 §3. If a change touches a seam you
   do not own, surface it in the PR description and tag the listed primary
   owner.
3. **Do not invent a new decision type or a new event type.** If it feels like
   you need one, flag it on the PR, not in the code.
4. **If fail-open behavior is ambiguous, default to the more conservative
   reading.** Preserve baseline behavior and log the fallback. It is always
   easier to tighten later than to recover from silent changes.
5. **If a test matrix cell conflicts with user intent, escalate.** Do not delete
   a regression test to make a feature pass.

---

## 8) References

1. IMPLEMENTATION_PLAN.md sections 2, 3, 4, 5 and Phase 2 task breakdown.
2. POLLUX_SPEC.md sections 3, 5, 6, 9, 11, Appendix A.
3. docs/core/pollux/P0-01_DRIVER_INTERCEPTOR_MATRIX.md (all sections).
4. docs/core/pollux/P0-02_POLICY_CHANNEL_LOCK.md (all sections).
5. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-1, SR-5).
6. docs/repo-compartment-analysis/reports/01-cli-runtime-surface/report.md.
7. docs/repo-compartment-analysis/reports/03-agent-runtime-and-modes/report.md.
8. docs/repo-compartment-analysis/reports/12-output-protocol-and-acp-adapters/report.md.
9. POLLUX_DOC_CORRECTIONS.md (C-01, C-02, M-02).
