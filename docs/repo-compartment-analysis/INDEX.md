# Compartment Analysis Status Index

Single source of truth for compartment claim state. Agents must update this file
when starting and finishing a compartment. See `AGENT_RUNBOOK.md`.

**Analysis order:** no strict order is required, but for Pollux the recommended
order is in `POLLUX_PRIORITY.md` (four tiers). The `Priority` column below
reflects that tier.

Status values:

- `not_started` — no agent has claimed this compartment
- `in_progress` — an agent is currently analyzing
- `blocked` — analysis paused pending another compartment or clarification
- `done` — report + sidecar exist and pass the Definition of Done
- `stale` — previous report exists but needs refresh (e.g., after upstream
  merge)

---

## Compartment Status

Priority legend (from `POLLUX_PRIORITY.md`):

- **T1** — Critical path (start here) · `report-template.md` · 400–900 md lines
  · 5–15 code quotes
- **T2** — High leverage · `report-template-lite.md` · 250–400 md lines · 0–2
  code quotes
- **T3** — Supporting · `report-template-lite.md` · 200–300 md lines · 0 code
  quotes
- **T4** — Peripheral / optional · `report-template-lite.md` · 150–250 md lines
  · 0 code quotes

Tier governs both execution order **and** report depth. JSON sidecars are
mandatory at every tier. See `AGENT_RUNBOOK.md` §2 and `POLLUX_PRIORITY.md` →
"Tier also governs analysis depth" for the full contract.

| #   | Pri | Compartment                                       | Guideline                                            | Status | Owner          | Started    | Finished   | Report                                                              | Sidecar                                                               | Open Qs | Notes                                                                                                                                                                                                                                                                                                |
| --- | --- | ------------------------------------------------- | ---------------------------------------------------- | ------ | -------------- | ---------- | ---------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02  | T1  | Core Turn Engine                                  | `02-core-turn-engine.md`                             | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/02-core-turn-engine/report.md`                             | `reports/02-core-turn-engine/report.json`                             | 6       | Gold-standard reference; 13 verified truths, 8 contradictions vs `POLLUX_SPEC.md`, 6 risks. Handoff from 01: ACP and agent-session drivers bypass `Turn`/`GeminiClient.sendMessageStream`, which breaks the "single interceptor between GeminiClient and Turn" assumption — revisit in synthesis.    |
| 07  | T1  | Routing, Availability, Loop, Pollux               | `07-routing-availability-loop-and-pollux.md`         | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/07-routing-availability-loop-and-pollux/report.md`         | `reports/07-routing-availability-loop-and-pollux/report.json`         | 6       | 13 verified truths, 7 contradictions, 6 risks. Pollux confirmed as scaffold-only stub. Benchmark fairness controls published.                                                                                                                                                                        |
| 06  | T1  | Settings Schema and Config Plumbing               | `06-settings-schema-and-config-plumbing.md`          | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/06-settings-schema-and-config-plumbing/report.md`          | `reports/06-settings-schema-and-config-plumbing/report.json`          | 6       | 15 verified truths, 6 contradictions, 6 risks. CLI owns schema; core is pure consumer. No pollux block present.                                                                                                                                                                                      |
| 01  | T1  | CLI Runtime Surface                               | `01-cli-runtime-surface.md`                          | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/01-cli-runtime-surface/report.md`                          | `reports/01-cli-runtime-surface/report.json`                          | 6       | 13 verified truths, 5 contradictions, 6 risks. Four distinct turn drivers (ACP, interactive legacy/agent-session, non-interactive legacy/agent-session); no `/pollux` surface exists yet.                                                                                                            |
| 04  | T1  | Tools and MCP Platform                            | `04-tools-and-mcp-platform.md`                       | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/04-tools-and-mcp-platform/report.md`                       | `reports/04-tools-and-mcp-platform/report.json`                       | 6       | 15 verified truths, 7 contradictions, 8 risks. Static per-process MCP allowlist parallels persistent policy engine (escalate to 09); AUTO_EDIT fast-path is narrower than ApprovalMode docs imply (only EditTool/WriteFileTool set respectsAutoEdit=true).                                           |
| 03  | T2  | Agent Runtime and Modes                           | `03-agent-runtime-and-modes.md`                      | done   | gemini-3.1-pro | 2026-04-16 | 2026-04-16 | `reports/03-agent-runtime-and-modes/report.md`                      | `reports/03-agent-runtime-and-modes/report.json`                      | 2       | 7 verified truths, 1 contradiction, 4 risks. Mode matrix with 4 turn drivers added (ACP bypasses entirely, handed off to 01). Escalate OQ-03.1 + OQ-03.2 + C-03.1 to compartment 02.                                                                                                                 |
| 08  | T2  | Context, Memory, and Compression                  | `08-context-memory-and-compression.md`               | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/08-context-memory-and-compression/report.md`               | `reports/08-context-memory-and-compression/report.json`               | 1       | 9 verified truths, 1 contradiction (F-09: `ChatCompressionService.compress(chat: GeminiChat,...)` is a precedent for direct GeminiChat access), 5 risks. `SessionSummaryService` now covered. Escalate OQ-08.1 to 14; C-08.1 + R-08.5 to 02.                                                         |
| 11  | T2  | Telemetry, Observability, and Billing Signals     | `11-telemetry-observability-and-billing-signals.md`  | done   | gemini-3.1-pro | 2026-04-16 | 2026-04-16 | `reports/11-telemetry-observability-and-billing-signals/report.md`  | `reports/11-telemetry-observability-and-billing-signals/report.json`  | 2       | 8 verified truths, 1 contradiction (F-10: Pollux TurnLog duplicates `chatRecordingService.recordMessageTokens` via `geminiChat.ts:915-921`), 3 risks. Prior false "activity-detector missing" contradiction removed. Escalate OQ-11.1 to 14; OQ-11.2 to 02; C-11.1 to 16.                            |
| 14  | T2  | Testing and Evaluation Architecture               | `14-testing-and-evaluation-architecture.md`          | done   | gemini-3.1-pro | 2026-04-16 | 2026-04-16 | `reports/14-testing-and-evaluation-architecture/report.md`          | `reports/14-testing-and-evaluation-architecture/report.json`          | 2       | 8 verified truths, 1 contradiction (F-07: "zero extra API calls" over-broad; classifier + loop-detector emit extra LLM calls uncontrolled by any harness), 3 risks. `TestRig` in `packages/test-utils` is real orchestrator. Escalate OQ-14.1 to 12; OQ-14.2 + R-14.3 to 07; C-14.1 to 16.           |
| 12  | T3  | Output Protocol and ACP Adapters                  | `12-output-protocol-and-acp-adapters.md`             | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/12-output-protocol-and-acp-adapters/report.md`             | `reports/12-output-protocol-and-acp-adapters/report.json`             | 2       | 6 verified truths, 2 contradictions, 4 risks. Two non-interactive drivers (legacy + agent-session) emit same JSONL contract from different upstream event unions; ACP uses a separate command registry. No `JsonStreamEventType` for advisor/escalation today.                                       |
| 05  | T3  | Extensibility: Skills, Hooks, Commands            | `05-extensibility-skills-hooks-commands.md`          | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/05-extensibility-skills-hooks-commands/report.md`          | `reports/05-extensibility-skills-hooks-commands/report.json`          | 2       | 6 verified truths, 2 contradictions, 4 risks. Confirmed: non-interactive `handleSlashCommand` omits `SkillCommandLoader` (`nonInteractiveCliCommands.ts:43-48`); intent unverified. No `pollux` identifier in `packages/cli/src` yet.                                                                |
| 09  | T3  | Policy, Trust, and Safety Engine                  | `09-policy-trust-and-safety-engine.md`               | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/09-policy-trust-and-safety-engine/report.md`               | `reports/09-policy-trust-and-safety-engine/report.json`               | 2       | 6 verified truths, 2 contradictions, 4 risks. Engine consumer is `scheduler/scheduler.ts` + `confirmation-bus/message-bus.ts` (not the cited `coreToolScheduler.ts`). Synthetic tools have no engine exemption — `advisor_consultation` would default-deny in non-interactive without an ALLOW rule. |
| 16  | T3  | Docs, Specs, and Governance                       | `16-docs-specs-and-governance.md`                    | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/16-docs-specs-and-governance/report.md`                    | `reports/16-docs-specs-and-governance/report.json`                    | 2       | 6 verified truths, 3 contradictions, 4 risks. F-01..F-10 mapped to compartments; `POLLUX_*.md` not covered by `CODEOWNERS`; broken README asset reference; F-05/F-06 not placed in priority table.                                                                                                   |
| 15  | T4  | Build, Packaging, Release, and CI                 | `15-build-packaging-release-and-ci.md`               | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/15-build-packaging-release-and-ci/report.md`               | `reports/15-build-packaging-release-and-ci/report.json`               | 2       | 5 verified truths, 2 contradictions, 4 risks. `npm run build` does not produce distributables (bundle chain is separate); SEA binary build is workflow_dispatch-only (C-15.1). Escalate OQ-15.1 (spec version header) and OQ-15.2 (Pollux-gated binary build) to synthesis.                          |
| 10  | T4  | Sandbox, Shell, and Filesystem Substrate          | `10-sandbox-shell-and-filesystem-substrate.md`       | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/10-sandbox-shell-and-filesystem-substrate/report.md`       | `reports/10-sandbox-shell-and-filesystem-substrate/report.json`       | 2       | 5 verified truths, 2 contradictions (both resolved), 3 risks. Zero `pollux` refs in services/ or sandbox/ — confirms T4 peripheral status. `ShellExecutionService` is an all-static process singleton; background history is session-keyed (R-10.1). Escalate OQ-10.1 to 04; OQ-10.2 to 14.          |
| 13  | T4  | Integration Products: SDK, VS Code, A2A, DevTools | `13-integration-products-sdk-vscode-a2a-devtools.md` | done   | composer-agent | 2026-04-16 | 2026-04-16 | `reports/13-integration-products-sdk-vscode-a2a-devtools/report.md` | `reports/13-integration-products-sdk-vscode-a2a-devtools/report.json` | 2       | 5 verified truths, 2 contradictions, 4 risks. A2A's `CoderAgentExecutor` bypasses `Turn`/`GeminiClient.sendMessageStream` — Pollux at GeminiClient level silently skips A2A (R-13.2, high). VS Code companion deep-imports core `src/ide/*` (C-13.2). Escalate OQ-13.1 to synthesis; OQ-13.2 to 05.  |

---

## Cross-Compartment Synthesis

Produced after >= 12 of 16 compartments are `done`.

| Artifact          | Path                            | Status | Owner          | Finished   |
| ----------------- | ------------------------------- | ------ | -------------- | ---------- |
| Tier-1 summary    | `reports/TIER1_SUMMARY.md`      | done   | composer-agent | 2026-04-16 |
| Tier-2 summary    | `reports/TIER2_SUMMARY.md`      | done   | composer-agent | 2026-04-16 |
| Tier-3 summary    | `reports/TIER3_SUMMARY.md`      | done   | composer-agent | 2026-04-16 |
| Tier-4 summary    | `reports/TIER4_SUMMARY.md`      | done   | composer-agent | 2026-04-16 |
| Synthesis report  | `reports/SYNTHESIS/report.md`   | done   | composer-agent | 2026-04-16 |
| Synthesis sidecar | `reports/SYNTHESIS/report.json` | done   | composer-agent | 2026-04-16 |

Synthesis recipe: `_TEMPLATES/cross-compartment-synthesis.md`.

---

## Update Rules

- Claim: set `Status=in_progress`, fill `Owner` and `Started`.
- Release: set `Status=done`, fill `Finished`, `Report`, `Sidecar`, and
  `Open Qs` count.
- Block: set `Status=blocked` and name the blocking compartment in `Notes`.
- Refresh: set `Status=stale` if upstream merge invalidates a past report.
- Takeover: if an `in_progress` row is > 24h idle, another agent may re-claim;
  record takeover in `Notes`.

Never delete rows. Compartment numbers 01–16 are stable and referenced from
every guideline file. Rows above are **sorted by Pollux priority tier**, not by
compartment number — this is intentional so the critical path is visible at the
top. Do not re-sort.
