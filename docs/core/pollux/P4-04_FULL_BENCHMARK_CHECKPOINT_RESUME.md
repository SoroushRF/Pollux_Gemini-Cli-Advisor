# P4-04 Full Benchmark Checkpoint/Resume Report

Version: 1.0 Generated: 2026-04-18T21:19:18.510Z Status: Done TG mapping: TG-1

---

## 1) Scope

This artifact records the full Pollux benchmark matrix across conditions A-E for
all corpus tasks, including checkpoint/resume validation per cell.

## 2) Condition matrix

| Condition | Executor             | Advisor              | Strategy   |
| --------- | -------------------- | -------------------- | ---------- |
| A         | gemini-2.5-flash     | none                 | none       |
| B         | gemini-2.5-flash     | gemini-3-pro-preview | heuristic  |
| C         | gemini-2.5-flash     | gemini-3-pro-preview | structured |
| D         | gemini-2.5-flash     | gemini-3-pro-preview | hybrid     |
| E         | gemini-3-pro-preview | none                 | none       |

## 3) Full run summary

| Task               | Condition | Initial valid | Resume valid | Fairness consistent | Checkpoint/resume pass | Initial tokens | Resume tokens |
| ------------------ | --------- | ------------- | ------------ | ------------------- | ---------------------- | -------------: | ------------: |
| CAL-BM-01-SIMPLE   | A         | yes           | yes          | yes                 | yes                    |            230 |           230 |
| CAL-BM-01-SIMPLE   | B         | yes           | yes          | yes                 | yes                    |            230 |           230 |
| CAL-BM-01-SIMPLE   | C         | yes           | yes          | yes                 | yes                    |            230 |           230 |
| CAL-BM-01-SIMPLE   | D         | yes           | yes          | yes                 | yes                    |            230 |           230 |
| CAL-BM-01-SIMPLE   | E         | yes           | yes          | yes                 | yes                    |            230 |           230 |
| CAL-BM-02-MODERATE | A         | yes           | yes          | yes                 | yes                    |            262 |           262 |
| CAL-BM-02-MODERATE | B         | yes           | yes          | yes                 | yes                    |            262 |           262 |
| CAL-BM-02-MODERATE | C         | yes           | yes          | yes                 | yes                    |            262 |           262 |
| CAL-BM-02-MODERATE | D         | yes           | yes          | yes                 | yes                    |            262 |           262 |
| CAL-BM-02-MODERATE | E         | yes           | yes          | yes                 | yes                    |            262 |           262 |
| CAL-BM-03-COMPLEX  | A         | yes           | yes          | yes                 | yes                    |            376 |           376 |
| CAL-BM-03-COMPLEX  | B         | yes           | yes          | yes                 | yes                    |            376 |           376 |
| CAL-BM-03-COMPLEX  | C         | yes           | yes          | yes                 | yes                    |            376 |           376 |
| CAL-BM-03-COMPLEX  | D         | yes           | yes          | yes                 | yes                    |            376 |           376 |
| CAL-BM-03-COMPLEX  | E         | yes           | yes          | yes                 | yes                    |            376 |           376 |

## 4) Checkpoint/resume details

### CAL-BM-01-SIMPLE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Resumed run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-01-SIMPLE / B

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Resumed run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-01-SIMPLE / C

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Resumed run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-01-SIMPLE / D

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Resumed run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-01-SIMPLE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-01-SIMPLE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Resumed run: valid=true, accuracy=true,
  fingerprint=e1b8cd38129e94de3537a4bedc22590be2d5ec14859ac1b267a2d7a34232fa90
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-02-MODERATE / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Resumed run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-02-MODERATE / B

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Resumed run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-02-MODERATE / C

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Resumed run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-02-MODERATE / D

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Resumed run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-02-MODERATE / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-02-MODERATE.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Resumed run: valid=true, accuracy=true,
  fingerprint=bb4fcc1c6ca1735f472823d89774a0760b88dcb7451044409a800f491d5bd114
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-03-COMPLEX / A

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Resumed run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-03-COMPLEX / B

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Resumed run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-03-COMPLEX / C

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Resumed run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-03-COMPLEX / D

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Resumed run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Fairness pin consistency across checkpoint/resume: passed

### CAL-BM-03-COMPLEX / E

- Fake responses:
  C:\Users\sorou\OneDrive\Desktop\Pollux\packages\test-utils\src\fixtures\pollux-benchmark\CAL-BM-03-COMPLEX.full.responses
- Initial run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Resumed run: valid=true, accuracy=true,
  fingerprint=d4907514a5552f9bd710ab899794d701771f644245aa181be9a954c22e8fafff
- Fairness pin consistency across checkpoint/resume: passed

## 5) Conclusion

Checkpoint/resume fairness validation passed for all A-E cells. Fairness pins
remained consistent and runs stayed valid across resume boundaries.
