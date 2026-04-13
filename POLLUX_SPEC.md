# Pollux — Master Implementation Document

---

## 1. Project Overview

**Name:** Pollux **Tagline:** Adaptive advisor layer for Gemini CLI — flash
intelligence when you need it, pro judgment when it counts.

**Core idea:** Gemini CLI today runs every task on a single model. Pollux
intercepts the agentic loop inside a fork of gemini-cli and introduces a second
model — a Pro advisor — that the executor (Flash) consults only when it hits a
decision it cannot confidently resolve alone. The result is near-Pro accuracy at
near-Flash cost, with a tunable escalation system that can be benchmarked across
three strategies.

**Inspired by:** Anthropic's Advisor Strategy (launched April 9, 2026),
reimplemented from scratch for the Gemini ecosystem as an open-source, forkable,
benchmarkable module.

---

## 2. Goals

**Primary:**

- Build a working advisor layer inside a gemini-cli fork
- Support swappable escalation strategies (heuristic, structured, hybrid)
- Support a matrix of executor and advisor models
- Produce real benchmark data comparing Flash-only vs Flash+Advisor vs Pro-only

**Secondary:**

- Clean enough to demo at a GDG event
- Structured enough to pitch as a PR or standalone package
- Documented well enough to be a portfolio piece

**Non-goals (for now):**

- Production hardening
- Multi-user support
- Cloud deployment
- UI changes beyond minimal advisor indicators

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  gemini-cli fork                │
│                                                 │
│  packages/cli        packages/core              │
│  (unchanged)         (modified)                 │
│                           │                     │
│                    ┌──────▼──────┐              │
│                    │ GeminiClient│              │
│                    │ (client.ts) │              │
│                    └──────┬──────┘              │
│                           │                     │
│                    ┌──────▼──────┐              │
│                    │  Turn.run() │              │
│                    │  (turn.ts)  │              │
│                    └──────┬──────┘              │
│                           │                     │
│              ┌────────────▼────────────┐        │
│              │     PolluxInterceptor   │  NEW   │
│              │  (pollux/interceptor.ts)│        │
│              └────────────┬────────────┘        │
│                           │                     │
│          ┌────────────────┼────────────────┐    │
│          │                │                │    │
│   ┌──────▼──────┐  ┌──────▼──────┐        │    │
│   │ Escalation  │  │   Advisor   │        │    │
│   │  Detector   │  │   Client    │        │    │
│   │(detector.ts)│  │(advisor.ts) │        │    │
│   └──────┬──────┘  └──────┬──────┘        │    │
│          │                │                │    │
│          └────────────────┘                │    │
│                    │                        │    │
│             ┌──────▼──────┐                │    │
│             │  Token      │                │    │
│             │  Logger     │                │    │
│             │(logger.ts)  │                │    │
│             └─────────────┘                │    │
└─────────────────────────────────────────────────┘
```

**All Pollux code lives under:** `packages/core/src/pollux/`

**Files touched in existing codebase:**

- `packages/core/src/core/client.ts` — wire in PolluxInterceptor
- `packages/core/src/core/turn.ts` — pause/resume stream around advisor call
- `packages/core/src/config/config.ts` — add PolluxConfig reader
- `~/.gemini/settings.json` — new `pollux` settings block

**Files created (all under `packages/core/src/pollux/`):**

- `index.ts` — public exports
- `interceptor.ts` — main orchestration logic
- `advisor.ts` — Pro model client, single-shot consultation
- `detector.ts` — escalation signal, three swappable strategies
- `logger.ts` — token counting, cost proxy, run metadata
- `prompts.ts` — advisor system prompt, context formatter
- `models.ts` — model registry, pricing metadata
- `types.ts` — shared interfaces
- `benchmark/runner.ts` — benchmark harness
- `benchmark/tasks.ts` — task suite definitions
- `benchmark/report.ts` — results aggregation and output

---

## 4. Model Registry

```typescript
// pollux/models.ts

export const EXECUTOR_MODELS = {
  'gemini-3-flash-preview': { tier: 'flash', inPrice: 0, outPrice: 0 },
  'gemini-3.1-flash-lite-preview': {
    tier: 'flash-lite',
    inPrice: 0,
    outPrice: 0,
  },
  'gemini-2.5-flash': { tier: 'flash', inPrice: 0, outPrice: 0 },
  'gemini-2.5-flash-lite': { tier: 'flash-lite', inPrice: 0, outPrice: 0 },
} as const;

export const ADVISOR_MODELS = {
  'gemini-3.1-pro-preview': { tier: 'pro', inPrice: 0, outPrice: 0 },
  'gemini-2.5-pro': { tier: 'pro', inPrice: 0, outPrice: 0 },
} as const;

// Prices are 0 for free-tier benchmarking
// Token counts are used as the cost proxy metric instead
```

Default pairing: `gemini-3-flash-preview` + `gemini-3.1-pro-preview`

---

## 5. Settings Schema

New block added to `~/.gemini/settings.json`:

```json
{
  "pollux": {
    "enabled": true,
    "executorModel": "gemini-3-flash-preview",
    "advisorModel": "gemini-3.1-pro-preview",
    "escalationStrategy": "hybrid",
    "maxAdvisorCallsPerTurn": 3,
    "confidenceThreshold": 6,
    "logTokens": true,
    "logPath": "~/.gemini/pollux-logs/"
  }
}
```

---

## 6. Escalation Strategies — Detailed Design

Each strategy is a class implementing the same interface:

```typescript
interface EscalationDetector {
  name: 'heuristic' | 'structured' | 'hybrid';
  shouldEscalate(context: TurnContext): EscalationDecision;
  reset(): void;
}

interface TurnContext {
  turnNumber: number;
  toolCallHistory: ToolCall[];
  lastToolResult: ToolResult | null;
  streamBuffer: string; // partial Flash output so far
  retryCount: number;
  consecutiveFailures: number;
}

interface EscalationDecision {
  escalate: boolean;
  reason: string;
  confidence?: number; // only for structured/hybrid
}
```

### Strategy A — Heuristic

Triggers escalation based on observable failure signals. No extra API call. Zero
latency overhead.

Trigger conditions (any one fires escalation):

- Same tool called ≥ 2 times with same args (stuck in loop)
- Tool returned error AND Flash's next output starts with uncertainty markers
  (`"I'm not sure"`, `"It seems"`, `"I'm having trouble"`)
- Turn count exceeds threshold (default: 8 turns) without task completion
- Flash emits `ask_user` signal (it's asking the human = it's stuck)
- Consecutive tool failures ≥ 2

```typescript
class HeuristicDetector implements EscalationDetector {
  name = 'heuristic' as const;

  shouldEscalate(ctx: TurnContext): EscalationDecision {
    if (this.isLooping(ctx)) return { escalate: true, reason: 'tool_loop' };
    if (this.isConfusedAfterError(ctx))
      return { escalate: true, reason: 'error_confusion' };
    if (ctx.turnNumber > 8) return { escalate: true, reason: 'turn_overflow' };
    if (ctx.consecutiveFailures >= 2)
      return { escalate: true, reason: 'consecutive_failures' };
    return { escalate: false, reason: 'none' };
  }
}
```

### Strategy B — Structured

Modifies Flash's system prompt to emit a confidence tag at the end of every
reasoning step. Parser reads the tag from the stream before forwarding output to
the UI.

Prompt injection (appended to Flash system prompt):

```
At the end of each reasoning step before taking an action, output exactly:
<pollux_confidence>N</pollux_confidence>
where N is your confidence 1-10 that your current approach is correct.
Do not explain the number. Output it silently.
```

Stream parser strips the tag before it hits the UI. If N < threshold (default:
6), escalation fires.

Cost: zero extra API calls. Latency: zero added. Risk: Flash sometimes ignores
the instruction or outputs it mid-stream inconsistently.

```typescript
class StructuredDetector implements EscalationDetector {
  name = 'structured' as const;
  private threshold: number;

  shouldEscalate(ctx: TurnContext): EscalationDecision {
    const confidence = this.parseConfidenceTag(ctx.streamBuffer);
    if (confidence === null) return { escalate: false, reason: 'no_tag' };
    if (confidence < this.threshold)
      return { escalate: true, reason: 'low_confidence', confidence };
    return { escalate: false, reason: 'high_confidence', confidence };
  }

  private parseConfidenceTag(buffer: string): number | null {
    const match = buffer.match(/<pollux_confidence>(\d+)<\/pollux_confidence>/);
    return match ? parseInt(match[1]) : null;
  }
}
```

### Strategy C — Hybrid

Runs both detectors. Heuristic acts as a hard floor (always fires on obvious
failures). Structured acts as an early warning (fires before Flash even makes a
mistake). Either one firing triggers escalation.

```typescript
class HybridDetector implements EscalationDetector {
  name = 'hybrid' as const;
  private heuristic = new HeuristicDetector();
  private structured: StructuredDetector;

  shouldEscalate(ctx: TurnContext): EscalationDecision {
    const h = this.heuristic.shouldEscalate(ctx);
    if (h.escalate) return { ...h, reason: `heuristic:${h.reason}` };

    const s = this.structured.shouldEscalate(ctx);
    if (s.escalate) return { ...s, reason: `structured:${s.reason}` };

    return { escalate: false, reason: 'none' };
  }
}
```

---

## 7. Advisor Client — Detailed Design

Single-shot Pro consultation. Stateless. Does not continue the conversation.
Returns a plan string that gets injected back into Flash's context as a
synthetic tool result.

```typescript
// pollux/advisor.ts

class AdvisorClient {
  private model: string;
  private contentGenerator: ContentGenerator;

  async consult(
    history: Content[],
    stalledReason: string,
    taskContext: string,
  ): Promise<AdvisorPlan> {
    const prompt = buildAdvisorPrompt(history, stalledReason, taskContext);

    // Single non-streaming call via generateJson
    // Uses existing utility path in client.ts — no new API surface
    const raw = await this.contentGenerator.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      model: this.model,
    });

    return {
      action: raw.action, // 'continue' | 'replan' | 'stop'
      reasoning: raw.reasoning,
      nextSteps: raw.next_steps, // string[]
      rawTokensIn: raw.usageMetadata.promptTokenCount,
      rawTokensOut: raw.usageMetadata.candidatesTokenCount,
    };
  }
}
```

Advisor system prompt (in `pollux/prompts.ts`):

```
You are a senior engineering advisor. A junior AI agent (Flash) is working on a
coding task and has gotten stuck. You will be shown the full conversation history
and the reason it escalated.

Your job: provide a short, concrete plan (3-5 steps max) to get it unstuck.
Do NOT execute anything. Do NOT write code. Only plan.

Respond in JSON:
{
  "action": "continue" | "replan" | "stop",
  "reasoning": "one sentence explaining what went wrong",
  "next_steps": ["step 1", "step 2", ...]
}
```

Injection back into Flash: The plan is formatted as a synthetic tool result and
appended to the conversation history before Flash's next generation call. Flash
sees it as the result of an `advisor_consultation` tool it "called."

---

## 8. Token Logger

```typescript
// pollux/logger.ts

interface TurnLog {
  taskId: string;
  trial: number;
  condition: 'flash_only' | 'flash_advisor' | 'pro_only';
  escalationStrategy: 'heuristic' | 'structured' | 'hybrid' | 'none';

  // Per-model token breakdown
  executorTokensIn: number;
  executorTokensOut: number;
  advisorTokensIn: number; // 0 when no advisor
  advisorTokensOut: number; // 0 when no advisor
  totalTokens: number;

  // Escalation metadata
  advisorCallCount: number;
  escalationReasons: string[];

  // Outcome
  passed: boolean;
  turnCount: number;
  wallTimeMs: number;
  advisorLatencyMs: number;
}
```

Logs are written as newline-delimited JSON to
`~/.gemini/pollux-logs/run-{timestamp}.jsonl`. The benchmark report script reads
these and computes aggregated metrics.

---

## 9. Benchmark Design

### Conditions

| ID  | Executor | Advisor | Escalation |
| --- | -------- | ------- | ---------- |
| A   | Flash    | none    | none       |
| B   | Flash    | Pro     | heuristic  |
| C   | Flash    | Pro     | structured |
| D   | Flash    | Pro     | hybrid     |
| E   | Pro      | none    | none       |

Condition A = baseline. Condition E = oracle ceiling. B/C/D = the three Pollux
modes.

### Task Suite

30 tasks across three difficulty tiers. Each task has:

- A natural language prompt (what Flash is asked to do)
- A target repo or file context
- A correctness oracle (test command or diff check)
- A difficulty label

**Easy (10 tasks):** Single file bug fix, rename a function, add a docstring,
fix a test that fails with an obvious error message, add error handling to one
function.

**Medium (10 tasks):** Multi-file refactor, implement a feature from a spec, fix
a bug that requires reading multiple files to understand, debug a subtle logic
error, add a new API endpoint.

**Hard (10 tasks):** Architectural decision with tradeoffs, recover from a wrong
implementation path, debug a concurrency issue, implement something requiring
understanding of a complex system, resolve conflicting requirements.

Task sources (decide later, all options viable):

- Custom hand-written tasks on a small open source repo you control
- SWE-bench Verified subset (30 problems from the 500)
- Terminal-Bench task library

### Metrics Per Task

```
accuracy:           pass | fail (binary, from oracle)
executor_tokens_in: integer
executor_tokens_out: integer
advisor_tokens_in:  integer (0 if no advisor)
advisor_tokens_out: integer (0 if no advisor)
total_tokens:       sum of all above
advisor_calls:      integer (0 if no advisor)
escalation_reasons: string[] (what triggered each call)
turn_count:         integer
wall_time_ms:       integer
advisor_latency_ms: integer (added latency from Pro calls)
```

### Statistical Plan

- 3 trials per task per condition
- 30 tasks × 5 conditions × 3 trials = 450 total runs
- Report mean ± std for token counts
- Report accuracy as pass rate with 95% CI (Wilson interval, appropriate for
  binary outcomes)
- Rate limiting: 1 req/s with exponential backoff

### Escalation Signal Quality Metrics

```
precision = tasks where (advisor called AND flash_only fails) / tasks where advisor called
recall    = tasks where (advisor called AND flash_only fails) / all tasks where flash_only fails
```

High precision = Pro not wasted on easy tasks. High recall = Pro catching the
cases Flash actually needs help on.

---

## 10. Roadmap

### Phase 0 — Setup (Day 1)

- Fork gemini-cli
- Study `client.ts`, `turn.ts`, `contentGenerator.ts`, `config.ts`
- Set up local dev environment, confirm `npm run dev` works
- Create `packages/core/src/pollux/` directory structure
- Confirm model strings work against your API key

### Phase 1 — Foundation (Days 2–3)

- Implement `types.ts` — all shared interfaces
- Implement `models.ts` — model registry
- Implement `logger.ts` — token logger stub (log everything, compute nothing
  yet)
- Add `pollux` block to settings schema in `config.ts`
- Write unit tests for types and model registry

### Phase 2 — Advisor Client (Days 4–5)

- Implement `prompts.ts` — advisor system prompt + context formatter
- Implement `advisor.ts` — single-shot Pro consultation
- Register `advisor_consultation` as a synthetic tool in the tool registry
- Test advisor in isolation: hardcode a stalled context, confirm Pro returns a
  valid plan
- Wire token logging into advisor responses

### Phase 3 — Escalation Detectors (Days 6–8)

- Implement `HeuristicDetector` — all 5 trigger conditions
- Implement `StructuredDetector` — prompt injection + stream parser
- Implement `HybridDetector` — composition of the two
- Unit test each detector independently with mocked `TurnContext` inputs
- Test structured detector's tag stripping doesn't corrupt the UI stream

### Phase 4 — Interceptor + Integration (Days 9–11)

- Implement `interceptor.ts` — main orchestration
- Wire interceptor into `client.ts` at `processTurn()`
- Wire stream pause/resume in `turn.ts` around advisor call
- Integration test: run a real task in Flash-only mode, confirm nothing breaks
- Run a real task that should escalate, confirm advisor fires and plan is
  injected
- Confirm Flash uses the plan and continues correctly

### Phase 5 — Benchmark Harness (Days 12–14)

- Implement `benchmark/tasks.ts` — 30 task definitions
- Implement `benchmark/runner.ts` — runs conditions, respects rate limits,
  writes logs
- Implement `benchmark/report.ts` — reads logs, computes all metrics, outputs
  table
- Test harness on 3 tasks × 2 conditions as a smoke test

### Phase 6 — Benchmark Runs (Days 15–17)

- Run full 450-task benchmark
- Fix any runtime issues discovered during runs
- Generate final report

### Phase 7 — Polish (Days 18–20)

- Write README with architecture diagram, benchmark results, usage instructions
- Add `/pollux` slash command to CLI for toggling advisor on/off at runtime
- Optional: minimal UI indicator showing when advisor was consulted

---

## 11. PRD

**Problem:** Gemini CLI uses a single model for every task regardless of
complexity. Easy tasks waste no money on the free tier but hard tasks fail more
than they should, and there's no way to get Pro-level judgment without paying
Pro-level token costs across the board.

**Solution:** Pollux introduces a two-tier model system where Flash runs as
executor and Pro is consulted only on escalation. The escalation signal is
tunable and benchmarkable.

**Users:** Developers using Gemini CLI on free/pro tier who want better outcomes
on complex coding tasks without switching to Pro for everything.

**Success criteria:**

- Accuracy on hard tasks improves by ≥5 percentage points vs Flash-only
- Total token consumption does not increase by more than 20% vs Flash-only
- Escalation precision ≥ 0.6 (Pro called on real failure cases, not noise)
- Zero regressions on easy tasks (accuracy stays flat or improves)

**Out of scope:** UI redesign, multi-agent orchestration, cloud deployment,
fine-tuning.

---

## 12. Key Technical Risks

**Risk 1 — Stream splice corruption** Pausing `Turn.run()`'s streaming event
loop to inject an advisor result and resume is the hardest integration point. If
the pause/resume is not clean, the UI hook (`useGeminiStream.ts`) will receive
events out of order and potentially crash. _Mitigation:_ Build the interceptor
to work on completed turns first (non-streaming), get that stable, then add
streaming support.

**Risk 2 — Structured detector reliability** Flash may not consistently emit
`<pollux_confidence>` tags, especially mid-stream. If the tag appears after the
action has already been decided, it's too late. _Mitigation:_ Prompt
engineering + fallback to heuristic if no tag detected within first 200 tokens
of output.

**Risk 3 — Advisor context size** Passing the full conversation history to Pro
on every escalation makes Pro calls expensive in tokens. On a long task the
history could be 50k+ tokens. _Mitigation:_ Implement context trimming in
`prompts.ts` — summarize history older than N turns, keep last 5 turns verbatim.

**Risk 4 — Rate limits during benchmark** 450 runs at mixed Flash/Pro could hit
rate limits mid-benchmark and corrupt results. _Mitigation:_ Checkpoint after
each task. Resume from checkpoint. Exponential backoff on 429s.

**Risk 5 — Oracle reliability** If your correctness oracle (test command) is
flaky, pass/fail numbers are meaningless. _Mitigation:_ Run oracle 3 times per
task and take majority vote.

---

## 13. File Structure

```
packages/core/src/pollux/
├── index.ts                  # public exports
├── types.ts                  # all shared interfaces
├── models.ts                 # model registry + pricing
├── interceptor.ts            # main orchestration, wired into client.ts
├── advisor.ts                # Pro consultation client
├── detector.ts               # all three EscalationDetector implementations
├── logger.ts                 # TokenLogger, TurnLog, file writer
├── prompts.ts                # advisor system prompt, context formatter
└── benchmark/
    ├── runner.ts             # runs conditions, rate limiting, checkpointing
    ├── tasks.ts              # 30 task definitions
    └── report.ts             # metrics computation, table output
```

---

## 14. Implementation Notes

**Start with `types.ts`.** Every other file depends on the interfaces defined
there. Get them right first and you avoid refactoring everything later.

**Don't touch `GeminiChat` directly.** Work through `client.ts`. The
`GeminiChat` class manages conversation history and touching it risks breaking
the history compression and loop detection systems that already exist.

**The synthetic tool approach is the right injection method.** Registering
`advisor_consultation` as a tool means Flash sees the advisor's plan as a tool
result — which is the most natural way for it to incorporate guidance. Injecting
as a system message or user message is messier and more likely to confuse
Flash's next generation.

**Log everything from day one.** Wire the `TokenLogger` into the
`ContentGenerator` layer before you do anything else. You want token data from
your very first test runs, not just the benchmark runs.

**Test each escalation detector in isolation first.** Mock a `TurnContext` with
known properties and assert the detector fires or doesn't fire as expected.
Don't test the detectors through the full integration until each one passes unit
tests alone.

**The benchmark runner must be idempotent.** If it crashes on run 200 of 450,
you need to resume from run 200, not restart. Checkpoint after every completed
task to a JSON file.
