# Compartment Report: 01 — CLI Runtime Surface

## Metadata

- **Compartment**: 01 — CLI Runtime Surface
- **Guideline file**: `01-cli-runtime-surface.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: `b43e7661ddaa7bbcc2283350a5eace8d2d8bb424`
- **Upstream base commit**: unknown (upstream remotes not inspected)

## 0. Pre-flight

Path validation results from `AGENT_RUNBOOK.md` Step B.

| Path                                                | Exists? | Notes                                                                                          |
| --------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `packages/cli/src/interactiveCli.tsx`               | yes     | 229 lines; Ink `render()` entrypoint and provider stack                                        |
| `packages/cli/src/nonInteractiveCli.ts`             | yes     | 483 lines; legacy `GeminiEventType` loop over `geminiClient.sendMessageStream`                 |
| `packages/cli/src/nonInteractiveCliAgentSession.ts` | yes     | 569 lines; `LegacyAgentSession`-based path, reached via feature flag                           |
| `packages/cli/src/ui/AppContainer.tsx`              | yes     | 2618 lines; decides `useGeminiStream` vs `useAgentStream`; wires slash/hint                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`      | yes     | 1962 lines; canonical interactive stream consumer + tool continuation                          |
| `packages/cli/src/ui/hooks/useAgentStream.ts`       | yes     | 478 lines; AgentProtocol-based stream consumer; ~partial feature parity                        |
| `packages/cli/src/commands`                         | yes     | 73 files; CLI-subcommand modules (NOT the slash-command surface)                               |
| `packages/cli/src/acp`                              | yes     | 18 files; ACP agent surface                                                                    |
| `packages/cli/src/acp/acpClient.ts`                 | yes     | 1928 lines; `GeminiAgent` class, owns its own tool-call continuation loop                      |
| `packages/cli/src/acp/commandHandler.ts`            | yes     | 121 lines; ACP-only slash-command parser (distinct from CLI `SlashCommandResolver`)            |
| `packages/cli/src/services/SlashCommandResolver.ts` | yes     | 229 lines; conflict resolution between built-in/skill/MCP/file loaders                         |
| `packages/cli/src/services/CommandService.ts`       | yes     | 125 lines; loader-driven aggregator used by interactive + non-interactive                      |
| `packages/cli/src/nonInteractiveCliCommands.ts`     | yes     | Added by analyst — non-interactive `handleSlashCommand` (used by both non-interactive entries) |
| `packages/cli/src/gemini.tsx`                       | yes     | Added by analyst — top-level dispatcher (ACP vs interactive vs non-interactive)                |

All guideline-listed paths exist. The analyst added
`nonInteractiveCliCommands.ts` and `gemini.tsx` to the table because they are
load-bearing for the compartment but were not explicitly listed in Primary
paths. The guideline refers to `packages/cli/src/services/` but only
`SlashCommandResolver.ts` and `CommandService.ts`; loaders
(`BuiltinCommandLoader`, `FileCommandLoader`, `SkillCommandLoader`,
`McpPromptLoader`) resolve under the same directory.

## 1. Scope and Boundary

In scope (from guideline):

- interactive shell lifecycle,
- input pipelines and slash command processing,
- stream consumption and UI state transitions,
- non-interactive / headless execution and output behavior,
- ACP client command handling surfaces.

Out of scope (handoff):

- core turn internals (compartment 02 — `packages/core/src/core`),
- tool execution internals (compartment 04 — `packages/core/src/tools`),
- policy engine internals (compartment 09 — `packages/core/src/policy`).

Boundaries the guideline assumes but does not name explicitly:

- **CLI owns four different turn drivers** (interactive legacy, interactive
  agent-session, non-interactive legacy, non-interactive agent-session, ACP).
  Each has its own continuation loop, cancellation model, and output formatter.
  Claims of "CLI unchanged" in `POLLUX_SPEC.md` §3 only hold for the _first_ of
  these.
- **CLI decides which core entrypoint each mode calls.** Interactive legacy +
  non-interactive legacy call `geminiClient.sendMessageStream(...)`.
  Agent-session modes call `LegacyAgentSession.send(...)` /
  `AgentProtocol.send(...)`. ACP bypasses both and calls
  `chat.sendMessageStream(...)` (i.e. `GeminiChat` directly). This affects
  Pollux's "single interceptor" assumption.

## 2. Runtime Flow Summary

Top-level dispatcher in `packages/cli/src/gemini.tsx`:

1. **ACP mode** — if `config.getAcpMode()` is true, CLI hands control to
   `runAcpClient` (`gemini.tsx:624-626`).
2. **Interactive mode** — if `config.isInteractive()`, CLI calls
   `startInteractiveUI` (`gemini.tsx:648-665`), which mounts the Ink React tree
   in `interactiveCli.tsx:56-233`.
3. **Non-interactive mode** — otherwise, CLI reads stdin (optionally) and calls
   `runNonInteractive` (`gemini.tsx:670-746`). `runNonInteractive` internally
   dispatches to the agent-session variant when
   `config.getAgentSessionNoninteractiveEnabled()` returns true
   (`nonInteractiveCli.ts:62-65`).

### Interactive legacy (useGeminiStream)

1. `interactiveCli.startInteractiveUI` wraps `AppContainer` in Ink providers and
   calls `render()` (`interactiveCli.tsx:102-170`).
2. `AppContainer` decides between agent-session and legacy:
   `config.getAgentSessionInteractiveEnabled() ? useAgentStream(...) : useGeminiStream(...)`
   (`AppContainer.tsx:1178-1216`). Note the ESLint disable on the rules-of-hooks
   violation at 1187/1195 — both hooks are lexically reachable behind a runtime
   branch.
3. The active hook exposes `submitQuery` + a rich state bag (`streamingState`,
   `pendingToolCalls`, `cancelOngoingRequest`, etc.) consumed throughout the
   shell (`AppContainer.tsx:1218-1237`).
4. Submission path: `handleFinalSubmit` (`AppContainer.tsx:1368-1444`)
   arbitrates slash commands, steering hints, permissions, and normal queries,
   then calls `submitQuery(submittedValue)`.
5. `submitQuery` runs `prepareQueryForGemini` (slash-command interception,
   shell-mode routing, `@`-command expansion), then starts
   `geminiClient.sendMessageStream(...)` and iterates it via
   `processGeminiStreamEvents` (`useGeminiStream.ts:1551-1749`).
6. `processGeminiStreamEvents` consumes
   `ServerGeminiEventType.{Thought, Content, ToolCallRequest, UserCancelled, Error, AgentExecutionStopped, AgentExecutionBlocked, ChatCompressed, MaxSessionTurns, ContextWindowWillOverflow, Finished, Citation, ModelInfo, LoopDetected, Retry, InvalidStream}`
   and buffers `ToolCallRequest`s until stream end
   (`useGeminiStream.ts:1426-1528`).
7. After the stream, tool requests are handed to `scheduleToolCalls`
   (`useGeminiStream.ts:1526`), which queues them in `useToolScheduler`. When
   the batch completes, `handleCompletedTools` (`useGeminiStream.ts:1822-2040`)
   takes their `responseParts` and calls
   `submitQuery(responseParts, { isContinuation: true }, prompt_ids[0])` — i.e.
   the continuation loop is _recursive via React callbacks_, not an imperative
   `while` loop.
8. Cancellation: `Escape` key triggers `cancelOngoingRequest` which aborts the
   controller and drains `cancelAllToolCalls` (`useGeminiStream.ts:806-906`).
9. Loop-detection: the stream sets `loopDetectedRef.current = true`
   (`useGeminiStream.ts:1505-1509`); after the stream ends, a confirmation
   dialog offers to disable session-level loop detection and retry
   (`useGeminiStream.ts:1658-1692`).

### Interactive agent-session (useAgentStream)

1. `AppContainer` constructs
   `new LegacyAgentProtocol({ config, getPreferredEditor })` when
   `config.getAgentSessionInteractiveEnabled()` is true
   (`AppContainer.tsx:1178-1184`, core type `AgentProtocol` imported 1181).
2. `useAgentStream` subscribes to the protocol's `AgentEvent`s
   (`useAgentStream.ts:309-312`).
3. Submission path: `submitQuery(query, options, _prompt_id)` calls
   `agent.send({ message: { content: parts }})` (`useAgentStream.ts:314-353`).
   Unlike `useGeminiStream`, there is **no `isContinuation` branch inside
   `submitQuery`** — continuation is owned by the `AgentProtocol` itself (i.e.
   inside core's `LegacyAgentSession.send`).
4. Event handling dispatches on `event.type` ∈ `agent_start` / `agent_end` /
   `message` / `tool_request` / `tool_update` / `tool_response` / `error` /
   (no-op: `initialize`, `session_update`, `elicitation_*`, `usage`, `custom`)
   (`useAgentStream.ts:138-307`). Tool grouping is handled by a React
   `useEffect` that pushes tools into history when their status becomes terminal
   (`useAgentStream.ts:376-434`).
5. Known parity gaps explicitly flagged in code:
   - `loopDetectionConfirmationRequest` is a stubbed empty state — no
     confirmation dialog parity (`useAgentStream.ts:110-112`).
   - Shell focus / background tasks / `activePtyId` are hard-coded defaults
     (`useAgentStream.ts:82-92`).
   - `handleApprovalModeChange` is a debug-log stub for plan mode
     (`useAgentStream.ts:130-136`).

### Non-interactive legacy (runNonInteractive)

1. `promptIdContext.run(prompt_id, ...)` wraps the entire invocation
   (`nonInteractiveCli.ts:69`).
2. Stdin raw mode is set up with a keypress listener for Ctrl+C →
   `abortController.abort()` (`nonInteractiveCli.ts:117-187`).
3. Slash-command interception delegates to
   `nonInteractiveCliCommands.handleSlashCommand`. **This path does NOT include
   `SkillCommandLoader`** (`nonInteractiveCliCommands.ts:42-50`), whereas
   interactive does (`slashCommandProcessor.ts:326-334`).
4. At-command expansion via `handleAtCommand` (`nonInteractiveCli.ts:264-283`).
5. A `while (true)` loop iterates turns; each turn creates
   `geminiClient.sendMessageStream(...)` and consumes events identical to the
   interactive event set, but writes directly to stdout/stderr in one of three
   modes:
   - `OutputFormat.TEXT` (default): stream text via `TextOutput` with optional
     `stripAnsi` (`nonInteractiveCli.ts:322-341`).
   - `OutputFormat.JSON`: buffer text into `responseText` and flush a single
     `JsonFormatter` document at the end (`nonInteractiveCli.ts:335, 514-519`).
   - `OutputFormat.STREAM_JSON`: emit discrete
     `JsonStreamEventType.{INIT, MESSAGE, TOOL_USE, TOOL_RESULT, ERROR, RESULT}`
     events live
     (`nonInteractiveCli.ts:102-105, 236-244, 285-293, 327-351, 413-431, 482-488, 505-513`).
6. Continuation is imperative: after the stream ends with
   `toolCallRequests.length > 0`, a local `Scheduler` runs them, records
   completed tool calls via
   `geminiClient.getChat().recordCompletedToolCalls(model, completedToolCalls)`
   (`nonInteractiveCli.ts:454-462`), and re-enters the loop with
   `currentMessages = [{ role: 'user', parts: toolResponseParts }]`
   (`nonInteractiveCli.ts:502-524`).
7. Early termination: `STOP_EXECUTION` tool error short-circuits the loop
   (`nonInteractiveCli.ts:466-500`); `AgentExecutionStopped` event returns
   immediately (`nonInteractiveCli.ts:373-392`).

### Non-interactive agent-session (nonInteractiveCliAgentSession)

1. Same outer shell (stdin-raw Ctrl+C, console patcher, stream formatter) as
   `nonInteractiveCli.ts`.
2. Instantiates
   `new LegacyAgentSession({ client, scheduler, config, promptId })`
   (`nonInteractiveCliAgentSession.ts:291-296`) and calls `session.send(...)`
   then iterates `session.stream({ streamId })`
   (`nonInteractiveCliAgentSession.ts:308-422`).
3. Event type space is the `AgentEvent` union (`message`, `tool_request`,
   `tool_response`, `error`, `agent_end`, `initialize`, `session_update`,
   `agent_start`, `tool_update`, `elicitation_*`, `usage`, `custom`) —
   **different** from the legacy `GeminiEventType` union.
4. Fatal errors are _reconstructed from `event._meta.errorName`_ via
   `reconstructFatalError` (`nonInteractiveCliAgentSession.ts:348-416`) because
   core's agent-event stream does not carry typed error instances across the
   protocol boundary.

### ACP (GeminiAgent.prompt)

1. `runAcpClient` wires stdin/stdout to an
   `acp.AgentSideConnection(GeminiAgent, stream)` (`acpClient.ts:92-114`).
2. `GeminiAgent.prompt` aborts any pending prompt, intercepts text that starts
   with `/` or `$` as a command, and delegates to `CommandHandler.handleCommand`
   (`acpClient.ts:692-745`, `commandHandler.ts:45-57`). **ACP has its own
   command registry** (`Memory`, `Extensions`, `Init`, `Restore`, `About`,
   `Help`) separate from the CLI `BuiltinCommandLoader`.
3. If not a command, a `while (nextMessage !== null)` loop calls
   `router.route(...)` then
   `chat.sendMessageStream({ model }, parts, promptId, signal, LlmRole.MAIN)`
   directly — **not** `geminiClient.sendMessageStream` and not `Turn.run()`
   (`acpClient.ts:759-828`).
4. Function calls are collected from `StreamEventType.CHUNK.value.functionCalls`
   and executed one-by-one via `runTool`; responses are fed back as the next
   `nextMessage` (`acpClient.ts:825-827, 901-910`).
5. Session updates are published via `acp.sessionUpdate` (`agent_message_chunk`,
   `agent_thought_chunk`, etc.) (`acpClient.ts:810-822`,
   `acpClient.ts:948-951`).

## 3. Key Files and Citations

| Path                                                     | Role                                                       | Notes                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/cli/src/gemini.tsx`                            | top-level dispatcher (ACP / interactive / non-interactive) | `gemini.tsx:624-746`                                       |
| `packages/cli/src/interactiveCli.tsx`                    | Ink render host and context providers                      | `interactiveCli.tsx:56-233`                                |
| `packages/cli/src/nonInteractiveCli.ts`                  | legacy non-interactive loop (GeminiEventType)              | `nonInteractiveCli.ts:59-541`                              |
| `packages/cli/src/nonInteractiveCliAgentSession.ts`      | agent-session non-interactive loop (AgentEvent)            | `nonInteractiveCliAgentSession.ts:61-625`                  |
| `packages/cli/src/nonInteractiveCliCommands.ts`          | non-interactive slash-command processor                    | excludes `SkillCommandLoader`                              |
| `packages/cli/src/ui/AppContainer.tsx`                   | interactive orchestration shell                            | stream-hook branch 1178-1216; submit arbitration 1368-1444 |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | legacy interactive stream consumer                         | stream switch 1426-1528; continuation 1822-2040            |
| `packages/cli/src/ui/hooks/useAgentStream.ts`            | agent-session interactive stream consumer                  | subscribe 309-312; submit 314-353                          |
| `packages/cli/src/ui/hooks/slashCommandProcessor.ts`     | interactive slash-command processor                        | `slashCommandProcessor.ts:321-346` loaders                 |
| `packages/cli/src/services/CommandService.ts`            | loader-driven aggregator                                   | `CommandService.ts:44-60`                                  |
| `packages/cli/src/services/SlashCommandResolver.ts`      | command-name conflict resolution                           | rules 40-79                                                |
| `packages/cli/src/services/BuiltinCommandLoader.ts`      | built-in slash-command definitions                         | imports 21-63 enumerate commands                           |
| `packages/cli/src/acp/acpClient.ts`                      | ACP `GeminiAgent` runtime                                  | `prompt` 692-934; `handleCommand` 937-956                  |
| `packages/cli/src/acp/commandHandler.ts`                 | ACP slash-command parser (distinct registry)               | registry 23-32                                             |
| `packages/cli/src/ui/hooks/useGeminiStream.test.tsx`     | behavioral tests                                           | 31+ test cases                                             |
| `packages/cli/src/nonInteractiveCli.test.ts`             | behavioral tests                                           | 30+ test cases                                             |
| `packages/cli/src/nonInteractiveCliAgentSession.test.ts` | behavioral tests                                           | 30+ test cases                                             |
| `packages/cli/src/ui/hooks/useAgentStream.test.tsx`      | behavioral tests                                           | 7 test cases                                               |
| `packages/cli/src/acp/acpClient.test.ts`                 | behavioral tests                                           | 20+ test cases                                             |
| `packages/cli/src/services/SlashCommandResolver.test.ts` | behavioral tests                                           | 15+ test cases                                             |

## 4. Verified Truths

### VT-1: CLI has four distinct turn-driving code paths, not one

- **Truth**: the CLI entrypoint dispatches to one of four runtime drivers (ACP
  `GeminiAgent.prompt`, interactive legacy `useGeminiStream`, interactive
  agent-session `useAgentStream`, non-interactive legacy `runNonInteractive`,
  non-interactive agent-session `runNonInteractive` →
  `runNonInteractiveAgentSession`). Each drives tool-call continuation
  differently and calls a different core entrypoint.
- **Primary**: `packages/cli/src/gemini.tsx:624-746` (mode dispatch),
  `packages/cli/src/nonInteractiveCli.ts:59-65` (agent-session fork),
  `packages/cli/src/ui/AppContainer.tsx:1178-1216` (interactive stream-hook
  branch).
- **Supporting**: `packages/cli/src/ui/hooks/useAgentStream.test.tsx:35-206`
  (test), `packages/cli/src/nonInteractiveCli.test.ts:101-627` (test),
  `packages/cli/src/nonInteractiveCliAgentSession.test.ts:103-681` (test),
  `packages/cli/src/acp/acpClient.test.ts:143-610` (test).
- **Confidence**: high.
- **Quote**:

```1178:1216:packages/cli/src/ui/AppContainer.tsx
  const streamAgent = useMemo(
    () =>
      config?.getAgentSessionInteractiveEnabled()
        ? new LegacyAgentProtocol({ config, getPreferredEditor })
        : undefined,
    [config, getPreferredEditor],
  );

  const activeStream = streamAgent
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useAgentStream({
        agent: streamAgent,
        addItem: historyManager.addItem,
        onCancelSubmit,
        isShellFocused: embeddedShellFocused,
        logger,
      })
    : // eslint-disable-next-line react-hooks/rules-of-hooks
      useGeminiStream(
```

### VT-2: Interactive continuation is a recursive React callback, not a loop

- **Truth**: in `useGeminiStream`, `handleCompletedTools` (called by
  `useToolScheduler.onComplete` when a tool batch finishes) re-enters
  `submitQuery(...)` with `{ isContinuation: true }` after filtering out
  client-initiated tools (`save_memory`, `activate_skill`). There is no
  imperative `while` loop; every continuation is a fresh `useCallback`
  invocation.
- **Primary**: `packages/cli/src/ui/hooks/useGeminiStream.ts:1822-2040`.
- **Supporting**: `packages/cli/src/ui/hooks/useGeminiStream.test.tsx:609-810`
  (e.g. "should submit tool responses when all tool calls are completed and
  ready", "should inject steering hint prompt for continuation").
- **Confidence**: high.
- **Quote**:

```2007:2029:packages/cli/src/ui/hooks/useGeminiStream.ts
      const callIdsToMarkAsSubmitted = geminiTools.map(
        (toolCall) => toolCall.request.callId,
      );

      const prompt_ids = geminiTools.map(
        (toolCall) => toolCall.request.prompt_id,
      );

      markToolsAsSubmitted(callIdsToMarkAsSubmitted);

      // Don't continue if model was switched due to quota error
      if (modelSwitchedFromQuotaError) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      submitQuery(
        responsesToSend,
        {
          isContinuation: true,
        },
        prompt_ids[0],
      );
```

### VT-3: Non-interactive legacy continuation is an imperative `while (true)` loop

- **Truth**: `runNonInteractive` owns its own
  `while (true) { ... turnCount++; ... geminiClient.sendMessageStream(...); ... scheduler.schedule(...); currentMessages = [{ role: 'user', parts: toolResponseParts }]; }`
  loop. The loop ends when `toolCallRequests.length === 0` after the stream or
  an explicit stop signal fires.
- **Primary**: `packages/cli/src/nonInteractiveCli.ts:297-525`.
- **Supporting**: `packages/cli/src/nonInteractiveCli.test.ts:319-390` ("should
  handle a single tool call and respond"),
  `packages/cli/src/nonInteractiveCli.test.ts:627-637` ("should exit when max
  session turns are exceeded").
- **Confidence**: high.

### VT-4: Output format selects one of three disjoint emission paths in non-interactive mode

- **Truth**: `config.getOutputFormat()` selects TEXT / JSON / STREAM_JSON and
  each branch handles `Content`, `ToolCallRequest`, `ToolCallResponse`, `Error`,
  `AgentExecutionStopped`, `LoopDetected`, and `MaxSessionTurns` differently.
  TEXT writes to the working stdout via `TextOutput`; JSON buffers into
  `responseText` and flushes one `JsonFormatter` object at the end; STREAM_JSON
  emits discrete `JsonStreamEventType` events.
- **Primary**: `packages/cli/src/nonInteractiveCli.ts:101-105` (selection),
  `322-398` (Content/ToolCall branching), `501-524` (final emission).
- **Supporting**: `packages/cli/src/nonInteractiveCli.test.ts:694-915`
  (JSON-format tests),
  `packages/cli/src/nonInteractiveCliAgentSession.test.ts:748-1042` (JSON-format
  tests).
- **Confidence**: high.

### VT-5: ACP bypasses both `Turn` and `GeminiClient.sendMessageStream` and drives its own tool loop

- **Truth**: `GeminiAgent.prompt` calls
  `chat.sendMessageStream({ model }, nextMessage.parts, promptId, signal, LlmRole.MAIN)`
  directly (i.e. `GeminiChat`, not `GeminiClient`), collects `functionCalls`
  from `StreamEventType.CHUNK`, executes them via `runTool`, and feeds
  `toolResponseParts` as the next message in a `while (nextMessage !== null)`
  loop. It invokes `router.route(...)` per iteration, computes its own token
  quotas, and publishes `acp.sessionUpdate` events rather than emitting
  `ServerGeminiStreamEvent`s.
- **Primary**: `packages/cli/src/acp/acpClient.ts:692-934`.
- **Supporting**: `packages/cli/src/acp/acpClient.test.ts:576-593` ("should
  delegate prompt to session").
- **Confidence**: high.

### VT-6: Non-interactive slash-command loaders differ from interactive

- **Truth**: interactive `useSlashCommandProcessor` loads commands with
  `[BuiltinCommandLoader, SkillCommandLoader, McpPromptLoader, FileCommandLoader]`.
  Non-interactive `handleSlashCommand` in `nonInteractiveCliCommands.ts` drops
  `SkillCommandLoader`. Therefore skills-defined slash commands exist in
  interactive but not in the headless run.
- **Primary**: `packages/cli/src/ui/hooks/slashCommandProcessor.ts:326-334`,
  `packages/cli/src/nonInteractiveCliCommands.ts:43-50`.
- **Supporting**: `packages/cli/src/nonInteractiveCli.test.ts:1280-1325`
  ("should instantiate CommandService with correct loaders for slash commands").
- **Confidence**: high.
- **Quote**:

```42:50:packages/cli/src/nonInteractiveCliCommands.ts
  const commandService = await CommandService.create(
    [
      new BuiltinCommandLoader(config),
      new McpPromptLoader(config),
      new FileCommandLoader(config),
    ],
    abortController.signal,
  );
```

### VT-7: ACP maintains a third, independent slash-command registry

- **Truth**: ACP does not use `CommandService` / `SlashCommandResolver` at all.
  It has a private `CommandRegistry` seeded with `Memory`, `Extensions`, `Init`,
  `Restore`, `About`, `Help` commands, and a bespoke parser in
  `CommandHandler.parseSlashCommand` that "mirrors" the CLI parser but does not
  stay in sync automatically (comment in source: "Mirrors
  `packages/cli/src/utils/commands.ts` logic").
- **Primary**: `packages/cli/src/acp/commandHandler.ts:16-138`.
- **Supporting**: `packages/cli/src/acp/commandHandler.test.ts:10-11` (single
  "parses commands correctly" test).
- **Confidence**: high.
- **Quote**:

```23:32:packages/cli/src/acp/commandHandler.ts
  private static createRegistry(): CommandRegistry {
    const registry = new CommandRegistry();
    registry.register(new MemoryCommand());
    registry.register(new ExtensionsCommand());
    registry.register(new InitCommand());
    registry.register(new RestoreCommand());
    registry.register(new AboutCommand());
    registry.register(new HelpCommand(registry));
    return registry;
  }
```

### VT-8: Escape key and Ctrl+C are the two user-facing cancellation triggers; their code paths differ

- **Truth**: interactive cancellation is driven by `useKeypress` with
  `key.name === 'escape'` → `cancelOngoingRequest()` which aborts the
  controller, cancels queued tool calls via `cancelAllToolCalls`, and adds an
  `INFO "Request cancelled."` item when no tool had produced a final result.
  Non-interactive cancellation is driven by
  `readline.emitKeypressEvents(process.stdin, rl)` detecting `ctrl+c` and
  calling `abortController.abort()`. The agent-session variant additionally
  `session.abort()`s and rethrows `FatalCancellationError` from the agent-event
  stream.
- **Primary**: `packages/cli/src/ui/hooks/useGeminiStream.ts:806-906` (escape),
  `packages/cli/src/nonInteractiveCli.ts:117-187` (Ctrl+C),
  `packages/cli/src/nonInteractiveCliAgentSession.ts:299-305, 560-562` (agent
  session abort).
- **Supporting**: `packages/cli/src/ui/hooks/useGeminiStream.test.tsx:1544-1838`
  (User Cancellation describe block),
  `packages/cli/src/nonInteractiveCli.test.ts:1045-1163` ("should handle
  cancellation (Ctrl+C)"),
  `packages/cli/src/nonInteractiveCliAgentSession.test.ts:1172-1333`
  (cancellation tests).
- **Confidence**: high.

### VT-9: No `/pollux` slash command or pollux-related CLI code exists today

- **Truth**: neither the CLI source tree nor the slash-command registry contains
  any identifier matching `pollux` (case-insensitive). This contradicts any
  implementation plan that assumes the CLI already has a Pollux surface.
- **Primary**: `packages/cli/src/ui/commands/` (search scope).
- **Supporting**: Verified by:
  ```
  rg -i "pollux" packages/cli/src
  ```
  — 0 matches (files_with_matches: empty).
- **Confidence**: high.

### VT-10: The interactive submit path has a four-way branch, not two

- **Truth**: `handleFinalSubmit` routes a submitted value to (a)
  `handleSlashCommand` when a slash command is safe-concurrent during an active
  turn, (b) `handleHintSubmit` → `injectionService.addInjection(...)` when
  model-steering is enabled and agent is running and input is not a slash
  command, (c) `submitQuery` after a permission check when idle and MCP/config
  are ready, or (d) `addMessage(...)` to queue while initializing.
- **Primary**: `packages/cli/src/ui/AppContainer.tsx:1368-1444`.
- **Supporting**: `packages/cli/src/ui/hooks/useGeminiStream.test.tsx:1951-2086`
  (slash-command handling tests).
- **Confidence**: medium (primary is an assembly of UX branches; no direct unit
  test exercises all four at once).
- **Quote**:

```1380:1438:packages/cli/src/ui/AppContainer.tsx
      const isSlash = isSlashCommand(submittedValue.trim());
      const isIdle = streamingState === StreamingState.Idle;
      const isAgentRunning =
        streamingState === StreamingState.Responding ||
        isToolExecuting(pendingHistoryItems);

      if (isSlash && isAgentRunning) {
        const { commandToExecute } = parseSlashCommand(
          submittedValue,
          slashCommands ?? [],
        );
        if (commandToExecute?.isSafeConcurrent) {
          void handleSlashCommand(submittedValue);
          addInput(submittedValue);
          return;
        }
      }

      if (config.isModelSteeringEnabled() && isAgentRunning && !isSlash) {
        handleHintSubmit(submittedValue);
        addInput(submittedValue);
        return;
      }
```

### VT-11: `useAgentStream` has incomplete parity with `useGeminiStream` (explicit TODOs)

- **Truth**: the agent-session interactive hook currently stubs loop-detection
  confirmation, shell focus / background task tracking, and plan-mode
  approval-mode transitions. Code comments call these out explicitly as TODOs.
- **Primary**: `packages/cli/src/ui/hooks/useAgentStream.ts:82-136` (stubs),
  `110-112` (loop-detection stub).
- **Supporting**: `packages/cli/src/ui/hooks/useAgentStream.test.tsx:35-206`
  (tests cover only the subset that _is_ implemented).
- **Confidence**: high.
- **Quote**:

```82:92:packages/cli/src/ui/hooks/useAgentStream.ts
  // TODO: Implement dynamic shell-related state derivation from trackedTools or dedicated refs.
  // This includes activePtyId, backgroundTasks, and related visibility states to restore
  // parity with legacy terminal focus detection and background task tracking.
  // Note: Avoid checking ITERM_SESSION_ID for terminal detection and ensure context is sanitized.
  const activePtyId = undefined;
  const backgroundTaskCount = 0;
  const isBackgroundTaskVisible = false;
  const toggleBackgroundTasks = useCallback(() => {}, []);
  const backgroundCurrentExecution = undefined;
  const backgroundTasks = useMemo(() => new Map<number, BackgroundTask>(), []);
```

### VT-12: Non-interactive agent-session reconstructs fatal error types from `event._meta.errorName`

- **Truth**: because `AgentEvent<'error'>` carries the error's `name` in
  `_meta.errorName` rather than the typed error instance, the non-interactive
  agent-session loop rebuilds the correct `FatalAuthenticationError` /
  `FatalInputError` / `FatalSandboxError` / `FatalConfigError` /
  `FatalTurnLimitedError` / `FatalToolExecutionError` / `FatalCancellationError`
  / `FatalError` instance manually via `reconstructFatalError`.
- **Primary**: `packages/cli/src/nonInteractiveCliAgentSession.ts:348-416`.
- **Supporting**:
  `packages/cli/src/nonInteractiveCliAgentSession.test.ts:1000-1084` ("should
  handle errors in JSON format", "should handle FatalInputError with custom exit
  code").
- **Confidence**: high.

### VT-13: Slash-command resolution renames losing commands deterministically (built-in wins, then prefix)

- **Truth**: `SlashCommandResolver.resolve` enforces: (1) Skill commands with an
  `extensionName` are _always_ prefixed, (2) an incoming BUILT_IN keeps the
  unprefixed name and displaces the current owner, (3) conflict between any
  other kinds prefixes both with source-derived prefixes using `:` for
  skill/extension-file and `.` for user/workspace/MCP, (4) numeric suffixes are
  appended on collision.
- **Primary**: `packages/cli/src/services/SlashCommandResolver.ts:40-204`.
- **Supporting**:
  `packages/cli/src/services/SlashCommandResolver.test.ts:18-221` (15+ tests
  covering each rule branch).
- **Confidence**: high.

## 5. Contradictions or Ambiguities

- **Item**: `POLLUX_SPEC.md` §3 claim "packages/cli unchanged" is broken by
  Phase 7 (`/pollux` command) and by Risk 1 (stream-hook crash on out-of-order
  events).
  - Evidence A: `POLLUX_FULL_FORENSIC_CONTEXT.md` F-03 (forensic finding).
  - Evidence B: `packages/cli/src/ui/commands/` contains no `polluxCommand.ts`;
    verified by `rg -i "pollux" packages/cli/src` → 0 matches (VT-9). Yet
    `POLLUX_SPEC.md` §10 Phase 7 requires a `/pollux` command here.
  - Resolution proposal: revise §3 to list the two stream hooks + the ACP prompt
    handler + `BuiltinCommandLoader` as Pollux-affected surfaces. **unresolved**
    until §3 is rewritten.

- **Item**: "Single interceptor between `GeminiClient` and `Turn`"
  (`POLLUX_SPEC.md` §3, §7) does not cover ACP or the agent-session modes.
  - Evidence A: `packages/cli/src/acp/acpClient.ts:759-828` calls
    `chat.sendMessageStream(...)` directly, skipping `GeminiClient`.
  - Evidence B: `packages/cli/src/nonInteractiveCliAgentSession.ts:291-322` uses
    `LegacyAgentSession.send(...)`.
  - Evidence C: `packages/cli/src/ui/AppContainer.tsx:1178-1216` branches
    between `useAgentStream` (uses `AgentProtocol`) and `useGeminiStream` (uses
    `GeminiClient`).
  - Resolution proposal: a Pollux interceptor must be placed either (a) inside
    `GeminiChat` (contradicting §14's "don't touch `GeminiChat` directly") or
    (b) replicated across all four drivers, or (c) pushed down into the
    router/model layer. **deferred** to compartment 02 synthesis.

- **Item**: Non-interactive skills gap — skills-defined slash commands are
  silently unavailable in non-interactive mode.
  - Evidence A: `packages/cli/src/ui/hooks/slashCommandProcessor.ts:326-334`
    includes `SkillCommandLoader`.
  - Evidence B: `packages/cli/src/nonInteractiveCliCommands.ts:43-50` omits
    `SkillCommandLoader`.
  - Resolution proposal: either documented as intentional in compartment 05
    (Extensibility) or filed as a bug. **unresolved** — does not block Pollux.

- **Item**: ACP's `handleCommand` accepts a `parts: Part[]` argument that is
  explicitly unused (eslint-disable comment).
  - Evidence A: `packages/cli/src/acp/acpClient.ts:937-956` — parameter tagged
    `// eslint-disable-next-line @typescript-eslint/no-unused-vars`.
  - Evidence B: `packages/cli/src/acp/commandHandler.ts:45-57` — only
    `commandText` is used.
  - Resolution proposal: either drop the argument or wire non-text parts through
    to commands for feature parity. **unresolved** — minor, informational only.

- **Item**: The `eslint-disable react-hooks/rules-of-hooks` at
  `AppContainer.tsx:1187` / `1195` masks an actual violation.
  - Evidence A: `packages/cli/src/ui/AppContainer.tsx:1186-1216` — conditionally
    calls two different hooks per render.
  - Evidence B: React enforces that hook ordering is stable. If the flag
    `config.getAgentSessionInteractiveEnabled()` toggles at runtime, the hook
    ordering changes and React's internal state will corrupt.
  - Resolution proposal: refactor both hooks into one facade that owns the
    branching internally. **deferred** — works today because the flag is
    effectively static per mount.

## 6. Risks and Regression Hotspots

- **Risk**: Inserting a Pollux interceptor between `GeminiClient` and `Turn` in
  only the interactive legacy path will silently skip ACP, agent-session
  interactive, and agent-session non-interactive. Benchmarks under these modes
  would over-estimate Pollux's value-add.
  - Why fragile: three drivers call core at different layers (`GeminiChat`,
    `LegacyAgentSession`, `GeminiClient`).
  - Mitigating test: none directly. Closest coverage is
    `packages/cli/src/acp/acpClient.test.ts:576-593`,
    `packages/cli/src/nonInteractiveCliAgentSession.test.ts`,
    `packages/cli/src/ui/hooks/useAgentStream.test.tsx`.
  - Suggested guard: introduce a "driver tag" on every turn start
    (interactive-legacy, interactive-agent, non-interactive-legacy,
    non-interactive-agent, acp) and require Pollux to log the tag; any missing
    tag indicates an un-intercepted driver.

- **Risk**: `useGeminiStream.processGeminiStreamEvents` has an exhaustive switch
  over `ServerGeminiEventType`; adding a new event type (e.g. a Pollux-advisor
  event) triggers an `unreachable: never` compile error today. If the enum is
  extended without updating this switch, the interactive shell crashes.
  - Why fragile: `packages/cli/src/ui/hooks/useGeminiStream.ts:1514-1518` uses
    `const unreachable: never = event; return unreachable;`.
  - Mitigating test: compile-time exhaustiveness only; no runtime test exercises
    a new event type.
  - Suggested guard: when introducing any Pollux event kind, update this switch
    AND `packages/cli/src/nonInteractiveCli.ts:322-398` together. The forensic
    report's Risk 1 (stream splice corruption) is exactly this class of failure.

- **Risk**: `AppContainer.tsx:1186-1216` conditionally calls `useAgentStream` vs
  `useGeminiStream`. If any Pollux setting toggles
  `getAgentSessionInteractiveEnabled()` at runtime, the React hook order changes
  and state corrupts.
  - Why fragile: eslint-disabled rules-of-hooks violation.
  - Mitigating test: none.
  - Suggested guard: treat `getAgentSessionInteractiveEnabled()` as a
    mount-time-only flag; add a runtime assertion that rejects mid-session
    changes.

- **Risk**: `handleCompletedTools` in `useGeminiStream` re-enters `submitQuery`
  via `prompt_ids[0]` — it unilaterally adopts the first tool's prompt id for
  the continuation even if tools came from different prompts.
  - Why fragile: `useGeminiStream.ts:2011-2028`. Telemetry tied to `prompt_id`
    becomes wrong for mixed-prompt batches.
  - Mitigating test: no direct coverage; test at
    `useGeminiStream.test.tsx:702-810` only exercises a single prompt.
  - Suggested guard: assert that all `geminiTools.map(t => t.request.prompt_id)`
    are equal before continuing, or split the continuation per prompt_id.

- **Risk**: ACP's `handleCommand` receives `commandText` from the _first_
  contiguous text-parts prefix only (breaks on first non-text part).
  Binary-first prompts skip command interception silently.
  - Why fragile: `packages/cli/src/acp/acpClient.ts:707-722`.
  - Mitigating test: none.
  - Suggested guard: also scan trailing text parts; or explicitly document the
    "text-first" convention.

- **Risk**: ACP and non-interactive JSON formats both call
  `config.getSessionId()` to tag results; the CLI dispatcher creates the
  `sessionId` before `config.initialize()` runs in non-interactive mode
  (`gemini.tsx:668-742`). If the init changes the id, output carries a stale id.
  - Why fragile: `packages/cli/src/gemini.tsx:668-738`.
  - Mitigating test: none directly.
  - Suggested guard: freeze the session id at construction; forbid
    `initialize()` from mutating it.

## 7. Test and Observability Coverage

- **Tests covering this compartment**:
  - `packages/cli/src/ui/hooks/useGeminiStream.test.tsx` — 31+ cases covering
    stream event routing, cancellation, tool continuation, loop detection, slash
    commands, retry, quota fallback.
  - `packages/cli/src/ui/hooks/useAgentStream.test.tsx` — 7 cases covering
    subscribe / send / streaming state / text accumulation / thought events /
    abort.
  - `packages/cli/src/nonInteractiveCli.test.ts` — 30+ cases covering
    text/json/stream-json outputs, tool continuation, cancellation, slash
    commands, command context plumbing, max-turns.
  - `packages/cli/src/nonInteractiveCliAgentSession.test.ts` — 30+ cases with
    parity surface to the above, plus `reconstructFatalError` paths and pre-send
    cancellation.
  - `packages/cli/src/acp/acpClient.test.ts` — 20+ cases covering initialize,
    auth, session lifecycle, `prompt` delegation, cancel, MCP servers, preview
    models.
  - `packages/cli/src/acp/commandHandler.test.ts` — 1 case
    (`parses commands correctly`) only. **Coverage gap** relative to the ACP
    registry.
  - `packages/cli/src/services/SlashCommandResolver.test.ts` — 15+ cases
    covering every rule in the resolver.
  - `packages/cli/src/services/CommandService.test.ts` — referenced from `Glob`,
    aggregator tests.
  - `packages/cli/src/gemini.test.tsx` — dispatcher-level tests verifying
    `runNonInteractive`/`startInteractiveUI` selection (referenced from imports
    at `gemini.test.tsx:21-62`).

- **Observability signals** produced directly from CLI code:
  - `coreEvents.emitConsoleLog` via `ConsolePatcher` (interactive +
    non-interactive).
  - `coreEvents.emitFeedback` for startup warnings (`interactiveCli.tsx:83`).
  - `logUserPrompt(config, new UserPromptEvent(...))` in interactive
    (`useGeminiStream.ts:1614-1622`) and non-interactive (`gemini.tsx:712-721`).
  - `streamFormatter.emitEvent(JsonStreamEventType.{INIT, MESSAGE, TOOL_USE, TOOL_RESULT, ERROR, RESULT})`
    for `OutputFormat.STREAM_JSON`.
  - `runInDevTraceSpan({ operation: GeminiCliOperation.UserPrompt | SystemPrompt, sessionId })`
    wraps every interactive `submitQuery` (`useGeminiStream.ts:1557-1565`).
  - `acp.sessionUpdate(...)` calls for `agent_message_chunk`,
    `agent_thought_chunk`, `tool_call`, etc.

- **Coverage gaps**:
  - ACP command handler has essentially a single test.
  - No unit test asserts that `useGeminiStream` and `nonInteractiveCli` agree on
    event-type handling for any specific event (e.g. `AgentExecutionBlocked`).
  - No test exercises the `handleFinalSubmit` steering-hint branch at
    `AppContainer.tsx:1398-1402`.
  - No test documents that `nonInteractiveCliCommands.handleSlashCommand` omits
    `SkillCommandLoader` — the divergence is silent.
  - No test exercises the rules-of-hooks bypass in `AppContainer.tsx:1186-1216`.

## 8. Open Questions

- [ ] Does the CLI intentionally omit `SkillCommandLoader` in non-interactive
      mode, or is this a bug? (Escalate to compartment 05.)
- [ ] Is `config.getAgentSessionInteractiveEnabled()` guaranteed to be constant
      for the lifetime of a mount, or can settings hot-reload change it
      mid-session? (Escalate to compartment 06.)
- [ ] Does ACP's `handleCommand` intentionally ignore non-text `parts`, or
      should multimodal-prefixed commands be supported? (Escalate to compartment
      12.)
- [ ] Which of the four turn drivers should Pollux instrument first, and how
      will benchmark fairness be preserved across drivers that use different
      routers? (Escalate to compartment 02 and compartment 07.)
- [ ] Should `prompt_ids[0]` in `handleCompletedTools` become
      `prompt_ids.join(',')` or be split into multiple continuations when a
      batch spans prompts? (Escalate to compartment 11.)
- [ ] Should the UI-level `/pollux` command (spec Phase 7) live in
      `BuiltinCommandLoader` or a dedicated extension? (Escalate to compartment
      05 / 16.)

## 9. Definition of Done

- [x] End-to-end CLI call flow is mapped for all runtime modes (ACP, interactive
      legacy, interactive agent-session, non-interactive legacy, non-interactive
      agent-session).
- [x] Tool continuation behavior is verified for interactive and headless paths
      (VT-2, VT-3, VT-5).
- [x] Command path and ACP path are both documented (sections 2 and 3; VT-6,
      VT-7, VT-13).
- [x] Branch-specific risks are identified with citations (section 6).
- [x] At least one representative event timeline is evidence-backed (VT-2
      continuation timeline, VT-4 non-interactive emission timeline).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar
      (`reports/01-cli-runtime-surface/report.json`).
- [ ] `INDEX.md` row 01 flipped to `done` (pending final status update).

## 10. Evidence Matrix (summary)

| Claim                                            | Primary                                                      | Supporting                                                                         | Confidence |
| ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------- |
| VT-1: four distinct turn-driving code paths      | `packages/cli/src/gemini.tsx:624-746`                        | `packages/cli/src/ui/AppContainer.tsx:1178-1216`, `useAgentStream.test.tsx:35-206` | high       |
| VT-2: interactive continuation is recursive      | `useGeminiStream.ts:1822-2040`                               | `useGeminiStream.test.tsx:609-810`                                                 | high       |
| VT-3: non-interactive legacy uses `while (true)` | `nonInteractiveCli.ts:297-525`                               | `nonInteractiveCli.test.ts:319-390`                                                | high       |
| VT-4: three output formats, three emission paths | `nonInteractiveCli.ts:101-105,322-524`                       | `nonInteractiveCli.test.ts:694-915`                                                | high       |
| VT-5: ACP bypasses `Turn` + `GeminiClient`       | `acpClient.ts:692-934`                                       | `acpClient.test.ts:576-593`                                                        | high       |
| VT-6: non-interactive drops skill loader         | `nonInteractiveCliCommands.ts:43-50`                         | `nonInteractiveCli.test.ts:1280-1325`                                              | high       |
| VT-7: ACP has its own command registry           | `commandHandler.ts:23-32`                                    | `commandHandler.test.ts:10-11`                                                     | high       |
| VT-8: Escape vs Ctrl+C cancel paths differ       | `useGeminiStream.ts:806-906`; `nonInteractiveCli.ts:117-187` | `useGeminiStream.test.tsx:1544-1838`                                               | high       |
| VT-9: no `/pollux` surface exists                | `rg -i "pollux" packages/cli/src` → 0 matches                | —                                                                                  | high       |
| VT-10: `handleFinalSubmit` 4-way branch          | `AppContainer.tsx:1368-1444`                                 | `useGeminiStream.test.tsx:1951-2086`                                               | medium     |
| VT-11: `useAgentStream` has parity TODOs         | `useAgentStream.ts:82-136`                                   | `useAgentStream.test.tsx:35-206`                                                   | high       |
| VT-12: agent-session reconstructs fatal errors   | `nonInteractiveCliAgentSession.ts:348-416`                   | `nonInteractiveCliAgentSession.test.ts:1000-1084`                                  | high       |
| VT-13: slash-command resolution rules            | `SlashCommandResolver.ts:40-204`                             | `SlashCommandResolver.test.ts:18-221`                                              | high       |

## 11. Handoffs

- **Depends on**:
  - compartment 02 (core turn engine) — for semantics of `ServerGeminiEventType`
    and `GeminiClient.sendMessageStream` this compartment consumes.
  - compartment 04 (tools & MCP) — for `Scheduler` semantics and tool response
    plumbing.
  - compartment 06 (settings) — for the flags `getAcpMode()`,
    `getAgentSessionInteractiveEnabled()`,
    `getAgentSessionNoninteractiveEnabled()`, `getOutputFormat()`,
    `isModelSteeringEnabled()`.

- **Affects**:
  - compartment 03 (agent runtime and modes) — validated: both agent-session
    branches are live in this repo.
  - compartment 05 (extensibility) — skills-loader divergence between
    interactive and non-interactive.
  - compartment 07 (routing / Pollux) — the Pollux interceptor must land in each
    driver; today only one of them even goes through `GeminiClient`.
  - compartment 11 (telemetry) — `prompt_id` handling in continuation;
    `runInDevTraceSpan` span names.
  - compartment 12 (output protocol) — `OutputFormat.{TEXT, JSON, STREAM_JSON}`
    branching here is the caller-side of that contract.

- **Escalated questions sent to**: compartment 05 (via `INDEX.md` Notes) for the
  skills-loader non-interactive divergence; compartment 02 (via `INDEX.md`
  Notes) for the question of where a Pollux interceptor can cover all four
  drivers.
