# P4-10 Real Benchmark Measurement Spec

Version: 1.0 Date: 2026-04-22 Status: Foundation spec for live runner and
artifact schema

---

## 1) Canonical measurement surface

The canonical measurement surface for Pollux real-model benchmarks is:

`headless_non_interactive_cli`

Why:

1. it is the most reproducible CLI surface
2. it matches the existing benchmark harness shape
3. cross-surface parity is already proven elsewhere in the Pollux plan

---

## 2) Conditions

The live real benchmark keeps the current A/E/F matrix.

### Condition A

1. Pollux disabled
2. executor-only baseline
3. `gemini-2.5-flash`

### Condition E

1. Pollux disabled
2. stronger executor-only baseline
3. `gemini-3-pro-preview`

### Condition F

1. Pollux enabled
2. executor `gemini-2.5-flash`
3. advisor `gemini-3-pro-preview`
4. current observer/fusion detector configuration

---

## 3) Terms

### Sample

One concrete CLI execution for:

1. one task
2. one condition
3. one repeat index

### Cell

One `task x condition` pair.

### Campaign

A named collection of cells and repeats with one frozen manifest, one corpus
lock, and one pricing snapshot.

### Valid sample

A sample with:

1. CLI success
2. telemetry present
3. prompt id present
4. response id evidence present
5. fairness pins satisfied

### Invalid sample

A sample explicitly marked invalid with a recorded reason. Invalid samples are
preserved, not silently deleted.

---

## 4) Metrics

The foundation runner records:

1. oracle pass/fail
2. advisor/executor/total tokens
3. observed advisor calls
4. wall-clock latency
5. service latency from telemetry
6. estimated USD cost when a pricing snapshot is provided
7. fairness pin state
8. invalidation reason when present

Publishable campaigns additionally require:

1. reason-code breakdown
2. timing breakdown (`same_turn` / `next_turn`)
3. methodology-level statistics from `P4-05_REAL_BENCHMARK_METHODOLOGY.md`

---

## 5) Invalidation rules

The foundation runner can invalidate a sample for reasons including:

1. `auth_failure`
2. `rate_limit_contamination`
3. `cli_exit_nonzero`
4. `missing_telemetry`
5. `missing_prompt_id`
6. `missing_response_id`
7. `fairness_pin_failure`

These reasons are artifact evidence, not cleanup hints.

---

## 6) Artifact schema

Campaign root:

```text
artifacts/pollux/real-runs/<campaign-id>/
  manifest.json
  conditions.json
  corpus-lock.json
  preflight.json
  preflight.md
  pricing-snapshot.json
  raw/<condition>/<task>/run-001.json
  summary.json
  report.md
```

Each raw sample must include:

1. campaign id
2. sample id
3. task id
4. condition id
5. git SHA
6. lockfile hash
7. corpus SHA
8. prompt id
9. response ids
10. token totals by role
11. cost totals when pricing exists
12. fairness pins
13. oracle result
14. invalidation state

---

## 7) Publishability note

This measurement spec enables live pilots immediately.

It does not, by itself, make the repo publishable-ready. The publishability bar
remains `P4-05_REAL_BENCHMARK_METHODOLOGY.md`.
