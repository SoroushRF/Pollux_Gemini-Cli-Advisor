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

| #   | Pri | Compartment                                       | Guideline                                            | Status      | Owner          | Started    | Finished   | Report                                                             | Sidecar                                                              | Open Qs | Notes                                                                                                                                                                                                                                                                                             |
| --- | --- | ------------------------------------------------- | ---------------------------------------------------- | ----------- | -------------- | ---------- | ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 02  | T1  | Core Turn Engine                                  | `02-core-turn-engine.md`                             | done        | composer-agent | 2026-04-16 | 2026-04-16 | `reports/02-core-turn-engine/report.md`                            | `reports/02-core-turn-engine/report.json`                            | 6       | Gold-standard reference; 13 verified truths, 8 contradictions vs `POLLUX_SPEC.md`, 6 risks. Handoff from 01: ACP and agent-session drivers bypass `Turn`/`GeminiClient.sendMessageStream`, which breaks the "single interceptor between GeminiClient and Turn" assumption — revisit in synthesis. |
| 07  | T1  | Routing, Availability, Loop, Pollux               | `07-routing-availability-loop-and-pollux.md`         | done        | composer-agent | 2026-04-16 | 2026-04-16 | `reports/07-routing-availability-loop-and-pollux/report.md`        | `reports/07-routing-availability-loop-and-pollux/report.json`        | 6       | 13 verified truths, 7 contradictions, 6 risks. Pollux confirmed as scaffold-only stub. Benchmark fairness controls published.                                                                                                                                                                     |
| 06  | T1  | Settings Schema and Config Plumbing               | `06-settings-schema-and-config-plumbing.md`          | done        | composer-agent | 2026-04-16 | 2026-04-16 | `reports/06-settings-schema-and-config-plumbing/report.md`         | `reports/06-settings-schema-and-config-plumbing/report.json`         | 6       | 15 verified truths, 6 contradictions, 6 risks. CLI owns schema; core is pure consumer. No pollux block present.                                                                                                                                                                                   |
| 01  | T1  | CLI Runtime Surface                               | `01-cli-runtime-surface.md`                          | done        | composer-agent | 2026-04-16 | 2026-04-16 | `reports/01-cli-runtime-surface/report.md`                         | `reports/01-cli-runtime-surface/report.json`                         | 6       | 13 verified truths, 5 contradictions, 6 risks. Four distinct turn drivers (ACP, interactive legacy/agent-session, non-interactive legacy/agent-session); no `/pollux` surface exists yet.                                                                                                         |
| 04  | T1  | Tools and MCP Platform                            | `04-tools-and-mcp-platform.md`                       | done        | composer-agent | 2026-04-16 | 2026-04-16 | `reports/04-tools-and-mcp-platform/report.md`                      | `reports/04-tools-and-mcp-platform/report.json`                      | 6       | 15 verified truths, 7 contradictions, 8 risks. Static per-process MCP allowlist parallels persistent policy engine (escalate to 09); AUTO_EDIT fast-path is narrower than ApprovalMode docs imply (only EditTool/WriteFileTool set respectsAutoEdit=true).                                        |
| 03  | T2  | Agent Runtime and Modes                           | `03-agent-runtime-and-modes.md`                      | done        | gemini-3.1-pro | 2026-04-16 | 2026-04-16 | `reports/03-agent-runtime-and-modes/report.md`                     | `reports/03-agent-runtime-and-modes/report.json`                     | 1       |                                                                                                                                                                                                                                                                                                   |
| 08  | T2  | Context, Memory, and Compression                  | `08-context-memory-and-compression.md`               | done        | composer-agent | 2026-04-16 | 2026-04-16 | `reports/08-context-memory-and-compression/report.md`              | `reports/08-context-memory-and-compression/report.json`              | 1       | Escalate OQ-08.1 to compartment 14.                                                                                                                                                                                                                                                               |
| 11  | T2  | Telemetry, Observability, and Billing Signals     | `11-telemetry-observability-and-billing-signals.md`  | done        | gemini-3.1-pro | 2026-04-16 | 2026-04-16 | `reports/11-telemetry-observability-and-billing-signals/report.md` | `reports/11-telemetry-observability-and-billing-signals/report.json` | 1       | Escalate OQ-11.1 to compartment 14.                                                                                                                                                                                                                                                               |
| 14  | T2  | Testing and Evaluation Architecture               | `14-testing-and-evaluation-architecture.md`          | done        | gemini-3.1-pro | 2026-04-16 | 2026-04-16 | `reports/14-testing-and-evaluation-architecture/report.md`         | `reports/14-testing-and-evaluation-architecture/report.json`         | 1       | Escalate OQ-14.1 to compartment 12.                                                                                                                                                                                                                                                               |
| 12  | T3  | Output Protocol and ACP Adapters                  | `12-output-protocol-and-acp-adapters.md`             | not_started |                |            |            |                                                                    |                                                                      |         |                                                                                                                                                                                                                                                                                                   |
| 05  | T3  | Extensibility: Skills, Hooks, Commands            | `05-extensibility-skills-hooks-commands.md`          | not_started |                |            |            |                                                                    |                                                                      |         | Handoff from 01: non-interactive `handleSlashCommand` omits `SkillCommandLoader` (`nonInteractiveCliCommands.ts:43-50`) while interactive includes it (`slashCommandProcessor.ts:326-334`) — confirm intentional vs regression.                                                                   |
| 09  | T3  | Policy, Trust, and Safety Engine                  | `09-policy-trust-and-safety-engine.md`               | not_started |                |            |            |                                                                    |                                                                      |         |                                                                                                                                                                                                                                                                                                   |
| 16  | T3  | Docs, Specs, and Governance                       | `16-docs-specs-and-governance.md`                    | not_started |                |            |            |                                                                    |                                                                      |         |                                                                                                                                                                                                                                                                                                   |
| 15  | T4  | Build, Packaging, Release, and CI                 | `15-build-packaging-release-and-ci.md`               | not_started |                |            |            |                                                                    |                                                                      |         |                                                                                                                                                                                                                                                                                                   |
| 10  | T4  | Sandbox, Shell, and Filesystem Substrate          | `10-sandbox-shell-and-filesystem-substrate.md`       | not_started |                |            |            |                                                                    |                                                                      |         |                                                                                                                                                                                                                                                                                                   |
| 13  | T4  | Integration Products: SDK, VS Code, A2A, DevTools | `13-integration-products-sdk-vscode-a2a-devtools.md` | not_started |                |            |            |                                                                    |                                                                      |         |                                                                                                                                                                                                                                                                                                   |

---

## Cross-Compartment Synthesis

Produced after >= 12 of 16 compartments are `done`.

| Artifact          | Path                            | Status      | Owner          | Finished   |
| ----------------- | ------------------------------- | ----------- | -------------- | ---------- |
| Tier-1 summary    | `reports/TIER1_SUMMARY.md`      | done        | composer-agent | 2026-04-16 |
| Synthesis report  | `reports/SYNTHESIS/report.md`   | not_started |                |            |
| Synthesis sidecar | `reports/SYNTHESIS/report.json` | not_started |                |            |

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
