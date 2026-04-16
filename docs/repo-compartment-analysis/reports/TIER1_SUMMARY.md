# Tier-1 Compartment Summary

Consolidated synthesis of the five **Tier-1 (critical path)** compartment
reports. Preserves technical depth, logical step order, and all cross-cutting
claims relevant to Pollux. Compartment-level detail, quotes, and the full
evidence matrices live in the individual reports under
`reports/NN-<slug>/report.md`.

- **Commit analyzed**: `b43e7661ddaa7bbcc2283350a5eace8d2d8bb424` (02 used
  `58c7bff...` earlier in the pass; the cross-cutting claims were re-verified at
  the later SHA).
- **Compartments covered**: 01, 02, 04, 06, 07.
- **Status**: all five `done` in `INDEX.md`.

---

## 1. Cross-compartment map

Tier-1 is the critical path for understanding where a turn comes from, how it is
shaped, where models are chosen, how tools are scheduled, and what settings feed
all of it.

| #   | Compartment                         | Layer | Owns                                                                                            | Primary artefact                                            |
| --- | ----------------------------------- | ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 01  | CLI Runtime Surface                 | CLI   | Four turn drivers (ACP, interactive legacy/agent-session, non-interactive legacy/agent-session) | `reports/01-cli-runtime-surface/report.md`                  |
| 02  | Core Turn Engine                    | Core  | `GeminiClient.sendMessageStream` → `processTurn` → `Turn.run` → `GeminiChat.sendMessageStream`  | `reports/02-core-turn-engine/report.md`                     |
| 04  | Tools and MCP Platform              | Core  | Tool registry, built-in tool roster, MCP client/manager, confirmation bus                       | `reports/04-tools-and-mcp-platform/report.md`               |
| 06  | Settings Schema & Config Plumbing   | CLI   | `SETTINGS_SCHEMA`, `loadSettings`, merge order, `loadCliConfig` → `Config`                      | `reports/06-settings-schema-and-config-plumbing/report.md`  |
| 07  | Routing, Availability, Loop, Pollux | Core  | `ModelRouterService`, `ModelAvailabilityService`, `LoopDetectionService`, Pollux scaffold       | `reports/07-routing-availability-loop-and-pollux/report.md` |

### End-to-end call spine (happy path, interactive legacy)

1. CLI dispatcher `packages/cli/src/gemini.tsx:624-746` chooses a driver (01).
2. Settings resolved via `loadSettings` + `loadCliConfig` into a core `Config`
   (06).
3. Interactive driver mounts `AppContainer` → `useGeminiStream` (01). Submit
   path ends in `geminiClient.sendMessageStream(...)`.
4. `GeminiClient.sendMessageStream` fires `BeforeAgent` hook and calls
   `processTurn` (02, `client.ts:883-1039`).
5. `processTurn` runs pre-turn loop detection, context shaping, overflow gate,
   routing (07), availability re-resolution (07), then constructs a `Turn` and
   delegates to `Turn.run` (02).
6. `Turn.run` awaits `GeminiChat.sendMessageStream`; per-chunk it emits
   `Thought*`/`Content?`/`ToolCallRequest*`/`Citation?`/`Finished?` events (02).
   Token usage is captured per chunk in `GeminiChat` and per call in
   `LoggingContentGenerator` (02).
7. `ToolCallRequest` events are scheduled; `Scheduler` resolves the tool via
   `ToolRegistry`, runs `checkPolicy`, dispatches confirmation through the
   `MessageBus`, and executes via `ToolExecutor` (04).
8. Completed tool responses re-enter via `submitQuery({ isContinuation: true })`
   (01 interactive) or the `while(true)` loop (01 non-interactive); the turn
   engine decides whether `checkNextSpeaker` auto-continues (02).

---

## 2. Compartment summaries

### 2.1 Compartment 01 — CLI Runtime Surface

**Key claim**: the CLI owns **four** turn drivers, not one, and each drives
continuation and model-entry differently.

- **Dispatcher**: `packages/cli/src/gemini.tsx:624-746` picks ACP (if
  `getAcpMode()`), interactive (if `isInteractive()`), or non-interactive. Each
  sub-branch further forks on `getAgentSessionInteractiveEnabled()` /
  `getAgentSessionNoninteractiveEnabled()`.
- **Interactive legacy (`useGeminiStream`)**: consumes `ServerGeminiEventType.*`
  from `geminiClient.sendMessageStream`. Continuation is a **recursive React
  callback**: `handleCompletedTools` calls
  `submitQuery(responseParts, { isContinuation: true }, prompt_ids[0])`
  (`useGeminiStream.ts:1822-2040`).
- **Interactive agent-session (`useAgentStream`)**: subscribes to `AgentEvent`s
  from `LegacyAgentProtocol`. Continuation is owned by the protocol itself; the
  hook has known TODO stubs for loop-detection confirm, shell focus, and
  plan-mode approval (`useAgentStream.ts:82-136`).
- **Non-interactive legacy (`runNonInteractive`)**: an imperative `while (true)`
  loop over `geminiClient.sendMessageStream`, switching output between
  `OutputFormat.TEXT` / `JSON` / `STREAM_JSON` (`nonInteractiveCli.ts:297-525`).
- **Non-interactive agent-session**: uses `LegacyAgentSession.send(...)` +
  `session.stream(...)`; reconstructs typed fatal errors from
  `event._meta.errorName` (`nonInteractiveCliAgentSession.ts:348-416`).
- **ACP (`GeminiAgent.prompt`)**: bypasses both `Turn` **and**
  `GeminiClient.sendMessageStream`. It calls `chat.sendMessageStream(...)`
  directly on `GeminiChat`, runs its own router invocation, and drives its own
  tool loop (`acp/acpClient.ts:692-934`).
- **Slash-command registries are three-headed**:
  1. Interactive uses
     `[BuiltinCommandLoader, SkillCommandLoader, McpPromptLoader, FileCommandLoader]`
     (`slashCommandProcessor.ts:326-334`).
  2. Non-interactive **drops `SkillCommandLoader`**
     (`nonInteractiveCliCommands.ts:42-50`).
  3. ACP has a bespoke `CommandRegistry` (Memory, Extensions, Init, Restore,
     About, Help) in `acp/commandHandler.ts:23-32`.
- **Cancellation**: interactive uses `Escape` → `cancelOngoingRequest` + tool
  scheduler drain (`useGeminiStream.ts:806-906`); non-interactive wires
  `readline` Ctrl+C → `abortController.abort()`
  (`nonInteractiveCli.ts:117-187`); agent-session additionally calls
  `session.abort()` and rethrows `FatalCancellationError`
  (`nonInteractiveCliAgentSession.ts:560-562`).
- **No `/pollux` surface** exists in the CLI. `rg -i "pollux" packages/cli/src`
  → 0 matches.

**Risks that matter for Pollux**:

- A Pollux interceptor placed only between `GeminiClient` and `Turn` will
  **silently skip** ACP + both agent-session modes (3 of 4 drivers).
- The `rules-of-hooks` ESLint disable at `AppContainer.tsx:1186-1216`
  conditionally calls `useAgentStream` vs `useGeminiStream`. If
  `getAgentSessionInteractiveEnabled()` flips mid-session, React state corrupts.
- `handleCompletedTools` takes `prompt_ids[0]` unilaterally on continuation
  (`useGeminiStream.ts:2011-2028`). Telemetry tied to `prompt_id` is wrong for
  cross-prompt batches.

### 2.2 Compartment 02 — Core Turn Engine

**Key claim**: the turn lifecycle is a nested generator chain with two bounded
continuation loops; every invariant about "where Pollux attaches" flows through
this compartment.

**Entry and dispatch**:

- `GeminiClient.sendMessageStream` (`client.ts:883-1039`) is the public
  streaming entry. It invokes `processTurn` via `yield*`, so inner events pass
  through unchanged (Truth 1).
- `processTurn` (`client.ts:593-881`) sequences: session guardrails → context
  shaping / compression / overflow gate → IDE context injection → `Turn`
  construction → pre-turn loop detection → routing + availability → `turn.run` →
  outer event consumption with per-event loop detection and telemetry token
  update.

**Event taxonomy (per-chunk, deterministic order)** (Truth 2,
`turn.ts:272-359`):

```
Retry? → AgentExecutionStopped|Blocked?
      → (Thought* → Content? → ToolCallRequest* → Citation? → Finished?)
```

Terminal fallbacks are `UserCancelled`, `InvalidStream`, `Error`. `Finished`
carries `usageMetadata` (Truth 6).

**Two continuation loops, both capped at `MAX_TURNS = 100`** (Truth 3):

1. **InvalidStream retry** (`client.ts:820-845`) — one recursive
   `sendMessageStream(['System: Please continue.'])` on a single invalid stream,
   then logs `ContentRetryFailureEvent` and returns.
2. **Next-speaker continuation** (`client.ts:847-879`) — when no pending tools,
   not aborted, no quota error, and `checkNextSpeaker` returns `'model'`,
   recurse with `boundedTurns - 1`. Hard cap at `MAX_TURNS`
   (`client.ts:78, :936`).

**Loop detection runs twice** per turn (Truth 4):

- Pre-turn (`turnStarted`) at `client.ts:690`.
- Per-event (`addAndCheck`) at `client.ts:759`. A count of 1 triggers
  `_recoverFromLoop` (`client.ts:1248-1281`), which injects a synthetic
  system-feedback text message via recursive `sendMessageStream`. This is an
  **existing synthetic-message precedent** relevant to Pollux's "synthetic tool
  vs synthetic message" design choice.

**Routing stickiness** (Truth 5): `currentSequenceModel` is set on first turn
and re-used for subsequent turns of the same `prompt_id`. Three reset triggers
exist (new prompt id, `CoreEvent.ModelChanged`, `clearCurrentSequenceModel`).

**Token capture is already end-to-end** (Truths 6, 9):

- `GeminiChat.processStreamResponse` records per-chunk `usageMetadata` via
  `ChatRecordingService.recordMessageTokens` and updates `lastPromptTokenCount`
  (`geminiChat.ts:915-921`).
- `LoggingContentGenerator` emits `ApiResponseEvent` / `ApiErrorEvent` for every
  call, tagged with `LlmRole` (11 values today, including 7 utility roles)
  (`telemetry/llmRole.ts:7-19`, `loggingContentGenerator.ts:396-399`).

**`ContentGenerator` chain** (Truth 7): inner (`GoogleGenAI.models` |
`CodeAssistServer` | `FakeContentGenerator`) → `LoggingContentGenerator`
(always) → `RecordingContentGenerator` (optional, when
`config.recordResponses`). Built once by `createContentGenerator`
(`contentGenerator.ts:165-303`).

**Three retry layers** (Truth 8):

1. **Connection retry** via `retryWithBackoff` (client level).
2. **Mid-stream retry** via `streamWithRetries` generator inside
   `geminiChat.sendMessageStream` (4 attempts, `geminiChat.ts:89-93, :353-487`).
3. **InvalidStream recovery** — one-shot recursive continuation.

**Hooks fire four times** (Truth 10): `BeforeAgent` (outer, once) /
`BeforeModel` + `AfterModel` (per chunk) / `AfterAgent` (outer, once).
`AfterModel` can raise `AgentExecutionStopped|BlockedError`, with the block
variant optionally carrying a `syntheticResponse` that is yielded as a `CHUNK`
event.

**Compression has three outcomes** (Truth 11): `COMPRESSED` rebuilds the chat
via `startChat(newHistory, resumedData)`; `CONTENT_TRUNCATED` mutates history in
place; failure variants emit no `ChatCompressed` event.

**Pollux status at core**: `packages/core/src/pollux/index.ts` is 171 bytes of
banner + `export {};`. Zero runtime integration (Truth 12, re-confirmed in 07).

### 2.3 Compartment 04 — Tools and MCP Platform

**Key claim**: every tool invocation funnels through a single scheduler path
that owns validation, policy, confirmation, and execution. The tool layer
exposes hints, not decisions.

**Registration flow** (cold start):

1. CLI calls `Config.createToolRegistry()` (`core/config/config.ts:3481-3634`).
2. `maybeRegister(ToolClass, factory)` checks `Config.getCoreTools()` + feature
   flag per tool (Truth 4).
3. `registry.discoverAllTools()` executes `toolDiscoveryCommand` as a
   subprocess, parses `FunctionDeclaration`s from stdout (10 MB cap), and wraps
   them in `DiscoveredTool` (Truth 5, `tool-registry.ts:358-523`).
4. `McpClientManager.startConfiguredMcpServers()` iterates all servers and wraps
   discovered MCP tools in `DiscoveredMCPTool`
   (`mcp-client-manager.ts:546-588`).

**Declaration flow** (turn boundary):
`registry.getFunctionDeclarations(modelId?)` filters to active tools (plan-mode
gating, topic-narration gating, excludes), then calls `tool.getSchema(modelId)`.
A synthetic `wait_for_previous: boolean` parameter is injected into every
declaration (Truth 2, `tools.ts:538-565`).

**Invocation flow** (one call):

1. Scheduler resolves the tool via `registry.getTool(name)` (legacy-alias aware,
   Truth 15).
2. `_validateAndCreateToolCall` runs `tool.build(args)`; schema failure →
   `ToolErrorType.INVALID_TOOL_PARAMS`.
3. `_processValidatingCall` runs hook-before and
   `checkPolicy(toolCall, config, subagent)`. `DENY` → `POLICY_VIOLATION`;
   `ASK_USER` → `invocation.shouldConfirmExecute()` dispatches
   edit/exec/mcp/info/ ask_user/sandbox_expansion confirmation details.
4. After approval, `ToolExecutor.execute()` wraps `invocation.execute(...)` in
   `executeToolWithHooks(...)`; errors normalize through one path to
   `ToolErrorType.UNHANDLED_EXCEPTION` (Truth 12).

**MCP specifics**:

- Names are sanitized to `mcp_<server>_<tool>` with a 63-char cap, middle `...`
  truncation if needed (Truth 6). Collision risk noted in C-04.5.
- Discovery passes three independent gates: admin allow/block, user enable
  (session + file), folder trust (Truth 7, `mcp-client-manager.ts:415-437`).
- Per-server filtering: `excludeTools` first, then `includeTools` (Truth 8).
- Errors return `functionResponse.response.error.isError = true` rather than
  throwing (Truth 9, `mcp-client.ts:1369-1425`).
- Content block transforms: `text`, `image`, `audio`, `resource`,
  `resource_link` → Gemini `Part[]`; unknown types dropped (Truth 14).

**Confirmation system**:

- The `MessageBus` carries `TOOL_CONFIRMATION_REQUEST`/`_RESPONSE` with
  correlation IDs; 30 s timeout defaults to `ask_user`; abort → `deny` (Truth
  13, `tools.ts:278-371`).
- `BaseToolInvocation.shouldConfirmExecute` short-circuits in `AUTO_EDIT` mode
  **only** for tools that pass `respectsAutoEdit=true` (Truth 10). Today that is
  exactly `EditTool` + `WriteFileTool`; all other `Kind.Edit` tools (tracker
  family) do **not** get the fast path — contradicts the impression given by
  `ApprovalMode` docs (C-04.3).
- Persistent policy updates are owned by the scheduler's `updatePolicy`
  (`scheduler.ts:669-678`). The tool layer only advertises
  `getPolicyUpdateOptions` hints (`commandPrefix`, `mcpName`, `toolName`,
  `argsPattern`, `allowRedirection`) (Truth 11).

**Dual approval surfaces**: `DiscoveredMCPToolInvocation.allowlist` is a
**static class-level `Set<string>`** parallel to the persistent policy engine
(C-04.2, R-04.5). The allowlist uses dotted separator `server.tool` while the
policy engine uses `server_tool` (C-04.7).

**Key risks**:

- Discovered-tool JSON parsing accepts three shapes (`function_declarations`,
  `functionDeclarations`, bare `FunctionDeclaration`) with no schema validation
  (R-04.1).
- `DiscoveredToolInvocation` treats **any** stderr as failure regardless of exit
  code (R-04.4, C-04.4).
- 30 s confirmation timeout defaults to `ask_user` — safe for interactive
  drivers, unsafe for non-interactive (R-04.3).
- MCP transport fallback (HTTP → SSE → OAuth in `mcp-client.ts:1841+`) can
  surface the wrong failure message (R-04.7).

### 2.4 Compartment 06 — Settings Schema and Config Plumbing

**Key claim**: CLI owns the schema, merge, validation, and migration. Core is a
**pure consumer** of `ConfigParameters`. The spec's attribution of settings to
`config.ts` is ambiguous; runtime behavior is unambiguous.

**Runtime flow**:

1. CLI calls `loadSettings(workspaceDir)` (`settings.ts:643-650`). Results are
   memoised in a 10-second TTL cache keyed on absolute workspace path (Truth 10,
   `settings.ts:622-625`).
2. Four file scopes are resolved by `Storage` helpers: `~/.gemini/settings.json`
   (user), `system-defaults.json` + platform-specific system path (admin),
   `<cwd>/.gemini/settings.json` (workspace) — **skipped when `cwd == home`** to
   avoid treating the home directory as a project (Truth 5,
   `settings.ts:719-725`, `storage.ts:158-163`).
3. Each file passes `fs.readFileSync` → `stripJsonComments` → `JSON.parse` →
   `validateSettings` (Zod, warnings-only — Truth 4).
4. `resolveEnvVarsInObject` interpolates `${ENV}` values; an `originalSettings`
   clone is kept pre-resolution for save round-trip fidelity (C-06.5 resolved:
   intended).
5. Trust is computed **twice** — once on a preliminary pre-merge, then on the
   final merge — to break the cyclic "trust depends on settings; workspace
   settings depend on trust" dependency (Truth 14, `settings.ts:752-771`).
6. `mergeSettings` runs `customDeepMerge` in precedence **schemaDefaults <
   systemDefaults < user < safeWorkspace < system** (Truth 2,
   `settings.ts:247-273`). Untrusted workspace → `{}`.
7. Legacy theme names (`VS`, `VS2015`) are rewritten (`settings.ts:741-750`).
8. `LoadedSettings.computeMergedSettings` re-applies the admin overlay on top
   every time `setRemoteAdminSettings` runs. File-based `admin.*` values are
   **silently discarded** (Truth 3, `settings.ts:365-390`).
9. `migrateDeprecatedSettings` + `migrateExperimentalSettings` rewrite legacy
   keys on load; system-scope migrations emit warnings rather than rewriting
   read-only files (Truth 13).
10. `loadCliConfig` composes parsed argv + env + settings into a
    `ConfigParameters` object and calls `new Config(params)`
    (`cli/config/config.ts:520-1026`). Core never reads settings files (Truth
    9).

**Schema is the source of truth** (Truth 1, 8, 11, 12):

- `SETTINGS_SCHEMA` in `settingsSchema.ts` is declared
  `as const satisfies SettingsSchema`. `Settings` and `MergedSettings` are
  compile-time generated from `typeof SETTINGS_SCHEMA`.
- `schemas/settings.schema.json` (IDE autocompletion) is **generated** by
  `scripts/generate-settings-schema.ts`; it is not a runtime input.
- `customDeepMerge` supports four strategies (`REPLACE`, `CONCAT`, `UNION`,
  `SHALLOW_MERGE`) chosen per path by `getMergeStrategyForPath`.
- Zod schema is built from the JSON schema at module load, so adding a block is
  picked up automatically.

**Pollux status at settings** (Truth 15):
`rg -i "pollux" packages/cli/src/config schemas` → 0 matches. No settings block
exists.

**Top risks** (06):

- **ConfigParameters drift** (R-06 high): adding a field in core without wiring
  in `loadCliConfig` is silent — TypeScript tolerates `undefined` on optionals.
- **`mergeStrategy` change on an existing array key** (R-06 high): flipping
  `UNION ↔ CONCAT` silently changes merged values with no type break.
- **`BrowserAgentCustomConfig` drift** between core (manual type) and CLI schema
  (manual object) (R-06 medium, C-06.3). No programmatic check.
- **`admin.*` in user/system files** passes Zod but is dropped at merge
  (C-06.4). No warning.
- **`SettingPaths`** (`cli/config/settingPaths.ts`) looks like a dotted-key
  registry but holds one constant (C-06.2). Latent trap on rename.

**Recipe for a new block** (from §B of the full report): declare in
`SETTINGS_SCHEMA` with defaults + `mergeStrategy`, regenerate
`schemas/settings.schema.json` + `docs/get-started/configuration.md`, add
validation + merge tests, extend `ConfigParameters`, map in `loadCliConfig`
respecting **argv > env > settings > default**, feature-flag under
`experimental.*` first and migrate to a top-level block once stable.

### 2.5 Compartment 07 — Routing, Availability, Loop, Pollux

**Key claim**: routing + availability + loop-detection are interleaved across a
single `processTurn` call. The router is a fixed seven/eight-link chain of
responsibility; the loop detector can fire up to two extra LLM calls per turn
starting at turn 30. Pollux is a stub.

**Execution order inside `processTurn`** (Truths 1–7):

1. Pre-turn loop detection (`client.ts:690`).
2. `RoutingContext` assembled from history + request + signal + requested model
   (`client.ts:709-714`).
3. If `currentSequenceModel` set → reuse; else
   `config.getModelRouterService().route(routingContext)` (`client.ts:722-724`).
4. Composite chain runs, in order:
   `FallbackStrategy → OverrideStrategy → ApprovalModeStrategy → [GemmaClassifierStrategy]? → ClassifierStrategy → NumericalClassifierStrategy → DefaultStrategy`
   (`modelRouterService.ts:39-67`, Truth 2). Non-terminal strategies may return
   `null` to defer; the terminal always returns.
5. `applyModelSelection(...)` re-resolves the model through the availability
   service on every turn (Truth 4, `client.ts:727-742`).
6. First turn yields `ModelInfo`; sticky is set.
7. Per-event loop detection inside the outer `for await`.

**Routing can fire one extra LLM call per prompt** (Truth 3):

- `ClassifierStrategy` and `NumericalClassifierStrategy` both call
  `baseLlmClient.generateJson(...)` with `role: LlmRole.UTILITY_ROUTER` against
  `classifier` (→ `gemini-2.5-flash-lite`).
- `GemmaClassifierStrategy` uses a local LiteRT client (no API cost but
  CPU/latency).

**Fallback exists in two independent paths** (Truth 6):

- `FallbackStrategy` (pre-call, inside the router) consults
  `ModelAvailabilityService.snapshot` and re-routes if the requested model is
  terminal.
- `handleFallback` (post-failure, from `retryWithBackoff`'s `onPersistent429`)
  re-selects on 429/terminal, can call `fallbackModelHandler` (user prompt) and
  `config.activateFallbackMode`, which emits `CoreEvent.ModelChanged` and clears
  stickiness via `GeminiClient.handleModelChanged` (`client.ts:121, :129-131`).

**Availability service state** (Truth 5): `terminal` is permanent for the
process; `sticky_retry.consumed` is cleared by `resetTurn()`, which fires from
`sendMessageStream` at `client.ts:892-894` (so it resets at the top of every
user prompt, not every turn of a recursion).

**Loop detection is two-tier** (Truths 7, 8):

- **Heuristic (0 calls)**: tool-call loops at 5 consecutive identical calls;
  content loops at 10 same-hash 50-char chunks within ≤ 5×chunkSize average
  distance.
- **LLM (0–2 calls)**: starts after `LLM_CHECK_AFTER_TURNS = 30`; Flash check on
  alias `'loop-detection'`; if confidence ≥ 0.9 **and** the double-check model
  is available, a second call against `'loop-detection-double-check'` →
  `gemini-3-pro-preview` (`defaultModelConfigs.ts:197-202`). If Pro is
  unavailable, Flash result is returned as-is.

**Supported model universe** (Truth 9): `VALID_GEMINI_MODELS` holds eight
identifiers (`gemini-2.5-{pro,flash,flash-lite}` + five Gemini 3/3.1 preview
variants). Aliases `auto`, `pro`, `flash`, `flash-lite`, `auto-gemini-3`,
`auto-gemini-2.5` resolve contextually.

**Pollux scaffold is a stub** (Truth 10): `packages/core/src/pollux/index.ts` is
171 bytes (banner + `export {};`), `benchmark/` is empty. Negative search
`rg "pollux|Pollux|POLLUX" packages` returns only the scaffold banner itself.

**Router exception fallback** (Truth 12, C-07.2): on a composite-strategy throw,
`modelRouterService.ts:105-113` returns
`{ model: config.getModel(), source: 'router-exception' }` **without consulting
availability**. The subsequent `applyModelSelection` in `processTurn`
compensates on first turn, but because sticky turns skip the router entirely, a
future refactor removing the post-check could surface an unhealthy model.

**`experimentalDynamicModelConfiguration`** (Truth 13) rewires both availability
and the whole router layer by switching from static chains (`policyCatalog.ts`)
to `modelChains`/`modelIdResolutions` in `defaultModelConfigs.ts`.

**Documentation gap** (Truth 11, C-07.3): `docs/cli/model-routing.md` omits
`ClassifierStrategy`, `NumericalClassifierStrategy`, and `ApprovalModeStrategy`.
A user reading the doc would not know that `--model auto` triggers a remote
classifier call.

---

## 3. Cross-cutting themes

### 3.1 Pollux is not implemented

Across 01, 02, 06, 07:

- No `/pollux` slash command (01).
- No advisor client, no interceptor, no logger, no benchmark runner in
  `packages/core/src/pollux/` (02, 07).
- No settings block in `SETTINGS_SCHEMA` and no `schemas/settings.schema.json`
  entry (06).
- Runtime-reachable files under `pollux/`: exactly one stub `index.ts`.

Every compartment recorded this independently, so the baseline is consistent.

### 3.2 Four turn drivers = four Pollux surfaces

The biggest invariant violation in `POLLUX_SPEC.md` §3 is the phrase "CLI
unchanged". 01 shows four distinct drivers; 02 shows that only one of them goes
through `GeminiClient` + `Turn`:

| Driver                        | Core entrypoint                                   | Intercept surface                    |
| ----------------------------- | ------------------------------------------------- | ------------------------------------ |
| Interactive legacy            | `GeminiClient.sendMessageStream` → `Turn.run`     | `processTurn` per-event `yield`      |
| Interactive agent-session     | `LegacyAgentProtocol` → `LegacyAgentSession.send` | Agent-session stream                 |
| Non-interactive legacy        | `GeminiClient.sendMessageStream` → `Turn.run`     | `processTurn` per-event `yield`      |
| Non-interactive agent-session | `LegacyAgentSession.send` / `session.stream`      | Agent-session stream                 |
| ACP (`GeminiAgent.prompt`)    | `GeminiChat.sendMessageStream` **directly**       | ACP's own `while (nextMessage)` loop |

A Pollux interceptor that only hooks the `GeminiClient → Turn` seam covers **2
of 5**. Benchmarks run through only one driver are not comparable. Recommended:
a single seam inside `GeminiChat.sendMessageStream` (spec currently forbids
touching `GeminiChat` — C-02.4 argues the stronger constraint is "do not mutate
`.history` externally", which this wouldn't violate).

### 3.3 Existing synthetic-message precedent predates Pollux's proposal

Spec §10.5 proposes synthetic tools. Runtime already injects synthetic
**messages** (not tool results) at two sites (Truth 02.4, C-02.6):

1. `_recoverFromLoop` (`client.ts:1262-1280`) — recursive
   `sendMessageStream(feedbackText)`.
2. Next-speaker continuation (`client.ts:867-877`) — recursive
   `sendMessageStream("Please continue.")`.

A synthetic tool result is strictly heavier (requires tool registration,
"available-but-not-callable" gating, and per-driver plumbing). Synthetic
messages re-use the full existing machinery.

### 3.4 Token capture is already end-to-end; a new `pollux/logger.ts` is duplicative

Spec §5 proposes a new logger. Compartment 02 Truth 6 + 9 shows:

- `LoggingContentGenerator` emits per-call `ApiResponseEvent`/ `ApiErrorEvent`
  with prompt/candidate tokens tagged by `LlmRole` on every LLM call (including
  routing and loop-detection utility calls).
- `ChatRecordingService.recordMessageTokens` persists per-chunk `usageMetadata`
  to the on-disk conversation file.

Compartment 07 confirms routing + loop-detector tokens flow through the same
pipe. Recommended (C-02.2): add one `LlmRole.UTILITY_ADVISOR` value and re-use
existing telemetry; do **not** add a parallel logger.

### 3.5 Single-model baseline is false; benchmark fairness needs explicit pins

The repo fires multiple utility roles per turn (`UTILITY_COMPRESSOR`,
`UTILITY_SUMMARIZER`, `UTILITY_ROUTER`, `UTILITY_LOOP_DETECTOR`,
`UTILITY_NEXT_SPEAKER`, `UTILITY_EDIT_CORRECTOR`, `UTILITY_AUTOCOMPLETE`,
`UTILITY_FAST_ACK_HELPER`). 02 (C-02.3) and 07 (C-07.1) both flagged this. 07
Step 8 gives the concrete fairness pin list: non-auto model on
`OverrideStrategy`, disable Gemma/numerical/plan routing, disable loop detection
via `config.getDisableLoopDetection()=true`, reset availability, avoid
`experimentalDynamicModelConfiguration`, and capture `LlmRole`-tagged token
usage as truth.

### 3.6 Dual approval surfaces in the tool layer

04 C-04.2 / R-04.5 flag a **static class-level `Set<string>`** for MCP
allowlisting that parallels the policy engine's persistent rules. The separators
differ (`server.tool` vs `server_tool`, C-04.7). Long-running sessions can drift
between the two. Consolidation is a compartment-09 decision, escalated.

### 3.7 Silent gaps and ESLint disables

- `AppContainer.tsx:1186-1216` — `react-hooks/rules-of-hooks` disabled;
  conditional `useAgentStream` vs `useGeminiStream`. Safe today only because the
  flag is effectively mount-time (01 risk).
- `acp/acpClient.ts:937-956` — `parts: Part[]` arg unused via ESLint disable (01
  ambiguity 4).
- `useGeminiStream.ts:1514-1518` — exhaustive `never` switch on
  `ServerGeminiEventType`. Adding a new event kind without updating this switch
  AND `nonInteractiveCli.ts:322-398` breaks the interactive shell (01 risk 2 —
  the forensic report's Risk 1).
- Non-interactive `SkillCommandLoader` omission (01 VT-6) vs interactive —
  silent divergence; escalated to compartment 05.
- Discovered-tool "any stderr = failure" (04 C-04.4) — invisible failure mode
  for tools that write progress to stderr.

### 3.8 Sticky-routing blind spots

- `currentSequenceModel` stickiness reset has three triggers; no dedicated test
  asserts they are comprehensive (02 R-02.2). A benchmark that mixes executor
  and Pro in the same session can corrupt.
- Mid-prompt availability transitions that do **not** emit
  `CoreEvent.ModelChanged` are invisible to the router (07 R-07.1).
- `_recoverFromLoop`'s recursive call is unmetered against `boundedTurns` in
  tests (02 coverage gap).

---

## 4. Risk heat map (selected high-severity)

| Risk                                                                                      | Compartment | Severity | Pollux impact                                                            |
| ----------------------------------------------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------ |
| Interceptor placed in one driver misses ACP + 2 agent-session drivers                     | 01          | high     | Benchmarks + real users under those drivers bypass Pollux                |
| Event-ordering regressions in `processTurn` for-await loop                                | 02          | high     | Any new Pollux event type desyncs `loopDetector.addAndCheck`             |
| Loop-detection Pro double-check can cost a full Pro prompt at turn 30+                    | 07          | high     | Destroys token budget of Condition A (Flash-only) benchmark              |
| `ConfigParameters` field added in core without `loadCliConfig` wiring                     | 06          | high     | Pollux settings silently defaulted to `undefined`                        |
| `mergeStrategy` flip on existing array key silently rewrites user data                    | 06          | high     | Any `pollux.routes` / similar regression is invisible                    |
| Exhaustive `never` switch over `ServerGeminiEventType` in CLI hook + non-interactive loop | 01          | high     | Adding a Pollux event kind without updating both crashes the shell       |
| Static MCP allowlist parallels the policy engine                                          | 04          | medium   | Pollux policy shifts may be ignored by the static in-memory list         |
| Router "exception fallback" skips availability                                            | 07          | medium   | Future refactor removing post-`applyModelSelection` exposes bug          |
| `prompt_ids[0]` unilateral adoption on continuation                                       | 01          | medium   | Pollux `prompt_id`-keyed telemetry becomes wrong on mixed batches        |
| `DiscoveredToolInvocation` treats any stderr as failure                                   | 04          | medium   | Advisor tooling that writes progress to stderr is falsely marked bad     |
| `AppContainer` rules-of-hooks bypass                                                      | 01          | medium   | Toggling agent-session mid-session corrupts React state                  |
| Non-interactive `SkillCommandLoader` omission                                             | 01          | low      | `/pollux` command (if authored as a skill) silently unavailable headless |

---

## 5. Pollux-relevant design implications

Drawn verbatim from the compartment contradictions; all are spec-level open
questions.

1. **Interceptor seam**: must run either inside `GeminiChat` (forbidden by spec
   but architecturally minimal), or at the `yield event` seam of `processTurn`
   per driver (replicated code), or inside a router/model decorator that every
   driver must use. Without (a) or (c), ACP and agent-session drivers are
   bypassed. Decision deferred.
2. **Event injection shape**: synthetic message (existing precedent, cheap) vs
   synthetic tool result (spec's preferred "natural" shape, heavier). Both are
   live decisions; prefer synthetic message if feasible (C-02.6).
3. **Token logger**: extend `LlmRole` with `UTILITY_ADVISOR` and reuse
   `LoggingContentGenerator` + `ChatRecordingService`. Do not add
   `pollux/logger.ts`. (C-02.2.)
4. **Benchmark fairness**: apply 07 Step 8 pins verbatim. Any deviation corrupts
   token numbers for conditions A–E in `POLLUX_SPEC.md:398`.
5. **Settings block**: feature-flag under `experimental.pollux` first, migrate
   to top-level `pollux.*` once stable (mirrors `experimental.plan` →
   `general.plan` pattern). Follow 06 Appendix B recipe end-to-end (schema →
   validation → merge tests → `ConfigParameters` → `loadCliConfig` → accessor →
   docs generator).
6. **`/pollux` surface**: decide between `BuiltinCommandLoader` (available
   everywhere but agent-session + ACP omit/rewrite surfaces differently) or a
   dedicated extension under skills (02 non-interactive gap). Escalated to
   compartments 05 / 16.
7. **Advisor model alias**: register `advisor` in `defaultModelConfigs.ts` with
   a contextual mapping (e.g., `gemini-2.5-flash-lite` for cheap path,
   `gemini-3-pro-preview` for deep path). Avoid dynamic model selection inside
   the interceptor.
8. **Spec phrasing fixes** needed in `POLLUX_SPEC.md`:
   - §3 "CLI unchanged" — false; four/five drivers, three command registries.
   - §3/§7 "single interceptor between `GeminiClient` and `Turn`" — covers at
     most 2 of 5 drivers.
   - §10.5 "Wire interceptor into `client.ts` at `processTurn()`" —
     underspecified; must be "between `turn.run` event emission and the
     `yield event` at `client.ts:773`" if per-event, or "around `processTurn`"
     if per-turn.
   - §615-618 "Don't touch `GeminiChat` directly" — too absolute; the real
     constraint is "do not mutate `GeminiChat.history` externally".

---

## 6. Coverage audit

### 6.1 What Tier-1 verified

- Dispatcher mode selection (01 VT-1, VT-10).
- Interactive continuation recursion vs non-interactive `while` loop (01 VT-2,
  VT-3).
- Three disjoint output-format paths (01 VT-4).
- ACP bypass of `Turn` + `GeminiClient` (01 VT-5).
- Three slash-command registries with loader differences (01 VT-6, VT-7, VT-13).
- Dual cancellation paths (01 VT-8).
- Turn entry + `yield*` pass-through (02 T1).
- Deterministic per-chunk event order (02 T2).
- Two continuation loops capped at `MAX_TURNS=100` (02 T3).
- Two-site loop detection + recovery injection precedent (02 T4).
- Routing sticky per prompt_id, three reset triggers (02 T5).
- Two-layer token capture (02 T6).
- Decorator chain for `ContentGenerator` (02 T7).
- Three retry layers (02 T8).
- `LlmRole` end-to-end through Turn → Chat → CG → telemetry (02 T9).
- Four-point hook surface; `AfterModel` can stop/block mid-stream (02 T10).
- Three compression outcomes (02 T11).
- No runtime Pollux integration (02 T12, 07 T10, 06 T15, 01 VT-9).
- `sessionTurnCount` is session-scoped (02 T13).
- Every tool validates schema on `build()` (04 T1).
- Registry owns declaration + `wait_for_previous` injection (04 T2).
- Plan-mode + excludes live in the registry (04 T3).
- Canonical registration site is `Config.createToolRegistry()` (04 T4).
- DiscoveredTool subprocess path with 10 MB caps (04 T5).
- MCP FQN sanitization + truncation (04 T6).
- MCP three-gate discovery (04 T7).
- MCP exclude-before-include filter (04 T8).
- MCP errors as `isError:true` parts, not thrown (04 T9).
- AUTO_EDIT fast-path only for `respectsAutoEdit=true` tools (04 T10).
- Persistent policy updates owned by scheduler (04 T11).
- Errors normalized through a single `tool-executor` path (04 T12).
- Confirmation bus correlation + 30 s timeout (04 T13).
- MCP content block transforms (04 T14).
- Legacy alias normalization on lookup + excludes (04 T15).
- CLI is canonical settings owner (06 T1, T9).
- Merge precedence schemaDefaults < systemDefaults < user < safeWorkspace <
  system (06 T2).
- Admin is remote-only overlay (06 T3).
- Validation failures are warnings, fatal reserved for IO/parse (06 T4).
- Workspace skip when `cwd == home` (06 T5).
- Path resolution through `Storage` + `paths.ts` only (06 T6, T7).
- Types inferred from the schema (06 T8).
- `loadSettings` 10 s TTL cache (06 T10).
- Four merge strategies (06 T11).
- Generated JSON schema (06 T12).
- Idempotent migrations with system-scope warnings (06 T13).
- Trust resolved twice (06 T14).
- Routing entrypoint + stickiness (07 T1).
- Composite chain of 7-8 strategies (07 T2).
- Up to one extra LLM call per prompt (07 T3).
- Sticky re-resolved via `applyModelSelection` every turn (07 T4).
- Availability service health map (07 T5).
- Two independent fallback paths (07 T6).
- Two-tier loop detection (07 T7, T8).
- Eight supported Gemini identifiers + aliases (07 T9).
- Router exception fallback skips availability (07 T12).
- `experimentalDynamicModelConfiguration` rewires router + availability (07
  T13).

### 6.2 Known gaps left for Tier-2+

- ACP `commandHandler` has one test (01).
- No cross-driver invariant test for event-type handling (01).
- `handleFinalSubmit` steering-hint branch untested (01).
- `_recoverFromLoop` feedback text + turn accounting untested (02).
- `currentSequenceModel` sticky-reset across all three triggers (02 R-02.2).
- `updateTelemetryTokenCount` on error-path events (02 R-02.3).
- IDE context double-injection across aborted turn (02 R-02.4).
- `AgentExecutionStoppedError` with synthetic response (02 R-02.5).
- Chat rebuild + telemetry span lifecycle (02 R-02.6) — cross-cuts 11.
- Discovered-tool malformed JSON / stderr-on-success (04 R-04.1, R-04.4).
- MCP name truncation collisions (04 R-04.2).
- Confirmation-bus timeout in non-interactive drivers (04 R-04.3).
- Static MCP allowlist cross-session persistence (04 R-04.5).
- Plan-mode description rewrite (04 R-04.6).
- Invariant test walking `ConfigParameters` ↔ `loadCliConfig` binding (06).
- Cross-process cache invalidation for `loadSettings` (06 R).
- Generator-drift enforcement in CI (`schema:settings --check`) (06 R).
- `BrowserAgentCustomConfig` parity with CLI schema (06 C-06.3).
- `CompositeStrategy` non-terminal exception path (07 R-07.3).
- Router exception fallback path when `DefaultStrategy` throws (07 C-07.2).
- Full `handleFallback → activate → emit → reroute` integration (07).
- Loop-detection LLM-call token-budget cap (07 R-07.2).
- `getResolvedClassifierThreshold` direct coverage (07).
- Pollux everything (01–07).

---

## 7. Handoff summary

Outgoing from the T1 set (producers → consumers):

- 01 → 02 (consumes event schema and `GeminiClient.sendMessageStream`), 04
  (consumes `Scheduler`), 06 (consumes mode flags), 07 (ACP + legacy routers
  call into routing differently).
- 02 → 01 (stream-event semantics), 04 (`ToolCallRequest` → scheduler), 07
  (`ModelRouterService.route`), 11 (telemetry), 03 (agent-session boundary).
- 04 → 02 (tool `build`/`getSchema` impact model-visible set), 09 (policy
  hints), 10 (sandbox), 11 (`ToolCall` spans), 12 (Part[] shape).
- 06 → 01, 04, 09, 05, 15, 16 (every consumer that reads settings or relies on
  the generator artefact).
- 07 → 02 (routing seam), 06 (feature flags), 11 (routing events), 14 (benchmark
  fairness pins), 16 (docs gaps).

Incoming to the T1 set:

- 07 ← 02 (turn lifecycle).
- 04 ← 02 (scheduler), 06 (feature flags), 05 (hooks), 09 (policy engine).
- 02 ← none (base compartment).
- 06 ← 07, 02 (consume resolved `Config`).
- 01 ← 02, 04, 06 (all the core pieces it orchestrates).

Open questions escalated (for T2+ and synthesis):

- Skills loader omission in non-interactive mode (01 → 05).
- Is `getAgentSessionInteractiveEnabled()` mount-time-only (01 → 06)?
- ACP `handleCommand` multimodal parts (01 → 12).
- Which driver does Pollux instrument first (01 → 02, 07)?
- `prompt_ids[0]` behavior (01 → 11).
- `/pollux` surface placement (01 → 05, 16).
- Advisor injection site inside turn stream (02 → 03, 07).
- Chain re-resolution after sequential fallbacks (07 → 14).
- Selective disable for LLM loop check (07 → 14).
- `experimentalDynamicModelConfiguration` + `classifier` alias (07 → 06).
- MCP dual-approval consolidation (04 → 09).
- `Session`-scope settings contract (06 → 05).
- CI gate for `schema:settings --check` (06 → 15).
- Docs auto-regeneration policy (06 → 16).

---

## 8. Reading order for Tier-2+

Agents picking up T2/T3/T4 should read this summary first, then read the
specific T1 report(s) their compartment depends on:

- **03 Agent Runtime and Modes** → 01 (agent-session drivers) + 02.
- **05 Extensibility (Skills/Hooks/Commands)** → 01 (loader divergence) + 04
  (hook wrap on `invocation.execute`) + 06 (`Session` scope).
- **08 Context / Memory / Compression** → 02 (compression outcomes) + 06
  (settings).
- **09 Policy, Trust, Safety** → 04 (tool layer + static MCP allowlist) + 06
  (`policyPaths`, `adminPolicyPaths`).
- **10 Sandbox / Shell / Filesystem** → 04 (ShellTool, DiscoveredTool) + 06
  (`Storage`).
- **11 Telemetry / Observability / Billing** → 02 (token capture + `LlmRole`)
  - 07 (routing/loop events).
- **12 Output Protocol / ACP** → 01 (driver-specific emission paths).
- **13 Integration Products (SDK, VS Code, A2A, DevTools)** → 06 (separate a2a
  settings path) + 01 (ACP).
- **14 Testing / Evaluation** → 07 Step 8 fairness pins + 02 (sticky / telemetry
  lifecycle gaps).
- **15 Build / Packaging / Release / CI** → 06 (generator drift) + 15 gate for
  schema.
- **16 Docs / Specs / Governance** → 06 generator + 07 doc gap.

---

## 9. Definition of Done for the Tier-1 summary

- [x] Every T1 compartment represented with its verified truths summarised.
- [x] Every T1 contradiction relevant to Pollux surfaced in §3.
- [x] Every high-severity risk replayed in §4.
- [x] Every Pollux design implication mapped to a compartment citation in §5.
- [x] Coverage gaps preserved verbatim in §6 so T2+ can pick them up.
- [x] Handoffs preserved in §7.
- [x] Reading order in §8 aligns with `POLLUX_PRIORITY.md` tiers.
- [x] All citations follow `path:line` format; no new code was quoted here —
      readers who want code quotes go to the individual compartment reports.

_For the full evidence (code quotes, per-tool risks, migration recipes,
benchmark control details), see each compartment's `report.md` and `report.json`
under `reports/NN-<slug>/`._
