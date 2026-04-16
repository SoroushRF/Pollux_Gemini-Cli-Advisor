# Evidence Matrix Template

The Markdown evidence matrix is a human-readable mirror of the `evidence` array
in the JSON sidecar. Keep them in sync.

## How to use

1. For every major claim in your report, add one row.
2. "Primary" must be a runtime code file.
3. "Supporting" should ideally be a test. If no test exists, cite config or doc
   and mark confidence accordingly.
4. Use `path:startLine-endLine` format.
5. If you cannot cite a primary runtime file, the claim is not a verified truth
   — move it to "Open questions".

## Confidence scale

- `high` — code + test both cited, behavior mechanically enforced.
- `medium` — code cited, no direct test, clearly implemented.
- `low` — indirect evidence, inferred, or single-source only.

## Template

| #   | Claim                     | Primary                            | Supporting                    | Kind  | Confidence | Notes                 |
| --- | ------------------------- | ---------------------------------- | ----------------------------- | ----- | ---------- | --------------------- |
| 1   | <short statement of fact> | `packages/.../x.ts:12-40`          | `packages/.../x.test.ts:5-30` | test  | high       |                       |
| 2   | <another>                 | `packages/.../y.ts:100-140`        | `docs/.../spec.md`            | doc   | low        | spec-only, not tested |
| 3   | <absence claim>           | `rg -n "foo" packages` → 0 matches | —                             | other | high       | negative-claim        |

## Rules

- Do not merge claims. One row per atomic fact.
- Do not cite yourself ("see section 2 above") as a source.
- If a path is stale, mark status in the JSON sidecar and leave the row so drift
  is visible.
