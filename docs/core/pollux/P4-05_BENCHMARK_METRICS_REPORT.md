# P4-05 Synthetic Harness Self-Test (Tokens / Latency / Accuracy / CIs)

Version: 2.0 Generated: 2026-04-18T22:37:21.460Z Status: Done (synthetic
self-test) TG mapping: TG-1, TG-4

---

> **Disclaimer (P4-05 senior review fix).** The numbers in this report are
> produced from deterministic fake-response fixtures replayed by
> `BenchmarkHarness` against the CLI. They validate the harness plumbing — token
> accounting, latency measurement, accuracy oracle wiring, fairness pin
> enforcement, escalation telemetry attribution, and 95% CI math — and they DO
> NOT constitute a model performance benchmark. Any comparison of executor vs.
> advisor model quality, token cost, or wall-clock latency from these numbers is
> invalid by construction. The contract a real model-run benchmark must satisfy
> lives in `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`.

## 1) Scope

This artifact publishes condition-level and overall numbers from the synthetic
A-E session-resume continuity run, including 95% confidence intervals on
accuracy / tokens / latency and an escalation confusion matrix derived from
observed `utility_advisor` telemetry events. It serves as a regression gate on
the harness, not as a model evaluation.

## 2) Source data

- Source full benchmark timestamp: 2026-04-18T22:37:21.458Z
- Source cells: 20
- Run samples (initial + resumed): 40

## 3) Condition metrics (95% CI)

| Condition |   N | Accuracy                 | Total tokens mean      | Advisor tokens mean   | Executor tokens mean   | Latency ms mean           | Escalation rate       |
| --------- | --: | ------------------------ | ---------------------- | --------------------- | ---------------------- | ------------------------- | --------------------- |
| A         |   8 | 100.0% (67.6% to 100.0%) | 274.5 (220.8 to 328.2) | 0.0 (0.0 to 0.0)      | 274.5 (220.8 to 328.2) | 3611.0 (2952.1 to 4269.9) | 0.0% (0.0% to 32.4%)  |
| B         |   8 | 100.0% (67.6% to 100.0%) | 324.5 (251.6 to 397.4) | 50.0 (-27.4 to 127.4) | 274.5 (220.8 to 328.2) | 3552.4 (2712.9 to 4391.9) | 25.0% (7.1% to 59.1%) |
| C         |   8 | 100.0% (67.6% to 100.0%) | 324.5 (251.6 to 397.4) | 50.0 (-27.4 to 127.4) | 274.5 (220.8 to 328.2) | 3276.1 (2403.6 to 4148.7) | 25.0% (7.1% to 59.1%) |
| D         |   8 | 100.0% (67.6% to 100.0%) | 324.5 (251.6 to 397.4) | 50.0 (-27.4 to 127.4) | 274.5 (220.8 to 328.2) | 3534.3 (2551.4 to 4517.1) | 25.0% (7.1% to 59.1%) |
| E         |   8 | 100.0% (67.6% to 100.0%) | 274.5 (220.8 to 328.2) | 0.0 (0.0 to 0.0)      | 274.5 (220.8 to 328.2) | 3578.1 (2836.5 to 4319.8) | 0.0% (0.0% to 32.4%)  |

## 4) Overall accuracy and token reconciliation

- Overall accuracy: 100.0% (91.2% to 100.0%) (successes 40/40)
- Token reconciliation (total = advisor + executor): 100.0% (91.2% to 100.0%)
  (passes 40/40)

## 5) Escalation statistics

Confusion matrix uses task-level escalation expectation: a sample is an expected
positive iff the task is marked `escalates: true` AND the condition has Pollux
enabled. This is the senior-review fix for the original report, which used
`advisorEnabled` as the expected-positive label and forced recall to 0 by
construction whenever no escalating task was in the corpus.

- Confusion counts: TP=6, FP=0, FN=0, TN=34
- Precision: 100.0% (61.0% to 100.0%)
- Recall: 100.0% (61.0% to 100.0%)

## 6) Conclusion

The harness self-test is complete. All accounting plumbing reports stable values
across repeated runs (see P4-03 smoke), token reconciliation holds (TG-4), and
the escalation confusion matrix exposes a non-degenerate TP/TN distribution
driven by a real corpus task whose prompt trips the detector. A real model-run
benchmark must follow the protocol in `P4-05_REAL_BENCHMARK_METHODOLOGY.md`
before any executor vs. advisor performance claim is published.
