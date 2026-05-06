# P4-20 Pollux v1 Stratified Benchmark

Version: 1.0 Date: 2026-05-06 Status: Implemented corpus and verifier foundation

## Purpose

Pollux v1 is the rebuilt custom benchmark suite for defensible A/E/FD
comparison. It replaces the prior FD-focused 8-task diagnostic story with a
frozen 15-task matrix:

1. five task families
2. three difficulty levels per family
3. five repeats per A/E/FD track for the final claim campaign

The benchmark is SWE-bench-inspired because success is determined by executable
tests against final workspace state. It is not SWE-bench and must not be
described as broad open-source software engineering performance.

## Implemented Artifacts

Corpus root:

```text
benchmarks/pollux-v1/
```

Core loader and verifier:

```text
packages/core/src/pollux/benchmark/polluxV1Tasks.ts
packages/core/src/pollux/benchmark/polluxV1Tasks.test.ts
```

The frozen selected set contains 15 tasks:

1. `pollux-v1-cross-contract-easy-01`
2. `pollux-v1-cross-contract-medium-01`
3. `pollux-v1-cross-contract-hard-01`
4. `pollux-v1-test-intent-easy-01`
5. `pollux-v1-test-intent-medium-01`
6. `pollux-v1-test-intent-hard-01`
7. `pollux-v1-guarded-migration-easy-01`
8. `pollux-v1-guarded-migration-medium-01`
9. `pollux-v1-guarded-migration-hard-01`
10. `pollux-v1-source-truth-easy-01`
11. `pollux-v1-source-truth-medium-01`
12. `pollux-v1-source-truth-hard-01`
13. `pollux-v1-multi-artifact-easy-01`
14. `pollux-v1-multi-artifact-medium-01`
15. `pollux-v1-multi-artifact-hard-01`

## Evaluation Contract

Each task has:

1. `task.yaml`
2. `base/`
3. `tests/fail_to_pass/`
4. `tests/pass_to_pass/`
5. `solution/`
6. `solution.patch`
7. `review.json`
8. `notes.md`

The verifier:

1. copies hidden tests into a candidate workspace
2. runs fail-to-pass tests
3. runs pass-to-pass tests
4. compares protected-file hashes against the base fixture

A task succeeds only when all three checks pass.

## Anti-Bias Rule

The final task set is selected by family and difficulty, not by FD outcomes. FD
results must not be used to decide which tasks remain in the frozen suite.

A/E calibration may be used only to detect:

1. mislabeled difficulty
2. flaky tests
3. invalid or underspecified tasks

## Current Limitations

This implementation creates the frozen 15-task corpus, reference solution
materialization, and executable verifier tests. It does not run the expensive
225-sample live A/E/FD campaign.

The `solution.patch` files are present as publication placeholders while the
automated reference validation uses the `solution/` directories. Before external
publication, regenerate each `solution.patch` from `base/` to `solution/`.

FD is still marked diagnostic/non-publishable in the existing real-run condition
configuration. A final value claim should either update that condition policy or
explicitly describe FD as the detector-only diagnostic track.

## Validation

Focused validation command:

```powershell
npm.cmd run test -w @google/gemini-cli-core -- src/pollux/benchmark/polluxV1Tasks.test.ts
```

Expected properties:

1. selected set loads as 15 frozen tasks
2. each family has exactly one easy, medium, and hard task
3. every unmodified base workspace fails fail-to-pass tests
4. every reference solution passes fail-to-pass, pass-to-pass, and protected
   hashes
5. protected-file mutation is rejected

## Resume-Safe Claim

Use:

```text
Built a 15-task stratified agentic coding benchmark across 5 task families and
3 difficulty levels, using hidden executable tests and protected regression
checks to prepare A/E/FD evaluation over 225 planned runs.
```

Use the stronger completed-run claim only after the live A/E/FD campaign has
actually run.
