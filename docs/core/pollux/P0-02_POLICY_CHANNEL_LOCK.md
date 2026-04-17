# P0-02 Advisor Policy Channel Lock and ACP Behavior Contract

Version: 1.0 Date: 2026-04-17 Status: Draft for G2 closure Purpose: Phase 0 task
artifact for P0-02 in IMPLEMENTATION_PLAN.md.

---

## 1) Scope

This document closes the P0-02 deliverable by defining:

1. The policy decision path for advisor_consultation.
2. The required packaged default ALLOW rule behavior under the Pollux flag.
3. Non-interactive and ACP behavior contracts that prevent silent deny and
   redundant prompts.
4. Acceptance tests required to satisfy G2 and related test gates.

Runtime implementation code is out of scope for this artifact.

---

## 2) Locked policy contract

### 2.1 Invocation and gating path

1. Primary invocation shape is advisor_consultation as a synthetic tool.
2. Advisor consultation must be routed through scheduler policy checks as the
   primary control path.
3. Policy decisions remain allow, deny, ask_user. No Pollux-specific decision
   type is introduced.

### 2.2 Packaged default behavior

1. A packaged default ALLOW rule for advisor_consultation must be available
   behind pollux.enabled.
2. Rule source must be built-in default policy, not extension-managed policy.
3. Rule activation must be deterministic for headless and CI execution.

### 2.3 Non-interactive behavior

1. Default non-interactive deny behavior must not silently block advisor
   consultation when Pollux is enabled.
2. If advisor path cannot proceed, behavior must be observable and fail open to
   executor path.

### 2.4 ACP behavior

1. Advisor-only synthetic consultation must not trigger unexpected
   requestPermission prompts.
2. ACP advisor flow must align with policy intent and avoid redundant permission
   requests.

### 2.5 Policy safety constraints

1. No unbounded per-turn policy mutation.
2. No extension-based ALLOW dependency for advisor path.
3. No undocumented policy bypass.
4. No dual authority conflict between persistent policy engine and ad hoc
   allowlists for advisor consultation.

---

## 3) Illustrative packaged rule contract

```toml
[[rules]]
match_tool = "advisor_consultation"
decision = "allow"
when_feature_flag = "pollux.enabled"
scope = "built_in_default"
```

This is a contract example and not a replacement for policy-engine integration
tests.

---

## 4) Acceptance tests list

### AT-01 packaged default rule activation

Objective: Verify advisor_consultation ALLOW rule is present and active only
when Pollux feature flag is enabled.

Assertions:

1. With pollux.enabled=true, advisor_consultation resolves to allow under
   packaged default policy.
2. With pollux.enabled=false, advisor_consultation does not inherit unintended
   ALLOW behavior.
3. Rule source is traceable to built-in default scope.

TG mapping: TG-3.

### AT-02 non-interactive advisor allow path

Objective: Verify headless/non-interactive mode does not silently deny advisor
consultation when Pollux is enabled.

Assertions:

1. Non-interactive advisor consultation follows expected policy decision path.
2. Silent deny regression is absent.
3. Fallback path remains executor-safe and observable.

TG mapping: TG-3.

### AT-03 ACP permission behavior

Objective: Verify ACP advisor flow does not generate unexpected permission
prompts for advisor-only synthetic consultation.

Assertions:

1. No redundant requestPermission for advisor-only synthetic path.
2. ACP flow remains consistent with policy decision contract.

TG mapping: TG-8.

### AT-04 no double-prompt across scheduler and confirmation bus

Objective: Verify advisor consultation cannot trigger duplicate human
confirmation prompts.

Assertions:

1. Single decision authority is respected for advisor consultation.
2. No duplicate ask_user prompt chain appears for the same advisor action.

TG mapping: TG-3, TG-8.

### AT-05 policy decision type invariants

Objective: Verify Pollux does not introduce new decision types or mutate
baseline policy semantics.

Assertions:

1. allow/deny/ask_user remains the only decision set.
2. Existing non-advisor tool decisions remain unchanged.

TG mapping: TG-3.

---

## 5) Touchpoint map (implementation guidance)

Primary touchpoints for policy-path implementation and tests:

1. packages/core/src/policy/policy-engine.ts
2. packages/core/src/policy/config.ts
3. packages/core/src/scheduler/policy.ts
4. packages/core/src/scheduler/scheduler.ts
5. packages/core/src/confirmation-bus/message-bus.ts
6. packages/cli/src/acp/acpClient.ts
7. packages/cli/src/acp/commandHandler.ts

---

## 6) G2 closure checklist

P0-02 is complete when:

1. Policy design path and ACP behavior contract are documented.
2. Packaged default ALLOW contract for advisor_consultation is specified behind
   Pollux flag.
3. Non-interactive silent-deny prevention is specified.
4. Acceptance tests list exists and maps to TG-3 and TG-8.
5. Owners 09/04/12 sign off on contract.

---

## 7) References

1. IMPLEMENTATION_PLAN.md (G2 and P0-02 task definition).
2. POLLUX_SPEC.md section 6 (advisor invocation and policy contract).
3. docs/repo-compartment-analysis/reports/SYNTHESIS/report.md (SR-5 and NA-3).
4. docs/repo-compartment-analysis/reports/09-policy-trust-and-safety-engine/report.md.
5. docs/repo-compartment-analysis/reports/12-output-protocol-and-acp-adapters/report.md.
6. docs/repo-compartment-analysis/reports/04-tools-and-mcp-platform/report.md.
