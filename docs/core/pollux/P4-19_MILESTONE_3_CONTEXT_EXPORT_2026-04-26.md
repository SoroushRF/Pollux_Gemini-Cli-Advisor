# P4-19 Milestone 3 Context Export

Version: 1.0 Date: 2026-04-26 Status: Compact transfer context for follow-on
chat

## Current Goal

We are running the Pollux Milestone 3 product-value benchmark.

The benchmark thesis:

1. `A`: Flash-only should be cheap but weaker on hard tasks.
2. `E`: Pro-only should solve those tasks but cost more.
3. `F`: Flash executor plus Pro advisor should improve over `A` while costing
   materially less than `E`.

The current operational decision:

Do not run the official F value track yet. The first E-only batch is excellent,
but the second E-only batch is mostly weaker exactness evidence. Build more hard
semantic tasks before spending advisor quota on the official F track.

## Important Files

Docs:

1. `docs/core/pollux/P4-14_BENCHMARK_HANDOFF_STATUS.md`
2. `docs/core/pollux/P4-16_MILESTONE_3_PRODUCT_VALUE_BENCHMARK_HANDOFF.md`
3. `docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md`
4. `docs/core/pollux/P4-18_MILESTONE_3_HARD_TASK_FACTORY_GUIDE.md`
5. `docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json`

Implementation:

1. `packages/core/src/pollux/benchmark/realTasks.ts`
2. `packages/core/src/pollux/benchmark/realTasks.test.ts`
3. `packages/test-utils/src/pollux-real-pilot.ts`
4. `packages/test-utils/src/pollux-real-calibration.ts`
5. `packages/test-utils/src/pollux-real-report.ts`
6. `packages/test-utils/src/pollux-real-types.ts`
7. `packages/test-utils/src/pollux-live-run-rig.ts`

## Recent Commits

Recent relevant commits pushed to `main`:

1. `401d872b1` `feat(pollux): stage milestone 3 calibration workflow`
2. `39f4701c4` `feat(pollux): preserve ceiling-sensitive flash candidates`
3. `a03f451b4` `fix(pollux): relax oracle path and newline assumptions`
4. `4a8256f2a` `feat(pollux): expose condition filters in pilot runner`

## Code Changes Already Made

Oracle fixes:

1. `createExactFileOracle` now normalizes BOM and CRLF before comparing exact
   text.
2. `M3-BM-09-SORTED-UNIQUE-REPORT` now uses normalized exact matching.
3. `M3-BM-11-PARTIAL-MIGRATION-GUARD` now accepts either in-place source update
   or a rename to `src/adapters/stable.ts`, because the prompt did not forbid
   renaming.

Calibration/reporting changes:

1. Temporary A-screen classification now includes
   `temporary_ceiling_sensitive_candidate`.
2. A task is preserved as ceiling-sensitive when invalidations are all
   `model_call_ceiling_exceeded` and at least one run still had
   `oraclePass=true`.

Runner change:

1. `benchmark:pollux:real:pilot` now accepts `--condition-ids E`, allowing true
   E-only runs.
2. The pilot console workload line now includes repeats.

## A-Screen Results

Original A-screen batches:

1. `m3-a-screen-001-s01`
2. `m3-a-screen-001-s02`
3. `m3-a-screen-001-s03`

Reruns:

1. `m3-a-screen-001-s01-bm08-rerun`
2. `m3-a-screen-001-m3bm09-rerun`
3. `m3-a-screen-001-m3bm11-rerun`

Important corrections:

1. `PILOT-BM-08-SHELL-PIPE` was an oracle false negative and is now easy.
2. `M3-BM-09-SORTED-UNIQUE-REPORT` was a CRLF oracle false negative and is now
   easy.
3. `M3-BM-11-PARTIAL-MIGRATION-GUARD` is a real ceiling-sensitive candidate
   after the oracle/spec fix.

Corrected A-stage carry-forward tasks:

1. `M3-BM-01-CROSS-FILE-EXPORT-FIX`
2. `PILOT-BM-17-FILE-STATE`
3. `M3-BM-05-TRANSITIVE-RENAME`
4. `M3-BM-08-TEST-INTENT-BUGFIX`
5. `PILOT-BM-19-MULTI-REFACTOR`
6. `PILOT-BM-23-FILE-DOCS`
7. `M3-BM-11-PARTIAL-MIGRATION-GUARD`
8. `M3-BM-12-TWO-FILE-CONSTRAINT-MERGE`

## E-Only Batch 1

Artifact:

`artifacts/pollux/real-runs/m3-e-only-001-b1`

Tasks:

1. `M3-BM-01-CROSS-FILE-EXPORT-FIX`
2. `M3-BM-08-TEST-INTENT-BUGFIX`
3. `PILOT-BM-19-MULTI-REFACTOR`
4. `M3-BM-11-PARTIAL-MIGRATION-GUARD`

Results:

1. `12/12` valid
2. `12/12` oracle pass
3. `0` invalidations
4. `434,016` Pro tokens
5. `$0.4763` estimated cost
6. mean wall-clock `27.0s`

Quality:

This is the strong batch. These tasks are semantic, structural, and
ceiling-sensitive under Flash.

## E-Only Batch 2

Artifact:

`artifacts/pollux/real-runs/m3-e-only-001-b2`

Tasks:

1. `PILOT-BM-17-FILE-STATE`
2. `M3-BM-05-TRANSITIVE-RENAME`
3. `PILOT-BM-23-FILE-DOCS`
4. `M3-BM-12-TWO-FILE-CONSTRAINT-MERGE`

Results:

1. `12/12` valid
2. `12/12` oracle pass
3. `0` invalidations
4. `271,693` Pro tokens
5. `$0.3331` estimated cost
6. mean wall-clock `17.9s`

Quality:

1. `M3-BM-05` is useful but lower-priority; Flash already passed `2/3` validly
   and only hit the ceiling once.
2. `M3-BM-12` has some real two-file constraint signal but is partly exact comma
   formatting.
3. `PILOT-BM-17` and `PILOT-BM-23` are mostly exact-string obedience tasks and
   should not carry the final M3 story.

## Token Usage

Flash A-screen and reruns:

1. `s01`: `1,006,847`
2. `s02`: `1,167,802`
3. `s03`: `1,099,124`
4. `bm08_rerun`: `101,433`
5. `m3bm09_rerun`: `78,285`
6. `m3bm11_rerun`: `289,944`

Total Flash raw tokens:

`3,743,435`

Pro E-only usage:

1. `b1`: `434,016`
2. `b2`: `271,693`

Total Pro E-only usage:

`705,709`

If `b1` alone represented `35%` of the Pro quota window, the implied Pro window
is approximately:

`434,016 / 0.35 = 1,240,046`

After `b2`, estimated Pro usage is:

`705,709 / 1,240,046 = 56.9%`

Estimated remaining Pro tokens:

`534,337`

This assumes the usage meter is roughly token-linear and there was no other Pro
usage in the same quota window.

## Important Commands

Run E-only condition:

```powershell
npm.cmd run benchmark:pollux:real:pilot -- --campaign-id <ID> --condition-ids E --repeats 3 --entrypoint bundle --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json --task-ids <TASK_IDS>
```

Run A-screen temporary Flash-only:

```powershell
npm.cmd run benchmark:pollux:real:calibrate -- --batch-id <ID> --temporary-flash-only true --repeats 3 --entrypoint bundle --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json --task-ids <TASK_IDS>
```

Run F-only exploratory condition:

```powershell
npm.cmd run benchmark:pollux:real:pilot -- --campaign-id <ID> --condition-ids F --repeats 3 --entrypoint bundle --pricing-snapshot docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-24.json --task-ids <TASK_IDS>
```

Do not treat F-only exploratory results as the official M3 value report unless
the selected subset was frozen by baseline-only evidence and then rerun under
the final value protocol.

## Recommended Next Step

Build a new hard-task pack before the official F value track.

Use:

`docs/core/pollux/P4-18_MILESTONE_3_HARD_TASK_FACTORY_GUIDE.md`

Target:

1. create `10-12` new hard semantic candidates
2. A-screen them
3. E-only run the survivors
4. assemble at least `8` final tasks with at least `6` semantic / structural
   tasks
5. then run F

Possible exploratory option:

Run F on the four `b1` tasks only to debug Pollux behavior and token shape, but
do not use it as the final M3 claim.
