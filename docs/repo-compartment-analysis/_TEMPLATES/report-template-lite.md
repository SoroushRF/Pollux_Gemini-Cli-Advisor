# Compartment Report (Lite): NN — <Compartment Title>

> Copy this file to `docs/repo-compartment-analysis/reports/NN-<slug>/report.md`
> and fill in.
>
> **Use this template for Tier 2, Tier 3, and Tier 4 compartments only.** Tier 1
> compartments use the full `report-template.md` and target 400–900 lines.
>
> Target sizes for this template:
>
> | Tier | Markdown | Sidecar JSON | Verified truths | Verbatim code quotes |
> | ---- | -------- | ------------ | --------------- | -------------------- |
> | T2   | 250–400  | 150–250      | 6–10            | 0–2                  |
> | T3   | 200–300  | 100–180      | 4–6             | 0                    |
> | T4   | 150–250  | 80–150       | 3–5             | 0                    |
>
> A JSON sidecar is still required at `reports/NN-<slug>/report.json` — the
> synthesis capstone consumes it programmatically. Keep sidecar entries minimal:
> no re-quoted code, no duplicated narrative, `notes` only when essential.
>
> Delete this blockquote before saving.

## Metadata

- **Compartment**: NN — <title>
- **Tier**: T2 | T3 | T4
- **Guideline file**: `NN-<slug>.md`
- **Owner**: <agent-id or human-name>
- **Started**: <ISO date>
- **Finished**: <ISO date>
- **Repo commit analyzed**: <git sha>
- **Upstream base commit**: <git sha of last merge, or null>

## 0. Pre-flight

| Path        | Exists? | Notes (only if material)     |
| ----------- | ------- | ---------------------------- |
| `path/a.ts` | yes     |                              |
| `path/b.ts` | no      | renamed upstream in merge #X |

One line per path. No line counts or unrelated commentary. Missing paths
propagate to Section 4.

## 1. Scope and Boundary

Two short paragraphs maximum:

- what is in scope (copied from the guideline, trimmed),
- what is explicitly handed off to other compartments.

No embedded sub-sections. No "reality note" paragraphs unless the guideline was
wrong — in which case record it in Section 4 instead.

## 2. Runtime Flow Summary

One ordered list, 6–15 steps. Every step is one line. Every step cites at least
one `path:lines`. Do not embed code quotes here. Do not narrate rationale — this
section is "what happens, in order", not "why".

Example shape:

1. Entry: `packages/.../x.ts:10-22` receives `<input>`.
2. Dispatch: `packages/.../x.ts:45-60` branches on `<condition>`.
3. ...

If the flow has more than one independent branch (e.g., interactive vs
non-interactive), use two ordered lists under short `###` subheadings. Still no
narrative prose.

## 3. Key Files and Citations

Table, **5–10 rows**. Primary runtime files and the single most important
supporting file per behavior. Test files belong in Section 6, not here.

| Path                | Role               | Notes (optional, 1 line) |
| ------------------- | ------------------ | ------------------------ |
| `packages/.../x.ts` | primary entrypoint |                          |
| `packages/.../y.ts` | state owner        |                          |

## 4. Verified Truths and Contradictions

Use tier-appropriate count (T2 = 6–10 truths, T3 = 4–6, T4 = 3–5). Every truth
has exactly:

- one-sentence claim,
- primary citation (`path:lines`),
- optional supporting citation (prefer a test),
- confidence tag.

Format as bullets, not sub-headings. Quote code at most twice per report (T2
only); never for T3/T4.

**Verified truths**

- **VT-NN.1** — <one-sentence claim>.
  - Primary: `path:lines`
  - Supporting: `path:lines` (test | config | doc) — optional
  - Confidence: high | medium | low
- **VT-NN.2** — ...

**Contradictions or ambiguities** (inline in the same section — not a separate
section). Keep each to two lines; if an item requires more, it probably belongs
as its own Verified Truth with resolution state `deferred`.

- **C-NN.1** — <description>. Evidence: `path:lines`, `path:lines`. Resolution:
  resolved | unresolved | deferred.
- **C-NN.2** — ...

Missing paths from Pre-flight also appear here as contradictions.

## 5. Risks and Open Questions

Single combined section. Bullets, not tables. Each item: one-line description,
severity tag, and either a mitigating-test citation or `no test`.

**Risks**

- **R-NN.1** — <description>. Severity: low | medium | high. Mitigating test:
  `path:lines` or `no test`. Suggested guard: <one line>.
- **R-NN.2** — ...

**Open questions**

- [ ] **OQ-NN.1** — <question>. Escalate to compartment MM.
- [ ] **OQ-NN.2** — ...

## 6. Test and Observability Coverage

Three tight bullet groups. No tables.

- **Tests**: bullet list of test files with a 5-to-15-word purpose note.
- **Observability signals**: bullet list (event names + one-line purpose).
- **Coverage gaps**: bullet list, one line each, already referenced by an R-NN.x
  or OQ-NN.x from Section 5.

## 7. Definition of Done

Copy the checklist from the guideline's "Definition of Done". Tick each box; do
not restate guideline text.

- [ ] ...
- [ ] ...
- [ ] Pre-flight recorded in Section 0.
- [ ] Sidecar populated at `reports/NN-<slug>/report.json`.
- [ ] `INDEX.md` row flipped to `done`.

## 8. Handoffs

Three bullet lists only — no prose.

- **Depends on**: NN, MM
- **Affects**: XX
- **Escalated to** (via `INDEX.md` Notes): YY — reason in ≤ 10 words.

---

## Anti-patterns (delete before saving)

Do **not**:

- add a Section "10. Evidence Matrix" — it duplicates Section 4. Put the
  structured form in the JSON sidecar only.
- embed verbatim code quotes > 5 lines (T2) or any quotes at all (T3, T4).
- add appendices, recipes, or extension guidance — link to the guideline
  instead.
- pad the table of Key Files with every test file in the compartment.
- narrate "reality notes" unless the guideline is wrong; if it is wrong, record
  it as a contradiction.
- repeat citations across sections — cite each `path:lines` once in the section
  where it is most load-bearing; refer by claim id elsewhere.

If the report still exceeds the tier target after following this template, the
compartment probably needs to be split, not the report expanded.
