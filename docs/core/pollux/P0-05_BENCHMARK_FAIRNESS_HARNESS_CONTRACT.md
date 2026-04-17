# P0-05 Benchmark Fairness Checklist and Harness Contract

Version: 1.0 Date: 2026-04-17 Status: Draft for Phase 0 task closure Purpose:
Phase 0 deliverable for P0-05 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This document defines mandatory benchmark fairness controls and the harness
contract used to produce valid Pollux benchmark comparisons.

It covers:

1. Fairness pins required for benchmark conditions A-E.
2. Harness behavior contract for router, loop detector, availability state, and
   session isolation.
3. Run validity criteria and required benchmark metadata.
4. Acceptance checks needed to satisfy Phase 0 fairness control definition.

This is a control contract artifact. Harness implementation code is tracked
separately.

---

## 2) Fairness checklist (mandatory pins)

All benchmark runs used for A-E comparison must enforce all pins below.

### FP-01 Router pin

1. Router strategy must be pinned to explicit override strategy for the target
   model.
2. No classifier-based routing decisions may influence baseline runs.

### FP-02 Loop-detector pin

1. Loop detector LLM checks must be disabled for baseline fairness mode.
2. Baseline runs must not include hidden utility loop-check LLM traffic.

### FP-03 Availability reset pin

1. Availability state must be reset between runs/iterations.
2. No carry-over fallback/penalty state across benchmark samples.

### FP-04 Dynamic model config pin

1. Dynamic model configuration features must be fixed and deterministic.
2. Fairness mode must avoid runtime model-selection drift.

### FP-05 Session isolation pin

1. Every iteration must use a fresh isolated session ID.
2. No session-level state reuse across benchmark iterations.

### FP-06 Sandbox and process-isolation pin

1. Harness must define a deterministic sandbox posture for compared runs.
2. Background-process history and per-session execution state must not leak
   between iterations.

---

## 3) Harness contract

Planned harness location for implementation:
packages/test-utils/src/benchmark-harness.ts.

### 3.1 Contracted responsibilities

1. Configure fairness pins FP-01 through FP-06 before each run.
2. Execute benchmark conditions A-E under the same fairness mode contract.
3. Capture role-tagged token usage and latency metrics from a common measurement
   path.
4. Emit run metadata sufficient to audit fairness pin compliance.

### 3.2 Configuration surface (contract level)

The harness must provide explicit controls for:

1. routerMode (must support override strategy pinning).
2. disableLoopDetectionLlmChecks.
3. resetAvailabilityStateEachIteration.
4. dynamicConfigMode (fixed/deterministic).
5. sessionIsolationMode (fresh IDs per iteration).
6. sandboxMode and backgroundStateIsolation.

### 3.3 Validity rules

1. Any missing fairness pin invalidates the run for A-E comparison.
2. Invalid runs must be labeled invalid and excluded from comparison outputs.
3. Validity outcomes must be machine-auditable in artifacts.

---

## 4) Required benchmark metadata (audit trail)

Each run artifact must record at least:

1. model override state
2. loop detector state
3. availability reset state
4. dynamic config state
5. session isolation state
6. sandbox/isolation state
7. run validity flag and invalidation reason (if invalid)

---

## 5) Acceptance checks list

### AC-01 fairness pin enforcement

Objective: Verify all fairness pins FP-01..FP-06 are enforceable by harness
configuration.

TG mapping: TG-1.

### AC-02 invalid-run rejection

Objective: Verify runs missing one or more required pins are marked invalid and
excluded.

TG mapping: TG-1.

### AC-03 baseline utility-call suppression

Objective: Verify baseline A/E runs do not include hidden router/loop LLM
utility calls under fairness mode.

TG mapping: TG-1.

### AC-04 availability and session reset behavior

Objective: Verify availability state and session IDs are reset between
iterations.

TG mapping: TG-1.

### AC-05 reproducibility under checkpoint/resume

Objective: Verify fairness state remains consistent across checkpoint/resume
execution.

TG mapping: TG-1.

### AC-06 token and latency comparability

Objective: Verify captured token/latency data is comparable across conditions
under fairness pins.

TG mapping: TG-1, TG-4.

---

## 6) P0-05 acceptance checklist

P0-05 is complete when:

1. Mandatory fairness pins are documented.
2. Harness behavior contract is documented.
3. Run validity and required metadata contract are documented.
4. Acceptance checks list exists and maps to TG-1 (and TG-4 where applicable).

---

## 7) References

1. IMPLEMENTATION_PLAN.md (P0-05 task and TG-1).
2. POLLUX_SPEC.md section 10 and Appendix B (fairness pins and validity).
3. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-3 and NA-2).
4. docs/repo-compartment-analysis/reports/07-routing-availability-loop-and-pollux/report.md.
5. docs/repo-compartment-analysis/reports/14-testing-and-evaluation-architecture/report.md.
6. docs/repo-compartment-analysis/reports/10-sandbox-shell-and-filesystem-substrate/report.md.
