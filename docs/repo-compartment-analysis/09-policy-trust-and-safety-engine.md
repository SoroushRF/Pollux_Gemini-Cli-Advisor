# Compartment 09: Policy, Trust, and Safety Engine

## Purpose

Analyze policy enforcement and trust boundaries that govern what the runtime is
allowed to do.

This compartment is the security and compliance control plane for the runtime.

## Execution Contract

- **Report (MD)**:
  `docs/repo-compartment-analysis/reports/09-policy-trust-and-safety-engine.report.md`
- **Report (JSON)**:
  `docs/repo-compartment-analysis/reports/09-policy-trust-and-safety-engine.report.json`
- **Runbook**: `AGENT_RUNBOOK.md`
- **Template**: `_TEMPLATES/report-template.md`
- **Sidecar schema**: `_TEMPLATES/report-sidecar-schema.json`
- **Citation format**: `CITATION_STANDARD.md`
- **Status tracker**: update row 09 in `INDEX.md` at start and end
- **Readonly**: do not modify `packages/**` source. Reports only.

## Boundary

In scope:

- policy engine and policy model,
- workspace/user policy loading,
- trust and folder boundary behavior,
- shell safety guardrails and integrity checks,
- policy updates and persistence semantics.

Primary paths:

- `packages/core/src/policy`
- `packages/core/src/policy/policy-engine.ts`
- `packages/core/src/policy/workspace-policy.test.ts`
- `packages/core/src/policy/shell-safety.test.ts`
- `packages/cli/src/config/policy.ts`
- `packages/cli/src/config/trustedFolders.ts`
- `packages/core/src/services/FolderTrustDiscoveryService.ts`

Out of scope:

- sandbox runtime internals,
- command parsing internals,
- telemetry exporter internals.

## Key Questions To Answer

1. How are policy sources loaded, merged, and enforced?
2. How are trust states determined and propagated?
3. What shell/file actions are blocked or constrained by policy?
4. What integrity checks exist to prevent policy bypass?
5. How are policy changes validated and tested?

## Data Gathering Checklist

1. Read policy engine and policy type definitions.
2. Trace policy load/update paths.
3. Inspect trust-folder and workspace policy coupling.
4. Inspect shell safety constraints and denial semantics.
5. Validate with policy integration tests.

## Search Commands

```bash
rg -n "policy-engine|PolicyEngine|evaluatePolicy|policyDecision" packages/core/src/policy
rg -n "toml-loader|policyUpdater|persistence" packages/core/src/policy
rg -n "trustedFolders|FolderTrust|isTrusted" packages/cli/src/config packages/core/src/services
rg -n "shell-safety|integrity|denied|allowlist" packages/core/src/policy
rg --files packages/core/src/policy
rg --files -g "*policy*.test.ts" packages
```

PowerShell fallback:

```powershell
Select-String -Path "packages/core/src/policy/**/*.ts","packages/cli/src/config/trustedFolders.ts" -Pattern "PolicyEngine|evaluatePolicy|trustedFolders|shell-safety"
```

## Step-by-Step Analysis Recipe

### Step 1: Analyze policy model and core engine

Read:

- `packages/core/src/policy/types.ts`
- `packages/core/src/policy/policy-engine.ts`
- `packages/core/src/policy/config.ts`

Capture:

- policy structure,
- evaluation flow,
- allow/deny resolution semantics.

### Step 2: Analyze policy sources and persistence

Read:

- `packages/core/src/policy/toml-loader.ts`
- `packages/core/src/policy/persistence.test.ts`
- `packages/core/src/policy/policy-updater.test.ts`

Capture:

- source format and parse rules,
- update lifecycle,
- persistence behavior.

### Step 3: Analyze trust and workspace coupling

Read:

- `packages/cli/src/config/trustedFolders.ts`
- `packages/cli/src/config/workspace-policy-cli.test.ts`
- `packages/core/src/policy/workspace-policy.test.ts`

Capture:

- trust discovery and gating,
- workspace-specific policy effects,
- runtime behavior under untrusted state.

### Step 4: Analyze shell safety and integrity controls

Read:

- `packages/core/src/policy/shell-safety.test.ts`
- `packages/core/src/policy/integrity.ts`

Capture:

- restricted command behavior,
- path and boundary checks,
- anti-bypass mechanisms.

### Step 5: Verify runtime integration points

Find where policy decisions are consumed in tool and execution paths. Cite those
callers directly.

### Step 6: Validate with tests

Use:

- `packages/core/src/policy/*.test.ts`
- `packages/cli/src/config/policy*.test.ts`
- integration tests with policy scenarios.

### Step 7: Build enforcement matrix

Document, by action type (shell/file/network/tool), what is:

- allowed,
- conditional,
- denied,
- confirmation-gated.

### Step 8: Publish safety gaps and hardening notes

Include unclear areas where enforcement relies on convention rather than strict
engine checks.

## What Good Output Looks Like

1. Policy source-to-enforcement pipeline.
2. Trust state model and transitions.
3. Action enforcement matrix.
4. Integrity and anti-bypass controls summary.
5. Identified hardening opportunities.

## Do and Do Not

Do:

- treat policy behavior as runtime-critical, not optional,
- include trust-folder and workspace policy interactions,
- verify denials with tests and callsites.

Do not:

- infer policy behavior only from docs,
- ignore integrity checks,
- conflate sandbox constraints with policy rules.

## Common Failure Modes While Analyzing

- Reading only policy types but not evaluation code.
- Missing workspace trust impact from CLI config layers.
- Assuming shell safety is fully covered by sandbox alone.
- Reporting policy outcomes without action-category matrix.

## Handoffs To Other Compartments

- Sandbox enforcement details -> `10-sandbox-shell-and-filesystem-substrate.md`
- Config source details -> `06-settings-schema-and-config-plumbing.md`
- Tool-level confirmation behavior -> `04-tools-and-mcp-platform.md`

## Definition of Done

- [ ] Policy loading, evaluation, and enforcement pipeline is mapped.
- [ ] Trust-state behavior is explicit.
- [ ] Enforcement matrix is evidence-backed.
- [ ] Integrity controls are identified.
- [ ] Safety gaps and follow-up recommendations are documented.
- [ ] Pre-flight path validation recorded in report section 0.
- [ ] Evidence matrix populated in the JSON sidecar.
- [ ] `INDEX.md` row 09 flipped to `done`.
