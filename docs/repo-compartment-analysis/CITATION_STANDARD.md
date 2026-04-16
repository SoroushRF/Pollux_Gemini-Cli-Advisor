# Citation Standard

Every major claim in a compartment report must be cited. This file defines the
exact citation formats to use. No other formats are allowed.

## Why this matters

Citations are the primary defense against:

- hallucinated behavior ("the CLI does X" with no code to back it),
- drift ("it used to do X" when upstream changed last month),
- ambiguity ("somewhere in core").

Every claim must be traceable to a file path and, where possible, a line range.

## Three citation formats

### Format 1 — Inline path citation

Use in running prose when you reference a file without quoting code.

```
The turn entrypoint is in `packages/core/src/core/client.ts`.
```

Shape: backtick-wrapped relative path from repo root. No line numbers when the
whole file is the point; otherwise append `:startLine-endLine`:

```
See `packages/core/src/core/turn.ts:142-180` for event emission.
```

### Format 2 — Block code reference (for quoting existing code)

Use when you need to quote lines to support a claim. Line numbers are mandatory.
No language tag.

```12:14:packages/core/src/pollux/index.ts
export const POLLUX_VERSION = '0.0.1';
export * from './benchmark/index.js';
```

Rules:

- `startLine:endLine:filepath` — all three required.
- Path is relative to repo root.
- Quote only the lines that directly support the claim. Trim; do not paste whole
  files.
- Never add a language tag (no `typescript`, no `ts`, etc.).
- Never indent the triple backticks.

### Format 3 — Block code sample (for proposed code, not in repo)

Only when showing hypothetical or proposed code that does not yet exist anywhere
in the repo. Use a language tag, no line numbers, no path.

```typescript
interface ProposedThing {
  id: string;
}
```

If the code exists in the repo, use Format 2 instead.

## Minimum citation density per claim type

| Claim type              | Minimum citations                                           |
| ----------------------- | ----------------------------------------------------------- |
| Runtime behavior        | 1 primary runtime file + 1 supporting (test or config)      |
| Event ordering          | 1 emitter site + 1 consumer site                            |
| Config precedence       | 1 loader site + 1 consumer site                             |
| Test coverage           | 1 test file                                                 |
| Absence ("no X exists") | Repo-wide search command + result count                     |
| Design intent only      | 1 doc/spec citation AND a label that it is intent, not code |

## Negative-claim citations

When asserting something does **not** exist:

```
No `AdvisorClient` class is defined in `packages/core/src/pollux`.
Verified by:

  rg -n "class AdvisorClient" packages/core/src/pollux

0 matches.
```

Do not assert absence without the search command and result count.

## Evidence matrix entries (JSON sidecar)

Every row of the evidence matrix in the JSON sidecar must include:

```json
{
  "claim": "Turn.run emits ContentEvent before ToolCallRequestEvent",
  "primary": {
    "path": "packages/core/src/core/turn.ts",
    "lines": "142-180"
  },
  "supporting": [
    {
      "path": "packages/core/src/core/turn.test.ts",
      "lines": "55-90",
      "kind": "test"
    }
  ],
  "confidence": "high",
  "notes": ""
}
```

`confidence`: one of `high`, `medium`, `low`.

- `high` — code + test both cited, behavior is mechanically enforced.
- `medium` — code cited, no direct test, but clearly implemented.
- `low` — indirect evidence or inferred from adjacent behavior.

## Stale path handling

If a cited path no longer exists at analysis time (e.g., after an upstream
merge):

1. Record the missing path in the report's "Contradictions or ambiguities"
   section.
2. In the JSON sidecar, keep the claim with `"primary.status": "stale_path"`.
3. Do not silently rewrite the claim — let the drift be visible.

## What NOT to cite

- Folder names alone (`packages/core/src/pollux/`) without a file.
- Docs alone for runtime behavior claims — docs are intent.
- Commit messages or PR descriptions — those are process artifacts.
- Your own reasoning ("it follows that...") — reasoning is not evidence.

## Examples

### Good

> `GeminiClient` is the turn orchestration entrypoint. Construction wires the
> routing service and loop detection into the turn pipeline.
>
> ```45:120:packages/core/src/core/client.ts
> export class GeminiClient {
>   // ... trimmed ...
> }
> ```
>
> Verified by `packages/core/src/core/client.test.ts:12-44`.

### Bad

> The client seems to orchestrate turns via some kind of pipeline, I think in
> `client.ts`. There is probably a test for it.

No path-lines anchor, hedged language, no test evidence. Reject.
