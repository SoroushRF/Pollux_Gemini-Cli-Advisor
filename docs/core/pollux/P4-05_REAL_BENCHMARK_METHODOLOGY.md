# P4-05 Real-Model Benchmark Methodology

Version: 1.0 Generated: 2026-04-18 Status: Open contract (no real-model run
published) TG mapping: TG-1, TG-4 (acceptance criteria)

---

## 0) Why this document exists

The artifact at `docs/core/pollux/P4-05_BENCHMARK_METRICS_REPORT.md` is a
**synthetic harness self-test**. Every number it publishes (accuracy, token
mean, latency mean, 95% CIs, escalation precision/recall) is derived from
deterministic fake-response fixtures replayed by
`packages/test-utils/src/benchmark-harness.ts`. The fixtures are written by
hand; the executor and advisor model identifiers in the condition matrix are
labels, not invocations.

This is fine for what the synthetic report claims to verify:

- the harness plumbing reports stable, reproducible values across repeats,
- token reconciliation `total = advisor + executor` holds (TG-4),
- the escalation confusion matrix is non-degenerate (a TP exists),
- fairness pins are derived from runtime telemetry observables (P4-06),
- session-resume continuity holds across the matrix (P4-04).

It is **not** fine for any model performance claim. Comparing `gemini-2.5-flash`
to `gemini-3-pro-preview` from the synthetic numbers is invalid by construction
because the fixtures were authored to make both succeed. This document defines
the contract a real-model run must satisfy before any executor-vs.-advisor
benchmark claim is published.

## 1) Corpus expansion requirements

The synthetic corpus has four tasks (`CAL-BM-01-SIMPLE`, `CAL-BM-02-MODERATE`,
`CAL-BM-03-COMPLEX`, `CAL-BM-04-ESCALATING`). A real-model run requires a
substantially larger corpus. Minimum acceptable shape:

- **Difficulty stratification.** At least 8 tasks per difficulty bucket
  (`simple`, `moderate`, `complex`) for a total of >= 24 base tasks.
- **Escalation stratification.** At least 8 tasks marked `escalates: true` whose
  prompts deliberately trip the heuristic, structured, or hybrid detector (mix
  all three). At least 8 tasks marked `escalates: false` whose prompts are
  confirmed by the `tasks.test.ts` cue inventory NOT to trip any detector under
  any strategy. The two sets must be disjoint.
- **Oracle determinism.** Each task must ship with both positive fixtures (an
  example workspace state the oracle must accept) and negative fixtures (>= 3
  examples of plausibly-wrong workspace state the oracle must reject). The
  oracle test in `packages/core/src/pollux/benchmark/tasks.test.ts` is the gate;
  do NOT add a new task without expanding that test in the same change.
- **Domain coverage.** Tasks must cover at minimum: file authoring, multi-file
  refactor, JSON/YAML transformation, shell-tool chain, read-then-write, and
  code search-and-summarize. A real benchmark cannot be dominated by a single
  tool family.
- **Provenance.** Each task description, prompt, files, and oracle must cite a
  real upstream source (issue, ticket, internal write-up, or public benchmark
  adapter) so reviewers can audit the source of difficulty.

## 2) Sample size and statistical bar

The synthetic report runs N=2 per cell (initial + resume) and the condition CIs
are degenerate (n=8 per condition for the new corpus). That is sufficient for
harness self-test but not for a model comparison.

A real run must satisfy:

- **N >= 30 per cell.** Each (task, condition) cell repeats with N >= 30 fresh
  sessions. With 24 tasks and 5 conditions that is 24 _ 5 _ 30 = 3600 fresh CLI
  subprocesses minimum. Resume is a separate, equally sized run set (not free).
- **CI half-width discipline.** For accuracy rate CIs, the Wilson 95% half-width
  on the per-condition rate must be <= 0.10 absolute. If a condition's CI is
  wider, increase N for that condition until it is not. Synthetic reports may
  publish degenerate CIs; real reports may not.
- **Pre-registered effect size.** The minimum reportable effect for "Pollux
  improves accuracy on escalating tasks" must be declared before the run starts
  (suggest: >= 5 percentage points absolute on the escalating subset). Post-hoc
  effect size selection invalidates the conclusion.
- **Power analysis.** A power calculation (1-beta >= 0.8 at alpha 0.05 for the
  pre-registered effect size) must be performed and recorded before the run
  starts; if N is insufficient, increase N.

## 3) Independence and isolation

Every cross-run interaction below must be ruled out by construction before the
run begins. The fairness audit in `docs/core/pollux/P4-06_FAIRNESS_AUDIT_LOG.md`
enforces these for the synthetic harness; a real run inherits the same
enforcement plus the additional checks in this section.

- **Fresh API quota window per condition.** Conditions with rate-limited models
  (B, C, D, E) must run in independent quota windows or with account isolation;
  rate-limit retries skew latency CIs.
- **Network jitter normalization.** Latency must be reported as model
  service-side latency (when the API exposes it) AND as wall-clock latency, with
  the difference attributed. Wall-clock-only latency from a developer laptop is
  not a publishable model latency claim.
- **Deterministic prompt seeding.** Every cell must record the exact prompt
  seed, system prompt, and tool definitions used. A real run freezes the system
  prompt for the entire campaign; if the system prompt changes mid-campaign the
  campaign restarts.
- **No retries hidden inside the executor.** Loop detection must be pinned off
  (FP-02) and any internal retry/regenerate logic in the CLI must be confirmed
  disabled in the run settings; otherwise token counts are double-billed and the
  reconciliation identity is bogus.

## 4) Token accounting and reconciliation

Token reconciliation is currently TG-4. For a real run, the contract strengthens
to:

- Per-call token attribution must come from the model API's `usage_metadata` (or
  equivalent). Attributed roles must be `LlmRole.UTILITY_ADVISOR` for advisor
  calls and `LlmRole.MAIN` for executor calls.
- The identity `total = advisor + executor` must hold per run AND per cell
  aggregate. Any per-cell drift triggers cell rejection (the cell is excluded
  from the report and re-run).
- Tokens used by tool execution shims that internally call models (e.g.
  summarizers) must be attributed to their dedicated roles
  (`UTILITY_SUMMARIZER`, `UTILITY_COMPRESSOR`) and surfaced separately; they
  MUST NOT be silently bucketed into executor or advisor.
- Token cost (USD) is derived from the published price tier of each attributed
  model and reported alongside token counts. Cost is part of the comparison, not
  a footnote.

## 5) Escalation confusion matrix

The synthetic report's confusion matrix uses task-level `escalates` flag as the
expected positive label and observed `utility_advisor` telemetry events as the
predicted positive signal. That semantic survives into the real run, with these
additions:

- **Strategy stratification.** Precision and recall must be reported separately
  for conditions B (heuristic), C (structured), and D (hybrid). A single
  combined number hides per-strategy regressions.
- **Escalation budget exhaustion is a separate bucket.** Cases where the
  detector wanted to fire but the per-turn or per-session budget was exhausted
  must be reported as `BUDGET_EXHAUSTED`, not silently collapsed into FN.
- **Fail-open is a separate bucket.** Cases where the advisor was invoked but
  the response was empty / unparseable / timed out must be reported as
  `FAIL_OPEN`, not silently collapsed into TP or FP. Fail-open is part of the
  safety contract (POLLUX_SPEC §5 fail-open), not part of the precision/recall
  numerator.

## 6) Reproducibility

- Every published number must be reproducible from a recorded set of inputs:
  corpus snapshot (git SHA), CLI build (git SHA + lockfile), condition matrix,
  settings overrides, fairness pin enforcement evidence, prompt/system seed, and
  (where applicable) the API service-side request IDs.
- The aggregate report must publish enough provenance per cell that an outside
  reviewer can re-run a single cell and obtain matching numbers within the
  published CI. If they cannot, the run is rejected.

## 7) Acceptance criteria for a real-model report

A real-model report may be added to `docs/core/pollux/` (suggested path:
`P4-05_BENCHMARK_REAL_RUN_<DATE>.md`) only when ALL of the following are true:

1. Corpus satisfies §1.
2. Run plan satisfies §2 (N, CI half-width, pre-registered effect, power
   analysis recorded before the run).
3. Isolation satisfies §3, with evidence in the fairness audit log.
4. Token reconciliation satisfies §4 with zero rejected cells.
5. Confusion matrix satisfies §5 with stratified precision/recall.
6. Reproducibility satisfies §6 with full provenance.
7. The synthetic harness self-test (current `P4-05_BENCHMARK_METRICS_REPORT.md`)
   passes on the same CLI build used for the real run; harness regression
   invalidates the real-run numbers.

Until §1-§7 are satisfied, no published artifact in this repo may characterize
the executor vs. advisor comparison as a benchmark.
