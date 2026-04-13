# Pollux Forensic Technical Verification Report

## Metadata

- Audit date: 2026-04-13
- Repository: google-gemini/gemini-cli
- Branch audited: main
- Workspace path: c:/Users/sorou/OneDrive/Desktop/Pollux
- Primary source docs audited:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- Audit objective: Verify whether technical claims in the two Pollux documents
  are fully accurate against the current repository state.

---

## 1) Executive Verdict

The documents are **not 100% technically correct** for this fork state.

Major architecture anchors are real (client/turn/tool loop/model IDs), but
several high-impact claims are outdated, over-simplified, or internally
contradictory relative to the current codebase.

Most important correctness gaps:

1. The docs assume a mostly single-model runtime baseline, while the repo
   already has a multi-strategy model router in the default core path.
2. Settings ownership is described too narrowly (core config +
   ~/.gemini/settings.json), while actual settings schema/validation/merge logic
   lives in CLI config and supports system/user/workspace layering.
3. Stream integration is described as a turn-level pause/resume surgery, while
   real continuation behavior is distributed across core client and both CLI
   interactive and non-interactive loops.
4. The docs imply larger Pollux implementation progress than exists; current
   Pollux code is scaffold-only.

---

## 2) Scope, Method, and Confidence

## 2.1 Scope

This audit validated runtime and integration claims across:

- Core turn orchestration:
  [packages/core/src/core/client.ts](packages/core/src/core/client.ts),
  [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts)
- Stream consumers and continuation loops:
  - Interactive UI:
    [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts)
  - Non-interactive CLI:
    [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts)
- Agent session branch behavior:
  [packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx),
  [packages/core/src/agent/legacy-agent-session.ts](packages/core/src/agent/legacy-agent-session.ts),
  [packages/core/src/agent/agent-session.ts](packages/core/src/agent/agent-session.ts)
- Settings/schema ownership and storage paths:
  - [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts)
  - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts)
  - [packages/cli/src/config/config.ts](packages/cli/src/config/config.ts)
  - [packages/core/src/config/storage.ts](packages/core/src/config/storage.ts)
  - [packages/core/src/utils/paths.ts](packages/core/src/utils/paths.ts)
- Model registry/routing:
  - [packages/core/src/config/models.ts](packages/core/src/config/models.ts)
  - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts)
  - [packages/core/src/routing/routingStrategy.ts](packages/core/src/routing/routingStrategy.ts)
- Tool registration and declarations:
  - [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts)
  - [packages/core/src/config/config.ts](packages/core/src/config/config.ts)
- Loop detection and hidden model checks:
  - [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts)
- Existing token logging/recording:
  - [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts)
  - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts)
- Pollux scaffold reality:
  - [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts)
  - [packages/core/src/pollux](packages/core/src/pollux)

## 2.2 Method

1. Parsed both docs and extracted testable technical claims.
2. Mapped each claim to concrete runtime files/symbols.
3. Verified by direct code reads and targeted searches.
4. Classified each claim as:
   - Correct
   - Partially Correct
   - Incorrect
   - Not Yet Implemented (design intent only)
   - Non-Technical / Not Verifiable from repo alone

## 2.3 Confidence

- High confidence on code-path findings.
- Medium confidence on intended future design tradeoffs.
- No speculative assumptions used where direct evidence was available.

---

## 3) Repository Reality Snapshot

## 3.1 Pollux implementation status (current)

- Pollux namespace scaffold exists:
  [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L7)
- Pollux index exports nothing functional:
  [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L10)
- Benchmark directory exists but has no files:
  - [packages/core/src/pollux/benchmark](packages/core/src/pollux/benchmark)
- Search evidence indicates no active Pollux runtime integration in core/cli
  code paths yet (outside scaffold/comment/doc references).

## 3.2 Core execution path is real and active

- Turn orchestration entry exists:
  [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L593)
- Turn instances are constructed in multiple turn/retry branches:
  [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L602)
- Turn stream execution exists:
  [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L747)
- Turn event generator exists:
  [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts#L253)
- Content/Thought/ToolCallRequest/Error event surfaces exist:
  - [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts#L132)
  - [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts#L138)
  - [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts#L144)
  - [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts#L163)

## 3.3 Interactive and non-interactive continuation loops both matter

- Interactive stream path emits from Gemini client:
  [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1636)
- Interactive collects tool calls and schedules continuation:
  - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1455)
  - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526)
- Non-interactive uses same pattern:
  - [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L308)
  - [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L342)
  - [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L403)
  - [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L502)

## 3.4 Agent-session branch exists for interactive mode

- AppContainer can switch to legacy agent protocol in interactive mode:
  - [packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx#L1180)
  - [packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx#L1181)
  - [packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx#L1188)
  - [packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx#L1196)
- Config feature flag exists:
  [packages/core/src/config/config.ts](packages/core/src/config/config.ts#L3428)
- Legacy agent session still routes through GeminiClient stream:
  - [packages/core/src/agent/legacy-agent-session.ts](packages/core/src/agent/legacy-agent-session.ts#L194)

---

## 4) High-Severity Findings (Detailed)

## F-01: “Single-model baseline” assumption is outdated

- Doc claims:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L10)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L536)
- Reality:
  - Client already asks router for decision:
    [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L722)
  - Router produces decision:
    [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L723)
  - Router service is multi-strategy chain:
    - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L39)
    - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L43)
    - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L44)
    - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L47)
    - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L55)
    - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L58)
    - [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L63)
- Risk:
  - Pollux benchmark conclusions could be confounded if existing routing logic
    is not controlled in all conditions.

## F-02: Settings integration ownership is mislocated in docs

- Doc claims/settings guidance:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L95)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L143)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L481)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L67)
- Reality:
  - Canonical schema lives in CLI settings schema:
    [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts#L157)
  - Validation is in CLI settings loader:
    [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L690)
  - Load chain includes user + workspace (and system/system-default):
    - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L717)
    - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L724)
    - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L98)
    - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L111)
  - Core Config is downstream construction target:
    [packages/cli/src/config/config.ts](packages/cli/src/config/config.ts#L897)
- Risk:
  - Implementing only in core config would bypass canonical schema+validation
    paths.

## F-03: “CLI unchanged” contradicts required implementation work

- Doc contradiction:
  - CLI unchanged sketch: [POLLUX_SPEC.md](POLLUX_SPEC.md#L54)
  - Yet asks for slash command/UI indicator:
    - [POLLUX_SPEC.md](POLLUX_SPEC.md#L529)
    - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L273)
    - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L275)
    - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L276)
- Runtime reality:
  - Actual continuation control is partly CLI-side in both modes:
    - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526)
    - [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L403)
- Risk:
  - Underestimating required CLI changes creates integration blind spots.

## F-04: Stream splice model is too narrow (turn-only framing)

- Doc claims:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L94)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L505)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L186)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L188)
- Reality:
  - Turn emits events, but control continuation spans core client + UI +
    non-interactive loop.
  - Core stream:
    [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L747)
  - Interactive continuation:
    [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526)
  - Non-interactive continuation:
    [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L502)
- Risk:
  - turn.ts-only surgery misses real behavior surfaces and could regress one
    mode.

## F-05: Pollux implementation progress is represented ahead of reality

- Doc suggests full planned file tree and touched surfaces:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L98)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L590)
- Reality:
  - Only scaffold present:
    [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L7)
  - No benchmark files present in Pollux benchmark directory.
- Risk:
  - Stakeholders may overestimate implementation maturity.

---

## 5) Medium-Severity Findings

## F-06: Structured confidence tagging is design-only, not implemented

- Doc claims/design:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L231)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L256)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L139)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L140)
- Reality:
  - No pollux_confidence parser/tag handling in core/cli stream consumers
    (search evidence no matches in TS runtime files).
- Impact:
  - Current behavior cannot support structured detector claims yet.

## F-07: “Zero extra API calls / zero latency” is over-broad in benchmark context

- Doc statement: [POLLUX_SPEC.md](POLLUX_SPEC.md#L239)
- Reality:
  - Existing loop detection can trigger model calls on long conversations:
    - threshold and check:
      [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L279)
    - call site:
      [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L681)
    - double-check alias:
      [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L66)
- Impact:
  - Benchmark accounting must control for existing utility model calls.

## F-08: Synthetic tool path is valid, but docs present it too exclusively

- Doc emphasis:
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L108)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L113)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L619)
- Reality:
  - Registry supports formal tool registration:
    - [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L269)
    - [packages/core/src/config/config.ts](packages/core/src/config/config.ts#L3481)
  - UI already uses synthetic history injection patterns for client-initiated
    flows:
    - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L946)
    - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1848)
    - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1865)
    - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1876)
- Impact:
  - Stronger docs should describe both mechanisms and tradeoffs.

## F-09: “Do not touch GeminiChat directly” is too absolute

- Doc note: [POLLUX_SPEC.md](POLLUX_SPEC.md#L615)
- Reality:
  - GeminiChat contains valid extension points via hooks and modifiable
    generation config:
    - [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L578)
    - [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L620)
- Impact:
  - This guidance is directionally sensible for minimizing risk, but not
    universally true.

## F-10: Token logger guidance duplicates existing token capture capability

- Doc guidance:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L350)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L625)
- Reality:
  - Token usage already captured in stream chunks and persisted in chat
    recording service:
    - [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L917)
    - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L486)
    - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L493)
    - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L498)
- Impact:
  - Pollux logger can extend existing data instead of rebuilding from zero.

---

## 6) Correctness Matrix: POLLUX_SPEC.md

Status key:

- Correct: claim matches current code
- Partially Correct: broadly true but missing important constraints
- Incorrect: contradicted by code
- Not Yet Implemented: design claim only, no implementation yet
- Non-Technical/External: cannot verify from repo

| ID    | Claim (Doc)                                                                                                                                  | Status                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                             | Notes                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| S-001 | Gemini CLI runs every task on a single model ([POLLUX_SPEC.md](POLLUX_SPEC.md#L10))                                                          | Incorrect                    | [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L722), [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L39)                                                                                                                                                                                                                    | Router already active in turn path.                                                |
| S-002 | CLI unchanged / core modified framing ([POLLUX_SPEC.md](POLLUX_SPEC.md#L54))                                                                 | Incorrect                    | [POLLUX_SPEC.md](POLLUX_SPEC.md#L529), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L275)                                                                                                                                                                                                                                                                                                         | Same docs require CLI slash command/UI changes.                                    |
| S-003 | All Pollux code lives under pollux dir ([POLLUX_SPEC.md](POLLUX_SPEC.md#L89))                                                                | Partially Correct            | [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L7), [POLLUX_SPEC.md](POLLUX_SPEC.md#L529)                                                                                                                                                                                                                                                                                     | Runtime toggles/UI indicators imply CLI changes too.                               |
| S-004 | Wire in client.ts is key touchpoint ([POLLUX_SPEC.md](POLLUX_SPEC.md#L93))                                                                   | Correct                      | [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L593)                                                                                                                                                                                                                                                                                                                            | Good anchor for orchestration.                                                     |
| S-005 | turn.ts pause/resume is required touchpoint ([POLLUX_SPEC.md](POLLUX_SPEC.md#L94))                                                           | Partially Correct            | [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts#L253), [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526)                                                                                                                                                                                                                            | True but incomplete; continuation spans more files.                                |
| S-006 | Add PolluxConfig reader in core config only ([POLLUX_SPEC.md](POLLUX_SPEC.md#L95))                                                           | Partially Correct            | [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts#L157), [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L690)                                                                                                                                                                                                                         | Must include CLI schema/validation path.                                           |
| S-007 | settings block in ~/.gemini/settings.json ([POLLUX_SPEC.md](POLLUX_SPEC.md#L96), [POLLUX_SPEC.md](POLLUX_SPEC.md#L143))                      | Partially Correct            | [packages/core/src/config/storage.ts](packages/core/src/config/storage.ts#L69), [packages/core/src/utils/paths.ts](packages/core/src/utils/paths.ts#L13), [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L724)                                                                                                                                                            | Also supports workspace/system layers.                                             |
| S-008 | Created Pollux files listed ([POLLUX_SPEC.md](POLLUX_SPEC.md#L98))                                                                           | Incorrect                    | [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L10)                                                                                                                                                                                                                                                                                                                           | Most listed files do not exist yet.                                                |
| S-009 | Model IDs listed are valid ([POLLUX_SPEC.md](POLLUX_SPEC.md#L114))                                                                           | Correct                      | [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L54), [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L57), [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L60), [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L61), [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L62) | IDs match current registry constants.                                              |
| S-010 | Default pairing flash-preview + pro-preview ([POLLUX_SPEC.md](POLLUX_SPEC.md#L139))                                                          | Correct (as proposed config) | [POLLUX_SPEC.md](POLLUX_SPEC.md#L139), [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L57)                                                                                                                                                                                                                                                                                  | Valid pair; not current runtime default by itself.                                 |
| S-011 | Pollux settings schema sample ([POLLUX_SPEC.md](POLLUX_SPEC.md#L145))                                                                        | Not Yet Implemented          | [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts#L157)                                                                                                                                                                                                                                                                                                          | No pollux block currently in canonical schema.                                     |
| S-012 | Heuristic detector concept ([POLLUX_SPEC.md](POLLUX_SPEC.md#L191))                                                                           | Not Yet Implemented          | [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L10)                                                                                                                                                                                                                                                                                                                           | Design exists, code absent.                                                        |
| S-013 | Structured confidence tag parser in stream ([POLLUX_SPEC.md](POLLUX_SPEC.md#L231), [POLLUX_SPEC.md](POLLUX_SPEC.md#L256))                    | Not Yet Implemented          | search evidence: no pollux_confidence matches in runtime TS files                                                                                                                                                                                                                                                                                                                                    | No parser/stripper implemented yet.                                                |
| S-014 | Structured mode adds zero calls and zero latency ([POLLUX_SPEC.md](POLLUX_SPEC.md#L239))                                                     | Partially Correct            | [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L279), [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L681)                                                                                                                                                                         | Pollux detector may add zero calls, but environment may still call utility models. |
| S-015 | Hybrid detector concept ([POLLUX_SPEC.md](POLLUX_SPEC.md#L264))                                                                              | Not Yet Implemented          | [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L10)                                                                                                                                                                                                                                                                                                                           | No detector code yet.                                                              |
| S-016 | Single-shot advisor consultation and synthetic tool injection ([POLLUX_SPEC.md](POLLUX_SPEC.md#L290), [POLLUX_SPEC.md](POLLUX_SPEC.md#L344)) | Partially Correct            | [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L269), [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1865)                                                                                                                                                                                                        | Concept compatible with architecture; not implemented in Pollux.                   |
| S-017 | Token logger architecture and per-turn fields ([POLLUX_SPEC.md](POLLUX_SPEC.md#L350))                                                        | Partially Correct            | [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L917), [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L486)                                                                                                                                                                                                     | Existing token capture already present; Pollux logger can build atop this.         |
| S-018 | JSONL log path under ~/.gemini/pollux-logs ([POLLUX_SPEC.md](POLLUX_SPEC.md#L380))                                                           | Not Yet Implemented          | [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L10)                                                                                                                                                                                                                                                                                                                           | No Pollux log writer exists yet.                                                   |
| S-019 | Benchmark condition matrix A-E ([POLLUX_SPEC.md](POLLUX_SPEC.md#L386))                                                                       | Non-Technical/Design         | N/A                                                                                                                                                                                                                                                                                                                                                                                                  | Design statement; not yet code-validated.                                          |
| S-020 | 450-run statistical plan ([POLLUX_SPEC.md](POLLUX_SPEC.md#L446))                                                                             | Non-Technical/Design         | N/A                                                                                                                                                                                                                                                                                                                                                                                                  | Valid as plan; no harness implementation currently.                                |
| S-021 | Roadmap phase 1 says add pollux block in config.ts ([POLLUX_SPEC.md](POLLUX_SPEC.md#L481))                                                   | Partially Correct            | [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts#L157), [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L690)                                                                                                                                                                                                                         | Should target CLI schema+loader first; then map to core params.                    |
| S-022 | Register advisor_consultation synthetic tool ([POLLUX_SPEC.md](POLLUX_SPEC.md#L488))                                                         | Correct (approach feasible)  | [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L269)                                                                                                                                                                                                                                                                                                            | Feasible pattern.                                                                  |
| S-023 | Wire stream pause/resume in turn.ts around advisor ([POLLUX_SPEC.md](POLLUX_SPEC.md#L505))                                                   | Partially Correct            | [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L747), [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L403)                                                                                                                                                                                                                                       | Must account for full continuation loops, not just turn.ts.                        |
| S-024 | Add /pollux slash command ([POLLUX_SPEC.md](POLLUX_SPEC.md#L529))                                                                            | Not Yet Implemented          | search evidence: no pollux matches in packages/cli/src runtime TS files                                                                                                                                                                                                                                                                                                                              | Required CLI feature currently absent.                                             |
| S-025 | PRD repeats single-model problem framing ([POLLUX_SPEC.md](POLLUX_SPEC.md#L534))                                                             | Incorrect                    | [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L722), [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L39)                                                                                                                                                                                                                    | Needs rewording to account for existing router complexity.                         |
| S-026 | Risk 1 stream splice corruption ([POLLUX_SPEC.md](POLLUX_SPEC.md#L562))                                                                      | Correct                      | [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526)                                                                                                                                                                                                                                                                                                   | Real risk; should include non-interactive and agent-session branch too.            |
| S-027 | Risk 2 structured detector reliability ([POLLUX_SPEC.md](POLLUX_SPEC.md#L569))                                                               | Correct                      | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L139)                                                                                                                                                                                                                                                                                                                                                | Valid concern for prompt-following consistency.                                    |
| S-028 | Risk 3 advisor context size ([POLLUX_SPEC.md](POLLUX_SPEC.md#L575))                                                                          | Correct                      | [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L593)                                                                                                                                                                                                                                                                                                                            | History size/serialization is a legitimate risk.                                   |
| S-029 | Risk 4 benchmark rate limits ([POLLUX_SPEC.md](POLLUX_SPEC.md#L580))                                                                         | Correct                      | [POLLUX_SPEC.md](POLLUX_SPEC.md#L451)                                                                                                                                                                                                                                                                                                                                                                | Valid operational risk.                                                            |
| S-030 | Risk 5 oracle reliability ([POLLUX_SPEC.md](POLLUX_SPEC.md#L584))                                                                            | Correct                      | [POLLUX_SPEC.md](POLLUX_SPEC.md#L446)                                                                                                                                                                                                                                                                                                                                                                | Valid evaluation risk.                                                             |
| S-031 | File structure section implies implemented modules ([POLLUX_SPEC.md](POLLUX_SPEC.md#L590))                                                   | Incorrect (current state)    | [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L10)                                                                                                                                                                                                                                                                                                                           | Not implemented yet.                                                               |
| S-032 | “Don’t touch GeminiChat directly” ([POLLUX_SPEC.md](POLLUX_SPEC.md#L615))                                                                    | Partially Correct            | [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L578), [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L620)                                                                                                                                                                                                                                 | Good conservative guidance, but not absolute.                                      |
| S-033 | “Synthetic tool approach is the right injection method” ([POLLUX_SPEC.md](POLLUX_SPEC.md#L619))                                              | Partially Correct            | [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L269), [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1865)                                                                                                                                                                                                        | One strong option, but not the only viable approach.                               |
| S-034 | “Wire TokenLogger into ContentGenerator layer” ([POLLUX_SPEC.md](POLLUX_SPEC.md#L625))                                                       | Partially Correct            | [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L917)                                                                                                                                                                                                                                                                                                                    | Existing token capture should be leveraged first.                                  |
| S-035 | Benchmark runner idempotency requirement ([POLLUX_SPEC.md](POLLUX_SPEC.md#L634))                                                             | Correct                      | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L229)                                                                                                                                                                                                                                                                                                                                                | Sound requirement for long runs.                                                   |

---

## 7) Correctness Matrix: IMPLEMENTATION_PLAN.md

| ID    | Claim (Doc)                                                                                                                                                                                                       | Status                     | Evidence                                                                                                                                                                                                                                                           | Notes                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| P-001 | Scaffold creation marked complete ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L34), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L35))                                                                    | Correct                    | [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L7), [packages/core/src/pollux/benchmark](packages/core/src/pollux/benchmark)                                                                                                                | Directory scaffolding exists.                                      |
| P-002 | Types first is mandatory start ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L57))                                                                                                                             | Design Guidance            | N/A                                                                                                                                                                                                                                                                | Not a factual correctness statement.                               |
| P-003 | Settings schema integration in config.ts ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L67))                                                                                                                   | Partially Correct          | [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts#L157), [packages/cli/src/config/config.ts](packages/cli/src/config/config.ts#L897)                                                                                           | Schema belongs to CLI settings stack; core receives mapped params. |
| P-004 | Parse new block from ~/.gemini/settings.json ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L73), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L74))                                                         | Partially Correct          | [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L79), [packages/core/src/config/storage.ts](packages/core/src/config/storage.ts#L69), [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L724)                    | Also support workspace/system layers by design.                    |
| P-005 | Advisor synthetic tool method ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L87), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L113))                                                                       | Correct (feasible)         | [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L269)                                                                                                                                                                          | Reasonable implementation path.                                    |
| P-006 | Structured detector prompt injection + strip parser ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L139), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L140))                                                | Not Yet Implemented        | search evidence: no pollux_confidence runtime matches                                                                                                                                                                                                              | Pending work; no current implementation.                           |
| P-007 | Inject interceptor in processTurn ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L180))                                                                                                                         | Correct anchor             | [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L593)                                                                                                                                                                                          | Process turn is a valid integration surface.                       |
| P-008 | Stream pause/resume around advisor ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L186), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L188))                                                                 | Partially Correct          | [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L747), [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526), [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L403) | Must account for both interactive and non-interactive loops.       |
| P-009 | Integration testing emphasis ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L191))                                                                                                                              | Correct                    | [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1636)                                                                                                                                                                 | Needed due multi-surface flow.                                     |
| P-010 | Benchmark runner 450+ trials and checkpointing ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L225), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L226))                                                     | Design Guidance            | N/A                                                                                                                                                                                                                                                                | Valid benchmark plan requirement.                                  |
| P-011 | 1 req/sec and idempotency ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L229), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L230))                                                                          | Correct design requirement | N/A                                                                                                                                                                                                                                                                | Sound operational requirement.                                     |
| P-012 | Precision/Recall analytics ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L237))                                                                                                                                | Correct design requirement | N/A                                                                                                                                                                                                                                                                | Statistically valid metric inclusion.                              |
| P-013 | Full run 450 across 5 conditions ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L247), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L250))                                                                   | Design Guidance            | N/A                                                                                                                                                                                                                                                                | Work not implemented yet.                                          |
| P-014 | Slash command /pollux and advisor UI marker ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L273), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L275), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L276)) | Not Yet Implemented        | search evidence: no pollux runtime matches in packages/cli/src                                                                                                                                                                                                     | CLI feature absent currently.                                      |

---

## 8) Contradiction and Ambiguity Register

## C-01 Internal contradiction: “CLI unchanged” vs planned CLI features

- Contradicting lines:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L54)
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L529)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L275)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L276)

## C-02 Scope contradiction: “All Pollux code under core/pollux” vs runtime control surfaces

- Statements:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L89)
- Reality:
  - Interactive/non-interactive orchestration surfaces are in CLI:
    - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526)
    - [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L403)

## C-03 Config ownership ambiguity

- Statements:
  - [POLLUX_SPEC.md](POLLUX_SPEC.md#L95)
  - [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L67)
- Reality:
  - Schema and validation are CLI-owned:
    - [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts#L157)
    - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L690)

---

## 9) Subsystem-by-Subsystem Ground Truth Notes

## 9.1 Settings and path layering

- Global settings path derived from ~/.gemini/settings.json equivalent:
  - [packages/core/src/config/storage.ts](packages/core/src/config/storage.ts#L69)
  - [packages/core/src/utils/paths.ts](packages/core/src/utils/paths.ts#L13)
- Workspace settings also supported:
  - [packages/core/src/config/storage.ts](packages/core/src/config/storage.ts#L281)
  - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L665)
- System defaults/overrides supported in CLI loader:
  - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L98)
  - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L111)
  - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L103)
  - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L105)
  - [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L107)

## 9.2 Model routing and baseline control

- Router service installed in core config and returned via getter:
  - [packages/core/src/config/config.ts](packages/core/src/config/config.ts#L1378)
  - [packages/core/src/config/config.ts](packages/core/src/config/config.ts#L2712)
- Client uses router per turn:
  - [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L722)
  - [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L723)

## 9.3 Tool registry and extension pathways

- Registry supports dynamic registration and model-sensitive declarations:
  - [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L269)
  - [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L635)
  - [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L697)
- Core config constructs and populates registry with many built-in tools:
  - [packages/core/src/config/config.ts](packages/core/src/config/config.ts#L3481)
  - [packages/core/src/config/config.ts](packages/core/src/config/config.ts#L3515)
  - [packages/core/src/config/config.ts](packages/core/src/config/config.ts#L3627)

## 9.4 Existing synthetic interaction precedent

- Client-initiated tool calls and synthetic history in UI flow:
  - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L946)
  - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1848)
  - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1865)
  - [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1876)

## 9.5 Loop detection already includes advanced behavior

- Hard thresholds and utility model checks are already present:
  - [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L29)
  - [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L30)
  - [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L42)
  - [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L48)
  - [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L65)
  - [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L681)
- Client surfaces LoopDetected event:
  - [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L759)
  - [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L761)

## 9.6 Token data already captured in current runtime

- Gemini stream chunks with usageMetadata are recorded:
  - [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L916)
  - [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L917)
- Chat recording stores prompt/output/tool/total token values:
  - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L493)
  - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L494)
  - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L497)
  - [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L498)

---

## 10) Suggested Doc Corrections (Concrete)

## 10.1 Core problem statement rewrite

Current framing in [POLLUX_SPEC.md](POLLUX_SPEC.md#L10) should be replaced with:

"Gemini CLI already supports dynamic model routing, but Pollux introduces an
explicit two-role executor/advisor orchestration layer with benchmarkable
escalation policies."

## 10.2 Architecture rewrite

Replace the "CLI unchanged" implication in [POLLUX_SPEC.md](POLLUX_SPEC.md#L54)
with:

"Core orchestration is anchored in packages/core, but integration requires
compatible handling across interactive and non-interactive CLI stream loops, and
optional runtime command/UI toggles."

## 10.3 Settings ownership rewrite

Replace/augment [POLLUX_SPEC.md](POLLUX_SPEC.md#L95) and
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L67):

"Define pollux schema in packages/cli/src/config/settingsSchema.ts,
validate/merge in packages/cli/src/config/settings.ts, and map resolved settings
into core Config parameters via packages/cli/src/config/config.ts."

## 10.4 Stream integration rewrite

Replace strict turn.ts pause/resume framing in
[POLLUX_SPEC.md](POLLUX_SPEC.md#L94) and
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#L186) with:

"Implement advisor escalation at core turn orchestration boundaries, then
validate continuation ordering in both
packages/cli/src/ui/hooks/useGeminiStream.ts and
packages/cli/src/nonInteractiveCli.ts."

## 10.5 Token logger rewrite

Update [POLLUX_SPEC.md](POLLUX_SPEC.md#L625):

"Reuse existing usageMetadata capture in GeminiChat and ChatRecordingService;
add Pollux-specific attribution fields (advisor vs executor and escalation
reason) rather than rebuilding token accounting from scratch."

---

## 11) Safe Implementation Sequence for This Fork

1. Add pollux schema + settings type in CLI settings schema/loader.
2. Thread resolved pollux settings into core Config parameters.
3. Implement Pollux types/models/detectors/advisor/logger modules under pollux
   scaffold.
4. Integrate orchestration in core client turn flow behind feature flag.
5. Add stream-safe continuation handling tests for:
   - interactive UI loop
   - non-interactive loop
   - legacy agent-session interactive branch
6. Add benchmark harness that controls model router and loop-detection side
   effects.
7. Add optional /pollux runtime command and minimal UI marker after core
   behavior is stable.

---

## 12) Validation Checklist (Post-Implementation)

- Pollux disabled produces identical behavior to baseline across
  interactive/non-interactive.
- Pollux enabled does not reorder stream events in UI hook.
- Non-interactive continuation remains stable with advisor escalations.
- Agent-session interactive mode behavior remains stable when feature flag is
  on/off.
- settings precedence works across system/user/workspace files.
- No unintentional interaction with existing router policies in benchmark A/E
  conditions.
- Token logs include executor/advisor split and total reconciliation.
- Loop detection side effects are explicitly controlled during benchmark runs.

---

## 13) Appendix A: Key Evidence Reference Index

Core runtime:

- [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L593)
- [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L722)
- [packages/core/src/core/client.ts](packages/core/src/core/client.ts#L747)
- [packages/core/src/core/turn.ts](packages/core/src/core/turn.ts#L253)

CLI stream loops:

- [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1455)
- [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1526)
- [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L342)
- [packages/cli/src/nonInteractiveCli.ts](packages/cli/src/nonInteractiveCli.ts#L403)

Agent-session path:

- [packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx#L1180)
- [packages/cli/src/ui/AppContainer.tsx](packages/cli/src/ui/AppContainer.tsx#L1196)
- [packages/core/src/agent/legacy-agent-session.ts](packages/core/src/agent/legacy-agent-session.ts#L194)

Settings and schema:

- [packages/cli/src/config/settingsSchema.ts](packages/cli/src/config/settingsSchema.ts#L157)
- [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L690)
- [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L717)
- [packages/cli/src/config/settings.ts](packages/cli/src/config/settings.ts#L724)
- [packages/core/src/config/storage.ts](packages/core/src/config/storage.ts#L69)
- [packages/core/src/config/storage.ts](packages/core/src/config/storage.ts#L281)

Model routing and IDs:

- [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L39)
- [packages/core/src/routing/modelRouterService.ts](packages/core/src/routing/modelRouterService.ts#L63)
- [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L54)
- [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L57)
- [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L60)
- [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L61)
- [packages/core/src/config/models.ts](packages/core/src/config/models.ts#L62)

Tools and injection:

- [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L269)
- [packages/core/src/tools/tool-registry.ts](packages/core/src/tools/tool-registry.ts#L635)
- [packages/cli/src/ui/hooks/useGeminiStream.ts](packages/cli/src/ui/hooks/useGeminiStream.ts#L1865)

Loop detection and token logging:

- [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L279)
- [packages/core/src/services/loopDetectionService.ts](packages/core/src/services/loopDetectionService.ts#L681)
- [packages/core/src/core/geminiChat.ts](packages/core/src/core/geminiChat.ts#L917)
- [packages/core/src/services/chatRecordingService.ts](packages/core/src/services/chatRecordingService.ts#L486)

Pollux scaffold state:

- [packages/core/src/pollux/index.ts](packages/core/src/pollux/index.ts#L10)
- [packages/core/src/pollux/benchmark](packages/core/src/pollux/benchmark)

---

## 14) Appendix B: Limits of This Audit

- This report validates repository-traceable technical claims, not external
  historical claims (for example external product launch dates).
- No runtime execution benchmarks were performed in this pass; this is a static
  architecture and source-of-truth alignment audit.
- No code edits were made to implementation modules in this audit, except
  creation of this documentation artifact.

---

## 15) Final Summary

The Pollux concept is still strongly viable in this fork, but the docs should be
updated before implementation begins in earnest.

Most crucial adjustments:

1. Reframe baseline relative to existing model router.
2. Move settings integration instructions to canonical CLI schema/loader
   ownership.
3. Treat stream integration as a multi-surface concern (core + interactive +
   non-interactive + agent-session branch), not turn.ts alone.
4. Mark current Pollux implementation status explicitly as scaffold-only.

This document is intended as the full context handoff file so future
implementation work can start with accurate architecture assumptions and fewer
integration regressions.
