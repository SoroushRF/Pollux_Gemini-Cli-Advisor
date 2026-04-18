# P4-01: Benchmark Task Corpus and Oracle Reliability Checks

Version: 1.0 Date: 2026-04-18 Status: Active TG mapping: TG-1

---

## 1) Purpose

This document defines the benchmark task corpus and oracle reliability checks as
required by Phase 4, Task P4-01 of the Pollux IMPLEMENTATION_PLAN.

The corpus provides a set of tasks (`BENCHMARK_CORPUS`) spanning `simple`,
`moderate`, and `complex` difficulties, which are used to evaluate model
accuracy across the Conditions A-E.

## 2) Task Corpus Design

The benchmark corpus (`packages/core/src/pollux/benchmark/tasks.ts`) provides a
deterministic structure for running benchmarks:

- **Simple (`CAL-BM-01-SIMPLE`)**: Focuses on direct generation capability
  without requiring tool chains or deep contextual understanding.
- **Moderate (`CAL-BM-02-MODERATE`)**: Requires reading, parsing, and writing
  artifacts using single-stage tool interactions.
- **Complex (`CAL-BM-03-COMPLEX`)**: Requires multi-step debugging, exploration,
  tool chaining, and logical deduction. It is designed to expose discrepancies
  between generic _Executor_ processing and the robust _Advisor_ escalation
  logic.

## 3) Oracle Reliability Checks

Each task comes with an `oracle(stdout: string, workspaceDir: string): boolean`
resolver. The accuracy of the benchmark conditions is entirely evaluated based
on these deterministic checks.

### Oracle Reliability Properties:

1. **Deterministic Execution**: Relies strictly on file presence, valid JSON
   structure, or explicit content rather than probabilistic text matching.
2. **False-Positive Prevention**: Checks target strictly and fails closed if
   there are parsing errors.
3. **Artifact-Driven Validity**: Evaluates side effects applied to the
   `TestRig`'s isolated `workspaceDir`, ensuring session isolation (as defined
   by FP-05).

## 4) Acceptance Criteria Contribution

- `BENCHMARK_CORPUS` is built with multi-level difficulties to distinguish
  baseline vs escalated accuracy.
- Oracles are highly deterministic (strict file parsing, not LLM-as-a-judge).
- Fulfills the Phase 4 Entry requirement (P4-01 deliverable) for building out
  the reliable comparison datasets for the `BenchmarkHarness`.
