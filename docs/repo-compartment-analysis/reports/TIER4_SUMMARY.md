# Tier-4 Compartment Summary

Consolidated synthesis of the three **Tier-4 (peripheral / optional)**
compartment reports. Preserves technical depth and cross-cutting claims relevant
to Pollux. Compartment-level detail, quotes, and full evidence matrices live in
the individual reports under `reports/NN-<slug>/report.md`.

- **Commit analyzed**: `c8127045c5832b0e66cb1efd04e0dd6800ce78e7`.
- **Compartments covered**: 10, 13, 15.
- **Status**: all three `done` in `INDEX.md`.
- **Upstream producers consumed**: 01, 02, 04, 06, 07 (T1), 11, 14 (T2), 05, 09,
  12, 16 (T3).
- **Tier-4 is terminal**: no other compartments depend on T4 outputs, but Pollux
  rollout ships through all three.

---

## 1. Cross-compartment map

Tier-4 covers the **substrate Pollux must ship on and through**:

| #   | Compartment                                        | Layer               | Owns                                                                                                         | Primary artefact                                                    |
| --- | -------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 10  | Sandbox, Shell, and Filesystem Substrate           | Core + OS-specific  | `sandboxManagerFactory`, Linux/macOS/Windows managers, `ShellExecutionService`, `SandboxedFileSystemService` | `reports/10-sandbox-shell-and-filesystem-substrate/report.md`       |
| 13  | Integration Products (SDK, VS Code, A2A, DevTools) | Peripheral packages | `packages/sdk`, `packages/vscode-ide-companion`, `packages/a2a-server`, `packages/devtools`                  | `reports/13-integration-products-sdk-vscode-a2a-devtools/report.md` |
| 15  | Build, Packaging, Release, and CI                  | Scripts + workflows | `scripts/build*.js`, `esbuild.config.js`, release workflows (nightly/manual/promote/rollback), CI gates      | `reports/15-build-packaging-release-and-ci/report.md`               |

### Where T4 plugs into Pollux

```
T1 01 CLI dispatcher         → T4 13 SDK builds its own Config + GeminiClient in-process
T1 02 turn lifecycle         → T4 13 A2A's CoderAgentExecutor bypasses Turn entirely  (R-13.2)
T1 04 tool platform          → T4 10 Shell + sandboxed FS sit behind the tool layer
T3 09 policy engine          → T4 10 Sandbox managers enforce secret/governance files
T2 14 test harness           → T4 15 Integration + SEA + release workflows consume it
T3 05 /slash registries      → T4 13 A2A's registry is disjoint from CLI; VS Code companion is read-only
T3 16 generated docs         → T4 15 release workflows bump versions + regenerate schema
```

### The three "Pollux-at-ship-time" pivots at Tier-4

1. **10** — background-process history is **static** + session-keyed in
   `ShellExecutionService`; benchmark iterations reusing a `sessionId` leak
   state across runs. Benchmark fairness requires fresh sessions per iteration.
2. **13** — A2A's `CoderAgentExecutor` bypasses `Turn`/`GeminiClient`; **a
   Pollux interceptor at `GeminiClient` silently skips A2A** (synthesis SR-1
   primary contributor).
3. **15** — `test-build-binary.yml` is **workflow_dispatch-only**. There is no
   PR gate for the SEA binary path. Perf/memory/evals are nightly-only, so a
   Pollux regression is visible only the next morning (synthesis NA-9).

All three feed synthesis NA-1, NA-2, NA-9.

---

## 2. Compartment summaries

### 2.1 Compartment 10 — Sandbox, Shell, and Filesystem Substrate

**Key claim**: sandboxing is factory-dispatched per OS, disabled paths still
sanitize env vars, all file I/O routes through synthetic `__read`/`__write`
programs under a per-operation `allowedPaths` policy, and governance/secret file
protections are shared across platforms from a single source.

**Factory dispatch** (VT-10.1, `sandboxManagerFactory.ts:31-43`): when
`sandbox.enabled`, returns a platform manager (Linux / macOS / Windows);
otherwise returns `NoopSandboxManager`. The noop **still applies environment
sanitization** (`sandboxManager.ts:285-329`).

**Placeholder fail-mode** (VT-10.2, `sandboxManager.ts:334-360`):
`LocalSandboxManager` (the stub) throws
`'Tool sandboxing is not yet implemented.'` and reports every command as neither
safe nor dangerous. An unsupported platform surfaces the error **only at first
`prepareCommand` call**, not at factory time (R-10.2).

**Sandboxed file system** (VT-10.3,
`sandboxedFileSystemService.ts:50-112, 114-183`): every read/write goes through
`sandboxManager.prepareCommand` with synthetic `__read` / `__write` programs and
a per-op `allowedPaths` policy, then `child_process.spawn`. ENOENT detection
uses **stderr substring matching**, which is fragile against future wrappers
(R-10.3).

**Shell execution is a process singleton** (VT-10.4,
`shellExecutionService.ts:254-262`): `active` PTYs, child processes, and
session-keyed `backgroundProcessHistory` are all-static state.
`shellBackgroundTools.ts:45-55` reads from the same map.

**Governance + secret files shared across platforms** (VT-10.5,
`sandboxManager.ts:193-279`): `GOVERNANCE_FILES`, `SECRET_FILES`, and
`findSecretFiles` are defined once and reimported by every platform manager
(Linux/macOS/Windows managers at `linux/LinuxSandboxManager.ts:10-19` +
`windows/WindowsSandboxManager.ts:15-21`).

**Resolved guideline drift**:

- **C-10.1 (`resolved`)**: `bundle/sandbox-*.sb` listed as primary path but is
  generated at bundle/release time (`scripts/build_binary.js:281-288`), not
  tracked.
- **C-10.2 (`resolved`)**: Windows has its own
  `sandbox/windows/commandSafety.ts` separate from the shared
  `sandbox/utils/commandSafety.ts`; `sandboxManager.ts:10-17` imports both under
  aliases.

**Top risks**:

- **R-10.1 (medium)**: `backgroundProcessHistory` is static + session-keyed;
  benchmark iterations reusing a `sessionId` leak state. Suggested: fresh
  `sessionId` per iteration or a reset helper. **Relevant to synthesis SR-3.**
- **R-10.2 (low)**: unsupported platform error surfaces lazily.
- **R-10.3 (low)**: stderr-substring ENOENT detection fragile.

**Coverage gaps**:

- No cross-session `backgroundProcessHistory` isolation test (R-10.1).
- ENOENT substring heuristic untested (R-10.3).

**Pollux observation**:
`rg "pollux" packages/core/src/services/ packages/core/src/sandbox/` returns 0
matches, confirming T4 peripheral status.

### 2.2 Compartment 13 — Integration Products (SDK, VS Code, A2A, DevTools)

**Key claim**: four integration products depend on `@google/gemini-cli-core` via
three different coupling mechanisms; each product surfaces or bypasses the turn
engine differently, and A2A's executor is the **fifth Pollux entry point**
beyond the 4-driver CLI matrix.

**Product inventory and coupling** (VT-13.1, `sdk/package.json:24-28` +
`a2a-server/package.json:27-37` +
`vscode-ide-companion/src/extension.ts:12-16`):

| Product                         | Coupling                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| `packages/sdk`                  | workspace `file:../core` — builds full `Config` + `GeminiClient` in-process |
| `packages/a2a-server`           | workspace `file:../core` — own `CoderAgentExecutor` uses `@a2a-js/sdk`      |
| `packages/vscode-ide-companion` | **deep subpath import** (`@google/gemini-cli-core/src/ide/detect-ide.js`)   |
| `packages/devtools`             | **dynamic runtime load** from externalized package                          |

**Who hits the turn engine** (VT-13.2): SDK is the only product that builds a
core `Config` + `GeminiClient` in-process (`sdk/src/session.ts:38-60`). VS Code
and A2A proxy — VS Code via MCP, A2A via the `@a2a-js/sdk` executor contract.
**A2A does not go through `Turn`.**

**A2A command registry is disjoint** (VT-13.3,
`a2a-server/src/commands/command-registry.ts:14-27`): only `extensions`,
`restore`, `init`, `memory` are registered. A CLI `/pollux` command does **not**
automatically surface in A2A. **Synthesis SR-4.**

**VS Code companion contract** (VT-13.4,
`vscode-ide-companion/package.json:30-105`): activates on `onStartupFinished`.
Public contract is **4 commands, 1 custom language id, 2 keybindings, 1
configuration property**.

**DevTools** (VT-13.5, `esbuild.config.js:57-67` + `package.json:42`): loaded
dynamically by the core runtime but **externalized from the CLI bundle**. The
root bundle script orchestrates `devtools` build and `bundle:browser-mcp` core
step before esbuild runs.

**Contradictions**:

- **C-13.1 (`resolved`)**: guideline lists `packages/devtools/client/src` as
  primary; devtools ships a **pre-rendered** `client/index.html` + inlined
  `CLIENT_JS` (`devtools/package.json:18-21`).
- **C-13.2 (`unresolved`)**: VS Code companion deep-imports
  `@google/gemini-cli-core/src/ide/detect-ide.js` (deep subpath, not package
  main). Core refactors to `src/ide/*` can silently break the extension.

**Top risks**:

- **R-13.2 (high)**: A2A's `CoderAgentExecutor` bypasses
  `Turn`/`GeminiClient.sendMessageStream`; Pollux at `GeminiClient` level
  silently skips A2A. Suggested guard: Pollux rollout explicitly states "A2A not
  covered in Phase 1" **or** adds an A2A-specific interceptor. **Synthesis SR-1
  primary contributor.**
- **R-13.1 (medium)**: VS Code companion deep-imports core; no contract test
  pins the subpath. A core `ide/` refactor during Pollux work could break the
  extension without CI signal.
- **R-13.3 (low)**: DevTools loaded dynamically; core/devtools version skew
  causes runtime import failures. Lockstep version bumps enforced by
  `scripts/version.js`.
- **R-13.4 (low)**: SDK `resumeSession` filters candidates by first 8 chars of
  session id without collision warning.

**Coverage gaps**:

- No contract test for VS Code companion deep core imports (R-13.1).
- No DevTools-vs-core version-skew integration test (R-13.3).
- No A2A test asserts Pollux pathway reachable or explicitly bypassed (R-13.2).

### 2.3 Compartment 15 — Build, Packaging, Release, and CI

**Key claim**: `npm run build` does not distribute; bundling + sandbox + binary
are separate targets; four release channels share most workflows but diverge on
gating (nightly cron, promote coordinated, manual/patch/rollback separate); PR
gate is **7 checks** and does **not** include SEA binary, perf, memory, or
evals.

**Build ≠ distribution** (VT-15.1, `package.json:35-42`,
`scripts/build.js:29-79`): `npm run build` only compiles TypeScript. Actual
distribution needs `npm run bundle` (ESM), optionally `build:sandbox`, and
optionally `build:binary`.

**Bundle shape** (VT-15.2, `esbuild.config.js:57-108`): ESM at
`bundle/gemini.js`. Externalized: `@lydell/node-pty`, `@github/keytar`,
`@google/gemini-cli-devtools`. DevTools are built separately by the bundle
script chain.

**Four release channels** (VT-15.3, `.github/workflows/release-*.yml`):

| Channel   | Workflow               | Trigger                           |
| --------- | ---------------------- | --------------------------------- |
| `dev`     | (implicit, local only) | —                                 |
| `nightly` | `release-nightly.yml`  | cron                              |
| `preview` | `release-manual.yml`   | manual                            |
| `latest`  | `release-promote.yml`  | manual (coordinated with preview) |

Plus `release-rollback.yml` + `release-sandbox.yml` (both manual).

**PR gate checks** (VT-15.4, `.github/workflows/ci.yml:466-499, 344-367`): **7
checks**: `lint`, `link_checker`, `test_linux`, `test_mac`, `test_windows`,
`codeql`, `bundle_size`. **Nightly evals, perf, memory, SEA binary are NOT on
the PR gate.**

**Versioning** (VT-15.5, `scripts/version.js:35-107`): bumps root + workspace
versions; rewrites `config.sandboxImageUri` in lockstep with the root version;
refreshes `package-lock.json`.

**Contradictions**:

- **C-15.1 (`unresolved`)**: `test-build-binary.yml` is
  **workflow_dispatch-only**. The SEA binary path has no scheduled or PR gate.
- **C-15.2 (`deferred`)**: Makefile `build-all` delegates to `npm run build:all`
  which **omits `build:binary`**. The name is narrower than it sounds.

**Top risks**:

- **R-15.1 (medium)**: Pollux adds native addon / dynamic require →
  `esbuild.config.js` externals and `build_binary` native-staging need updates
  with no Pollux-aware test. Suggested: keep Pollux pure-TS and add a bundle
  smoke once `/pollux` lands.
- **R-15.3 (medium)**: perf/memory/evals not PR-gated → Pollux regression
  visible only the next morning. Suggested: make compartment-14 benchmark
  harness PR-dispatchable. **Synthesis NA-9.**
- **R-15.2 (low)**: bundle-size guard uses a 1000-byte threshold over
  `./bundle/**/*.{js,sb}`; Pollux modules could silently cross it.
- **R-15.4 (low)**: nightly release window (00:00 UTC) overlaps version-touching
  PRs; conflict risk.

**Coverage gaps**:

- No scheduled binary build (C-15.1, R-15.1).
- No perf/memory gate on PR (R-15.3).
- No Pollux-specific bundle-size baseline (R-15.2).

**Release automation observability**: Auto-created `release-failure,priority/p0`
issues on nightly/manual/ sandbox/rollback failure; `bundle_size` PR comment via
`preactjs/compressed-size-action`; nightly release PR authored by
`gemini-cli-robot`.

---

## 3. Cross-cutting themes (Tier-4)

### 3.1 Three different "entry points into the turn" + three different "release channels" compound

- 13 shows **three non-CLI entry points** (SDK, A2A, VS Code) that reach the
  core in different ways.
- 15 shows **four release channels** that bundle those entry points differently
  (nightly auto, preview manual, latest promoted, dev local).

Pollux rollout must explicitly state **which channel × which entry point** ships
Pollux first. Silence means "silently everywhere", which the SR-1 interceptor
analysis shows is false.

### 3.2 "Peripheral" compartments own Pollux's **actual** fifth driver

The synthesis integration map lists 5 drivers (legacy
interactive/non-interactive, agent-session interactive/non-interactive, ACP).
Compartment 13 R-13.2 makes the sixth explicit: **A2A's `CoderAgentExecutor`
bypasses `Turn`**. Counting A2A plus the five CLI drivers, a
`GeminiClient`-level interceptor reaches **2 of 6**.

### 3.3 Benchmark fairness bleeds into T4

- 10 R-10.1 — static background-process history leaks across iterations.
- 14 R-14.3 (T2) — no harness suppresses router/loop LLM calls.
- 15 R-15.3 — perf/memory not PR-gated.

The synthesis `BenchmarkHarness` (NA-2) consumes fairness pins from 07 §8
**plus** the sandbox neutrality recommendation from 10 OQ-10.2 (force
`sandbox.enabled=false` for A/E fairness) **plus** the PR-dispatch workflow from
15 R-15.3.

### 3.4 Version + bundle coupling is tight

- 15 VT-15.5 — `scripts/version.js` rewrites `sandboxImageUri` with root
  version.
- 13 R-13.3 — DevTools is dynamically loaded and must stay version-locked.
- 15 VT-15.2 — DevTools externalized from CLI bundle.

Any Pollux-relevant version bump implicates the sandbox image (10) and the
externalized DevTools (13). Synthesis NA-9 PR gate (`test-build-binary` on
`pollux/**` or `esbuild.config.js` change) catches only the bundle side of this;
the sandbox/image side needs a separate check.

### 3.5 No new "Pollux substrate" needed

Across all three T4 compartments, **zero `pollux` identifiers appear** in the
actual code (verified by negative `rg` in 10, 13, 15 preflight). The substrate
is ready: sandbox factory supports a new tool kind, SDK already exposes
`GeminiCliSession`, and build pipelines can accept new bundle entries via
`esbuild.config.js`. The gap is governance and wiring, not substrate.

### 3.6 Tier-4 observability signals

| Layer                | Signals                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sandbox / shell (10) | `debugLogger` in `sandboxedFileSystemService.ts` / `shellExecutionService.ts` / platform managers; per-pid background log files; `ExecutionMethod` tag on every `ExecutionResult` |
| Integration (13)     | `vscode.OutputChannel` logger; winston + `debugLogger` in A2A server; duplicate-command warnings; marketplace version-check fetch                                                 |
| Build/CI (15)        | GitHub Actions run outcomes; auto-created `release-failure,priority/p0` issues; `bundle_size` PR comment; nightly release PR                                                      |

Pollux rollout adds **no new observability pipeline** — it writes into existing
per-pid background logs, A2A debug logger (if `CoderAgentExecutor` gets an
interceptor), and bundle-size PR comment.

---

## 4. Risk heat map (Tier-4)

| Risk                                                                                                | Compartment | Severity | Pollux impact                                                                  |
| --------------------------------------------------------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------ |
| A2A `CoderAgentExecutor` bypasses `Turn` → Pollux at GeminiClient level silently skips A2A          | 13          | high     | **Synthesis SR-1 primary.** Pollux benchmarks under A2A bypass the interceptor |
| Pollux adds native addon / dynamic require → esbuild externals + binary native-staging need updates | 15          | medium   | Silent runtime failure at bundle time; no Pollux-aware test exists             |
| Perf/memory/evals nightly-only → Pollux regression visible only the next morning                    | 15          | medium   | **Synthesis NA-9.** Slow feedback slows Pollux development                     |
| VS Code companion deep-imports core; `ide/` refactor during Pollux breaks extension silently        | 13          | medium   | Contract test missing; no CI signal                                            |
| Background-process history static + session-keyed leaks across benchmark iterations                 | 10          | medium   | **Relevant to SR-3.** Baseline vs Pollux runs share leaked state               |
| `test-build-binary.yml` workflow_dispatch-only — no PR gate for SEA                                 | 15          | medium   | Pollux binary regression undetected until nightly                              |
| Bundle-size guard threshold (1000 bytes) could silently mask Pollux additions                       | 15          | low      | Pollux modules cross threshold without flag                                    |
| DevTools / core version skew causes runtime import failures                                         | 13          | low      | Release-time problem, not dev-time                                             |
| SDK `resumeSession` 8-char prefix collision                                                         | 13          | low      | Pollux-tracked session resumes to wrong session if id prefixes collide         |
| Unsupported platform sandbox error surfaces only at first `prepareCommand` call                     | 10          | low      | Pollux would hit lazy error from a tool execution, not at boot                 |
| ENOENT substring heuristic in `SandboxedFileSystemService` fragile to future wrappers               | 10          | low      | Pollux advisor reading files might lose ENOENT signal after wrapper change     |

---

## 5. Pollux-relevant design implications

Drawn from T4 contradictions + escalated open questions.

1. **Explicit Phase-1 scoping for A2A + SDK** (13 R-13.2 + 13 OQ-13.1 → NA-1):
   the synthesis per-driver interceptor matrix must include A2A's
   `CoderAgentExecutor` **and** SDK's in-process `GeminiCliSession`. Either
   state "out of scope Phase 1" or add per-entry interceptors.
2. **Contract test for VS Code deep core imports** (13 R-13.1): add a
   typecheck-only smoke test that imports the deep subpaths the companion uses.
   Prevents silent break during Pollux work on `src/ide/*`.
3. **Benchmark harness must force fresh sandbox per iteration** (10 R-10.1 + 10
   OQ-10.2 → NA-2): `sessionId` fresh per iteration; consider
   `sandbox.enabled=false` for A/E fairness (only with `NoopSandboxManager` env
   sanitization acceptable for perf numbers).
4. **Keep Pollux pure-TS for Phase 1** (15 R-15.1): bundle smoke added when
   `/pollux` command lands; defer native addon considerations to Phase 2+.
5. **Make `test-build-binary.yml` PR-dispatchable for
   `pollux/**`or`esbuild.config.js` changes\*\* (15 C-15.1 → NA-9): catches SEA
   binary regressions at PR time.
6. **Pollux-specific bundle-size baseline** (15 R-15.2): document expected
   bundle delta in the Pollux rollout PR; raise the 1000-byte threshold only
   with explicit justification.
7. **Perf/memory PR gate for Pollux PRs** (15 R-15.3 → NA-9): make
   compartment-14 `BenchmarkHarness` PR-dispatchable for PRs touching
   `packages/core/src/pollux/**`.
8. **A2A test asserting Pollux pathway** (13 R-13.2): either integration test
   exercising `CoderAgentExecutor` with a Pollux-enabled config, or an explicit
   skip with a reason tag.

---

## 6. Coverage audit

### 6.1 What Tier-4 verified

- Sandbox factory dispatch + noop env sanitization (10 VT-10.1).
- `LocalSandboxManager` lazy-throw stub (10 VT-10.2).
- `SandboxedFileSystemService` synthetic `__read`/`__write` + per-op
  `allowedPaths` (10 VT-10.3).
- `ShellExecutionService` all-static session-keyed state (10 VT-10.4).
- Shared `GOVERNANCE_FILES`/`SECRET_FILES`/`findSecretFiles` (10 VT-10.5).
- Four-product coupling inventory (13 VT-13.1).
- SDK-only in-process `GeminiClient` build; others proxy (13 VT-13.2).
- A2A command registry disjoint (13 VT-13.3).
- VS Code companion 4-command contract (13 VT-13.4).
- DevTools dynamic load + externalized bundle (13 VT-13.5).
- Build ≠ distribution (15 VT-15.1).
- Bundle externals + code-splitting (15 VT-15.2).
- Four release channels (15 VT-15.3).
- 7-check PR gate (15 VT-15.4).
- Versioning + `sandboxImageUri` lockstep (15 VT-15.5).

### 6.2 Known gaps left for synthesis

- Cross-session `backgroundProcessHistory` isolation (10 R-10.1) — synthesis
  NA-2 input.
- ENOENT substring heuristic test (10 R-10.3).
- VS Code deep core import contract test (13 R-13.1) — synthesis TG-29.
- DevTools-vs-core version-skew test (13 R-13.3) — synthesis TG-30.
- A2A Pollux-pathway reachability test (13 R-13.2) — synthesis TG-31.
- Scheduled / PR-gated binary build (15 C-15.1) — synthesis TG-32.
- Perf/memory PR gate (15 R-15.3) — synthesis TG-33, NA-9.
- Pollux-specific bundle-size baseline (15 R-15.2) — synthesis TG-34.

---

## 7. Handoff summary

Outgoing from the T4 set (producers → consumers):

- 10 → 14 (sandbox matrix feeds integration test config).
- 13 → **nobody declares dependency back** (13 `affects: []` in sidecar; it is a
  sink of 2, 4, 5, 12, 15).
- 15 → 13 (release scripts stage products), 16 (CI gates docs audit).

Incoming to the T4 set (consumers ← producers):

- 10 ← 4 (ShellTool + DiscoveredTool) + 9 (policy-gated shell).
- 13 ← 2 (core runtime) + 4 (tool platform) + 5 (skill surfaces) + 12 (JSONL /
  ACP contracts) + 15 (bundling + release scripts).
- 15 ← 4 (tool build) + 11 (telemetry bundle) + 14 (test matrix).

Open questions escalated to synthesis:

- 10 OQ-10.1 — does any advisor-driven tool plan to spawn shell commands
  bypassing `ShellExecutionService`? → 04 + 07.
- 10 OQ-10.2 — should benchmark runs force `sandbox.enabled=false`? → 14.
- 13 OQ-13.1 — does Pollux scope include A2A + SDK? → synthesis cluster A.
- 13 OQ-13.2 — VS Code companion Pollux marker? → 05 (synthesis cluster B).
- 15 OQ-15.1 — spec/plan version header? → synthesis cluster F.
- 15 OQ-15.2 — PR-gated `test-build-binary` for `pollux/**`? → synthesis NA-9.

All six land in synthesis §8 clusters A, B, D, F.

---

## 8. Reading order for synthesis

After all Tier-1..Tier-4 compartments finish:

- Read `TIER1_SUMMARY.md` first (critical path).
- Read `TIER2_SUMMARY.md` for runtime mode + context + telemetry + test
  architecture cross-cuts.
- Read `TIER3_SUMMARY.md` for extension surfaces, policy, output/ACP, and docs
  governance.
- Read `TIER4_SUMMARY.md` (this document) for substrate-level Pollux impact —
  **especially §5 items 1, 5, 7**, which feed synthesis NA-1, NA-2, and NA-9.
- Finally consult `SYNTHESIS/report.md` for the capstone view including the
  Pollux readiness table and systemic risks SR-1..SR-7.

---

## 9. Definition of Done for the Tier-4 summary

- [x] Every T4 compartment represented with its verified truths summarized.
- [x] Every T4 contradiction relevant to Pollux surfaced in §3.
- [x] Every high-severity risk replayed in §4.
- [x] Every Pollux design implication mapped to a compartment citation in §5.
- [x] Coverage gaps preserved verbatim in §6 so synthesis can pick them up.
- [x] Handoffs preserved in §7.
- [x] Reading order in §8 aligns with `POLLUX_PRIORITY.md` tiers and the
      synthesis cluster graph.
- [x] All citations follow `path:line` format; no new code quotes — readers who
      want code quotes go to the individual compartment reports.

_For the full evidence (code quotes, per-platform sandbox details, release
workflow matrices, integration-product contracts), see each compartment's
`report.md` and `report.json` under `reports/NN-<slug>/`._
