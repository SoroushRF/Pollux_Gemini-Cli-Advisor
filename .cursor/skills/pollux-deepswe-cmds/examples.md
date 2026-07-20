# Pollux DeepSWE — example recipes

All commands: PowerShell, repo root, raw
`node scripts/pollux-deepswe-runner.mjs`. Adjust `--run-id` / `--scratch-root`
so they stay unique per terminal.

Fresh5 task CSV:

```
wazero-multi-module-snapshots,ts-pattern-match-each,true-myth-iterable-collection-combinators,testem-per-launcher-reports,opa-rego-rule-profiling
```

Remaining5 task CSV:

```
ofetch-per-origin-circuit-breaker,psd-tools-blend-range-api,ipython-session-bundle-replay,ytt-jsonpath-query-api,kombu-single-active-consumer-priority
```

---

## 1. One-task wazero cold preflight

Use after Docker restart / Resource Saver / first use of the day.

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode preflight `
  --conditions E `
  --task-ids wazero-multi-module-snapshots `
  --repeats 1 `
  --run-id deepswe-wazero-cold-preflight `
  --scratch-root C:\tmp\pollux-deepswe-cold `
  --allow-non-wsl `
  --entrypoint bundle `
  --dependency-warmup `
  --networked-verifier-preflight
```

| Flag                             | Why                                                            |
| -------------------------------- | -------------------------------------------------------------- |
| `--mode preflight`               | No paid model samples; infra + deps + baseline verifier.       |
| `--conditions E`                 | Single condition is enough to exercise the verifier path.      |
| `--task-ids wazero-…`            | One task = cold-start warmup.                                  |
| `--repeats 1`                    | Preflight does not need matrix repeats.                        |
| `--run-id`                       | Unique artifact folder under `artifacts/pollux/deepswe-runs/`. |
| `--scratch-root`                 | Off OneDrive; holds dependency cache / staging.                |
| `--allow-non-wsl`                | Required on Windows.                                           |
| `--entrypoint bundle`            | Same entrypoint as paid runs.                                  |
| `--dependency-warmup`            | Warm + dependency preflight.                                   |
| `--networked-verifier-preflight` | Also enables baseline verifier preflight (networked).          |

Optional auth-only first: `node scripts/pollux-vertex-auth-preflight.mjs`.

---

## 2. Fresh5 E preflight (warmed)

After cold 1-task green:

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode preflight `
  --conditions E `
  --task-ids wazero-multi-module-snapshots,ts-pattern-match-each,true-myth-iterable-collection-combinators,testem-per-launcher-reports,opa-rego-rule-profiling `
  --repeats 1 `
  --run-id deepswe-E-fresh5-preflight `
  --scratch-root C:\tmp\pollux-deepswe-E-fresh5 `
  --allow-non-wsl `
  --entrypoint bundle `
  --dependency-warmup `
  --networked-verifier-preflight
```

| Flag                                                         | Why                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `--mode preflight`                                           | Confirm deps + baseline verifier for all Fresh5 before spend. |
| `--conditions E`                                             | Match the upcoming paid condition.                            |
| `--task-ids` Fresh5                                          | Same five tasks as the paid batch.                            |
| `--dependency-warmup` / `--networked-verifier-preflight`     | Full safety-ladder step 5.                                    |
| `--allow-non-wsl` / `--entrypoint bundle` / scratch / run-id | Windows matrix defaults.                                      |

---

## 3. Fresh5 E × 3 paid run

**Soft gate:** if preflight is not confirmed green, still print this command,
but also print recipe **#2** and a WARNING that auth + cold + Fresh5 preflight
should be green before Vertex spend.

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids wazero-multi-module-snapshots,ts-pattern-match-each,true-myth-iterable-collection-combinators,testem-per-launcher-reports,opa-rego-rule-profiling `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3 `
  --scratch-root C:\tmp\pollux-deepswe-E-fresh5 `
  --allow-non-wsl `
  --entrypoint bundle
```

| Flag                  | Why                                                               |
| --------------------- | ----------------------------------------------------------------- |
| `--mode run`          | Paid agent samples + Docker verifier.                             |
| `--conditions E`      | Pro alone (`gemini-3.1-pro-preview`).                             |
| `--task-ids` Fresh5   | Five primary tasks.                                               |
| `--repeats 3`         | Matrix floor (prefer 4 when budget allows).                       |
| `--run-id`            | Distinct campaign id (do not reuse a preflight-only id casually). |
| `--scratch-root`      | Prefer same warm root as Fresh5 E preflight if caches exist.      |
| `--allow-non-wsl`     | Windows.                                                          |
| `--entrypoint bundle` | Production Pollux bundle.                                         |

Sample count: 5 tasks × 1 condition × 3 repeats = **15** paid samples.

Warnings: Resource Saver off; not 10-wide parallel; no OneDrive scratch;
`GOOGLE_CLOUD_LOCATION=global`; no OAuth.

---

## 4. FD fill (static matrix)

### 4a. Fresh5 FD +2 (to n=4)

Credited baseline is already n=2 per Fresh5 FD task. Static next fill: **+2**.

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions FD `
  --fd-profile strict `
  --task-ids wazero-multi-module-snapshots,ts-pattern-match-each,true-myth-iterable-collection-combinators,testem-per-launcher-reports,opa-rego-rule-profiling `
  --repeats 2 `
  --run-id deepswe-FD-fresh5-plus2 `
  --scratch-root C:\tmp\pollux-deepswe-FD-fresh5 `
  --allow-non-wsl `
  --entrypoint bundle
```

Preflight twin (soft-gate companion): same flags with
`--mode preflight --dependency-warmup --networked-verifier-preflight` and a
distinct `--run-id` suffix like `-preflight`.

| Flag                  | Why                                  |
| --------------------- | ------------------------------------ |
| `--conditions FD`     | Flash + Pro advisor.                 |
| `--fd-profile strict` | Matrix default FD profile.           |
| `--repeats 2`         | Static +2 to reach n=4 on Fresh5 FD. |

### 4b. Remaining5 FD ×4

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions FD `
  --fd-profile strict `
  --task-ids ofetch-per-origin-circuit-breaker,psd-tools-blend-range-api,ipython-session-bundle-replay,ytt-jsonpath-query-api,kombu-single-active-consumer-priority `
  --repeats 4 `
  --run-id deepswe-FD-remaining5-r4 `
  --scratch-root C:\tmp\pollux-deepswe-FD-remaining5 `
  --allow-non-wsl `
  --entrypoint bundle
```

Fill order reminder: finish FD (4a then 4b) before A, then E.

---

## 5. Parallel campaign packs (≈4–5 max)

**Always** emit a full pack when the user asks for parallel / multi-terminal /
side-by-side / N batches. Partition by task; unique `--run-id` +
`--scratch-root` per terminal. Runner concurrency = 1 ⇒ N terminals = N
concurrent samples.

**Anti-pattern:** same `--task-ids` + same `--conditions` + same `--repeats` on
every terminal → warn and emit a corrected by-task partition instead.

**Refuse / redirect:** 10 fully hot paid terminals → cap ≤5 + pipeline waves.

Shared flag table for packs below (per-terminal diffs: `--task-ids`, `--run-id`,
`--scratch-root`):

| Flag                                       | Why                                              |
| ------------------------------------------ | ------------------------------------------------ |
| `--mode run`                               | Paid agent samples + Docker verifier.            |
| `--conditions`                             | Explicit matrix condition (`E` / `FD` / `A`).    |
| `--fd-profile strict`                      | Only for FD packs; matrix default.               |
| `--task-ids`                               | **Disjoint** per terminal (partition-by-task).   |
| `--repeats`                                | Samples per (task × condition) on that terminal. |
| `--run-id …-b0N`                           | Separate artifact tree per terminal.             |
| `--scratch-root C:\tmp\pollux-deepswe-b0N` | Isolated scratch; never share live.              |
| `--allow-non-wsl`                          | Required on Windows.                             |
| `--entrypoint bundle`                      | Production Pollux bundle.                        |

Parallel ops checklist (print with every pack):

- Docker healthy; Resource Saver off
- Soft gate: one cold 1-task networked preflight first; then optional per-slice
  or serialized multi-task preflight
- Unique scratch + run-id per terminal; disjoint task slices
- Cap ≤5 hot paid terminals; pipeline extras
- Do not start N cold networked preflights simultaneously

---

### 5a. Fresh5 E ×3 across 5 terminals (one task each)

**Summary:** 5 terminals · partition-by-task · 5 tasks × 1 condition × 3 repeats
= **15** paid samples.

**Soft gate:** if preflight not confirmed green, also point at recipe **#1**
(cold) and optionally per-slice preflight with the same `b0N` scratch after
warmup finishes.

#### Terminal 1 — `wazero-multi-module-snapshots`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids wazero-multi-module-snapshots `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b01 `
  --scratch-root C:\tmp\pollux-deepswe-b01 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 2 — `ts-pattern-match-each`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids ts-pattern-match-each `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b02 `
  --scratch-root C:\tmp\pollux-deepswe-b02 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 3 — `true-myth-iterable-collection-combinators`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids true-myth-iterable-collection-combinators `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b03 `
  --scratch-root C:\tmp\pollux-deepswe-b03 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 4 — `testem-per-launcher-reports`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids testem-per-launcher-reports `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b04 `
  --scratch-root C:\tmp\pollux-deepswe-b04 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 5 — `opa-rego-rule-profiling`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids opa-rego-rule-profiling `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b05 `
  --scratch-root C:\tmp\pollux-deepswe-b05 `
  --allow-non-wsl `
  --entrypoint bundle
```

---

### 5b. Remaining5 FD ×4 across 5 terminals (one task each)

**Summary:** 5 terminals · partition-by-task · 5 tasks × 1 condition × 4 repeats
= **20** paid samples. Static matrix: Remaining5 FD after Fresh5 FD fill.

#### Terminal 1 — `ofetch-per-origin-circuit-breaker`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions FD `
  --fd-profile strict `
  --task-ids ofetch-per-origin-circuit-breaker `
  --repeats 4 `
  --run-id deepswe-FD-remaining5-r4-b01 `
  --scratch-root C:\tmp\pollux-deepswe-b01 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 2 — `psd-tools-blend-range-api`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions FD `
  --fd-profile strict `
  --task-ids psd-tools-blend-range-api `
  --repeats 4 `
  --run-id deepswe-FD-remaining5-r4-b02 `
  --scratch-root C:\tmp\pollux-deepswe-b02 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 3 — `ipython-session-bundle-replay`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions FD `
  --fd-profile strict `
  --task-ids ipython-session-bundle-replay `
  --repeats 4 `
  --run-id deepswe-FD-remaining5-r4-b03 `
  --scratch-root C:\tmp\pollux-deepswe-b03 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 4 — `ytt-jsonpath-query-api`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions FD `
  --fd-profile strict `
  --task-ids ytt-jsonpath-query-api `
  --repeats 4 `
  --run-id deepswe-FD-remaining5-r4-b04 `
  --scratch-root C:\tmp\pollux-deepswe-b04 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 5 — `kombu-single-active-consumer-priority`

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions FD `
  --fd-profile strict `
  --task-ids kombu-single-active-consumer-priority `
  --repeats 4 `
  --run-id deepswe-FD-remaining5-r4-b05 `
  --scratch-root C:\tmp\pollux-deepswe-b05 `
  --allow-non-wsl `
  --entrypoint bundle
```

---

### 5c. Fewer slots — Fresh5 E ×3 across 3 terminals

**Summary:** 3 terminals · partition-by-task · same **15** paid samples (2+2+1
tasks). Use when the operator only wants fewer concurrent slots.

| Terminal | `--task-ids`                                                            | `--run-id`                | `--scratch-root`            |
| -------- | ----------------------------------------------------------------------- | ------------------------- | --------------------------- |
| 1        | `wazero-multi-module-snapshots,ts-pattern-match-each`                   | `deepswe-E-fresh5-r3-b01` | `C:\tmp\pollux-deepswe-b01` |
| 2        | `true-myth-iterable-collection-combinators,testem-per-launcher-reports` | `deepswe-E-fresh5-r3-b02` | `C:\tmp\pollux-deepswe-b02` |
| 3        | `opa-rego-rule-profiling`                                               | `deepswe-E-fresh5-r3-b03` | `C:\tmp\pollux-deepswe-b03` |

#### Terminal 1

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids wazero-multi-module-snapshots,ts-pattern-match-each `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b01 `
  --scratch-root C:\tmp\pollux-deepswe-b01 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 2

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids true-myth-iterable-collection-combinators,testem-per-launcher-reports `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b02 `
  --scratch-root C:\tmp\pollux-deepswe-b02 `
  --allow-non-wsl `
  --entrypoint bundle
```

#### Terminal 3

```powershell
node scripts/pollux-deepswe-runner.mjs `
  --mode run `
  --conditions E `
  --task-ids opa-rego-rule-profiling `
  --repeats 3 `
  --run-id deepswe-E-fresh5-r3-b03 `
  --scratch-root C:\tmp\pollux-deepswe-b03 `
  --allow-non-wsl `
  --entrypoint bundle
```

---

### 5d. Anti-pattern correction (same task list × N terminals)

**Bad ask:** “Run Fresh5 E×3 in parallel with the same task list on 5
terminals.”

**Response:** warn that identical `--task-ids` + `--conditions` + `--repeats`
duplicates Vertex spend and does **not** parallelize the matrix. Emit the
corrected pack from **§5a** instead (one Fresh5 task per terminal).

Do **not** recommend 10 fully hot parallel paid samples on this host.
