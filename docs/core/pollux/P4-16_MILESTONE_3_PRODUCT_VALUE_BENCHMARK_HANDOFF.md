# P4-16 Milestone 3: Product-Value Benchmark Handoff

Version: 1.1 Date: 2026-04-26 Status: Handoff for the next benchmark milestone

## Purpose

This document redirects Pollux benchmark work from Milestone 2 reliability proof
toward Milestone 3 product-value proof.

Milestone 3 goal:

- prove that the Pollux advisor strategy can improve hard-task outcomes over a
  weak executor baseline
- do so with cost and latency materially below running the strong model
  end-to-end
- make that claim with benchmark evidence that is hard to overfit, easy to
  explain, and aligned with the Pollux project vision

This is not a replacement for the main spec or methodology docs. It is a
benchmark-design handoff that synthesizes:

1. the benchmark handoff status after Milestone 2
2. the Milestone 1 pilot-semantics handoff
3. the Pollux doctrine, methodology, measurement spec, and master spec
4. the latest five-campaign acceptance artifacts
5. the current product requirement stated in the project thread: Pollux should
   eventually show Anthropic-style advisor-strategy trends, where a cheap
   executor plus a stronger advisor outperforms the cheap executor alone while
   remaining much closer to executor cost than full strong-model execution

---

## 1) Executive Summary

The current Pollux benchmark foundation is good enough to measure product value,
but the current sentinel suite is not good enough to demonstrate it.

What M1/M2 proved:

1. the real CLI benchmark runner works
2. core / stress / canary semantics are now interpretable
3. advisor-attempt telemetry, repair/fallback accounting, repeat-sliced
   artifacts, and acceptance aggregation exist
4. the canary detector can fire on the intended pilot canaries with clean
   precision/recall when the environment is healthy

What the latest live results also proved:

1. the current sentinel suite is too easy for the weak executor baseline
2. Pollux adds token, latency, and cost overhead on those tasks
3. therefore the current suite mostly measures advisor overhead and consultation
   reliability, not advisor value

Milestone 3 should therefore be the first milestone whose benchmark question is:

> Does Pollux create measurable outcome uplift on calibrated hard tasks, while
> preserving an attractive cost/performance tradeoff relative to executor-only
> and strong-model-only baselines?

---

## 2) Relevant Source Documents

Primary handoff lineage:

1. [P4-14_BENCHMARK_HANDOFF_STATUS.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-14_BENCHMARK_HANDOFF_STATUS.md)
2. [P4-15_MILESTONE_1_STABLE_PILOT_LANE_SEMANTICS.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-15_MILESTONE_1_STABLE_PILOT_LANE_SEMANTICS.md)

Primary benchmark doctrine and measurement references:

1. [P4-08_REAL_BENCHMARK_DOCTRINE.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-08_REAL_BENCHMARK_DOCTRINE.md)
2. [P4-05_REAL_BENCHMARK_METHODOLOGY.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-05_REAL_BENCHMARK_METHODOLOGY.md)
3. [P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md)
4. [P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md)

Primary project-vision references:

1. [POLLUX_SPEC.md](C:\Users\sorou\OneDrive\Desktop\Pollux\POLLUX_SPEC.md)
2. [IMPLEMENTATION_PLAN.md](C:\Users\sorou\OneDrive\Desktop\Pollux\IMPLEMENTATION_PLAN.md)

Primary task/oracle references:

1. [P4-01_BENCHMARK_CORPUS_ORACLE.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-01_BENCHMARK_CORPUS_ORACLE.md)
2. [realTasks.ts](C:\Users\sorou\OneDrive\Desktop\Pollux\packages\core\src\pollux\benchmark\realTasks.ts)

Latest acceptance artifacts referenced in this handoff:

1. [aggregate-report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\aggregate-report.md)
2. [aggregate-summary.json](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\aggregate-summary.json)
3. [m2-acceptance-001-c01/report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\campaigns\m2-acceptance-001-c01\report.md)
4. [m2-acceptance-001-c02/report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\campaigns\m2-acceptance-001-c02\report.md)

---

## 3) Pollux Vision That M3 Must Match

The Pollux master spec already states the project objective clearly:

- Pollux adds an adaptive advisor path so a fast executor can escalate selected
  decisions to a stronger advisor model
- the objective is to improve hard-task success without paying full
  premium-model cost for every turn

See:

1. [POLLUX_SPEC.md](C:\Users\sorou\OneDrive\Desktop\Pollux\POLLUX_SPEC.md)
   section `1) Purpose`
2. [POLLUX_SPEC.md](C:\Users\sorou\OneDrive\Desktop\Pollux\POLLUX_SPEC.md)
   section `2) Goals and non-goals`

The implementation plan reinforces the same direction:

- benchmark baselines must suppress hidden utility LLM calls
- token accounting must extend the existing sink
- real executor-vs-advisor quality claims remain out of scope until the
  benchmark protocol is satisfied

See:

1. [IMPLEMENTATION_PLAN.md](C:\Users\sorou\OneDrive\Desktop\Pollux\IMPLEMENTATION_PLAN.md)
   sections `1) Why this revision exists`, `D3`, `D5`, and the Phase 4 / Phase 5
   benchmark notes

The current project-thread requirement sharpens that into an external product
shape:

- Pollux should eventually demonstrate advisor-strategy trends similar to the
  Claude advisor-tool framing
- weak executor only: cheapest, but weaker on hard tasks
- strong model only: strongest, but expensive
- weak executor + stronger advisor: meaningfully better than weak executor, but
  still materially cheaper than strong-model-only

Milestone 3 should be the first benchmark milestone explicitly organized around
that product-value claim.

---

## 4) What M1 and M2 Established

### Milestone 1

Milestone 1 made the live pilot lane interpretable:

1. tasks are grouped into `core`, `stress`, and `canary`
2. canary desired-outcome semantics are separate from ordinary file/task oracle
   success
3. advisor-path failures are attributed more honestly

See:

1. [P4-15_MILESTONE_1_STABLE_PILOT_LANE_SEMANTICS.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-15_MILESTONE_1_STABLE_PILOT_LANE_SEMANTICS.md)

### Milestone 2

Milestone 2 hardened the pilot lane:

1. bounded repair/fallback advisor recovery
2. benchmark-visible advisor-attempt telemetry
3. repeat-aware reporting
4. canary reliability summaries
5. dedicated acceptance runner and acceptance contract

See:

1. [P4-14_BENCHMARK_HANDOFF_STATUS.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-14_BENCHMARK_HANDOFF_STATUS.md)
2. [P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md)

That foundation work was necessary. It was not wasted. It is the reason M3 can
now focus on value instead of basic runner trust.

---

## 5) What The Latest Five-Campaign Run Actually Shows

The latest full acceptance batch did not pass the M2 reliability contract.

Aggregate results:

1. valid expected-positive canaries: `30`
2. consulted: `14`
3. fail-open: `16`
4. consult success rate: `46.7%`
5. Wilson lower bound: `30.2%`
6. parse errors recorded: `16`
7. core desired-outcome failures: `18`

See:

1. [aggregate-report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\aggregate-report.md)
2. [aggregate-summary.json](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\aggregate-summary.json)

Interpretation:

1. campaigns `c01` and `c02` were behaviorally clean and fully successful on the
   sentinel set
2. campaigns `c03` through `c05` were dominated by later quota/capacity
   instability
3. that later instability poisoned the acceptance outcome

More importantly for M3, even the clean campaigns showed a product-value gap:

- in `c01`, all three conditions `A`, `E`, and `F` were `18/18`
- in `c02`, all three conditions `A`, `E`, and `F` were `18/18`
- Pollux condition `F` therefore had no accuracy uplift to show on that suite
- Pollux still spent more tokens and more wall-clock time on expected-positive
  canaries

See:

1. [m2-acceptance-001-c01/report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\campaigns\m2-acceptance-001-c01\report.md)
2. [m2-acceptance-001-c02/report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\campaigns\m2-acceptance-001-c02\report.md)

This is the central finding that should drive M3:

> The current pilot sentinel suite is good for proving canary semantics and
> reliability mechanics, but too easy to prove advisor-strategy value.

---

## 6) The Benchmark Problem M3 Must Solve

The current sentinel suite mostly measures this:

1. did Pollux escalate on the intended canaries?
2. did the advisor succeed or fail-open?
3. how much extra cost/latency did consultation add?

It does not yet measure this:

1. does a weak executor fail on hard tasks that a strong model can solve?
2. can Pollux recover some of those failures?
3. does Pollux land meaningfully closer to executor cost than strong-model cost?

That distinction matters because the Pollux spec goal is not:

- "escalate cleanly on tasks Flash already solves"

It is:

- "improve hard-task success without paying full premium-model cost for every
  turn"

Therefore M3 should be framed as a **product-value benchmark milestone**, not a
continuation of sentinel canary reliability.

---

## 7) M3 Benchmark Thesis

M3 should test the following thesis:

> On a calibrated hard-task subset where the weak executor baseline frequently
> fails and the strong executor baseline frequently succeeds, Flash +
> Pollux-advisor should improve success materially over Flash alone while
> remaining materially cheaper than Pro-only execution.

This should be the first Pollux benchmark thesis that is explicitly
three-condition and economically comparative:

1. weak executor only
2. strong executor only
3. weak executor + advisor

The current A / E / F matrix already supports exactly that comparison.

See:

1. [P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md)
   section `2) Conditions`

---

## 8) Design Principles For M3 Tasks

M3 tasks must be **discriminative**, not merely executable.

Required properties:

1. Flash-only should fail often enough to create headroom.
2. Pro-only should succeed often enough to establish that the task is actually
   solvable.
3. Pollux should be able to help by consulting at a real decision point rather
   than by receiving a benchmark-script hint.
4. The task oracle must remain deterministic and artifact-based.
5. The task should expose a plausible "stuck" or "uncertain decision" moment
   that maps onto Pollux's intended detector role.

Good M3 task patterns:

1. multi-file bug repair where a local patch is wrong but a cross-file fix is
   right
2. edits requiring careful interpretation of tests, config, or hidden
   constraints
3. tasks where the executor can make progress but is likely to choose the wrong
   plan without stronger reasoning
4. tasks with misleading obvious fixes and one correct design-consistent fix
5. tasks requiring bounded exploration plus synthesis rather than trivial file
   rewriting

Bad M3 task patterns:

1. tasks Flash already solves nearly always
2. tasks where neither Flash nor Pro solves reliably
3. tasks where the only difficulty is unstable infrastructure
4. tasks whose "advisor" value comes from benchmark-specific prompt leakage
5. tasks where the oracle is soft or subjective

These rules follow the existing Pollux doctrine:

1. real CLI path only
2. no benchmark-only advisor shortcut
3. deterministic oracle discipline

See:

1. [P4-08_REAL_BENCHMARK_DOCTRINE.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-08_REAL_BENCHMARK_DOCTRINE.md)
2. [P4-01_BENCHMARK_CORPUS_ORACLE.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-01_BENCHMARK_CORPUS_ORACLE.md)

---

## 9) M3 Must Use Calibration, Not Guesswork

The right way to build M3 is not:

- manually guess which tasks Flash will fail and Pro will solve

The right way is:

1. start with a larger candidate pool
2. run Flash-only on the pool
3. remove only pre-registered tasks that are already easy for Flash or already
   flaky under Flash
4. run Pro-only on the surviving pool
5. keep only stable tasks where Flash is weak and Pro is stronger
6. freeze that subset
7. then run a separate final `A` / `E` / `F` value campaign on that frozen
   subset

This is the single most important design choice for M3.

Why:

1. it avoids constructing a suite that is accidentally too easy
2. it avoids overfitting to Pollux after seeing Pollux results
3. it creates a defensible "discriminative subset" rather than a hand-picked
   miracle suite
4. it concentrates strong-model spend on tasks that still have headroom after
   the weak baseline screen
5. it makes failures interpretable: Flash failure, Pro rescue, Pollux partial
   rescue

Recommended calibration labels per task:

1. `easy`: Flash passes reliably
2. `impossible_or_noisy`: both Flash and Pro fail or the task is unstable
3. `discriminative`: Flash fails enough, Pro succeeds enough
4. `flaky`: infrastructure or quota noise dominates

Only `discriminative` tasks belong in the first M3 value suite.

---

## 10) Recommended M3 Artifact Structure

M3 should introduce a new benchmark concept distinct from M2 acceptance.

Recommended artifact families:

1. `calibration` artifacts
2. `value-suite` artifacts
3. optional external-benchmark adapter artifacts later

Recommended commands:

1. `benchmark:pollux:real:calibrate`
2. `benchmark:pollux:real:value`

Recommended artifact layout:

```text
artifacts/pollux/value-runs/<batch-id>/
  candidates/
  a-screen-summary.json
  a-survivor-set.json
  e-confirmation-summary.json
  calibration-summary.json
  calibration-report.md
  selected-task-set.json
  value-summary.json
  value-report.md
```

Calibration output should include, per task:

1. Flash pass rate
2. Pro pass rate
3. Flash cost / latency
4. Pro cost / latency
5. stability flags
6. calibration label
7. selection rationale

Value-suite output should include, per condition and per task:

1. success rate
2. cost per task
3. cost per success
4. token split by executor vs advisor
5. advisor call rate
6. latency
7. expected-vs-predicted escalation evidence

---

## 11) M3 Core Metrics

M3 should still preserve all current measurement-spec metrics, but it needs
value-oriented reporting added on top.

Keep:

1. valid/invalid counts
2. oracle pass
3. desired outcome
4. advisor-attempt telemetry
5. token/cost split
6. escalation precision/recall
7. repeat-aware summaries

Add or elevate:

1. pass rate by condition on the calibrated value subset
2. absolute improvement of `F` over `A`
3. gap closed between `A` and `E` by `F`
4. cost per task
5. cost per successful task
6. advisor-token share among successful Pollux runs
7. advisor calls per successful task
8. easy-task overhead leakage rate

The key M3 summary should look something like:

1. `A`: cheap but lower success
2. `E`: strongest but most expensive
3. `F`: materially better than `A`, materially cheaper than `E`

That is the product-value picture the current M2 reports do not yet provide.

---

## 12) Proposed M3 Workstreams

### Workstream A: Candidate task pool expansion

Purpose:

Build enough candidate tasks to discover a discriminative subset empirically.

Likely files:

1. [realTasks.ts](C:\Users\sorou\OneDrive\Desktop\Pollux\packages\core\src\pollux\benchmark\realTasks.ts)
2. adjacent benchmark fixture/oracle directories

Recommended task-source buckets:

1. local repo/code-edit tasks
2. multi-file debugging tasks
3. config/build/test interpretation tasks
4. shell-tool-chain tasks with real choice points

Hard rule:

Do not define M3 success on the existing sentinel subset alone.

### Workstream B: Calibration runner

Purpose:

Empirically identify tasks where Flash and Pro separate.

Likely new files:

1. `packages/test-utils/src/pollux-real-calibration.ts`
2. `packages/test-utils/src/pollux-real-calibration.test.ts`
3. additions in `pollux-real-types.ts`
4. additions in `pollux-real-report.ts`

Runner behavior:

1. run a full `A` screen on the candidate pool
2. exclude only pre-registered `easy` and `flaky` tasks from A-only evidence
3. run a full `E` confirmation pass on the survivors
4. compute pass/stability/cost summaries from `A` and `E`
5. assign final calibration labels
6. emit a frozen selected task list

### Workstream C: Value-suite runner

Purpose:

Run `A`, `E`, and `F` on the frozen discriminative subset.

Likely new files:

1. `packages/test-utils/src/pollux-real-value.ts`
2. `packages/test-utils/src/pollux-real-value.test.ts`
3. report extensions in `pollux-real-report.ts`

Runner behavior:

1. consume a frozen selected-task manifest
2. run a fresh `A`, `E`, `F` value campaign on that subset
3. do not reuse calibration-stage `A` or `E` measurements as final value
   estimates
4. preserve existing fairness and telemetry rules
5. compute value metrics, not just reliability metrics

### Workstream D: Reporting and docs

Purpose:

Prevent M3 from drifting into another reliability-only narrative.

Required docs:

1. M3 benchmark doctrine note
2. calibration protocol note
3. value-report interpretation guide

Likely updates:

1. [P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md)
2. [P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md)
3. possible new M3 operator and methodology addendum docs

---

## 13) Recommended First M3 Acceptance Shape

The first M3 evidence batch should stay modest and diagnostic.

Recommended initial structure:

1. candidate pool: `15-30` tasks
2. A-screen repeats: `2-3`
3. E-confirmation repeats: `2-3`
4. selected value subset after calibration: `8-15` tasks
5. value-suite repeats: `3`

Recommended first success criteria:

1. `F` beats `A` by a pre-registered absolute pass-rate margin on the selected
   value subset
2. `F` remains materially cheaper than `E`
3. advisor calls remain concentrated on hard tasks rather than leaking into easy
   tasks
4. value conclusions remain stable across repeats

Recommended economic summary metrics:

1. `cost_per_task`
2. `cost_per_success`
3. `latency_per_success`

For M3, `cost_per_success` may be more informative than raw cost alone.

---

## 14) What M3 Should Not Do

Avoid these traps:

1. do not keep rerunning the sentinel acceptance set and expect it to prove
   value
2. do not manually cherry-pick only tasks that Pollux visibly rescues after the
   fact
3. do not redefine advisor success around canary consultation alone
4. do not loosen oracle determinism to get prettier curves
5. do not hide invalid or quota-contaminated samples
6. do not let infrastructure instability masquerade as model weakness

The existing doctrine already warns against over-claiming from pilot runs.
Milestone 3 should honor that warning and only widen claims when the suite is
worthy of them.

---

## 15) External Benchmark Direction After Local M3

Local M3 should come first because it is faster to iterate and easier to debug.

After local M3 shows signal, the next external validation direction should be:

1. SWE-bench-style or SWE-bench-multilingual-style coding tasks
2. terminal-agent task suites

Rationale:

1. these are closer to the Pollux executor/advisor value story than the current
   sentinel suite
2. they are more credible for external comparison than a hand-built local suite
   alone
3. they naturally expose planning, debugging, and architecture-decision failure
   modes

This should be a follow-on validation phase, not the first place M3 is born.

---

## 16) Recommended Investigation Order For The Next Agent

1. Read this handoff fully.
2. Re-read the benchmark doctrine and methodology:
   - [P4-08_REAL_BENCHMARK_DOCTRINE.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-08_REAL_BENCHMARK_DOCTRINE.md)
   - [P4-05_REAL_BENCHMARK_METHODOLOGY.md](C:\Users\sorou\OneDrive\Desktop\Pollux\docs\core\pollux\P4-05_REAL_BENCHMARK_METHODOLOGY.md)
3. Inspect the current real-run plumbing:
   - [pollux-real-config.ts](C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\pollux-real-config.ts)
   - [pollux-live-run-rig.ts](C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\pollux-live-run-rig.ts)
   - [pollux-real-report.ts](C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\pollux-real-report.ts)
4. Inspect the latest clean campaigns:
   - [m2-acceptance-001-c01/report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\campaigns\m2-acceptance-001-c01\report.md)
   - [m2-acceptance-001-c02/report.md](C:\Users\sorou\OneDrive\Desktop\Pollux\artifacts\pollux\real-runs\m2-acceptance-001\campaigns\m2-acceptance-001-c02\report.md)
5. Start with calibration-runner and candidate-pool design before changing the
   value-report wording.
6. Freeze selected-task manifests before running Pollux on them.

---

## 17) Bottom Line

Pollux now has a solid benchmark foundation.

That foundation proves:

1. runner authenticity
2. telemetry trust
3. lane semantics
4. repeat-aware reporting
5. pilot canary reliability mechanics

It does not yet prove the thing Pollux is for:

1. better hard-task success than a weak executor baseline
2. at materially less cost than running the strong model everywhere

Milestone 3 should be the milestone that finally measures that.
