# P4-04 Full Benchmark Session-Resume Continuity Report

Version: 2.0 Generated: 2026-04-23T05:41:07.276Z Status: Done TG mapping: TG-1

---

## 1) Scope and naming

This artifact records the full Pollux benchmark matrix across conditions A-E for
all corpus tasks. The harness invokes the CLI twice per cell — an initial
subprocess and a resume subprocess (`--resume latest --prompt <resumePrompt>`) —
and asserts that both subprocesses produce a stable, fairness-pin-consistent
projection.

**Naming clarification (P4-04 senior review fix):** the original deliverable was
titled "checkpoint/resume", which implied mid-run state persistence. The harness
does not implement partial-run persistence; the resume subprocess is a fresh
process that re-reads the saved chat session via the CLI `--resume` flag and
replays the fake-response fixture from index 0. This is correctly described as
**session-resume continuity**, not checkpoint/resume. See
`docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md` for the contract a real
model-run benchmark would have to satisfy.

## 2) Condition matrix

| Condition | Executor             | Advisor              | Strategy        |
| --------- | -------------------- | -------------------- | --------------- |
| A         | gemini-2.5-flash     | none                 | none            |
| E         | gemini-3-pro-preview | none                 | none            |
| F         | gemini-2.5-flash     | gemini-3-pro-preview | observer+fusion |

## 3) Full run summary

| Task                 | Esc? | Cond | Init valid | Resume valid | Fair consistent | Continuity pass | Init tokens | Resume tokens | Init advisor calls | Resume advisor calls |
| -------------------- | ---- | ---- | ---------- | ------------ | --------------- | --------------- | ----------: | ------------: | -----------------: | -------------------: |
| CAL-BM-01-SIMPLE     | no   | A    | yes        | yes          | yes             | yes             |         230 |           230 |                  0 |                    0 |
| CAL-BM-01-SIMPLE     | no   | E    | yes        | yes          | yes             | yes             |         230 |           230 |                  0 |                    0 |
| CAL-BM-01-SIMPLE     | no   | F    | yes        | yes          | yes             | yes             |         230 |           230 |                  0 |                    0 |
| CAL-BM-02-MODERATE   | no   | A    | yes        | yes          | yes             | yes             |         262 |           262 |                  0 |                    0 |
| CAL-BM-02-MODERATE   | no   | E    | yes        | yes          | yes             | yes             |         262 |           262 |                  0 |                    0 |
| CAL-BM-02-MODERATE   | no   | F    | yes        | yes          | yes             | yes             |         262 |           262 |                  0 |                    0 |
| CAL-BM-03-COMPLEX    | no   | A    | yes        | yes          | yes             | yes             |         376 |           376 |                  0 |                    0 |
| CAL-BM-03-COMPLEX    | no   | E    | yes        | yes          | yes             | yes             |         376 |           376 |                  0 |                    0 |
| CAL-BM-03-COMPLEX    | no   | F    | yes        | yes          | yes             | yes             |         376 |           376 |                  0 |                    0 |
| CAL-BM-04-ESCALATING | yes  | A    | yes        | yes          | yes             | yes             |         230 |           230 |                  0 |                    0 |
| CAL-BM-04-ESCALATING | yes  | E    | yes        | yes          | yes             | yes             |         230 |           230 |                  0 |                    0 |
| CAL-BM-04-ESCALATING | yes  | F    | yes        | yes          | yes             | yes             |         430 |           430 |                  1 |                    1 |

## 4) Continuity details

### CAL-BM-01-SIMPLE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Fairness pin consistency across resume: passed

### CAL-BM-01-SIMPLE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Fairness pin consistency across resume: passed

### CAL-BM-01-SIMPLE / F

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Fairness pin consistency across resume: passed

### CAL-BM-02-MODERATE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65
- Fairness pin consistency across resume: passed

### CAL-BM-02-MODERATE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65
- Fairness pin consistency across resume: passed

### CAL-BM-02-MODERATE / F

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=81f459ff3b4f197379af80f8a0f58a544ae2fead0529140e1e60e53c3511df65
- Fairness pin consistency across resume: passed

### CAL-BM-03-COMPLEX / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=0cb6700573f5c06c03b2c65162060e82d7dba1c192586aca6eeaf39970b235e7
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=0cb6700573f5c06c03b2c65162060e82d7dba1c192586aca6eeaf39970b235e7
- Fairness pin consistency across resume: passed

### CAL-BM-03-COMPLEX / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=0cb6700573f5c06c03b2c65162060e82d7dba1c192586aca6eeaf39970b235e7
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=0cb6700573f5c06c03b2c65162060e82d7dba1c192586aca6eeaf39970b235e7
- Fairness pin consistency across resume: passed

### CAL-BM-03-COMPLEX / F

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=0cb6700573f5c06c03b2c65162060e82d7dba1c192586aca6eeaf39970b235e7
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=0cb6700573f5c06c03b2c65162060e82d7dba1c192586aca6eeaf39970b235e7
- Fairness pin consistency across resume: passed

### CAL-BM-04-ESCALATING / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Fairness pin consistency across resume: passed

### CAL-BM-04-ESCALATING / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.full.responses
- Initial run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Resumed run: valid=true, accuracy=true, advisorCalls=0,
  fingerprint=d38a2e731b4bdc22cfcebc221a20e1aa040dbb34dff8d868aa7074b567d3a30f
- Fairness pin consistency across resume: passed

### CAL-BM-04-ESCALATING / F

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-04-ESCALATING.full.advisor.responses
- Initial run: valid=true, accuracy=true, advisorCalls=1,
  fingerprint=6fb0b217294e42768b14e40cde374a5bfa55518450a3cc2db7be6f12d8f2e21d
- Resumed run: valid=true, accuracy=true, advisorCalls=1,
  fingerprint=6fb0b217294e42768b14e40cde374a5bfa55518450a3cc2db7be6f12d8f2e21d
- Fairness pin consistency across resume: passed

## 5) Conclusion

Session-resume continuity validation passed for all A-E cells. Fairness pins
remained consistent and runs stayed valid across resume boundaries.
