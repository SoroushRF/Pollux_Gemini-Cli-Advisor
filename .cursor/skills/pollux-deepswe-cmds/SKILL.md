---
name: pollux-deepswe-cmds
description: >-
  Generates safe PowerShell DeepSWE benchmark commands for Pollux
  (scripts/pollux-deepswe-runner.mjs) with flag-by-flag explanations, the
  safety ladder, and parallel multi-terminal campaign packs. Use when the user
  asks for DeepSWE commands, preflight, fill-matrix / next fill batch, launch
  batch, parallel / multi-terminal / side-by-side runs, Fresh5 / Remaining5,
  conditions A / E / FD, scratch-root, run-id, Vertex auth, or Windows
  --allow-non-wsl recipes. DeepSWE only — not SWE-bench or corpus.
---

# Pollux DeepSWE Command Skill

Teach operators how to run Pollux DeepSWE safely. Emit PowerShell-ready commands
plus a flag table. Do not invent flags. Do not launch paid runs yourself.

Read [reference.md](reference.md) for the flag encyclopedia, safety ladder,
parallel campaigns, and task/matrix rules. Read [examples.md](examples.md) for
copy-paste recipes (including full parallel packs).

## Command shape (mandatory)

Always generate:

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode ... `
  ...
```

Run from the Pollux repo root. Do **not** wrap with `npm.cmd run benchmark:…`
unless the user explicitly asks for npm wrappers.

## Windows defaults (every recipe unless user overrides)

| Flag / env | Value |
|------------|--------|
| `--allow-non-wsl` | always on Windows |
| `--entrypoint` | `bundle` |
| `--scratch-root` | under `C:\tmp\...` (never OneDrive, never the repo) |
| `--run-id` | unique per terminal / batch |
| Auth | Vertex only; `GOOGLE_CLOUD_LOCATION=global`; no OAuth |

Also set or confirm `.env`: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`,
`GOOGLE_GENAI_USE_VERTEXAI=true`, plus ADC.

## Named task sets

**All 10 (primary):**

```
wazero-multi-module-snapshots
ts-pattern-match-each
true-myth-iterable-collection-combinators
testem-per-launcher-reports
opa-rego-rule-profiling
ofetch-per-origin-circuit-breaker
psd-tools-blend-range-api
ipython-session-bundle-replay
ytt-jsonpath-query-api
kombu-single-active-consumer-priority
```

- **Fresh5** = first five
- **Remaining5** = last five

Pass as comma-separated `--task-ids`.

## Static matrix fill (ignore disk)

Target: **10 × A/E/FD × 4 = 120** (floor n=3 → 90). Invalids do **not** count.

Credit policy until further audit: **only Fresh5 FD** already credited (n=2 each).

Fill order:

1. **FD** — Fresh5 `+2` (to n=4), then Remaining5 `×4`
2. **A** — all 10 × 4
3. **E** — all 10 × 4

When asked “next fill for FD”, recommend that static order. Do not scan
`artifacts/` for progress.

## Algorithm

1. **Parse intent** → `mode` (`preflight` | `run` | …), `conditions` (`A`/`E`/`FD`),
   `taskSet` (Fresh5 / Remaining5 / all10 / explicit IDs), `repeats`, `runId`,
   `scratchRoot`, and whether this is a **parallel / multi-terminal** request.
   Detect N from language: “5 terminals”, “parallel”, “side by side”,
   “b01-b05”, “split across N”, “N batches”. Default/clamp N to **4–5**.
2. **Resolve task IDs** from named sets or the user’s explicit list.
3. **IF parallel / multi-terminal request** → branch to **parallel campaign
   pack** (below). Do **not** emit a single mega `--task-ids` command unless
   the user explicitly asks for sequential / one-terminal.
4. **ELSE (sequential)** → Safety ladder from [reference.md](reference.md)
   before any paid `mode=run`. Soft gate still prints the paid command.
5. **Emit PowerShell** with backtick line continuations.
6. **Emit a table** explaining **every** flag present in that command (once for
   identical flag sets; note per-terminal diffs for `task-ids` / `run-id` /
   `scratch-root`).
7. **Emit warnings**: cold Docker / Resource Saver; disk & OneDrive; no OAuth;
   location must be `global`; max ~**4–5** parallel agent terminals (not 10
   fully hot); unique `--scratch-root` + `--run-id` per terminal.

### Parallel campaign pack branch

When the user asks for parallel / multi-terminal / N batches / side-by-side:

1. **Parse** conditions, task set, repeats, desired terminal count **N**.
   - Default N = min(task count, 5) when unspecified.
   - Clamp recommended N to **4–5**.
   - If N > 5: **refuse or strongly redirect** to ≤5 + pipeline advice
     (run wave 1, then wave 2). Never recommend 10 fully hot paid terminals.
2. **Partition** so terminals do **not** duplicate the same
   `(task × condition × repeat)` work.
   - **Prefer partition-by-task**: slice `--task-ids` across terminals
     (one task per terminal when N equals task count).
   - Alternatives: by condition only when launching **different** conditions
     in parallel; by repeats rarely (usually worse for matrix fill).
3. **Anti-pattern check**: if the user asks for the **same** `--task-ids` +
   same `--conditions` + same `--repeats` on multiple terminals → warn loudly
   and emit a **corrected** partitioned pack instead.
4. **Emit the full pack**:
   - Summary: N terminals, total paid samples
     (`tasks × conditions × repeats`), partition strategy.
   - For **each** terminal `i=1..N`: complete paste-ready PowerShell with
     unique `--run-id` (e.g. `…-b0N`) and unique `--scratch-root`
     (`C:\tmp\pollux-deepswe-b0N`).
   - Flag table once (or per distinct flag set).
   - Parallel ops checklist (see Output template).
5. Soft-gate WARNING + optional preflight companion still apply for paid packs.

## Soft paid-run gate

If the user asks for `mode=run` and has **not** confirmed preflight is green:

1. Print a prominent **WARNING** that auth + cold 1-task warmup + multi-task
   networked/baseline preflight should be green before spending Vertex.
2. Also print the matching **preflight** command (for parallel packs: cold
   1-task first, then optionally per-slice or serialized multi-task preflight).
3. **Still print** the paid `mode=run` command(s) (do not withhold them).

If the user says preflight is done / “print paid anyway”, skip the warning tone
but keep the usual ops warnings (Docker, scratch, parallelism).

## Do nots

- Do not require WSL (Windows + `--allow-non-wsl` is supported).
- Do not suggest 10 parallel full paid samples on this machine.
- Do not omit `--allow-non-wsl` on Windows.
- Do not use OneDrive or repo paths for `--scratch-root` (prefer `C:\tmp\...`).
- Do not invent flags; only document flags from the live runner parser.
- Do not emit SWE-bench or corpus runner recipes.
- Do not start paid runs automatically; only print commands.
- Do not add `scripts/pollux-deepswe-cmd.mjs` or change runner behavior.
- Do not emit duplicate `(task × condition × repeats)` across concurrent
  terminals when the user asked to parallelize matrix work.
- Do not share one `--scratch-root` across live concurrent terminals.

## Output template

### Sequential (single terminal)

1. One-line intent summary (`mode`, conditions, tasks, repeats).
2. Soft-gate WARNING block when applicable.
3. PowerShell command block(s).
4. Flag explanation table (one row per flag in the command).
5. Short warnings list.

### Parallel campaign pack (multi-terminal)

1. One-line intent + pack summary: N terminals, total paid samples, partition
   strategy (usually by-task).
2. Soft-gate WARNING + parallel safety ladder reminder when applicable.
3. **For each terminal 1..N**: labeled full PowerShell command (unique
   `--run-id`, unique `--scratch-root`, disjoint `--task-ids`).
4. Flag explanation table once (call out per-terminal diffs).
5. **Parallel ops checklist**:
   - Docker healthy; Resource Saver off
   - Unique scratch + run-id per terminal (never shared live)
   - Disjoint task slices (no duplicate matrix cells)
   - Cap ≤5 hot paid terminals; pipeline extras
   - Runner concurrency = 1 per process → N terminals = N concurrent samples
   - Stagger or serialize heavy networked preflights after one cold warmup
   - Optional: reuse an **already-warmed** scratch only for that same
     terminal’s task slice after the warmer finished (not across live peers)
