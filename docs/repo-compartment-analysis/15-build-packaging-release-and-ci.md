# Compartment 15: Build, Packaging, Release, and CI

## Purpose

Analyze how source code is transformed into distributable artifacts and how CI
workflows validate, gate, and release those artifacts.

This compartment provides operational and delivery context for all runtime
changes.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci.report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/15-build-packaging-release-and-ci.report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Template**: `_TEMPLATES/report-template.md`
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 15 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- root and package build scripts,
- bundling and binary packaging paths,
- sandbox image/bundle build flow,
- release automation scripts,
- GitHub workflow orchestration.

Primary paths:

- `package.json` (root scripts)
- `scripts`
- `scripts/releasing`
- `esbuild.config.js`
- `Dockerfile`
- `Makefile`
- `.github/workflows`
- `sea`
- `bundle`

Out of scope:

- runtime business logic internals,
- policy and config semantics,
- docs content strategy.

## Key Questions To Answer

1. What are the build outputs and how are they produced?
2. How are package builds different from bundle/binary builds?
3. Which CI workflows gate changes, and which are scheduled/manual?
4. How do release scripts coordinate versioning and publishing?
5. What operational risks exist in the delivery pipeline?

## Data Gathering Checklist

1. Read root script graph in `package.json`.
2. Inspect key script files in `scripts/`.
3. Map package build behavior and workspace builds.
4. Inventory CI workflows by category.
5. Inspect release script and workflow chain.

## Search Commands

```bash
rg -n "\"scripts\"" package.json
rg --files scripts
rg --files .github/workflows
rg -n "esbuild|build_package|build_sandbox|build_binary|build_vscode_companion" scripts esbuild.config.js
rg --files bundle sea
rg -n "releasing|version\\.js|publish" scripts scripts/releasing
```

PowerShell fallback:

```powershell
Get-Content package.json | Select-String "\"scripts\"" -Context 0,40
Get-ChildItem -Recurse scripts, .github/workflows | Select-Object FullName
```

## Step-by-Step Analysis Recipe

### Step 1: Build command graph

Read root `package.json` scripts and capture:

- build paths,
- test/lint/typecheck gates,
- bundle and binary commands,
- release helper commands.

### Step 2: Analyze build scripts

Read:

- `scripts/build.js`
- `scripts/build_package.js`
- `scripts/build_sandbox.js`
- `scripts/build_binary.js`
- `scripts/build_vscode_companion.js`
- `esbuild.config.js`

Capture artifact flow and dependency ordering.

### Step 3: Analyze packaging targets

Document how outputs differ for:

- npm packages,
- bundled CLI artifact (`bundle/*`),
- SEA/binary path (`sea/*`),
- VS Code extension packaging.

### Step 4: Analyze release automation

Read:

- `scripts/version.js`
- scripts under `scripts/releasing/*`
- release workflows in `.github/workflows/release-*.yml`.

Capture:

- trigger conditions,
- promotion model (nightly/preview/stable),
- rollback and patch flows.

### Step 5: Analyze CI workflow taxonomy

Inspect `.github/workflows` and classify:

- core CI/test workflows,
- eval and nightly suites,
- release workflows,
- governance automation workflows.

### Step 6: Validate with docs and manifests

Cross-check with:

- `README.md` release sections,
- `docs/release-confidence.md`, `docs/releases.md`, changelogs.

### Step 7: Build delivery risk register

Include risks such as:

- script coupling,
- artifact drift,
- workflow ordering race conditions,
- inconsistent test coverage before release.

### Step 8: Publish change-impact checklist

When changing runtime code, list required build/test/release checks before
merge.

## What Good Output Looks Like

1. End-to-end build and release pipeline map.
2. Artifact taxonomy and ownership.
3. CI workflow classification and gating model.
4. Delivery risk register.
5. Practical pre-merge/pre-release checklist.

## Do and Do Not

Do:

- treat script graph as source of truth for delivery flow,
- map release workflows explicitly,
- include non-default checks (integration/memory/perf/evals).

Do not:

- assume `npm run build` covers every artifact,
- ignore nightly/scheduled workflow implications,
- report release behavior without reading release scripts.

## Common Failure Modes While Analyzing

- Looking only at CI YAML and skipping script implementations.
- Missing separate artifact pipelines (bundle, binary, extension).
- Ignoring patch and rollback workflows.
- Not accounting for workspace package build behavior.

## Handoffs To Other Compartments

- Product package boundaries ->
  `13-integration-products-sdk-vscode-a2a-devtools.md`
- Testing confidence sources -> `14-testing-and-evaluation-architecture.md`
- Docs governance/release notes -> `16-docs-specs-and-governance.md`

### Boundary with 11 (Telemetry)

Compartment 15 owns **CI workflow orchestration** (when jobs run, what gates
them, how artifacts are released). Compartment 11 owns **telemetry runtime
behavior and scripts** (what is emitted, how it is sanitized, how operators
inspect it). If a telemetry script is defective, that is 11. If a telemetry
script fails to _run in CI_, that is 15.

### Boundary with 14 (Testing)

Compartment 15 documents **which test suites run in which workflows** and the
gating rules. Compartment 14 documents **what the suites test and their
baselines**. Do not duplicate fixture/baseline narratives here; cite 14 instead.

## Definition of Done

- [ ] Build and artifact pipelines are mapped end-to-end.
- [ ] CI workflow taxonomy and gates are explicit.
- [ ] Release automation chain is documented.
- [ ] Delivery risks are prioritized.
- [ ] Change-impact checklist is actionable.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 15 flipped to `done`.
