# Compartment Report: 02 — Core Turn Engine

## Metadata

- **Compartment**: 02 — Core Turn Engine
- **Guideline file**: `02-core-turn-engine.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: `58c7bffacfb71bd297a6b71a7710bae159c9178f`
- **Upstream base commit**: `05f3b38c1b4f96ef722c588280cdbdc835d77b31`
  (pre-framework commit; upstream remotes not inspected in this pass)

## 0. Pre-flight

Path validation results from `AGENT_RUNBOOK.md` Step B.

| Path                                                      | Exists? | Notes                                                                                    |
| --------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `packages/core/src/core/client.ts`                        | yes     | 1142 lines; `GeminiClient` class from L92                                                |
| `packages/core/src/core/turn.ts`                          | yes     | 386 lines; `Turn` class from L238, `GeminiEventType` enum at L52                         |
| `packages/core/src/core/contentGenerator.ts`              | yes     | 269 lines; interface at L35, factory `createContentGenerator` at L165                    |
| `packages/core/src/core/geminiChat.ts`                    | yes     | 995 lines; `GeminiChat` class at L245; `sendMessageStream` at L304                       |
| `packages/core/src/core/baseLlmClient.ts`                 | yes     | 364 lines; `BaseLlmClient` at L117, `generateJson` at L124, `generateContent` at L228    |
| `packages/core/src/core/tokenLimits.ts`                   | yes     | 29 lines; flat 1 048 576 for all known models                                            |
| `packages/core/src/services/chatRecordingService.ts`      | yes     | 793 lines; `recordMessageTokens` at L486                                                 |
| `packages/core/src/core/client.test.ts`                   | yes     | 3226 lines; dedicated `sendMessageStream` describe at L718                               |
| `packages/core/src/core/turn.test.ts`                     | yes     | 822 lines; event-ordering + retry + abort coverage                                       |
| `packages/core/src/core/geminiChat.test.ts`               | yes     | 2371 lines; not exhaustively surveyed in this report (see Open Questions)                |
| `packages/core/src/core/geminiChat_network_retry.test.ts` | yes     | 459 lines; connection + mid-stream retry coverage                                        |
| `packages/core/src/core/loggingContentGenerator.ts`       | yes     | **Added by analyst** — critical for token capture flow; not in guideline's Primary paths |
| `packages/core/src/core/recordingContentGenerator.ts`     | yes     | **Added by analyst** — optional response-recording decorator                             |
| `packages/core/src/telemetry/llmRole.ts`                  | yes     | **Added by analyst** — `LlmRole` enum carried end-to-end through the CG chain            |

All guideline-listed paths resolve. Two analyst-added files
(`loggingContentGenerator.ts`, `llmRole.ts`) are so central to the "where is
token usage captured" question that omitting them would leave a factual gap;
they're covered in sections 4–5.

## 1. Scope and Boundary

Unchanged from guideline. In scope:

- Client turn orchestration (`client.ts`).
- Turn event generation (`turn.ts`).
- Content-generator chain behavior (`contentGenerator.ts`,
  `loggingContentGenerator.ts`, `recordingContentGenerator.ts`,
  `geminiChat.ts`).
- Request/retry and turn lifecycle semantics (`geminiChat.ts` mid-stream
  retries + `client.ts` availability/fallback retries).
- Token/usage capture origin in the core stream layer (`geminiChat.ts:915-921`,
  `loggingContentGenerator.ts:396-399/576-580`,
  `chatRecordingService.ts:486-515`).

Out of scope, handed off per guideline Boundary notes:

- Stream rendering in the CLI hook and non-interactive loop → compartment 01.
- Model selection policy (router, strategies, availability, fallback mechanics)
  → compartment 07.
- Tool execution internals → compartment 04.
- Telemetry export/sampling/sanitization → compartment 11.

## 2. Runtime Flow Summary

The core turn spine runs in this order. Every step is cited in Verified Truths
below.

1. **Entry**: `GeminiClient.sendMessageStream` at
   `packages/core/src/core/client.ts:883-1039` is the public streaming entry; it
   resets per-turn config (`L893`), keys the prompt for hook state (`L899-904`),
   fires the `BeforeAgent` hook (`L906-934`), then drives a single call to
   `processTurn` (`L941`).
2. **Dispatch**: `processTurn` at `packages/core/src/core/client.ts:593-881` is
   invoked as `yield*`, so its events pass directly through `sendMessageStream`
   to the caller.
3. **Session guardrails**: `processTurn` increments `sessionTurnCount` (`L604`)
   and yields `MaxSessionTurns` if the configured session cap is exceeded
   (`L605-611`). Early exit if `boundedTurns === 0` (`L613-615`).
4. **Context shaping**: If `contextManagementConfig.enabled`, history is
   reshaped via `AgentHistoryProvider.manageHistory` (`L620-627`). Otherwise
   `tryCompressChat` runs (`L629`) and may yield a `ChatCompressed` event
   (`L631-633`). Tool outputs may then be masked (`L639`).
5. **Overflow gate**: Estimated request tokens are compared to
   `tokenLimit(model) - lastPromptTokenCount` (`L636-637`,
   `packages/core/src/core/tokenLimits.ts:20-33`); if over budget, yield
   `ContextWindowWillOverflow` and return (`L649-655`).
6. **IDE context injection**: If `ideMode` is on and there is no pending tool
   call, IDE context parts are appended as a synthetic user message to history
   (`L657-682`).
7. **Turn construction**: A fresh `Turn` is built with the updated chat (`L685`,
   constructor at `packages/core/src/core/turn.ts:247-250`). A linked
   `AbortController` is composed with the inbound signal (`L687-688`).
8. **Pre-turn loop detection**: `LoopDetectionService.turnStarted(signal)` runs
   (`L690`). Count `> 1` yields `LoopDetected`; count `== 1` either hits the
   turn cap (`MaxSessionTurns`) or recursively runs `_recoverFromLoop`
   (`L691-707`).
9. **Routing**: A sticky model (`currentSequenceModel`, `L719`) or the router's
   decision (`this.config.getModelRouterService().route(routingContext)` at
   `L722-724`) determines `modelToUse`. Availability policy re-resolves via
   `applyModelSelection` (`L732-737`).
10. **Model announcement**: The first turn in a sequence yields `ModelInfo`
    (`L739-741`) and stores stickiness (`L742`). Tools are refreshed for the
    chosen model (`L745`).
11. **Stream execution**:
    `turn.run(modelConfigKey, request, linkedSignal, displayContent)` at
    `client.ts:747-752` delegates to `Turn.run` at `turn.ts:253-404`.
12. **Inner chunk loop**: `Turn.run` awaits `this.chat.sendMessageStream(...)`
    (`turn.ts:263-270`) — `GeminiChat.sendMessageStream` at
    `geminiChat.ts:304-490`. For each `StreamEvent`:
    - `retry` → yield `GeminiEventType.Retry` (`turn.ts:279-282`).
    - `agent_execution_stopped` → yield that event and return (terminal,
      `turn.ts:284-290`).
    - `agent_execution_blocked` → yield and **continue** consuming
      (`turn.ts:292-298`).
    - `chunk` → for each candidate part, emit `Thought` events (`L309-318`), a
      single `Content` event for consolidated text (`L320-323`), and one
      `ToolCallRequest` event per `functionCall` (`L326-332`). Citations are
      accumulated. When a `finishReason` is present, emit an optional `Citation`
      event and a final `Finished` event carrying `usageMetadata` (`L339-359`).
13. **Outer event consumption**: `processTurn` consumes the inner stream at
    `client.ts:758-783`. Before re-yielding, it runs
    `loopDetector.addAndCheck(event)` (`L759`); count `> 1` aborts via the
    linked controller and yields `LoopDetected` (`L760-763`); count `== 1` falls
    through to `_recoverFromLoop` (`L764-772`). After each yielded event,
    `updateTelemetryTokenCount` pushes the latest prompt token count to
    `uiTelemetryService` (`L775`, helper at `L243-249`). `InvalidStream` and
    `Error` events are also observed for post-loop routing.
14. **Error short-circuit**: If an `Error` event was seen, `processTurn` returns
    (`L802-804`).
15. **InvalidStream retry**: If the stream was invalid and
    `continueOnFailedApiCall` is set, recursively call
    `sendMessageStream(['System: Please continue.'])` once (`L820-845`). Second
    failure logs `ContentRetryFailureEvent` and returns.
16. **Next-speaker continuation**: If there are no pending tool calls, not
    aborted, no quota error, and `checkNextSpeaker` returns `'model'`,
    recursively call `sendMessageStream([{text: 'Please continue.'}])` with
    `boundedTurns - 1` (`L847-879`). This is the automatic continuation loop
    that together with step 15 is bounded by `MAX_TURNS = 100` (`client.ts:78`).
17. **After-agent hook** (outer): Back in `sendMessageStream`, after
    `processTurn` resolves, `fireAfterAgentHookSafe` is called (`L952-957`). If
    the hook requests stop, yield `AgentExecutionStopped` and optionally reset
    chat (`L962-977`). If it requests block (continue with rationale), yield
    `AgentExecutionBlocked`, optionally reset chat, and recursively call
    `sendMessageStream(continueReason)` with `stopHookActive=true`
    (`L979-1012`). The `finally` clause manages `hookStateMap` lifecycle and
    cleanup on pending tools or abort (`L1020-1036`).

Summary of event ordering **within a single `Turn.run`**: `Retry`? →
`AgentExecutionStopped|Blocked`? → (`Thought*`, `Content?`, `ToolCallRequest*`,
`Citation?`, `Finished?`) per chunk, with
`UserCancelled`/`InvalidStream`/`Error` as terminal fallbacks.

## 3. Key Files and Citations

| Path                                                      | Role                                                                                              | Notes                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/core/client.ts`                        | Turn orchestration + session control + retry/continuation driver                                  | `MAX_TURNS = 100` at `:78`; `sendMessageStream` at `:883`; `processTurn` at `:593` |
| `packages/core/src/core/turn.ts`                          | Event taxonomy (`GeminiEventType`) and per-turn streaming generator                               | `Turn.run` at `:253`; handlePendingFunctionCall at `:406`                          |
| `packages/core/src/core/geminiChat.ts`                    | Chat session, history, mid-stream retries, hook integration, token capture                        | `sendMessageStream` at `:304`; `processStreamResponse` at `:877`; token at `:915`  |
| `packages/core/src/core/contentGenerator.ts`              | `ContentGenerator` interface + factory that composes the decorator chain                          | Logging wrapper always; Recording wrapper optional; see `:165-303`                 |
| `packages/core/src/core/loggingContentGenerator.ts`       | Always-on decorator that emits `ApiRequestEvent`/`ApiResponseEvent`/`ApiErrorEvent`               | Token attribution via `LlmRole` at `:393, :494`                                    |
| `packages/core/src/core/recordingContentGenerator.ts`     | Optional decorator that records raw responses to a file when `recordResponses` is set             | Applied outermost in factory at `contentGenerator.ts:298-300`                      |
| `packages/core/src/core/baseLlmClient.ts`                 | Non-streaming, non-chat utility for JSON-shape model calls (used by `checkNextSpeaker`, etc.)     | `generateJson` at `:124`; `generateContent` at `:228`                              |
| `packages/core/src/core/tokenLimits.ts`                   | Per-model context-window cap (currently flat 1 048 576)                                           | Only used in `processTurn:636-637`                                                 |
| `packages/core/src/services/chatRecordingService.ts`      | Persists conversation, thoughts, tokens, and tool calls to the on-disk conversation JSON          | `recordMessageTokens` at `:486`; queueing logic depends on message type            |
| `packages/core/src/telemetry/llmRole.ts`                  | `LlmRole` enum; already includes `UTILITY_ROUTER`, `UTILITY_LOOP_DETECTOR`, etc.                  | Pollux advisor naturally slots in as a new role value                              |
| `packages/core/src/core/turn.test.ts`                     | Behavioral test of event-ordering, retries, cancellation, invalid stream, error reporting         | 822 lines                                                                          |
| `packages/core/src/core/client.test.ts`                   | Behavioral tests for compression, IDE context, token estimation, `sendMessageStream`, `MAX_TURNS` | 3226 lines; most relevant describe at `:718-1500+`                                 |
| `packages/core/src/core/geminiChat_network_retry.test.ts` | Connection-phase vs mid-stream retry semantics for 503/ECONNRESET/SSL/400                         | 459 lines                                                                          |

## 4. Verified Truths

Each truth has at least one runtime anchor; where a test directly enforces the
behavior it is cited as supporting evidence, bringing confidence to `high`.
Absence claims include the search that produced zero matches.

- **Truth 1**: The turn lifecycle is driven by `GeminiClient.sendMessageStream`,
  which invokes `processTurn` via `yield*` so inner events pass through
  unchanged.
  - Primary: `packages/core/src/core/client.ts:940-948`
  - Supporting: `packages/core/src/core/client.test.ts:718-817` (test);
    `packages/core/src/core/client.ts:593-600` (signature)
  - Confidence: high
  - Quote:

```940:948:packages/core/src/core/client.ts
    try {
      turn = yield* this.processTurn(
        request,
        signal,
        prompt_id,
        boundedTurns,
        isInvalidStreamRetry,
        displayContent,
      );
```

- **Truth 2**: `Turn.run` yields events in a deterministic per-chunk order:
  `Retry?` → `AgentExecution*?` → (`Thought*` → `Content?` → `ToolCallRequest*`
  → `Citation?` → `Finished?`), with terminal fallbacks `UserCancelled`,
  `InvalidStream`, `Error`.
  - Primary: `packages/core/src/core/turn.ts:272-359`
  - Supporting: `packages/core/src/core/turn.test.ts:77-500` (multiple
    event-ordering tests)
  - Confidence: high
  - Quote (Finished emission gate):

```339:359:packages/core/src/core/turn.ts
        const finishReason = resp.candidates?.[0]?.finishReason;

        // This is the key change: Only yield 'Finished' if there is a finishReason.
        if (finishReason) {
          if (this.pendingCitations.size > 0) {
            yield {
              type: GeminiEventType.Citation,
              value: `Citations:\n${[...this.pendingCitations].sort().join('\n')}`,
            };
            this.pendingCitations.clear();
          }

          this.finishReason = finishReason;
          yield {
            type: GeminiEventType.Finished,
            value: {
              reason: finishReason,
              usageMetadata: resp.usageMetadata,
            },
          };
        }
```

- **Truth 3**: There are **two** continuation loops, not one, and both are
  capped by `MAX_TURNS = 100`: the **InvalidStream retry** path and the
  **next-speaker continuation** path. Each is a recursive `sendMessageStream`
  call with `boundedTurns - 1`.
  - Primary: `packages/core/src/core/client.ts:78` (`MAX_TURNS = 100`),
    `:820-845` (invalid-stream retry), `:847-879` (next-speaker continuation),
    `:936` (`Math.min(turns, MAX_TURNS)`)
  - Supporting: `packages/core/src/core/client.test.ts:1310-1382` (test: "should
    stop infinite loop after MAX_TURNS when nextSpeaker always returns model");
    `:1434-1500+` (test: "should respect MAX_TURNS limit even when turns
    parameter is set to a large value")
  - Confidence: high

- **Truth 4**: Loop detection runs **twice** per turn: once before `turn.run`
  (`turnStarted`) and again on every event yielded from `turn.run`
  (`addAndCheck`). A detection (count `== 1`) triggers `_recoverFromLoop`, which
  injects a synthetic system feedback message via `sendMessageStream` recursion
  — this is an **existing synthetic-message precedent**.
  - Primary: `packages/core/src/core/client.ts:690-707` (pre-turn), `:759-772`
    (intra-stream), `:1248-1281` (`_recoverFromLoop`)
  - Supporting: `packages/core/src/core/client.test.ts:1226-1270` (test:
    "cleanly abort and return Turn on LoopDetected without unhandled promise
    rejections")
  - Confidence: high
  - Quote (recovery injection):

```1262:1280:packages/core/src/core/client.ts
    const feedbackText = `System: Potential loop detected. Details: ${loopResult.detail || 'Repetitive patterns identified'}. Please take a step back and confirm you're making forward progress. If not, take a step back, analyze your previous actions and rethink how you're approaching the problem. Avoid repeating the same tool calls or responses without new results.`;

    if (this.config.getDebugMode()) {
      debugLogger.warn(
        'Iterative Loop Recovery: Injecting feedback message to model.',
      );
    }

    const feedback = [{ text: feedbackText }];

    // Recursive call with feedback
    return this.sendMessageStream(
      feedback,
      signal,
      prompt_id,
      boundedTurns - 1,
      isInvalidStreamRetry,
      displayContent,
    );
```

- **Truth 5**: Model routing is consumed inside `processTurn` **after** loop
  detection and context shaping, and routing decisions are **sticky** for the
  remainder of the prompt sequence via `currentSequenceModel`. A new prompt id
  resets stickiness.
  - Primary: `packages/core/src/core/client.ts:709-725` (routing decision);
    `:742` (stickiness set); `:899-904` (stickiness reset on prompt id change);
    `:129-131` (reset on `CoreEvent.ModelChanged`)
  - Supporting: `packages/core/src/core/client.test.ts:790-816` (test: "does not
    emit ModelInfo event if signal is aborted" — verifies ModelInfo gating)
  - Confidence: high

- **Truth 6**: Token usage is captured at two layers that both already reach the
  filesystem and telemetry:
  - (a) `GeminiChat.processStreamResponse` records per-chunk `usageMetadata` via
    `ChatRecordingService.recordMessageTokens` and updates
    `lastPromptTokenCount`.
  - (b) `LoggingContentGenerator` (always wrapping every concrete generator)
    emits `ApiResponseEvent`/`ApiErrorEvent` with
    `promptTokenCount`/`candidatesTokenCount` for every LLM call, tagged by
    `LlmRole`.
  - Primary: `packages/core/src/core/geminiChat.ts:915-921`;
    `packages/core/src/core/loggingContentGenerator.ts:396-399, 576-580`;
    `packages/core/src/services/chatRecordingService.ts:486-515`
  - Supporting: `packages/core/src/core/client.test.ts:344-353` (test: "should
    update telemetry token count when history is set")
  - Confidence: high
  - Quote (the fundamental capture site):

```915:921:packages/core/src/core/geminiChat.ts
      // Record token usage if this chunk has usageMetadata
      if (chunk.usageMetadata) {
        this.chatRecordingService.recordMessageTokens(chunk.usageMetadata);
        if (chunk.usageMetadata.promptTokenCount !== undefined) {
          this.lastPromptTokenCount = chunk.usageMetadata.promptTokenCount;
        }
      }
```

- **Truth 7**: The `ContentGenerator` chain is a **decorator stack** built once
  by `createContentGenerator`: inner (`GoogleGenAI.models` | `CodeAssistServer`
  | `FakeContentGenerator`), always wrapped by `LoggingContentGenerator`, and
  optionally wrapped outermost by `RecordingContentGenerator` when
  `config.recordResponses` is set.
  - Primary: `packages/core/src/core/contentGenerator.ts:165-303` (factory);
    `:248-256` (code-assist + logging); `:285-292` (GenAI + logging); `:298-300`
    (optional recording wrap)
  - Supporting: `packages/core/src/core/loggingContentGenerator.ts:149-157`
    (class + `getWrapped`);
    `packages/core/src/core/recordingContentGenerator.ts` (present, 38 lines or
    so — not fully inspected in this pass, see Open Questions)
  - Confidence: high

- **Truth 8**: Retries exist at **three distinct layers** with different
  semantics:
  - (a) **Connection-phase retry** inside `retryWithBackoff` (used by
    `GeminiClient.generateContent` at `client.ts:1134-1147`) — retries full
    requests on 429/network errors with exponential backoff.
  - (b) **Mid-stream retry** inside `geminiChat.sendMessageStream`'s
    `streamWithRetries` generator — up to 4 attempts
    (`MID_STREAM_RETRY_OPTIONS.maxAttempts = 4` at `geminiChat.ts:89-93`), for
    `InvalidStreamError` or `isRetryableError` during chunk iteration; yields
    `StreamEventType.RETRY` between attempts.
  - (c) **InvalidStream recovery** at `client.ts:820-845` — once per turn,
    injects `"System: Please continue."` and recursively drives
    `sendMessageStream` with `isInvalidStreamRetry=true`.
  - Primary: `packages/core/src/core/client.ts:1134-1147`, `:820-845`;
    `packages/core/src/core/geminiChat.ts:89-93, :353-487`
  - Supporting:
    `packages/core/src/core/geminiChat_network_retry.test.ts:143-491` (seven
    retry tests: 503, 400 non-retry, SSL mid-stream, ECONNRESET, etc.)
  - Confidence: high

- **Truth 9**: The `LlmRole` tagging pipeline is already end-to-end: it flows
  `Turn.run(…, role)` → `GeminiChat.sendMessageStream(…, role)` →
  `ContentGenerator.generateContent(req, promptId, role)` → into telemetry
  events (`ApiResponseEvent`). Known values include `MAIN`, `SUBAGENT`, and
  seven `UTILITY_*` roles.
  - Primary: `packages/core/src/telemetry/llmRole.ts:7-19`
  - Supporting: `packages/core/src/core/turn.ts:258` (Turn.run signature);
    `packages/core/src/core/geminiChat.ts:304-309` (sendMessageStream
    signature); `packages/core/src/core/contentGenerator.ts:36-46` (interface);
    `packages/core/src/core/loggingContentGenerator.ts:355-358, 446-449`
    (pass-through and telemetry tagging)
  - Confidence: high
  - Quote:

```7:19:packages/core/src/telemetry/llmRole.ts
export enum LlmRole {
  MAIN = 'main',
  SUBAGENT = 'subagent',
  UTILITY_TOOL = 'utility_tool',
  UTILITY_COMPRESSOR = 'utility_compressor',
  UTILITY_SUMMARIZER = 'utility_summarizer',
  UTILITY_ROUTER = 'utility_router',
  UTILITY_LOOP_DETECTOR = 'utility_loop_detector',
  UTILITY_NEXT_SPEAKER = 'utility_next_speaker',
  UTILITY_EDIT_CORRECTOR = 'utility_edit_corrector',
  UTILITY_AUTOCOMPLETE = 'utility_autocomplete',
  UTILITY_FAST_ACK_HELPER = 'utility_fast_ack_helper',
}
```

- **Truth 10**: Hooks fire at four points in the core turn: `BeforeAgent` (once,
  outer), `BeforeModel`/`AfterModel` (per-chunk, inner), `AfterAgent` (once,
  outer). `AfterModel` can **stop or block** mid-stream via
  `AgentExecutionStoppedError`/`AgentExecutionBlockedError` from inside
  `processStreamResponse`. The blocked-variant carries an optional
  `syntheticResponse` that is yielded as a `CHUNK` event.
  - Primary: `packages/core/src/core/geminiChat.ts:923-946` (AfterModel hook);
    `packages/core/src/core/geminiChat.ts:218-236` (error classes);
    `packages/core/src/core/client.ts:906-934, :951-1012` (Before/After agent
    hooks)
  - Supporting: `packages/core/src/core/turn.ts:284-298` (propagation of
    `agent_execution_stopped`/`blocked` as `GeminiEventType`)
  - Confidence: high

- **Truth 11**: Compression has three outcomes tracked by `CompressionStatus`:
  `COMPRESSED` (rebuilds chat via `startChat(newHistory, resumedData)` and
  resumes the recording file), `CONTENT_TRUNCATED` (mutates history in place;
  does **not** clear `hasFailedCompressionAttempt`), and failures
  (`COMPRESSION_FAILED_*`, `NOOP`). Only `COMPRESSED` yields a `ChatCompressed`
  event in `processTurn`.
  - Primary: `packages/core/src/core/turn.ts:167-196` (`CompressionStatus` +
    `ServerGeminiChatCompressedEvent`);
    `packages/core/src/core/client.ts:1174-1230` (`tryCompressChat`); `:631-633`
    (event emission)
  - Supporting: `packages/core/src/core/client.test.ts:434-717` (dedicated
    `describe('tryCompressChat')` with ~9 tests including inflation, force,
    NOOP, resume)
  - Confidence: high

- **Truth 12**: There is **no** `advisor_consultation` synthetic tool or Pollux
  integration in the live runtime path; the `packages/core/src/pollux/`
  namespace contains only a 171-byte `index.ts` and an empty `benchmark/`
  directory.
  - Primary: negative search —
    ```
    rg -n "advisor_consultation|AdvisorClient|PolluxInterceptor|EscalationDetector" packages/core/src packages/cli/src
    ```
    0 matches.
  - Supporting: `Get-ChildItem packages/core/src/pollux -Recurse` returns only
    `index.ts` (171 B) + `benchmark/` (empty directory).
  - Confidence: high

- **Truth 13**: `sessionTurnCount` is a **session**-scoped counter, not
  prompt-scoped; it survives across `sendMessageStream` invocations on the same
  `GeminiClient` instance. The `MaxSessionTurns` guard in `processTurn` uses
  `config.getMaxSessionTurns()`, not `MAX_TURNS`.
  - Primary: `packages/core/src/core/client.ts:94` (field); `:604-611` (check);
    `:883-1039` (no reset on new prompt)
  - Supporting: `packages/core/src/core/client.test.ts:1384-1432` (test: "should
    yield MaxSessionTurns and stop when session turn limit is reached")
  - Confidence: high

## 5. Contradictions or Ambiguities

Eight distinct contradictions against `POLLUX_SPEC.md` and/or
`IMPLEMENTATION_PLAN.md` surfaced during this analysis. Most are consistent with
the forensic report findings (F-01 through F-10 in
`POLLUX_FULL_FORENSIC_CONTEXT.md`), which is reassuring.

- **C-02.1 — Stream pause/resume is not a turn-level primitive**.
  `POLLUX_SPEC.md:53, 93-94` describes pausing and resuming `Turn.run()` around
  an advisor call. `Turn.run` is an **async generator**; its iteration is driven
  by the caller (`processTurn`'s `for await`). "Pausing" in the Pollux sense
  must therefore happen either at the `processTurn` event-yield seam
  (`client.ts:773`) or inside the CLI stream consumer, not inside `Turn.run`
  itself.
  - Evidence A: `packages/core/src/core/turn.ts:253-404`
  - Evidence B: `packages/core/src/core/client.ts:758-783`
  - Resolution: **deferred** to Pollux interceptor design. Recommended phrasing
    in spec: "inject between `Turn.run` chunk-yield and CLI consumption", not
    "around `Turn.run`". Consistent with forensic F-04.

- **C-02.2 — Token logger proposal duplicates existing capture**.
  `POLLUX_SPEC.md:8, 98, 350-382` proposes a new `pollux/logger.ts` with
  per-model token fields. All those fields are **already captured** by
  `LoggingContentGenerator` (per-LLM-call telemetry event with `role`) and
  `ChatRecordingService.recordMessageTokens` (per-chunk conversation-file
  record). A fresh log would either duplicate or diverge from existing data.
  - Evidence A:
    `packages/core/src/core/loggingContentGenerator.ts:229-276, :526-597`
  - Evidence B: `packages/core/src/services/chatRecordingService.ts:486-515`
  - Evidence C: `packages/core/src/telemetry/llmRole.ts:7-19` (attribution
    already exists)
  - Resolution: **unresolved in spec**. Recommended approach: add a new
    `UTILITY_ADVISOR` value to `LlmRole`, ride existing telemetry + conversation
    recording. Matches forensic F-10, §10.5.

- **C-02.3 — "Single-model baseline" premise is false**. `POLLUX_SPEC.md:10-14`
  implies the executor is the only model involved. The core already calls at
  least five "utility" model roles per `LlmRole` (`UTILITY_COMPRESSOR`,
  `UTILITY_SUMMARIZER`, `UTILITY_ROUTER`, `UTILITY_LOOP_DETECTOR`,
  `UTILITY_NEXT_SPEAKER`, plus more). Benchmark conditions A (Flash-only) and E
  (Pro-only) must hold these utility roles constant or the token numbers are
  invalid.
  - Evidence A: `packages/core/src/telemetry/llmRole.ts:7-19`
  - Evidence B: `packages/core/src/core/client.ts:852-857` (`checkNextSpeaker`
    call; a utility model call per turn)
  - Resolution: **deferred** to compartment 07 (routing) and compartment 14
    (benchmark design). Consistent with forensic F-01, F-07.

- **C-02.4 — "Don't touch `GeminiChat` directly" is too absolute**.
  `POLLUX_SPEC.md:615-618` says "Don't touch `GeminiChat` directly… touching it
  risks breaking the history compression and loop detection systems". Loop
  detection is **not** inside `GeminiChat`; it is a separate service
  instantiated by `GeminiClient` (`client.ts:96, :112`). History compression
  **is** adjacent (via `ChatCompressionService` called from `client.ts:1184`)
  but also lives outside `GeminiChat`. The stronger constraint the advice was
  presumably reaching for is: do not mutate `GeminiChat.history` from the
  outside; use `setHistory`/`addHistory` or let `ChatCompressionService` do it.
  - Evidence A: `packages/core/src/core/client.ts:96, :1184-1192` (loop +
    compression both live in client/service layer, not in `GeminiChat`)
  - Evidence B: `packages/core/src/core/geminiChat.ts:249, :262-263, :771` (only
    internal writes to `lastPromptTokenCount`/history)
  - Resolution: **unresolved in spec**. Matches forensic F-09.

- **C-02.5 — Advisor client's `generateJson` claim**. `POLLUX_SPEC.md:308-313`
  shows the advisor client calling `contentGenerator.generateContent(...)`. The
  appropriate utility for a JSON-shape advisor response is
  `BaseLlmClient.generateJson` (`baseLlmClient.ts:124`), which already handles
  structured-output parsing, retries, and validation. Going directly to
  `contentGenerator` bypasses that.
  - Evidence A: `packages/core/src/core/baseLlmClient.ts:124-168` (generateJson
    contract)
  - Evidence B: `packages/core/src/core/client.ts:852-857` (existing caller via
    `this.config.getBaseLlmClient()`)
  - Resolution: **unresolved in spec**. Recommended: advisor client uses
    `BaseLlmClient.generateJson` with `LlmRole.UTILITY_ADVISOR`.

- **C-02.6 — "Synthetic tool approach is the right injection method" — but an
  existing synthetic-message precedent already exists and might be simpler**.
  `POLLUX_SPEC.md:344-346, 614-619` declares synthetic tool registration as the
  "most natural" way to inject the advisor plan. Two existing
  synthetic-injection paths in the codebase use plain recursive
  `sendMessageStream` with synthesized text content (`_recoverFromLoop` and the
  next-speaker continuation). A tool-result injection is heavier and introduces
  a new tool in the registry that must be available-but-not-callable.
  - Evidence A: `packages/core/src/core/client.ts:1248-1281` (`_recoverFromLoop`
    injects a plain system-style text message)
  - Evidence B: `packages/core/src/core/client.ts:867-877` (next-speaker "Please
    continue" text injection)
  - Resolution: **deferred** to Pollux interceptor design. Forensic §9.4 also
    flags this.

- **C-02.7 — Turn count overflow in spec vs implementation**.
  `POLLUX_SPEC.md:196` sets heuristic trigger at "Turn count exceeds threshold
  (default: 8 turns)". The runtime's session-wide cap is
  `config.getMaxSessionTurns()` (user-set) and hard-cap `MAX_TURNS = 100`. An
  8-turn heuristic fires **far before** any existing guard; this is fine but
  should be documented as an additional, earlier signal, not as "the" turn cap.
  - Evidence A: `POLLUX_SPEC.md:196, 213`
  - Evidence B: `packages/core/src/core/client.ts:78, :604-611, :936`
  - Resolution: **deferred** to compartment 07 (detector design).

- **C-02.8 — Spec's `processTurn()` wiring phrase is misleading**.
  `POLLUX_SPEC.md:504` says "Wire interceptor into `client.ts` at
  `processTurn()`". The actual generator-chain that Pollux must hook is the
  **intersection** of `processTurn`'s `for await (const event of resultStream)`
  at `client.ts:758-783` and the outer `yield* processTurn` at `client.ts:941`.
  Simply calling the interceptor "at processTurn" underspecifies whether it runs
  per-event or per-turn.
  - Evidence A: `packages/core/src/core/client.ts:747-783`
  - Evidence B: `packages/core/src/core/client.ts:940-948`
  - Resolution: **unresolved in spec**. Recommended: spec should say "between
    `turn.run` event emission and the `yield event` at `client.ts:773`, so the
    interceptor runs per-event with access to loop-detector state".

## 6. Risks and Regression Hotspots

- **Risk R-02.1 — Event-ordering regressions on any edit to `processTurn`'s
  for-await loop**.
  - Why fragile: 17 distinct yield sites interleave with loop detection,
    telemetry, and error flags. A misplaced `yield` or missed `continue` after a
    loop detection can desync `loopDetector.addAndCheck` from the real event
    sequence.
  - Mitigating test: `packages/core/src/core/client.test.ts:1226-1270`
    (LoopDetected + unhandled promise rejection);
    `packages/core/src/core/turn.test.ts:210-245` (UserCancelled + InvalidStream
    ordering)
  - Suggested guard: a deterministic "event transcript" snapshot test over a
    scripted mock stream including `retry`, two chunks with function calls, a
    loop-detected mid-stream, and a finish reason — verifying the exact yielded
    sequence.
  - Severity: **high**

- **Risk R-02.2 — `currentSequenceModel` stickiness inversion**.
  - Why fragile: Stickiness is reset on three different triggers (`prompt_id`
    change at `:899-904`, `CoreEvent.ModelChanged` at `:121-131`,
    `clearCurrentSequenceModel` at `:137-139`). A new external caller could
    forget one. If stickiness leaks across prompts, `ModelInfo` won't emit for a
    new prompt and benchmark runs mixing executor and Pro in the same session
    will be corrupted.
  - Mitigating test: **none directly** (no dedicated sticky-reset test found).
  - Suggested guard: add a test that asserts `ModelInfo` fires exactly once per
    prompt id and that a `CoreEvent.ModelChanged` between prompts does not
    suppress it.
  - Severity: **medium**

- **Risk R-02.3 — `updateTelemetryTokenCount` runs after every yielded event,
  including `Error`/`LoopDetected`**.
  - Why fragile: The method reads `chat.getLastPromptTokenCount()`. On error
    paths the chat's `lastPromptTokenCount` may be stale relative to the event,
    which will produce telemetry with tokens belonging to the previous turn. For
    Pollux token accounting this would miscount.
  - Mitigating test: none directly verifying error-path token attribution.
  - Suggested guard: add a unit test where a stream throws mid-chunk and assert
    the telemetry `setLastPromptTokenCount` was called with the pre-throw value,
    not a fresh one.
  - Severity: **medium**

- **Risk R-02.4 — IDE context injection mutates history as a user message**.
  - Why fragile: `client.ts:670-682` pushes a synthetic user-role message into
    history whenever `ideMode` is on. If `processTurn` returns early (e.g.,
    `ContextWindowWillOverflow`), the injected context persists and may re-enter
    on the next turn. Also, `hasPendingToolCall` is the only guard.
  - Mitigating test: `packages/core/src/core/client.test.ts:877-963` (IDE
    context enable/disable) but no explicit "early return after injection" test.
  - Suggested guard: add a test for `ContextWindowWillOverflow` immediately
    after IDE-context injection and assert no double injection next turn.
  - Severity: **medium**

- **Risk R-02.5 — Mid-stream `AgentExecutionBlocked` state machine is subtle**.
  - Why fragile: When `AfterModel` hook blocks, `processStreamResponse` throws
    `AgentExecutionBlockedError` with an optional `syntheticResponse` which is
    emitted as a `StreamEventType.CHUNK`, **then**
    `StreamEventType.AGENT_EXECUTION_BLOCKED` is emitted. In `Turn.run`,
    `agent_execution_blocked` yields `AgentExecutionBlocked` but **continues**
    consuming (`turn.ts:292-298`). This differs from `agent_execution_stopped`,
    which returns. A future hook producing a synthetic response for a stop case
    will not reach the caller.
  - Mitigating test: none directly covering the stopped-with-synthetic-response
    case.
  - Suggested guard: a test exercising `AgentExecutionStoppedError` with a
    synthetic response, asserting the synthetic chunk is or is not yielded by
    design (and the spec documents which).
  - Severity: **low**

- **Risk R-02.6 — Compression rebuild loses in-flight telemetry span**.
  - Why fragile: On `CompressionStatus.COMPRESSED`, `tryCompressChat` calls
    `this.startChat(newHistory, resumedData)` which creates a new `GeminiChat`.
    Any in-flight metrics or spans referencing the old chat reference are
    silently orphaned.
  - Mitigating test: `packages/core/src/core/client.test.ts:689-717` (resume
    session file) covers persistence but not span lifecycle.
  - Suggested guard: document in compartment 11 (telemetry) whether spans are
    chat-scoped; this is a cross-compartment risk, not purely 02.
  - Severity: **low**

## 7. Test and Observability Coverage

- **Tests covering this compartment**:
  - `packages/core/src/core/turn.test.ts` — event ordering (content → finished),
    retry, abort, invalid-stream, error, function calls with undefined
    name/args, multiple responses, citations, finish reasons (MAX_TOKENS,
    SAFETY).
  - `packages/core/src/core/client.test.ts` — `sendMessageStream` (cancellation,
    compression event, IDE context inject, token estimation, loop detection
    abort, MAX_TURNS cap on next-speaker recursion, session turn limit),
    `tryCompressChat` (9 tests), `addHistory`, `setHistory`, `resumeChat`,
    `resetChat`, `startChat`.
  - `packages/core/src/core/geminiChat_network_retry.test.ts` — connection-phase
    vs mid-stream retries for 503, 400 (no retry), SSL, ECONNRESET.
  - `packages/core/src/core/geminiChat.test.ts` — 2371 lines; **not exhaustively
    inspected in this pass** (see Open Questions OQ-02.4).

- **Observability signals**:
  - `uiTelemetryService.setLastPromptTokenCount(...)` (`client.ts:245`) called
    after every turn event.
  - Per-API-call events: `ApiRequestEvent`, `ApiResponseEvent`, `ApiErrorEvent`
    from `LoggingContentGenerator`.
  - Per-chunk conversation records via `ChatRecordingService.recordMessage`,
    `recordThought`, `recordMessageTokens`, `recordToolCalls`.
  - Dev-trace spans via
    `runInDevTraceSpan({ operation: GeminiCliOperation.LLMCall, ... })` with
    `GEN_AI_USAGE_INPUT_TOKENS`/`GEN_AI_USAGE_OUTPUT_TOKENS` attributes.
  - Retry-specific events: `ContentRetryEvent`, `ContentRetryFailureEvent`,
    `NetworkRetryAttemptEvent`.
  - `coreEvents.emitRetryAttempt` (`geminiChat.ts:459-465`,
    `client.ts:1142-1147`) — listenable by UI hooks.
  - `NextSpeakerCheckEvent` (`client.ts:858-865`) — logs `checkNextSpeaker`
    outcome per turn.

- **Coverage gaps** (behaviors without direct test):
  - `_recoverFromLoop` — no test asserts the feedback text format or that the
    recursive call is counted against `boundedTurns`.
  - `currentSequenceModel` sticky-reset across all three reset paths (see
    R-02.2).
  - `updateTelemetryTokenCount` on error-path events (R-02.3).
  - IDE context double-injection across an aborted turn (R-02.4).
  - `AgentExecutionStoppedError` with a synthetic response (R-02.5).
  - Boundary between session turn limit (config-driven) and `MAX_TURNS` hard cap
    when both are exceeded.

## 8. Open Questions

- [ ] **OQ-02.1** — Does `setHistory` called during compression
      (`CONTENT_TRUNCATED` branch, `client.ts:1222`) correctly trigger a
      `updateTelemetryTokenCount`? It reassigns history via `chat.setHistory`,
      but `setHistory` on the chat doesn't itself update `lastPromptTokenCount`;
      the update comes from `processStreamResponse` on next stream. Is telemetry
      briefly stale here?
- [ ] **OQ-02.2** — Is there any way for `checkNextSpeaker` to itself stall or
      be rate-limited, potentially blocking turn completion? The call is at
      `client.ts:852-857`, synchronous to the turn.
- [ ] **OQ-02.3** — How does the continuation recursion interact with
      `AbortController`? The linked signal (`linkedSignal`) is constructed
      per-turn (`client.ts:687-688`) but the recursive `sendMessageStream` call
      passes the original `signal` (`L836`), not the linked one. Is there a
      dangling abort chain on multi-turn continuations?
- [ ] **OQ-02.4** — `geminiChat.test.ts` is 2371 lines and was not exhaustively
      read. Specific gaps: thought-signature ensuring
      (`ensureActiveLoopHasThoughtSignatures`), `BeforeModel` hook handling,
      `toolSelectionResult.toolConfig` branch (`geminiChat.ts:638-648`). Handing
      to the next pass.
- [ ] **OQ-02.5** — The `Turn` class does not expose a way to inject a synthetic
      `ToolCallResponse` event into the in-flight stream. Pollux's "advisor as
      synthetic tool" design requires that injection path. Is the correct place
      `Turn.run`'s for-await loop, or the caller's (`processTurn`'s)
      `yield event`?
- [ ] **OQ-02.6** — `recordingContentGenerator.ts` (present in repo, not
      inspected here). How does it interact with `LlmRole` tagging? Does it
      preserve the role in its recorded JSON?

## 9. Definition of Done

Copied from `02-core-turn-engine.md` and ticked where satisfied.

- [x] Turn lifecycle is fully mapped from entry to completion. (Section 2 +
      Truths 1–2, 10–11)
- [x] Event model and ordering are documented with evidence. (Truth 2, Section 2
      step 12)
- [x] Integrations to routing/tools/loop detection are explicit. (Truths 4–5;
      loop detection at two sites; router consumption at `:709-725`)
- [x] Retry and failure semantics are verified in code/tests. (Truth 8 cites
      three layers + `geminiChat_network_retry.test.ts`)
- [x] Token usage path is documented with extension implications. (Truth 6 +
      Truth 9 + C-02.2)
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar. (see
      `02-core-turn-engine.report.json`)
- [x] `INDEX.md` row 02 flipped to `done`. (performed at commit time)

Additional template DoD:

- [x] All guideline DoD items satisfied.
- [x] Evidence matrix populated in sidecar JSON.
- [x] `INDEX.md` updated to `done` (at commit time).

## 10. Evidence Matrix (summary)

The authoritative matrix lives in `reports/02-core-turn-engine.report.json`.
Summary:

| Claim                                                                                                                          | Primary                                                                                                           | Supporting                                                                                                                                      | Confidence |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Turn entry is `GeminiClient.sendMessageStream` → `processTurn` (yield\*)                                                       | `packages/core/src/core/client.ts:940-948`                                                                        | `packages/core/src/core/client.test.ts:718-817` (test)                                                                                          | high       |
| Turn.run yields deterministic per-chunk event order (Thought* → Content? → ToolCall* → Finished?)                              | `packages/core/src/core/turn.ts:272-359`                                                                          | `packages/core/src/core/turn.test.ts:77-500` (test)                                                                                             | high       |
| Two continuation loops (invalid-stream + next-speaker) bounded by `MAX_TURNS=100`                                              | `packages/core/src/core/client.ts:78, :820-845, :847-879, :936`                                                   | `packages/core/src/core/client.test.ts:1310-1432` (test)                                                                                        | high       |
| Loop detection runs before turn.run and per event; recovery injects synthetic feedback                                         | `packages/core/src/core/client.ts:690-707, :759-772, :1248-1281`                                                  | `packages/core/src/core/client.test.ts:1226-1270` (test)                                                                                        | high       |
| Routing is consumed inside processTurn after loop detection; sticky per prompt_id                                              | `packages/core/src/core/client.ts:709-725, :742, :899-904, :129-131`                                              | `packages/core/src/core/client.test.ts:790-816` (test)                                                                                          | high       |
| Tokens are captured per-chunk in GeminiChat and per-call in LoggingContentGenerator                                            | `packages/core/src/core/geminiChat.ts:915-921`                                                                    | `packages/core/src/core/loggingContentGenerator.ts:396-399` (code); `packages/core/src/core/client.test.ts:344-353` (test)                      | high       |
| ContentGenerator chain = concrete → LoggingContentGenerator (always) → RecordingContentGenerator (optional)                    | `packages/core/src/core/contentGenerator.ts:165-303`                                                              | `packages/core/src/core/loggingContentGenerator.ts:149-157` (code)                                                                              | high       |
| Three retry layers: retryWithBackoff (client), streamWithRetries (geminiChat, 4 attempts), InvalidStream continuation (client) | `packages/core/src/core/client.ts:820-845, :1134-1147`; `packages/core/src/core/geminiChat.ts:89-93, :353-487`    | `packages/core/src/core/geminiChat_network_retry.test.ts:143-491` (test)                                                                        | high       |
| LlmRole is already end-to-end; enum already carries 11 values including 7 utilities                                            | `packages/core/src/telemetry/llmRole.ts:7-19`                                                                     | `packages/core/src/core/turn.ts:258`; `packages/core/src/core/geminiChat.ts:304-309`; `packages/core/src/core/contentGenerator.ts:36-46` (type) | high       |
| Hooks fire 4x (Before/After Agent outer, Before/After Model inner); AfterModel can stop/block mid-stream                       | `packages/core/src/core/geminiChat.ts:923-946, :218-236`                                                          | `packages/core/src/core/client.ts:906-934, :951-1012` (code); `packages/core/src/core/turn.ts:284-298` (propagation)                            | high       |
| Compression has 3 outcomes (COMPRESSED, CONTENT_TRUNCATED, failure); only COMPRESSED emits event                               | `packages/core/src/core/turn.ts:167-196`; `packages/core/src/core/client.ts:1174-1230, :631-633`                  | `packages/core/src/core/client.test.ts:434-717` (test)                                                                                          | high       |
| No `advisor_consultation` or Pollux runtime integration exists                                                                 | (negative) `rg "advisor_consultation\|AdvisorClient\|PolluxInterceptor\|EscalationDetector" packages` → 0 matches | `Get-ChildItem packages/core/src/pollux` → `index.ts` (171 B) + empty `benchmark/`                                                              | high       |
| sessionTurnCount is session-scoped; survives across prompts                                                                    | `packages/core/src/core/client.ts:94, :604-611`                                                                   | `packages/core/src/core/client.test.ts:1384-1432` (test)                                                                                        | high       |

## 11. Handoffs

- **Depends on**: none (this is the base compartment).
- **Affects (downstream)**:
  - Compartment 01 (CLI Runtime Surface) — the interactive `useGeminiStream.ts`
    hook and the non-interactive loop both consume the `ServerGeminiStreamEvent`
    stream produced here.
  - Compartment 07 (Routing) — `processTurn` consumes
    `ModelRouterService.route`; routing must not alter the event sequence.
  - Compartment 11 (Telemetry) — `usageMetadata` and turn-level spans originate
    here; the exporter lives in 11.
  - Compartment 04 (Tools) — `Turn.handlePendingFunctionCall` surfaces
    `ToolCallRequest`; the tool scheduler and confirmation flow live in 04.
- **Escalated to**:
  - Compartment 07 for OQ-02.5 (where exactly Pollux should inject into the Turn
    event stream).
  - Compartment 11 for R-02.3 and R-02.6 (telemetry lifecycle around error paths
    and chat rebuild).
  - Compartment 03 for OQ-02.3 (abort chain interaction with agent-session
    loop).

### Boundary confirmation

Per the tightened handoff notes in the guideline:

- **Boundary with 07 (Routing)**: this report consumes
  `ModelRouterService.route` and `applyModelSelection` as **black boxes**. Any
  claim about _how_ they decide is deferred to compartment 07.
- **Boundary with 11 (Telemetry)**: this report cites token capture **origin**
  sites (`geminiChat.ts:915-921`, `loggingContentGenerator.ts:396-399/576-580`,
  `chatRecordingService.ts:486-515`). The exporter, sampling, and sanitization
  pipeline is deferred to compartment 11.
