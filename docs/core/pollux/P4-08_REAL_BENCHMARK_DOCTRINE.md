# P4-08 Real Benchmark Doctrine

Version: 1.0 Date: 2026-04-22 Status: Foundation in repo, pilot lane enabled,
publishable lane still gated

---

## 1) Purpose

This document defines what the Pollux project means by:

1. synthetic benchmark evidence
2. live pilot evidence
3. publishable real-model evidence

It exists to prevent a common failure mode: treating a valid internal live run
as if it were already a publishable benchmark claim.

This doctrine extends, and does not replace, the existing contracts in:

1. `IMPLEMENTATION_PLAN.md`
2. `POLLUX_SPEC.md`
3. `docs/core/pollux/P0-05_BENCHMARK_FAIRNESS_HARNESS_CONTRACT.md`
4. `docs/core/pollux/P2-07_CROSS_SURFACE_INTEGRATION_MATRIX.md`
5. `docs/core/pollux/P4-05_REAL_BENCHMARK_METHODOLOGY.md`

---

## 2) Non-negotiable rules

### 2.1 Runtime authenticity

Real benchmarks must run the real CLI path.

That means:

1. no direct detector-helper calls
2. no benchmark-only advisor shortcut
3. no parallel token sink
4. no alternate detector
5. no benchmark-only model invocation path

### 2.2 Telemetry authenticity

Real benchmark evidence must extend the existing telemetry path.

That means:

1. advisor attribution remains `LlmRole.UTILITY_ADVISOR`
2. `api_request` and `api_response` remain the measurement source of truth
3. token reconciliation must still satisfy TG-4 expectations

### 2.3 Fairness inheritance

The real benchmark lane inherits the fairness pins already defined for the
synthetic harness:

1. router pinned
2. loop-detector suppression in fairness mode
3. availability reset
4. fixed dynamic config
5. fresh isolated sessions
6. deterministic sandbox/process posture

### 2.4 Canonical surface

Real Pollux benchmarks use the headless non-interactive CLI path only.

This is intentional.

Cross-surface parity is already covered by the Phase 2 matrix and its tests.
Real benchmarking is not the place to re-run a full surface matrix with added
cost and noise.

### 2.5 CI alignment

Real-model paid runs do not become mandatory PR gates.

The synthetic benchmark lane remains the cheap PR-safe regression lane. Live
runs are introduced first as local pilot flows, then as deliberate manual or
scheduled workflows.

---

## 3) The three benchmark lanes

### Lane A: Synthetic regression lane

Purpose:

1. verify fairness pins
2. verify harness plumbing
3. verify token reconciliation
4. verify synthetic reproducibility

Artifacts today:

1. `P4-03_SMOKE_BENCHMARK_REPRODUCIBILITY.md`
2. `P4-04_FULL_BENCHMARK_CHECKPOINT_RESUME.md`
3. `P4-05_BENCHMARK_METRICS_REPORT.md`
4. `P4-06_FAIRNESS_AUDIT_LOG.md`

This lane is regression evidence, not model-quality evidence.

### Lane B: Live pilot lane

Purpose:

1. validate the standalone live runner
2. validate artifact completeness
3. validate telemetry completeness
4. validate token and cost reporting
5. validate task ergonomics and invalidation rules

Allowed characteristics:

1. local-first
2. one paid setup
3. small repeat counts
4. seed corpus or sentinel subset

Required labeling:

1. live
2. pilot
3. single-account
4. non-publishable

### Lane C: Publishable real campaign lane

Purpose:

Generate repo-grade real-model evidence.

Required additions beyond pilot:

1. isolated credentials or quota windows
2. preregistration
3. power analysis
4. methodology-minimum corpus
5. frozen pricing snapshot
6. raw artifact bundle
7. synthetic self-test green on the same build

---

## 4) Allowed claims by lane

### Synthetic lane

Allowed:

1. harness works
2. fairness pins work
3. advisor telemetry is observed where expected
4. token accounting reconciles

Not allowed:

1. real executor-vs-advisor quality claim
2. real cost/performance claim

### Live pilot lane

Allowed:

1. the live runner works
2. Pollux escalates through the real CLI path
3. live token and latency capture works
4. cost estimation pipeline works
5. the task set is or is not stable enough for a bigger campaign

Not allowed:

1. publishable benchmark claim
2. external-facing conclusion that F beats A or E in production

### Publishable lane

Allowed:

Only when `P4-05_REAL_BENCHMARK_METHODOLOGY.md` is fully satisfied.

---

## 5) Current repo state

As of 2026-04-22:

1. Synthetic lane is implemented and green.
2. Live pilot foundation exists in `packages/test-utils/src/pollux-real-*`.
3. Publishable lane remains blocked by methodology gaps, especially corpus size,
   fixture coverage, isolated credentials, preregistration discipline, and
   publishable telemetry completeness.

---

## 6) Doctrine outcome

If a future artifact does not clearly say whether it is synthetic, pilot, or
publishable, treat it as invalid benchmark communication until corrected.
