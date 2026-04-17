# Compartment Report: 15 — Build, Packaging, Release, and CI

## Metadata

- **Compartment**: 15 — Build, Packaging, Release, and CI
- **Tier**: T4
- **Guideline file**: `15-build-packaging-release-and-ci.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: c8127045c5832b0e66cb1efd04e0dd6800ce78e7
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                | Exists? | Notes (only if material)                 |
| ----------------------------------- | ------- | ---------------------------------------- |
| `package.json`                      | yes     |                                          |
| `scripts/`                          | yes     | 35+ scripts; subset relevant to delivery |
| `scripts/releasing/`                | yes     | 4 patch-release automation scripts       |
| `scripts/build.js`                  | yes     |                                          |
| `scripts/build_package.js`          | yes     |                                          |
| `scripts/build_sandbox.js`          | yes     |                                          |
| `scripts/build_binary.js`           | yes     |                                          |
| `scripts/build_vscode_companion.js` | yes     |                                          |
| `scripts/version.js`                | yes     |                                          |
| `scripts/copy_bundle_assets.js`     | yes     |                                          |
| `scripts/prepare-package.js`        | yes     |                                          |
| `scripts/prepare-npm-release.js`    | yes     |                                          |
| `scripts/prepare-github-release.js` | yes     |                                          |
| `scripts/get-release-version.js`    | yes     |                                          |
| `esbuild.config.js`                 | yes     |                                          |
| `Dockerfile`                        | yes     |                                          |
| `Makefile`                          | yes     | thin wrapper over npm scripts            |
| `.nvmrc`                            | yes     |                                          |
| `.github/workflows/`                | yes     | 43 workflow files total                  |
| `bundle/`                           | yes     | build output dir (no tracked files)      |
| `sea/`                              | yes     | `sea-launch.cjs`, `sea-launch.test.js`   |

## 1. Scope and Boundary

This compartment classifies how source becomes distributable artifacts — npm
tarballs, ESM bundle under `bundle/`, Docker sandbox image, SEA
(single-executable) binary, and the VS Code extension — and how GitHub workflows
gate PRs, run nightly suites, and orchestrate the four-channel release model
(`dev`, `nightly`, `preview`, `latest`). Root `package.json` scripts are the
single entry point; everything else is reachable from there.

Explicitly handed off: runtime test semantics (compartment 14), telemetry script
correctness (compartment 11), docs/spec drift and CODEOWNERS (compartment 16),
and integration-product contracts (compartment 13). The Pollux-specific angle is
narrow: Pollux lives inside `packages/core/src/pollux/` and rides the existing
workspace build; this report confirms "no pipeline change required" rather than
proposing new pipeline work.

## 2. Runtime Flow Summary

### Build graph from `npm run build`

1. Entry `scripts/build.js:29-31` installs deps if `node_modules` is missing.
2. `npm run generate` regenerates git-commit info via
   `scripts/generate-git-commit-info.js:1-end`.
3. CI path builds workspaces sequentially; dev path builds
   `@google/gemini-cli-core` first, then the rest in parallel via `npm-run-all`
   (`scripts/build.js:36-59`).
4. Each workspace's `build` runs `scripts/build_package.js:32` (`tsc --build`),
   then package-specific bundling (core runs `bundle:browser-mcp`), then
   `scripts/copy_files.js` and a `dist/.last_build` sentinel
   (`scripts/build_package.js:32-57`).
5. Optional sandbox image build gated by `BUILD_SANDBOX=1`
   (`scripts/build.js:69-78`).

### Bundle (`npm run bundle`) for distribution

1. `bundle` script chains `generate`, devtools build, `browser-mcp` bundle, then
   `node esbuild.config.js`, then `scripts/copy_bundle_assets.js`
   (`package.json:42`).
2. `esbuild.config.js:82-108` produces `bundle/gemini.js` (ESM, code-split,
   embedded WASM, externalized `@lydell/node-pty` + `@github/keytar` +
   `@google/gemini-cli-devtools`).
3. `esbuild.config.js:110-128` produces
   `packages/a2a-server/dist/a2a-server.mjs` in parallel; its failure does not
   fail the CLI bundle (`esbuild.config.js:137-146`).

### Binary (SEA) build

1. `scripts/build_binary.js:172-176` runs
   `npm run clean && npm install && npm run bundle` from scratch.
2. Stages + signs `@lydell/node-pty` under `bundle/native_modules`
   (`scripts/build_binary.js:183-217`).
3. Computes sha256 per chunk and writes `bundle/manifest.json` +
   `sea-config.json`, then `node --experimental-sea-config` produces
   `dist/sea-prep.blob` (`scripts/build_binary.js:222-336`).
4. `postject` injects the blob into a copy of `process.execPath`; binary is
   signed per-platform (codesign / signtool; Linux skipped)
   (`scripts/build_binary.js:414-446`).

### Sandbox image build

1. `scripts/build_sandbox.js:60-75` detects container engine; `sandbox-exec`
   short-circuits without error.
2. `npm pack -w @google/gemini-cli` and `@google/gemini-cli-core` produce
   tarballs into each package's `dist/` (`scripts/build_sandbox.js:93-111`).
3. `docker|podman build` consumes tarballs via `Dockerfile:43-50` (installs both
   globally, smoke-tests `gemini --version`).

### Release automation chain

1. Version bump: `scripts/version.js:35-107` runs `npm version` on root + each
   workspace, rewrites `sandboxImageUri`, then
   `npm install --package-lock-only`.
2. Nightly: cron `0 0 * * *` in `.github/workflows/release-nightly.yml:1-22`
   calculates version via `scripts/get-release-version.js`, runs
   `./.github/actions/run-tests` and `./.github/actions/publish-release`, then
   opens a PR via `./.github/actions/create-pull-request`
   (`release-nightly.yml:82-150`).
3. Promote: manual-only `release-promote.yml:1-50` plans `stable` + `preview` +
   next nightly in one run.
4. Manual: `release-manual.yml:1-45` accepts explicit version + npm channel
   (`dev|preview|nightly|latest`).
5. Patch: four-step chain
   `release-patch-0-from-comment → 1-create-pr → 2-trigger → 3-release`
   implemented by `scripts/releasing/*.js`.
6. Rollback: `release-rollback.yml:1-40` dispatches to move dist-tags back.
7. Verify: `verify-release.yml:1-40` smoke-tests published npm tag across
   `ubuntu|macos|windows`.

### CI gating graph

1. PR/push triggers `ci.yml:1-24` (concurrency cancels non-main runs).
2. Fanout:
   `lint → (link_checker, test_linux, test_mac, test_windows, codeql, bundle_size)`
   with a synthetic `ci` aggregator job that passes only if all non-skipped jobs
   pass (`ci.yml:466-499`).
3. Nightly suites (non-blocking): `evals-nightly.yml`, `perf-nightly.yml:1-34`,
   `memory-nightly.yml:1-34`.
4. Sandbox/binary: `release-sandbox.yml:1-50` (manual push),
   `test-build-binary.yml:1-50` (4-platform matrix).

## 3. Key Files and Citations

| Path                                    | Role                           | Notes                                        |
| --------------------------------------- | ------------------------------ | -------------------------------------------- |
| `package.json`                          | root script graph + workspaces | Single entry point for every pipeline        |
| `scripts/build.js`                      | workspace build orchestrator   | Branches CI vs dev for parallelism           |
| `esbuild.config.js`                     | CLI + a2a-server bundler       | Two parallel esbuild targets                 |
| `scripts/build_binary.js`               | SEA binary builder             | Hashes assets, signs natives, postjects blob |
| `scripts/build_sandbox.js`              | Docker/Podman image builder    | Consumes `npm pack` tarballs                 |
| `Dockerfile`                            | sandbox image definition       | node:20-slim base; installs both tarballs    |
| `scripts/version.js`                    | atomic version bump            | Keeps `sandboxImageUri` in lockstep          |
| `.github/workflows/ci.yml`              | PR/merge gate                  | lint + 3-OS test + codeql + bundle_size      |
| `.github/workflows/release-nightly.yml` | nightly publish (cron 0 0)     | Uses reusable `publish-release` composite    |
| `.github/workflows/release-promote.yml` | preview → stable promotion     | Calculates versions, coordinates 3 channels  |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-15.1** — `npm run build` does not produce distributable artifacts by
  itself; distribution requires the separate `npm run bundle` chain (esbuild +
  asset copy) plus, optionally, `build:sandbox` and `build:binary`.
  `npm run build:all` combines only the first three.
  - Primary: `package.json:35-42`
  - Supporting: `scripts/build.js:29-79` (build orchestration)
  - Confidence: high
- **VT-15.2** — The production CLI bundle is a single-entry, code-split ESM
  build at `bundle/gemini.js` with `@lydell/node-pty`, `@github/keytar`, and
  `@google/gemini-cli-devtools` externalized; `@google/gemini-cli-devtools` is
  built separately by the `bundle` script and loaded at runtime.
  - Primary: `esbuild.config.js:57-108`
  - Supporting: `package.json:42` (bundle script chains devtools build first)
  - Confidence: high
- **VT-15.3** — Four release channels exist (`dev`, `nightly`, `preview`,
  `latest`), with nightly cron-driven, preview/stable manually promoted
  together, and manual/patch/rollback paths as separate workflows.
  - Primary: `.github/workflows/release-manual.yml:14-23`
  - Supporting: `.github/workflows/release-nightly.yml:4-6`,
    `.github/workflows/release-promote.yml:38-52`,
    `.github/workflows/release-rollback.yml:14-23`
  - Confidence: high
- **VT-15.4** — The PR gate (`ci.yml` `ci` job) requires `lint`, `link_checker`,
  `test_linux`, `test_mac`, `test_windows`, `codeql`, and `bundle_size` to each
  be `success` or `skipped`; nightly evals/perf/memory are not on this gate.
  - Primary: `.github/workflows/ci.yml:466-499`
  - Supporting: `.github/workflows/ci.yml:344-367` (bundle_size PR-only)
  - Confidence: high
- **VT-15.5** — `scripts/version.js` is the only sanctioned version-bump path
  and keeps `config.sandboxImageUri` in lockstep with `version` in both the root
  and CLI `package.json`, then refreshes `package-lock.json`.
  - Primary: `scripts/version.js:35-107`
  - Confidence: high

**Contradictions or ambiguities**

- **C-15.1** — `test-build-binary.yml` is `workflow_dispatch`-only, so the SEA
  binary path (`scripts/build_binary.js`) has no scheduled or PR gate; binary
  regressions would surface only on manual runs or at release time. Evidence:
  `.github/workflows/test-build-binary.yml:1-50`. Resolution: unresolved.
- **C-15.2** — `Makefile:30-32` exposes `build-all` via `npm run build:all`, but
  `build:all` in `package.json:38` omits `build:binary`; the "build-all" name is
  narrower than it reads. Evidence: `package.json:38`, `Makefile:30-32`.
  Resolution: deferred — cosmetic.

## 5. Risks and Open Questions

**Risks**

- **R-15.1** — Pollux adds `packages/core/src/pollux/` (currently `index.ts`
  only per `packages/core/src/pollux/`); if a future Pollux module ships a
  native addon or dynamic require, `esbuild.config.js` `external` list and
  `build_binary.js` native-staging are the only places that would need updating,
  and neither is linked to a Pollux-aware test. Severity: medium. Mitigating
  test: `sea/sea-launch.test.js`, `no test` for pollux-specific staging.
  Suggested guard: keep Pollux pure-TS and re-exported from
  `packages/core/src/index.ts`; add a bundle smoke test once `/pollux` command
  lands.
- **R-15.2** — Bundle-size guard (`ci.yml:344-367`) compares
  `./bundle/**/*.{js,sb}` with a 1000-byte threshold; Pollux modules and an
  `advisor_consultation` tool shim could silently cross that bar on PR,
  producing noise or surprise blocks. Severity: low. Mitigating test:
  `.github/workflows/ci.yml:344-367`. Suggested guard: note expected bundle-size
  delta in the Pollux rollout PR description.
- **R-15.3** — Nightly suites (`evals-nightly.yml`, `perf-nightly.yml`,
  `memory-nightly.yml`) are not part of the `ci` gate; a Pollux-induced
  regression in memory/perf baselines would be visible only next morning and on
  `main`. Severity: medium. Mitigating test: `no test` at PR time. Suggested
  guard: compartment 14's benchmark harness must be runnable locally and in
  PR-dispatch mode for Pollux rollout PRs.
- **R-15.4** — `release-nightly.yml` auto-opens a PR that includes the
  `sandboxImageUri` bump; an off-schedule Pollux change that lands after a
  nightly run but before its PR merges could collide on `package.json` version
  fields. Severity: low. Mitigating test: `scripts/version.js` runs
  `npm install --package-lock-only` to re-sync lockfile. Suggested guard: do not
  land version-touching PRs between nightly start (00:00 UTC) and its PR merge.

**Open questions**

- [ ] **OQ-15.1** — Should `POLLUX_SPEC.md` and `IMPLEMENTATION_PLAN.md` carry a
      generator-populated version/date header so release PRs can bump them
      atomically (inherited from `OQ-16.1`)? Escalate to synthesis.
- [ ] **OQ-15.2** — Should `test-build-binary.yml` become PR-gated for any PR
      that touches `packages/core/src/pollux/**` or `esbuild.config.js`?
      Escalate to synthesis.

## 6. Test and Observability Coverage

- **Tests**:
  - `.github/workflows/ci.yml`: lint + Linux/Mac/Windows × (node 20/22/24) test
    matrix + bundle smoke (`node ./bundle/gemini.js --version`) + npx-tarball
    smoke.
  - `.github/workflows/test-build-binary.yml`: 4-platform SEA binary build
    (manual only).
  - `.github/workflows/verify-release.yml`: cross-OS post-publish smoke of the
    npm tag.
  - `.github/workflows/release-sandbox.yml`: sandbox image push (manual).
  - `sea/sea-launch.test.js` via `npm run test:sea-launch`: guards the SEA
    launcher shim.
- **Observability signals**: GitHub Actions run outcomes;
  `release-failure,priority/p0` issues auto-created on failed
  nightly/manual/sandbox/rollback; `bundle_size` PR comment; nightly release PR
  from `gemini-cli-robot`.
- **Coverage gaps**:
  - No scheduled binary build (C-15.1, R-15.1).
  - No perf/memory gate on PR (R-15.3).
  - No Pollux-specific bundle-size baseline yet (R-15.2).

## 7. Definition of Done

- [x] Build and artifact pipelines are mapped end-to-end.
- [x] CI workflow taxonomy and gates are explicit.
- [x] Release automation chain is documented.
- [x] Delivery risks are prioritized.
- [x] Change-impact checklist is actionable (Section 5 risks + handoffs).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row 15 flipped to `done`.

## 8. Handoffs

- **Depends on**: 4, 11, 14
- **Affects**: 13, 16, synthesis (capstone)
- **Escalated to**: synthesis — OQ-15.1 (spec version header) and OQ-15.2
  (Pollux-gated binary build).
