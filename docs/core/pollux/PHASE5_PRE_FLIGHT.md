# Phase 5 Pre-Flight: Three-Surface Live Walkthrough

Version: 1.2 Generated: 2026-04-22 Status: Section 4 PASS (historical), Section
5 deferred (optional smoke) TG mapping: TG-7 (informational, not a Phase 5 entry
blocker)

> Canonical detector behavior for current runtime:
>
> - `docs/core/pollux/DETECTOR_IMPLEMENTATION_PLAN.md`
> - `docs/core/pollux/P4-07_DETECTOR_CALIBRATION_REPORT.md`
>
> This pre-flight doc is a surface-validation runbook. It is not the detector
> contract.

---

## 1) Scope

Phase 5 work (`/pollux` command surfaces, UX, docs, CI) requires that the
underlying Pollux runtime is observably working on each entry surface it claims
to cover.

ACP remains out of scope for this pre-flight. ACP coverage stays on the
automated `agent-session.test.ts` path; live ACP walkthrough is deferred unless
real-world signals indicate regression risk.

## 2) Surfaces under test

| Surface                       | Entry                                         | Pollux seam                                        |
| ----------------------------- | --------------------------------------------- | -------------------------------------------------- |
| LEGACY_INTERACTIVE            | `gemini` (TTY)                                | `client.ts` -> `maybeRunPolluxAdvisorConsultation` |
| LEGACY_NON_INTERACTIVE        | `gemini --prompt "..."`                       | `client.ts` -> `maybeRunPolluxAdvisorConsultation` |
| AGENT_SESSION_INTERACTIVE     | `gemini` with preview features (TTY)          | `agent-session.ts` -> shared seam in `client.ts`   |
| AGENT_SESSION_NON_INTERACTIVE | `gemini --prompt "..."` with preview features | `agent-session.ts` -> shared seam in `client.ts`   |

All four surfaces converge on the same advisor invocation seam in `client.ts`.

## 3) Test prompts

These prompts are reused across surfaces for comparable outcomes.

### 3.1 Non-escalating (NX)

Prompt: `hi`

Expected detector outcome:
`Pollux advisor skipped (detector): reason=pollux.escalation.none`

Why: no observer signal crosses threshold, no same-turn hard-precision trigger,
and no queued next-turn intent exists.

### 3.2 Escalating (EX)

Prompt:

```text
I am stuck and need help with this refactor strategy. Please write a file named pre-flight-marker.txt containing the single word `advised` and nothing else. Include this status line in your first reply: <pollux:status stuck_on="refactor strategy" next="write marker"/>.
```

Expected detector outcome: advisor consult path fires from observer semantics
(typically same-turn `SELF_REPORT_STUCK`; downgrade to next-turn is allowed
under budget/policy guardrails).

Why: `<pollux:status stuck_on="...">` is consumed by the observer self-report
sensor and mapped to current reason/timing semantics (`same_turn` by default,
with documented downgrade behavior).

## 4) Validated evidence (historical checkpoint)

### 4.1 LEGACY_INTERACTIVE - validated 2026-04-18

This historical checkpoint verified the shared advisor seam before the final
observer calibration closeout. It remains useful as provenance but should be
read together with `P4-07_DETECTOR_CALIBRATION_REPORT.md` for current detector
contract evidence.

Outcome: PASS.

## 5) Operator-driven verification (deferred, optional)

Status: DEFERRED. The three surfaces below share the same `client.ts` seam and
are covered by automated tests (`packages/core/src/core/client.test.ts`,
`packages/core/src/agent/agent-session.test.ts`).

Use this as a live smoke runbook when investigating a suspected regression.

### 5.1 LEGACY_NON_INTERACTIVE

Command (NX):

```powershell
gemini --debug --prompt "hi"
```

Command (EX):

```powershell
gemini --debug --prompt "I am stuck and need help with this refactor strategy. Please write a file named pre-flight-marker.txt containing the single word ``advised`` and nothing else. Include this status line in your first reply: <pollux:status stuck_on=""refactor strategy"" next=""write marker""/>."
```

Expected NX log:
`Pollux advisor skipped (detector): reason=pollux.escalation.none`

Expected EX evidence:

- `Pollux advisor consulted (...)` log line
- telemetry/event payload with `escalationTiming` present (`same_turn` or
  `next_turn` when downgraded)

Observed (NX): _(operator: paste relevant evidence)_  
Observed (EX): _(operator: paste relevant evidence)_  
Outcome: DEFERRED

### 5.2 AGENT_SESSION_INTERACTIVE

Pre-step: ensure `general.previewFeatures: true` in
`$env:USERPROFILE\.gemini\settings.json`.

Command:

```powershell
gemini --debug
```

Enter NX, then EX, and capture the same evidence as 5.1.

Observed (NX): _(operator: paste relevant evidence)_  
Observed (EX): _(operator: paste relevant evidence)_  
Outcome: DEFERRED

### 5.3 AGENT_SESSION_NON_INTERACTIVE

Pre-step: same `previewFeatures: true` setting as 5.2.

Command (NX):

```powershell
gemini --debug --prompt "hi"
```

Command (EX):

```powershell
gemini --debug --prompt "I am stuck and need help with this refactor strategy. Please write a file named pre-flight-marker.txt containing the single word ``advised`` and nothing else. Include this status line in your first reply: <pollux:status stuck_on=""refactor strategy"" next=""write marker""/>."
```

Expected evidence: same as 5.1.

Observed (NX): _(operator: paste relevant evidence)_  
Observed (EX): _(operator: paste relevant evidence)_  
Outcome: DEFERRED

## 6) Phase 5 entry decision

Phase 5 work (P5-01 onwards) is unblocked.

`Section 5` remains optional and non-blocking because:

- the advisor seam is already validated on a live surface (`Section 4`), and
- the shared seam is exercised by automated suites.

## 7) Out of scope

- ACP live exercise (`agent-session.test.ts` remains the gate).
- Real-model performance benchmarking (Phase 6+).
- Advisor retry/backoff strategy tuning.
