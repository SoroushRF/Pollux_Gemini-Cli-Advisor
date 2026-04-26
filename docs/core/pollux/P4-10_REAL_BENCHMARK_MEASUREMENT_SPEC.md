# P4-10 Real Benchmark Measurement Spec

Version: 1.3 Date: 2026-04-26 Status: Milestone 2 reliability spec plus M3
staged-calibration measurement contract

---

## 1) Canonical measurement surface

The canonical measurement surface for Pollux real-model benchmarks is:

`headless_non_interactive_cli`

Why:

1. it is the most reproducible CLI surface
2. it matches the existing benchmark harness shape
3. cross-surface parity is already proven elsewhere in the Pollux plan

---

## 2) Conditions

The live real benchmark keeps the current A/E/F matrix.

### Condition A

1. Pollux disabled
2. executor-only baseline
3. `gemini-3-flash-preview`

### Condition E

1. Pollux disabled
2. stronger executor-only baseline
3. `gemini-3.1-pro-preview`

### Condition F

1. Pollux enabled
2. executor `gemini-3-flash-preview`
3. advisor `gemini-3.1-pro-preview`
4. fallback advisor `gemini-2.5-pro`
5. current observer/fusion detector configuration

---

## 3) Terms

### Sample

One concrete CLI execution for:

1. one task
2. one condition
3. one repeat index

### Cell

One `task x condition` pair.

### Campaign

A named collection of cells and repeats with one frozen manifest, one corpus
lock, and one pricing snapshot.

### A-screen campaign

A calibration-stage campaign that runs only condition `A` across the full
candidate pool in order to remove only pre-registered `easy` and `flaky` tasks.

### E-confirmation campaign

A calibration-stage campaign that runs only condition `E` across the A-screen
survivor pool in order to assign final calibration labels and freeze the
selected task set.

### Value campaign

A post-freeze evaluation campaign that runs `A`, `E`, and `F` on the frozen
selected task set. Published `A` and `E` value estimates come from this
campaign, not from calibration-stage samples.

### Valid sample

A sample with:

1. CLI success
2. telemetry present
3. prompt id present
4. response id evidence present
5. fairness pins satisfied
6. no wall-clock timeout
7. no model-response ceiling breach

### Invalid sample

A sample explicitly marked invalid with a recorded reason. Invalid samples are
preserved, not silently deleted.

---

## 4) Metrics

The foundation runner records:

1. oracle pass/fail
2. advisor/executor/total tokens
3. observed advisor calls
4. wall-clock latency
5. service latency from telemetry
6. estimated USD cost when a pricing snapshot is provided
7. fairness pin state
8. invalidation reason when present
9. captured Pollux escalation event records (`gemini_cli.pollux_escalation`)
10. derived run-level `reasonCodes` and `escalationTiming` sets for backward
    compatibility
11. derived run-level confusion exclusion marker for `fail_open` and
    `budget_exhausted`
12. expected-vs-predicted escalation labels and run-level confusion outcome
13. status-tag leakage diagnostics, including malformed/near-miss tags that are
    not valid Pollux self-report signals
14. tool/shell error counts
15. structured process-error evidence, including exit code hex and matched API
    error reason/status when present
16. CLI entrypoint kind/path and build freshness metadata
17. benchmark-visible advisor-attempt telemetry with attempt kind, parser
    outcome, and final outcome
18. repeat-aware campaign summaries and per-cell aggregate statistics
19. Wilson 95% intervals for binary rates in pooled and cell-level reporting

Publishable campaigns additionally require:

1. reason-code breakdown
2. timing breakdown (`same_turn` / `next_turn` / `missing_event`)
3. explicit exclusion-bucket disclosure for `fail_open` and `budget_exhausted`
   in confusion reporting
4. methodology-level statistics from `P4-05_REAL_BENCHMARK_METHODOLOGY.md`
5. for M3, a clean selection/evaluation split where calibration-stage `A` and
   `E` samples are not reused as final value-suite `A` and `E` estimates

Milestone 2 acceptance campaigns additionally require:

1. scope is limited to the current pilot pair only
2. evidence comes from `5` campaigns with `3` repeats each on the sentinel set
3. exactly `30` valid expected-positive canary samples are present
4. canary consult success rate is at least `0.90`
5. Wilson 95% lower bound for canary consult success is at least `0.75`
6. `parse_error = 0`
7. `false_negative = 0`
8. `budget_exhausted = 0`
9. no core-lane desired-outcome failures occur in the same acceptance batch

Stress-lane instability remains descriptive and does not fail Milestone 2 by
itself.

---

## 5) Invalidation rules

The foundation runner can invalidate a sample for reasons including:

1. `auth_failure`
2. `rate_limit_contamination`
3. `model_capacity_exhausted`
4. `cli_exit_nonzero`
5. `run_timeout`
6. `model_call_ceiling_exceeded`
7. `missing_telemetry`
8. `missing_prompt_id`
9. `missing_response_id`
10. `fairness_pin_failure`

These reasons are artifact evidence, not cleanup hints.

Classifier order matters. Structured capacity/quota evidence such as
`MODEL_CAPACITY_EXHAUSTED`, `RESOURCE_EXHAUSTED`, or HTTP `429` must be
recognized before generic OAuth/auth stack text. A capacity outage is not an
`auth_failure` merely because the stack includes an OAuth client frame.

---

## 6) Artifact schema

Campaign root:

```text
artifacts/pollux/real-runs/<campaign-id>/
  manifest.json
  conditions.json
  corpus-lock.json
  preflight.json
  preflight.md
  pricing-snapshot.json
  raw/<condition>/<task>/run-001.json
  summary.json
  report.md
  repeats/repeat-001.summary.json
  repeats/repeat-001.report.md
```

Acceptance root:

```text
artifacts/pollux/real-runs/<acceptance-id>/
  campaigns/<campaign-id>/...
  aggregate-summary.json
  aggregate-report.md
```

M3 staged roots additionally require calibration/value separation:

```text
artifacts/pollux/real-runs/<batch-id>/
  a-screen-campaign/...
  a-screen-summary.json
  a-survivor-set.json
  e-confirmation-campaign/...
  e-confirmation-summary.json
  calibration-summary.json
  calibration-report.md
  selected-task-set.json

artifacts/pollux/real-runs/<value-id>/
  selected-task-set.json
  value-campaign/...
  value-summary.json
  value-report.md
```

Each raw sample must include:

1. campaign id
2. sample id
3. task id
4. condition id
5. git SHA
6. lockfile hash
7. corpus SHA
8. prompt id
9. response ids
10. token totals by role
11. cost totals when pricing exists
12. fairness pins
13. oracle result
14. invalidation state
15. escalation event list with outcome / reason / timing metadata
16. derived confusion exclusion marker (if any)
17. expected escalation label
18. predicted escalation label
19. confusion outcome
20. CLI entrypoint kind/path
21. build freshness metadata
22. structured process-error evidence
23. status-tag and tool-error diagnostics
24. advisor-attempt records with `attemptIndex`, `attemptKind`, `model`,
    `parserOutcome`, `outcome`, and `failureKind`

Summary artifacts must include:

1. confusion matrix counts over included runs only
2. exclusion counts for `fail_open` and `budget_exhausted`
3. timing-stratified precision/recall, including the `missing_event` bucket
4. reason-code distribution counts
5. evidence-driven publishability blockers when escalation instrumentation is
   missing or malformed
6. per-sample diagnostics so aggregate rates can be traced back to raw runs
7. `repeatSummaries` when repeats are present
8. `cellAggregateSummaries` with `n`, mean, median, stddev, and binary-rate
   intervals
9. `canaryReliabilitySummary` with recovery-path counts and failure-kind totals

All pooled rates and means are computed over valid samples only, with valid and
invalid counts disclosed alongside them.

---

## 7) Publishability note

This measurement spec enables live pilots immediately.

It does not, by itself, make the repo publishable-ready. The publishability bar
remains `P4-05_REAL_BENCHMARK_METHODOLOGY.md`.
