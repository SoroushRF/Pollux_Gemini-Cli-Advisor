# Compartment Report: 12 — Output Protocol and ACP Adapters

## Metadata

- **Compartment**: 12 — Output Protocol and ACP Adapters
- **Tier**: T3
- **Guideline file**: `12-output-protocol-and-acp-adapters.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: c8127045c5832b0e66cb1efd04e0dd6800ce78e7
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                | Exists? | Notes (only if material)             |
| --------------------------------------------------- | ------- | ------------------------------------ |
| `packages/core/src/output/types.ts`                 | yes     |                                      |
| `packages/core/src/output/json-formatter.ts`        | yes     |                                      |
| `packages/core/src/output/stream-json-formatter.ts` | yes     |                                      |
| `packages/cli/src/nonInteractiveCli.ts`             | yes     |                                      |
| `packages/cli/src/nonInteractiveCliAgentSession.ts` | yes     | agent-session non-interactive driver |
| `packages/cli/src/acp/acpClient.ts`                 | yes     |                                      |
| `packages/cli/src/acp/commandHandler.ts`            | yes     |                                      |
| `packages/cli/src/acp/commands/commandRegistry.ts`  | yes     |                                      |
| `packages/cli/src/acp/acpErrors.ts`                 | yes     |                                      |
| `integration-tests/json-output.test.ts`             | yes     |                                      |
| `integration-tests/stdout-stderr-output.test.ts`    | yes     |                                      |

## 1. Scope and Boundary

This compartment owns the translation layer from internal runtime events into
external output contracts: the `text` / `json` / `stream-json` formats produced
by `nonInteractiveCli.ts`, and the ACP (Agent Client Protocol) RPC surface
served by `acpClient.ts`. Output schema types live in
`packages/core/src/output`; protocol commands and dispatch live in
`packages/cli/src/acp`. Both are stable external contracts that must not regress
when Pollux toggles.

Explicitly handed off: core turn generation semantics (compartment 02),
interactive UI rendering and slash command surface (compartment 01), tool
implementation details (compartment 04), and downstream SDK/A2A consumer
behavior (compartment 13).

## 2. Runtime Flow Summary

### Non-interactive output dispatch

1. Branch on agent-session feature flag:
   `packages/cli/src/nonInteractiveCli.ts:59-65` delegates to
   `runNonInteractiveAgentSession` when enabled.
2. Legacy path constructs `StreamJsonFormatter` only when
   `getOutputFormat() === STREAM_JSON`:
   `packages/cli/src/nonInteractiveCli.ts:101-105`.
3. Per-event routing maps `GeminiEventType` events to JSONL events for
   stream-json, accumulates `responseText` for `JSON`, and writes `TextOutput`
   for `TEXT`: `packages/cli/src/nonInteractiveCli.ts:236-244`, `:317-370`.
4. `JsonFormatter.format` assembles final `JsonOutput` with optional
   `session_id`/`response`/`stats`/`error` and stringifies:
   `packages/core/src/output/json-formatter.ts:12-38`.
5. `StreamJsonFormatter.emitEvent` writes one minified JSON object plus newline
   (JSONL) per event in call order:
   `packages/core/src/output/stream-json-formatter.ts:24-34`.
6. Final stream stats are converted from `SessionMetrics` + duration before the
   `result` event: `packages/core/src/output/stream-json-formatter.ts:43-87`.
7. Agent-session non-interactive maps the `AgentEvent` union to the same
   `JsonStreamEventType` values:
   `packages/cli/src/nonInteractiveCliAgentSession.ts:418-591`; non-output
   `session_update` / `custom` events are explicitly ignored at `:593-602`.
8. Errors from any path flow through `handleError` in
   `packages/cli/src/utils/errors.ts:66-109`, which selects the JSON branch via
   `JsonFormatter.formatError`.

### ACP request handling

1. Stdio transport bootstrap creates `ndJsonStream` and an `AgentSideConnection`
   with the `GeminiAgent` handler: `packages/cli/src/acp/acpClient.ts:99-108`;
   cleanup hook at `:110-113`.
2. RPC entry points implemented on `GeminiAgent`: `initialize` (`:136-198`),
   `authenticate` (`:200-261`), `newSession` (`:263-362`), `loadSession`
   (`:364-422`), `cancel` (`:530-536`), `prompt` (`:538-544`), `setSessionMode`
   (`:546-554`), `unstable_setSessionModel` (`:556-564`).
3. Per-session work runs inside `Session.prompt`
   (`packages/cli/src/acp/acpClient.ts:692-935`), with `/` or `$` prefixed input
   dispatched to `handleCommand` (`:937-956`).
4. `CommandHandler.handleCommand` parses the slash command, runs it through the
   ACP-only registry, and forwards string/`content`/JSON-stringified data via
   `context.sendMessage`: `packages/cli/src/acp/commandHandler.ts:45-92`.
5. Outbound updates go through `Session.sendUpdate` → `connection.sessionUpdate`
   (`packages/cli/src/acp/acpClient.ts:958-965`), and tool/path prompts use
   `connection.requestPermission` (e.g. `:1078-1080`, `:1386-1388`).
6. ACP-side errors are normalized by `getAcpErrorMessage` which unwraps nested
   JSON error shapes: `packages/cli/src/acp/acpErrors.ts:14-44`.

## 3. Key Files and Citations

| Path                                                | Role                          | Notes                                                         |
| --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `packages/core/src/output/types.ts`                 | output schema source of truth | Defines `OutputFormat`, `JsonOutput`, `JsonStreamEvent` union |
| `packages/core/src/output/json-formatter.ts`        | terminal JSON assembler       | One-shot JSON; ANSI-stripped response; error wrapping         |
| `packages/core/src/output/stream-json-formatter.ts` | JSONL streamer                | One event per line; no internal sequencing logic              |
| `packages/cli/src/nonInteractiveCli.ts`             | legacy headless driver        | Selects format and maps `GeminiEventType` → events            |
| `packages/cli/src/nonInteractiveCliAgentSession.ts` | agent-session headless driver | Maps `AgentEvent` to same JSONL contract                      |
| `packages/cli/src/acp/acpClient.ts`                 | ACP server / session loop     | Request handlers + per-session prompt loop                    |
| `packages/cli/src/acp/commandHandler.ts`            | ACP command dispatcher        | Narrow registry; differs from interactive `CommandService`    |
| `packages/cli/src/acp/acpErrors.ts`                 | ACP error normalizer          | Recursively unwraps nested JSON error payloads                |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-12.1** — `OutputFormat` is a closed enum (`text`, `json`, `stream-json`)
  and the JSON stream taxonomy (`init`, `message`, `tool_use`, `tool_result`,
  `error`, `result`) is centralized in `types.ts`; no advisor/escalation event
  type exists today.
  - Primary: `packages/core/src/output/types.ts:9-13`
  - Supporting: `packages/core/src/output/types.ts:28-116` (event union)
  - Confidence: high
- **VT-12.2** — `JsonFormatter.format` builds `JsonOutput` with optional
  `session_id`, ANSI-stripped `response`, `stats`, and `error`, then
  `JSON.stringify(..., null, 2)`; `formatError` reuses the same path with an
  empty response.
  - Primary: `packages/core/src/output/json-formatter.ts:12-38`
  - Supporting: `packages/core/src/output/json-formatter.test.ts:141-184` (test)
  - Confidence: high
- **VT-12.3** — `StreamJsonFormatter` writes one minified JSON object plus
  newline per event; ordering is enforced by the caller, not by the formatter
  itself.
  - Primary: `packages/core/src/output/stream-json-formatter.ts:24-34`
  - Supporting: `packages/core/src/output/stream-json-formatter.test.ts:515-569`
    (test)
  - Confidence: high
- **VT-12.4** — Legacy and agent-session non-interactive drivers emit the same
  JSONL contract from two different upstream event unions:
  `nonInteractiveCli.ts` maps `GeminiEventType`,
  `nonInteractiveCliAgentSession.ts` maps `AgentEvent`.
  - Primary: `packages/cli/src/nonInteractiveCli.ts:317-370`
  - Supporting: `packages/cli/src/nonInteractiveCliAgentSession.ts:418-591`
    (agent driver)
  - Confidence: high
- **VT-12.5** — ACP `Session.prompt` accepts both `/` and `$` as command
  prefixes and routes through the ACP-only `CommandHandler` registry (Memory,
  Extensions, Init, Restore, About, Help) — not the interactive `CommandService`
  loader chain.
  - Primary: `packages/cli/src/acp/acpClient.ts:692-735`
  - Supporting: `packages/cli/src/acp/commands/commandRegistry.ts:23-38`
    (registry)
  - Confidence: high
- **VT-12.6** — Non-output agent events (`session_update`, `custom`, etc.) are
  explicitly ignored by the agent-session non-interactive driver; new Pollux
  signals would require either new ignore-cases or new `JsonStreamEventType`
  members.
  - Primary: `packages/cli/src/nonInteractiveCliAgentSession.ts:593-602`
  - Confidence: high

**Contradictions or ambiguities**

- **C-12.1** — Spec implies a unified output path, but two non-interactive
  drivers exist with parallel translation tables. Evidence:
  `packages/cli/src/nonInteractiveCli.ts:59-65`,
  `packages/cli/src/nonInteractiveCliAgentSession.ts:290-313`. Resolution:
  deferred — must coordinate with compartment 03 on AgentSession migration.
- **C-12.2** — ACP command surface diverges from CLI slash command surface
  (narrow ACP registry vs full `CommandService` loader chain). Evidence:
  `packages/cli/src/acp/commandHandler.ts:23-31`,
  `packages/cli/src/nonInteractiveCliCommands.ts:43-50`. Resolution: unresolved
  — Pollux's `/pollux` would need to be registered in both places to be
  reachable from ACP.

## 5. Risks and Open Questions

**Risks**

- **R-12.1** — Adding a Pollux advisor-escalation event will require a
  coordinated change to `JsonStreamEventType` and both non-interactive drivers;
  without it, escalations will be silently dropped under stream-json. Severity:
  medium. Mitigating test: `no test`. Suggested guard: assert each new event
  type round-trips through `integration-tests/json-output.test.ts`.
- **R-12.2** — Tool/permission requests in ACP go through
  `connection.requestPermission` rather than the in-process policy engine; if
  Pollux registers `advisor_consultation` as a synthetic tool, ACP clients may
  receive an unexpected permission prompt. Severity: medium. Mitigating test:
  `packages/cli/src/acp/acpClient.test.ts` (covers permission flow). Suggested
  guard: classify advisor as non-prompting in the policy engine (handoff to 09).
- **R-12.3** — `nonInteractiveCliAgentSession.ts:593-602` silently drops
  unrecognized `AgentEvent` types; future Pollux events that piggyback on
  `custom` will be invisible to stream-json consumers. Severity: medium.
  Mitigating test: `no test`. Suggested guard: add a switch-exhaustiveness check
  or an "unknown event" warning emit.
- **R-12.4** — `StreamJsonFormatter` performs no sequencing; out-of-order calls
  (e.g., from a Pollux interceptor that re-orders Turn events) would produce a
  malformed stream. Severity: medium. Mitigating test:
  `packages/core/src/output/stream-json-formatter.test.ts:515-569`. Suggested
  guard: keep the interceptor strictly upstream of formatter calls.

**Open questions**

- [ ] **OQ-12.1** — Should `advisor_consultation` invocations surface as
      `tool_use` / `tool_result` events or as a new event kind? Escalate to
      compartment 02 and 04.
- [ ] **OQ-12.2** — Does ACP need a parallel registration for `/pollux`, or do
      clients drive it through `prompt` text only? Escalate to compartment 13.

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/output/json-formatter.test.ts`: shape, ANSI stripping,
    error wrapping, stats merging.
  - `packages/core/src/output/stream-json-formatter.test.ts`: JSONL framing, all
    event types, stats conversion.
  - `packages/cli/src/acp/acpErrors.test.ts`: nested JSON error unwrapping.
  - `packages/cli/src/acp/commandHandler.test.ts`: slash command parsing and
    dispatch.
  - `packages/cli/src/acp/acpClient.test.ts`: protocol/session behavior.
  - `packages/cli/src/nonInteractiveCli.test.ts`: legacy driver branches per
    `OutputFormat`.
  - `integration-tests/json-output.test.ts`: end-to-end JSON contract;
    auth-error JSON.
  - `integration-tests/stdout-stderr-output.test.ts`: stream split between
    stdout/stderr.
- **Observability signals**:
  `JsonStreamEventType.{init,message,tool_use,tool_result,error,result}` events
  on stdout; ACP `connection.sessionUpdate` notifications.
- **Coverage gaps**:
  - Pollux-specific advisor/escalation event types (R-12.1, R-12.3).
  - ACP advisor permission flow (R-12.2).
  - No regression test asserting both non-interactive drivers emit identical
    JSONL for equivalent input (C-12.1).

## 7. Definition of Done

- [x] Output contracts for all modes are explicit.
- [x] Event-to-output translation is evidence-backed.
- [x] ACP adaptation behavior is mapped.
- [x] Compatibility risks are documented.
- [x] Contract-change verification checklist is complete (R-12.1 / R-12.3 list
      checks).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Sidecar populated at
      `reports/12-output-protocol-and-acp-adapters/report.json`.
- [x] `INDEX.md` row 12 flipped to `done`.

## 8. Handoffs

- **Depends on**: 02, 01
- **Affects**: 13, 04
- **Escalated to**: 02 — advisor event-type design (OQ-12.1); 13 — ACP `/pollux`
  reachability (OQ-12.2).
