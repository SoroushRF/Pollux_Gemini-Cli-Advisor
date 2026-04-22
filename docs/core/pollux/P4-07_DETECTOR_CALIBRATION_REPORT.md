---
title: 'P4-07 — Detector Calibration Report (Phase H)'
status: published
owner: pollux
last_updated: 2026-04-22
---

## Purpose

This report records the calibration results for the redesigned Pollux detector
(live executor observer + fusion). Metrics below are produced by
`runCalibrationCorpus(CALIBRATION_CORPUS)` in CI and can be refreshed locally:

```bash
POLLUX_WRITE_CALIBRATION_REPORT=1 npx vitest run src/pollux/observer/calibration.report.test.ts
```

## Corpus

- **Corpus source**: `packages/core/src/pollux/observer/calibrationCorpus.ts`
- **Harness**: `packages/core/src/pollux/observer/calibration.ts`
- **Corpus size (N)**: 62
- **Trace categories**:
  - true_positive: 6
  - true_negative: 34
  - boundary: 22

### Coverage checklist

- **Hard-precision**:
  - risk gate (`risk.pre_tool_high`): yes
  - loop bridge (`loop.hard_confirmed`): yes
  - self-report stuck (`self.structured_status_stuck`): yes
- **Thought signals** (`thought.*`): yes
- **Tool pattern signals** (`tool.*`): yes
- **Negative signals** (`neg.*`): yes
- **Composite / fusion behavior**:
  - composite gating (`requireComposite`): yes
  - same-turn vs next-turn behavior: yes

## Aggregate metrics

- **TP / FP / FN / TN**: 19 / 0 / 0 / 43
- **Precision**: 1.0000
- **Recall**: 1.0000
- **F1**: 1.0000

### Required breakdowns

- **False-positive rate by category** (thought/tool/self):
  - thought: 0.0000
  - tool: 0.0000
  - self: 0.0000
- **Mean contributing-signal count on escalations**: 1.6842

## False positives (high-signal examples)

- _(none in current corpus)_

## False negatives (high-signal examples)

- _(none in current corpus)_

## Tuning notes

### Changes since last report

- Published metrics from automated harness (`calibration.report.test.ts`).

### Rationale / trade-offs

- Corpus is intentionally small and deterministic; expand `CALIBRATION_CORPUS`
  as new stuck patterns are codified.

## Benchmark alignment (Condition F)

- **Shared task set**: `packages/core/src/pollux/benchmark/tasks.ts`
- **Legacy baseline**: removed in Phase I (heuristic detector deleted);
  historical F1 parity gate vs legacy is **not applicable**.
- **Condition F** (redesigned detector): see `packages/test-utils` Pollux
  benchmark harness.
- **Acceptance gates**:
  - F1 parity vs legacy on shared set: **n/a** (legacy detector removed)
  - True-negative precision ≥ 0.90: track via corpus `true_negative` rows and
    benchmark smoke runs
