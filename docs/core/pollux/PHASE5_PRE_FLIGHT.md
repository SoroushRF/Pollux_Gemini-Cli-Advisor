# Phase 5 Pre-Flight: Three-Surface Live Walkthrough

Version: 1.0 Generated: 2026-04-18 Status: Operator-driven live verification TG
mapping: TG-7 (precondition)

---

## 1) Scope

Phase 5 work (`/pollux` command surfaces, UX, docs, CI) requires that the
underlying Pollux runtime is observably working on every entry surface it claims
to cover. Phase 4 closeout verified `LEGACY_INTERACTIVE` end-to-end against a
real model. This document captures the live walkthrough for the three remaining
in-scope surfaces.

ACP is explicitly out of scope for this pre-flight: ACP coverage stays on the
existing `agent-session.test.ts` automated path; live ACP exercise is deferred
to post-Phase-5 if real-world signals indicate a regression risk.

## 2) Surfaces under test

| Surface                       | Entry                                         | Pollux seam                                        |
| ----------------------------- | --------------------------------------------- | -------------------------------------------------- |
| LEGACY_INTERACTIVE            | `gemini` (TTY)                                | `client.ts` -> `maybeRunPolluxAdvisorConsultation` |
| LEGACY_NON_INTERACTIVE        | `gemini --prompt "..."`                       | `client.ts` -> `maybeRunPolluxAdvisorConsultation` |
| AGENT_SESSION_INTERACTIVE     | `gemini` with preview features (TTY)          | `agent-session.ts` -> shared seam in `client.ts`   |
| AGENT_SESSION_NON_INTERACTIVE | `gemini --prompt "..."` with preview features | `agent-session.ts` -> shared seam in `client.ts`   |

All four surfaces share the same advisor-invocation seam in `client.ts`. The
agent-session pair takes a different routing path through `agent-session.ts`
instead of `legacy-agent-session.ts`, so a regression in one wouldn't
necessarily fail in the other - hence both are exercised.

## 3) Test prompts

Both prompts are reused across all surfaces so the comparison is apples to
apples.

### 3.1 Non-escalating (NX)

Prompt: `hi`

Expected detector outcome:
`Pollux advisor skipped (detector): reason=pollux.escalation.none`

Why: `hi` triggers no heuristic rule (none of the regex patterns in
`DEFAULT_HEURISTIC_RULES` match), and contains no `pollux:confidence:N` inline
tag. Hybrid detector returns no escalation.

### 3.2 Escalating (EX)

Prompt:

```
I am stuck and need help with this refactor strategy. <!-- pollux:confidence:9 --> Please write a file named pre-flight-marker.txt containing the single word `advised` and nothing else.
```

Expected detector outcome: `Pollux advisor consulted (confidence=9)`

Why: The structured detector matches the `pollux:confidence:9` tag (>= the
default threshold of 6); the heuristic detector independently fires on `stuck`
(EXPLICIT_BLOCKED, weight 2), `need help` (HELP_REQUEST, weight 1), and
`refactor`/`strategy` (COMPLEXITY, weight 1) for a heuristic score of 4 (>= the
default min of 2). Either subdetector alone would escalate; hybrid escalates on
the union.

## 4) Validated evidence

### 4.1 LEGACY_INTERACTIVE - validated 2026-04-18

Command: `gemini --debug` with
`GEMINI_DEBUG_LOG_FILE=$env:USERPROFILE\.gemini\pollux-debug.log`

NX evidence (verbatim from the live debug log):

```
[2026-04-18T23:01:13.777Z] [LOG] Pollux advisor skipped (detector): reason=pollux.escalation.none strategy=hybrid
```

EX evidence:

```
[2026-04-18T23:07:22.597Z] [LOG] Pollux advisor consulted (confidence=9)
[2026-04-18T23:07:22.598Z] [DEBUG] [Routing] Selected model: gemini-3.1-pro-preview (Source: agent-router/override, Latency: 0ms)
```

Outcome: PASS. The advisor was invoked on the EX prompt and skipped on the NX
prompt. A 429 from `gemini-3.1-pro-preview` followed the advisor call (API
rate-limit, not a code defect). Pollux's fail-open behaviour kept the executor
turn alive after the advisor failure - exactly per `POLLUX_SPEC.md` §4.3.

The 429 also surfaced PRE-5-01: the user's `model.name` was overriding the
Pollux executor model and routing both advisor and executor to the same scarce
`gemini-3.1-pro-preview`. With PRE-5-01 landed, the executor will route to
`gemini-2.5-flash` while the advisor uses `gemini-3.1-pro-preview`, which is the
intended Pollux topology.

## 5) Operator-driven verification (pending)

The three surfaces below require an operator-run live exercise after the
PRE-5-01..PRE-5-03 commits land and the bundle is rebuilt (`npm run build`).
Each subsection lists the exact command, expected log line, pass criteria, and a
placeholder for the captured evidence. Fill in the `Observed` and `Outcome`
lines after running.

### 5.1 LEGACY_NON_INTERACTIVE

Command (NX):

```powershell
gemini --debug --prompt "hi"
```

Command (EX):

```powershell
gemini --debug --prompt "I am stuck and need help with this refactor strategy. <!-- pollux:confidence:9 --> Please write a file named pre-flight-marker.txt containing the single word ``advised`` and nothing else."
```

Expected NX log:
`Pollux advisor skipped (detector): reason=pollux.escalation.none` Expected EX
log: `Pollux advisor consulted (confidence=9)`

Pass criteria: NX surfaces a skip line; EX surfaces an advisor-consulted line.
Either advisor success or fail-open after a 429 is acceptable on EX

- the gate is "did the advisor seam fire", not "did the advisor return a useful
  answer".

Observed (NX): _(operator: paste relevant log line here)_ Observed (EX):
_(operator: paste relevant log line here)_ Outcome: PENDING

### 5.2 AGENT_SESSION_INTERACTIVE

Pre-step: ensure `general.previewFeatures: true` in
`$env:USERPROFILE\.gemini\settings.json` so the agent-session runtime is
selected instead of the legacy runtime.

Command:

```powershell
gemini --debug
```

Then enter the NX prompt at the input, observe the debug drawer (`F12`) or the
file-redirected debug log, then enter the EX prompt and observe again.

Expected NX log:
`Pollux advisor skipped (detector): reason=pollux.escalation.none` Expected EX
log: `Pollux advisor consulted (confidence=9)`

Pass criteria: same as 5.1, and additionally a routing line should show the
executor route hitting the Pollux executor model (`gemini-2.5-flash` by default,
after PRE-5-01) rather than the `model.name` value.

Observed (NX): _(operator: paste relevant log line here)_ Observed (EX):
_(operator: paste relevant log line here)_ Outcome: PENDING

### 5.3 AGENT_SESSION_NON_INTERACTIVE

Pre-step: same `previewFeatures: true` setting as 5.2.

Command (NX):

```powershell
gemini --debug --prompt "hi"
```

Command (EX):

```powershell
gemini --debug --prompt "I am stuck and need help with this refactor strategy. <!-- pollux:confidence:9 --> Please write a file named pre-flight-marker.txt containing the single word ``advised`` and nothing else."
```

Expected NX log:
`Pollux advisor skipped (detector): reason=pollux.escalation.none` Expected EX
log: `Pollux advisor consulted (confidence=9)`

Pass criteria: same as 5.1.

Observed (NX): _(operator: paste relevant log line here)_ Observed (EX):
_(operator: paste relevant log line here)_ Outcome: PENDING

## 6) Phase 5 entry decision

Phase 5 work (P5-01 onwards) is unblocked when:

- All three sections in §5 report `Outcome: PASS`.
- The PRE-5-01 fix is built into the bundle that the operator is exercising
  (verifiable by checking that the executor route in §5.2's EX log is the Pollux
  executor model, not the global `model.name`).

If any surface fails, the regression is a blocker for `/pollux` command work
because the command surface registration assumes the underlying runtime seam is
present and observable on all four surfaces.

## 7) Out of scope

- ACP live exercise. Covered by `packages/core/src/agent/agent-session.test.ts`.
- Real-model accuracy benchmarking. Deferred to Phase 6 per
  `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`.
- Advisor retry / backoff on 429. Filed as a Phase 6 polishing candidate.
