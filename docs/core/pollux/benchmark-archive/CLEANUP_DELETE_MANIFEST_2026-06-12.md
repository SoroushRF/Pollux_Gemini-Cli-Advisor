# Benchmark Cleanup Delete Manifest - 2026-06-12

This manifest records the exact approved deletion scope. The archive files
created before deletion are:

- docs/core/pollux/benchmark-archive/DEEPSWE_CLEANUP_ARCHIVE_2026-06-12.md
- docs/core/pollux/benchmark-archive/POLLUX_CORPUS_AND_SWEBENCH_ARCHIVE_2026-06-12.md

The user explicitly approved deleting only the workspace artifacts below and
explicitly excluded all C:\tmp scratch/repo-copy candidates.

## Approved Deletion Groups

### SWE-bench Junk - estimated 10.438 GB

- evaluation_results/pollux-swe-lite-15
- evaluation_results/.venv-swebench-wsl
- evaluation_results/.venv-swebench38
- evaluation_results/hf-cache
- evaluation_results/swebench-py312-site
- evaluation_results/pollux-swe-lite-gold-smoke
- evaluation_results/.venv-swebench312
- evaluation_results/.venv-swebench
- evaluation_results/.venv-swebench314
- evaluation_results/.tmp

### Pollux Corpus Historical Runs - estimated 1.626 GB

- artifacts/pollux/real-runs

### Fresh5 Failed / Superseded DeepSWE Artifacts - estimated 5.386 GB

- artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch1-wazero2-ts1
- artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch2-ts1-myth2
- artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch3-testem2-opa2
- artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-batch3-testem2-opa2-preflight-rerun
- artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-sample3-batch7-wazero-ts
- artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-sample3-batch8-myth-opa
- artifacts/pollux/deepswe-runs/deepswe-fd-fresh5-sample3-batch9-testem-only

### Older Invalid / Superseded DeepSWE Artifacts - estimated 7.181 GB

- artifacts/pollux/deepswe-runs/deepswe-opa-fd-strict-r1
- artifacts/pollux/deepswe-runs/deepswe-opa-fd-strict-r1-rescore-after-model-build-failure-classifier
- artifacts/pollux/deepswe-runs/deepswe-true-myth-fd-providerfix-r7-r8
- artifacts/pollux/deepswe-runs/deepswe-true-myth-fd-providerfix-r7-r8-rescore-after-verifier-install-fix
- artifacts/pollux/deepswe-runs/deepswe-fd-relaxed-ts-pattern-r5-r6
- artifacts/pollux/deepswe-runs/deepswe-fd-relaxed-true-myth-r1-r2
- artifacts/pollux/deepswe-runs/deepswe-top3-fd-r1
- artifacts/pollux/deepswe-runs/deepswe-top3-fd-r1-rescore-001
- artifacts/pollux/deepswe-runs/deepswe-top3-fd-r1-rescore-002

## Explicitly Not Deleted

No paths under C:/tmp were included in this cleanup, including C:/tmp/deep-swe
and all C:/tmp/pollux-deepswe\* scratch roots. Current valid DeepSWE evidence
directories were also not included in the deletion set.

## Estimated Reclaimed Space

Total approved deletion estimate: 24.631 GB.
