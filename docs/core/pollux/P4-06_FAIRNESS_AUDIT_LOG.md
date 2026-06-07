# P4-06 Fairness Pin Audit Log

Version: 2.0 Generated: 2026-04-30T00:49:25.038Z Status: Done TG mapping: TG-1

---

## 1) Scope

This artifact validates the fairness-pin audit trail for every run in the full
A-E benchmark matrix (initial + session-resume). Per the P0-05 contract refined
by senior review, every pin is now derived from either the requested settings
AND/OR a runtime telemetry observable, instead of being a hardcoded constant.
Cross-run uniqueness for FP-03/FP-05/FP-06 is verified at this audit layer.

## 2) Source coverage

- Source full benchmark timestamp: 2026-04-30T00:49:25.037Z
- Conditions: 3
- Cells (task x condition): 12
- Audited runs (initial + resume): 24

## 3) Fairness pin pass summary

| Pin                         | Pass count | Pass rate |
| --------------------------- | ---------: | --------: |
| FP-01 routerPinned          |      24/24 |    100.0% |
| FP-02 loopDetectionDisabled |      24/24 |    100.0% |
| FP-03 availabilityReset     |      24/24 |    100.0% |
| FP-04 dynamicConfigFixed    |      24/24 |    100.0% |
| FP-05 sessionIsolated       |      24/24 |    100.0% |
| FP-06 sandboxIsolated       |      24/24 |    100.0% |

## 4) Telemetry-derived AC-03 evidence

- Baseline utility suppression (no router or loop-detector api_response events):
  passed
- Advisor pipeline exercised (at least one utility_advisor api_response): yes
  (TG-3 evidence)

## 5) Cross-run uniqueness (FP-03 / FP-05 / FP-06)

- Distinct session ids across all runs: 12/24
- Distinct workspace dirs across all runs: 12/24
- Distinct home dirs across all runs: 12/24
- Initial-run session ids unique (FP-05): yes
- Initial-run workspace dirs unique (FP-06): yes
- Initial-run home dirs unique (FP-03): yes

## 6) Run validity summary

- Valid runs: 24/24
- Invalid runs: 0/24
- Session-resume fairness consistency: passed

## 7) Per-run fairness audit trail

| Task                 | Cond | Phase   | Valid | Reason | Router calls | Loop-det calls | Advisor calls | FP-01 | FP-02 | FP-03 | FP-04 | FP-05 | FP-06 |
| -------------------- | ---- | ------- | ----- | ------ | -----------: | -------------: | ------------: | ----- | ----- | ----- | ----- | ----- | ----- |
| CAL-BM-01-SIMPLE     | A    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE     | A    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE     | E    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE     | E    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE     | F    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-01-SIMPLE     | F    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE   | A    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE   | A    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE   | E    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE   | E    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE   | F    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-02-MODERATE   | F    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX    | A    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX    | A    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX    | E    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX    | E    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX    | F    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-03-COMPLEX    | F    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-04-ESCALATING | A    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-04-ESCALATING | A    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-04-ESCALATING | E    | initial | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-04-ESCALATING | E    | resume  | yes   | none   |            0 |              0 |             0 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-04-ESCALATING | F    | initial | yes   | none   |            0 |              0 |             1 | pass  | pass  | pass  | pass  | pass  | pass  |
| CAL-BM-04-ESCALATING | F    | resume  | yes   | none   |            0 |              0 |             1 | pass  | pass  | pass  | pass  | pass  | pass  |

## 8) Conclusion

Fairness audit passed for every run. FP-01 through FP-06 are recorded and
passing across initial and resumed executions; AC-03 utility suppression holds
at the telemetry level; cross-run uniqueness for FP-03/05/06 is satisfied.
