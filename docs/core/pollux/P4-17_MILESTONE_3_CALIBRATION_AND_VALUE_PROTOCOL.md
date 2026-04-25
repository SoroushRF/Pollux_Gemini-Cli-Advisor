# P4-17 Milestone 3: Calibration And Value Protocol

Version: 1.0 Date: 2026-04-25 Status: Local M3 implementation contract

## Purpose

This protocol turns the Milestone 3 product-value handoff into an executable
benchmark shape.

Milestone 3 asks a different question than Milestone 2:

- Milestone 2 asked whether the live runner, canary lane, advisor attempts, and
  repeat-aware reporting were trustworthy.
- Milestone 3 asks whether Pollux creates value on calibrated hard tasks: Flash
  plus Pollux advisor should improve over Flash alone while remaining materially
  cheaper than Pro-only execution.

The thesis comes from
`docs/core/pollux/P4-16_MILESTONE_3_PRODUCT_VALUE_BENCHMARK_HANDOFF.md`,
especially sections `7) M3 Benchmark Thesis`,
`9) M3 Must Use Calibration, Not Guesswork`, and `12) Proposed M3 Workstreams`.

## Source Of Truth

M3 inherits these existing contracts:

1. `docs/core/pollux/P4-08_REAL_BENCHMARK_DOCTRINE.md`
   - real CLI path only
   - telemetry authenticity
   - fairness inheritance
   - headless non-interactive CLI surface
2. `docs/core/pollux/P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md`
   - condition `A`: Flash only
   - condition `E`: Pro only
   - condition `F`: Flash executor plus Pro advisor
   - invalidation rules and artifact preservation
3. `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`
   - corpus expansion discipline
   - pre-registered statistical bars
   - isolation and reproducibility requirements before publishable claims

M3 does not loosen those contracts. It adds a product-value layer above them.

## Default Local M3 Shape

Defaults:

1. candidate pool target: `30` local tasks
2. calibration repeats: `3`
3. selected value subset target: `8-15` tasks
4. value repeats: `3`
5. calibration conditions: `A`, `E`
6. value conditions: `A`, `E`, `F`

The local M3 runner remains pilot or dress-rehearsal evidence unless the
publishability requirements in `P4-05_REAL_BENCHMARK_METHODOLOGY.md` are
satisfied separately.

## Calibration Labels

Each candidate task receives one label:

1. `easy`
   - Flash passes too often, so there is not enough headroom for advisor value.
2. `discriminative`
   - Flash is weak, Pro is strong, and invalidation noise is low enough.
3. `impossible_or_noisy`
   - Pro does not pass often enough, so the task is not a clean solvability
     target.
4. `flaky`
   - invalidation or infrastructure noise exceeds the stable-task threshold.

Initial thresholds:

1. Flash pass-rate ceiling for discriminative tasks: `0.50`
2. Pro pass-rate floor for discriminative tasks: `0.67`
3. invalid-rate ceiling for stable tasks: `0.20`
4. minimum selected value tasks: `8`
5. maximum selected value tasks: `15`

Calibration must select tasks from `A` and `E` results only. Pollux condition
`F` must not be used to select the value subset.

## Value Criteria

The first value suite uses the frozen selected task set emitted by calibration.

Initial value thresholds:

1. `F` must beat `A` by at least `10` absolute percentage points.
2. `F` cost per task must be no more than `0.70 * E`.
3. `F` cost per success must be no more than `0.70 * E`.
4. invalid rate must remain at or below `0.20`.
5. selected task count must be at least `8`.

Required value metrics:

1. pass rate by condition
2. absolute `F - A` pass-rate uplift
3. gap closed by `F`: `(F - A) / (E - A)`
4. cost per task
5. cost per successful task
6. advisor token share for `F`
7. advisor calls per valid `F` run
8. invalidation disclosure

## Artifact Layout

Calibration:

```text
artifacts/pollux/real-runs/<batch-id>/
  calibration-campaign/
    manifest.json
    raw/
    summary.json
    report.md
  calibration-summary.json
  calibration-report.md
  selected-task-set.json
```

Value:

```text
artifacts/pollux/real-runs/<value-id>/
  selected-task-set.json
  value-campaign/
    manifest.json
    raw/
    summary.json
    report.md
  value-summary.json
  value-report.md
```

## Commands

Calibration:

```bash
npm.cmd run benchmark:pollux:real:calibrate -- --batch-id m3-calibration-001 --repeats 3 --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json
```

Value:

```bash
npm.cmd run benchmark:pollux:real:value -- --value-id m3-value-001 --selected-task-set artifacts/pollux/real-runs/m3-calibration-001/selected-task-set.json --repeats 3 --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json
```

Use small smoke runs before full M3 runs, especially when operating under a
single Gemini account quota window.

## Third-Party Benchmark Readiness

Local M3 comes first. Later SWE-bench-style, Terminal-Bench-style, or other
external benchmark adapters should preserve the same pattern:

1. calibrate without Pollux using weak and strong baselines
2. freeze the selected subset
3. run `A`, `E`, and `F`
4. report success, cost, latency, advisor share, and invalidations

External benchmark adapters must not change the product-value comparison.
