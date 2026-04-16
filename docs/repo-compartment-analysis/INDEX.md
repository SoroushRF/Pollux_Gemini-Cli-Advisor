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

- **T1** — Critical path (start here)
- **T2** — High leverage
- **T3** — Supporting
- **T4** — Peripheral / optional

| #   | Pri | Compartment                                       | Guideline                                            | Status      | Owner          | Started    | Finished   | Report                                  | Sidecar                                   | Open Qs | Notes                                                                                      |
| --- | --- | ------------------------------------------------- | ---------------------------------------------------- | ----------- | -------------- | ---------- | ---------- | --------------------------------------- | ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 02  | T1  | Core Turn Engine                                  | `02-core-turn-engine.md`                             | done        | composer-agent | 2026-04-16 | 2026-04-16 | `reports/02-core-turn-engine.report.md` | `reports/02-core-turn-engine.report.json` | 6       | Gold-standard reference; 13 verified truths, 8 contradictions vs `POLLUX_SPEC.md`, 6 risks |
| 07  | T1  | Routing, Availability, Loop, Pollux               | `07-routing-availability-loop-and-pollux.md`         | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 06  | T1  | Settings Schema and Config Plumbing               | `06-settings-schema-and-config-plumbing.md`          | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 01  | T1  | CLI Runtime Surface                               | `01-cli-runtime-surface.md`                          | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 04  | T1  | Tools and MCP Platform                            | `04-tools-and-mcp-platform.md`                       | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 03  | T2  | Agent Runtime and Modes                           | `03-agent-runtime-and-modes.md`                      | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 08  | T2  | Context, Memory, and Compression                  | `08-context-memory-and-compression.md`               | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 11  | T2  | Telemetry, Observability, and Billing Signals     | `11-telemetry-observability-and-billing-signals.md`  | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 14  | T2  | Testing and Evaluation Architecture               | `14-testing-and-evaluation-architecture.md`          | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 12  | T3  | Output Protocol and ACP Adapters                  | `12-output-protocol-and-acp-adapters.md`             | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 05  | T3  | Extensibility: Skills, Hooks, Commands            | `05-extensibility-skills-hooks-commands.md`          | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 09  | T3  | Policy, Trust, and Safety Engine                  | `09-policy-trust-and-safety-engine.md`               | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 16  | T3  | Docs, Specs, and Governance                       | `16-docs-specs-and-governance.md`                    | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 15  | T4  | Build, Packaging, Release, and CI                 | `15-build-packaging-release-and-ci.md`               | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 10  | T4  | Sandbox, Shell, and Filesystem Substrate          | `10-sandbox-shell-and-filesystem-substrate.md`       | not_started |                |            |            |                                         |                                           |         |                                                                                            |
| 13  | T4  | Integration Products: SDK, VS Code, A2A, DevTools | `13-integration-products-sdk-vscode-a2a-devtools.md` | not_started |                |            |            |                                         |                                           |         |                                                                                            |

---

## Cross-Compartment Synthesis

Produced after >= 12 of 16 compartments are `done`.

| Artifact          | Path                            | Status      | Owner | Finished |
| ----------------- | ------------------------------- | ----------- | ----- | -------- |
| Synthesis report  | `reports/SYNTHESIS.report.md`   | not_started |       |          |
| Synthesis sidecar | `reports/SYNTHESIS.report.json` | not_started |       |          |

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
