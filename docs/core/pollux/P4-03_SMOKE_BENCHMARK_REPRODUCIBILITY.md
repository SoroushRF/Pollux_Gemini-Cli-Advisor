# P4-03 Smoke Benchmark Reproducibility Report

Version: 2.0 Generated: 2026-04-22T11:34:37.606Z Status: Done TG mapping: TG-1,
TG-3

---

## 1) Scope

This artifact records the P4-03 smoke benchmark over a small A / F / E matrix
using deterministic fake responses. The matrix MUST include at least one
Pollux-enabled condition (F, redesigned observer+fusion) and at least one task
whose prompt deliberately trips the detector (`CAL-BM-04-ESCALATING`) so the
smoke gate actually exercises the advisor pipeline (TG-3) and not just the
executor path.

## 2) Smoke matrix

| Task                 | Esc? | Cond | Repeats | Reproducible | Advisor calls (max) | Stable fingerprint                                               |
| -------------------- | ---- | ---- | ------: | ------------ | ------------------: | ---------------------------------------------------------------- |
| CAL-BM-01-SIMPLE     | no   | A    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-01-SIMPLE     | no   | F    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-01-SIMPLE     | no   | E    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-02-MODERATE   | no   | A    |       2 | yes          |                   0 | 81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65 |
| CAL-BM-02-MODERATE   | no   | F    |       2 | yes          |                   0 | 81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65 |
| CAL-BM-02-MODERATE   | no   | E    |       2 | yes          |                   0 | 81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65 |
| CAL-BM-04-ESCALATING | yes  | A    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-04-ESCALATING | yes  | F    |       2 | yes          |                   0 | 7b15c857fee4c18684c91e1a952e37eb3829d174ededab11b630e922dd87f6c4 |
| CAL-BM-04-ESCALATING | yes  | E    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |

## 3) Run details

### CAL-BM-01-SIMPLE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=7162.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=3777.0

### CAL-BM-01-SIMPLE / F

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=3395.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=2886.0

### CAL-BM-01-SIMPLE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=3414.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=2793.0

### CAL-BM-02-MODERATE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=1655.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=1472.0

### CAL-BM-02-MODERATE / F

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=2161.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=2134.0

### CAL-BM-02-MODERATE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=1415.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=1413.0

### CAL-BM-04-ESCALATING / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=1418.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=3148.0

### CAL-BM-04-ESCALATING / F

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.advisor.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=false, accuracy=false, tokens(total/advisor/executor)=0/0/0,
  advisorCalls=0, latencyMs=2825.0
- Run 2: valid=false, accuracy=false, tokens(total/advisor/executor)=0/0/0,
  advisorCalls=0, latencyMs=2899.0

### CAL-BM-04-ESCALATING / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=2531.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=2911.0

## 4) Conclusion

The smoke matrix is reproducible: every repeated run produced the same stable
projection for validity, fairness pins, accuracy, token accounting, and observed
advisor call count.

WARNING: advisor pipeline NOT exercised. Every cell observed zero advisor
telemetry events; the smoke gate is collapsing to an executor-only test and
provides no Pollux coverage.

## 5) Reproducibility rule

Stable projection = valid flag, invalidation reason, fairness pins, accuracy
result, token totals, and observed advisor call count. Latency is recorded for
observability but excluded from reproducibility comparison because it is
expected to vary.
