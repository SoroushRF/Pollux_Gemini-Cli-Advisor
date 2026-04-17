# P0-06 Governance Controls: CODEOWNERS and Correction Ledger Process

Version: 1.0 Date: 2026-04-17 Status: Draft for Phase 0 task closure Purpose:
Phase 0 deliverable for P0-06 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This document records the governance controls landed for Pollux in Phase 0.

It covers:

1. Explicit CODEOWNERS coverage for Pollux governance documents.
2. Correction-ledger operating process for Pollux doc/spec drift control.
3. Review ownership map for high-impact Pollux documentation surfaces.

This is a governance control artifact. Follow-on automation tasks can extend
this contract, but cannot weaken it.

---

## 2) Landed governance controls

### 2.1 CODEOWNERS control (landed)

The CODEOWNERS file now explicitly covers Pollux governance paths:

1. /POLLUX\_\*.md
2. /IMPLEMENTATION_PLAN.md
3. /docs/repo-compartment-analysis/
4. /docs/core/pollux/

Review owners for these paths are maintainers plus docs owners.

### 2.2 Correction ledger process control (landed)

The correction ledger now includes a mandatory operating process:

1. Intake rule for any Pollux behavior/doc drift.
2. Owner assignment by compartment owner.
3. Verification evidence required before Done status.
4. CODEOWNERS review path enforcement for Pollux governance docs.
5. Closure criteria requiring doc and implementation alignment.
6. Reopen-on-drift rule for post-merge divergence.

---

## 3) Review ownership map

| Path/pattern                     | Required owners                                                        | Control purpose                                   |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| /POLLUX\_\*.md                   | @google-gemini/gemini-cli-maintainers + @google-gemini/gemini-cli-docs | Protect Pollux design/spec/correction governance  |
| /IMPLEMENTATION_PLAN.md          | @google-gemini/gemini-cli-maintainers + @google-gemini/gemini-cli-docs | Protect execution-gate and phase contract         |
| /docs/repo-compartment-analysis/ | @google-gemini/gemini-cli-maintainers + @google-gemini/gemini-cli-docs | Protect forensic and synthesis governance records |
| /docs/core/pollux/               | @google-gemini/gemini-cli-maintainers + @google-gemini/gemini-cli-docs | Protect Pollux control-contract artifacts         |

---

## 4) Governance workflow for Pollux changes

For any PR touching Pollux runtime, configuration, policy, benchmark, or docs:

1. Identify whether a correction-ledger item exists.
2. Create/update correction-ledger item before merge if drift risk is present.
3. Link verification evidence before moving item to Done.
4. Ensure CODEOWNERS approvals are present for protected Pollux governance
   paths.
5. If drift appears post-merge, reopen the ledger item and link remediation PR.

---

## 5) G5 and TG-10 mapping

| Governance control                                                 | Plan gate alignment | Test-gate relevance |
| ------------------------------------------------------------------ | ------------------- | ------------------- |
| Explicit POLLUX\_\*.md and repo-compartment coverage in CODEOWNERS | G5                  | TG-10 support       |
| Mandatory correction-ledger workflow                               | G5                  | TG-10 support       |
| Evidence-based close/reopen rules                                  | G5                  | TG-10 support       |

---

## 6) P0-06 acceptance checklist

P0-06 is complete when:

1. CODEOWNERS explicitly covers POLLUX\_\*.md and repo-compartment-analysis
   docs.
2. Correction ledger workflow is documented and active.
3. Review ownership map is published.
4. Plan row and persistent completion notes are updated.

---

## 7) Implementation record

Files changed by this task:

1. .github/CODEOWNERS
2. POLLUX_DOC_CORRECTIONS.md
3. docs/core/pollux/P0-06_GOVERNANCE_CONTROLS_CODEOWNERS_LEDGER.md
4. docs/repo-compartment-analysis/P0-06_GOVERNANCE_CONTROLS_CODEOWNERS_LEDGER.md
5. IMPLEMENTATION_PLAN.md

---

## 8) References

1. IMPLEMENTATION_PLAN.md (G5 done criteria, P0-06 row, TG-10).
2. POLLUX_SPEC.md section 14 (documentation and governance contract).
3. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md
   (VT-16.4, R-16.3, governance coverage gaps).
4. docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci/report.md
   (governance linkage in release/CI context).
5. POLLUX_DOC_CORRECTIONS.md (correction-ledger source of truth).
