# Compartment Report: 16 — Docs, Specs, and Governance

## Metadata

- **Compartment**: 16 — Docs, Specs, and Governance
- **Tier**: T3
- **Guideline file**: `16-docs-specs-and-governance.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: c8127045c5832b0e66cb1efd04e0dd6800ce78e7
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                  | Exists? | Notes (only if material)                                             |
| ------------------------------------- | ------- | -------------------------------------------------------------------- |
| `README.md`                           | yes     |                                                                      |
| `CONTRIBUTING.md`                     | yes     |                                                                      |
| `SECURITY.md`                         | yes     |                                                                      |
| `ROADMAP.md`                          | yes     | present (guideline implied uncertainty)                              |
| `POLLUX_SPEC.md`                      | yes     |                                                                      |
| `IMPLEMENTATION_PLAN.md`              | yes     |                                                                      |
| `POLLUX_FULL_FORENSIC_CONTEXT.md`     | yes     |                                                                      |
| `GEMINI.md`                           | yes     |                                                                      |
| `AGENTS.md`                           | no      | not present at repo root                                             |
| `.github/CODEOWNERS`                  | yes     |                                                                      |
| `.github/ISSUE_TEMPLATE/`             | yes     | bug_report.yml, feature_request.yml, website_issue.yml               |
| `.github/pull_request_template.md`    | yes     |                                                                      |
| `.github/workflows/`                  | yes     | 44 workflow files; docs-audit, docs-rebuild, docs-page-action, links |
| `scripts/generate-settings-doc.ts`    | yes     |                                                                      |
| `scripts/generate-settings-schema.ts` | yes     |                                                                      |
| `scripts/generate-keybindings-doc.ts` | yes     |                                                                      |
| `docs/repo-compartment-analysis/`     | yes     | this analysis lives here                                             |
| `docs/assets/gemini-screenshot.png`   | no      | referenced from README.md:9 — fork drift                             |

## 1. Scope and Boundary

This compartment classifies the repository's intent layer (user docs,
contributor docs, security, roadmap, specs, governance metadata) and audits how
well it tracks the implementation. The Pollux-relevant deliverable is a
doc-alignment plan: which spec passages are stale per the forensic report, where
the truths live in code, and how to keep them aligned through generated-doc
scripts and governance workflows.

Explicitly handed off: runtime claim verification (compartments 01–13 produce
the truths cited here), test-evidence interpretation (compartment 14), and
release-process detail (compartment 15). This compartment is read-only against
`packages/**`.

## 2. Runtime Flow Summary

### Doc surfaces by audience

1. End users / install: `README.md:1-15` (positioning, install, external docs
   link).
2. Contributors: `CONTRIBUTING.md:1-14` (CLA, dev workflow);
   `docs/CONTRIBUTING.md:1-1` defers to root.
3. Security reporters: `SECURITY.md:1-9` (g.co/vulnz intake).
4. Roadmap readers: `ROADMAP.md:1-28` (principles + GitHub-managed roadmap
   pointer).
5. Pollux design + plan: `POLLUX_SPEC.md:1-44`, `IMPLEMENTATION_PLAN.md:1-48`.
6. Forensic ledger: `POLLUX_FULL_FORENSIC_CONTEXT.md:1-98`.
7. Agent / IDE onboarding: `GEMINI.md:1-30`.
8. Compartment analysis governance:
   `docs/repo-compartment-analysis/{README.md,INDEX.md,POLLUX_PRIORITY.md}`.
9. Published user docs tree: `docs/index.md:1-26`.

### Governance metadata

1. CODEOWNERS routes: default `*` → maintainers; `docs/`+`README.md` →
   maintainers + `gemini-cli-docs`; askmode-approved set covers
   `package.json`/lockfiles/`SECURITY.md`/workflows: `.github/CODEOWNERS:1-23`.
2. Issue templates: `bug_report.yml:1-40`, `feature_request.yml:1-22`,
   `website_issue.yml:1-21`.
3. PR template: `pull_request_template.md:1-41` (summary, validation, platform
   checklist).
4. Docs-adjacent workflows: `docs-audit.yml:1-31`, `docs-rebuild.yml:1-18`,
   `docs-page-action.yml:1-22`, `links.yml:1-26`.

### Generated docs

1. `scripts/generate-settings-doc.ts:50-105` writes
   `docs/reference/configuration.md` and `docs/cli/settings.md` (with autogen
   markers) and triggers schema regen at `:41-44`.
2. `scripts/generate-settings-schema.ts:26-99` writes
   `schemas/settings.schema.json`.
3. `scripts/generate-keybindings-doc.ts:25-78` writes
   `docs/reference/keyboard-shortcuts.md`.

### F-ID forensic ledger location

1. F-01..F-10 are anchored in `POLLUX_FULL_FORENSIC_CONTEXT.md` at lines 158-178
   (F-01) through 313-326 (F-10); each F-ID cites a corresponding spec/plan line
   range.

## 3. Key Files and Citations

| Path                                      | Role                          | Notes                                          |
| ----------------------------------------- | ----------------------------- | ---------------------------------------------- |
| `POLLUX_SPEC.md`                          | design intent                 | Multiple passages flagged stale by forensic    |
| `IMPLEMENTATION_PLAN.md`                  | revised execution plan        | References forensic audit                      |
| `POLLUX_FULL_FORENSIC_CONTEXT.md`         | findings ledger F-01–F-10     | Source of truth for spec drift                 |
| `.github/CODEOWNERS`                      | review routing                | Default + docs + askmode + prompts/tools paths |
| `.github/workflows/docs-audit.yml`        | scheduled docs audit          | Gemini-driven PR creation                      |
| `.github/workflows/docs-rebuild.yml`      | external docs rebuild trigger | Fires on `docs/**` push                        |
| `scripts/generate-settings-doc.ts`        | settings doc generator        | Writes two doc files + schema                  |
| `docs/repo-compartment-analysis/INDEX.md` | compartment status tracker    | Source of truth for analysis claims            |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-16.1** — The forensic report ledger F-01..F-10 is fully enumerated in
  `POLLUX_FULL_FORENSIC_CONTEXT.md` and each finding cites specific spec/plan
  lines, making it the canonical drift register.
  - Primary: `POLLUX_FULL_FORENSIC_CONTEXT.md:158-326`
  - Confidence: high
- **VT-16.2** — `POLLUX_PRIORITY.md` directly maps the high-severity F-IDs to
  compartments: F-04→02, F-01→07, F-02→06, F-03→01, F-08→04, F-09→08, F-10→11,
  F-07→14.
  - Primary: `docs/repo-compartment-analysis/POLLUX_PRIORITY.md:96-194`
  - Confidence: high
- **VT-16.3** — Three generated-docs scripts cover the user-facing settings and
  keyboard-shortcuts docs; both write into `docs/` with autogen markers, so
  manual edits will be overwritten.
  - Primary: `scripts/generate-settings-doc.ts:50-105`
  - Supporting: `scripts/generate-keybindings-doc.ts:25-78` (keybindings)
  - Confidence: high
- **VT-16.4** — CODEOWNERS routes `/docs/` and `/README.md` to a docs-specialist
  team in addition to maintainers; spec/forensic/POLLUX\__.md fall under the
  default `_` rule (general maintainers only).
  - Primary: `.github/CODEOWNERS:1-23`
  - Confidence: high
- **VT-16.5** — Docs governance is automated: `docs-audit.yml` runs a scheduled
  Gemini-driven audit that opens PRs, `docs-rebuild.yml` triggers external
  rebuilds on `docs/**` push, and `links.yml` runs link-check on
  PR/push/schedule.
  - Primary: `.github/workflows/docs-audit.yml:1-31`
  - Supporting: `.github/workflows/docs-rebuild.yml:1-18` (rebuild)
  - Confidence: high
- **VT-16.6** — The compartment-analysis tree
  (`docs/repo-compartment-analysis/`) is the doc-code alignment artifact for
  Pollux; `INDEX.md` is the live status truth and `POLLUX_PRIORITY.md` is the
  depth contract.
  - Primary: `docs/repo-compartment-analysis/INDEX.md:1-87`
  - Supporting: `docs/repo-compartment-analysis/POLLUX_PRIORITY.md:38-79` (depth
    contract)
  - Confidence: high

**Contradictions or ambiguities**

- **C-16.1** — `README.md:9` references `/docs/assets/gemini-screenshot.png` but
  no `docs/assets/**` files exist in this fork. Evidence: `README.md:9` and
  pre-flight result above. Resolution: unresolved — minor doc drift, fix or
  relocate asset.
- **C-16.2** — `POLLUX_SPEC.md:17-19` cites an external "Advisor Strategy" dated
  2026-04-09 but the spec is otherwise undated;
  `POLLUX_FULL_FORENSIC_CONTEXT.md:5-8` audit date is 2026-04-13. Evidence:
  those two ranges. Resolution: deferred — spec needs an explicit version/date
  header.
- **C-16.3** — Forensic findings F-05 (scaffold-only) and F-06 (structured
  confidence tagging) are not directly named in `POLLUX_PRIORITY.md` even though
  they are medium-severity. Evidence: `POLLUX_FULL_FORENSIC_CONTEXT.md:239-266`
  vs `POLLUX_PRIORITY.md:96-194`. Resolution: deferred — synthesis should fold
  them in or document why they were excluded.

## 5. Risks and Open Questions

**Risks**

- **R-16.1** — Spec passages flagged by F-01..F-10 will silently desynchronize
  from code as Pollux is implemented; without per-PR doc-update guards, the
  forensic ledger will grow rather than shrink. Severity: high. Mitigating test:
  `.github/workflows/docs-audit.yml:1-31`. Suggested guard: synthesis must
  produce a "doc PRs to land alongside Pollux" list keyed by F-ID.
- **R-16.2** — The settings/keybindings/schema docs are autogenerated and
  overwritten on regeneration; any Pollux settings doc additions must be sourced
  from the schema, not edited into the doc directly. Severity: medium.
  Mitigating test: `scripts/generate-settings-doc.ts` (no test cited). Suggested
  guard: add Pollux settings to the schema source rather than the rendered doc.
- **R-16.3** — `CODEOWNERS` does not mention `POLLUX_*.md`; under default `*`
  rule these get general maintainer review, which may miss spec-vs-code drift.
  Severity: medium. Mitigating test: `no test`. Suggested guard: add explicit
  ownership for `POLLUX_*.md` and `docs/repo-compartment-analysis/`.
- **R-16.4** — `extensions-reload.test.ts` and several Pollux scaffolding
  artifacts described in spec do not yet exist (per F-05); treating spec as
  status will mislead implementers. Severity: medium. Mitigating test: `no test`
  (this report and forensic). Suggested guard: prefix every spec section with an
  "implemented? yes/no/partial" tag.

**Open questions**

- [ ] **OQ-16.1** — Should `POLLUX_SPEC.md` and `IMPLEMENTATION_PLAN.md` get a
      versioning header (semantic version + date + repo SHA)? Escalate to
      compartment 15 (release).
- [ ] **OQ-16.2** — Where do F-05 (scaffold-only) and F-06 (confidence tagging)
      belong in the priority table? Escalate to synthesis.

## 6. Test and Observability Coverage

- **Tests**:
  - `.github/workflows/links.yml`: link-check on PR/push/schedule — surfaces
    broken doc links (would catch C-16.1).
  - `.github/workflows/docs-audit.yml`: scheduled Gemini-driven docs PRs —
    partial drift mitigation.
  - `scripts/generate-settings-doc.ts` and `scripts/generate-keybindings-doc.ts`
    accept a check-only mode for CI drift detection (writes only when content
    changes).
- **Observability signals**: docs-audit PRs (governance signal); docs-rebuild
  workflow runs on `docs/**` push; `INDEX.md` row state changes per compartment.
- **Coverage gaps**:
  - No automated assertion that F-01..F-10 spec line ranges still exist verbatim
    (R-16.1).
  - No CODEOWNERS coverage for `POLLUX_*.md` (R-16.3).
  - No version header on spec/plan (C-16.2, OQ-16.1).
  - Asset reference broken in README (C-16.1).

## 7. Definition of Done

- [x] Docs and governance surfaces are classified.
- [x] Major spec claims are validated against code (via F-ID anchors and
      compartment 01–04, 06, 07, 08, 11, 14 reports).
- [x] Ownership and review routing are explicit.
- [x] Drift risks are prioritized (R-16.1 high; R-16.2/R-16.3/R-16.4 medium).
- [x] Alignment procedure is documented and actionable (synthesis must emit
      per-F-ID doc PRs).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Sidecar populated at `reports/16-docs-specs-and-governance/report.json`.
- [x] `INDEX.md` row 16 flipped to `done`.

## 8. Handoffs

- **Depends on**: 1, 2, 4, 6, 7, 8, 11, 14
- **Affects**: synthesis (capstone)
- **Escalated to**: 15 — spec/plan versioning header (OQ-16.1); synthesis —
  F-05/F-06 placement (OQ-16.2).
