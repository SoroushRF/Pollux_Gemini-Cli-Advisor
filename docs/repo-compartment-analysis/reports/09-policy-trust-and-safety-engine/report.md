# Compartment Report: 09 — Policy, Trust, and Safety Engine

## Metadata

- **Compartment**: 09 — Policy, Trust, and Safety Engine
- **Tier**: T3
- **Guideline file**: `09-policy-trust-and-safety-engine.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: c8127045c5832b0e66cb1efd04e0dd6800ce78e7
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                        | Exists? | Notes (only if material)       |
| ----------------------------------------------------------- | ------- | ------------------------------ |
| `packages/core/src/policy/types.ts`                         | yes     |                                |
| `packages/core/src/policy/policy-engine.ts`                 | yes     |                                |
| `packages/core/src/policy/config.ts`                        | yes     |                                |
| `packages/core/src/policy/toml-loader.ts`                   | yes     |                                |
| `packages/core/src/policy/integrity.ts`                     | yes     |                                |
| `packages/core/src/policy/utils.ts`                         | yes     |                                |
| `packages/cli/src/config/policy.ts`                         | yes     |                                |
| `packages/cli/src/config/trustedFolders.ts`                 | yes     |                                |
| `packages/core/src/services/FolderTrustDiscoveryService.ts` | yes     |                                |
| `packages/core/src/scheduler/scheduler.ts`                  | yes     | tool execution path consumer   |
| `packages/core/src/scheduler/policy.ts`                     | yes     | scheduler↔engine bridge       |
| `packages/core/src/confirmation-bus/message-bus.ts`         | yes     | TOOL_CONFIRMATION_REQUEST path |
| `packages/core/src/policy/shell-safety.test.ts`             | yes     |                                |

## 1. Scope and Boundary

This compartment covers the policy decision engine, its rule/source/persistence
model, the trust state that gates workspace policies, and the integrity controls
that prevent silent policy substitution. The engine returns one of `allow`,
`deny`, or `ask_user` per tool call, and is consumed by both the in-process
scheduler and the message-bus confirmation pathway.

Explicitly handed off: sandbox runtime enforcement (compartment 10), config
source plumbing including `policyPaths` resolution (compartment 06), tool-level
confirmation UX (compartment 04), and dynamic-permission persistence audit
(deferred to synthesis).

## 2. Runtime Flow Summary

1. CLI startup resolves workspace trust then conditionally builds the policy
   engine config: `packages/cli/src/config/policy.ts:108-160`.
2. `createPolicyEngineConfig` enumerates policy directories
   (`getPolicyDirectories`) by tier — system → user → workspace → packaged
   defaults: `packages/core/src/policy/config.ts:106-127`.
3. TOML files are loaded with priority numerically derived from tier; rules are
   validated (Zod) before being added:
   `packages/core/src/policy/toml-loader.ts:38-106`, `:306-357`.
4. Settings-derived rules (MCP excluded, tools allow/exclude, MCP trusted) are
   appended with fixed fractional priorities:
   `packages/core/src/policy/config.ts:407-524`.
5. Extension policies are loaded with `ALLOW` and YOLO-mode rules stripped:
   `packages/core/src/policy/config.ts:225-282`.
6. `PolicyEngine` constructor sorts rules and checkers by descending priority:
   `packages/core/src/policy/policy-engine.ts:207-216`.
7. On `check(toolCall, options)`, rules are walked first-match-wins by
   `ruleMatches` (tool name with wildcards/aliases/MCP FQN, `mcpName`,
   `subagent`, `argsPattern`, `interactive`/`nonInteractive`, mode):
   `packages/core/src/policy/policy-engine.ts:47-194`, `:565-620`.
8. Shell tools take a special path: heuristics (`applyShellHeuristics`) then
   per-segment `checkShellCommand` with redirection downgrade:
   `packages/core/src/policy/policy-engine.ts:282-486`.
9. On no-match, default decision is `DENY` (non-interactive) or `ASK_USER`; YOLO
   mode short-circuits to `ALLOW`:
   `packages/core/src/policy/policy-engine.ts:251-254`, `:623-661`.
10. Post-rule sandbox check can downgrade `ALLOW` → `ASK_USER` for paths outside
    the workspace; safety checkers can also downgrade or deny:
    `packages/core/src/policy/policy-engine.ts:664-743`.
11. The scheduler calls `checkPolicy` before tool execution:
    `packages/core/src/scheduler/scheduler.ts:617-678`; bridge logic at
    `packages/core/src/scheduler/policy.ts:53-107`.
12. The confirmation bus runs `policyEngine.check` on each
    `TOOL_CONFIRMATION_REQUEST` and branches ALLOW/DENY/ASK_USER:
    `packages/core/src/confirmation-bus/message-bus.ts:90-137`.
13. Dynamic policy updates come through `MessageBusType.UPDATE_POLICY`;
    `createPolicyUpdater` adds `ALLOW` rules and optionally writes TOML
    atomically with safe-regex validation:
    `packages/core/src/policy/config.ts:611-770`.
14. Workspace policy load is integrity-gated via
    `PolicyIntegrityManager.checkIntegrity` (SHA-256 over all `.toml`):
    `packages/core/src/policy/integrity.ts:40-114`.

## 3. Key Files and Citations

| Path                                                | Role                      | Notes                                                    |
| --------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `packages/core/src/policy/types.ts`                 | policy data model         | `PolicyDecision`, `PolicyRule`, `ApprovalMode`           |
| `packages/core/src/policy/policy-engine.ts`         | decision engine           | First-match-wins; shell heuristics; safety checkers      |
| `packages/core/src/policy/config.ts`                | engine factory + updater  | Tier→priority; settings-derived rules; persistence queue |
| `packages/core/src/policy/toml-loader.ts`           | TOML schema + parser      | Zod-validated; priority remap                            |
| `packages/core/src/policy/integrity.ts`             | tamper detection          | SHA-256 across workspace `.toml` set                     |
| `packages/cli/src/config/policy.ts`                 | CLI bootstrap glue        | Trust → workspace policy resolution                      |
| `packages/cli/src/config/trustedFolders.ts`         | folder trust state        | Realpath + longest-match rule lookup                     |
| `packages/core/src/scheduler/scheduler.ts`          | primary engine consumer   | Calls checkPolicy before tool execution                  |
| `packages/core/src/confirmation-bus/message-bus.ts` | secondary engine consumer | Branches on engine decision                              |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-09.1** — `PolicyDecision` is a closed enum (`allow`, `deny`, `ask_user`);
  the engine returns one per call via `CheckResult`.
  - Primary: `packages/core/src/policy/types.ts:10-14`
  - Supporting: `packages/core/src/policy/policy-engine.ts:745-748` (return
    type)
  - Confidence: high
- **VT-09.2** — Rule evaluation is first-match-wins after deterministic priority
  sort; default decision is `DENY` in non-interactive mode and `ASK_USER`
  interactively, with YOLO short-circuiting to `ALLOW`.
  - Primary: `packages/core/src/policy/policy-engine.ts:565-661`
  - Supporting:
    `packages/cli/src/config/policy-engine.integration.test.ts:36-74` (test)
  - Confidence: high
- **VT-09.3** — Workspace policy is gated by both folder trust and an integrity
  hash; loading is skipped when untrusted, and modified workspace `.toml`
  triggers re-prompt or auto-accept based on UI state.
  - Primary: `packages/cli/src/config/policy.ts:108-160`
  - Supporting: `packages/core/src/policy/integrity.ts:40-114` (integrity)
  - Confidence: high
- **VT-09.4** — Extension-supplied policies cannot grant `ALLOW` or YOLO-mode
  rules; the loader strips them on import.
  - Primary: `packages/core/src/policy/config.ts:225-282`
  - Confidence: high
- **VT-09.5** — Tool execution is policy-gated at two distinct sites:
  `scheduler._processToolCall` (`scheduler/policy.ts:checkPolicy`) and
  `MessageBus.publish` for `TOOL_CONFIRMATION_REQUEST`. Both call
  `policyEngine.check` with the tool name and args.
  - Primary: `packages/core/src/scheduler/scheduler.ts:617-678`
  - Supporting: `packages/core/src/confirmation-bus/message-bus.ts:90-137` (bus
    path)
  - Confidence: high
- **VT-09.6** — Engine matching is keyed on the tool's `FunctionCall.name` (with
  aliases and MCP FQN); a synthetic tool such as Pollux's `advisor_consultation`
  would be evaluated by the same name-matching pipeline with no special-case
  exemption.
  - Primary: `packages/core/src/policy/policy-engine.ts:47-194`
  - Supporting: `packages/core/src/policy/policy-engine.ts:492-563` (subagent
    virtual names)
  - Confidence: high

**Contradictions or ambiguities**

- **C-09.1** — Guideline cites `packages/core/src/core/coreToolScheduler.ts` as
  the integration point, but the actual consumer is
  `packages/core/src/scheduler/scheduler.ts` (and the bridge
  `scheduler/policy.ts`). Evidence:
  `packages/core/src/scheduler/scheduler.ts:617-678`. Resolution: resolved —
  guideline path is stale.
- **C-09.2** — `FolderTrustDiscoveryService` is described as policy-coupled, but
  it is actually consumed by the UI (`useFolderTrust`) and extension install
  flow, not the engine; coupling to policy is via `trustedFolders.ts` only.
  Evidence: `packages/core/src/services/FolderTrustDiscoveryService.ts:29-60`.
  Resolution: resolved — narrow coupling.

## 5. Risks and Open Questions

**Risks**

- **R-09.1** — A Pollux `advisor_consultation` synthetic tool, if registered
  like a normal tool, will hit the default decision path: in non-interactive
  mode it would be denied unless an explicit `ALLOW` rule ships with Pollux.
  Severity: high. Mitigating test: `no test`. Suggested guard: ship a
  packaged-default TOML allow-rule for `advisor_consultation` and gate it on the
  Pollux feature flag.
- **R-09.2** — The dynamic policy updater appends `ALLOW` rules at runtime; a
  Pollux interceptor that triggers per-turn updates could grow the rule set
  unboundedly. Severity: medium. Mitigating test:
  `packages/core/src/policy/policy-updater.test.ts:46-78`. Suggested guard:
  prohibit Pollux from emitting `UPDATE_POLICY` messages.
- **R-09.3** — Engine and confirmation bus call `check` independently; if
  Pollux's advisor invocation reaches both paths the user could be prompted
  twice. Severity: medium. Mitigating test:
  `packages/core/src/confirmation-bus/message-bus.test.ts:143-149`. Suggested
  guard: route advisor through scheduler path only.
- **R-09.4** — Extension-stripped `ALLOW` semantics mean a Pollux extension
  cannot ship its own allow-rule; only built-in policy or admin `policyPaths`
  works. Severity: low. Mitigating test:
  `packages/core/src/policy/config.test.ts`. Suggested guard: document Pollux's
  policy-shipping channel explicitly.

**Open questions**

- [ ] **OQ-09.1** — Should `advisor_consultation` bypass the engine entirely
      (treated as in-process metadata, not a tool call)? Escalate to
      compartments 02 and 04.
- [ ] **OQ-09.2** — Does the synthesis need to add a Pollux-specific rule to the
      packaged default policy? Escalate to compartment 16.

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/policy/workspace-policy.test.ts:37-100`: tier merging
    order.
  - `packages/core/src/policy/shell-safety.test.ts:86-115, 331-348, 374-391`:
    shell heuristics and pipeline behavior.
  - `packages/core/src/policy/persistence.test.ts:48-60`: queue serialization
    for atomic writes.
  - `packages/core/src/policy/policy-updater.test.ts:46-78, 102-123, 181-192`:
    dynamic ALLOW rule shape.
  - `packages/core/src/policy/integrity.test.ts:35-78`: hash creation and
    detection.
  - `packages/core/src/policy/topic-policy.test.ts:23-62`: per-topic gating.
  - `packages/core/src/policy/memory-manager-policy.test.ts:29-68`: subagent
    decision paths.
  - `packages/cli/src/config/policy.test.ts:62-100`: untrusted-folder workspace
    policy suppression.
  - `packages/cli/src/config/policy-engine.integration.test.ts:36-74`:
    end-to-end allow/exclude/unknown.
  - `packages/core/src/confirmation-bus/message-bus.test.ts:143-149`:
    tool-annotation forwarding.
- **Observability signals**: `MessageBusType.TOOL_CONFIRMATION_REQUEST` and
  `MessageBusType.UPDATE_POLICY` events; engine-emitted decision logs at the
  consumer sites.
- **Coverage gaps**:
  - No test asserts an `advisor_consultation`-style synthetic tool does not
    double-prompt (R-09.3).
  - No test covers Pollux-specific feature-flag scoped policy bundle (R-09.1).
  - No published guidance on which channel ships Pollux's allow-rule (R-09.4).

## 7. Definition of Done

- [x] Policy loading, evaluation, and enforcement pipeline is mapped.
- [x] Trust-state behavior is explicit.
- [x] Enforcement matrix is evidence-backed (rule-first, then shell, then safety
      checker).
- [x] Integrity controls are identified.
- [x] Safety gaps and follow-up recommendations are documented (R-09.x,
      OQ-09.x).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Sidecar populated at
      `reports/09-policy-trust-and-safety-engine/report.json`.
- [x] `INDEX.md` row 09 flipped to `done`.

## 8. Handoffs

- **Depends on**: 06, 04
- **Affects**: 02, 04, 10
- **Escalated to**: 02 — bypass-vs-tool design for advisor (OQ-09.1); 16 —
  packaged default policy update for Pollux (OQ-09.2).
