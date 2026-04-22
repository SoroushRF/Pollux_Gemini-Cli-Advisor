# P3-05: Escalation Calibration Report and Threshold Tuning Guide

> **Superseded:** This legacy, string-corpus calibration guide is superseded by
> `docs/core/pollux/P4-07_DETECTOR_CALIBRATION_REPORT.md` (scripted-trace corpus
> for the redesigned observer-backed detector). Kept for historical context.

Version: 1.0 Date: 2026-04-18 Status: Initial calibration baseline TG mapping:
TG-6 (Pollux-specific integration tests exist and are green)

---

## 1) Purpose

This document is the P3-05 deliverable from the Pollux IMPLEMENTATION_PLAN. It
provides:

1. A description of the calibration methodology.
2. Analysis of default threshold behavior across all three detector strategies.
3. Threshold sensitivity analysis showing how escalation rates change.
4. Cross-strategy comparison matrix.
5. Recommended threshold profiles for different operating modes.
6. Heuristic rule weight rationale.
7. Operational tuning procedure for production deployment.

References:

- POLLUX_SPEC §7.1–7.4 (detector strategies and required properties)
- POLLUX_SPEC §8.2 (settings and default values)
- POLLUX_SPEC §10.4 (benchmark metrics: escalation precision and recall)
- IMPLEMENTATION_PLAN Phase 3 (P3-05 task definition and exit criteria)

---

## 2) Calibration Methodology

### 2.1 Calibration set design

The calibration set consists of 21 labeled turn context inputs in
`packages/core/src/pollux/calibration.ts`, organized into four categories:

| Category         | Count | Purpose                                                 |
| ---------------- | ----- | ------------------------------------------------------- |
| `true_positive`  | 6     | Inputs that SHOULD escalate under at least one strategy |
| `true_negative`  | 6     | Inputs that should NOT escalate under any strategy      |
| `boundary`       | 5     | Inputs at or near the escalation threshold boundary     |
| `cross_strategy` | 4     | Inputs designed to expose strategy divergence           |

Each entry includes expected ground-truth outcomes for all three strategies
(heuristic, structured, hybrid) at default thresholds (`minScore=2`,
`structured_threshold=6`).

### 2.2 Evaluation methodology

Each calibration entry is evaluated against:

1. **Raw signal evaluators** (`evaluateHeuristicSignals`,
   `evaluateStructuredConfidenceSignal`, `evaluateHybridSignals`) for
   signal-level analysis and calibration breakdowns.
2. **Detector factories** (`createHeuristicDetector`,
   `createStructuredDetector`, `createHybridDetector`) for end-to-end gate +
   strategy behavior verification — this is the TG-6 test surface.

### 2.3 Verification

Tests in `packages/core/src/pollux/calibration.test.ts` verify:

- All 21 entries × 3 strategies match ground-truth expectations (63 assertions).
- Cross-strategy divergence cases resolve to the expected hybrid decisions.
- Boundary cases produce exact expected signal values.
- Threshold sweep monotonicity holds for both heuristic and structured paths.
- Full calibration set evaluation is deterministic.
- True-positive entries match the expected heuristic rule IDs.
- True-negative entries produce zero heuristic scores.

---

## 3) Default Threshold Analysis

### 3.1 Heuristic strategy (`minScore=2`)

At the default `minScore=2`, the heuristic detector escalates **10 of 21**
entries (47.6% escalation rate).

Breakdown by category:

| Category       | Escalate | Total | Rate  |
| -------------- | -------- | ----- | ----- |
| true_positive  | 5/6      | 6     | 83.3% |
| true_negative  | 0/6      | 6     | 0.0%  |
| boundary       | 2/5      | 5     | 40.0% |
| cross_strategy | 3/4      | 4     | 75.0% |

The one true-positive that does NOT escalate on heuristic is **CAL-TP-05**
(structured confidence only, no heuristic keywords) — this is by design, as that
entry tests structured-path-only behavior.

### 3.2 Structured strategy (`structured_threshold=6`)

At the default `structured_threshold=6`, the structured detector escalates **4
of 21** entries (19.0% escalation rate).

Only entries with valid `<!-- pollux:confidence:N -->` tags where N ≥ 6 trigger
escalation:

| Entry     | Confidence | Escalates                  |
| --------- | ---------- | -------------------------- |
| CAL-TP-05 | 9          | ✅ Yes                     |
| CAL-BD-03 | 6          | ✅ Yes (boundary hit)      |
| CAL-CS-02 | 8          | ✅ Yes                     |
| CAL-CS-03 | 7          | ✅ Yes                     |
| CAL-TN-04 | 3          | ❌ No (below threshold)    |
| CAL-BD-04 | 5          | ❌ No (one below boundary) |
| CAL-CS-04 | 4          | ❌ No (below threshold)    |

### 3.3 Hybrid strategy (`minScore=2`, `structured_threshold=6`)

The hybrid detector at defaults escalates **13 of 21** entries (61.9% escalation
rate).

Hybrid decision distribution (rows sum to 21):

| Decision         | Count | Entries                                      |
| ---------------- | ----- | -------------------------------------------- |
| `heuristic`      | 9     | TP-01..04, TP-06, BD-02, BD-05, CS-01, CS-04 |
| `structured`     | 3     | TP-05, BD-03, CS-02                          |
| `tie_structured` | 1     | CS-03                                        |
| `none`           | 8     | TN-01..06, BD-01, BD-04                      |

Note: Hybrid escalates 3 more entries than heuristic alone at defaults — the
three structured-only escalations (TP-05, BD-03, CS-02) — and matches heuristic
on the 10 entries it already escalates (9 `heuristic` + 1 `tie_structured`
decisions). This demonstrates the value of the hybrid approach: structured
catches model-reported uncertainty that no heuristic keyword would surface.

---

## 4) Threshold Sensitivity Analysis

### 4.1 Heuristic `minScore` sweep

| minScore | Escalate | Rate  | Delta |
| -------- | -------- | ----- | ----- |
| 1        | 11       | 52.4% | —     |
| 2        | 10       | 47.6% | −1    |
| 3        | 7        | 33.3% | −3    |
| 4        | 7        | 33.3% | 0     |
| 5        | 2        | 9.5%  | −5    |
| 6        | 2        | 9.5%  | 0     |
| 7        | 0        | 0.0%  | −2    |
| 8        | 0        | 0.0%  | 0     |

Key observations:

- **Monotonically non-increasing** — verified by tests.
- No calibration entry has a score of exactly 3, so the table is flat between
  `minScore=3` and `minScore=4`.
- The steepest drop is between `minScore=4` and `minScore=5` (−5 entries),
  because 5 entries (TP-01, TP-02, TP-03, TP-04, CS-01) have exactly score 4.
- At `minScore=1`, every entry with even a single weak keyword match escalates.
- At `minScore≥7`, no entries in the calibration set escalate (maximum observed
  heuristic score is 6 from CS-03 and CS-04).

### 4.2 Structured threshold sweep

| Threshold | Escalate | Rate  | Delta |
| --------- | -------- | ----- | ----- |
| 1         | 7        | 33.3% | —     |
| 2         | 7        | 33.3% | 0     |
| 3         | 7        | 33.3% | 0     |
| 4         | 6        | 28.6% | −1    |
| 5         | 5        | 23.8% | −1    |
| 6         | 4        | 19.0% | −1    |
| 7         | 3        | 14.3% | −1    |
| 8         | 2        | 9.5%  | −1    |
| 9         | 1        | 4.8%  | −1    |
| 10        | 0        | 0.0%  | −1    |

Key observations:

- **Monotonically non-increasing** — verified by tests.
- Smooth linear degradation from threshold 4 onward (one entry lost per step).
- At very low thresholds (1–3), all tagged entries escalate; the calibration set
  has 7 entries with confidence tags of any value, but tags ≤ 0 or > 10 are
  invalid, so all 7 valid-tag entries have confidence in the 3–9 range.

---

## 5) Cross-Strategy Comparison Matrix

| Entry     | Heuristic  | Structured | Hybrid            | Divergence             |
| --------- | ---------- | ---------- | ----------------- | ---------------------- |
| CAL-CS-01 | ✅ score=4 | ❌ no tag  | ✅ heuristic      | Heuristic-only         |
| CAL-CS-02 | ❌ score=0 | ✅ conf=8  | ✅ structured     | Structured-only        |
| CAL-CS-03 | ✅ score=6 | ✅ conf=7  | ✅ tie→structured | Both agree             |
| CAL-CS-04 | ✅ score=6 | ❌ conf=4  | ✅ heuristic      | Low confidence ignored |

Analysis:

- **CS-01** and **CS-02** demonstrate that each strategy has exclusive coverage
  domains — heuristic catches user distress language without tags, structured
  catches model-reported uncertainty without keywords.
- **CS-03** demonstrates the tie-break policy: when both paths agree, structured
  wins deterministically. This is the correct design since structured confidence
  is a quantitative signal with more precision.
- **CS-04** is the most operationally important case: a low confidence tag (4)
  that fails the structured threshold does NOT prevent escalation via the
  heuristic path. The hybrid strategy correctly falls back to heuristic-only.

---

## 6) Recommended Threshold Profiles

### Profile: Conservative (minimize false positives)

```json
{
  "experimental": {
    "pollux": {
      "strategy": "hybrid",
      "structuredThreshold": 8
    }
  }
}
```

Expected behavior: Only escalates on strong keyword combinations (score ≥ 2) OR
high structured confidence (≥ 8). From the calibration set: ~9 of 21 entries
escalate via hybrid. Use when advisor cost is a primary concern.

The default `minScore=2` is already conservative for the heuristic path (single
weak keywords like "help" alone do not trigger escalation).

### Profile: Balanced (recommended default)

```json
{
  "experimental": {
    "pollux": {
      "strategy": "hybrid",
      "structuredThreshold": 6
    }
  }
}
```

Expected behavior: 13 of 21 calibration entries escalate (61.9%). This is the
shipped default. It catches most distress/error scenarios without escalating
trivial requests. The threshold of 6 on a 1–10 scale divides the confidence
range at 60%, which provides a natural separation between routine and complex
turns.

### Profile: Aggressive (maximize recall)

```json
{
  "experimental": {
    "pollux": {
      "strategy": "hybrid",
      "structuredThreshold": 3
    }
  }
}
```

Expected behavior: Escalates on any moderate confidence tag (≥ 3) plus all
heuristic matches. From the calibration set: ~14 of 21 entries escalate. Use
during evaluation runs where maximizing advisor coverage is prioritized over
cost control.

### Profile: Heuristic-only (no confidence tags required)

```json
{
  "experimental": {
    "pollux": {
      "strategy": "heuristic"
    }
  }
}
```

Expected behavior: Structured confidence tags are ignored. Escalation depends
entirely on keyword/pattern matching in the user digest and tool context. Useful
when the executor model does not emit confidence tags.

### Profile: Structured-only (tag-driven escalation)

```json
{
  "experimental": {
    "pollux": {
      "strategy": "structured",
      "structuredThreshold": 6
    }
  }
}
```

Expected behavior: No keyword-based escalation. Only turns with explicit
confidence tags meeting the threshold escalate. This is the most predictable
mode but requires the executor model to emit tags.

---

## 7) Heuristic Rule Weight Rationale

| Rule               | Weight | Field | Rationale                                                                                                                                                                                                    |
| ------------------ | ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXPLICIT_BLOCKED` | 2      | both  | Strong distress signal — user explicitly reports being stuck or unable to proceed. A single match alone should meet the default threshold.                                                                   |
| `HELP_REQUEST`     | 1      | user  | Moderate signal — "help" requests are common in normal conversation. A single occurrence should NOT trigger escalation alone; it needs a second signal.                                                      |
| `COMPLEXITY`       | 1      | user  | Moderate signal — architectural vocabulary appears in many non-distress contexts (e.g., "describe the architecture"). Requires accumulation.                                                                 |
| `DEBUG_INTENT`     | 1      | user  | Moderate signal — debugging is a normal activity. Combined with error markers or help requests, it suggests genuine difficulty.                                                                              |
| `ERROR_MARKER`     | 2      | tool  | Strong signal — tool execution produced an error, exception, or non-zero exit code. A single error marker alone should meet the default threshold because it indicates the executor's prior approach failed. |
| `RETRY_LOOP`       | 2      | both  | Strong signal — repeated failure indicates the executor is stuck in a loop. A single retry-loop match alone should trigger escalation.                                                                       |

Weight design principle: High-weight rules (weight=2) represent situations where
a single occurrence provides enough evidence for escalation. Low-weight rules
(weight=1) require at least one additional signal to accumulate to the default
`minScore=2`.

### Tuning rule weights

Rule weights are defined in `DEFAULT_HEURISTIC_RULES` in `detector.ts`. To
customize:

1. Override the `rules` option in `createHeuristicDetector({ rules: [...] })`.
2. Verify against the calibration set by running
   `npm run test --workspace @google/gemini-cli-core -- src/pollux/calibration.test.ts`.
3. Adjust `minScore` if the weight scale changes.

---

## 8) Operational Tuning Procedure

### Step 1: Choose a strategy

For most deployments, `hybrid` is recommended because it captures both
user-language signals (heuristic) and model-reported uncertainty (structured).

### Step 2: Set the confidence threshold

Start with the default `structured_threshold=6`. If the advisor is being
consulted too frequently, increase to 7 or 8. If it's not catching enough
difficult turns, decrease to 4 or 5.

### Step 3: Monitor escalation metrics

Use the `LlmRole.UTILITY_ADVISOR` telemetry tag (P1-05) to track:

- Advisor consultation rate per session.
- Advisor consultation rate per turn.
- Budget exhaustion frequency (per-turn and per-session caps).

### Step 4: Review advisor outcomes

For each advisor consultation:

- Was the guidance used by the executor?
- Did the user continue on the same topic after advisor guidance?
- Did the user express satisfaction or continued difficulty?

### Step 5: Iterate thresholds

Based on monitoring data:

- **High false-positive rate**: increase structured threshold and/or `minScore`
  (via custom heuristic options).
- **High false-negative rate**: decrease structured threshold or switch to
  `hybrid` strategy if using single-strategy mode.
- **Budget exhaustion**: increase `maxAdvisorCallsPerSession` or tighten
  thresholds to reduce call frequency.

### Step 6: Run the calibration tests

After any threshold change, verify the calibration set still produces expected
results:

```bash
npm run test --workspace @google/gemini-cli-core -- src/pollux/calibration.test.ts
```

---

## 9) File References

| File                                           | Purpose                                                   |
| ---------------------------------------------- | --------------------------------------------------------- |
| `packages/core/src/pollux/calibration.ts`      | Calibration set data, evaluation helpers, sweep utilities |
| `packages/core/src/pollux/calibration.test.ts` | TG-6 calibration tests                                    |
| `detector.ts`                                  | Detector implementations (P3-01/02/03)                    |
| `packages/core/src/pollux/types.ts`            | Config types and defaults                                 |

---

## 10) Phase 3 Exit Criteria Contribution

This report satisfies the P3-05 deliverable requirement from IMPLEMENTATION_PLAN
Phase 3:

- ✅ Calibration set with labeled ground-truth expectations.
- ✅ Threshold tuning guide with sensitivity analysis.
- ✅ TG-6 test assertions verifying calibration expectations.
- ✅ Threshold sweep monotonicity tests.
- ✅ Cross-strategy divergence analysis.
- ✅ Rule weight rationale and tuning instructions.

Phase 3 exit criteria coverage:

- "Detector calibration and fail-open behavior documented" → this report
  (calibration) + P3-04 evidence (fail-open).
- "TG-6 green under stress scenarios" → calibration.test.ts expands TG-6
  coverage with 21 × 3 + sweep + determinism tests.
