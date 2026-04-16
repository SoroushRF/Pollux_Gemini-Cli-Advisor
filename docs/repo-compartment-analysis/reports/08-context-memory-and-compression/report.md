# Compartment Report (Lite): 08 — Context, Memory, and Compression

## Metadata

- **Compartment**: 08 — Context, Memory, and Compression
- **Tier**: T2
- **Guideline file**: `08-context-memory-and-compression.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: N/A
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                     | Exists? | Notes (only if material) |
| -------------------------------------------------------- | ------- | ------------------------ |
| `packages/core/src/context`                              | yes     |                          |
| `packages/core/src/context/contextCompressionService.ts` | yes     |                          |
| `packages/core/src/context/chatCompressionService.ts`    | yes     |                          |
| `packages/core/src/context/toolDistillationService.ts`   | yes     |                          |
| `packages/core/src/context/toolOutputMaskingService.ts`  | yes     |                          |
| `packages/core/src/context/truncation.ts`                | yes     |                          |
| `packages/core/src/services/sessionSummaryService.ts`    | yes     |                          |
| `packages/core/src/services/memoryService.ts`            | yes     |                          |
| `packages/core/src/tools/memoryTool.ts`                  | yes     |                          |

## 1. Scope and Boundary

In scope: context compression and chat compression, tool output distillation and
masking, truncation policies and profiles, memory services and memory tool
integration, and session summary behavior.

Out of scope (handed off): policy persistence rules, telemetry exporter
internals, full CLI presentation logic.

## 2. Runtime Flow Summary

### Chat Compression Flow

1. Entry: `packages/core/src/context/chatCompressionService.ts:238-246` receives
   a request to compress chat history.
2. Pre-compress Hook:
   `packages/core/src/context/chatCompressionService.ts:263-264` fires
   `PreCompressTrigger`.
3. Truncation: `packages/core/src/context/chatCompressionService.ts:287-290`
   applies a "Reverse Token Budget" (50k tokens) to truncate older large tool
   responses.
4. Split: `packages/core/src/context/chatCompressionService.ts:321-324` splits
   history, keeping the most recent 30%.
5. Summarization: `packages/core/src/context/chatCompressionService.ts:359-377`
   generates a `<state_snapshot>` using an LLM.
6. Verification: `packages/core/src/context/chatCompressionService.ts:382-405`
   performs a "Probe" verification to ensure no critical information was lost.

### Tool Output Masking Flow

1. Entry: `packages/core/src/context/toolOutputMaskingService.ts:70-73` receives
   history for masking.
2. Scan: `packages/core/src/context/toolOutputMaskingService.ts:99-150` scans
   backwards, protecting the newest 50k tokens and the latest turn.
3. Prune: `packages/core/src/context/toolOutputMaskingService.ts:176-245`
   replaces older tool outputs with `<tool_output_masked>` tags and saves full
   output to disk.

### Memory Extraction Flow

1. Entry: `packages/core/src/services/memoryService.ts:504-510` starts the
   background memory service.
2. Scan: `packages/core/src/services/memoryService.ts:289-326` finds sessions
   idle for >3 hours with >10 user messages.
3. Extract: `packages/core/src/services/memoryService.ts:589-612` runs
   `SkillExtractionAgent` to extract skills into `SKILL.md` files.

## 3. Key Files and Citations

| Path                                                     | Role               | Notes                                                                  |
| -------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `packages/core/src/context/agentHistoryProvider.ts`      | primary entrypoint | Enforces message size limits and handles history truncation.           |
| `packages/core/src/context/chatCompressionService.ts`    | state owner        | Implements token-limit compression and summarization.                  |
| `packages/core/src/context/contextCompressionService.ts` | state owner        | Compresses file reads via LLM routing (FULL/PARTIAL/SUMMARY/EXCLUDED). |
| `packages/core/src/context/toolDistillationService.ts`   | state owner        | Distills oversized tool outputs structurally.                          |
| `packages/core/src/context/toolOutputMaskingService.ts`  | state owner        | Masks bulky tool outputs using Hybrid Backward Scanned FIFO.           |
| `packages/core/src/services/memoryService.ts`            | state owner        | Background skill extraction from idle sessions.                        |
| `packages/core/src/context/memoryContextManager.ts`      | state owner        | Loads and caches GEMINI.md memory files.                               |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-08.1** — `ChatCompressionService` uses a "Reverse Token Budget" of 50,000
  tokens for function responses, truncating older large tool responses to 30
  lines.
  - Primary: `packages/core/src/context/chatCompressionService.ts:135-235`
  - Confidence: high
- **VT-08.2** — `ChatCompressionService` performs a "Probe" verification step
  after generating a summary to ensure no critical constraints or details were
  lost.
  - Primary: `packages/core/src/context/chatCompressionService.ts:382-405`
  - Confidence: high
- **VT-08.3** — `ContextCompressionService` batches file read outputs to an LLM
  to decide routing levels (FULL, PARTIAL, SUMMARY, EXCLUDED) and caches
  decisions.
  - Primary: `packages/core/src/context/contextCompressionService.ts:224-232`
  - Confidence: high
- **VT-08.4** — `ToolOutputMaskingService` protects the newest 50,000 tool
  tokens and optionally the entire latest turn from being masked.
  - Primary: `packages/core/src/context/toolOutputMaskingService.ts:94-138`
  - Confidence: high
- **VT-08.5** — `ToolOutputDistillationService` exempts `read_file` and
  `read_many_files` from distillation.
  - Primary: `packages/core/src/context/toolDistillationService.ts:83-87`
  - Confidence: high
- **VT-08.6** — `MemoryService` runs a background `SkillExtractionAgent` on
  sessions that have been idle for at least 3 hours and have at least 10 user
  messages.
  - Primary: `packages/core/src/services/memoryService.ts:268-283`
  - Confidence: high
- **VT-08.7** — `MemoryContextManager` performs Just-In-Time (JIT) memory
  discovery by traversing upwards from an accessed path to find `GEMINI.md`
  files.
  - Primary: `packages/core/src/context/memoryContextManager.ts:141-172`
  - Confidence: high

**Contradictions or ambiguities**

- None found.

## 5. Risks and Open Questions

**Risks**

- **R-08.1** — Over-truncation. `AgentHistoryProvider` might break
  `functionCall`/`functionResponse` pairs if the truncation boundary falls
  between them. Severity: medium. Mitigating test:
  `packages/core/src/context/agentHistoryProvider.test.ts`. Suggested guard:
  Ensure `adjustBoundaryForIntegrity` handles all edge cases.
- **R-08.2** — Stale summaries. `ChatCompressionService` might lose critical
  constraints in summaries if the "Probe" verification fails to catch omissions.
  Severity: high. Mitigating test:
  `packages/core/src/context/chatCompressionService.test.ts`. Suggested guard:
  Monitor compression failure rates.
- **R-08.3** — Lost tool evidence. `ToolOutputMaskingService` masks older tool
  outputs, which might remove necessary context for long-running tasks.
  Severity: medium. Mitigating test:
  `packages/core/src/context/toolOutputMaskingService.test.ts`. Suggested guard:
  Ensure users can easily retrieve masked outputs.
- **R-08.4** — Memory drift. `MemoryService` background skill extraction might
  duplicate existing skills or extract low-quality skills. Severity: medium.
  Mitigating test: `packages/core/src/services/memoryService.test.ts`. Suggested
  guard: Refine `SkillExtractionAgent` prompts and rely on
  `buildExistingSkillsSummary`.

**Open questions**

- [ ] **OQ-08.1** — How does the context compression routing model
      (`chat-compression-2.5-flash-lite`) handle extremely large files that
      exceed its own context window? Escalate to compartment 14.

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/context/chatCompressionService.test.ts` (Validates
    token-limit compression and summarization)
  - `packages/core/src/context/contextCompressionService.test.ts` (Validates
    file read compression routing)
  - `packages/core/src/context/toolDistillationService.test.ts` (Validates
    structural truncation of oversized outputs)
  - `packages/core/src/context/toolOutputMaskingService.test.ts` (Validates
    masking of bulky tool outputs)
  - `packages/core/src/services/memoryService.test.ts` (Validates background
    skill extraction)
  - `packages/core/src/tools/memoryTool.test.ts` (Validates explicit memory
    saving)

- **Observability signals**:
  - `ChatCompressionEvent` (Logs token counts before/after chat compression)
  - `ToolOutputTruncatedEvent` (Logs when a tool output is distilled/truncated)
  - `ToolOutputMaskingEvent` (Logs tokens saved by masking tool outputs)
  - `CoreEvent.MemoryChanged` (Fired when memory files are reloaded)

- **Coverage gaps**:
  - `OQ-08.1` (Handling of extremely large files in context compression routing)

## 7. Definition of Done

- [x] Context construction pipeline is fully mapped.
- [x] Compression/truncation/masking logic is documented distinctly.
- [x] Memory lifecycle and scope semantics are evidence-backed.
- [x] Quality-risk matrix is published.
- [x] Tuning and validation guidance is actionable.
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row 08 flipped to `done`.

## 8. Handoffs

- **Depends on**: 02, 04
- **Affects**: 11, 14
- **Escalated to**: 14 — Verify large file handling in context compression
  routing.
