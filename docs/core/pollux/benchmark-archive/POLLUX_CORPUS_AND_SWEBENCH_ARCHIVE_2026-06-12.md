# Pollux Corpus and SWE-bench Cleanup Archive - 2026-06-12

This file preserves the useful methodology trail from the approved deletion of
old Pollux corpus artifacts and SWE-bench working files. The deleted data was
mainly raw workspaces, repeated calibration runs, local repositories, Python
environments, Hugging Face cache data, and evaluator scratch output.

Approved deletion set covered two large areas:

- `artifacts/pollux/real-runs`: old Pollux corpus, calibration, FR/FD value
  campaigns, flash triage, smoke, and preflight histories. Size before deletion:
  about 1.626 GB.
- `evaluation_results` SWE-bench-related folders: local SWE-bench
  repos/evals/runs plus Python virtualenvs and cache folders. Size before
  deletion: about 10.438 GB.

## Why This Was Archived Instead Of Kept Raw

The raw directories were expensive to keep and not the primary evidence anymore.
They were useful for understanding the progression from local Pollux corpus work
to DeepSWE, but not useful enough to preserve every cloned repository, venv
package, raw scratch workspace, and intermediate failed evaluator attempt. The
archive keeps campaign names, available root summaries, selected task
information, SWE-bench selected instance IDs, run/eval directory names, and the
decision trail.

## SWE-bench Workspace Inventory

The deleted SWE-bench workspace was `evaluation_results/pollux-swe-lite-15`,
plus associated venv/cache folders. It contained:

- Selected instance count: 15.
- Selected instance IDs: django**django-10914, django**django-10924,
  django**django-11001, sympy**sympy-11400, sympy**sympy-11870,
  sympy**sympy-11897, scikit-learn**scikit-learn-10297,
  scikit-learn**scikit-learn-10508, scikit-learn**scikit-learn-10949,
  pytest-dev**pytest-11143, pytest-dev**pytest-11148, pytest-dev**pytest-5103,
  matplotlib**matplotlib-18869, matplotlib**matplotlib-22711,
  matplotlib\_\_matplotlib-22835.
- Run directories (30): fake-tool-canary-e-001, fake-tool-canary-e-002,
  preflight-prepare-e-001, preflight-prepare-e-002,
  preflight-prepare-e-003-after-bundle, preflight-prepare-e-004-longpaths,
  preflight-prepare-e-005-fresh-bundle,
  preflight-prepare-e-006-fresh-dist-bundle, prepare-001, prepare-002,
  prepare-003-A-auth, prepare-004-A-guard, sanity-bad-e-001, sanity-gold-e-001,
  sanity-null-e-001, smoke-001, smoke-002-A, smoke-003-A, smoke-005-A,
  smoke-006-A, smoke-007-FD, smoke-008-E, smoke-010-E-uncapped,
  smoke-011-E-two-untouched, upstream-fake-tool-canary-e-001,
  upstream-fake-tool-canary-e-002, upstream-fake-tool-canary-e-003,
  upstream-prepare-e-001, upstream-real-e-001, upstream-real-e-001.1.
- Eval directories (6): sanity-bad-e-001-eval, sanity-gold-e-001-eval,
  sanity-null-e-001-eval, smoke-010-E-uncapped-eval,
  smoke-011-E-two-untouched-eval, upstream-real-e-001-1-diagnostic-eval.
- Top-level workspace folders: `repos`, `repos-full`, `runs`, `evals`,
  `selected-instance-ids.txt`, and `selected-instances.json`.

### SWE-bench Outcome

The SWE-bench path was not retained as the final benchmark direction. It
produced heavy filesystem state, multiple prepare/smoke/eval attempts, local
repository copies, Python virtualenv duplication, and cache churn. The observed
workflow burden was too high relative to the clarity of the resulting signal.
The project moved toward DeepSWE because DeepSWE gave a cleaner task set for
long-horizon coding runs, better task-level verifier framing, and a more useful
bridge between infra status, model behavior, patch output, and
resolved/unresolved scoring.

The SWE-bench material should be cited in methodology as an abandoned evaluation
branch: useful for learning about infra cost and evaluator complexity, but not
used as the main evidence set.

## Pollux Real-runs Inventory

Total root run directories found before deletion: 106. Root summary
availability: 66 had `summary.json`, 8 had `value-summary.json`, and 8 had
`temporary-flash-only-summary.json`. Some directories were pure preflight/debug
runs and had no aggregate root summary.

### High-signal Value Campaigns

#### f-top3-fr-vs-fd

Generated at: 2026-04-29T22:25:12.528Z. Selected task set:
artifacts/pollux/manual-f-top3-selected-task-set.json. Corpus SHA:
d1c99e024d4a0ac13a8faf45b38f6257e28c778ab5a6b130a64284c8d2ca347e.

Selected task IDs: M3-BM-13-CASCADE-CONTRACT-REPAIR,
M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME.

Condition IDs: FR, FD.

- FR: advisor_trigger=executor_request, sample_count=9, valid=0, invalid=9,
  pass_count=0, pass_rate=n/a, total_cost_usd=0, cost_per_success_usd=n/a,
  total_tokens=0, advisor_tokens=0, advisor_call_rate=n/a,
  guidance_injection_rate=n/a, invalid_rate=100.0%, mean_wall_ms=0,
  mean_service_latency_ms=0.
- FD: advisor_trigger=detector, sample_count=9, valid=2, invalid=7,
  pass_count=2, pass_rate=100.0%, total_cost_usd=0.031514850000000004,
  cost_per_success_usd=0.015757425000000002, total_tokens=97493,
  advisor_tokens=0, advisor_call_rate=0.0%, guidance_injection_rate=0.0%,
  invalid_rate=77.8%, mean_wall_ms=21197.5, mean_service_latency_ms=2178.3.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

#### fr-vs-fd-top5-r2

Generated at: 2026-04-30T01:51:31.023Z. Selected task set:
artifacts/pollux/manual-fr-fd-top5-selected-task-set.json. Corpus SHA:
c7959441fbf8ea8f5a6e4e25e54bbdbf4cb0efbc4b5dbc9736b9d8b304d61d59.

Selected task IDs: M3-BM-13-CASCADE-CONTRACT-REPAIR,
M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME,
M3-BM-22-NEGATIVE-SPACE-PRESERVE, M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR.

Condition IDs: FR, FD.

- FR: advisor_trigger=executor_request, sample_count=10, valid=9, invalid=1,
  pass_count=6, pass_rate=66.7%, total_cost_usd=0.27147905,
  cost_per_success_usd=0.04524650833333333, total_tokens=1052457,
  advisor_tokens=0, advisor_call_rate=0.0%, guidance_injection_rate=0.0%,
  invalid_rate=10.0%, mean_wall_ms=103114.88888888889,
  mean_service_latency_ms=8541.118279569893.
- FD: advisor_trigger=detector, sample_count=10, valid=10, invalid=0,
  pass_count=8, pass_rate=80.0%, total_cost_usd=0.1919872,
  cost_per_success_usd=0.0239984, total_tokens=655384, advisor_tokens=3699,
  advisor_call_rate=80.0%, guidance_injection_rate=70.0%, invalid_rate=0.0%,
  mean_wall_ms=42962.3, mean_service_latency_ms=4711.56338028169.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

#### fd-healthcheck-2tasks-r2

Generated at: 2026-04-30T04:35:39.560Z. Selected task set:
artifacts/pollux/manual-fr-healthcheck-2tasks-selected-task-set.json. Corpus
SHA: 1484f60c17382c48cf34cfdc978ca4290744a9865065ff7192bd40b6751e57af.

Selected task IDs: M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR,
M3-BM-24-ALIAS-PRESERVING-RENAME.

Condition IDs: FD.

- FD: advisor_trigger=detector, sample_count=4, valid=4, invalid=0,
  pass_count=4, pass_rate=100.0%, total_cost_usd=0.0788605,
  cost_per_success_usd=0.019715125, total_tokens=294539, advisor_tokens=1584,
  advisor_call_rate=125.0%, guidance_injection_rate=75.0%, invalid_rate=0.0%,
  mean_wall_ms=42550.25, mean_service_latency_ms=4147.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

#### fr-healthcheck-2tasks-r2

Generated at: 2026-04-30T04:36:22.416Z. Selected task set:
artifacts/pollux/manual-fr-healthcheck-2tasks-selected-task-set.json. Corpus
SHA: 1484f60c17382c48cf34cfdc978ca4290744a9865065ff7192bd40b6751e57af.

Selected task IDs: M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR,
M3-BM-24-ALIAS-PRESERVING-RENAME.

Condition IDs: FR.

- FR: advisor_trigger=executor_request, sample_count=4, valid=3, invalid=1,
  pass_count=3, pass_rate=100.0%, total_cost_usd=0.06966585,
  cost_per_success_usd=0.02322195, total_tokens=287347, advisor_tokens=0,
  advisor_call_rate=0.0%, guidance_injection_rate=0.0%, invalid_rate=25.0%,
  mean_wall_ms=44680.666666666664, mean_service_latency_ms=3178.1111111111113.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

#### fd-batch3-2tasks-r3-v1

Generated at: 2026-04-30T05:06:13.003Z. Selected task set:
artifacts/pollux/manual-fd-batch3-2tasks-r3-selected-task-set.json. Corpus SHA:
ee692a6464b2c26fa088678f8edc0c3ac7797d2e3d0c7c17c6cea143260607c7.

Selected task IDs: M3-BM-22-NEGATIVE-SPACE-PRESERVE, PILOT-BM-19-MULTI-REFACTOR.

Condition IDs: FD.

- FD: advisor_trigger=detector, sample_count=6, valid=6, invalid=0,
  pass_count=6, pass_rate=100.0%, total_cost_usd=0.1103304,
  cost_per_success_usd=0.0183884, total_tokens=448790, advisor_tokens=1575,
  advisor_call_rate=50.0%, guidance_injection_rate=50.0%, invalid_rate=0.0%,
  mean_wall_ms=46077, mean_service_latency_ms=4099.326086956522.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

#### fd-batch1-3tasks-r3-v1

Generated at: 2026-04-30T05:08:31.204Z. Selected task set:
artifacts/pollux/manual-fd-batch1-3tasks-r3-selected-task-set.json. Corpus SHA:
d1c99e024d4a0ac13a8faf45b38f6257e28c778ab5a6b130a64284c8d2ca347e.

Selected task IDs: M3-BM-13-CASCADE-CONTRACT-REPAIR,
M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME.

Condition IDs: FD.

- FD: advisor_trigger=detector, sample_count=9, valid=9, invalid=0,
  pass_count=8, pass_rate=88.9%, total_cost_usd=0.23145155,
  cost_per_success_usd=0.02893144375, total_tokens=800052, advisor_tokens=3178,
  advisor_call_rate=66.7%, guidance_injection_rate=66.7%, invalid_rate=0.0%,
  mean_wall_ms=47344.555555555555, mean_service_latency_ms=3846.590361445783.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

#### fd-batch2-3tasks-r3-v1

Generated at: 2026-04-30T05:13:20.155Z. Selected task set:
artifacts/pollux/manual-fd-batch2-3tasks-r3-selected-task-set.json. Corpus SHA:
c7be2bc753efebdb846b01be5c242a812a6d4c68500549e1973b00c4f6cb1fcd.

Selected task IDs: M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR,
M3-BM-17-TRANSITIVE-IMPORT-SOURCE-FIX, M3-BM-18-TEST-INTENT-PARSER-EDGE.

Condition IDs: FD.

- FD: advisor_trigger=detector, sample_count=9, valid=9, invalid=0,
  pass_count=8, pass_rate=88.9%, total_cost_usd=0.23531750000000004,
  cost_per_success_usd=0.029414687500000005, total_tokens=905512,
  advisor_tokens=4734, advisor_call_rate=111.1%, guidance_injection_rate=100.0%,
  invalid_rate=0.0%, mean_wall_ms=78777.66666666667,
  mean_service_latency_ms=7218.571428571428.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

#### lite-a-batch1-top4-r3-v1

Generated at: 2026-04-30T06:08:15.916Z. Selected task set:
artifacts/pollux/real-runs/fr-batch1-top4-r3-v2/selected-task-set.json. Corpus
SHA: c6bd4d5a60a7bdc2aa5a6d147ed703d7e0e802aeb05c941bec5a286522bb8467.

Selected task IDs: M3-BM-13-CASCADE-CONTRACT-REPAIR,
M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME,
PILOT-BM-19-MULTI-REFACTOR.

Condition IDs: L.

- L: advisor_trigger=n/a, sample_count=12, valid=12, invalid=0, pass_count=9,
  pass_rate=75.0%, total_cost_usd=n/a, cost_per_success_usd=n/a,
  total_tokens=666239, advisor_tokens=0, advisor_call_rate=0.0%,
  guidance_injection_rate=0.0%, invalid_rate=0.0%, mean_wall_ms=126275.25,
  mean_service_latency_ms=16837.640625.

Outcome: value-campaign evidence was useful for the local Pollux corpus phase,
especially comparing FR/FD behavior and cost/success tradeoffs. It was
superseded by DeepSWE for article-grade external task evidence.

## Complete Pollux Real-run Directory Ledger

Each line records the directory, timestamp, which root summary files existed,
and the compact result summary where available.

- acceptance-debug (2026-04-24T21:38:01.166Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pricing-snapshot-check (2026-04-24T21:43:41.189Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- m2-acceptance-001-preflight (2026-04-24T21:44:54.369Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- m2-acceptance-001 (2026-04-25T04:07:23.691Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- m2-fix-preflight (2026-04-25T04:35:34.389Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- m3-preflight-001 (2026-04-25T08:39:40.619Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- m3-calibration-smoke-001 (2026-04-25T08:41:50.260Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- m3-temporary-flash-triage-001 (2026-04-25T09:00:00.020Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- m3-a-screen-001-s01 (2026-04-26T07:31:15.124Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- m3-a-screen-001-s02 (2026-04-26T08:28:49.187Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- m3-a-screen-001-s03 (2026-04-26T08:36:14.047Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- m3-a-screen-001-s01-bm08-rerun (2026-04-26T08:38:59.404Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- m3-a-screen-001-m3bm09-rerun (2026-04-26T09:13:10.219Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- m3-a-screen-001-m3bm11-rerun (2026-04-26T09:15:30.933Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- m3-a-screen-002-hardpack-plus-seeds (2026-04-26T11:59:47.452Z): summary=false,
  value_summary=false, flash_summary=true; temporary flash summary;
  keys=generatedAt, calibrationBatchId, provisional, provisionalReason,
  corpusSha, thresholds, candidateTaskCount, selectedTaskCount, groupCounts,
  taskSummaries, selectedTaskIds, rejectedTaskIds.
- f-ceiling-patch-preflight-20260428 (2026-04-28T04:51:20.215Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- f-ceiling-patch-preflight-bundle-20260428 (2026-04-28T04:51:40.989Z):
  summary=false, value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- bulletproof-targeted-001 (2026-04-28T08:40:26.320Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=9, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- debug-escalating (2026-04-28T08:40:26.646Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=18, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- debug-escalating-post-patch (2026-04-28T08:40:26.980Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=18, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m1-post-baseline (2026-04-28T08:40:27.356Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=18, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-smoke-detector-align-4x2-004 (2026-04-28T08:40:49.996Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=8, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-smoke-detector-align-4x2-003 (2026-04-28T08:40:50.078Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=8, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-smoke-detector-align-4x2-002 (2026-04-28T08:40:50.163Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=8, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-smoke-detector-align-4x2-001 (2026-04-28T08:40:50.242Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=8, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-only-001-b4-diagnostic-ceiling18 (2026-04-28T08:40:50.323Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- m3-f-only-001-b3-diagnostic-ceiling18 (2026-04-28T08:40:50.389Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- m3-f-only-001-b2-diagnostic-ceiling18 (2026-04-28T08:40:50.454Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- m3-f-only-001-b1-diagnostic-ceiling18 (2026-04-28T08:40:50.518Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- m3-f-only-001-b1 (2026-04-28T08:40:50.578Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-002-b6 (2026-04-28T08:40:50.636Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-002-b4 (2026-04-28T08:40:50.784Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-002-b3 (2026-04-28T08:40:50.844Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-002-b2 (2026-04-28T08:40:50.936Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=9, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-002-b1 (2026-04-28T08:40:51.033Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=9, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-001-b2 (2026-04-28T08:40:51.138Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=12, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-001-b1 (2026-04-28T08:40:51.273Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=12, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-e-only-002-b5 (2026-04-28T08:42:19.651Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- m3-e-only-002-b5.2 (2026-04-28T08:42:19.653Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-only-002-b4 (2026-04-28T08:47:46.275Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-only-002-b3 (2026-04-28T08:51:14.777Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-only-002-b2 (2026-04-28T09:08:25.699Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-only-002-b1 (2026-04-28T09:09:50.957Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- m3-f-only-002-b1-2 (2026-04-28T09:15:34.577Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- f-top3-fr-vs-fd (2026-04-29T22:25:12.530Z): summary=false, value_summary=true,
  flash_summary=false; value summary;
  selected_tasks=M3-BM-13-CASCADE-CONTRACT-REPAIR,
  M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME;
  conditions=FR, FD; FR: samples=9, valid=0, pass=0/0, pass_rate=n/a, cost=$0,
  mean_wall=0ms, tokens=0, invalid_rate=100.0%; FD: samples=9, valid=2,
  pass=2/2, pass_rate=100.0%, cost=$0.031514850000000004, mean_wall=21198ms,
  tokens=97493, invalid_rate=77.8%.
- fr-vs-fd-top5-r2 (2026-04-30T01:51:31.026Z): summary=false,
  value_summary=true, flash_summary=false; value summary;
  selected_tasks=M3-BM-13-CASCADE-CONTRACT-REPAIR,
  M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME,
  M3-BM-22-NEGATIVE-SPACE-PRESERVE, M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR;
  conditions=FR, FD; FR: samples=10, valid=9, pass=6/9, pass_rate=66.7%,
  cost=$0.27147905, mean_wall=103115ms, tokens=1052457, invalid_rate=10.0%; FD:
  samples=10, valid=10, pass=8/10, pass_rate=80.0%, cost=$0.1919872,
  mean_wall=42962ms, tokens=655384, invalid_rate=0.0%.
- fd-full8-r3-v2 (2026-04-30T04:25:54.870Z): summary=false, value_summary=false,
  flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- fr-batch1-top4-r3-v2 (2026-04-30T04:26:13.910Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- fr-batch2-top4-r3-v2 (2026-04-30T04:26:31.487Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- fd-healthcheck-2tasks-r2 (2026-04-30T04:35:39.561Z): summary=false,
  value_summary=true, flash_summary=false; value summary;
  selected_tasks=M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR,
  M3-BM-24-ALIAS-PRESERVING-RENAME; conditions=FD; FD: samples=4, valid=4,
  pass=4/4, pass_rate=100.0%, cost=$0.0788605, mean_wall=42550ms, tokens=294539,
  invalid_rate=0.0%.
- fr-healthcheck-2tasks-r2 (2026-04-30T04:36:22.418Z): summary=false,
  value_summary=true, flash_summary=false; value summary;
  selected_tasks=M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR,
  M3-BM-24-ALIAS-PRESERVING-RENAME; conditions=FR; FR: samples=4, valid=3,
  pass=3/3, pass_rate=100.0%, cost=$0.06966585, mean_wall=44681ms,
  tokens=287347, invalid_rate=25.0%.
- fd-batch3-2tasks-r3-v1 (2026-04-30T05:06:13.004Z): summary=false,
  value_summary=true, flash_summary=false; value summary;
  selected_tasks=M3-BM-22-NEGATIVE-SPACE-PRESERVE, PILOT-BM-19-MULTI-REFACTOR;
  conditions=FD; FD: samples=6, valid=6, pass=6/6, pass_rate=100.0%,
  cost=$0.1103304, mean_wall=46077ms, tokens=448790, invalid_rate=0.0%.
- fd-batch1-3tasks-r3-v1 (2026-04-30T05:08:31.206Z): summary=false,
  value_summary=true, flash_summary=false; value summary;
  selected_tasks=M3-BM-13-CASCADE-CONTRACT-REPAIR,
  M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME;
  conditions=FD; FD: samples=9, valid=9, pass=8/9, pass_rate=88.9%,
  cost=$0.23145155, mean_wall=47345ms, tokens=800052, invalid_rate=0.0%.
- fd-batch2-3tasks-r3-v1 (2026-04-30T05:13:20.157Z): summary=false,
  value_summary=true, flash_summary=false; value summary;
  selected_tasks=M3-BM-15-STATE-MACHINE-INVARIANT-REPAIR,
  M3-BM-17-TRANSITIVE-IMPORT-SOURCE-FIX, M3-BM-18-TEST-INTENT-PARSER-EDGE;
  conditions=FD; FD: samples=9, valid=9, pass=8/9, pass_rate=88.9%,
  cost=$0.23531750000000004, mean_wall=78778ms, tokens=905512,
  invalid_rate=0.0%.
- lite-a-batch2-top4-r3-v1 (2026-04-30T05:42:58.589Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- lite-lfd-full8-r3-v1 (2026-04-30T05:43:04.700Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- lite-a-batch1-top4-r3-v1 (2026-04-30T06:08:15.930Z): summary=false,
  value_summary=true, flash_summary=false; value summary;
  selected_tasks=M3-BM-13-CASCADE-CONTRACT-REPAIR,
  M3-BM-20-GUARDED-REGISTRY-RENAME, M3-BM-24-ALIAS-PRESERVING-RENAME,
  PILOT-BM-19-MULTI-REFACTOR; conditions=L; L: samples=12, valid=12, pass=9/12,
  pass_rate=75.0%, cost=$n/a, mean_wall=126275ms, tokens=666239,
  invalid_rate=0.0%.
- lfd-trace-smoke-001 (2026-05-01T00:04:55.864Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=1, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1-smoke-001 (2026-05-06T16:37:39.906Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1-smoke-001.1 (2026-05-06T16:37:59.751Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1-smoke-A-one-002 (2026-05-06T16:50:52.429Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1-killcheck-A-001 (2026-05-06T17:01:55.863Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=1, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1-smoke-A-one-003 (2026-05-06T17:04:38.651Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=1, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1-smoke-A-one-004 (2026-05-06T17:10:57.683Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=1, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1-smoke-E-one-001 (2026-05-06T17:13:00.865Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=1, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1-smoke-FD-one-001 (2026-05-06T17:15:35.717Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=1, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1-smoke-hard-A-E-FD-001 (2026-05-06T17:20:32.144Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=3, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_1-calibration-E-6task-r3-001 (2026-05-07T04:33:20.794Z):
  summary=false, value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1_1-calibration-A-6task-r3-001a (2026-05-07T04:38:39.222Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=9, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_1-calibration-A-6task-r3-001b (2026-05-07T04:42:08.942Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=9, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_1-calibration-E-remaining-r3-001 (2026-05-07T04:57:07.223Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=9, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_2-calib-6-A-batch1-001 (2026-05-07T11:08:15.303Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1_2-calib-6-A-batch2-001 (2026-05-07T11:08:41.279Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1_2-calib-6-E-all-001 (2026-05-07T11:08:48.017Z): summary=false,
  value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1_2-calib-6-A-remaining-guarded-medium-001 (2026-05-07T11:29:57.433Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=1, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_2-calib-6-A-remaining-source-brutal-001 (2026-05-07T11:30:56.380Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=2, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_2-calib-6-A-remaining-test-brutal-001 (2026-05-07T11:34:11.185Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=3, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_2-calib-6-A-batch4-001 (2026-05-07T12:39:21.488Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_2-calib-6-A-batch5-001 (2026-05-07T12:40:30.622Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_2-calib-6-A-batch3-001 (2026-05-07T12:42:26.039Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=6, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_2-calib-6-A-final-batch6b-001 (2026-05-07T12:46:20.449Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=3, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_2-calib-6-A-final-batch6a-001 (2026-05-07T12:46:47.027Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=3, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_2-calib-6-A-final-batch6c-001 (2026-05-07T12:47:10.493Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=3, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-precal-batch1-001 (2026-05-07T14:31:32.234Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=12, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_3-A-precal-batch3-001 (2026-05-07T14:34:11.898Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=9, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_3-A-precal-batch2-001 (2026-05-07T14:37:24.627Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=9, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_3-A-repair-precal-batch3-001 (2026-05-07T16:35:38.939Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=9, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-repair-precal-batch1-001 (2026-05-07T16:41:32.533Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=12, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-repair-precal-rerun-batch2-001 (2026-05-08T04:58:28.015Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=9, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-repair-precal-rerun-batch1-001 (2026-05-08T04:59:15.231Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=12, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-repair-precal-rerun-batch3-001 (2026-05-08T04:59:36.741Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=9, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-E-calibration-batch1-001 (2026-05-08T05:21:56.901Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=15, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_3-E-calibration-batch2-001 (2026-05-08T05:23:46.383Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=15, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_3-E-calibration-batch3-001 (2026-05-08T05:24:03.144Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=15, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_3-L-calibration-easy-001 (2026-05-08T05:39:15.157Z): summary=true,
  value_summary=false, flash_summary=false; summary; sampleCount=15, valid=n/a,
  pass/resolved=n/a, accuracy/passRate=n/a, totalTokens=n/a, cost=n/a,
  meanWall=n/a.
- pollux-v1_3-L-calibration-hard-batch1-001 (2026-05-08T05:39:45.441Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-L-calibration-medium-batch1-001 (2026-05-08T05:43:22.978Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=9, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-L-calibration-medium-batch2-001 (2026-05-08T05:43:58.082Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-L-calibration-hard-batch2-001 (2026-05-08T05:47:14.733Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-L-calibration-hard-batch3-001 (2026-05-08T05:47:52.937Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=3, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-E-calibration-remaining-batch1-001 (2026-05-12T12:09:09.604Z):
  summary=false, value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1_3-E-calibration-remaining-batch2-001 (2026-05-12T12:10:23.847Z):
  summary=false, value_summary=false, flash_summary=false; no root
  summary/value-summary/temporary-flash-only-summary.
- pollux-v1_3-E-calibration-remaining-batch3-001 (2026-05-12T12:12:49.037Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=3, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-calibration-easy-batch3-001 (2026-05-12T12:37:41.161Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=3, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-calibration-easy-batch2-001 (2026-05-12T12:38:50.732Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.
- pollux-v1_3-A-calibration-easy-batch1-001 (2026-05-12T12:39:24.778Z):
  summary=true, value_summary=false, flash_summary=false; summary;
  sampleCount=6, valid=n/a, pass/resolved=n/a, accuracy/passRate=n/a,
  totalTokens=n/a, cost=n/a, meanWall=n/a.

## Methodology Takeaways

1. The local Pollux corpus was useful for fast iteration, hardening the runner,
   and testing detector/advisor conditions, but it was not enough as a final
   external benchmark story.
2. SWE-bench introduced high setup and storage overhead: multiple Python
   environments, local repos, prepared instance sets, smoke/eval attempts, and
   cache state. The storage cost alone was over 10 GB for artifacts that were no
   longer primary evidence.
3. DeepSWE became the better path because it exposed clearer per-task campaigns,
   repeatable preflight/dependency checks, meaningful resolved/unresolved
   scoring, and direct visibility into API responses, warnings, patch
   generation, verifier failures, and runner bugs.
4. Future article framing should treat Pollux corpus and SWE-bench as
   methodology development phases, then use the retained DeepSWE 10-sample
   evidence and any later 15-sample extension as the main empirical result.

## Next Steps Captured After These Runs

- Keep the current DeepSWE valid evidence directories until the article
  tables/figures are finalized.
- Rerun paid sample-3 DeepSWE batches only after freeing disk and confirming
  Testem baseline preflight.
- For historical discussion, cite the Pollux corpus as internal calibration and
  SWE-bench as the abandoned infra-heavy branch.
- Avoid reusing old SWE-bench local workspaces; recreate cleanly only if a
  future article section explicitly needs SWE-bench comparison.
