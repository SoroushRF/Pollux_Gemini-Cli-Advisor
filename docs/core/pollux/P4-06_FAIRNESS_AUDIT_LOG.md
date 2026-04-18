# P4-06 Fairness Pin Audit Log

Version: 1.0 Generated: 2026-04-18T21:36:04.368Z Status: Done TG mapping: TG-1

---

## 1) Scope

This artifact validates the fairness-pin audit trail for every run in the full
A-E benchmark matrix (initial + checkpoint/resume) and records machine-auditable
pin status and run validity.

## 2) Source coverage

- Source full benchmark timestamp: 2026-04-18T21:36:04.367Z
- Conditions: 5
- Cells (task x condition): 15
- Audited runs (initial + resume): 30

## 3) Fairness pin pass summary

| Pin                         | Pass count | Pass rate |
| --------------------------- | ---------: | --------: |
| FP-01 routerPinned          |      30/30 |    100.0% |
| FP-02 loopDetectionDisabled |      30/30 |    100.0% |
| FP-03 availabilityReset     |      30/30 |    100.0% |
| FP-04 dynamicConfigFixed    |      30/30 |    100.0% |
| FP-05 sessionIsolated       |      30/30 |    100.0% |
| FP-06 sandboxIsolated       |      30/30 |    100.0% |

## 4) Run validity summary

- Valid runs: 30/30
- Invalid runs: 0/30
- Checkpoint/resume fairness consistency: passed

## 5) Per-run fairness audit trail

| Task               | Condition | Phase   | Valid | Invalidation reason | FP-01 | FP-02 | FP-03 | FP-04 | FP-05 | FP-06 |
| ------------------ | --------- | ------- | ----- | ------------------- | ----- | ----- | ----- | ----- | ----- | ----- |
| CAL-BM-01-SIMPLE   | A         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | A         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | B         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | B         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | C         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | C         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | D         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | D         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | E         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE   | E         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | A         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | A         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | B         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | B         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | C         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | C         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | D         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | D         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | E         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE | E         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | A         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | A         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | B         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | B         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | C         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | C         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | D         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | D         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | E         | initial | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX  | E         | resume  | yes   | none                | pass  | pass  | pass  | pass  | pass  | pass  |

## 6) Conclusion

Fairness audit passed for every run. FP-01 through FP-06 are recorded and
passing across initial and resumed executions.
