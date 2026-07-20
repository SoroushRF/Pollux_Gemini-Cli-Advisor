# DeepSWE Cleanup Archive - 2026-06-12

This file preserves the relevant results and follow-up decisions for DeepSWE
artifacts approved for deletion. The raw directories were large, duplicated
working trees and verifier outputs; this archive keeps the campaign-level
outcome, task/run status, preflight status, invalidation reasons, and what
happened next.

Approved deletion set: Fresh5 failed/superseded DeepSWE artifacts plus older
invalid/superseded DeepSWE artifacts. Estimated space reclaimed from these
result directories: 12.567 GB. This archive intentionally does not include the
current 10-sample valid Fresh5 evidence directories.

## Current Evidence Kept Elsewhere

Do not treat the deleted runs below as the final DeepSWE result set. The current
evidence retained in artifacts is the valid 10-sample set: batch1 rescore after
patchstats fix, batch2 rescore after patchstats fix, fill batch4, fill batch5,
and fill batch6. The current retained set totals 10 valid samples across wazero,
ts-pattern, true-myth, testem, and OPA.

## deepswe-fd-fresh5-batch1-wazero2-ts1

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch1-wazero2-ts1`

Approx size before deletion: 0.433 GB

Tasks observed: ts-pattern-match-each, wazero-multi-module-snapshots

Summary: total=2, valid_for_score=0, invalid=2, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=0, patch_apply_failures=0.

Invalidation reasons: runner_exception=2.

Warnings: runner_exception=2.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":2,"valid_for_score":0,"invalid":2,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"runner_exception":2},"warnings":{"runner_exception":2},"verifier_infra_failures":0,"patch_apply_failures":0}.

Baseline/preflight status: ok=true

Dependency preflight: ok=true, tasks=n/a.

Run records:

- ts-pattern-match-each FD r1: status=n/a, valid=false, resolved=false,
  invalidation=runner_exception, verifier=n/a/n/a, api=0, tokens_total=n/a,
  wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=["runner_exception"]
- wazero-multi-module-snapshots FD r1: status=n/a, valid=false, resolved=false,
  invalidation=runner_exception, verifier=n/a/n/a, api=0, tokens_total=n/a,
  wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=["runner_exception"]

Outcome and follow-up: Not successful. Both samples hit runner_exception because
the run record path preserved neither patch_stats nor telemetry on exception.
Follow-up: runner patched to compute patchStats before verifier and preserve
source telemetry; this campaign was rescored as
deepswe-fd-fresh5-batch1-wazero2-ts1-rescore-after-patchstats-fix, producing 2
valid samples with 1 resolved and 1 unresolved.

## deepswe-fd-fresh5-batch2-ts1-myth2

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch2-ts1-myth2`

Approx size before deletion: 0.893 GB

Tasks observed: true-myth-iterable-collection-combinators, ts-pattern-match-each

Summary: total=2, valid_for_score=0, invalid=2, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=0, patch_apply_failures=0.

Invalidation reasons: runner_exception=2.

Warnings: runner_exception=2.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":2,"valid_for_score":0,"invalid":2,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"runner_exception":2},"warnings":{"runner_exception":2},"verifier_infra_failures":0,"patch_apply_failures":0}.

Baseline/preflight status: ok=true

Dependency preflight: ok=true, tasks=n/a.

Run records:

- true-myth-iterable-collection-combinators FD r1: status=n/a, valid=false,
  resolved=false, invalidation=runner_exception, verifier=n/a/n/a, api=0,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a;
  warnings=["runner_exception"]
- ts-pattern-match-each FD r1: status=n/a, valid=false, resolved=false,
  invalidation=runner_exception, verifier=n/a/n/a, api=0, tokens_total=n/a,
  wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=["runner_exception"]

Outcome and follow-up: Not successful. Both samples hit runner_exception from
the same patchStats/exception-recording bug. Follow-up: same runner patch;
campaign rescored as
deepswe-fd-fresh5-batch2-ts1-myth2-rescore-after-patchstats-fix, producing 2
valid samples with 1 resolved and 1 unresolved.

## deepswe-fd-fresh5-batch3-testem2-opa2

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch3-testem2-opa2`

Approx size before deletion: 1.795 GB

Tasks observed: none recorded at run-summary level

Summary: no root summary.json was produced. This means the campaign stopped
before score aggregation, usually during preflight/setup.

Baseline/preflight status: ok=false

Dependency preflight: ok=true, tasks=n/a.

Run records:

- No paid model run records found in raw/; this was preflight/setup only or
  failed before raw model output.

Outcome and follow-up: Not successful. Stopped before paid model launch at
baseline verifier preflight. Testem baseline failed while OPA was part of the
requested batch. Follow-up: reran preflight separately under
deepswe-fd-fresh5-batch3-testem2-opa2-preflight-rerun; later filled the missing
samples with separate fill batches.

## deepswe-fd-fresh5-batch3-testem2-opa2-preflight-rerun

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch3-testem2-opa2-preflight-rerun`

Approx size before deletion: 1.788 GB

Tasks observed: none recorded at run-summary level

Summary: no root summary.json was produced. This means the campaign stopped
before score aggregation, usually during preflight/setup.

Baseline/preflight status: ok=true

Dependency preflight: ok=true, tasks=n/a.

Run records:

- No paid model run records found in raw/; this was preflight/setup only or
  failed before raw model output.

Outcome and follow-up: Successful only as a preflight check. It proved the same
task pair could pass baseline verifier preflight after the failed attempt.
Follow-up: used this confidence to run fill batches instead of paying for this
exact failed run id.

## deepswe-fd-fresh5-sample3-batch7-wazero-ts

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-sample3-batch7-wazero-ts`

Approx size before deletion: 0.036 GB

Tasks observed: none recorded at run-summary level

Summary: no root summary.json was produced. This means the campaign stopped
before score aggregation, usually during preflight/setup.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Dependency preflight: ok=true, tasks=n/a.

Run records:

- No paid model run records found in raw/; this was preflight/setup only or
  failed before raw model output.

Outcome and follow-up: Not successful. Setup/preflight only; no paid model
output. It failed during baseline verifier workspace checkout because C: was out
of disk space. Follow-up: cleanup audit initiated before rerunning paid sample-3
work.

## deepswe-fd-fresh5-sample3-batch8-myth-opa

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-sample3-batch8-myth-opa`

Approx size before deletion: 0.266 GB

Tasks observed: none recorded at run-summary level

Summary: no root summary.json was produced. This means the campaign stopped
before score aggregation, usually during preflight/setup.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Dependency preflight: ok=true, tasks=n/a.

Run records:

- No paid model run records found in raw/; this was preflight/setup only or
  failed before raw model output.

Outcome and follow-up: Not successful. Setup/preflight only; no paid model
output. It failed cloning the OPA bare repo with no space left on device.
Follow-up: cleanup audit initiated before rerunning paid sample-3 work. OPA
remained last in the requested batch order.

## deepswe-fd-fresh5-sample3-batch9-testem-only

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-sample3-batch9-testem-only`

Approx size before deletion: 0.176 GB

Tasks observed: none recorded at run-summary level

Summary: no root summary.json was produced. This means the campaign stopped
before score aggregation, usually during preflight/setup.

Baseline/preflight status: ok=false

Dependency preflight: ok=true, tasks=n/a.

Run records:

- No paid model run records found in raw/; this was preflight/setup only or
  failed before raw model output.

Outcome and follow-up: Not successful. Preflight reached baseline verifier and
failed on Testem baseline/new-test expectations before any model launch.
Follow-up: do not rescore; rerun only after confirming Testem verifier baseline
is stable.

## deepswe-opa-fd-strict-r1

Path before deletion: `artifacts/pollux/deepswe-runs/deepswe-opa-fd-strict-r1`

Approx size before deletion: 3.225 GB

Tasks observed: opa-rego-rule-profiling

Summary: total=1, valid_for_score=0, invalid=1, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=1, patch_apply_failures=0.

Invalidation reasons: verifier_infra_failure=1.

Warnings: model_capacity_retry=1, tool_policy_confirmation_recovered=1,
fd_checkpoint_incomplete=1.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":1,"valid_for_score":0,"invalid":1,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"verifier_infra_failure":1},"warnings":{"model_capacity_retry":1,"tool_policy_confirmation_recovered":1,"fd_checkpoint_incomplete":1},"verifier_infra_failures":1,"patch_apply_failures":0}.

Baseline/preflight status: ok=true

Dependency preflight: ok=true, tasks=n/a.

Run records:

- opa-rego-rule-profiling FD r1: status=n/a, valid=false, resolved=false,
  invalidation=verifier_infra_failure, verifier=n/a/n/a, api=136,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=rego/rego.go,v1/rego/profile.go,v1/rego/profile_disabled.go,v1/rego/profile_test.go,v1/rego/rego.go,v1/rego/resultset.go,
  patch_chars=n/a;
  warnings=["model_capacity_retry","tool_policy_confirmation_recovered","fd_checkpoint_incomplete"]

Outcome and follow-up: Not successful for scoring. A paid OPA attempt existed,
but summary invalidated it as verifier_infra_failure. Follow-up: added
classifier/handling for model build verifier failures and rescored.

## deepswe-opa-fd-strict-r1-rescore-after-model-build-failure-classifier

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-opa-fd-strict-r1-rescore-after-model-build-failure-classifier`

Approx size before deletion: 1.616 GB

Tasks observed: opa-rego-rule-profiling

Summary: total=1, valid_for_score=0, invalid=1, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=1, patch_apply_failures=0.

Invalidation reasons: verifier_infra_failure=1.

Warnings: model_capacity_retry=1, tool_policy_confirmation_recovered=1,
fd_checkpoint_incomplete=1.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":1,"valid_for_score":0,"invalid":1,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"verifier_infra_failure":1},"warnings":{"model_capacity_retry":1,"tool_policy_confirmation_recovered":1,"fd_checkpoint_incomplete":1},"verifier_infra_failures":1,"patch_apply_failures":0}.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Run records:

- opa-rego-rule-profiling FD r1: status=n/a, valid=false, resolved=false,
  invalidation=verifier_infra_failure, verifier=n/a/n/a, api=136,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=rego/rego.go,v1/rego/profile.go,v1/rego/profile_disabled.go,v1/rego/profile_test.go,v1/rego/rego.go,v1/rego/resultset.go,
  patch_chars=n/a;
  warnings=["model_capacity_retry","tool_policy_confirmation_recovered","fd_checkpoint_incomplete"]

Outcome and follow-up: Not successful. Rescore still invalidated as
verifier_infra_failure. Follow-up: second rescore
deepswe-opa-fd-strict-r1-rescore-after-model-build-failure-classifier-r2 became
valid but unresolved.

## deepswe-true-myth-fd-providerfix-r7-r8

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-true-myth-fd-providerfix-r7-r8`

Approx size before deletion: 0.866 GB

Tasks observed: true-myth-iterable-collection-combinators

Summary: total=2, valid_for_score=0, invalid=2, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=2, patch_apply_failures=0.

Invalidation reasons: verifier_infra_failure=2.

Warnings: none.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":2,"valid_for_score":0,"invalid":2,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"verifier_infra_failure":2},"warnings":{},"verifier_infra_failures":2,"patch_apply_failures":0}.

Baseline/preflight status: ok=true

Dependency preflight: ok=true, tasks=n/a.

Run records:

- true-myth-iterable-collection-combinators FD r1: status=n/a, valid=false,
  resolved=false, invalidation=verifier_infra_failure, verifier=n/a/n/a, api=72,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=package-lock.json,src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,
  patch_chars=n/a; warnings=[]
- true-myth-iterable-collection-combinators FD r2: status=n/a, valid=false,
  resolved=false, invalidation=verifier_infra_failure, verifier=n/a/n/a,
  api=129, tokens_total=n/a, wall_ms=n/a,
  patch_files=src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,test/maybe.test.ts,test/result.test.ts,test/task.test.ts,test/toolbelt.test.ts,
  patch_chars=n/a; warnings=[]

Outcome and follow-up: Not successful. Both samples invalidated as
verifier_infra_failure despite baseline preflight being ok. Follow-up: attempted
verifier install fix rescore, then final verifier network fix rescore.

## deepswe-true-myth-fd-providerfix-r7-r8-rescore-after-verifier-install-fix

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-true-myth-fd-providerfix-r7-r8-rescore-after-verifier-install-fix`

Approx size before deletion: 0.027 GB

Tasks observed: true-myth-iterable-collection-combinators

Summary: total=2, valid_for_score=0, invalid=2, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=2, patch_apply_failures=0.

Invalidation reasons: verifier_infra_failure=2.

Warnings: none.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":2,"valid_for_score":0,"invalid":2,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"verifier_infra_failure":2},"warnings":{},"verifier_infra_failures":2,"patch_apply_failures":0}.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Run records:

- true-myth-iterable-collection-combinators FD r1: status=n/a, valid=false,
  resolved=false, invalidation=verifier_infra_failure, verifier=n/a/n/a, api=72,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=package-lock.json,src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,
  patch_chars=n/a; warnings=[]
- true-myth-iterable-collection-combinators FD r2: status=n/a, valid=false,
  resolved=false, invalidation=verifier_infra_failure, verifier=n/a/n/a,
  api=129, tokens_total=n/a, wall_ms=n/a,
  patch_files=src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,test/maybe.test.ts,test/result.test.ts,test/task.test.ts,test/toolbelt.test.ts,
  patch_chars=n/a; warnings=[]

Outcome and follow-up: Not successful. Rescore remained invalid
verifier_infra_failure. Follow-up:
deepswe-true-myth-fd-providerfix-r7-r8-rescore-after-final-verifier-network-fix
became valid but unresolved 0/2.

## deepswe-fd-relaxed-ts-pattern-r5-r6

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-relaxed-ts-pattern-r5-r6`

Approx size before deletion: 0.391 GB

Tasks observed: ts-pattern-match-each

Summary: total=2, valid_for_score=0, invalid=2, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=2, patch_apply_failures=0.

Invalidation reasons: verifier_infra_failure=2.

Warnings: quota_exhausted_recovered=2, tool_policy_confirmation_recovered=1,
fd_checkpoint_incomplete=2.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":2,"valid_for_score":0,"invalid":2,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"verifier_infra_failure":2},"warnings":{"quota_exhausted_recovered":2,"tool_policy_confirmation_recovered":1,"fd_checkpoint_incomplete":2},"verifier_infra_failures":2,"patch_apply_failures":0}.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Dependency preflight: ok=true, tasks=n/a.

Run records:

- ts-pattern-match-each FD r1: status=n/a, valid=false, resolved=false,
  invalidation=verifier_infra_failure, verifier=n/a/n/a, api=44,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=package-lock.json,src/index.ts,src/match.ts,src/types/MatchEach.ts,tests/match-each.test.ts,
  patch_chars=n/a;
  warnings=["quota_exhausted_recovered","tool_policy_confirmation_recovered","fd_checkpoint_incomplete"]
- ts-pattern-match-each FD r2: status=n/a, valid=false, resolved=false,
  invalidation=verifier_infra_failure, verifier=n/a/n/a, api=39,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=package-lock.json,src/index.ts,src/matchEach.ts,src/types/MatchEach.ts,tests/matchEach.test.ts,
  patch_chars=n/a;
  warnings=["quota_exhausted_recovered","fd_checkpoint_incomplete"]

Outcome and follow-up: Not successful. Both samples invalidated as
verifier_infra_failure, with quota recovery and checkpoint warnings. Follow-up:
later strict/fresh runs superseded this relaxed attempt.

## deepswe-fd-relaxed-true-myth-r1-r2

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-fd-relaxed-true-myth-r1-r2`

Approx size before deletion: 0.294 GB

Tasks observed: true-myth-iterable-collection-combinators

Summary: total=2, valid_for_score=0, invalid=2, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=1, patch_apply_failures=0.

Invalidation reasons: cli_crash=1, verifier_infra_failure=1.

Warnings: fd_checkpoint_incomplete=2, quota_exhausted_recovered=1.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":2,"valid_for_score":0,"invalid":2,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"cli_crash":1,"verifier_infra_failure":1},"warnings":{"fd_checkpoint_incomplete":2,"quota_exhausted_recovered":1},"verifier_infra_failures":1,"patch_apply_failures":0}.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Dependency preflight: ok=true, tasks=n/a.

Run records:

- true-myth-iterable-collection-combinators FD r1: status=n/a, valid=false,
  resolved=n/a, invalidation=cli_crash, verifier=n/a/n/a, api=0,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a;
  warnings=["fd_checkpoint_incomplete"]
- true-myth-iterable-collection-combinators FD r2: status=n/a, valid=false,
  resolved=false, invalidation=verifier_infra_failure, verifier=n/a/n/a, api=78,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=package-lock.json,src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,
  patch_chars=n/a;
  warnings=["quota_exhausted_recovered","fd_checkpoint_incomplete"]

Outcome and follow-up: Not successful. One CLI crash and one verifier infra
failure. Follow-up: provider/install/network fixes and later fresh5/fill
campaigns superseded it.

## deepswe-top3-fd-r1

Path before deletion: `artifacts/pollux/deepswe-runs/deepswe-top3-fd-r1`

Approx size before deletion: 0.597 GB

Tasks observed: true-myth-iterable-collection-combinators,
ts-pattern-match-each, wazero-multi-module-snapshots

Summary: total=3, valid_for_score=0, invalid=3, incomplete=0, resolved=0,
unresolved=0, verifier_infra_failures=n/a, patch_apply_failures=n/a.

Invalidation reasons: provider_failure=3.

Warnings: none.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":3,"valid_for_score":0,"invalid":3,"incomplete":0,"resolved":0,"unresolved":0,"invalidation_reasons":{"provider_failure":3}}.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Run records:

- true-myth-iterable-collection-combinators FD r1: status=n/a, valid=false,
  resolved=n/a, invalidation=provider_failure, verifier=n/a/n/a, api=66,
  tokens_total=n/a, wall_ms=n/a,
  patch_files=src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,test/maybe.test.ts,test/result.test.ts,test/task.test.ts,test/toolbelt.test.ts,
  patch_chars=n/a; warnings={}
- ts-pattern-match-each FD r1: status=n/a, valid=false, resolved=n/a,
  invalidation=provider_failure, verifier=n/a/n/a, api=84, tokens_total=n/a,
  wall_ms=n/a,
  patch_files=package-lock.json,src/index.ts,src/match.ts,src/types/MatchEach.ts,src/types/index.ts,
  patch_chars=n/a; warnings={}
- wazero-multi-module-snapshots FD r1: status=n/a, valid=false, resolved=n/a,
  invalidation=provider_failure, verifier=n/a/n/a, api=22, tokens_total=n/a,
  wall_ms=n/a,
  patch_files=experimental/experimental.go,experimental/snapshot/snapshot.go,experimental/snapshot/snapshot_test.go,
  patch_chars=n/a; warnings={}

Outcome and follow-up: Not successful. Early top-3 FD probe invalidated all 3
samples as provider_failure. Follow-up: rescoring attempted after source
recovery.

## deepswe-top3-fd-r1-rescore-001

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-top3-fd-r1-rescore-001`

Approx size before deletion: 0.082 GB

Tasks observed: ipython-session-bundle-replay,
kombu-single-active-consumer-priority, ofetch-per-origin-circuit-breaker,
opa-rego-rule-profiling, psd-tools-blend-range-api, testem-per-launcher-reports,
true-myth-iterable-collection-combinators, ts-pattern-match-each,
wazero-multi-module-snapshots, ytt-jsonpath-query-api

Summary: total=10, valid_for_score=3, invalid=7, incomplete=0, resolved=0,
unresolved=3, verifier_infra_failures=0, patch_apply_failures=0.

Invalidation reasons: source_record_missing=7.

Warnings: quota_exhausted_recovered=3.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":10,"valid_for_score":3,"invalid":7,"incomplete":0,"resolved":0,"unresolved":3,"invalidation_reasons":{"source_record_missing":7},"warnings":{"quota_exhausted_recovered":3},"verifier_infra_failures":0,"patch_apply_failures":0}.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Run records:

- ipython-session-bundle-replay FD r1: status=n/a, valid=false, resolved=n/a,
  invalidation=source_record_missing, verifier=n/a/n/a, api=n/a,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=[]
- kombu-single-active-consumer-priority FD r1: status=n/a, valid=false,
  resolved=n/a, invalidation=source_record_missing, verifier=n/a/n/a, api=n/a,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=[]
- ofetch-per-origin-circuit-breaker FD r1: status=n/a, valid=false,
  resolved=n/a, invalidation=source_record_missing, verifier=n/a/n/a, api=n/a,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=[]
- opa-rego-rule-profiling FD r1: status=n/a, valid=false, resolved=n/a,
  invalidation=source_record_missing, verifier=n/a/n/a, api=n/a,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=[]
- psd-tools-blend-range-api FD r1: status=n/a, valid=false, resolved=n/a,
  invalidation=source_record_missing, verifier=n/a/n/a, api=n/a,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=[]
- testem-per-launcher-reports FD r1: status=n/a, valid=false, resolved=n/a,
  invalidation=source_record_missing, verifier=n/a/n/a, api=n/a,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=[]
- true-myth-iterable-collection-combinators FD r1: status=n/a, valid=true,
  resolved=false, invalidation=n/a, verifier=n/a/n/a, api=66, tokens_total=n/a,
  wall_ms=n/a,
  patch_files=src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,test/maybe.test.ts,test/result.test.ts,test/task.test.ts,test/toolbelt.test.ts,
  patch_chars=n/a; warnings=["quota_exhausted_recovered"]
- ts-pattern-match-each FD r1: status=n/a, valid=true, resolved=false,
  invalidation=n/a, verifier=n/a/n/a, api=84, tokens_total=n/a, wall_ms=n/a,
  patch_files=package-lock.json,src/index.ts,src/match.ts,src/types/MatchEach.ts,src/types/index.ts,
  patch_chars=n/a; warnings=["quota_exhausted_recovered"]
- wazero-multi-module-snapshots FD r1: status=n/a, valid=true, resolved=false,
  invalidation=n/a, verifier=n/a/n/a, api=22, tokens_total=n/a, wall_ms=n/a,
  patch_files=experimental/experimental.go,experimental/snapshot/snapshot.go,experimental/snapshot/snapshot_test.go,
  patch_chars=n/a; warnings=["quota_exhausted_recovered"]
- ytt-jsonpath-query-api FD r1: status=n/a, valid=false, resolved=n/a,
  invalidation=source_record_missing, verifier=n/a/n/a, api=n/a,
  tokens_total=n/a, wall_ms=n/a, patch_files=, patch_chars=n/a; warnings=[]

Outcome and follow-up: Partially useful but not successful as a campaign. It had
10 records, only 3 valid, 7 source_record_missing. Follow-up: narrowed to
source-present records and rescored again.

## deepswe-top3-fd-r1-rescore-002

Path before deletion:
`artifacts/pollux/deepswe-runs/deepswe-top3-fd-r1-rescore-002`

Approx size before deletion: 0.082 GB

Tasks observed: true-myth-iterable-collection-combinators,
ts-pattern-match-each, wazero-multi-module-snapshots

Summary: total=3, valid_for_score=3, invalid=0, incomplete=0, resolved=0,
unresolved=3, verifier_infra_failures=0, patch_apply_failures=0.

Invalidation reasons: none.

Warnings: quota_exhausted_recovered=3.

FD summary snapshot: total=n/a, valid=n/a, invalid=n/a, resolved=n/a,
unresolved=n/a.

FD score-summary snapshot:
{"total":3,"valid_for_score":3,"invalid":0,"incomplete":0,"resolved":0,"unresolved":3,"invalidation_reasons":{},"warnings":{"quota_exhausted_recovered":3},"verifier_infra_failures":0,"patch_apply_failures":0}.

Baseline/preflight status: No root baseline-verifier-preflight.json.

Run records:

- true-myth-iterable-collection-combinators FD r1: status=n/a, valid=true,
  resolved=false, invalidation=n/a, verifier=n/a/n/a, api=66, tokens_total=n/a,
  wall_ms=n/a,
  patch_files=src/maybe.ts,src/result.ts,src/task.ts,src/toolbelt.ts,test/maybe.test.ts,test/result.test.ts,test/task.test.ts,test/toolbelt.test.ts,
  patch_chars=n/a; warnings=["quota_exhausted_recovered"]
- ts-pattern-match-each FD r1: status=n/a, valid=true, resolved=false,
  invalidation=n/a, verifier=n/a/n/a, api=84, tokens_total=n/a, wall_ms=n/a,
  patch_files=package-lock.json,src/index.ts,src/match.ts,src/types/MatchEach.ts,src/types/index.ts,
  patch_chars=n/a; warnings=["quota_exhausted_recovered"]
- wazero-multi-module-snapshots FD r1: status=n/a, valid=true, resolved=false,
  invalidation=n/a, verifier=n/a/n/a, api=22, tokens_total=n/a, wall_ms=n/a,
  patch_files=experimental/experimental.go,experimental/snapshot/snapshot.go,experimental/snapshot/snapshot_test.go,
  patch_chars=n/a; warnings=["quota_exhausted_recovered"]

Outcome and follow-up: Technically valid but strategically superseded. Three
valid unresolved early exploratory FD records; kept only as historical signal
before the newer task-specific DeepSWE campaigns.
