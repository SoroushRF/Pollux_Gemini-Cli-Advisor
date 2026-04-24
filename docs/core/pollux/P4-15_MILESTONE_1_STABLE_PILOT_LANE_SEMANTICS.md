# P4-15 Milestone 1: Stable Pilot Lane Semantics

## Purpose

This document is the continuation handoff for Milestone 1 of the Pollux
real-model benchmark program.

Milestone 1 goal:

- make the live pilot benchmark lane interpretable before expanding the corpus
- separate ordinary task-quality evidence from stress behavior and Pollux canary
  behavior
- stop advisor-path failures from being mislabeled as parse errors

This is an internal pilot-semantics milestone, not a publication milestone.

## Current Snapshot

- Repo: `C:\Users\sorou\OneDrive\Desktop\Pollux`
- Branch used for the milestone commit: `main`
- Milestone 1 commit: `2675f9c17`
- Commit message: `feat(pollux): add stable pilot lane semantics`

The implementation was committed and pushed, but the worktree still contains
other unrelated modified files outside this milestone. Those were intentionally
left out of the Milestone 1 commit.

## What Milestone 1 Changed

### 1. Benchmark lanes are explicit now

Real benchmark tasks now carry:

- `benchmarkLane: 'core' | 'stress' | 'canary'`

Primary file:

- [realTypes.ts](C:/Users/sorou/OneDrive/Desktop/Pollux/packages/core/src/pollux/benchmark/realTypes.ts)

Task mapping source:

- [realTasks.ts](C:/Users/sorou/OneDrive/Desktop/Pollux/packages/core/src/pollux/benchmark/realTasks.ts)

Milestone 1 sentinel mapping:

- `CAL-BM-01-SIMPLE` -> `core`
- `CAL-BM-02-MODERATE` -> `core`
- `CAL-BM-03-COMPLEX` -> `stress`
- `CAL-BM-04-ESCALATING` -> `canary`
- `PILOT-BM-05-STATUS-WRITE` -> `canary`
- `PILOT-BM-06-YAML-TRANSFORM` -> `core`

Default rule for the rest of the real corpus:

- `escalationSignalClass === 'self_report'` -> `canary`
- otherwise -> `core`

### 2. Raw run records now encode the milestone semantics

Per-run records now persist:

- `benchmarkLane`
- `desiredOutcomeSatisfied`
- `desiredOutcomeReasonCode`
- `advisorConsultOutcome`
- `advisorFailureKind`

Primary files:

- [pollux-live-run-rig.ts](C:/Users/sorou/OneDrive/Desktop/Pollux/packages/test-utils/src/pollux-live-run-rig.ts)
- [pollux-real-types.ts](C:/Users/sorou/OneDrive/Desktop/Pollux/packages/test-utils/src/pollux-real-types.ts)

### 3. Summary/report output is grouped by lane

Campaign summaries now include:

- `laneConditionSummaries`
- `canaryConsultSummary`
- `stressSummary`

Markdown reports now include separate sections for:

- `Core lane`
- `Stress lane`
- `Canary lane`

Per-sample diagnostics now show:

- lane
- desired outcome satisfied / reason
- consult outcome
- advisor failure kind

Primary file:

- [pollux-real-report.ts](C:/Users/sorou/OneDrive/Desktop/Pollux/packages/test-utils/src/pollux-real-report.ts)

### 4. Advisor fail-open attribution is more truthful

The advisor-path failure classifier was hardened so that:

- malformed advisor output -> `parse_error`
- abort / timeout-like failures -> `timeout`
- retryable capacity / rate-limit-like failures -> `capacity_exhausted`
- quota-like failures -> `quota_exhausted`

Primary file:

- [client.ts](C:/Users/sorou/OneDrive/Desktop/Pollux/packages/core/src/core/client.ts)

This matters because earlier live runs showed:

- canary consult failures getting collapsed into `parse_error`
- capacity failures and abort-like failures becoming hard to distinguish

## Desired Outcome Rules

Milestone 1 semantics are:

- `core`: satisfied iff the run is valid and `oraclePass === true`
- `stress`: satisfied iff the run is valid and `oraclePass === true`
- `canary`: satisfied iff the run is valid, `oraclePass === true`, expected
  escalation matches predicted escalation, and the consult did not end as
  `fail_open` or `budget_exhausted`

Important interpretation rule:

- a canary can still pass its file/task oracle while failing its benchmark
  intent
- a stress invalidation is not a core-lane regression

## Tests Added / Verified

Core tests:

- `npm.cmd run test -w @google/gemini-cli-core -- src/pollux/benchmark/realTasks.test.ts src/core/client.test.ts`

Test-utils report tests:

- `npm.cmd run test:ci -w @google/gemini-cli-test-utils -- src/pollux-real-report.test.ts`

Verified in this milestone:

- sentinel lane mapping
- self-report defaulting to `canary`
- non-self-report defaulting to `core`
- lane summaries render and compute correctly
- canary fail-open runs are unsatisfied even when task oracle passes
- stress invalidation is surfaced in stress summaries
- malformed advisor output classifies as `parse_error`
- wrapped abort-like failures classify as `timeout`
- capacity-limited advisor failures classify as `capacity_exhausted`

## Known Open Problems

### 1. Milestone 1 improves semantics, not advisor reliability

Milestone 1 does not make the advisor path more available. It makes failures
easier to interpret.

If the advisor model times out, aborts, or hits capacity limits, the canary lane
should now report that more honestly, but the underlying live dependency can
still fail.

### 2. `CAL-BM-03-COMPLEX` is still stressy by design

This task is intentionally the current stress task. If it invalidates with
response-ceiling behavior, that is now supposed to show up as stress-lane
instability rather than muddying the core-lane story.

### 3. Publication blockers still exist outside Milestone 1

Milestone 1 did not solve:

- broader docs synchronization
- full methodology/publishability cleanup
- every preflight / operator workflow detail
- repeated full-suite stability proof

## Recommended Next Steps

### Immediate next benchmark action

Run the full suite again and inspect whether the report now says the right
thing:

- `CAL-BM-03` should read as stress instability if it invalidates
- `CAL-BM-04` and `PILOT-BM-05` should read as canary unsatisfied if consult
  fail-opens
- core lane should stay readable without mentally subtracting canary weirdness

### Next engineering milestone

Milestone 2 should focus on canary consult reliability, not lane semantics.

Recommended Milestone 2 themes:

- make advisor consultation complete successfully more often on
  expected-positive canaries
- tighten advisor failure telemetry consistency end-to-end
- reduce external-model ambiguity in canary interpretation
- add an acceptance rerun protocol for repeated full-suite pilot runs

### Before adding more benchmarks

Do not expand the corpus until the current grouped suite is easy to explain in
one sentence per failure class:

- core failure
- stress instability
- canary fail-open
- invalidation due external model/runtime issues

## Suggested Rerun Commands

Focused report regression check:

```powershell
npm.cmd run test -w @google/gemini-cli-core -- src/pollux/benchmark/realTasks.test.ts src/core/client.test.ts
npm.cmd run test:ci -w @google/gemini-cli-test-utils -- src/pollux-real-report.test.ts
```

Full pilot rerun:

```powershell
npm.cmd run test:benchmark-full -w @google/gemini-cli-test-utils
```

Real pilot lane rerun:

```powershell
npm.cmd run benchmark:pollux:real:preflight -- --campaign-id <campaign>
```

Then run the relevant real benchmark command/campaign you are using locally and
inspect the generated `summary.json` and `report.md`.

## Resume Prompt For A New Chat

Use something close to this:

> Continue Pollux benchmark work from Milestone 1. Read
> `docs/core/pollux/P4-15_MILESTONE_1_STABLE_PILOT_LANE_SEMANTICS.md`, inspect
> the latest real benchmark artifacts, and help me evaluate whether the new
> core/stress/canary reporting semantics are working and what Milestone 2 should
> be.
