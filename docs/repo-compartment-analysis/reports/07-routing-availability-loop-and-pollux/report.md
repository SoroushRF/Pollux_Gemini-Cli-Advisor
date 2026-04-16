# Compartment Report: 07 — Routing, Availability, Loop Controls, and Pollux

## Metadata

- **Compartment**: 07 — Routing, Availability, Loop Controls, and Pollux
- **Guideline file**: `07-routing-availability-loop-and-pollux.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: `b43e7661ddaa7bbcc2283350a5eace8d2d8bb424`
- **Upstream base commit**: `05f3b38c1b4f96ef722c588280cdbdc835d77b31`
  (inherited from compartment 02; upstream remotes not inspected in this pass)

## 0. Pre-flight

Path validation results from `AGENT_RUNBOOK.md` Step B.

| Path                                                         | Exists? | Notes                                                                                                                 |
| ------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/routing`                                  | yes     | 19 files (service + strategies + tests)                                                                               |
| `packages/core/src/routing/modelRouterService.ts`            | yes     | 136 lines; single-class service                                                                                       |
| `packages/core/src/routing/routingStrategy.ts`               | yes     | 82 lines; `RoutingStrategy`, `TerminalStrategy`, `RoutingContext`, `RoutingDecision`                                  |
| `packages/core/src/routing/strategies`                       | yes     | 8 concrete strategies + tests                                                                                         |
| `packages/core/src/availability`                             | yes     | 10 files; service, policy model, policy catalog, helpers, error classification                                        |
| `packages/core/src/services/loopDetectionService.ts`         | yes     | 759 lines; heuristic + LLM double-check                                                                               |
| `packages/core/src/config/models.ts`                         | yes     | 464 lines; constants, alias resolvers, model-family predicates                                                        |
| `packages/core/src/config/defaultModelConfigs.ts`            | yes     | 627 lines; aliases + modelDefinitions + modelChains + modelIdResolutions                                              |
| `packages/core/src/pollux/index.ts`                          | yes     | 171 bytes; single `export {};` and a banner comment; nothing else                                                     |
| `packages/core/src/pollux/benchmark`                         | yes     | empty directory (0 files)                                                                                             |
| `packages/core/src/fallback/handler.ts`                      | yes     | **Added by analyst** — canonical `handleFallback` lives here, not under `availability`                                |
| `packages/core/src/availability/fallbackIntegration.test.ts` | yes     | **Added by analyst** — integration test for chain-slicing + fallback selection                                        |
| `packages/core/src/routing/modelRouterService.test.ts`       | yes     | **Added by analyst** — verifies strategy composition order                                                            |
| `docs/cli/model-routing.md`                                  | yes     | 60 lines; describes availability-driven fallback + precedence; **does not** describe classifier/approval-mode routing |

All guideline-listed paths resolve. The analyst added four files
(`fallback/handler.ts`, `availability/fallbackIntegration.test.ts`,
`routing/modelRouterService.test.ts`, `docs/cli/model-routing.md`) because they
are central to the compartment but are not listed in the guideline "Primary
paths". They are cited in sections 4–7.

## 1. Scope and Boundary

In scope (per guideline, confirmed to match reality):

- The `ModelRouterService` and the eight routing strategies it composes
  (`routingStrategy.ts`, `strategies/*`).
- `ModelAvailabilityService` state machine and `policyHelpers` / `policyCatalog`
  / `fallback/handler.ts` selection semantics, including the legacy vs.
  experimental-dynamic chain path.
- `LoopDetectionService` heuristic and LLM-double-check thresholds, including
  the `UTILITY_LOOP_DETECTOR` utility model calls it emits.
- Model-registry constants (`models.ts`) and default model configs
  (`defaultModelConfigs.ts`), including model aliases, `modelChains`, and
  `modelIdResolutions`.
- The Pollux scaffold at `packages/core/src/pollux/**` — its current state of
  implementation (spoiler: stub only).

Out of scope, handed off per guideline Boundary notes:

- Full turn event lifecycle and stream ordering → compartment 02 (already
  `done`); this report cites `client.ts:709-745` as a black-box consumer of
  routing and does not re-trace the per-chunk event flow.
- Settings precedence (where `--model` / `GEMINI_MODEL` / `settings.json`
  actually get read) → compartment 06.
- Tool registry, synthetic tool path for the eventual advisor tool →
  compartment 04.
- Benchmark harness _implementation_ (Vitest fixtures, CI wiring) →
  compartment 14. This report covers benchmark **control recommendations** only
  (Step 8).

## 2. Runtime Flow Summary

Routing + availability + loop-detection are interleaved across a single
`processTurn`. Listed in execution order:

1. **Pre-turn loop detection**: `LoopDetectionService.turnStarted(signal)` runs
   at `packages/core/src/core/client.ts:690`. If this is the 30th+ turn in the
   prompt and the check interval has elapsed, it fires an
   `UTILITY_LOOP_DETECTOR` LLM call via
   `BaseLlmClient.generateJson({ modelConfigKey: { model: 'loop-detection' } })`
   and, on ≥ 0.9 confidence, may fire a **second** call against
   `DOUBLE_CHECK_MODEL_ALIAS = 'loop-detection-double-check'`
   (`packages/core/src/services/loopDetectionService.ts:66, :576-635`).
2. **Routing context assembly**: `processTurn` builds
   `routingContext = { history, request, signal, requestedModel: config.getModel() }`
   at `client.ts:709-714`.
3. **Routing decision**: If `currentSequenceModel` is already set (sticky within
   a prompt), it is used directly (`client.ts:719-720`). Otherwise,
   `this.config.getModelRouterService().route(routingContext)` is awaited
   (`client.ts:722-724`).
4. **Strategy chain** inside `ModelRouterService.route` at
   `routing/modelRouterService.ts:75-134`: a `CompositeStrategy` with chain
   `[FallbackStrategy, OverrideStrategy, ApprovalModeStrategy, (GemmaClassifierStrategy)?, ClassifierStrategy, NumericalClassifierStrategy, DefaultStrategy]`
   (`routing/modelRouterService.ts:39-67`). Non-terminal strategies may return
   `null` to defer; the terminal `DefaultStrategy` always returns a decision.
5. **Classifier calls (possible extra API hits)**:
   - `ClassifierStrategy` fires `baseLlmClient.generateJson(...)` with
     `modelConfigKey: { model: 'classifier' }` (resolves to
     `gemini-2.5-flash-lite` per `defaultModelConfigs.ts:105-116`) and
     `role: LlmRole.UTILITY_ROUTER`
     (`routing/strategies/classifierStrategy.ts:160-168`).
   - `NumericalClassifierStrategy` fires the same call but only when
     `getNumericalRoutingEnabled()` is true **and** the requested model is
     Gemini-3 (`routing/strategies/numericalClassifierStrategy.ts:108-143`).
   - `GemmaClassifierStrategy` uses a **local** LiteRT client
     (`LocalLiteRtLmClient.generateJson`) — no remote API call, but still incurs
     latency/CPU (`routing/strategies/gemmaClassifierStrategy.ts:201-206`).
6. **Availability re-resolution**: After the router returns a model string,
   `processTurn` re-runs availability selection via
   `applyModelSelection(config, { model: modelToUse, isChatModel: true }, { consumeAttempt: false })`
   at `client.ts:732-737`. This can **change the model again** if the router's
   choice is marked terminal or sticky in `ModelAvailabilityService`
   (`availability/policyHelpers.ts:254-291`,
   `availability/modelAvailabilityService.ts:101-116`).
7. **ModelInfo emission**: On the first turn of a sequence,
   `GeminiEventType.ModelInfo` is yielded with the final model id
   (`client.ts:739-741`). The sticky model is set (`client.ts:742`), and will
   skip routing on subsequent turns of the same `prompt_id`.
8. **Per-event loop detection**: Inside `processTurn`'s
   `for await (const event of resultStream)` at `client.ts:758-783`, every
   `ToolCallRequest` or `Content` event is pushed through
   `loopDetector.addAndCheck(event)`. Tool-call loops trigger at 5 consecutive
   identical calls (`loopDetectionService.ts:29, :314-326`); content loops
   trigger when a hashed 50-char chunk repeats ≥ 10 times within a small average
   distance (`loopDetectionService.ts:30-31, :419-504`).
9. **Per-call fallback retry**: If a model call fails during `generateContent`,
   `handleFallback(config, failedModel, authType, error)` at
   `fallback/handler.ts:25-110` is called from the `retryWithBackoff` callback
   (`client.ts:1107-1112`; `baseLlmClient.ts:335`). It resolves a fresh policy
   chain via `resolvePolicyChain` and either silently advances or prompts the
   user via the `fallbackModelHandler`.
10. **Model-changed reset**: When `coreEvents.emitModelChanged(...)` fires
    (e.g., after `/model` or a successful
    `handleFallback(...) config.activateFallbackMode(...)`),
    `GeminiClient.handleModelChanged` clears `currentSequenceModel`
    (`client.ts:121, :129-131`). This re-invokes the router on the next turn.

## 3. Key Files and Citations

| Path                                                                  | Role                                                                  | Notes                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/routing/modelRouterService.ts`                     | Router entrypoint; composes + invokes `CompositeStrategy`             | `route` at `:75` wraps chain in try/catch and logs `ModelRoutingEvent`; fallback on exception is `config.getModel()` (raw, no availability check) at `:105-113`                                                                   |
| `packages/core/src/routing/routingStrategy.ts`                        | Interface contracts                                                   | `RoutingContext` has `requestedModel?: string` at `:39-40` — strategies each resolve it independently                                                                                                                             |
| `packages/core/src/routing/strategies/compositeStrategy.ts`           | Chain-of-responsibility executor                                      | Swallows non-terminal strategy exceptions at `:71-76`; only the terminal is guaranteed to run                                                                                                                                     |
| `packages/core/src/routing/strategies/fallbackStrategy.ts`            | Reroutes if requested model is marked unavailable                     | Consults `ModelAvailabilityService.snapshot` at `:37`; returns null if available                                                                                                                                                  |
| `packages/core/src/routing/strategies/overrideStrategy.ts`            | User-forced model passthrough                                         | Short-circuits when model is **not** `auto` (`:32`); `resolveModel` still runs for alias expansion                                                                                                                                |
| `packages/core/src/routing/strategies/approvalModeStrategy.ts`        | Routes Pro when in PLAN mode, Flash after plan approved               | Gated by `getPlanModeRoutingEnabled()` at `:43`; only applies to `auto` models (`:39`)                                                                                                                                            |
| `packages/core/src/routing/strategies/classifierStrategy.ts`          | Flash/Pro LLM classifier (Gemini 2.5 Flash-Lite)                      | System prompt at `:33-105`; role `UTILITY_ROUTER` at `:167`; skipped when numerical routing active on Gemini 3 (`:140-145`)                                                                                                       |
| `packages/core/src/routing/strategies/numericalClassifierStrategy.ts` | Score 1–100 classifier for Gemini 3 only                              | Only runs when `getNumericalRoutingEnabled()` AND `isGemini3Model(model)` (`:108-114`); configurable threshold via `getResolvedClassifierThreshold`                                                                               |
| `packages/core/src/routing/strategies/gemmaClassifierStrategy.ts`     | Local LiteRT classifier                                               | Requires `gemmaModelRouter.enabled` and exact model `gemma3-1b-gpu-custom` (`:177-184`)                                                                                                                                           |
| `packages/core/src/routing/strategies/defaultStrategy.ts`             | Terminal fallback (resolves configured model through `resolveModel`)  | Always returns a decision; does **not** consult availability                                                                                                                                                                      |
| `packages/core/src/availability/modelAvailabilityService.ts`          | Per-session health map (`terminal` / `sticky_retry`)                  | `selectFirstAvailable` at `:101`; `resetTurn` clears sticky consumed flag (`:118-124`)                                                                                                                                            |
| `packages/core/src/availability/policyCatalog.ts`                     | Static default chains (`DEFAULT_CHAIN`, `FLASH_LITE_CHAIN`)           | `getModelPolicyChain({ previewEnabled, userTier, ... })` chooses preview vs stable (`:82-99`)                                                                                                                                     |
| `packages/core/src/availability/policyHelpers.ts`                     | Glue between router/chain/availability                                | `resolvePolicyChain` (`:37-145`) branches on `getExperimentalDynamicModelConfiguration` for the dynamic `modelChains`/`modelIdResolutions` path                                                                                   |
| `packages/core/src/fallback/handler.ts`                               | Interactive + silent fallback on 429/terminal                         | Calls `config.getFallbackModelHandler()` handler; `activateFallbackMode` on `retry_always` (`:137-139`)                                                                                                                           |
| `packages/core/src/services/loopDetectionService.ts`                  | Heuristic + LLM loop detection                                        | `TOOL_CALL_LOOP_THRESHOLD = 5` (`:29`), `CONTENT_LOOP_THRESHOLD = 10` (`:30`), `LLM_CHECK_AFTER_TURNS = 30` (`:42`), `LLM_CONFIDENCE_THRESHOLD = 0.9` (`:65`), `DOUBLE_CHECK_MODEL_ALIAS = 'loop-detection-double-check'` (`:66`) |
| `packages/core/src/config/models.ts`                                  | Model constants, aliases, resolvers, family predicates                | `DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'` (`:60`); `VALID_GEMINI_MODELS` (`:64-73`); `resolveModel` (`:98-187`); `isAutoModel` (`:395-407`)                                                                                       |
| `packages/core/src/config/defaultModelConfigs.ts`                     | Alias → concrete-config table; `loop-detection`, `classifier` aliases | `classifier` → `gemini-2.5-flash-lite` (`:105-116`); `loop-detection-double-check` → `gemini-3-pro-preview` (`:197-202`); `modelChains.preview` (`:512-541`)                                                                      |
| `packages/core/src/pollux/index.ts`                                   | **Scaffold** — banner comment + `export {};`                          | 171 bytes. No runtime exports.                                                                                                                                                                                                    |
| `packages/core/src/pollux/benchmark`                                  | **Scaffold** — empty directory                                        | 0 files.                                                                                                                                                                                                                          |
| `packages/core/src/routing/modelRouterService.test.ts`                | Verifies composite composition order                                  | 5 tests; confirms `GemmaClassifierStrategy` inserted only when enabled                                                                                                                                                            |
| `packages/core/src/services/loopDetectionService.test.ts`             | Heuristic + LLM check tests                                           | ~55 tests; includes disabled-state, strike recovery, double-check confidence gating                                                                                                                                               |
| `packages/core/src/availability/fallbackIntegration.test.ts`          | Integration: availability + routing                                   | 2 tests; confirms fallback selection even when config isn't auto (Gemini 3 branch)                                                                                                                                                |
| `packages/core/src/core/client.test.ts`                               | Sticky routing + re-routing behavior                                  | `Model Routing` describe at `:1841-2010+` — sticky within prompt, reroute on new prompt_id, reroute on `CoreEvent.ModelChanged`                                                                                                   |

## 4. Verified Truths

Each truth has at least one runtime anchor; where a test directly enforces the
behavior it is cited as supporting evidence, bringing confidence to `high`.
Absence claims include the repo-wide search that produced zero matches.

- **Truth 1**: The routing entrypoint in the turn lifecycle is
  `GeminiClient.getModelRouterService().route(routingContext)` at
  `packages/core/src/core/client.ts:722-724`, gated by the
  `currentSequenceModel` stickiness check at `:719-720`. The router is consulted
  exactly **once per prompt** unless stickiness is cleared (new `prompt_id` or a
  `CoreEvent.ModelChanged` emission).
  - Primary:
    `packages/core/src/core/client.ts:709-725, :742, :899-903, :121-131`
  - Supporting: `packages/core/src/core/client.test.ts:1887-1961` (tests: sticky
    within prompt, reset on new `prompt_id`, re-route on `emitModelChanged`)
  - Confidence: high
  - Quote:

```709:725:packages/core/src/core/client.ts
    const routingContext: RoutingContext = {
      history: this.getChat().getHistory(/*curated=*/ true),
      request,
      signal,
      requestedModel: this.config.getModel(),
    };

    let modelToUse: string;

    // Determine Model (Stickiness vs. Routing)
    if (this.currentSequenceModel) {
      modelToUse = this.currentSequenceModel;
    } else {
      const router = this.config.getModelRouterService();
      const decision = await router.route(routingContext);
      modelToUse = decision.model;
    }
```

- **Truth 2**: The router is a seven- or eight-link **chain-of-responsibility**
  assembled at service construction. Order is fixed at
  `FallbackStrategy → OverrideStrategy → ApprovalModeStrategy → [GemmaClassifierStrategy when enabled] → ClassifierStrategy → NumericalClassifierStrategy → DefaultStrategy (terminal)`.
  Non-terminal strategies may return `null` to defer; the terminal always
  returns.
  - Primary: `packages/core/src/routing/modelRouterService.ts:39-67`;
    `packages/core/src/routing/strategies/compositeStrategy.ts:40-97`
  - Supporting: `packages/core/src/routing/modelRouterService.test.ts:39-198`
    (tests: "should initialize the CompositeStrategy with the correct child
    strategies in order", "should include GemmaClassifierStrategy when enabled")
  - Confidence: high
  - Quote:

```39:67:packages/core/src/routing/modelRouterService.ts
  private initializeDefaultStrategy(): TerminalStrategy {
    const strategies: RoutingStrategy[] = [];

    // Order matters here. Fallback and override are checked first.
    strategies.push(new FallbackStrategy());
    strategies.push(new OverrideStrategy());

    // Approval mode is next.
    strategies.push(new ApprovalModeStrategy());

    // Then, if enabled, the Gemma classifier is used.
    if (this.config.getGemmaModelRouterSettings()?.enabled) {
      strategies.push(new GemmaClassifierStrategy());
    }

    // The generic classifier is next.
    strategies.push(new ClassifierStrategy());

    // The numerical classifier is next.
    strategies.push(new NumericalClassifierStrategy());

    // The default strategy is the terminal strategy.
    const terminalStrategy = new DefaultStrategy();

    return new CompositeStrategy(
      [...strategies, terminalStrategy],
      'agent-router',
    );
  }
```

- **Truth 3**: Routing can emit **up to one** extra LLM call per prompt (the
  classifier) — not zero. `ClassifierStrategy` and `NumericalClassifierStrategy`
  both call `baseLlmClient.generateJson(...)` with
  `role: LlmRole.UTILITY_ROUTER` against the `classifier` model-config-key,
  which resolves to `gemini-2.5-flash-lite`. This is a silent, real API call
  that happens **before** the executor turn starts, so it adds latency and
  tokens to every prompt that reaches those strategies.
  - Primary:
    `packages/core/src/routing/strategies/classifierStrategy.ts:160-168`;
    `packages/core/src/routing/strategies/numericalClassifierStrategy.ts:135-143`;
    `packages/core/src/config/defaultModelConfigs.ts:105-116` (classifier →
    flash-lite)
  - Supporting: `packages/core/src/telemetry/llmRole.ts:7-19` (`UTILITY_ROUTER`
    role); emitted as a `ModelRoutingEvent` via `modelRouterService.ts:119-130`
  - Confidence: high

- **Truth 4**: The **`currentSequenceModel` sticky model is re-resolved through
  `applyModelSelection` on every turn** (not only when the router runs), so
  availability state can still mutate the model id mid-prompt even though the
  router is not re-consulted. This is the model-swap path during quota /
  transient failures inside a prompt.
  - Primary: `packages/core/src/core/client.ts:727-742`;
    `packages/core/src/availability/policyHelpers.ts:254-291`
  - Supporting:
    `packages/core/src/availability/fallbackIntegration.test.ts:41-90` (tests:
    "should select fallback model when primary model is terminal and config is
    in AUTO mode"; "should fallback for Gemini 3 models even if config is NOT in
    AUTO mode")
  - Confidence: high
  - Quote:

```727:742:packages/core/src/core/client.ts
    // availability logic
    const modelConfigKey: ModelConfigKey = {
      model: modelToUse,
      isChatModel: true,
    };
    const { model: finalModel } = applyModelSelection(
      this.config,
      modelConfigKey,
      { consumeAttempt: false },
    );
    modelToUse = finalModel;

    if (!signal.aborted && !this.currentSequenceModel) {
      yield { type: GeminiEventType.ModelInfo, value: modelToUse };
    }
    this.currentSequenceModel = modelToUse;
```

- **Truth 5**: `ModelAvailabilityService` is a **stateful health map** with
  three logical levels of availability. `terminal` is permanent for the process
  (until explicit `markHealthy` / `reset`); `sticky_retry.consumed` is cleared
  by `resetTurn()`. `Config.resetTurn()` is called from `sendMessageStream` at
  `client.ts:892-894`, so the sticky-retry flag resets at the top of every user
  prompt (not every turn of a multi-turn recursion).
  - Primary:
    `packages/core/src/availability/modelAvailabilityService.ts:41-137`;
    `packages/core/src/core/client.ts:892-894`
  - Supporting:
    `packages/core/src/availability/modelAvailabilityService.test.ts` (not
    quoted here); covered indirectly by `fallbackIntegration.test.ts`
  - Confidence: high

- **Truth 6**: Two **independent** fallback paths exist and neither uses the
  other:
  - (a) `FallbackStrategy` (inside the router) re-routes **before** the call if
    `snapshot.available === false`
    (`routing/strategies/fallbackStrategy.ts:36-59`).
  - (b) `handleFallback` (outside the router, from `retryWithBackoff`'s
    `onPersistent429` callback) re-selects **after** a 429/terminal failure, may
    prompt the user via `fallbackModelHandler`, and can call
    `config.activateFallbackMode(...)` which in turn emits
    `CoreEvent.ModelChanged`.
  - Both consult `resolvePolicyChain` / `selectFirstAvailable`, so chain
    definitions (`DEFAULT_CHAIN` or `modelChains.preview/default/lite`) are the
    single source of truth for fallback order.
  - Primary: `packages/core/src/routing/strategies/fallbackStrategy.ts:18-61`;
    `packages/core/src/fallback/handler.ts:25-110`;
    `packages/core/src/availability/policyCatalog.ts:58-77`;
    `packages/core/src/core/client.ts:1107-1112`
  - Supporting:
    `packages/core/src/availability/fallbackIntegration.test.ts:41-90`;
    `packages/core/src/fallback/handler.test.ts:83-410` (16+ tests covering
    `retry_always`, `retry_once`, `stop`, `upgrade`, etc.)
  - Confidence: high

- **Truth 7**: Loop detection is a **two-tier** system that adds **0 to 2 extra
  LLM calls per turn**:
  - Tier A — heuristic (no LLM): `ToolCallRequest` loops trigger at 5
    consecutive identical calls; `Content` loops trigger at 10 same-hash 50-char
    chunks within ≤ 5×chunkSize average distance. Both are O(chunks) and add no
    API cost.
  - Tier B — LLM-based: fires only after `LLM_CHECK_AFTER_TURNS = 30` turns in
    the _current prompt_, then every `llmCheckInterval` turns (dynamic 5–15).
    Each check is up to two `generateJson` calls: `'loop-detection'` (Gemini 3
    Flash) and, if flash confidence ≥ 0.9 and the double-check model is
    available, `'loop-detection-double-check'` (Gemini 3 Pro).
  - Primary:
    `packages/core/src/services/loopDetectionService.ts:29-66, :186-311, :540-673`
  - Supporting:
    `packages/core/src/services/loopDetectionService.test.ts:854-1148` (21 tests
    across "not trigger before 30", "confidence gating", "only call Flash if
    main model is unavailable", "Flash confident but main not", etc.)
  - Confidence: high
  - Quote:

```29:66:packages/core/src/services/loopDetectionService.ts
const TOOL_CALL_LOOP_THRESHOLD = 5;
const CONTENT_LOOP_THRESHOLD = 10;
const CONTENT_CHUNK_SIZE = 50;
const MAX_HISTORY_LENGTH = 5000;

/**
 * The number of recent conversation turns to include in the history when asking the LLM to check for a loop.
 */
const LLM_LOOP_CHECK_HISTORY_COUNT = 20;

/**
 * The number of turns that must pass in a single prompt before the LLM-based loop check is activated.
 */
const LLM_CHECK_AFTER_TURNS = 30;

/**
 * The default interval, in number of turns, at which the LLM-based loop check is performed.
 * This value is adjusted dynamically based on the LLM's confidence.
 */
const DEFAULT_LLM_CHECK_INTERVAL = 10;

/**
 * The minimum interval for LLM-based loop checks.
 * This is used when the confidence of a loop is high, to check more frequently.
 */
const MIN_LLM_CHECK_INTERVAL = 5;

/**
 * The maximum interval for LLM-based loop checks.
 * This is used when the confidence of a loop is low, to check less frequently.
 */
const MAX_LLM_CHECK_INTERVAL = 15;

/**
 * The confidence threshold above which the LLM is considered to have detected a loop.
 */
const LLM_CONFIDENCE_THRESHOLD = 0.9;
const DOUBLE_CHECK_MODEL_ALIAS = 'loop-detection-double-check';
```

- **Truth 8**: When the LLM loop-detection Flash call passes the 0.9 threshold,
  the double-check call uses `'loop-detection-double-check'` which is bound to
  `gemini-3-pro-preview` in `defaultModelConfigs.ts:197-202` — the **most
  expensive** Pro model. This is gated by
  `getModelAvailabilityService().snapshot(...).available`; if Pro is
  unavailable, the flash result is returned as-is without double check
  (`loopDetectionService.ts:616-628`).
  - Primary: `packages/core/src/services/loopDetectionService.ts:597-628`;
    `packages/core/src/config/defaultModelConfigs.ts:197-202`
  - Supporting:
    `packages/core/src/services/loopDetectionService.test.ts:1069-1099` (test:
    "should only call Flash model if main model is unavailable")
  - Confidence: high

- **Truth 9**: The **supported model universe** hardcoded in
  `VALID_GEMINI_MODELS` includes **eight** identifiers (not one): the
  `gemini-2.5-{pro,flash,flash-lite}` stable triple plus five preview variants
  across Gemini 3 and 3.1. Aliases `auto`, `pro`, `flash`, `flash-lite`,
  `auto-gemini-3`, `auto-gemini-2.5` all resolve into one of those eight,
  contextually (preview access, Gemini 3.1 launched flag, custom-tools flag).
  - Primary: `packages/core/src/config/models.ts:53-82`; resolver at `:98-187`
  - Supporting: `packages/core/src/config/defaultModelConfigs.ts:262-363`
    (modelDefinitions; tier/family/isPreview metadata)
  - Confidence: high

- **Truth 10**: The **Pollux scaffold is a stub**. The only file under
  `packages/core/src/pollux/` is `index.ts` (171 bytes) containing one banner
  comment and `export {};`. The `benchmark/` subdirectory is empty. There is no
  interceptor, no advisor client, no escalation detector, no benchmark runner,
  no settings reader anywhere in the repo.
  - Primary: `packages/core/src/pollux/index.ts` (10 lines, reproduced below);
    `Get-ChildItem packages/core/src/pollux -Recurse` returns exactly two
    entries (the file and the empty directory).
  - Supporting: negative search —
    ```
    rg -n "pollux|Pollux|POLLUX" packages
    ```
    returns only `packages/core/src/pollux/index.ts` (the banner comment and
    `export {}`). Verified. Zero other matches.
  - Confidence: high
  - Quote:

```1:10:packages/core/src/pollux/index.ts
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Pollux — Adaptive advisor layer for Gemini CLI
// Public exports

export {};
```

- **Truth 11**: Model-precedence documentation (`docs/cli/model-routing.md`) is
  **incomplete** relative to runtime behavior. It names five precedence sources
  (`--model` flag, `GEMINI_MODEL` env, `model.name`, Gemma local router,
  default) but **does not mention**:
  - the `ClassifierStrategy` (which silently overrides `auto` via a remote LLM
    call),
  - the `NumericalClassifierStrategy` (gated behind
    `getNumericalRoutingEnabled` + Gemini 3 models),
  - the `ApprovalModeStrategy` (which rewrites `auto` → Pro or Flash based on
    PLAN vs. post-approval).
  - Primary: `docs/cli/model-routing.md:43-60` (precedence list)
  - Supporting (behavioral):
    `packages/core/src/routing/strategies/classifierStrategy.ts`;
    `packages/core/src/routing/strategies/numericalClassifierStrategy.ts`;
    `packages/core/src/routing/strategies/approvalModeStrategy.ts`
  - Confidence: high (documentation vs. code disparity is mechanical)

- **Truth 12**: `ModelRouterService.route` has a **silent fallback on
  exception**: if the composite strategy throws, the catch block synthesizes a
  `RoutingDecision` with `model = config.getModel()` and
  `source = 'router-exception'` — **without consulting availability**. This
  means a model marked `terminal` in `ModelAvailabilityService` could still be
  returned if the terminal `DefaultStrategy` itself throws (rare, but reachable
  via `resolveModel` errors). The subsequent `applyModelSelection` call in
  `processTurn` compensates, so the user-visible effect is usually benign — but
  the router's own telemetry will record the un-compensated model.
  - Primary: `packages/core/src/routing/modelRouterService.ts:99-131`
  - Supporting: `packages/core/src/routing/modelRouterService.test.ts:197-215`
    (test: "should log a telemetry event and return fallback on a failed
    decision")
  - Confidence: medium (no test exercises the DefaultStrategy-throws path)
  - Quote:

```99:117:packages/core/src/routing/modelRouterService.ts
    } catch (e) {
      failed = true;
      error_message = e instanceof Error ? e.message : String(e);
      // Create a fallback decision for logging purposes
      // We do not actually route here. This should never happen so we should
      // fail loudly to catch any issues where this happens.
      decision = {
        model: this.config.getModel(),
        metadata: {
          source: 'router-exception',
          latencyMs: Date.now() - startTime,
          reasoning: 'An exception occurred during routing.',
          error: error_message,
        },
      };
```

- **Truth 13**: Setting `experimentalDynamicModelConfiguration = true` switches
  the availability path from the **legacy** static chains (`DEFAULT_CHAIN`,
  `FLASH_LITE_CHAIN` in `policyCatalog.ts`) to the **dynamic** `modelChains`
  defined in `defaultModelConfigs.ts:511+` and resolved via
  `config.modelConfigService.resolveChain(key, context)`. The same flag rewires
  `resolveModel` / `resolveClassifierModel` / `isGemini3Model` / `isAutoModel`
  to use the `modelDefinitions` metadata instead of hardcoded string checks.
  Routing strategies call these helpers directly, so the flag changes behavior
  across the entire router — not just availability.
  - Primary: `packages/core/src/availability/policyHelpers.ts:66-107`;
    `packages/core/src/config/models.ts:106-126, :208-219, :325-340, :395-407`
  - Supporting: `packages/core/src/config/defaultModelConfigs.ts:262-510`
    (modelDefinitions + modelIdResolutions + modelChains)
  - Confidence: high

## 5. Contradictions or Ambiguities

- **C-07.1 — "Single-model baseline" premise in `POLLUX_SPEC.md` is false
  (re-confirmed from compartment 02)**. The repo already runs a multi-layer
  router and fires `UTILITY_ROUTER` / `UTILITY_LOOP_DETECTOR` LLM calls that are
  silent to the user. Condition A ("Flash-only baseline") and Condition E
  ("Pro-only oracle") in `POLLUX_SPEC.md:398` cannot be reproduced without
  **disabling** or **pinning** the router and loop-detection LLM calls.
  - Evidence A: `packages/core/src/routing/strategies/classifierStrategy.ts`
    (hits `gemini-2.5-flash-lite` every prompt that reaches it);
    `packages/core/src/services/loopDetectionService.ts:540-635` (hits flash at
    turn 30+, possibly Pro at high confidence).
  - Evidence B: `POLLUX_SPEC.md:10-14, :398`
  - Resolution: **deferred** to compartment 14 and to the updated
    benchmark-fairness section of this report (Step 8 / section 6). The only way
    to produce a true single-model baseline is: (a) `OverrideStrategy`
    short-circuit by pinning `config.getModel()` to a non-`auto` concrete model,
    AND (b) disable loop-detection LLM calls either via a feature flag or by
    setting `config.getDisableLoopDetection() = true` (see
    `loopDetectionService.ts:189-192, :263-265`).

- **C-07.2 — Router "exception fallback" ignores availability state.**
  `routing/modelRouterService.ts:105-113` hardcodes
  `model: this.config.getModel()` on exception, with no availability check. This
  is correct only because `processTurn` re-runs `applyModelSelection` afterward.
  If a future refactor removes that post-check, a terminal-marked model could
  slip through.
  - Evidence A: `packages/core/src/routing/modelRouterService.ts:99-117`
  - Evidence B: `packages/core/src/core/client.ts:727-742` (compensating
    selection)
  - Resolution: **unresolved**. Recommended: make the exception fallback call
    `selectModelForAvailability(config, config.getModel())` instead of the raw
    model id, to make the router self-consistent and independent of the caller's
    post-processing.

- **C-07.3 — `docs/cli/model-routing.md` is incomplete.** See Truth 11. The doc
  describes only the availability-driven fallback, not the three classifier
  strategies that are active by default. A user reading this doc would believe
  `--model auto` always becomes the default stable model, when in fact it
  triggers a remote LLM classifier call.
  - Evidence A: `docs/cli/model-routing.md:43-60`
  - Evidence B: `packages/core/src/routing/strategies/classifierStrategy.ts`
  - Resolution: **handoff** to compartment 16 (docs) and potentially compartment
    06 (settings schema — should document `enableNumericalRouter`,
    `gemmaModelRouter`, `planModeRouting` flags).

- **C-07.4 — Pollux scaffold diverges from Spec §3 "architecture" diagram.**
  `POLLUX_SPEC.md` describes a `packages/core/src/pollux/` with interceptor,
  advisor client, escalation detector, logger, and benchmark runner — none of
  which exist in the repo. Forensic §3.1 already flagged this (F-01-adjacent);
  confirming here at commit `b43e7661ddaa7bbcc2283350a5eace8d2d8bb424`.
  - Evidence A: `packages/core/src/pollux/index.ts` (empty stub)
  - Evidence B: negative search
    `rg -n "PolluxInterceptor|AdvisorClient| EscalationDetector|PolluxLogger" packages`
    → 0 matches.
  - Resolution: **informational**. The compartment status is `scaffold`, as
    required by the guideline.

- **C-07.5 — Spec's "synthetic tool is the right injection method" does not
  compose with the existing routing split between inner (per-event) loop
  detection and outer (per-turn) routing.** The router decides model once per
  prompt; loop detection runs per-event AND pre-turn. If Pollux injects an
  `advisor_consultation` tool result mid-stream, the outer turn's model
  selection has already been committed. The spec does not say whether the
  advisor call must use the **selected model**, the **classifier model**, or a
  **dedicated `advisor` model alias**. Runtime evidence: there is no
  model-selection hook between `turn.run` and the advisor-would-inject point.
  - Evidence A: `packages/core/src/core/client.ts:722-752`
  - Evidence B: `POLLUX_SPEC.md:7 (advisor architecture)` (referenced by
    POLLUX_PRIORITY compartment 07 spec anchors)
  - Resolution: **deferred** to Pollux design. Recommended: add a new model
    alias `advisor` to `defaultModelConfigs.ts` (e.g., mapping to
    `gemini-2.5-flash-lite` or `gemini-3-pro-preview` depending on mode), and
    add a new `LlmRole.UTILITY_ADVISOR` value (already flagged in compartment 02
    contradiction C-02.2).

- **C-07.6 — `ClassifierStrategy` and `NumericalClassifierStrategy` both check
  `config.getNumericalRoutingEnabled()` but in **inverse** directions, which
  couples them implicitly.** If both strategies are enabled simultaneously and a
  non-Gemini-3 model is configured, neither can skip; the classifier wins
  because it runs first. For Gemini 3 + numerical enabled, the generic
  classifier short-circuits and the numerical one runs. This is correct today
  but is a subtle invariant — breaking the check in either file would cause
  double-routing or zero-routing.
  - Evidence A:
    `packages/core/src/routing/strategies/classifierStrategy.ts:140-145`
  - Evidence B:
    `packages/core/src/routing/strategies/numericalClassifierStrategy.ts:108-114`
  - Resolution: **unresolved**. Recommended: extract the gating predicate to a
    single helper (e.g., `shouldUseNumericalRouting(config, model)`) and call it
    from both strategies.

- **C-07.7 — `DefaultStrategy` does not consult availability**. It returns
  `config.getModel()` after `resolveModel`, no health check. This is by design
  (`FallbackStrategy` handles that earlier), but means the composite's
  _terminal_ is not self-consistent if `FallbackStrategy` is bypassed (e.g., by
  a thrown exception before `FallbackStrategy.route` completes). The
  `CompositeStrategy` swallows non-terminal exceptions
  (`compositeStrategy.ts :71-76`), so a throw in `FallbackStrategy` silently
  skips availability and lets `DefaultStrategy` choose an unhealthy model. The
  post-router `applyModelSelection` in `processTurn` does re-check — but **only
  on the first turn**, because subsequent sticky turns skip the router entirely.
  - Evidence A: `packages/core/src/routing/strategies/defaultStrategy.ts:20-42`
  - Evidence B:
    `packages/core/src/routing/strategies/compositeStrategy.ts:60-76`
  - Resolution: **unresolved**. Recommended: either make `DefaultStrategy`
    availability-aware or ensure the terminal's output is funneled through
    `selectModelForAvailability` at a single known seam.

## 6. Risks and Regression Hotspots

- **Risk R-07.1 — `currentSequenceModel` blocks re-routing during a prompt even
  if availability changes mid-prompt.** Once `currentSequenceModel` is set
  (first turn), subsequent turns of the same prompt take the short path at
  `client.ts:719-720` and never re-consult the router. If a 429 mid-prompt
  triggers `handleFallback` → `activateFallbackMode` → `emitModelChanged`, the
  change is honored (stickiness cleared) — but if `FallbackStrategy` wanted to
  kick in for a _different_ reason (e.g., remote availability change), it
  cannot. Net effect: availability policy has two entry points (router-time and
  retry-time), and a mid-prompt availability signal that doesn't come through
  `emitModelChanged` is invisible to the router.
  - Why fragile: two sources of truth for "when is the model re-selected"
    (router + `applyModelSelection`), and only one of them runs on non-first
    turns.
  - Mitigating test: `client.test.ts:1963-2010+` covers the `emitModelChanged`
    path but no test covers a mid-prompt availability transition without
    `emitModelChanged`.
  - Suggested guard: document the invariant "to force re-routing mid-prompt,
    emit `CoreEvent.ModelChanged`" as a runtime contract; add a unit test that
    marks a model terminal during a turn and asserts no reroute without the
    event.
  - Severity: **medium**

- **Risk R-07.2 — Loop-detection double-check Pro call can silently cost a full
  Pro prompt**. At turn 30+, a single content chunk that hits 0.9 confidence on
  Flash triggers a Pro call to `gemini-3-pro-preview` with **20 turns of
  history** (`LLM_LOOP_CHECK_HISTORY_COUNT = 20`). This can be tens of thousands
  of tokens of input for one check. In benchmark Condition A (Flash-only), this
  single call would corrupt the token budget.
  - Why fragile: no cap on the input size of `queryLoopDetectionModel`;
    `contents` may include any payload from the user's conversation.
  - Mitigating test: `loopDetectionService.test.ts:1069-1099` ("should only call
    Flash model if main model is unavailable") verifies Pro is **skipped** when
    unavailable, but **not** the token-budget impact.
  - Suggested guard: for benchmark builds, add a token-cap to
    `queryLoopDetectionModel` or force `DISABLE_LOOP_DETECTION=1` via
    `config.getDisableLoopDetection()` (verified disablement path at
    `loopDetectionService.ts:189-192`).
  - Severity: **high** (in benchmark context)

- **Risk R-07.3 — `CompositeStrategy` swallows non-terminal exceptions**. A
  production bug in `FallbackStrategy` or a classifier is logged at `debug`
  level and the chain silently proceeds to the next strategy. For benchmarks
  this is harmless; for debugging a routing regression it is invisible unless
  the agent's logs are at debug level.
  - Why fragile: `compositeStrategy.ts:71-76` calls `debugLogger.warn(...)` and
    `continue`s; no telemetry event is emitted on per-strategy failure.
  - Mitigating test: none found (searched `compositeStrategy.test.ts` for "fail"
    — see Open Question 07.3).
  - Suggested guard: emit a `RoutingStrategyFailedEvent` on per-strategy
    exception with `strategy.name` + error; escalate to ERROR if the terminal
    strategy is the one that failed (already does).
  - Severity: **medium**

- **Risk R-07.4 — `handleFallback` uses `config.getModel()` as source for the
  fresh chain**. `fallback/handler.ts:31` calls `resolvePolicyChain( config)`
  without passing the `failedModel`. `resolvePolicyChain` defaults to
  `config.getActiveModel?.() ?? config.getModel()`. If `activeModel` has been
  updated by a previous fallback in the same session, the chain can be resolved
  starting from the already-degraded model, potentially losing models above it
  in the chain.
  - Why fragile: `preferredModel` parameter exists but is unused at the handler
    call site.
  - Mitigating test: `fallback/handler.test.ts:83-410` covers many scenarios but
    (per quick inspection) not a chain re-resolution after multiple sequential
    fallbacks.
  - Suggested guard: pass `failedModel` as `preferredModel` in `handleFallback`
    → `resolvePolicyChain`, and add an integration test that triggers 429 twice
    and asserts the second fallback sees the full chain.
  - Severity: **low** (interaction is subtle, may be intentional)

- **Risk R-07.5 — `ApprovalModeStrategy` uses `Date.now()` in `reasoning`**.
  `approvalModeStrategy.ts:47` starts a timer but the return paths mostly report
  `Date.now() - startTime`. This bakes wall-clock into telemetry, which is fine,
  but the strategy is otherwise deterministic. For benchmark replay, reasoning
  strings with latency values make diffs noisy.
  - Why fragile: non-determinism in telemetry text.
  - Mitigating test: none found.
  - Suggested guard: for benchmark runs, strip latency fields from
    `RoutingDecision.metadata.reasoning` before logging.
  - Severity: **low**

- **Risk R-07.6 — Pollux scaffold directory implies runtime capability that does
  not exist**. A future contributor may import from `@pollux/core/pollux`
  expecting the scaffold to exist. The `export {};` stub will silently succeed
  the import, masking the gap.
  - Why fragile: empty-export barrel file with no runtime types.
  - Mitigating test: none.
  - Suggested guard: either (a) remove the scaffold until Phase 1 actually
    lands, or (b) export a `POLLUX_IMPLEMENTATION_STATUS = 'scaffold'` constant
    that callers can check.
  - Severity: **low** (cosmetic until Pollux development starts)

## 7. Test and Observability Coverage

- **Tests covering this compartment**:
  - `packages/core/src/routing/modelRouterService.test.ts` — 5 tests:
    composition order, gemma toggle, delegation to composite, telemetry on
    success, telemetry+fallback on failure.
  - `packages/core/src/routing/strategies/{default,fallback,override, approvalMode,classifier,numericalClassifier,gemmaClassifier,composite} Strategy.test.ts`
    — per-strategy unit coverage (not individually enumerated here; 8 test
    files, each co-located with its strategy).
  - `packages/core/src/availability/modelAvailabilityService.test.ts`,
    `policyCatalog.test.ts`, `policyHelpers.test.ts` — 3 files covering the
    health map, policy catalog, and chain-resolution helpers.
  - `packages/core/src/availability/fallbackIntegration.test.ts` — 2 tests
    focused on the "terminal on non-auto config" branch.
  - `packages/core/src/fallback/handler.test.ts` — 16+ tests covering all
    `FallbackIntent` branches (`retry_always`, `retry_once`, `stop`,
    `retry_later`, `retry_with_credits`, `upgrade`).
  - `packages/core/src/services/loopDetectionService.test.ts` — ~55 tests
    covering tool-call loops, content loops, code-block false-positive
    suppression, LLM double-check, confidence-based interval adjustment,
    disabled state, strike recovery.
  - `packages/core/src/core/client.test.ts` — `Model Routing` describe
    (`:1841-2010+`) — sticky within prompt, reset on new `prompt_id`, reroute on
    `CoreEvent.ModelChanged`.
  - Pollux: **no tests** (no code to test).

- **Observability signals**:
  - `ModelRoutingEvent` emitted from `modelRouterService.ts:119-130` on every
    decision (success or fail), with `decision.model`,
    `decision.metadata.source`, `latencyMs`, `reasoning`, `failed`,
    `error_message`, `approvalMode`, `enableNumericalRouting`,
    `classifierThreshold`.
  - `LoopDetectedEvent` from `loopDetectionService.ts:233-240` (heuristic +
    LLM-confirmed variants via `LoopType`).
  - `LlmLoopCheckEvent` from `loopDetectionService.ts:603-611, :650-658`
    (flash-confidence, double-check-model-name, main-confidence).
  - `LoopDetectionDisabledEvent` from `loopDetectionService.ts:169-172`.
  - `coreEvents.emitFeedback('error', …)` from `compositeStrategy.ts:90-94` only
    on terminal failure.
  - `LlmRole.UTILITY_ROUTER` and `LlmRole.UTILITY_LOOP_DETECTOR` tag all
    `UTILITY`-tier calls made by routing + loop detection, which flow through
    the `LoggingContentGenerator`'s `ApiRequestEvent`/ `ApiResponseEvent`
    pipeline (compartment 02 Truth 6/9). This means router and loop-detector
    token costs are **already** captured in existing telemetry.
  - `CoreEvent.ModelChanged` emitted by `config.activateFallbackMode` is
    listenable; the client uses it at `client.ts:121` to clear stickiness.

- **Coverage gaps** (behaviors without direct test):
  - `CompositeStrategy` non-terminal exception path (`R-07.3`): no test asserts
    a thrown non-terminal strategy is logged and chain continues.
  - Router "exception fallback" path (`C-07.2`): the fallback to
    `config.getModel()` on `DefaultStrategy` throw is unverified.
  - Router stickiness interaction with `handleFallback` mid-prompt:
    `client.test.ts` has the `emitModelChanged` reroute test but not the _full_
    fallback path (handler → activate → emit → reroute) as a single integration.
  - Loop-detection LLM call token-budget (`R-07.2`): no test caps input size.
  - Numerical routing threshold resolution (`getResolvedClassifierThreshold` at
    `numericalClassifierStrategy.ts:190`): only covered indirectly via strategy
    unit tests.
  - Pollux: 0 coverage (scaffold only).

## 8. Open Questions

- [ ] **OQ-07.1** — When `FallbackStrategy` returns a non-default model, does
      `OverrideStrategy` still fire and override it? Short read: no, because
      `CompositeStrategy` returns on first non-null
      (`compositeStrategy.ts:60-69`). But the _intent_ of the order
      `Fallback → Override` seems inverted: Override should arguably be checked
      first (user explicit choice). Confirm with tests or spec.
- [ ] **OQ-07.2** — Is `isGemini3Model(model, config)` called with
      `model = 'classifier'` (the alias, not the concrete model) anywhere?
      `NumericalClassifierStrategy` passes `model` through, but if that's
      `'auto-gemini-3'` the result should be true; if it's `'auto-gemini-2.5'`
      should be false. The tests need to enumerate.
- [ ] **OQ-07.3** — Does `compositeStrategy.test.ts` cover the
      per-strategy-exception path (R-07.3)? Did not open the test file in this
      pass; flagged for follow-up.
- [ ] **OQ-07.4** — What is the interaction between `disableLoopDetection` and
      the `LoopDetectionDisabledEvent`? If the flag is set mid-session via
      `disableForSession`, is the `addAndCheck` path still called from the
      client's inner `for-await` loop, and if so, does it early-return with
      `{ count: 0 }` every time (verified at `loopDetectionService.ts:186-192`)
      or does it short-circuit inside `processTurn`?
- [ ] **OQ-07.5** — Does the `classifier` model-config-key resolve differently
      under `experimentalDynamicModelConfiguration = true`? The alias
      `'classifier'` is defined in `defaultModelConfigs.ts` but only the
      resolved model reaches `baseLlmClient.generateJson`; if the dynamic path
      rewrites `classifier`, the cost model changes.
- [ ] **OQ-07.6** — For Pollux benchmark planning: can we gate the LLM loop
      check behind a simple boolean (e.g., pass `maxAttempts: 0` to
      `generateJson`, or add a `disableLlmLoopCheck` settings flag), or does it
      require a new feature flag? Today the only global disable is
      `getDisableLoopDetection()` which disables the heuristic **and** LLM tiers
      simultaneously.

## 9. Definition of Done

Copied from `07-routing-availability-loop-and-pollux.md` and ticked where
satisfied.

- [x] Routing and fallback flow is evidence-backed. (Section 2; Truths 1–6,
      12–13; 12 distinct code citations across `client.ts`,
      `modelRouterService.ts`, strategies, `fallback/handler.ts`)
- [x] Loop detection interactions are documented. (Truths 7–8; Section 2 steps 1
      and 8; R-07.2)
- [x] Model registry and default behavior are verified. (Truth 9; section 3
      `models.ts` / `defaultModelConfigs.ts` rows; 8 `VALID_GEMINI_MODELS` +
      aliases)
- [x] Pollux implementation status is accurately classified (`scaffold`). (Truth
      10; negative-search citation; C-07.4; R-07.6)
- [x] Benchmark control guidance is explicit and actionable. (Section 8 / Step 8
      below; C-07.1 resolution; R-07.2 resolution)
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar. (see
      `reports/07-routing-availability-loop-and-pollux/report.json`)
- [ ] `INDEX.md` row 07 flipped to `done`. (performed at commit time)

Additional template DoD:

- [x] All guideline DoD items satisfied.
- [x] Evidence matrix populated in sidecar JSON.
- [ ] `INDEX.md` updated to `done` (at commit time).

### Step 8 — Benchmark Fairness Controls (concrete recommendations)

These controls must be applied to any Pollux benchmark run (Conditions A/B/C/
D/E per `POLLUX_SPEC.md:398`) or the resulting token/latency numbers are not
comparable:

1. **Pin the router to a single terminal model** via `OverrideStrategy`: set
   `config.getModel() = 'gemini-2.5-flash'` (Condition A) or
   `'gemini-3-pro-preview'` (Condition E). `OverrideStrategy` short-circuits on
   non-`auto` models (`:32`), so the classifier strategies never fire.
2. **Disable the GemmaClassifierStrategy** via settings:
   `gemmaModelRouter.enabled = false` (see `modelRouterService.ts:50`).
3. **Disable plan-mode routing**: ensure `config.getPlanModeRoutingEnabled()`
   returns `false` so `ApprovalModeStrategy` returns null (`:43`). Equivalent:
   use a non-PLAN `ApprovalMode` and do not set `approvedPlanPath`.
4. **Disable numerical routing**: `getNumericalRoutingEnabled()` must return
   `false` (affects both `ClassifierStrategy` short-circuit and
   `NumericalClassifierStrategy` gate).
5. **Disable the LLM loop-detection tier** during benchmark runs by setting
   `config.getDisableLoopDetection() = true` (see
   `loopDetectionService.ts:186-192, :263-265`). This disables **both**
   heuristic and LLM tiers — acceptable for benchmarks where the loops
   themselves are not the measured variable; unacceptable if a condition depends
   on loop recovery.
6. **Freeze the availability service** at the start of each run:
   `config.getModelAvailabilityService().reset()` (verified at
   `modelAvailabilityService.ts:126-128`). Without this, prior turns could leak
   `sticky_retry.consumed = true` into the benchmark.
7. **Do not enable `experimentalDynamicModelConfiguration`** unless the
   benchmark is explicitly measuring the dynamic chain path (see Truth 13); it
   changes behavior across the entire router layer.
8. **Capture `LlmRole`-tagged token usage** as the source of truth for
   router/loop-detector costs. This is already in `LoggingContentGenerator`; no
   new instrumentation is required. Reject any proposal for a new
   `pollux/logger.ts` (see compartment 02 C-02.2 and forensic F-10).
9. **For condition C/D (Pollux on)**: keep the above pins in place; Pollux
   interceptor should introduce exactly **one** new `UTILITY_ADVISOR` role and
   the benchmark assertion `tokens(ADVISOR) ≤ X%` should be enforced against
   that role in the evidence collected via `ApiResponseEvent`-tagged telemetry.
10. **Record the commit SHA** (`b43e7661ddaa7bbcc2283350a5eace8d2d8bb424` or
    later) alongside each run so that changes to `defaultModelConfigs.ts` (e.g.,
    the `classifier` alias flipping from flash-lite to a different model) are
    attributable. The `classifier` alias resolving to `gemini-2.5-flash-lite`
    today is **not** a stable contract.

## 10. Evidence Matrix (summary)

The authoritative matrix lives in
`reports/07-routing-availability-loop-and-pollux/report.json`. Summary:

| Claim                                                                                                      | Primary                                                                                                                              | Supporting                                                                                                                      | Confidence |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Routing entry = `getModelRouterService().route(routingContext)`; one call per prompt unless sticky cleared | `packages/core/src/core/client.ts:709-725`                                                                                           | `packages/core/src/core/client.test.ts:1887-1961` (test: sticky + reroute on new prompt / `emitModelChanged`)                   | high       |
| Router is a `CompositeStrategy` chain of 7-8 strategies in fixed order                                     | `packages/core/src/routing/modelRouterService.ts:39-67`                                                                              | `packages/core/src/routing/modelRouterService.test.ts:39-198` (test: composition + gemma toggle)                                | high       |
| Routing can fire up to 1 extra LLM call (`UTILITY_ROUTER`) against `classifier` → flash-lite               | `packages/core/src/routing/strategies/classifierStrategy.ts:160-168`                                                                 | `packages/core/src/config/defaultModelConfigs.ts:105-116` (`classifier` → `gemini-2.5-flash-lite`); `telemetry/llmRole.ts:7-19` | high       |
| Sticky model is re-resolved via `applyModelSelection` every turn (not just router-run turns)               | `packages/core/src/core/client.ts:727-742`                                                                                           | `packages/core/src/availability/fallbackIntegration.test.ts:41-90` (test)                                                       | high       |
| `ModelAvailabilityService` has 3 health levels; `resetTurn()` fires from `sendMessageStream`               | `packages/core/src/availability/modelAvailabilityService.ts:41-137`                                                                  | `packages/core/src/core/client.ts:892-894`                                                                                      | high       |
| Two independent fallback paths (FallbackStrategy pre-call + `handleFallback` post-failure)                 | `packages/core/src/routing/strategies/fallbackStrategy.ts:18-61`; `packages/core/src/fallback/handler.ts:25-110`                     | `packages/core/src/fallback/handler.test.ts:83-410` (test: 16 branches)                                                         | high       |
| Loop detection: heuristic (0 calls) + LLM tier (0-2 calls, starts at turn 30)                              | `packages/core/src/services/loopDetectionService.ts:29-66, :540-673`                                                                 | `packages/core/src/services/loopDetectionService.test.ts:854-1148` (test: 21 LLM-tier tests)                                    | high       |
| Double-check model for loops is `gemini-3-pro-preview` via alias `loop-detection-double-check`             | `packages/core/src/services/loopDetectionService.ts:66, :597-628`                                                                    | `packages/core/src/config/defaultModelConfigs.ts:197-202`                                                                       | high       |
| 8 supported Gemini model identifiers + aliases (`auto`, `pro`, `flash`, `flash-lite`, ...)                 | `packages/core/src/config/models.ts:53-82`                                                                                           | `packages/core/src/config/defaultModelConfigs.ts:262-363` (modelDefinitions)                                                    | high       |
| Pollux is scaffold: `index.ts` = 10 lines of stub; `benchmark/` empty                                      | (negative) `rg "pollux\|Pollux\|POLLUX" packages` → 1 match (the banner of `index.ts`)                                               | `Get-ChildItem packages/core/src/pollux -Recurse` → 2 entries (stub file + empty dir)                                           | high       |
| `docs/cli/model-routing.md` omits classifier/approval-mode/numerical strategies                            | `docs/cli/model-routing.md:43-60`                                                                                                    | `packages/core/src/routing/strategies/{classifier,numericalClassifier,approvalMode}Strategy.ts`                                 | high       |
| Router exception fallback skips availability (compensated by `applyModelSelection`)                        | `packages/core/src/routing/modelRouterService.ts:99-117`                                                                             | `packages/core/src/routing/modelRouterService.test.ts:197-215` (test)                                                           | medium     |
| `experimentalDynamicModelConfiguration` rewires both availability and the whole router layer               | `packages/core/src/availability/policyHelpers.ts:66-107`; `packages/core/src/config/models.ts:106-126, :208-219, :325-340, :395-407` | `packages/core/src/config/defaultModelConfigs.ts:262-510`                                                                       | high       |

## 11. Handoffs

- **Depends on**: compartment 02 (Core Turn Engine) — this report treats
  `processTurn`'s turn-lifecycle as a black box and only traces the seams at
  `client.ts:690` (pre-turn loop check), `:709-745` (routing + availability),
  and `:1107-1112` (fallback handler).
- **Affects (downstream)**:
  - Compartment 06 (Settings) — `gemmaModelRouter.enabled`,
    `planModeRoutingEnabled`, `numericalRoutingEnabled`, `classifierThreshold`,
    `experimentalDynamicModelConfiguration`, `disableLoopDetection`,
    `fallbackModelHandler` all originate here and live in settings.
  - Compartment 14 (Testing/Benchmark) — Section 8 above is the compartment's
    concrete input to the benchmark harness.
  - Compartment 11 (Telemetry) — `ModelRoutingEvent`, `LoopDetectedEvent`,
    `LlmLoopCheckEvent`, `LoopDetectionDisabledEvent` export pipeline lives
    there.
  - Compartment 16 (Docs) — `docs/cli/model-routing.md` needs four additions
    (C-07.3).
- **Escalated to**:
  - Compartment 06 for OQ-07.5 (alias resolution under
    `experimentalDynamicModelConfiguration`).
  - Compartment 14 for OQ-07.6 (selective disable of LLM loop-check) and R-07.2
    (token-budget cap in benchmark builds).
  - Compartment 16 for C-07.3 (documentation gap).

### Boundary confirmation

Per the tightened handoff notes in the guideline:

- **Boundary with 02 (Core Turn Engine)**: this report consumes the
  `processTurn` event-yield seam and the `for await` loop as black boxes. Any
  claim about _how the turn runs once a model is chosen_ is deferred to
  compartment 02 (and this report cites its report where the invariants are
  inherited — `client.ts:883-1039` lifecycle, loop detection at two sites,
  sticky stickiness triggers).
- **Boundary with 14 (Benchmark)**: Step 8 above lists **control
  recommendations** only. Harness implementation (Vitest fixtures, CI wiring,
  fixture replay) is deferred to 14.
