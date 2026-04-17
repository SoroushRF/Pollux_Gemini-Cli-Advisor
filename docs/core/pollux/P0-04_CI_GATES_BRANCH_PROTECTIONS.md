# P0-04 CI Gates and Branch Protection Contract

Version: 1.0 Date: 2026-04-17 Status: Draft for Phase 0 task closure Purpose:
Phase 0 deliverable for P0-04 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This document defines mandatory CI gates and branch protection controls required
before and during Pollux implementation.

It covers:

1. Required CI jobs and checks for Pollux-touching changes.
2. Branch protection rules for main.
3. Gate-to-test mapping and enforcement expectations.

This document is a control contract. Workflow implementation PRs are tracked
separately.

---

## 2) Current baseline snapshot

### 2.1 Current PR CI aggregator

Current CI aggregator requires these job outcomes to be success or skipped:

1. lint
2. link_checker
3. test_linux
4. test_mac
5. test_windows
6. codeql
7. bundle_size

### 2.2 Current gaps for Pollux readiness

1. Binary smoke workflow is manual-only (workflow_dispatch).
2. Perf and memory workflows are nightly/manual, not PR-gated.
3. Pollux-scoped schema drift check and doc/spec drift checks are not defined as
   mandatory branch protections yet.

---

## 3) Mandatory Pollux CI gates contract

The following checks are mandatory for PRs that touch Pollux-critical paths (at
minimum packages/core/src/pollux/\*\*, policy/settings/ci workflow paths, and
Pollux governance docs).

| Gate ID | Required check/job contract                                                                         | Purpose                                                   | Phase alignment     |
| ------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------- |
| CG-01   | Baseline CI aggregate (lint, link_checker, test_linux, test_mac, test_windows, codeql, bundle_size) | Preserve baseline quality and portability                 | Always              |
| CG-02   | schema:settings check (npm run schema:settings -- --check)                                          | Prevent schema artifact drift for Pollux settings rollout | Phase 0 onward      |
| CG-03   | Pollux doc/spec drift check                                                                         | Prevent POLLUX_SPEC/plan/ledger divergence                | Phase 0 onward      |
| CG-04   | Pollux benchmark fairness harness check (smoke)                                                     | Enforce fairness pins for benchmark comparability         | Before Phase 4      |
| CG-05   | Pollux binary build smoke check                                                                     | Catch SEA/bundling regressions on Pollux changes          | Before Phase 5 exit |
| CG-06   | Pollux perf and memory check                                                                        | Detect performance and memory regressions pre-merge       | Before Phase 5 exit |

Notes:

1. CG-01 exists today through ci.yml.
2. CG-02 through CG-06 are required by contract and must be enforced via
   workflow updates in subsequent implementation tasks.

---

## 4) Branch protection contract for main

Required protections:

1. Require pull request for all changes to main (no direct push).
2. Require passing required status checks from section 3.
3. Require code owner review for protected paths.
4. Require all review threads to be resolved.
5. Dismiss stale approvals on new commits.
6. Require branch to be up to date before merge.
7. Restrict force pushes and branch deletion on protected branch.

Protected path focus for Pollux phase:

1. packages/core/src/pollux/\*\*
2. POLLUX_SPEC.md
3. IMPLEMENTATION_PLAN.md
4. POLLUX_DOC_CORRECTIONS.md
5. docs/core/pollux/\*\*
6. docs/repo-compartment-analysis/\*\*
7. .github/workflows/\*\* for Pollux-scoped checks

---

## 5) Gate mapping to TG and release policy

| Contract gate | Related TG(s)               | Release relevance                                |
| ------------- | --------------------------- | ------------------------------------------------ |
| CG-01         | TG-2, TG-6 baseline support | Core baseline confidence                         |
| CG-02         | TG-5                        | Required for settings integrity                  |
| CG-03         | TG-10                       | Required for governance integrity                |
| CG-04         | TG-1                        | Required for benchmark validity                  |
| CG-05         | TG-9                        | Required for Pollux binary readiness             |
| CG-06         | TG-9                        | Required for Pollux performance/memory readiness |

No latest promotion without TG-1 through TG-10 green.

---

## 6) P0-04 acceptance checklist

P0-04 is complete when:

1. Mandatory CI gate list is documented with required checks and ownership
   context.
2. Branch protection requirements are documented for main.
3. Gate mapping to TGs is documented.
4. Current-state gaps are identified and linked to follow-up implementation
   tasks.

---

## 7) References

1. IMPLEMENTATION_PLAN.md (P0-04 task, section 7 CI and release gates,
   TG-1..TG-10).
2. POLLUX_SPEC.md section 12 (CI, test, and release contract).
3. docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci/report.md
   (VT-15.4, C-15.1, R-15.3).
4. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (NA-9).
5. .github/workflows/ci.yml (current CI aggregate gate job).
6. .github/workflows/test-build-binary.yml (manual-only binary workflow).
7. .github/workflows/perf-nightly.yml and .github/workflows/memory-nightly.yml
   (nightly-only perf/memory workflows).
