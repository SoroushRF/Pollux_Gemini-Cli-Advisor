# P4-17 Milestone 3: Calibration And Value Protocol

Version: 1.1 Date: 2026-04-26 Status: Local M3 staged-calibration contract

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
2. A-screen repeats: `3`
3. E-confirmation repeats: `3`
4. selected value subset target: `8-15` tasks
5. value repeats: `3`
6. A-screen condition: `A`
7. E-confirmation condition: `E`
8. value conditions: `A`, `E`, `F`

The local M3 runner remains pilot or dress-rehearsal evidence unless the
publishability requirements in `P4-05_REAL_BENCHMARK_METHODOLOGY.md` are
satisfied separately.

M3 now uses a staged calibration flow to conserve strong-model budget without
letting Pollux influence task selection:

1. run a full `A` screen on the entire candidate pool
2. remove only pre-registered A-only exclusions
3. run a full `E` confirmation pass on the survivors
4. assign final calibration labels from `A` and `E` only
5. freeze the selected task set
6. run a mandatory `F` smoke on a representative subset of the frozen tasks
7. run the separate `A` / `E` / `F` value campaign only if the smoke shows
   M3-aligned advisor evidence on the intended subset

Calibration samples are selection evidence. They must not be reused as the final
`A` or `E` value estimates after the subset is frozen.

This protocol treats `A/E discriminative` and `F escalation-ready` as separate
gates:

1. `A/E discriminative`
   - Flash is weak enough and Pro is strong enough for the task set to matter.
2. `F escalation-ready`
   - live Pollux detector evidence is strong enough to actually consult the
     advisor on the same hard-task patterns.

## A-Screen Survivor Rules

The A-screen is a formal stage, not an informal triage.

After the full `A` run on the candidate pool:

1. exclude tasks as `easy` when Flash pass rate is above the discriminative
   ceiling
2. exclude tasks as `flaky` when Flash invalid rate is above the stable-task
   ceiling
3. carry every remaining task forward as an `A` survivor for `E` confirmation
4. do not assign final `discriminative` or `impossible_or_noisy` labels from `A`
   alone
5. record every exclusion and survivor decision in artifact form

## Calibration Labels

After `E` confirmation, each A-survivor task receives one final label:

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

Calibration must select tasks from A-screen and E-confirmation results only.
Pollux condition `F` must not be used to select the value subset.

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

The value report must also surface whether `F` produced M3-aligned advisor
evidence on the frozen selected set. A zero-advisor or generic-safety-only `F`
suite is diagnostic-only detector-miss evidence, not valid product-value
evidence.

## Artifact Layout

Calibration:

```text
artifacts/pollux/real-runs/<batch-id>/
  a-screen-campaign/
    manifest.json
    raw/
    summary.json
    report.md
  a-screen-summary.json
  a-survivor-set.json
  e-confirmation-campaign/
    manifest.json
    raw/
    summary.json
    report.md
  e-confirmation-summary.json
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

## Run Flow

Reference staged flow:

1. A-screen: run the full candidate pool under condition `A`
2. A-screen filter: remove only pre-registered `easy` and `flaky` tasks
3. E-confirmation: run the full survivor pool under condition `E`
4. calibration freeze: keep only final `discriminative` tasks
5. F smoke: run `F` on a representative subset of the frozen selected task set
6. value campaign: run `A`, `E`, and `F` on the frozen selected task set only if
   the smoke shows real M3-aligned advisor evidence

Current helper names may lag this contract. Treat the staged flow above as the
normative M3 benchmark logic.

Use small smoke runs before full M3 runs, especially when operating under a
single Gemini account quota window.

If the `F` smoke shows zero M3-aligned advisor evidence, stop the workflow
there. That is not a failed value run. It is detector-alignment evidence that
Pollux is not yet escalation-ready for the frozen hard-task set. A Pro consult
caused only by generic safety risk, such as destructive shell protection, is
useful plumbing evidence but does not clear the M3 smoke gate.

Legacy A-only helper output remains provisional if it is used only to narrow a
candidate pool without the formal staged-calibration artifacts above. Official
M3 selection still requires:

1. a full `A` screen across the full pool
2. a recorded A-only survivor filter
3. a full `E` confirmation pass across those survivors
4. a frozen selected task set emitted before any `F` run
5. a recorded `F` smoke result before the final value campaign

## Third-Party Benchmark Readiness

Local M3 comes first. Later SWE-bench-style, Terminal-Bench-style, or other
external benchmark adapters should preserve the same pattern:

1. run the weak baseline across the candidate pool
2. exclude only pre-registered weak-baseline rejects
3. run the strong baseline across the survivors
4. freeze the selected subset from baseline evidence only
5. run a separate final `A`, `E`, and `F` value campaign on the frozen subset
6. report success, cost, latency, advisor share, and invalidations

External benchmark adapters must not change the product-value comparison.
