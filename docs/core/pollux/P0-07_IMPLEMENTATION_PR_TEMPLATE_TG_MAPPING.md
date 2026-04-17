# P0-07 Implementation PR Template Keyed to Test Gates

Version: 1.0 Date: 2026-04-17 Status: Draft for Phase 0 task closure Purpose:
Phase 0 deliverable for P0-07 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This document records the P0-07 governance control that adds Pollux test-gate
mapping into the repository PR template.

It covers:

1. The landed PR template changes.
2. TG-1 through TG-10 mapping expectations for Pollux-touching PRs.
3. Reviewer and author usage rules for evidence-based gate tracking.

---

## 2) Landed PR template control

Template updated:

1. .github/pull_request_template.md

New required section:

1. Pollux TG Mapping (required for Pollux-touching PRs).

The section includes a gate matrix for TG-1 through TG-10 with required fields:

1. Status (Pass / N/A).
2. Evidence links (tests, logs, artifacts, PR references).

A pre-merge checklist item now requires the TG mapping section to be completed
or explicitly marked N/A.

---

## 3) TG mapping contract

For Pollux-touching PRs, authors must provide gate evidence for in-scope TGs.

| Gate  | Author requirement in PR template                          | Reviewer check                                       |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------- |
| TG-1  | Fairness harness evidence attached                         | Verify evidence is tied to benchmark/fairness checks |
| TG-2  | Cross-surface parity evidence attached                     | Verify legacy, agent-session, ACP coverage           |
| TG-3  | Advisor policy path evidence attached                      | Verify no double-prompt behavior                     |
| TG-4  | Token accounting evidence attached                         | Verify role/total consistency                        |
| TG-5  | Schema-config invariant evidence attached                  | Verify settings mapping checks                       |
| TG-6  | Pollux integration test evidence attached                  | Verify test suite status                             |
| TG-7  | /pollux command reachability evidence attached             | Verify command surface coverage                      |
| TG-8  | ACP advisor regression evidence attached                   | Verify ACP behavior remains correct                  |
| TG-9  | Binary smoke evidence attached for Pollux-touching changes | Verify build smoke pass                              |
| TG-10 | Doc/spec drift evidence attached                           | Verify docs/spec alignment updates                   |

Rule:

1. Any in-scope TG left blank blocks PR readiness.
2. A gate may be marked N/A only with a short justification in the template.

---

## 4) Usage workflow

1. Author fills Pollux TG mapping table in the PR template.
2. Author links concrete evidence for each in-scope TG.
3. Reviewer validates evidence quality and gate applicability.
4. PR is merge-ready only when in-scope gates are Pass and non-scope gates are
   justified as N/A.

---

## 5) P0-07 acceptance checklist

P0-07 is complete when:

1. Repository PR template includes Pollux TG-1..TG-10 mapping section.
2. Template has explicit evidence field for each gate.
3. Pre-merge checklist enforces completion or N/A declaration.
4. Plan task row and persistent completion notes are updated.

---

## 6) Implementation record

Files changed by this task:

1. .github/pull_request_template.md
2. docs/core/pollux/P0-07_IMPLEMENTATION_PR_TEMPLATE_TG_MAPPING.md
3. docs/repo-compartment-analysis/P0-07_IMPLEMENTATION_PR_TEMPLATE_TG_MAPPING.md
4. IMPLEMENTATION_PLAN.md

---

## 7) References

1. IMPLEMENTATION_PLAN.md (P0-07 task and TG-1..TG-10 gate definitions).
2. POLLUX_SPEC.md section 14 (documentation and governance contract).
3. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md
   (governance metadata and review routing context).
4. .github/pull_request_template.md (landed template control).
