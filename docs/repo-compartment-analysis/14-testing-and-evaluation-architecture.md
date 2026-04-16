# Compartment 14: Testing and Evaluation Architecture

## Purpose

Analyze how correctness, regression, memory, performance, and behavioral quality
are validated across the repository.

This compartment defines confidence mechanisms for code and architecture claims.

## Boundary

In scope:

- eval suites,
- integration tests and response fixtures,
- memory and performance regression suites,
- shared test harness utilities,
- CI-triggered test orchestration references.

Primary paths:

- `evals`
- `integration-tests`
- `memory-tests`
- `perf-tests`
- `packages/test-utils`
- `docs/integration-tests.md`

Out of scope:

- release pipeline strategy,
- docs and governance process,
- individual runtime module internals.

## Key Questions To Answer

1. What confidence dimensions are covered (functional, behavioral, memory,
   perf)?
2. Which test suites run by default vs explicitly?
3. How are fixtures/goldens managed and regenerated?
4. How are baselines maintained for memory and performance?
5. What gaps remain for high-risk compartments?

## Data Gathering Checklist

1. Enumerate test directories and harness structure.
2. Read root scripts for test execution mapping.
3. Inspect eval categories and target behaviors.
4. Inspect integration fixture model.
5. Inspect memory/perf baseline workflows.

## Step-by-Step Analysis Recipe

### Step 1: Map test execution entrypoints

Read:

- root `package.json` test scripts,
- package-level test scripts where relevant.

Capture:

- default test coverage,
- optional/explicit suites,
- nightly-only or matrix-driven suites.

### Step 2: Analyze eval framework

Read:

- `evals/README.md`
- representative files in `evals/*.eval.ts`
- helper files in `evals/test-helper.ts` and related modules.

Capture:

- evaluation goals,
- deterministic vs probabilistic checks,
- domains covered.

### Step 3: Analyze integration testing model

Read:

- `docs/integration-tests.md`
- `integration-tests/test-helper.ts`
- representative `*.responses` and `*.test.ts` files.

Capture:

- binary-under-test approach,
- fixture/golden usage,
- sandbox matrix behavior.

### Step 4: Analyze memory regression suite

Read:

- `memory-tests/memory-usage.test.ts`
- `memory-tests/baselines.json`
- harness code in `packages/test-utils/memory-test-harness.ts`.

Capture:

- snapshot strategy,
- tolerance thresholds,
- baseline update process.

### Step 5: Analyze performance regression suite

Read:

- `perf-tests/perf-usage.test.ts`
- `perf-tests/baselines.json`
- harness code in `packages/test-utils/perf-test-harness.ts`.

Capture:

- measured dimensions,
- warmup/outlier handling,
- threshold logic.

### Step 6: Build coverage matrix by compartment

For each compartment file in this folder, mark:

- direct test coverage,
- indirect coverage,
- known weak spots.

### Step 7: Build reliability and flake guidance

Document deflake/retry workflows and when to regenerate fixtures.

### Step 8: Publish test gap backlog

Prioritize missing tests for high-risk flows (routing, policy, protocol output,
agent branching).

## What Good Output Looks Like

1. Suite taxonomy (unit/integration/evals/memory/perf).
2. Execution matrix (default vs explicit vs nightly).
3. Fixture and baseline lifecycle documentation.
4. Coverage-by-compartment matrix.
5. Prioritized test gap backlog.

## Do and Do Not

Do:

- separate eval semantics from deterministic integration tests,
- include baseline update mechanics for memory/perf,
- tie test confidence claims to concrete scripts and files.

Do not:

- treat passing unit tests as full system confidence,
- ignore fixture staleness risk,
- skip explicit suites when reporting repository health.

## Common Failure Modes While Analyzing

- Overlooking non-default suites.
- Ignoring baseline drift and update process.
- Confusing eval goals with strict correctness tests.
- Missing sandbox matrix implications.

## Handoffs To Other Compartments

- Build/CI wiring -> `15-build-packaging-release-and-ci.md`
- Routing benchmark readiness -> `07-routing-availability-loop-and-pollux.md`
- Runtime compartment-specific test anchors -> all runtime compartment files.

## Definition of Done

This compartment is complete when:

1. Test suite taxonomy and execution matrix are explicit.
2. Fixture and baseline workflows are documented.
3. Coverage-by-compartment matrix is complete.
4. Reliability/flake handling guidance is included.
5. Test gap backlog is actionable and prioritized.
