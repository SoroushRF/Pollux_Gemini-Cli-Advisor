# Pollux DeepSWE — reference

Source of truth for flags: `parseDeepSweRunnerArgs` in
`scripts/pollux-deepswe-runner-lib.mjs`. Re-read that function if flags drift.

Article evidence lane = **DeepSWE only**. Corpus is methodology history.
SWE-bench is out of scope for this skill.

---

## Safety ladder (mandatory before Vertex spend)

1. **Docker Desktop healthy**; Resource Saver **off**. After crashes, optional
   `wsl --shutdown` then restart Docker Desktop.
2. **Bundle freshness**: if `bundle_fresh_for_pollux` would warn (stale
   `bundle/gemini.js` vs Pollux sources), run `npm.cmd run bundle` before paid
   `--entrypoint bundle` runs.
3. **Auth**: repo `.env` + ADC / Vertex. Quick auth-only check (tiny model
   pings, not a full benchmark):

   ```powershell
   node scripts/pollux-vertex-auth-preflight.mjs
   ```

   Required env: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`,
   `GOOGLE_GENAI_USE_VERTEXAI=true`. Settings pin `vertex-ai`, not OAuth.

4. **Cold Docker**: one-task networked warmup + baseline preflight first (see
   [examples.md](examples.md) wazero recipe). **One** cold warmup only — do not
   fire N cold networked preflights at once on a cold Docker.
5. **Multi-task / per-slice preflight**: either
   - serialize one multi-task
     `--mode preflight --dependency-warmup --networked-verifier-preflight` for
     the full task set, **or**
   - preflight each upcoming task-slice with a **unique** scratch per slice
     (stagger starts after the cold warmup).
6. **Paid run** only after green:
   `--mode run --conditions … --repeats … --task-ids … --scratch-root … --run-id … --allow-non-wsl --entrypoint bundle`.
   For parallel packs: launch ≤N terminals with **disjoint** task-ids and
   **unique** scratch + run-id each.

Soft gate (skill policy): still print paid commands when asked, with a loud
warning if steps 3–5 are not acknowledged green.

### Parallel safety ladder (before paid multi-terminal packs)

1. Docker healthy; Resource Saver off.
2. Bundle fresh if needed.
3. Vertex auth OK.
4. **ONE** cold 1-task networked preflight first.
5. Optionally preflight each task-slice (unique scratch per slice) **or**
   serialize multi-task preflight before splitting paid terminals.
6. Then launch ≤N paid terminals with unique scratch + run-id and disjoint
   task-ids.

---

## Conditions

| ID     | Meaning                               | Models                                           |
| ------ | ------------------------------------- | ------------------------------------------------ |
| **A**  | Flash alone (baseline)                | `gemini-3-flash-preview`                         |
| **E**  | Pro alone (ceiling)                   | `gemini-3.1-pro-preview`                         |
| **FD** | Flash executor + Pro advisor (Pollux) | executor Flash, advisor `gemini-3.1-pro-preview` |

Default parser `--conditions` if omitted: `E,FD,A` — **always set explicitly**.

FD profile default: `--fd-profile strict` (also `detector`). Prefer `strict` for
matrix science.

---

## Task lists

Manifest: `evaluation_results/deepswe-top20-gemini-3.1-pro.json` (10 primary).

| Set        | Task IDs                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh5     | `wazero-multi-module-snapshots`, `ts-pattern-match-each`, `true-myth-iterable-collection-combinators`, `testem-per-launcher-reports`, `opa-rego-rule-profiling`      |
| Remaining5 | `ofetch-per-origin-circuit-breaker`, `psd-tools-blend-range-api`, `ipython-session-bundle-replay`, `ytt-jsonpath-query-api`, `kombu-single-active-consumer-priority` |

### Matrix & credit

- Target: **10 × A/E/FD × 4 = 120**; cheaper floor **×3 = 90**.
- Invalid / incomplete samples do **not** count toward n=3/4.
- Credited today: **Fresh5 FD only** at n=2 per task (10 valid; 4 resolved).
  Fresh5 FD still needs **+2** each to reach n=4.
- A and E: treat as empty for matrix credit until further audit.
- Fill order: **finish FD → then A → then E**.
- Parallelism on this operator machine: ~**4–5** agent terminals max; unique
  `--scratch-root` + `--run-id` per terminal.

### Static FD fill recipes

| Slice          | Conditions | Repeats | Task set   |
| -------------- | ---------- | ------- | ---------- |
| Fresh5 FD fill | FD         | 2       | Fresh5     |
| Remaining5 FD  | FD         | 4       | Remaining5 |

(Static recommendations ignore disk; do not invent progress from artifacts.)

---

## Parallel campaigns

Use when the operator wants multi-terminal / side-by-side / N-batch paid or
preflight work. Emit a **full pack** (see [SKILL.md](SKILL.md) and
[examples.md](examples.md) §5), not a thin sketch.

### Concurrency facts

- Runner **internal concurrency = 1**. Each terminal is one `node …runner.mjs`
  process → one sample at a time **inside** that process.
- **N terminals ⇒ N concurrent samples** (host Gemini CLI + Docker verifier
  pressure stack).
- Realistic cap on this host (~16 GB RAM / ~10 GB Docker WSL): **~4–5** agent
  terminals. Use fewer if many Docker verifies overlap.
- Unique `--run-id` ⇒ separate trees under
  `artifacts/pollux/deepswe-runs/<runId>/`. Matrix credit can merge later via
  ledger/dashboard — **do not invent progress from disk** unless asked.
- Warm dependency caches: a **new** terminal may point at an **already-warmed**
  scratch **for that same terminal’s task slice** after the warmer finished. Do
  **not** share one scratch across **live** concurrent terminals.

### Partition rules (prefer this order)

1. **By task (default):** slice `--task-ids` across terminals so each
   `(task × condition × repeats)` cell runs once. Best for Fresh5/Remaining5
   matrix fill (often one task per terminal when N = 5).
2. **By condition:** only when launching **different** conditions in parallel
   (e.g. terminal A vs E) on disjoint or intentionally separate work.
3. **By repeats:** rarely; usually worse for matrix fill and harder to reason
   about credit.

Naming convention:

| Terminal | `--run-id` suffix | `--scratch-root`                    |
| -------- | ----------------- | ----------------------------------- |
| 1..N     | `…-b01` … `…-b0N` | `C:\tmp\pollux-deepswe-b01` … `b0N` |

### Recommended N

| Ask                             | Skill response                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| Unspecified parallel            | Default N = min(task count, 5); prefer one task/terminal when it fits |
| N = 2–5                         | Emit full pack                                                        |
| N > 5 (esp. 10)                 | Refuse or strongly redirect to ≤5 + wave/pipeline advice              |
| “Same task list on 5 terminals” | Anti-pattern → warn + corrected by-task partition                     |

### Anti-patterns (warn / refuse)

| Anti-pattern                                                                     | Why                                                          | Correct action                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| Same `--task-ids` + same `--conditions` + same `--repeats` on multiple terminals | Duplicates Vertex spend; does **not** parallelize the matrix | Partition by task (or refuse duplicates)            |
| Shared `--scratch-root` across concurrent terminals                              | Race on bare repos / dependency caches / worktrees           | Always unique `C:\tmp\pollux-deepswe-b0N`           |
| N cold networked verifier preflights at once on cold Docker                      | Thundering herd; flaky / slow                                | 1-task cold warmup first; then stagger or serialize |
| 10 fully parallel paid samples                                                   | Exceeds 16 GB host / ~10 GB Docker WSL budget                | Cap ≤5; pipeline remaining waves                    |

---

## Flag encyclopedia

### Core run / identity

| Flag                   | Default (parser)                                         | Notes                                                                                   |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `--mode`               | `run`                                                    | `preflight`, `prepare`, `smoke`, `run`, `rescore`, `summarize`                          |
| `--conditions`         | `E,FD,A`                                                 | CSV of `A`, `E`, `FD`. Always set explicitly.                                           |
| `--task-ids`           | unset (all selected primary)                             | CSV of task IDs. Prefer explicit lists.                                                 |
| `--repeats`            | `1`                                                      | Integer ≥ 1. Matrix prefers 4; floor 3.                                                 |
| `--run-id`             | timestamped `deepswe-…`                                  | Unique per campaign/terminal. Artifacts under `artifacts/pollux/deepswe-runs/<runId>/`. |
| `--scratch-root`       | `$env:POLLUX_DEEPSWE_SCRATCH_ROOT` or `~/pollux-deepswe` | Prefer `C:\tmp\pollux-deepswe-…`. Workspaces/deps live here; pruned by default.         |
| `--allow-non-wsl`      | **false**                                                | **Required on Windows.**                                                                |
| `--entrypoint`         | `bundle`                                                 | Use `bundle` for paid science. Rebuild with `npm.cmd run bundle` if stale.              |
| `--limit` / `--offset` | unset / `0`                                              | Slice primary list; prefer `--task-ids` for named sets.                                 |
| `--task-manifest`      | `evaluation_results/deepswe-top20-gemini-3.1-pro.json`   | Rarely change.                                                                          |
| `--deepswe-repo`       | `$env:POLLUX_DEEPSWE_REPO` or `~/deep-swe`               | Local DeepSWE checkout.                                                                 |

### Preflight / Docker verifier

| Flag                               | Default                                  | Notes                                                                        |
| ---------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `--preflight-only`                 | false                                    | Forces `mode=preflight`.                                                     |
| `--dependency-preflight`           | false                                    | Check/install deps for selected tasks.                                       |
| `--dependency-warmup`              | false                                    | Also sets `dependencyPreflight=true`. Warms caches under scratch.            |
| `--baseline-verifier-preflight`    | false                                    | Run baseline verifier before model launch (also in `mode=run` if set).       |
| `--networked-verifier-preflight`   | false                                    | Also sets `baselineVerifierPreflight=true`. Use for networked warmup.        |
| `--no-baseline-verifier-preflight` | —                                        | Turns baseline verifier preflight off.                                       |
| `--keep-workspaces`                | false                                    | Keep ephemeral checkouts; default prune. Telemetry under `raw/` always kept. |
| `--no-keep-workspaces`             | —                                        | Explicit prune (default).                                                    |
| `--docker-command`                 | `$env:POLLUX_DEEPSWE_DOCKER` or `docker` | Rarely change.                                                               |

Coupling:

- `--dependency-warmup` ⇒ dependency preflight on.
- `--networked-verifier-preflight` ⇒ baseline verifier preflight on.

### Model / scoring knobs

| Flag                  | Default        | Notes                                             |
| --------------------- | -------------- | ------------------------------------------------- |
| `--fd-profile`        | `strict`       | `strict` or `detector`. Matrix science: `strict`. |
| `--timeout-ms`        | `7200000` (2h) | Per-sample CLI timeout.                           |
| `--max-api-responses` | `150`          | Cap model API turns.                              |
| `--max-session-turns` | `-1`           | Session turn cap.                                 |
| `--score-policy`      | `strict`       | `strict` or `diagnostic`.                         |

### Specialist (usually omit from matrix recipes)

| Flag                                      | Notes                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `--prepare-only`                          | Forces `mode=prepare`.                                                       |
| `--smoke` via `--mode smoke`              | Smoke path; not matrix fill.                                                 |
| `--rescore` + `--source-run`              | Re-verify saved patches; no Gemini spend.                                    |
| `--summarize`                             | Re-summarize existing `run.json` records.                                    |
| `--gold-patch-mode` / `--null-patch-mode` | Patch emission diagnostics; mutually exclusive; not with `--fake-responses`. |
| `--verifier-only` / `--no-verifier`       | Mutually exclusive.                                                          |
| `--fake-responses`                        | Deterministic smoke; not paid matrix.                                        |
| `--binary-path`                           | Override entrypoint binary.                                                  |

### Environment

| Variable                      | Role                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `POLLUX_DEEPSWE_SCRATCH_ROOT` | Default scratch if `--scratch-root` omitted. Prefer setting the flag explicitly to `C:\tmp\...`. |
| `POLLUX_DEEPSWE_REPO`         | DeepSWE repo path default.                                                                       |
| `POLLUX_DEEPSWE_DOCKER`       | Docker binary name.                                                                              |
| `GOOGLE_CLOUD_PROJECT`        | Vertex project (operator: `project-b10e390a-5418-4cfe-a2a`).                                     |
| `GOOGLE_CLOUD_LOCATION`       | Must be `global`.                                                                                |
| `GOOGLE_GENAI_USE_VERTEXAI`   | `true`.                                                                                          |

Auth-only helper: `node scripts/pollux-vertex-auth-preflight.mjs` →
`evaluation_results/pollux-vertex-auth-preflight/`.

---

## Artifact layout (read-only context)

```
artifacts/pollux/deepswe-runs/<runId>/
  preflight.json
  auth-preflight.json
  dependency-preflight.json          # if warmup/preflight
  baseline-verifier-preflight.json   # if baseline/networked
  manifest.json
  summary.json
  raw/<condition>/<taskId>/<sampleId>/run.json
```

Scratch (workspaces, dependency-cache, verifier-workspaces) lives under
`--scratch-root`, not under `artifacts/`. Default prune after score.

Windows verifier uses **staged self-contained checkouts** (do not mount linked
agent worktrees into Docker).

---

## Ops warnings to always mention

- Cold Docker / Resource Saver can fail verifiers and waste time before spend.
- Never put `--scratch-root` on OneDrive or inside the repo tree.
- Do not use OAuth for these non-interactive runs; Vertex + ADC only.
- `GOOGLE_CLOUD_LOCATION` must be `global`.
- Cap parallel paid terminals ~4–5 with distinct scratch + run-id.
- Runner concurrency = 1 per process; N terminals = N concurrent samples.
- Never share one live `--scratch-root` across concurrent terminals.
- Do not start N cold networked preflights simultaneously.
