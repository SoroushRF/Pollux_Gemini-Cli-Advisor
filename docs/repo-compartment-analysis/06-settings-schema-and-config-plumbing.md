# Compartment 06: Settings Schema and Config Plumbing

## Purpose

Analyze the complete settings lifecycle: schema definition, validation, merge
precedence, storage paths, and final mapping into core runtime config.

This compartment is critical for any feature that introduces new user-facing
settings (including Pollux).

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/06-settings-schema-and-config-plumbing/report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/06-settings-schema-and-config-plumbing/report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Tier / Template**: **T1** — `_TEMPLATES/report-template.md` (400–900 md
  lines, 5–15 code quotes). See `AGENT_RUNBOOK.md` §2.
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 06 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- canonical settings schema,
- settings validation and normalization,
- user/workspace/system merge logic,
- CLI config construction and mapping into core Config,
- configuration storage and path resolution.

Primary paths:

- `packages/cli/src/config/settingsSchema.ts`
- `packages/cli/src/config/settings.ts`
- `packages/cli/src/config/settings-validation.ts`
- `packages/cli/src/config/config.ts`
- `packages/core/src/config/config.ts`
- `packages/core/src/config/storage.ts`
- `packages/core/src/utils/paths.ts`
- `schemas/settings.schema.json`

Out of scope:

- detailed policy rule behavior,
- model routing internals,
- UI rendering behavior.

## Key Questions To Answer

1. Where is the canonical user-facing schema owned?
2. How are settings merged across system/user/workspace sources?
3. What precedence rules are enforced?
4. Where and how are settings transformed into core runtime values?
5. What are the safe extension points for adding new config blocks?

## Data Gathering Checklist

1. Confirm schema source of truth.
2. Trace load/parse/validate/merge pipeline in CLI config.
3. Trace mapping into core `Config` constructor/getters.
4. Confirm storage path derivation for all settings layers.
5. Verify precedence and invalid-value behavior with tests.

## Search Commands

```bash
rg -n "settingsSchema|SETTINGS_SCHEMA|defineSetting" packages/cli/src/config
rg -n "loadSettings|mergeSettings|settings-validation" packages/cli/src/config
rg -n "class Config|createConfig|ConfigParameters" packages/cli/src/config packages/core/src/config
rg -n "Storage|paths\\.ts|getGeminiDir" packages/core/src
rg --files packages/cli/src/config
rg --files packages/core/src/config
rg -n "pollux" packages schemas
```

PowerShell fallback:

```powershell
Select-String -Path "packages/cli/src/config/**/*.ts","packages/core/src/config/**/*.ts" -Pattern "settingsSchema|loadSettings|class Config|Storage|paths"
```

## Step-by-Step Analysis Recipe

### Step 1: Identify canonical schema ownership

Read:

- `packages/cli/src/config/settingsSchema.ts`
- generated schema references in `schemas/settings.schema.json`

Capture:

- schema structure,
- defaults and descriptions,
- validation constraints.

### Step 2: Trace settings loading and merge logic

Read:

- `packages/cli/src/config/settings.ts`
- `packages/cli/src/config/settingPaths.ts`
- `packages/cli/src/config/settings-validation.ts`

Capture:

- source layers (system/user/workspace),
- merge order and conflict resolution,
- warning/error behavior for invalid settings.

### Step 3: Trace mapping to runtime config

Read:

- `packages/cli/src/config/config.ts`
- `packages/core/src/config/config.ts`

Capture:

- mapping from resolved settings to core constructor fields,
- accessor/getter surfaces used by runtime,
- defaults when settings are absent.

### Step 4: Validate storage and path behavior

Read:

- `packages/core/src/config/storage.ts`
- `packages/core/src/utils/paths.ts`

Capture:

- default config path behavior,
- workspace-specific storage behavior,
- migration/path validation behavior.

### Step 5: Verify with tests

Use:

- `packages/cli/src/config/settings*.test.ts`
- `packages/cli/src/config/config*.test.ts`
- `packages/core/src/config/storage*.test.ts`
- `packages/core/src/config/scoped-config.test.ts`

### Step 6: Produce precedence truth table

Document precedence across:

- CLI flags,
- environment variables,
- workspace settings,
- user settings,
- system defaults.

### Step 7: Add feature-extension recipe

Define exact steps to safely add a new setting block:

1. extend CLI schema,
2. extend validation,
3. merge behavior tests,
4. map to core config,
5. add docs/schema generation updates,
6. verify no-op defaults.

### Step 8: Report anti-patterns

Call out dangerous patterns such as adding core-only settings without CLI schema
coverage.

## What Good Output Looks Like

1. End-to-end config dataflow diagram.
2. Canonical source-of-truth statement.
3. Merge/precedence matrix.
4. Storage path and migration behavior summary.
5. New-setting implementation checklist with tests.

## Do and Do Not

Do:

- treat CLI schema/loader as first-class owner of user settings,
- verify precedence with tests,
- map all runtime usage points in core.

Do not:

- add runtime settings in core only,
- assume `~/.gemini/settings.json` is the only layer,
- skip invalid-value and fallback tests.

## Common Failure Modes While Analyzing

- Confusing config schema with runtime config object.
- Ignoring workspace/system layers.
- Missing mapping logic in CLI-to-core bridge.
- Reporting intended precedence without test confirmation.

## Handoffs To Other Compartments

- Routing-specific setting effects ->
  `07-routing-availability-loop-and-pollux.md`
- Policy-related settings -> `09-policy-trust-and-safety-engine.md`
- Build/docs generation scripts -> `15-build-packaging-release-and-ci.md`

## Definition of Done

- [ ] Source-of-truth schema and merge ownership are proven.
- [ ] Precedence behavior is documented and test-backed.
- [ ] CLI-to-core mapping is explicit.
- [ ] Storage/path behavior is confirmed.
- [ ] New-setting recipe and anti-patterns are documented.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 06 flipped to `done`.
