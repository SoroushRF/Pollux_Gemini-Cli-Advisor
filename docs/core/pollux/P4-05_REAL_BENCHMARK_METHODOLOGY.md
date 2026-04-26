# P4-05 Real-Model Benchmark Methodology

Version: 1.2 Generated: 2026-04-26 Status: Open contract (no real-model run
published) TG mapping: TG-1, TG-4 (acceptance criteria)

> Canonical detector behavior references:
>
> - `docs/core/pollux/DETECTOR_IMPLEMENTATION_PLAN.md`
> - `docs/core/pollux/P4-07_DETECTOR_CALIBRATION_REPORT.md`
>
> Legacy strategy comparisons (`heuristic` / `structured` / `hybrid`) are
> historical only and not applicable to current runtime claims.

---

## 0) Why this document exists

`docs/core/pollux/P4-05_BENCHMARK_METRICS_REPORT.md` is a synthetic harness
self-test. It validates harness plumbing and telemetry accounting, not real
model quality.

This document defines the contract required before publishing any real-model
executor-vs-advisor performance claims.

## 1) Corpus expansion requirements

Current synthetic corpus is small (`CAL-BM-01..04`). A real-model run requires:

- Difficulty stratification: ✅ **Met** (8 simple, 8 moderate, 8 complex in
  `realTasks.ts`).
- Escalation stratification aligned to observer-era behavior:
  - ✅ **Met** (8 `escalates: true` tasks).
  - ✅ **Met** (16 `escalates: false` tasks).
  - Sets are disjoint.
- Oracle determinism: **Open** (Tasks exist, but `positiveFixturePaths` and
  `negativeFixturePaths` are still mostly empty/placeholders).
- Domain coverage: ✅ **Met** (all 6 required domains covered).
- Provenance: ✅ **Met** (each task in `realTasks.ts` cites a source).

## 2) Sample size and statistical bar

A real run must satisfy:

- N >= 30 per cell.
- Wilson 95% half-width <= 0.10 for per-condition accuracy rates.
- Pre-registered minimum effect size before run starts (suggest >= 5 absolute
  points on escalating subset).
- Power analysis recorded before run start (1-beta >= 0.8, alpha 0.05).

## 3) Independence and isolation

Before run start, enforce:

- Independent quota windows (or account isolation) for rate-limited cells.
- Latency split between service-side latency and wall-clock latency.
- Frozen prompt/system seed and tool definitions for the full campaign.
- No hidden retries/regenerations that corrupt token accounting.
- Per-sample wall-clock and model-response ceilings recorded in the campaign
  artifact so runaway verification loops become explicit invalidations rather
  than silent contamination.
- If calibration is staged, A-screen exclusion rules must be pre-registered
  before any E-confirmation run starts.
- If calibration is staged, final `A` / `E` / `F` value estimates must come from
  a post-freeze value campaign rather than reusing calibration-stage `A` or `E`
  measurements.

## 4) Token accounting and reconciliation

Contract strengthens to:

- Per-call attribution from API usage metadata.
- Advisor calls attributed to `LlmRole.UTILITY_ADVISOR`; executor calls to
  `LlmRole.MAIN`.
- Identity `total = advisor + executor` holds per run and per cell aggregate.
- Any model-using utility shims (summarizer/compressor) must be attributed to
  their dedicated roles.
- USD cost must be reported from published price tiers alongside token counts.

## 5) Escalation confusion matrix (observer era)

Expected positive label remains task-level `escalates: true`; predicted positive
remains observed advisor-consult telemetry events.

Required breakdowns for current runtime:

- Timing stratification: precision/recall split by `escalationTiming`
  (`same_turn`, `next_turn`, plus `missing_event` for expected-positive samples
  with no consult-related telemetry).
- Reason-code stratification using current enum values (for example
  `RISK_GATE_BLOCK`, `HARD_LOOP`, `SELF_REPORT_STUCK`,
  `FUSION_COMPOSITE[_EMPHATIC]`, `LIVE_OBSERVER_MATCH`).
- `BUDGET_EXHAUSTED` is a separate bucket (not silently counted as FN).
- `FAIL_OPEN` is a separate bucket (not silently counted as TP/FP).
- Malformed Pollux status near-misses are diagnostics, not escalation evidence.
  Only valid `<pollux:status stuck_on="..." next="..."/>` tags may count toward
  self-report escalation.

Legacy strategy-stratified B/C/D precision/recall is not applicable after Phase
I detector deletion.

## 6) Reproducibility

Every published number must be reproducible from:

- Corpus snapshot SHA
- CLI build SHA + lockfile
- CLI entrypoint kind/path and build freshness metadata
- Condition matrix and settings overrides
- Fairness pin evidence
- Prompt/system seed
- API request IDs where available
- Any A-screen survivor manifest, exclusion rationale, and frozen selected-task
  manifest used to narrow the candidate pool

If a reviewer cannot rerun a cell and match within CI bounds, reject the run.

## 7) Acceptance criteria for a real-model report

A real-model report may be published under `docs/core/pollux/` only when all are
true:

1. Corpus satisfies section 1.
2. Statistical requirements in section 2 are pre-registered and met.
3. Isolation requirements in section 3 are met with evidence.
4. Token reconciliation in section 4 has zero rejected cells.
5. Confusion matrix in section 5 includes timing/reason breakdowns.
6. Reproducibility requirements in section 6 are met.
7. Synthetic harness self-test passes on the same CLI build used for the run.
8. Preflight build freshness is clean and dist/source git metadata agrees.
9. Invalidations distinguish auth failures, rate/quota contamination,
   model-capacity exhaustion, timeouts, and model-call ceiling breaches.
10. If M3 uses staged calibration, task selection is based on baseline evidence
    only and the final `A` / `E` / `F` comparison comes from a separate
    post-freeze value campaign.

Until section 1-7 hold, no artifact in this repo should present executor vs
advisor comparison as a real benchmark result.
