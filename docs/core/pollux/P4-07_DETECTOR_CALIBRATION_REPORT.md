---
title: 'P4-07 — Detector Calibration Report (Phase H)'
status: template
owner: pollux
last_updated: 2026-04-22
---

## Purpose

This report records the calibration results for the redesigned Pollux detector
(live executor observer + fusion). It is the authoritative place to:

- Track **corpus changes** (scripted-trace additions/removals) over time.
- Record **aggregate metrics** (precision/recall/F1) and required breakdowns.
- Capture **false-positive / false-negative** highlights and tuning notes.
- Provide a repeatable reference for benchmark **condition F** comparisons.

## Corpus

- **Corpus source**: `packages/core/src/pollux/observer/calibrationCorpus.ts`
- **Harness**: `packages/core/src/pollux/observer/calibration.ts`
- **Corpus size (N)**: <!-- fill -->
- **Trace categories**:
  - true_positive: <!-- count -->
  - true_negative: <!-- count -->
  - boundary: <!-- count -->

### Coverage checklist

- **Hard-precision**:
  - risk gate (`risk.pre_tool_high`): <!-- yes/no -->
  - loop bridge (`loop.hard_confirmed`): <!-- yes/no -->
  - self-report stuck (`self.structured_status_stuck`): <!-- yes/no -->
- **Thought signals** (`thought.*`): <!-- yes/no -->
- **Tool pattern signals** (`tool.*`): <!-- yes/no -->
- **Negative signals** (`neg.*`): <!-- yes/no -->
- **Composite / fusion behavior**:
  - composite gating (`requireComposite`): <!-- yes/no -->
  - same-turn vs next-turn behavior: <!-- yes/no -->

## Aggregate metrics

> Compute these using the calibration harness
> (`runCalibrationCorpus(CALIBRATION_CORPUS)`).

- **TP / FP / FN / TN**: <!-- fill -->
- **Precision**: <!-- fill -->
- **Recall**: <!-- fill -->
- **F1**: <!-- fill -->

### Required breakdowns

- **False-positive rate by category** (thought/tool/self):
  - thought: <!-- fill -->
  - tool: <!-- fill -->
  - self: <!-- fill -->
- **Mean contributing-signal count on escalations**: <!-- fill -->

## False positives (high-signal examples)

List the most informative false positives, focusing on why the detector
escalated and what signal(s) dominated.

- **Trace**: <!-- id -->
  - **Observed signals**: <!-- ids -->
  - **Why FP matters**: <!-- brief -->
  - **Candidate tuning**: <!-- change knobs / priors / weights / thresholds -->

## False negatives (high-signal examples)

List the most informative false negatives, focusing on what the detector missed
and whether that is acceptable.

- **Trace**: <!-- id -->
  - **Expected signals**: <!-- ids -->
  - **Why FN matters**: <!-- brief -->
  - **Candidate tuning**: <!-- change knobs / priors / weights / thresholds -->

## Tuning notes

### Changes since last report

- <!-- bullet list of changes -->

### Rationale / trade-offs

- <!-- note trade-offs, precision vs recall, and why changes are acceptable -->

## Benchmark alignment (Condition F)

Record how these calibration results relate to the benchmark runner outputs for
condition **F**:

- **Shared task set**: `packages/core/src/pollux/benchmark/tasks.ts`
- **Legacy baseline**: <!-- condition(s) and result -->
- **Condition F** (redesigned detector): <!-- result -->
- **Acceptance gates**:
  - F1 parity vs legacy on shared set: <!-- pass/fail -->
  - True-negative precision ≥ 0.90: <!-- pass/fail -->
