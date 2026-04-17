# Compartment Report: 13 — Integration Products (SDK, VS Code, A2A, DevTools)

## Metadata

- **Compartment**: 13 — Integration Products (SDK, VS Code Companion, A2A,
  DevTools)
- **Tier**: T4
- **Guideline file**: `13-integration-products-sdk-vscode-a2a-devtools.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: c8127045c5832b0e66cb1efd04e0dd6800ce78e7
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                   | Exists? | Notes (only if material)                                                               |
| ------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------- |
| `packages/sdk/package.json`                            | yes     | `@google/gemini-cli-sdk`; `main: dist/index.js`                                        |
| `packages/sdk/README.md`                               | yes     |                                                                                        |
| `packages/sdk/SDK_DESIGN.md`                           | yes     |                                                                                        |
| `packages/sdk/src/index.ts`                            | yes     | Re-exports agent/session/tool/skills/types                                             |
| `packages/sdk/src/agent.ts`                            | yes     | `GeminiCliAgent.session()` / `resumeSession()`                                         |
| `packages/sdk/src/session.ts`                          | yes     | `GeminiCliSession` wraps core `Config` + `GeminiClient`                                |
| `packages/sdk/src/{tool,skills,fs,shell,types}.ts`     | yes     |                                                                                        |
| `packages/vscode-ide-companion/package.json`           | yes     | `gemini-cli-vscode-ide-companion`; `main: ./dist/extension.cjs`                        |
| `packages/vscode-ide-companion/src/extension.ts`       | yes     | Activates on `onStartupFinished`                                                       |
| `packages/vscode-ide-companion/src/ide-server.ts`      | yes     | MCP server over streamable HTTP transport                                              |
| `packages/vscode-ide-companion/src/diff-manager.ts`    | yes     | Backs `gemini.diff.accept` / `gemini.diff.cancel` commands                             |
| `packages/a2a-server/package.json`                     | yes     | `@google/gemini-cli-a2a-server`; `bin: dist/a2a-server.mjs`                            |
| `packages/a2a-server/src/http/server.ts`               | yes     | Entry point; invokes `main()` from `app.ts`                                            |
| `packages/a2a-server/src/http/app.ts`                  | yes     | Express + `A2AExpressApp` wiring + CoderAgent card                                     |
| `packages/a2a-server/src/agent/executor.ts`            | yes     | `CoderAgentExecutor` implementing `@a2a-js/sdk` executor contract                      |
| `packages/a2a-server/src/commands/command-registry.ts` | yes     | Registers Extensions/Restore/Init/Memory only                                          |
| `packages/devtools/package.json`                       | yes     | `@google/gemini-cli-devtools`; provides `bundle:browser-mcp` asset to core             |
| `packages/devtools/src/index.ts`                       | yes     | WS + HTTP DevTools viewer (console/network logs)                                       |
| `packages/devtools/src/types.ts`                       | yes     |                                                                                        |
| `packages/devtools/client/src`                         | no      | guideline path; devtools ships pre-rendered client in `client/index.html` + inlined JS |

## 1. Scope and Boundary

This compartment classifies the four publishable integration products that
consume `@google/gemini-cli-core`: the programmatic SDK, the VS Code companion
extension, the A2A (Agent-to-Agent) HTTP server, and the DevTools
console/network viewer. It maps public contracts, lifecycle assumptions, and
shared coupling points so a change in core does not silently break any of them.

Explicitly handed off: core turn internals (compartment 02), output/ACP protocol
contracts used by CLI (compartment 12), and build/release pipeline for these
packages (compartment 15). Pollux is explicitly non-goal here (spec §2) and
confirmed by zero `pollux` references in
`packages/{sdk,vscode-ide-companion,a2a-server,devtools}/**`; only
`packages/core/src/pollux/index.ts` exists. This report therefore documents what
must not regress rather than what must change.

## 2. Runtime Flow Summary

### SDK product

1. Entry: `packages/sdk/src/index.ts:7-11` re-exports `agent`, `session`,
   `tool`, `skills`, `types`.
2. `new GeminiCliAgent(options)` stores options and produces a
   `GeminiCliSession` via `agent.session()` or `resumeSession(id)`:
   `packages/sdk/src/agent.ts:19-30`.
3. Session construction builds a full core `Config` (memory, tools, skills,
   resumedData) and lazily obtains a `GeminiClient` on first use:
   `packages/sdk/src/session.ts:38-60`.
4. Session resumption reads from `Storage.getProjectTempDir()/chats/*`, filtered
   by the first 8 chars of the session id: `packages/sdk/src/agent.ts:39-73`.
5. SDK "platform" wires: `SdkAgentFilesystem` (`fs.ts`), `SdkAgentShell`
   (`shell.ts`), `SdkTool` (`tool.ts`) — these are SDK-facing adapters over
   core's tool + FS + shell subsystems.

### VS Code companion

1. Activation: `onStartupFinished` in
   `packages/vscode-ide-companion/package.json:30-32`.
2. `extension.ts` detects IDE surface (skips self-update in Firebase Studio /
   Cloudshell managed surfaces):
   `packages/vscode-ide-companion/src/extension.ts:22-60`.
3. `IDEServer` starts an Express app that hosts a `@modelcontextprotocol/sdk`
   `McpServer` over `StreamableHTTPServerTransport`, bound to
   `GEMINI_CLI_IDE_SERVER_PORT`:
   `packages/vscode-ide-companion/src/ide-server.ts:14-40`.
4. `DiffManager` provides the `gemini-diff` scheme + the `gemini.diff.accept` /
   `gemini.diff.cancel` commands declared in `package.json:49-67`.
5. Contributions: four commands, one custom language id
   (`gemini-diff-editable`), two keybindings (`ctrl+s` / `cmd+s` when
   `gemini.diff.isVisible`), one setting (`gemini-cli.debug.logging.enabled`):
   `packages/vscode-ide-companion/package.json:33-105`.

### A2A server

1. Entry: `packages/a2a-server/src/http/server.ts:1-35` calls `main()` from
   `app.ts` (standalone node binary `gemini-cli-a2a-server` bundled to
   `dist/a2a-server.mjs` by root `esbuild.config.js:110-128`).
2. `app.ts` composes Express + `A2AExpressApp` (from
   `@a2a-js/sdk/server/express`) + `DefaultRequestHandler` +
   `InMemoryTaskStore`/`GCSTaskStore`:
   `packages/a2a-server/src/http/app.ts:7-34`.
3. Advertises an `AgentCard` at name `Gemini SDLC Agent`, URL defaulting to
   `http://localhost:41242/`: `packages/a2a-server/src/http/app.ts:43-50`.
4. Command surface is separate from CLI: `CommandRegistry` registers
   `ExtensionsCommand`, `RestoreCommand`, `InitCommand`, `MemoryCommand` only —
   no `/pollux` here:
   `packages/a2a-server/src/commands/command-registry.ts:14-27`.
5. Turn execution: `CoderAgentExecutor` implements the `@a2a-js/sdk` executor
   contract and drives tasks; persistence optionally via `GCSTaskStore`:
   `packages/a2a-server/src/agent/executor.ts`.

### DevTools

1. DevTools is loaded by the core runtime on demand: `esbuild.config.js:57-67`
   externalizes `@google/gemini-cli-devtools`; the root `bundle` script chains
   `npm run build --workspace=@google/gemini-cli-devtools` and
   `bundle:browser-mcp -w @google/gemini-cli-core` before the CLI bundle
   (`package.json:42`).
2. `DevToolsViewer` spins an HTTP + WebSocket server on a random port, serving
   an inlined `INDEX_HTML`/`CLIENT_JS` plus `/api` endpoints:
   `packages/devtools/src/index.ts:32-40`.
3. Session binding: one `SessionInfo { sessionId, ws, lastPing }` per
   connection; the WS side receives console + network log payloads typed via
   `packages/devtools/src/types.ts`.

## 3. Key Files and Citations

| Path                                                   | Role                     | Notes                                         |
| ------------------------------------------------------ | ------------------------ | --------------------------------------------- |
| `packages/sdk/src/index.ts`                            | SDK public barrel        | 5 re-exported subjects                        |
| `packages/sdk/src/session.ts`                          | SDK session runtime      | Owns core `Config` + `GeminiClient` lifecycle |
| `packages/sdk/src/types.ts`                            | SDK public type surface  | `GeminiCliAgentOptions`, `SessionContext`, …  |
| `packages/vscode-ide-companion/package.json`           | extension manifest       | Activation + command + keybinding contract    |
| `packages/vscode-ide-companion/src/ide-server.ts`      | MCP-over-HTTP IDE bridge | Uses `@modelcontextprotocol/sdk`              |
| `packages/a2a-server/src/http/app.ts`                  | A2A HTTP entrypoint      | AgentCard + task store selection              |
| `packages/a2a-server/src/agent/executor.ts`            | CoderAgent executor      | Turn driver for A2A                           |
| `packages/a2a-server/src/commands/command-registry.ts` | A2A command registry     | Disjoint from CLI command registry            |
| `packages/devtools/src/index.ts`                       | DevTools WS/HTTP viewer  | Loaded at core runtime (esbuild external)     |
| `packages/devtools/src/types.ts`                       | DevTools wire types      | `NetworkLog`, `ConsoleLogPayload`             |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-13.1** — All four products depend on `@google/gemini-cli-core` directly —
  SDK and A2A as workspace `file:../core`, VS Code companion via a deep subpath
  import `@google/gemini-cli-core/src/ide/detect-ide.js`, and DevTools
  indirectly via the core runtime loader.
  - Primary: `packages/sdk/package.json:24-28`
  - Supporting: `packages/a2a-server/package.json:27-37`,
    `packages/vscode-ide-companion/src/extension.ts:12-16` (deep import)
  - Confidence: high
- **VT-13.2** — The SDK is the only product that builds a core `Config` +
  `GeminiClient` in-process; VS Code companion and A2A-server do not invoke
  `GeminiClient.sendMessageStream` at all — they proxy through MCP (VS Code) or
  the A2A executor contract (A2A).
  - Primary: `packages/sdk/src/session.ts:38-60`
  - Supporting: `packages/vscode-ide-companion/src/ide-server.ts:13-30` (MCP
    server), `packages/a2a-server/src/agent/executor.ts` (executor contract)
  - Confidence: high
- **VT-13.3** — The A2A command registry is disjoint from the CLI command
  registry and registers only `extensions`, `restore`, `init`, `memory`; any
  Pollux `/pollux` slash command in CLI will not automatically reach the A2A
  surface.
  - Primary: `packages/a2a-server/src/commands/command-registry.ts:14-27`
  - Confidence: high
- **VT-13.4** — VS Code companion activates on `onStartupFinished`, exposes four
  commands, one custom language id, two keybindings, and one configuration
  property; these form the stable external contract gated by the VS Code
  Marketplace.
  - Primary: `packages/vscode-ide-companion/package.json:30-105`
  - Confidence: high
- **VT-13.5** — DevTools is consumed by the core runtime but externalized from
  the CLI bundle; the root `bundle` script orchestrates a DevTools build and a
  `bundle:browser-mcp` core step before esbuild runs, so skipping any one step
  produces a broken CLI bundle.
  - Primary: `esbuild.config.js:57-67`
  - Supporting: `package.json:42` (bundle chain)
  - Confidence: high

**Contradictions or ambiguities**

- **C-13.1** — The guideline lists `packages/devtools/client/src` as a primary
  path, but devtools ships a pre-rendered `client/index.html` and inlines
  `CLIENT_JS` at `packages/devtools/src/index.ts:16`; no `client/src/` exists.
  Evidence: pre-flight plus `packages/devtools/package.json:18-21`
  (`files: ["dist","client/index.html"]`). Resolution: resolved — guideline path
  was optimistic.
- **C-13.2** — VS Code companion imports from
  `@google/gemini-cli-core/src/ide/detect-ide.js` (deep subpath, not the
  package's `main`) — breaks the "consume via package API only" contract; future
  core reshuffles of `src/ide/*` silently break the extension. Evidence:
  `packages/vscode-ide-companion/src/extension.ts:12-16`. Resolution:
  unresolved.

## 5. Risks and Open Questions

**Risks**

- **R-13.1** — VS Code companion's deep subpath imports of core
  (`@google/gemini-cli-core/src/ide/*`) are not covered by any contract test, so
  a core refactor of `ide/` during the Pollux work could break the extension's
  build without a CI signal. Severity: medium. Mitigating test:
  `packages/vscode-ide-companion/src/*.test.ts` (exists but does not pin the
  subpath import). Suggested guard: add a typecheck-only smoke test that imports
  those subpaths.
- **R-13.2** — A2A's `CoderAgentExecutor` bypasses
  `Turn`/`GeminiClient.sendMessageStream` (see compartment 02 handoff note in
  `INDEX.md:40`); if Pollux is integrated only at `GeminiClient`-level (spec §3
  architecture), A2A sessions will silently skip Pollux. Severity: high (for
  Pollux feature parity, low for A2A stability). Mitigating test:
  `packages/a2a-server/src/agent/executor.test.ts`. Suggested guard: Pollux
  rollout plan must state "A2A not covered in Phase 1" explicitly, tracked in
  synthesis.
- **R-13.3** — DevTools is loaded dynamically by core via the externalized
  `@google/gemini-cli-devtools`; a version skew between published
  `@google/gemini-cli-core` and `@google/gemini-cli-devtools` (both at
  `0.39.0-nightly.*` today) would cause runtime import failures. Severity: low.
  Mitigating test: `sea/sea-launch.test.js` smokes the bundle, not a real core +
  devtools load. Suggested guard: lockstep version bumps are already enforced by
  `scripts/version.js`; document the coupling in release notes.
- **R-13.4** — SDK's `resumeSession` filters by the first 8 chars of the session
  id; collisions on that prefix fall back to scanning all sessions but without
  any explicit error if multiple match. Severity: low. Mitigating test:
  `packages/sdk/src/session.test.ts`. Suggested guard: log an explicit warning
  when candidates > 1.

**Open questions**

- [ ] **OQ-13.1** — Does the Pollux rollout scope include A2A sessions (via
      `CoderAgentExecutor`) and the SDK (via `GeminiCliSession`)? Escalate to
      synthesis — likely "Phase 2+, not Phase 1".
- [ ] **OQ-13.2** — Should the VS Code companion add a visible marker when a
      `/pollux`-enabled CLI is connected through its MCP bridge? Escalate to
      compartment 05 (extensibility/UI marker).

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/sdk/src/{session,tool}.test.ts`,
    `packages/sdk/src/{agent,tool,skills}.integration.test.ts`: unit +
    integration coverage of SDK surface.
  - `packages/vscode-ide-companion/src/{extension,ide-server,open-files-manager}.test.ts`:
    extension activation + MCP bridge + open-files tracking.
  - `packages/a2a-server/src/**/*.test.ts` (13 files): command registry,
    executor, HTTP endpoints, GCS persistence, task lifecycle.
  - DevTools: no dedicated test suite in-tree; exercised only via core runtime
    integrations.
- **Observability signals**: `vscode.OutputChannel` logger from `extension.ts`;
  `winston` logger + `debugLogger` in A2A server; `debugLogger` warnings in
  `CommandRegistry.register`; VS Code Marketplace version-check fetch in
  `extension.ts:45-55`.
- **Coverage gaps**:
  - No contract test for VS Code companion's deep core imports (R-13.1).
  - No DevTools-vs-core version-skew integration test (R-13.3).
  - No A2A test that asserts Pollux pathway is reachable or explicitly bypassed
    (R-13.2, OQ-13.1).

## 7. Definition of Done

- [x] All integration products have independent architecture summaries (Section
      2).
- [x] Public contracts are explicitly inventoried (Section 2 + VS Code
      manifest + A2A AgentCard + SDK `types.ts`).
- [x] Shared dependencies and coupling are mapped (VT-13.1, VT-13.5, C-13.2).
- [x] Compatibility risks are ranked (Section 5).
- [x] Product hardening guidance is actionable (R-13.1…R-13.4 suggested guards).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row 13 flipped to `done`.

## 8. Handoffs

- **Depends on**: 2, 4, 5, 12, 15
- **Affects**: synthesis (capstone)
- **Escalated to**: synthesis — OQ-13.1 (A2A/SDK Pollux scope); 05 — OQ-13.2 (VS
  Code Pollux marker).
