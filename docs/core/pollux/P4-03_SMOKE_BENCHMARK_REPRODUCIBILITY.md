# P4-03 Smoke Benchmark Reproducibility Report

Version: 2.0 Generated: 2026-04-18T22:36:06.108Z Status: Done TG mapping: TG-1,
TG-3

---

## 1) Scope

This artifact records the P4-03 smoke benchmark over a small A / D / E matrix
using deterministic fake responses. The matrix MUST include at least one
Pollux-enabled condition (D, hybrid strategy) and at least one task whose prompt
deliberately trips the detector (`CAL-BM-04-ESCALATING`) so the smoke gate
actually exercises the advisor pipeline (TG-3) and not just the executor path.

## 2) Smoke matrix

| Task                 | Esc? | Cond | Repeats | Reproducible | Advisor calls (max) | Stable fingerprint                                               |
| -------------------- | ---- | ---- | ------: | ------------ | ------------------: | ---------------------------------------------------------------- |
| CAL-BM-01-SIMPLE     | no   | A    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-01-SIMPLE     | no   | D    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-01-SIMPLE     | no   | E    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-02-MODERATE   | no   | A    |       2 | yes          |                   0 | 81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65 |
| CAL-BM-02-MODERATE   | no   | D    |       2 | yes          |                   0 | 81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65 |
| CAL-BM-02-MODERATE   | no   | E    |       2 | yes          |                   0 | 81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65 |
| CAL-BM-04-ESCALATING | yes  | A    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |
| CAL-BM-04-ESCALATING | yes  | D    |       2 | yes          |                   1 | 6fb0b217294e42768b14e40cde374a5bfa55518450a3cc2db7be6f12d8f2e21d |
| CAL-BM-04-ESCALATING | yes  | E    |       2 | yes          |                   0 | d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f |

## 3) Run details

### CAL-BM-01-SIMPLE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=3189.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=1999.0

### CAL-BM-01-SIMPLE / D

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=2163.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=1833.0

### CAL-BM-01-SIMPLE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=1958.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=1895.0

### CAL-BM-02-MODERATE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=2285.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=5137.0

### CAL-BM-02-MODERATE / D

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=4121.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=5055.0

### CAL-BM-02-MODERATE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=4204.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=262/0/262,
  advisorCalls=0, latencyMs=4688.0

### CAL-BM-04-ESCALATING / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=4214.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=5096.0

### CAL-BM-04-ESCALATING / D

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.advisor.responses
- Stable reproducibility: passed
- Max observed advisor calls: 1
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=430/200/230,
  advisorCalls=1, latencyMs=4144.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=430/200/230,
  advisorCalls=1, latencyMs=4589.0

### CAL-BM-04-ESCALATING / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.responses
- Stable reproducibility: passed
- Max observed advisor calls: 0
- Run 1: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=4152.0
- Run 2: valid=true, accuracy=true, tokens(total/advisor/executor)=230/0/230,
  advisorCalls=0, latencyMs=4590.0

## 4) Conclusion

The smoke matrix is reproducible: every repeated run produced the same stable
projection for validity, fairness pins, accuracy, token accounting, and observed
advisor call count.

Advisor pipeline exercised: at least one Pollux-enabled cell observed a
`utility_advisor` telemetry event (TG-3 evidence).

## 5) Reproducibility rule

Stable projection = valid flag, invalidation reason, fairness pins, accuracy
result, token totals, and observed advisor call count. Latency is recorded for
observability but excluded from reproducibility comparison because it is
expected to vary.
