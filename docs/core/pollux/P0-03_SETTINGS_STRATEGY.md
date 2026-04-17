# P0-03 Settings Strategy and Promotion Path Contract

Version: 1.0 Date: 2026-04-17 Status: Draft for G3 closure Purpose: Phase 0 task
artifact for P0-03 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This document closes the P0-03 deliverable by defining:

1. The Phase 1 settings path for Pollux under experimental.pollux.\*.
2. The schema-to-loader-to-core mapping contract.
3. CI and invariant checks required to prevent silent settings drift.
4. A promotion path from experimental.pollux._ to top-level pollux._.

Runtime feature behavior is out of scope for this artifact.

---

## 2) Locked settings strategy

### 2.1 Phase 1 settings path

1. Pollux settings are introduced under experimental.pollux.\* for Phase 1.
2. The strategy remains flag-first and reversible while runtime behavior
   stabilizes.

### 2.2 Source-of-truth ownership

1. CLI settings schema is the canonical source of settings structure.
2. Core is a pure consumer of resolved ConfigParameters.
3. Core must not read settings files directly.

### 2.3 Mapping contract

1. Value flow is SETTINGS_SCHEMA -> loadSettings/merge -> loadCliConfig ->
   ConfigParameters -> Config.
2. New Pollux fields are not complete until wired through loadCliConfig.
3. Missing mapping is treated as a failure condition, even if type checks pass.

### 2.4 Precedence contract

1. argv > environment > settings > defaults.
2. Pollux settings must follow the same precedence as other feature settings.

### 2.5 Merge strategy contract

1. Any array or record Pollux setting must specify explicit merge strategy
   semantics.
2. mergeStrategy changes require migration or explicit compatibility handling.

---

## 3) Required implementation controls (for later execution)

### 3.1 Schema and docs generation

1. Update CLI schema definition for experimental.pollux.\*.
2. Regenerate schemas/settings.schema.json via npm run schema:settings.
3. Regenerate settings docs via npm run docs:settings.

### 3.2 CLI-to-core wiring

1. Extend ConfigParameters with Pollux fields.
2. Map all Pollux fields in loadCliConfig.
3. Keep Config as consumer-only for resolved values.

### 3.3 Invariant and drift checks

1. Add mapping invariant tests for schema-to-ConfigParameters coverage.
2. Add tests for merge behavior and precedence for Pollux keys.
3. Enforce schema generation drift check in CI with npm run schema:settings --
   --check.

---

## 4) Promotion path (experimental to top-level)

### 4.1 Stage A: Experimental introduction

1. Introduce experimental.pollux.\* keys only.
2. Keep defaults conservative and feature-flag controlled.
3. Validate TG-5 invariants before broader adoption.

### 4.2 Stage B: Dual-path migration window

1. Introduce top-level pollux.\* keys as target format after stability.
2. Support controlled migration from experimental.pollux.\*.
3. Prevent ambiguous precedence by defining one canonical read order during
   migration.

### 4.3 Stage C: Promotion complete

1. Promote pollux.\* as the primary path.
2. Deprecate experimental.pollux.\* after migration readiness and release safety
   review.
3. Keep explicit migration tests to prevent config regressions.

---

## 5) Acceptance tests list

### AT-01 schema presence and generation

Objective: Verify experimental.pollux.\* exists in CLI schema and generated
schema artifacts are current.

Assertions:

1. SETTINGS_SCHEMA includes experimental.pollux.\* with complete field
   definitions.
2. schemas/settings.schema.json is regenerated and up to date.
3. docs settings output is aligned with schema.

TG mapping: TG-5.

### AT-02 precedence and merge behavior

Objective: Verify Pollux settings obey precedence and merge semantics.

Assertions:

1. argv overrides env/settings/defaults for Pollux keys.
2. env overrides settings/defaults for Pollux keys.
3. array/record fields honor explicit mergeStrategy behavior.

TG mapping: TG-5.

### AT-03 schema-to-core mapping invariant

Objective: Verify every required Pollux setting field is wired from CLI loader
into ConfigParameters.

Assertions:

1. No required Pollux field is missing from loadCliConfig mapping.
2. ConfigParameters and Config accessors are coherent with mapped fields.

TG mapping: TG-5.

### AT-04 silent-drift prevention in CI

Objective: Verify CI fails when schema artifacts drift from source schema.

Assertions:

1. CI runs schema:settings check as a required validation step.
2. Drift is surfaced before runtime code merge.

TG mapping: TG-5.

---

## 6) G3 closure checklist

P0-03 is complete when:

1. Settings strategy for experimental.pollux.\* is documented.
2. Promotion path to top-level pollux.\* is documented.
3. Mapping and invariants contract is documented.
4. Acceptance tests list exists and maps to TG-5.
5. Owners 06 and 15 sign off on strategy and CI implications.

---

## 7) References

1. IMPLEMENTATION_PLAN.md (G3 and P0-03 task definition).
2. POLLUX_SPEC.md section 8 (settings and configuration contract).
3. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-6 and NA-5).
4. docs/repo-compartment-analysis/reports/06-settings-schema-and-config-plumbing/report.md
   (Appendix B recipe and R-06 risks).
5. docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci/report.md.
6. docs/repo-compartment-analysis/reports/16-docs-specs-and-governance/report.md.
