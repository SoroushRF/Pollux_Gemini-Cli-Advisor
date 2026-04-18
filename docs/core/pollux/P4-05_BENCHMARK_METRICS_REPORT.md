# P4-05 Benchmark Metrics Report (Token/Latency/Accuracy + CIs)

Version: 1.0 Generated: 2026-04-18T21:32:05.054Z Status: Done TG mapping: TG-1,
TG-4

---

## 1) Scope

This artifact publishes condition-level and overall benchmark metrics from the
full A-E checkpoint/resume run, including 95% confidence intervals and
escalation statistics.

## 2) Source data

- Source full benchmark timestamp: 2026-04-18T21:32:05.052Z
- Source cells: 15
- Run samples (initial + resumed): 30

## 3) Condition metrics (95% CI)

| Condition |   N | Accuracy                 | Total tokens mean      | Advisor tokens mean | Executor tokens mean   | Latency ms mean           | Escalation rate      |
| --------- | --: | ------------------------ | ---------------------- | ------------------- | ---------------------- | ------------------------- | -------------------- |
| A         |   6 | 100.0% (61.0% to 100.0%) | 289.3 (217.3 to 361.4) | 0.0 (0.0 to 0.0)    | 289.3 (217.3 to 361.4) | 2207.8 (2060.8 to 2354.8) | 0.0% (0.0% to 39.0%) |
| B         |   6 | 100.0% (61.0% to 100.0%) | 289.3 (217.3 to 361.4) | 0.0 (0.0 to 0.0)    | 289.3 (217.3 to 361.4) | 2186.2 (2084.9 to 2287.4) | 0.0% (0.0% to 39.0%) |
| C         |   6 | 100.0% (61.0% to 100.0%) | 289.3 (217.3 to 361.4) | 0.0 (0.0 to 0.0)    | 289.3 (217.3 to 361.4) | 2191.0 (2125.2 to 2256.8) | 0.0% (0.0% to 39.0%) |
| D         |   6 | 100.0% (61.0% to 100.0%) | 289.3 (217.3 to 361.4) | 0.0 (0.0 to 0.0)    | 289.3 (217.3 to 361.4) | 2164.7 (2099.6 to 2229.7) | 0.0% (0.0% to 39.0%) |
| E         |   6 | 100.0% (61.0% to 100.0%) | 289.3 (217.3 to 361.4) | 0.0 (0.0 to 0.0)    | 289.3 (217.3 to 361.4) | 2194.8 (2087.3 to 2302.4) | 0.0% (0.0% to 39.0%) |

## 4) Overall accuracy and token reconciliation

- Overall accuracy: 100.0% (88.6% to 100.0%) (successes 30/30)
- Token reconciliation (total = advisor + executor): 100.0% (88.6% to 100.0%)
  (passes 30/30)

## 5) Escalation statistics

- Confusion counts (advisor-enabled condition as expected positive): TP=0, FP=0,
  FN=18, TN=12
- Precision: N/A (no predicted positives)
- Recall: 0.0% (0.0% to 17.6%)

## 6) Conclusion

The P4-05 benchmark metrics report is complete, with confidence intervals for
accuracy, token usage, and latency, plus escalation precision/recall and TG-4
token reconciliation evidence.
