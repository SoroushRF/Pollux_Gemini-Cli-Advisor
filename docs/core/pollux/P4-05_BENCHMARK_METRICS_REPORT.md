# P4-05 Synthetic Harness Self-Test (Tokens / Latency / Accuracy / CIs)

Version: 2.0 Generated: 2026-04-23T05:41:07.342Z Status: Done (synthetic
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

- Source full benchmark timestamp: 2026-04-23T05:41:07.339Z
- Source cells: 12
- Run samples (initial + resumed): 24

## 3) Condition metrics (95% CI)

| Condition |   N | Accuracy                 | Total tokens mean      | Advisor tokens mean   | Executor tokens mean   | Latency ms mean           | Escalation rate       |
| --------- | --: | ------------------------ | ---------------------- | --------------------- | ---------------------- | ------------------------- | --------------------- |
| A         |   8 | 100.0% (67.6% to 100.0%) | 274.5 (220.8 to 328.2) | 0.0 (0.0 to 0.0)      | 274.5 (220.8 to 328.2) | 3810.9 (3030.6 to 4591.1) | 0.0% (0.0% to 32.4%)  |
| E         |   8 | 100.0% (67.6% to 100.0%) | 274.5 (220.8 to 328.2) | 0.0 (0.0 to 0.0)      | 274.5 (220.8 to 328.2) | 3664.4 (3129.6 to 4199.1) | 0.0% (0.0% to 32.4%)  |
| F         |   8 | 100.0% (67.6% to 100.0%) | 324.5 (251.6 to 397.4) | 50.0 (-27.4 to 127.4) | 274.5 (220.8 to 328.2) | 3821.6 (3230.5 to 4412.8) | 25.0% (7.1% to 59.1%) |

## 4) Overall accuracy and token reconciliation

- Overall accuracy: 100.0% (86.2% to 100.0%) (successes 24/24)
- Token reconciliation (total = advisor + executor): 100.0% (86.2% to 100.0%)
  (passes 24/24)

## 5) Escalation statistics

Confusion matrix uses task-level escalation expectation: a sample is an expected
positive iff the task is marked `escalates: true` AND the condition has Pollux
enabled. This is the senior-review fix for the original report, which used
`advisorEnabled` as the expected-positive label and forced recall to 0 by
construction whenever no escalating task was in the corpus.

- Confusion counts: TP=2, FP=0, FN=0, TN=22
- Precision: 100.0% (34.2% to 100.0%)
- Recall: 100.0% (34.2% to 100.0%)

## 6) Conclusion

The harness self-test is complete. All accounting plumbing reports stable values
across repeated runs (see P4-03 smoke), token reconciliation holds (TG-4), and
the escalation confusion matrix exposes a non-degenerate TP/TN distribution
driven by a real corpus task whose prompt trips the detector. A real model-run
benchmark must follow the protocol in `P4-05_REAL_BENCHMARK_METHODOLOGY.md`
before any executor vs. advisor performance claim is published.
