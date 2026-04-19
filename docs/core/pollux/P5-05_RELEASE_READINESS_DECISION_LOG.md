# P5-05 Release Readiness Decision Log

Version: 1.0 Generated: 2026-04-18 Status: HOLD (no latest promotion yet) TG
mapping: TG-7, TG-9, TG-10

---

## 1) Scope

This document records the Phase 5 release-readiness review outcome for Pollux,
including:

1. Gate status for TG-7, TG-9, and TG-10.
2. Risk-closure summary across P5-01 through P5-04.
3. Rollback plan for rapid remediation.
4. Final ship-readiness decision.

This is the P5-05 deliverable referenced by IMPLEMENTATION_PLAN.md.

## 2) Inputs Reviewed

1. Task evidence in IMPLEMENTATION_PLAN.md (P5-01..P5-04).
2. Correction ledger state in POLLUX_DOC_CORRECTIONS.md.
3. Workflow trigger configuration in:
   - .github/workflows/test-build-binary.yml
   - .github/workflows/perf-nightly.yml
   - .github/workflows/memory-nightly.yml
4. Pollux command and behavior tests from P5-01/P5-02:
   - packages/cli/src/ui/commands/polluxCommand.test.ts
   - packages/cli/src/acp/commands/pollux.test.ts
   - packages/cli/src/services/BuiltinCommandLoader.test.ts
   - packages/cli/src/acp/commandHandler.test.ts
   - packages/cli/src/acp/acpClient.test.ts

## 3) Gate Status Snapshot

| Gate  | Status | Evidence                                | Notes                                                                                                                                                        |
| ----- | ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TG-7  | GREEN  | P5-01/P5-02 tests and parity assertions | /pollux is reachable on required command surfaces with shared parsing/formatting semantics.                                                                  |
| TG-10 | GREEN  | P5-03 docs sync updates                 | Plan/spec/ledger are synchronized to shipped /pollux behavior and governance state.                                                                          |
| TG-9  | AMBER  | P5-04 workflow trigger enablement       | Required workflows are now Pollux-scoped on PR/push, but this log does not include a first observed end-to-end green run artifact from a Pollux-touching PR. |

## 4) Risk Closure Summary

Closed or materially reduced in Phase 5:

1. Command fragmentation risk: closed by P5-01 registration on built-in + ACP
   surfaces.
2. UX ambiguity risk for /pollux status: reduced by P5-02 indicators and
   optional debug detail mode.
3. Doc/spec/ledger drift risk: reduced by P5-03 synchronization.
4. Pollux release-safety trigger gap: reduced by P5-04 workflow trigger
   enablement.

Residual risk:

1. TG-9 runtime confirmation is pending in this artifact. Trigger configuration
   is complete, but board-level promotion should wait for at least one
   Pollux-touching PR cycle that reports green binary/perf/memory checks.

## 5) Rollback Plan

### 5.1 Rollback triggers

Initiate rollback if any of the following occurs after enablement:

1. Binary build smoke check fails consistently for Pollux-touching PRs.
2. Perf or memory checks show sustained regression attributable to Pollux
   changes.
3. /pollux command behavior causes production-impacting regressions.

### 5.2 Rollback order (least to most disruptive)

1. CI trigger rollback only:
   - Revert workflow-trigger commit for Pollux-scoped binary/perf/memory checks.
2. UX rollback (keep reachability):
   - Revert P5-02 command UX/debug detail changes.
3. Full command rollback:
   - Revert P5-01 command registration and implementation commits.

### 5.3 Operational rollback procedure

1. Create a hotfix branch from main.
2. Revert targeted commit(s) with non-interactive git revert.
3. Run focused Pollux tests:
   - npm test --workspace @google/gemini-cli --
     src/ui/commands/polluxCommand.test.ts
     src/services/BuiltinCommandLoader.test.ts src/acp/commands/pollux.test.ts
     src/acp/commandHandler.test.ts src/acp/acpClient.test.ts
4. Merge hotfix with CODEOWNERS approval for Pollux governance paths.
5. Record rollback rationale and evidence in POLLUX_DOC_CORRECTIONS.md change
   log.

## 6) Decision

Decision: HOLD for latest promotion.

Rationale:

1. P5 implementation work is complete through workflow enablement (P5-04).
2. TG-7 and TG-10 are green from direct evidence.
3. TG-9 trigger wiring is complete, but this artifact does not yet include a
   first observed green Pollux-touching PR run for binary/perf/memory checks.

Release board action:

1. Accept this P5-05 review log as complete.
2. Require one confirmed green TG-9 PR cycle before changing decision from HOLD
   to GO for promotion.
