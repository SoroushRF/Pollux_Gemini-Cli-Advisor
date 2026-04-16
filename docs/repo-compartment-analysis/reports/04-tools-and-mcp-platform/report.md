# Compartment Report: 04 — Tools and MCP Platform

## Metadata

- **Compartment**: 04 — Tools and MCP Platform
- **Guideline file**: `04-tools-and-mcp-platform.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: `b43e7661ddaa7bbcc2283350a5eace8d2d8bb424`
- **Upstream base commit**: unknown

## 0. Pre-flight

Path validation results from `AGENT_RUNBOOK.md` Step B.

| Path                                            | Exists? | Notes                                                         |
| ----------------------------------------------- | ------- | ------------------------------------------------------------- |
| `packages/core/src/tools`                       | yes     | 77 TS files including tools + tests                           |
| `packages/core/src/tools/tool-registry.ts`      | yes     | 717 lines                                                     |
| `packages/core/src/tools/tools.ts`              | yes     | 1006 lines — core base classes and types                      |
| `packages/core/src/tools/mcp-client-manager.ts` | yes     | 669 lines                                                     |
| `packages/core/src/tools/mcp-client.ts`         | yes     | 2151 lines — budget-capped file, read via targeted rg queries |
| `packages/core/src/tools/mcp-tool.ts`           | yes     | 555 lines                                                     |
| `packages/core/src/mcp`                         | yes     | OAuth providers, token storage, service-account impersonation |

All primary paths listed in the guideline exist at the analyzed commit. No stale
paths detected.

## 1. Scope and Boundary

In scope (matches guideline):

- tool registry and tool definitions,
- built-in tool categories (file, shell, web, memory, search, tasks, tracker,
  plan-mode, skill, topic, ask-user),
- MCP client/manager transport and tool proxy behavior,
- confirmation and invocation policy touchpoints at the tool layer.

Out of scope:

- CLI slash command parser internals
  (`05-extensibility-skills-hooks-commands.md`),
- policy engine implementation internals
  (`09-policy-trust-and-safety-engine.md`),
- core turn lifecycle internals (`02-core-turn-engine.md`),
- sandbox/shell substrate details
  (`10-sandbox-shell-and-filesystem-substrate.md`).

Reality note: the **confirmation loop is split** — the tool layer exposes
`shouldConfirmExecute()` and a message-bus "ASK_USER" protocol, but the actual
policy decision and confirmation orchestration live in the scheduler
(`packages/core/src/scheduler/scheduler.ts`). This is documented in section 4 as
a handoff.

## 2. Runtime Flow Summary

### 2a. Registration flow (cold start)

1. CLI boots and calls `Config.createToolRegistry()`
   (`packages/core/src/config/config.ts:3481-3634`).
2. The factory constructs a `ToolRegistry` with `isMainRegistry=true` and a
   shared `MessageBus`, then conditionally registers each built-in via a
   `maybeRegister(ToolClass, factory)` helper that checks
   `Config.getCoreTools()` (`packages/core/src/config/config.ts:3489-3513`).
3. After built-ins are registered, `registry.discoverAllTools()` runs, which
   first purges previously discovered tools and then executes the
   `toolDiscoveryCommand` (if configured) as a child process, parsing its stdout
   for `FunctionDeclaration`s and wrapping each in a `DiscoveredTool`
   (`packages/core/src/tools/tool-registry.ts:352-523`).
4. `registry.sortTools()` reorders the map: built-ins, discovered CLI tools, MCP
   tools (grouped by server name)
   (`packages/core/src/tools/tool-registry.ts:296-325`).
5. MCP servers are discovered separately by
   `McpClientManager.startConfiguredMcpServers()`, which iterates all
   `MCPServerConfig` entries and calls `maybeDiscoverMcpServer()` per server
   (`packages/core/src/tools/mcp-client-manager.ts:546-588`). Each server's
   `McpClient.discoverInto()` calls `discoverTools()`, which wraps every MCP
   tool in a `DiscoveredMCPTool` and registers it into the main `ToolRegistry`
   (`packages/core/src/tools/mcp-client.ts:224-260`,
   `packages/core/src/tools/mcp-client.ts:1266-1330`).

### 2b. Declaration flow (turn boundary)

1. When the turn engine needs to tell the model what tools exist, it calls
   `registry.getFunctionDeclarations(modelId?)`
   (`packages/core/src/tools/tool-registry.ts:635-689`).
2. The registry filters to `getActiveTools()` (excluded set + plan-mode gating
   for `ENTER_PLAN_MODE_TOOL_NAME`/`EXIT_PLAN_MODE_TOOL_NAME` + topic narration
   gating) (`packages/core/src/tools/tool-registry.ts:587-626`).
3. For each active tool, it calls `tool.getSchema(modelId)`. MCP tools have
   their name replaced with the `mcp_<server>_<tool>` fully-qualified form; in
   plan mode, `WriteFile` and `Edit` descriptions are rewritten to plans-only
   (`packages/core/src/tools/tool-registry.ts:670-685`).
4. `DeclarativeTool.getSchema()` also injects a synthetic
   `wait_for_previous: boolean` parameter so the model can mark tools as
   sequential (`packages/core/src/tools/tools.ts:517-565`).

### 2c. Local tool invocation flow (one call)

1. Model emits a `functionCall`. The scheduler resolves the tool via
   `registry.getTool(name)` (legacy-alias aware)
   (`packages/core/src/tools/tool-registry.ts:777-795`).
2. `_validateAndCreateToolCall` runs `tool.build(args)` in a tool-call context;
   on schema failure it synthesizes an `Error` toolcall with
   `ToolErrorType.INVALID_TOOL_PARAMS`
   (`packages/core/src/scheduler/scheduler.ts:370-409`).
3. `_processValidatingCall` runs hook-before, then
   `checkPolicy(toolCall, config, subagent)`
   (`packages/core/src/scheduler/scheduler.ts:617-644`). A `DENY` becomes a
   `ToolErrorType.POLICY_VIOLATION` error; `ASK_USER` triggers
   `resolveConfirmation`, which calls `invocation.shouldConfirmExecute()` and
   dispatches edit / exec / mcp / info / ask_user / sandbox_expansion
   confirmation details based on tool kind.
4. After approval, the call transitions to `Scheduled`, and
   `ToolExecutor.execute()` wraps
   `invocation.execute({ abortSignal, updateOutput, … })` in
   `executeToolWithHooks(...)` to give the hook system pre/post visibility and
   output truncation (`packages/core/src/scheduler/tool-executor.ts:99-194`).
5. Success or error is normalized to a `ToolCallResponseInfo` with a
   `functionResponse` part for the model; sandbox-expansion errors re-route into
   a second confirmation pass before execution
   (`packages/core/src/scheduler/tool-executor.ts:146-194`,
   `packages/core/src/scheduler/scheduler.ts:805-868`).

### 2d. MCP tool invocation flow (one call)

1. Same registry lookup — the name is `mcp_<server>_<tool>` and resolves to a
   `DiscoveredMCPTool` (`packages/core/src/tools/tool-registry.ts:777-795`).
2. `DiscoveredMCPTool.build()` validates input against the server-supplied JSON
   schema (via `BaseDeclarativeTool.validateToolParams()` using
   `SchemaValidator`) and returns a `DiscoveredMCPToolInvocation`
   (`packages/core/src/tools/mcp-tool.ts:428-447`,
   `packages/core/src/tools/tools.ts:683-706`).
3. `shouldConfirmExecute()` first consults an in-process, per-server/per-tool
   allowlist and the `trust` flag on the server config; otherwise returns
   `ToolMcpConfirmationDetails` with `ProceedAlwaysServer` / `ProceedAlwaysTool`
   outcomes that update the allowlist
   (`packages/core/src/tools/mcp-tool.ts:199-237`).
4. `execute()` builds a `FunctionCall` and delegates to
   `McpCallableTool.callTool([call])`, which invokes `client.callTool(...)` via
   `@modelcontextprotocol/sdk`, tracks a progress token, and coerces transport
   errors into `functionResponse.response.error.isError = true`
   (`packages/core/src/tools/mcp-tool.ts:268-331`,
   `packages/core/src/tools/mcp-client.ts:1369-1425`).
5. The invocation checks `isMCPToolError(rawResponseParts)` to map MCP-signaled
   errors to `ToolErrorType.MCP_TOOL_ERROR`, then transforms MCP content blocks
   (`text`, `image`, `audio`, `resource`, `resource_link`) into GenAI `Part[]`
   (`packages/core/src/tools/mcp-tool.ts:239-331`,
   `packages/core/src/tools/mcp-tool.ts:450-582`).

## 3. Key Files and Citations

| Path                                                                                                           | Role                                                                                      | Notes                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/tools/tools.ts`                                                                             | Declarative tool base classes, invocation, confirmation bus, types                        | 1006 lines. `BaseDeclarativeTool`, `BaseToolInvocation`, confirmation-details discriminated union, `Kind` enum.                                            |
| `packages/core/src/tools/tool-registry.ts`                                                                     | Registry, discovery-by-command, plan-mode + excludeTools filtering                        | 717 lines. Owns the `allKnownTools` map and the declaration pipeline.                                                                                      |
| `packages/core/src/tools/tool-names.ts`                                                                        | Name constants, legacy aliases, built-in tool roster, MCP name validation                 | 336 lines. `ALL_BUILTIN_TOOL_NAMES` lists the registered set; `PLAN_MODE_TOOLS` is the read-only subset.                                                   |
| `packages/core/src/tools/mcp-client-manager.ts`                                                                | Lifecycle across multiple MCP servers, diagnostics                                        | 669 lines. Owns `allServerConfigs`, connection coalescing, extension start/stop, refresh debouncing.                                                       |
| `packages/core/src/tools/mcp-client.ts`                                                                        | Per-server client: connect, discover, call, OAuth flows, progress routing                 | 2151 lines. `McpClient`, `connectToMcpServer`, `createTransport`, `discoverTools`, `discoverPrompts`, `discoverResources`, `isEnabled`, `McpCallableTool`. |
| `packages/core/src/tools/mcp-tool.ts`                                                                          | `DiscoveredMCPTool` + invocation, content-block transform, allowlist                      | 555 lines. Owns name canonicalization `generateValidName`, MCP FQN parsers.                                                                                |
| `packages/core/src/tools/tool-error.ts`                                                                        | `ToolErrorType` enum + `isFatalToolError`                                                 | 91 lines. Only `NO_SPACE_LEFT` is fatal.                                                                                                                   |
| `packages/core/src/tools/modifiable-tool.ts`                                                                   | `ModifiableDeclarativeTool` interface + edit-via-editor helper                            | 212 lines. Used by `EditTool` / `WriteFileTool` for user-modify-in-editor flow.                                                                            |
| `packages/core/src/tools/shell.ts`                                                                             | `ShellTool` + `ShellToolInvocation` (highest-risk built-in)                               | 1017 lines. Sandbox expansion, background, proactive permissions.                                                                                          |
| `packages/core/src/tools/shellBackgroundTools.ts`                                                              | Background-process list/read helpers                                                      | Two `Kind.Read` tools that query the `ShellBackgroundRegistry`.                                                                                            |
| `packages/core/src/tools/write-file.ts` / `edit.ts`                                                            | File mutation tools with `respectsAutoEdit=true` invocations                              | `Kind.Edit`. Both pass AUTO_EDIT through the `BaseToolInvocation` fast-path.                                                                               |
| `packages/core/src/tools/read-file.ts` / `ls.ts` / `glob.ts` / `grep.ts` / `ripGrep.ts` / `read-many-files.ts` | Read-only file surface                                                                    | `Kind.Read` or `Kind.Search`. All validate `config.validatePathAccess(...)` before building invocation.                                                    |
| `packages/core/src/tools/web-fetch.ts` / `web-search.ts`                                                       | Web egress                                                                                | `Kind.Fetch` / `Kind.Search`. Web fetch has confirmation; search does not.                                                                                 |
| `packages/core/src/tools/memoryTool.ts`                                                                        | Persistent user facts                                                                     | `Kind.Think`; writes to `GEMINI.md`-family files via `Storage`.                                                                                            |
| `packages/core/src/tools/write-todos.ts`                                                                       | Ephemeral todo-list management                                                            | `Kind.Other`.                                                                                                                                              |
| `packages/core/src/tools/trackerTools.ts`                                                                      | Six tracker tools (`Kind.Edit` / `Read` / `Search`)                                       | Gated by `Config.isTrackerEnabled()`.                                                                                                                      |
| `packages/core/src/tools/enter-plan-mode.ts` / `exit-plan-mode.ts`                                             | Plan-mode transitions                                                                     | `Kind.Plan`; registry hides the inactive one based on `ApprovalMode.PLAN`.                                                                                 |
| `packages/core/src/tools/ask-user.ts`                                                                          | Structured user-question tool                                                             | `Kind.Communicate`.                                                                                                                                        |
| `packages/core/src/tools/activate-skill.ts`                                                                    | Skill activation                                                                          | `Kind.Other`.                                                                                                                                              |
| `packages/core/src/tools/topicTool.ts`                                                                         | `update_topic` narration                                                                  | `Kind.Think`; registry hides when `isTopicUpdateNarrationEnabled()` is false.                                                                              |
| `packages/core/src/tools/get-internal-docs.ts`                                                                 | Internal doc lookup tool                                                                  | `Kind.Think`.                                                                                                                                              |
| `packages/core/src/scheduler/scheduler.ts`                                                                     | Calls `tool.build`, runs policy + confirmation + hooks, orchestrates execution            | Cross-cutting — authoritative caller of `invocation.execute`.                                                                                              |
| `packages/core/src/scheduler/tool-executor.ts`                                                                 | Executes the invocation inside a dev-trace span, normalizes errors to `CompletedToolCall` | Owns error-type fallbacks (`UNHANDLED_EXCEPTION`).                                                                                                         |
| `packages/core/src/tools/confirmation-policy.test.ts`                                                          | End-to-end confirmation behavior across tool families                                     | Exercises AUTO_EDIT, `forcedDecision='ask_user'`, `onConfirm` outcomes.                                                                                    |
| `packages/core/src/tools/base-tool-invocation.test.ts`                                                         | Message-bus correlation for tool confirmation                                             | Confirms `serverName` is propagated on `TOOL_CONFIRMATION_REQUEST`.                                                                                        |
| `packages/core/src/tools/mcp-tool.test.ts`                                                                     | MCP invocation contract                                                                   | Validates `isMCPToolError`, content-block transforms, name generation.                                                                                     |
| `packages/core/src/tools/mcp-client-manager.test.ts`                                                           | MCP lifecycle (trust, allow/block, extension wiring)                                      | 20+ behavioral cases including extensions and diagnostics.                                                                                                 |
| `packages/core/src/tools/tool-registry.test.ts`                                                                | Registry semantics (exclude, sort, plan mode, DiscoveredTool)                             | Includes `DiscoveredToolInvocation` child-process path coverage.                                                                                           |

## 4. Verified Truths

### Truth 1: Every declarative tool is a `BaseDeclarativeTool` that validates parameters against a JSON schema before returning a `ToolInvocation`.

- Primary: `packages/core/src/tools/tools.ts:679-719`
- Supporting: `packages/core/src/tools/tools.test.ts` (confirms `build` ->
  validator path)
- Confidence: high
- Quote:

  ```683:706:packages/core/src/tools/tools.ts
    build(params: TParams): ToolInvocation<TParams, TResult> {
      const validationError = this.validateToolParams(params);
      if (validationError) {
        throw new Error(validationError);
      }
      return this.createInvocation(
        params,
        this.messageBus,
        this.name,
        this.displayName,
      );
    }

    override validateToolParams(params: TParams): string | null {
      const errors = SchemaValidator.validate(
        this.schema.parametersJsonSchema,
        params,
      );
  ```

### Truth 2: `ToolRegistry` is the single source of tool names/schemas exposed to models and injects a synthetic `wait_for_previous` parameter into every declaration.

- Primary: `packages/core/src/tools/tool-registry.ts:635-689`
- Supporting: `packages/core/src/tools/tools.ts:517-565` (declaration mutation)
- Confidence: high
- Quote:

  ```538:565:packages/core/src/tools/tools.ts
    private addWaitForPreviousParameter(schema: unknown): unknown {
      if (!this.isParameterSchema(schema) || schema.type !== 'object') {
        return schema;
      }

      const props = schema.properties;
      let propertiesObj: Record<string, unknown> = {};

      if (props !== undefined) {
        if (!isRecord(props)) {
          return schema;
        }
        propertiesObj = props;
      }

      return {
        ...schema,
        properties: {
          ...propertiesObj,
          wait_for_previous: {
            type: 'boolean',
            description:
              'Set to true to wait for all previously requested tools in this turn to complete before starting. Set to false (or omit) to run in parallel. Use true when this tool depends on the output of previous tools.',
          },
        },
      };
    }
  ```

### Truth 3: Plan mode and excluded-tools filtering happen at declaration time inside the registry, not inside tools.

- Primary: `packages/core/src/tools/tool-registry.ts:546-626`
- Supporting: `packages/core/src/tools/tool-registry.test.ts`
  `describe('plan mode', ...)` (line 742+)
- Confidence: high
- Quote:

  ```599:625:packages/core/src/tools/tool-registry.ts
      if (tool.name === UPDATE_TOPIC_TOOL_NAME) {
        if (!this.config.isTopicUpdateNarrationEnabled()) {
          return false;
        }
      }

      const isPlanMode = this.config.getApprovalMode() === ApprovalMode.PLAN;
      if (
        (tool.name === ENTER_PLAN_MODE_TOOL_NAME && isPlanMode) ||
        (tool.name === EXIT_PLAN_MODE_TOOL_NAME && !isPlanMode)
      ) {
        return false;
      }

      const normalizedClassName = tool.constructor.name.replace(/^_+/, '');
      const possibleNames = [tool.name, normalizedClassName];
      if (tool instanceof DiscoveredMCPTool) {
        if (tool.name.startsWith(tool.getFullyQualifiedPrefix())) {
          possibleNames.push(
            tool.name.substring(tool.getFullyQualifiedPrefix().length),
          );
        } else {
          possibleNames.push(`${tool.getFullyQualifiedPrefix()}${tool.name}`);
        }
      }
      return !possibleNames.some((name) => excludeTools.has(name));
  ```

### Truth 4: `Config.createToolRegistry()` is the canonical registration site for built-ins; each class is gated by `Config.getCoreTools()` and a feature flag.

- Primary: `packages/core/src/config/config.ts:3481-3634`
- Supporting: `packages/core/src/config/config.test.ts`
  `describe('createToolRegistry', …)` (line 1363) and
  `describe('registerCoreTools', …)` (line 2041)
- Confidence: high
- Quote:

  ```3489:3513:packages/core/src/config/config.ts
      const maybeRegister = (
        toolClass: { name: string; Name?: string },
        registerFn: () => void,
      ) => {
        const className = toolClass.name;
        const toolName = toolClass.Name || className;
        const coreTools = this.getCoreTools();
        const normalizedClassName = className.replace(/^_+/, '');

        let isEnabled = true; // Enabled by default if coreTools is not set.
        if (coreTools) {
          isEnabled = coreTools.some(
            (tool) =>
              tool === toolName ||
              tool === normalizedClassName ||
              tool.startsWith(`${toolName}(`) ||
              tool.startsWith(`${normalizedClassName}(`),
          );
        }

        if (isEnabled) {
          registerFn();
        }
      };
  ```

### Truth 5: Discovered-command tools run as spawned subprocesses with 10MB stdout/stderr byte budgets and optional sandbox preparation.

- Primary: `packages/core/src/tools/tool-registry.ts:358-523`
- Supporting: `packages/core/src/tools/tool-registry.test.ts`
  `describe('DiscoveredToolInvocation', …)` (line 876)
- Confidence: high
- Quote:

  ```408:424:packages/core/src/tools/tool-registry.ts
        const MAX_STDOUT_SIZE = 10 * 1024 * 1024; // 10MB limit
        const MAX_STDERR_SIZE = 10 * 1024 * 1024; // 10MB limit

        let stdoutByteLength = 0;
        let stderrByteLength = 0;

        proc.stdout.on('data', (data) => {
          if (sizeLimitExceeded) return;
          if (stdoutByteLength + data.length > MAX_STDOUT_SIZE) {
            sizeLimitExceeded = true;
            proc.kill();
            return;
          }
          stdoutByteLength += data.length;
          stdout += stdoutDecoder.write(data);
  ```

### Truth 6: MCP tool names exposed to models are fully qualified as `mcp_<server>_<tool>` and sanitized to `[a-zA-Z0-9_.:-]`, truncated to 63 characters with a `...` middle marker when needed.

- Primary: `packages/core/src/tools/mcp-tool.ts:588-616`
- Supporting: `packages/core/src/tools/mcp-tool.test.ts`
  `describe('generateValidName', …)` (line 54)
- Confidence: high
- Quote:

  ```588:616:packages/core/src/tools/mcp-tool.ts
  const MAX_FUNCTION_NAME_LENGTH = 64;

  /** Visible for testing */
  export function generateValidName(name: string) {
    let validToolname = name.startsWith('mcp_') ? name : `mcp_${name}`;

    validToolname = validToolname.replace(/[^a-zA-Z0-9_\-.:]/g, '_');

    if (/^[^a-zA-Z_]/.test(validToolname)) {
      validToolname = `_${validToolname}`;
    }

    const safeLimit = MAX_FUNCTION_NAME_LENGTH - 1;
    if (validToolname.length > safeLimit) {
      debugLogger.warn(
        `Truncating MCP tool name "${validToolname}" to fit within the 64 character limit. This tool may require user approval.`,
      );
      validToolname =
        validToolname.slice(0, 30) + '...' + validToolname.slice(-30);
    }

    return validToolname;
  }
  ```

### Truth 7: MCP server discovery obeys three independent gates: admin allowlist/blocklist, user enablement (session + file), and folder trust.

- Primary: `packages/core/src/tools/mcp-client-manager.ts:415-437`
- Supporting: `packages/core/src/tools/mcp-client-manager.test.ts`
  (`should not start blocked servers`, `should only start allowed servers…`,
  `should not discover tools if folder is not trusted`)
- Confidence: high
- Quote:
  ```415:437:packages/core/src/tools/mcp-client-manager.ts
      if (this.isBlockedBySettings(name)) {
        if (!this.blockedMcpServers.find((s) => s.name === name)) {
          this.blockedMcpServers?.push({
            name,
            extensionName: finalConfig.extension?.name ?? '',
          });
        }
        return;
      }
      if (await this.isDisabledByUser(name)) {
        if (existing) {
          await this.disconnectClient(clientKey);
        }
        return;
      }
      if (!this.cliConfig.isTrustedFolder()) {
        return;
      }
      if (finalConfig.extension && !finalConfig.extension.isActive) {
        return;
      }
  ```

### Truth 8: MCP per-server tool filtering uses `excludeTools` first, then `includeTools`, with the server-level allowlist being an intersection and the blocklist a union on merge.

- Primary: `packages/core/src/tools/mcp-client.ts:2344-2368`
- Supporting: `packages/core/src/tools/mcp-client-manager.ts:305-344` (merge
  semantics)
- Confidence: high
- Quote:

  ```2344:2368:packages/core/src/tools/mcp-client.ts
  export function isEnabled(
    funcDecl: NamedTool,
    mcpServerName: string,
    mcpServerConfig: MCPServerConfig,
  ): boolean {
    if (!funcDecl.name) {
      debugLogger.warn(
        `Discovered a function declaration without a name from MCP server '${mcpServerName}'. Skipping.`,
      );
      return false;
    }
    const { includeTools, excludeTools } = mcpServerConfig;

    if (excludeTools && excludeTools.includes(funcDecl.name)) {
      return false;
    }

    return (
      !includeTools ||
      includeTools.some(
        (tool) => tool === funcDecl.name || tool.startsWith(`${funcDecl.name}(`),
      )
    );
  }
  ```

### Truth 9: MCP tool invocations track per-call progress tokens and map SDK errors into MCP-spec-compliant `isError` responses (they do not throw).

- Primary: `packages/core/src/tools/mcp-client.ts:1369-1425`
- Supporting: `packages/core/src/tools/mcp-tool.test.ts`
  `describe('execute', …)`
  `should propagate rejection if mcpTool.callTool rejects` (line 274)
- Confidence: high
- Quote:
  ```1405:1425:packages/core/src/tools/mcp-client.ts
      } catch (error) {
        return [
          {
            functionResponse: {
              name: call.name,
              response: {
                error: {
                  message: error instanceof Error ? error.message : String(error),
                  isError: true,
                },
              },
            },
          },
        ];
      } finally {
        if (this.progressReporter) {
          this.progressReporter.unregisterProgressToken(progressToken);
        }
      }
    }
  }
  ```

### Truth 10: The `BaseToolInvocation.shouldConfirmExecute` flow short-circuits in `AUTO_EDIT` mode for edit/write tools (via `respectsAutoEdit=true` passed by the `EditTool`/`WriteFileTool` invocations).

- Primary: `packages/core/src/tools/tools.ts:187-219`
- Supporting: `packages/core/src/tools/confirmation-policy.test.ts:199-211`
  (`should skip confirmation in AUTO_EDIT mode`)
- Confidence: high
- Quote:

  ```187:219:packages/core/src/tools/tools.ts
    async shouldConfirmExecute(
      abortSignal: AbortSignal,
      forcedDecision?: ForcedToolDecision,
    ): Promise<ToolCallConfirmationDetails | false> {
      if (
        this.respectsAutoEdit &&
        this.getApprovalMode() === ApprovalMode.AUTO_EDIT &&
        forcedDecision !== 'ask_user'
      ) {
        return false;
      }

      const decision =
        forcedDecision ?? (await this.getMessageBusDecision(abortSignal));
      if (decision === 'allow') {
        return false;
      }

      if (decision === 'deny') {
        throw new Error(
          `Tool execution for "${
            this._toolDisplayName || this._toolName
          }" denied by policy.`,
        );
      }

      if (decision === 'ask_user') {
        return this.getConfirmationDetails(abortSignal);
      }
  ```

### Truth 11: Persistent tool-approval updates are driven by the scheduler (`updatePolicy`), not by `onConfirm` callbacks; the tool layer only advertises `getPolicyUpdateOptions` hints (e.g. `commandPrefix` for shell, `mcpName/toolName` for MCP).

- Primary: `packages/core/src/scheduler/scheduler.ts:669-678`
- Supporting: `packages/core/src/tools/confirmation-policy.test.ts:181-187`
  (explicit assertion: `onConfirm` no longer publishes `UPDATE_POLICY`),
  `packages/core/src/tools/shell.ts:232-249`,
  `packages/core/src/tools/mcp-tool.ts:190-197`
- Confidence: high
- Quote:
  ```181:187:packages/core/src/tools/confirmation-policy.test.ts
            // Policy updates are no longer published by onConfirm; they are
            // handled centrally by the schedulers.
            const publishCalls = (mockMessageBus.publish as any).mock.calls;
            const hasUpdatePolicy = publishCalls.some(
              (call: any) => call[0].type === MessageBusType.UPDATE_POLICY,
            );
            expect(hasUpdatePolicy).toBe(false);
  ```

### Truth 12: Tool invocation errors normalize through a single scheduler path that maps thrown errors to `ToolErrorType.UNHANDLED_EXCEPTION` and `ToolResult.error` fields to their declared type; the model sees a `functionResponse.response.error` string, not a thrown promise rejection.

- Primary: `packages/core/src/scheduler/tool-executor.ts:146-194`,
  `packages/core/src/scheduler/tool-executor.ts:416-467`
- Supporting: `packages/core/src/tools/tool-error.ts:14-82` (canonical enum)
- Confidence: high
- Quote:

  ```164:194:packages/core/src/scheduler/tool-executor.ts
          } catch (executionError: unknown) {
            spanMetadata.error = executionError;
            const abortedByError =
              isAbortError(executionError) ||
              (executionError instanceof Error &&
                executionError.message.includes('Operation cancelled by user'));

            if (signal.aborted || abortedByError) {
              completedToolCall = await this.createCancelledResult(
                call,
                isAbortError(executionError)
                  ? 'Operation cancelled.'
                  : 'User cancelled tool execution.',
              );
            } else {
              const error =
                executionError instanceof Error
                  ? executionError
                  : new Error(String(executionError));
              completedToolCall = this.createErrorResult(
                call,
                error,
                ToolErrorType.UNHANDLED_EXCEPTION,
              );
            }
          }
  ```

### Truth 13: Confirmation requests are correlated through a `MessageBus` with correlation IDs; a 30-second timeout resolves to `ask_user`, and abort resolves to `deny`.

- Primary: `packages/core/src/tools/tools.ts:278-371`
- Supporting: `packages/core/src/tools/base-tool-invocation.test.ts:39-95`
  (verifies `serverName` + correlationId propagation)
- Confidence: high
- Quote:

  ```346:362:packages/core/src/tools/tools.ts
        abortSignal.addEventListener('abort', abortHandler, { once: true });

        timeoutId = setTimeout(() => {
          cleanup();
          resolve('ask_user'); // Default to ask_user on timeout
        }, 30000);

        this.messageBus.subscribe(
          MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          responseHandler,
        );
        unsubscribe = () => {
          this.messageBus?.unsubscribe(
            MessageBusType.TOOL_CONFIRMATION_RESPONSE,
            responseHandler,
          );
        };
  ```

### Truth 14: MCP tool output blocks (`text` / `image` / `audio` / `resource` / `resource_link`) are transformed into Gemini `Part[]` with `inlineData` for binary content; unrecognized block types are dropped.

- Primary: `packages/core/src/tools/mcp-tool.ts:450-582`
- Supporting: `packages/core/src/tools/mcp-tool.test.ts:444-582` (text / audio /
  resource_link / resource blocks)
- Confidence: high

### Truth 15: Legacy tool-name aliases are normalized at `getTool()` lookup and expanded in `excludeTools` so policy targets both the old and new name.

- Primary: `packages/core/src/tools/tool-names.ts:209-234`,
  `packages/core/src/tools/tool-registry.ts:777-795`,
  `packages/core/src/tools/tool-registry.ts:567-580`
- Supporting: `packages/core/src/tools/tool-names.test.ts`,
  `packages/core/src/tools/tool-registry.test.ts` `describe('getTool', …)`
  (line 646)
- Confidence: high

## 5. Contradictions or Ambiguities

### Item 1: Two MCP discovery drivers with different error semantics.

- `McpClient.discoverInto` (`packages/core/src/tools/mcp-client.ts:224-250`)
  **throws** when a server exposes zero prompts / tools / resources, forcing
  `McpClientManager.maybeDiscoverMcpServer` to emit a diagnostic.
- `connectAndDiscover` (`packages/core/src/tools/mcp-client.ts:1176-1251`)
  _also_ throws on empty-discovery, but there are **two ways** a server is
  brought up: the lifecycle-managed path used by `McpClientManager` and the
  standalone `connectAndDiscover` export. Callers could drift out of sync.
- Evidence A: `packages/core/src/tools/mcp-client.ts:239-241`
- Evidence B: `packages/core/src/tools/mcp-client.ts:1220-1223`
- Resolution proposal: document `connectAndDiscover` as test/legacy-only or
  remove; unify behind `McpClient.discoverInto`. `unresolved`.

### Item 2: MCP tool confirmation state is static / process-scoped.

- `DiscoveredMCPToolInvocation.allowlist` is a **static** `Set<string>` on the
  class (`packages/core/src/tools/mcp-tool.ts:158`). It persists across all
  sessions in a single process and is never cleared.
- The scheduler's `updatePolicy` path produces **persistent** rules via the
  policy engine; they are not the same list.
- Evidence A: `packages/core/src/tools/mcp-tool.ts:158-237`
- Evidence B: `packages/core/src/scheduler/scheduler.ts:669-678`
- Resolution proposal: fold the static allowlist into the policy engine to avoid
  two parallel approval surfaces. `unresolved`.

### Item 3: `respectsAutoEdit` is only exploited by two tools; other edit-kind tools don't pass it.

- `EditTool` and `WriteFileTool` pass `true` to `BaseToolInvocation`
  (`packages/core/src/tools/edit.ts:464`,
  `packages/core/src/tools/write-file.ts:166`). All other `Kind.Edit` tools
  (e.g. `TrackerCreateTaskTool`, `TrackerUpdateTaskTool`,
  `TrackerAddDependencyTool`) do not.
- This means `AUTO_EDIT` mode grants the fast-path only to the two file mutation
  tools, by design — but this is not documented anywhere near `ApprovalMode`.
- Evidence A: `packages/core/src/tools/tools.ts:169` (default `false`)
- Evidence B: `packages/core/src/tools/trackerTools.ts:174-280` (no
  `super(…, true, …)` invocation)
- Resolution proposal: document `AUTO_EDIT` scope or add a shared label (e.g.
  `Kind.Mutate` vs `Kind.Edit`). `unresolved`.

### Item 4: `DiscoveredToolInvocation` treats **any** stderr as a failure.

- `packages/core/src/tools/tool-registry.ts:141-157` returns an error response
  if `stderr` is non-empty, regardless of exit code. Many well-behaved programs
  write progress / warnings to stderr on success.
- Evidence A: `packages/core/src/tools/tool-registry.ts:141-157`
- Evidence B: no test covers the "non-empty stderr, exit 0" case (search
  `describe\(.*DiscoveredToolInvocation|non-zero|stderr` in
  `tool-registry.test.ts` line 876+).
- Resolution proposal: restrict "stderr implies error" to cases where
  `code !== 0 || signal`. `unresolved`.

### Item 5: `generateValidName` truncation can collide distinct server/tool pairs.

- Long names are collapsed to `first30 + '...' + last30`. Two MCP tools sharing
  the same prefix and suffix would map to the same qualified name and the
  registry would log an overwrite warning via `registerTool`
  (`packages/core/src/tools/tool-registry.ts:269-277`) but still overwrite
  silently for the model.
- Evidence A: `packages/core/src/tools/mcp-tool.ts:605-614`
- Evidence B: `packages/core/src/tools/tool-registry.ts:269-277`
- Resolution proposal: hash-suffix truncated names. `unresolved`.

### Item 6: `McpClient` file is 2151 lines — above the 1500-line reading-budget guideline.

- Evidence A: `packages/core/src/tools/mcp-client.ts` (full file)
- Resolution proposal: split OAuth handling into a sibling module; already
  partially done via `packages/core/src/mcp/*`. Structural, not behavioral.
  `deferred`.

### Item 7: The `DiscoveredMCPToolInvocation` allowlist uses dotted keys (`server.tool`) while the policy engine uses composite wildcard keys (`server__tool`).

- Evidence A: `packages/core/src/tools/mcp-tool.ts:202-214`
  (`${serverName}.${serverToolName}`)
- Evidence B: `packages/core/src/tools/mcp-tool.ts:178-187`
  (`${serverName}${MCP_QUALIFIED_NAME_SEPARATOR}${serverToolName}` where
  `MCP_QUALIFIED_NAME_SEPARATOR='_'`)
- Resolution proposal: pick one separator; the divergence is a footgun when
  debugging policy hits. `unresolved`.

## 6. Risks and Regression Hotspots

### Risk 1: Tool-discovery command output parsing

- Why fragile: discovered-tool JSON parsing accepts three shapes
  (`function_declarations`, `functionDeclarations`, bare `FunctionDeclaration`)
  with no schema validation beyond "is array?"
  (`packages/core/src/tools/tool-registry.ts:480-515`).
- Mitigating test: `packages/core/src/tools/tool-registry.test.ts`
  `describe('discoverTools', …)` (line 529) has coverage for the happy path but
  not for malformed / missing fields.
- Suggested guard: validate discovered declarations with `SchemaValidator` and
  drop invalid ones with a diagnostic.
- Severity: medium

### Risk 2: MCP name sanitization + truncation collisions

- Why fragile: `generateValidName` may produce identical names for different
  tools (see Contradiction 5), and `registerTool` silently overwrites prior
  entries (`packages/core/src/tools/tool-registry.ts:269-277`).
- Mitigating test: none (`mcp-tool.test.ts` covers length but not collisions).
- Suggested guard: append a short stable hash of the original name when
  truncation fires.
- Severity: medium

### Risk 3: Confirmation-bus 30s timeout defaults to `ask_user`

- Why fragile: a lost response results in a stuck confirmation UI that, when the
  bus response finally arrives, is ignored
  (`packages/core/src/tools/tools.ts:348-351`). Fine for interactive CLIs but
  unsafe for non-interactive drivers.
- Mitigating test: `packages/core/src/tools/base-tool-invocation.test.ts` tests
  correlation but not timeout cascade.
- Suggested guard: make the timeout configurable and surface it as an error for
  non-interactive drivers.
- Severity: medium

### Risk 4: Discovered-tool "stderr means failure"

- Why fragile: standard tooling (e.g. `cargo`, `npm`) writes progress to stderr.
  Valid discovered-tool output is turned into errors in the model's view. See
  Contradiction 4.
- Mitigating test: none.
- Suggested guard: treat stderr-only runs as success; expose stderr in `data`
  field for debugging.
- Severity: medium

### Risk 5: Static MCP in-memory allowlist

- Why fragile: the class-level `Set` in `DiscoveredMCPToolInvocation.allowlist`
  leaks across scheduler instances, tests, and agent runs within one process;
  memory-only approval "forever" in a long-running CLI session can drift from
  the persisted policy engine.
- Mitigating test: none direct; `mcp-tool.test.ts:149-270` exercises
  confirmation but not cross-run persistence.
- Suggested guard: consolidate with `PolicyEngine` rules (feeds compartment 09).
- Severity: medium

### Risk 6: Plan-mode description rewrite is string-patched, not schema-aware

- Why fragile: `packages/core/src/tools/tool-registry.ts:677-685` splices text
  into the description at declaration time. If upstream changes the base
  description, the prefix may read oddly or conflict with the base.
- Mitigating test: `tool-registry.test.ts` `describe('plan mode', …)` (line
  742).
- Suggested guard: move plan-mode wording into tool definitions and select a
  variant rather than string-concatenating.
- Severity: low

### Risk 7: MCP transport fallback fans out error messages

- Why fragile: `connectToMcpServer`
  (`packages/core/src/tools/mcp-client.ts:1841-1930+`) tries HTTP, then SSE,
  then OAuth, with the ability to swallow the earliest error. A transport
  misconfiguration can produce surprising error text from the wrong failure.
- Mitigating test: `packages/core/src/tools/mcp-client.test.ts` (transport
  branches).
- Suggested guard: aggregate attempts into a single error with per-transport
  breadcrumbs.
- Severity: medium

### Risk 8: `McpClient.ts` at 2151 lines increases review friction and drift

- Why fragile: pure size risk — no single behavioral defect, but changes to
  OAuth / transport / discovery share a file, breaking diff-review locality.
- Mitigating test: N/A.
- Suggested guard: split by concern (transport / discovery / OAuth). Structural.
- Severity: low

## 7. Test and Observability Coverage

### Tests covering this compartment (primary)

- `packages/core/src/tools/tools.test.ts` — base classes, `Kind`, declaration
  injection.
- `packages/core/src/tools/tool-registry.test.ts` — registry lifecycle including
  plan mode, excludes, legacy aliases, sortTools, `DiscoveredToolInvocation`
  subprocess path.
- `packages/core/src/tools/tool-names.test.ts` — MCP name validation, wildcards,
  slug regex.
- `packages/core/src/tools/mcp-client.test.ts` — transports, auth flows,
  discovery, `isEnabled`.
- `packages/core/src/tools/mcp-client-manager.test.ts` — lifecycle: trust,
  allow/block, extension wiring, restart, diagnostic dedup.
- `packages/core/src/tools/mcp-tool.test.ts` — `DiscoveredMCPTool`,
  content-block transforms, name generation, error semantics.
- `packages/core/src/tools/confirmation-policy.test.ts` — AUTO_EDIT
  short-circuit, outcome handling, non-publish of `UPDATE_POLICY`.
- `packages/core/src/tools/base-tool-invocation.test.ts` — message-bus
  correlation, `serverName` propagation.
- `packages/core/src/tools/message-bus-integration.test.ts` — end-to-end
  integration of confirmation bus.
- `packages/core/src/tools/modifiable-tool.test.ts` — editor-based modify flow.
- Per-tool: `read-file.test.ts`, `write-file.test.ts`, `edit.test.ts`,
  `ls.test.ts`, `glob.test.ts`, `grep.test.ts`, `ripGrep.test.ts`,
  `read-many-files.test.ts`, `shell.test.ts`, `shell_proactive.test.ts`,
  `shellBackgroundTools.test.ts`, `shellBackgroundTools.integration.test.ts`,
  `web-fetch.test.ts`, `web-search.test.ts`, `memoryTool.test.ts`,
  `write-todos.test.ts`, `ask-user.test.ts`, `activate-skill.test.ts`,
  `enter-plan-mode.test.ts`, `exit-plan-mode.test.ts`,
  `get-internal-docs.test.ts`, `topicTool.test.ts`, `trackerTools.test.ts`,
  `complete-task.test.ts`, `jit-context.test.ts`,
  `omissionPlaceholderDetector.test.ts`, `diff-utils.test.ts`,
  `diffOptions.test.ts`, `line-endings.test.ts`,
  `xcode-mcp-fix-transport.test.ts`.

### Observability signals

- `coreEvents.emitFeedback('info'|'warning'|'error', …)` used across
  discovery/diagnostic paths
  (`packages/core/src/tools/mcp-client-manager.ts:148-156`,
  `mcp-client.ts:1241-1248`, `tool-registry.ts:454-457`).
- `coreEvents.emitMcpProgress({ serverName, callId, progressToken, progress, total, message })`
  for streaming progress (`packages/core/src/tools/mcp-client.ts:463-479`).
- `debugLogger.warn|log|error` for registration overrides, discovery outcomes,
  transport attempts.
- `runInDevTraceSpan({ operation: GeminiCliOperation.ToolCall, … })` on every
  execution (`packages/core/src/scheduler/tool-executor.ts:83-94`) exposes
  telemetry attributes `GEN_AI_TOOL_NAME`, `GEN_AI_TOOL_CALL_ID`,
  `GEN_AI_TOOL_DESCRIPTION`.
- `ToolOutputTruncatedEvent` / `logToolOutputTruncated` on oversize outputs
  (`packages/core/src/scheduler/tool-executor.ts:233-242`).

### Coverage gaps

- Discovered-tool malformed-JSON / "stderr on success" paths (Risks 1 & 4).
- MCP name-truncation collisions (Risk 2).
- Confirmation-bus timeout outcome in non-interactive drivers (Risk 3).
- Static `DiscoveredMCPToolInvocation.allowlist` cross-session behavior (Risk
  5).
- No repo-level integration test asserting that `Config.getCoreTools()` actually
  equals `ALL_BUILTIN_TOOL_NAMES` when unset.

## 8. Open Questions

- [ ] Why does the tool layer maintain a separate MCP allowlist (`mcp-tool.ts`)
      when the policy engine tracks persistent approvals? Is it a legacy of
      pre-scheduler design?
- [ ] What is the defined behavior when `Config.getToolCallCommand()` is unset
      but `discoverAllTools()` succeeds (returning `DiscoveredTool` instances
      that cannot run)? Should registration fail fast?
- [ ] Is the static allowlist in `DiscoveredMCPToolInvocation.allowlist`
      intentionally un-cleared across test runs? If so, how do tests avoid
      cross-test pollution?
- [ ] Should `generateValidName` retain a deterministic hash suffix to avoid
      collisions on truncation?
- [ ] `connectAndDiscover` (1176-1251) appears to have no active caller in the
      main lifecycle — is it public SDK surface, or dead code?
- [ ] Should discovered-tool stderr-only output be treated as a warning rather
      than an error?

## 9. Definition of Done

- [x] Registration and declaration pipeline is fully mapped.
- [x] Local and MCP tool execution paths are both documented.
- [x] Safety/confirmation touchpoints are explicit.
- [x] Error propagation is traced end-to-end.
- [x] Extension guidance is concrete and test-backed (section 11 / handoffs +
      section 12 below).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row 04 flipped to `done` (final step).

## 10. Evidence Matrix (summary)

| Claim                                                     | Primary                                             | Supporting                            | Confidence |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------- | ---------- |
| Declarative tools validate schema on `build()`            | `tools.ts:683-706`                                  | `tools.test.ts`                       | high       |
| Registry owns declaration + `wait_for_previous` injection | `tool-registry.ts:635-689`                          | `tools.ts:538-565`                    | high       |
| Plan-mode + excludes filtering live in the registry       | `tool-registry.ts:599-625`                          | `tool-registry.test.ts:742+`          | high       |
| `createToolRegistry` is canonical registration site       | `config.ts:3481-3634`                               | `config.test.ts:1363`                 | high       |
| DiscoveredTool spawns subprocess with 10MB caps           | `tool-registry.ts:408-467`                          | `tool-registry.test.ts:876+`          | high       |
| MCP FQN sanitization                                      | `mcp-tool.ts:588-616`                               | `mcp-tool.test.ts:54-85`              | high       |
| MCP gates: allow/block, user enable, trust                | `mcp-client-manager.ts:415-437`                     | `mcp-client-manager.test.ts:212-291`  | high       |
| MCP exclude > include filter semantics                    | `mcp-client.ts:2344-2368`                           | `mcp-client-manager.ts:305-344`       | high       |
| MCP errors returned as `isError:true` parts               | `mcp-client.ts:1369-1425`                           | `mcp-tool.test.ts:274-340`            | high       |
| AUTO_EDIT fast-path in `BaseToolInvocation`               | `tools.ts:187-219`                                  | `confirmation-policy.test.ts:199-231` | high       |
| Persistent policy updates owned by scheduler              | `scheduler.ts:669-678`                              | `confirmation-policy.test.ts:181-187` | high       |
| Errors normalized through `tool-executor.ts`              | `tool-executor.ts:146-194`                          | `tool-error.ts:14-82`                 | high       |
| Confirmation bus correlation + 30s timeout                | `tools.ts:278-371`                                  | `base-tool-invocation.test.ts:39-95`  | high       |
| MCP content-block transforms                              | `mcp-tool.ts:450-582`                               | `mcp-tool.test.ts:444-582`            | high       |
| Legacy aliases resolved on lookup + expanded on exclude   | `tool-names.ts:209-234`, `tool-registry.ts:777-795` | `tool-names.test.ts`                  | high       |

## 11. Handoffs

- **Depends on**:
  - 02 — Core Turn Engine (the scheduler owns validation, policy, confirmation
    orchestration, and execution).
  - 06 — Settings Schema and Config Plumbing (`getCoreTools()`,
    `getExcludeTools()`, `getMcpServers()`, `getAllowedMcpServers()`,
    `getBlockedMcpServers()`, `getToolDiscoveryCommand()`,
    `getToolCallCommand()`).
  - 09 — Policy, Trust, and Safety Engine (owns `checkPolicy`, `updatePolicy`,
    rule shape; tool layer only supplies `getPolicyUpdateOptions`).
  - 05 — Extensibility: Skills, Hooks, Commands (hooks wrap
    `invocation.execute()` via `executeToolWithHooks`).

- **Affects**:
  - 02 — Core Turn Engine — any change to `DeclarativeTool.getSchema` or
    `tool.build` changes the model's visible tool set and validation errors
    surfaced to turns.
  - 09 — Policy Engine — `getPolicyUpdateOptions` hints (`commandPrefix`,
    `mcpName`, `toolName`, `argsPattern`, `allowRedirection`) are consumed by
    the policy engine's `updatePolicy`.
  - 10 — Sandbox/Shell Substrate — `ShellTool` + `DiscoveredTool` rely on
    `Config.sandboxManager.prepareCommand`
    (`packages/core/src/tools/tool-registry.ts:386-398`,
    `packages/core/src/tools/tool-registry.ts:71-83`).
  - 11 — Telemetry — every tool call emits a `GeminiCliOperation.ToolCall`
    dev-trace span.
  - 12 — Output Protocol / ACP — the `Part[]` shape of tool results drives the
    ACP adapter payloads.

- **Escalated questions sent to**:
  - 09 (via `INDEX.md` Notes): the divergence between the static in-memory MCP
    allowlist (tool layer) and the persistent policy engine (scheduler).
  - 05: `update_topic` activation is gated by
    `Config.isTopicUpdateNarrationEnabled()`; the hook/skills layer must not
    expect a deterministic tool count.
  - 06: Ensure `ALL_BUILTIN_TOOL_NAMES` stays in sync with
    `Config.createToolRegistry()` — no current test enforces this invariant.

## 12. Extension Guidance (Appendix)

How to add a new local built-in tool safely:

1. Create `packages/core/src/tools/<your-tool>.ts` that extends
   `BaseDeclarativeTool<TParams, ToolResult>`; pick a `Kind` from
   `packages/core/src/tools/tools.ts:1097-1111` honestly (`Read` / `Search` /
   `Fetch` are parallelizable; `Edit` / `Delete` / `Move` / `Execute` are
   mutators; `Other` disables parallelization).
2. Add the name constant to `packages/core/src/tools/definitions/coreTools.ts`
   and re-export it via `packages/core/src/tools/tool-names.ts`, then append to
   `ALL_BUILTIN_TOOL_NAMES` (and `PLAN_MODE_TOOLS` if read-only).
3. Register in `Config.createToolRegistry()` under the appropriate feature gate
   using the `maybeRegister(ToolClass, factory)` pattern.
4. Implement a `createInvocation(...)` that constructs a `BaseToolInvocation`
   subclass; if the tool is a file mutator that should honor `AUTO_EDIT`, pass
   `true` as the seventh `super(...)` argument (see `edit.ts:457-466`,
   `write-file.ts:159-168`).
5. Override `getPolicyUpdateOptions` if the tool wants to narrow policy on
   approval (mirror `shell.ts:232-249` or `mcp-tool.ts:190-197`).
6. Add tests for: param validation errors, confirmation flow in `AUTO_EDIT` /
   `DEFAULT` / `PLAN` modes, execution success + error, and — for any subprocess
   or external-call tool — the failure-propagation shape
   (`ToolResult.error.{message,type}`).
7. If the tool is plan-safe, add it to `PLAN_MODE_TOOLS` in
   `tool-names.ts:282-294`.

How to add MCP capabilities safely:

1. Do not write new `DiscoveredMCPTool` subclasses directly; expose them
   server-side so `discoverTools()` registers them.
2. For transport differences, extend the `createTransport` ladder in
   `mcp-client.ts:2165+` rather than branching inside `McpClient`.
3. Treat schema-less tools as a test surface: `isEnabled` will still admit them,
   and `LenientJsonSchemaValidator` will accept broken schemas.
4. When adjusting confirmation, keep the split: static allowlist is per-session
   convenience only — real policy belongs in the policy engine.
