# P4-03 Smoke Benchmark Reproducibility Report

Version: 1.0 Generated: 2026-04-18T21:01:20.084Z Status: Done TG mapping: TG-1

---

## 1) Scope

This artifact records the P4-03 smoke benchmark run over a small A/E matrix
using deterministic fake responses. The benchmark validates reproducibility by
comparing stable run projections across repeated executions.

## 2) Smoke matrix

| Task               | Condition | Repeats | Reproducible | Stable fingerprint                                               |
| ------------------ | --------- | ------: | ------------ | ---------------------------------------------------------------- |
| CAL-BM-01-SIMPLE   | A         |       2 | yes          | e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90 |
| CAL-BM-01-SIMPLE   | E         |       2 | yes          | e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90 |
| CAL-BM-02-MODERATE | A         |       2 | yes          | bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114 |
| CAL-BM-02-MODERATE | E         |       2 | yes          | bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114 |

## 3) Run details

### CAL-BM-01-SIMPLE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  latencyMs=2428.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  latencyMs=2250.0

### CAL-BM-01-SIMPLE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  latencyMs=2335.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  latencyMs=2364.0

### CAL-BM-02-MODERATE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  latencyMs=2696.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  latencyMs=2247.0

### CAL-BM-02-MODERATE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  latencyMs=2254.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  latencyMs=2229.0

## 4) Conclusion

The smoke matrix is reproducible: every repeated run produced the same stable
projection for validity, fairness pins, accuracy, and token accounting.

## 5) Reproducibility rule

Stable projection = valid flag, invalidation reason, fairness pins, accuracy
result, and token totals. Latency is recorded for observability but excluded
from reproducibility comparison because it is expected to vary.
