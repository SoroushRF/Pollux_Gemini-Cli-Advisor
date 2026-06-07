# P4-18 Milestone 3 Hard-Task Factory Guide

Version: 1.0 Date: 2026-04-26 Status: Operational guide for expanding M3 task
supply

## Purpose

This guide exists because the current M3 calibration evidence shows a real
separation between Flash and Pro, but not enough high-quality task volume for a
strong official value claim yet.

The current verified M3 set contains:

1. four strong semantic / ceiling-sensitive tasks
2. one useful lower-priority refactor task
3. three exactness-sensitive tasks whose signal is weaker because much of the
   Flash failure mode is punctuation or exact-format obedience

That is enough for diagnosis. It is not enough for the headline M3 product-value
claim.

The next task-building goal is to create a larger pool of hard, deterministic,
artifact-scored tasks where:

1. Flash struggles for structural reasons
2. Pro solves reliably within the same response ceiling
3. Pollux has plausible room to improve Flash without spending Pro on every turn

## Current Evidence Snapshot

Primary M3 A-screen and E-only artifacts:

1. `artifacts/pollux/real-runs/m3-a-screen-001-s01`
2. `artifacts/pollux/real-runs/m3-a-screen-001-s02`
3. `artifacts/pollux/real-runs/m3-a-screen-001-s03`
4. `artifacts/pollux/real-runs/m3-a-screen-001-s01-bm08-rerun`
5. `artifacts/pollux/real-runs/m3-a-screen-001-m3bm09-rerun`
6. `artifacts/pollux/real-runs/m3-a-screen-001-m3bm11-rerun`
7. `artifacts/pollux/real-runs/m3-e-only-001-b1`
8. `artifacts/pollux/real-runs/m3-e-only-001-b2`

Current strong semantic candidates:

1. `M3-BM-01-CROSS-FILE-EXPORT-FIX`
2. `M3-BM-08-TEST-INTENT-BUGFIX`
3. `M3-BM-11-PARTIAL-MIGRATION-GUARD`
4. `PILOT-BM-19-MULTI-REFACTOR`

Current secondary candidates:

1. `M3-BM-05-TRANSITIVE-RENAME`
2. `M3-BM-12-TWO-FILE-CONSTRAINT-MERGE`
3. `PILOT-BM-17-FILE-STATE`
4. `PILOT-BM-23-FILE-DOCS`

Operational conclusion:

1. `b1` is high-value evidence.
2. `b2` is clean but weaker as product-value evidence.
3. Build more hard tasks before treating F as the official M3 value track.
4. F can still be run on `b1` as an exploratory smoke, but not as the final M3
   claim.

## References

Read these before adding tasks:

1. `docs/core/pollux/P4-16_MILESTONE_3_PRODUCT_VALUE_BENCHMARK_HANDOFF.md`
2. `docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md`
3. `docs/core/pollux/P4-01_BENCHMARK_CORPUS_ORACLE.md`
4. `docs/core/pollux/P4-08_REAL_BENCHMARK_DOCTRINE.md`
5. `docs/core/pollux/P4-10_REAL_BENCHMARK_MEASUREMENT_SPEC.md`
6. `packages/core/src/pollux/benchmark/realTasks.ts`
7. `packages/core/src/pollux/benchmark/realTasks.test.ts`
8. `packages/test-utils/src/pollux-real-report.ts`
9. `packages/test-utils/src/pollux-real-pilot.ts`

## Hard-Task Design Philosophy

Do not make tasks hard by relying on whitespace, punctuation, CRLF differences,
or path assumptions that the prompt did not require.

Those can be useful small obedience checks, but they should not carry the M3
story.

Prefer tasks where Flash fails because the task requires one of these:

1. cross-file causal repair
2. multi-file invariant preservation
3. source-of-truth conflict resolution
4. a tempting local fix that is wrong
5. test-intent interpretation
6. bounded verification before final edit
7. migration under constraints
8. negative-space obedience, meaning the correct answer also avoids forbidden
   changes

The strongest tasks should feel like small real engineering chores, not riddles.

## Task Pattern 1: Cross-File Causal Fix

Goal:

Make the obvious one-file patch tempting, but require a correct fix that follows
the existing architecture across files.

Shape:

1. `src/a.ts` exports a stable function.
2. `src/b.ts` imports the wrong symbol or wrong path.
3. `tests/b.test.ts` expresses the intended behavior.
4. Prompt forbids changing the test expectation.
5. Oracle checks source consistency and marker file.

Example skeleton:

```ts
{
  id: 'M3-BM-XX-CROSS-FILE-SYMBOL-REPAIR',
  difficulty: 'complex',
  description:
    'Fixes a source/import mismatch by preserving the existing implementation contract.',
  files: {
    'src/math.ts':
      'export function sumValues(items: number[]) { return items.reduce((a, b) => a + b, 0); }\\n',
    'src/report.ts':
      'import { sum } from "./math.js";\\nexport const render = (xs: number[]) => `total=${sum(xs)}`;\\n',
    'tests/report.test.ts':
      'import { render } from "../src/report.js";\\nif (render([2,3,5]) !== "total=10") throw new Error("bad total");\\n',
  },
  prompt:
    'Fix the cross-file import/export mismatch without changing the test expectation. Create m3-done.txt containing exactly done.',
  domain: 'multi_file_refactor',
  escalationSignalClass: 'fusion_composite',
  oracle: createMultiFileRefactorOracle({
    fileChecks: [
      {
        fileName: 'src/report.ts',
        required: [/sumValues/],
        forbidden: [/import \{ sum \}/],
      },
    ],
    markerFileName: 'm3-done.txt',
    markerText: 'done',
  }),
}
```

Why it is good:

Flash often tries the shortest visible edit. Pro is more likely to infer the
existing implementation should be reused.

## Task Pattern 2: Test-Intent Bugfix

Goal:

Force the model to infer the intended implementation from a failing test without
editing the test to match broken code.

Shape:

1. Source has a plausible but wrong condition.
2. Test explains the intended edge case.
3. Prompt explicitly forbids changing tests.
4. Oracle checks implementation and test preservation.

Oracle rule:

The oracle should verify both:

1. source contains the corrected behavior
2. test still contains the original expected assertion

This prevents benchmark leakage where the model makes the test pass by weakening
the test.

## Task Pattern 3: Source-of-Truth Conflict

Goal:

Make the model resolve conflicting files by following an explicit priority rule.

Shape:

1. `docs/behavior.md` says one thing.
2. `config/policy.json` says another.
3. `tests/policy.test.ts` or `constraints.md` says which source wins.
4. Prompt asks for a source update and marker file.

Good prompt:

```text
Resolve the policy conflict. When docs and config disagree, config is the source
of truth. Update only src/policy.ts and create m3-done.txt containing exactly
done. Do not edit docs or config.
```

Good oracle checks:

1. `src/policy.ts` follows config
2. docs unchanged
3. config unchanged
4. marker exists

Why it is good:

Flash may follow the more readable or more recent-looking text. Stronger models
are more likely to honor the priority rule.

## Task Pattern 4: Migration With Guardrails

Goal:

Test whether the model can apply a migration while preserving explicitly
protected compatibility text or files.

Shape:

1. A symbol or adapter name changes.
2. Source files must migrate.
3. Docs or compatibility comments must remain unchanged.
4. Oracle accepts only migrations that satisfy both update and preservation
   constraints.

Important:

If renaming a file is allowed, say so or make the oracle accept it. If renaming
a file is forbidden, say that clearly in the prompt and enforce it in the
oracle.

The earlier `M3-BM-11` run proved this matters: Flash and Pro chose a reasonable
rename path, while the first oracle version assumed in-place editing.

## Task Pattern 5: Multi-Output Consistency

Goal:

Require the same decision to be applied consistently to several outputs.

Shape:

1. A list or registry must be updated.
2. A caller must use the new exported name.
3. A generated summary must reflect the same final state.
4. Oracle checks all outputs.

Why it is good:

Flash often completes one or two surfaces but misses the third. Pro tends to
carry the invariant through.

## Oracle Rules

Use deterministic artifact checks only.

Good oracles:

1. exact file text after normalized line endings when exactness is truly part of
   the task
2. regex checks for required and forbidden source fragments
3. unchanged-file checks for protected inputs
4. marker-file checks for task completion
5. multi-file consistency checks

Avoid oracles that:

1. depend on CRLF vs LF
2. require a file path the prompt did not require
3. reward changing tests or docs when the task is source repair
4. rely on natural-language subjective scoring
5. make punctuation the main difficulty

Reusable helpers already in `realTasks.ts`:

1. `createExactFileOracle`
2. `createMultiFileRefactorOracle`
3. `normalizeOracleText`
4. `matchesExactText`
5. `readWorkspaceFile`

## Minimum New Task Pack

Build `10-12` new candidates.

Target mix:

1. `4` cross-file causal fixes
2. `2` test-intent bugfixes
3. `2` source-of-truth conflict tasks
4. `2` migration-with-guardrail tasks
5. `1-2` multi-output consistency tasks

Expected funnel:

1. A-screen all new tasks.
2. Drop tasks that are easy for Flash.
3. Carry ceiling-sensitive A tasks forward.
4. Run E-only on survivors.
5. Keep tasks where E solves cleanly under the same ceiling.
6. Freeze the strongest semantic subset.
7. Run F only after the subset is strong enough.

Target final subset for official M3:

1. at least `8` tasks
2. at least `6` semantic / structural tasks
3. no more than `2` exactness-sensitive tasks

## Implementation Steps

1. Add new task definitions in:
   `packages/core/src/pollux/benchmark/realTasks.ts`

2. Add each new id to `M3_REAL_BENCHMARK_TASK_DEFINITIONS`.

3. Keep each task self-contained with seeded `files`, `prompt`, `domain`,
   `difficulty`, `provenance`, `escalationSignalClass`, and deterministic
   `oracle`.

4. Add oracle regression tests in:
   `packages/core/src/pollux/benchmark/realTasks.test.ts`

5. Run the focused task tests:

```powershell
npm.cmd run test -w @google/gemini-cli-core -- src/pollux/benchmark/realTasks.test.ts
```

Note:

As of 2026-04-26 this file still contains old unrelated expectation drift around
the prior corpus shape. New task-specific tests should still pass.

6. Run A-screen on the new pack:

```powershell
npm.cmd run benchmark:pollux:real:calibrate -- --batch-id m3-a-screen-002-hardpack --temporary-flash-only true --repeats 3 --entrypoint bundle --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json --task-ids <NEW_TASK_IDS_COMMA_SEPARATED>
```

7. Run E-only on A survivors:

```powershell
npm.cmd run benchmark:pollux:real:pilot -- --campaign-id m3-e-only-002-hardpack --condition-ids E --repeats 3 --entrypoint bundle --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json --task-ids <A_SURVIVOR_IDS_COMMA_SEPARATED>
```

8. Only after enough semantic tasks survive, run F on the frozen subset.

## Acceptance Bar For New Tasks

A new task is a strong M3 candidate when:

1. Flash does not solve it cleanly within the official ceiling, or solves it
   unreliably.
2. Pro solves it cleanly within the same ceiling.
3. The failure is structural, not just punctuation.
4. The oracle can be explained in one short paragraph.
5. The prompt does not leak benchmark-specific strategy.
6. The output artifacts make failures easy to inspect.

Reject or rewrite the task when:

1. Flash passes `3/3`.
2. Pro also fails or hits the ceiling repeatedly.
3. The only Flash failure is a period, comma, or space.
4. The oracle accepts several semantically different repairs without checking
   the important invariant.
5. The prompt is so restrictive that it no longer resembles a real task.

## Recommended Next Step

Do not run the official M3 F value track on the current eight tasks as the final
claim.

Instead:

1. preserve `b1` as strong baseline evidence
2. keep `M3-BM-05` as a possible secondary task
3. build the hard pack described above
4. run A-screen and E-only on that pack
5. assemble a stronger frozen subset
6. then spend Pro advisor quota on F
