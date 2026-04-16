# Compartment Report: NN — <Compartment Title>

> **Tier 1 only.** For Tier 2/3/4 use `_TEMPLATES/report-template-lite.md`.
>
> Copy this file to `docs/repo-compartment-analysis/reports/NN-<slug>/report.md`
> and fill in. Do not delete sections. If a section does not apply, write "N/A"
> with a one-sentence justification.
>
> Companion JSON sidecar required at
> `docs/repo-compartment-analysis/reports/NN-<slug>/report.json` using the
> schema in `_TEMPLATES/report-sidecar-schema.json`.
>
> Size ceiling: 400–900 md lines, 5–15 strategic code quotes. See
> `AGENT_RUNBOOK.md` §2.

## Metadata

- **Compartment**: NN — <title>
- **Guideline file**: `NN-<slug>.md`
- **Owner**: <agent-id or human-name>
- **Started**: <ISO date>
- **Finished**: <ISO date>
- **Repo commit analyzed**: <git sha>
- **Upstream base commit**: <git sha of last merge from upstream, if known>

## 0. Pre-flight

Path validation results from `AGENT_RUNBOOK.md` Step B.

| Path        | Exists? | Notes                        |
| ----------- | ------- | ---------------------------- |
| `path/a.ts` | yes     |                              |
| `path/b.ts` | no      | upstream renamed in merge #X |

Missing or moved paths should also appear in section 5.

## 1. Scope and Boundary

State what is in scope and out of scope for this compartment. Copy from the
guideline and adapt if reality diverged.

## 2. Runtime Flow Summary

A concise narrative of how the compartment behaves at runtime. Preferred shape:
ordered steps, each with a citation.

Example:

1. Entry: `<path>:<lines>` accepts request.
2. Dispatch: `<path>:<lines>` selects branch.
3. ...

## 3. Key Files and Citations

List of the most important files in this compartment with one-line descriptions.
Use inline citation format from `CITATION_STANDARD.md`.

| Path                     | Role               | Notes |
| ------------------------ | ------------------ | ----- |
| `packages/.../x.ts`      | primary entrypoint |       |
| `packages/.../y.test.ts` | behavioral test    |       |

## 4. Verified Truths

Each truth must include a citation. Use the block code reference format for
anything quoted.

- **Truth**: <one-sentence claim>
  - Primary: `path:lines`
  - Supporting: `path:lines` (test | config | doc)
  - Confidence: high | medium | low
  - Quote (optional):
    ```<start>:<end>:<path>
    // code
    ```

Repeat for each verified truth. Minimum 5 truths for a real compartment.

## 5. Contradictions or Ambiguities

List anything where code, tests, and docs disagree. Include missing paths, stale
references, and conflicting behavior.

- **Item**: <description>
  - Evidence A: `path:lines`
  - Evidence B: `path:lines`
  - Resolution proposal or `unresolved`.

## 6. Risks and Regression Hotspots

Places where future edits are most likely to cause regressions.

- **Risk**: <description>
  - Why fragile: <reason>
  - Mitigating test: `path:lines` or `none`
  - Suggested guard: <one-line idea>

## 7. Test and Observability Coverage

- **Tests covering this compartment**: list with one-line descriptions.
- **Observability signals (telemetry, logs, metrics)**: list or "none".
- **Coverage gaps**: behavior without direct test.

## 8. Open Questions

Things you could not resolve with the time/evidence available. These feed back
into the synthesis report.

- [ ] Question one
- [ ] Question two

## 9. Definition of Done

Copy the checklist from the guideline file's "Definition of Done" section and
tick each box when satisfied.

- [ ] All guideline DoD items satisfied
- [ ] Evidence matrix populated in sidecar JSON
- [ ] `INDEX.md` updated to `done`

## 10. Evidence Matrix (summary)

A human-readable summary of the evidence matrix. The authoritative form lives in
the JSON sidecar.

| Claim | Primary | Supporting | Confidence |
| ----- | ------- | ---------- | ---------- |
| ...   | `p:l`   | `p:l`      | high       |

## 11. Handoffs

Explicit handoffs to other compartments, mirroring the guideline file.

- **Depends on**: compartments NN, MM
- **Affects**: compartments XX
- **Escalated questions sent to**: compartment YY (via `INDEX.md` Notes)
