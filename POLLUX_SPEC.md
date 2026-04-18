# Pollux Master Specification (Reconciled)

Version: 2.0 Date: 2026-04-17 Status: Implementation-ready only after start
gates in IMPLEMENTATION_PLAN.md are complete Scope: Pollux advisor integration
for gemini-cli fork with benchmarkable behavior and governance controls

---

## Section implementation status

Legend: contracted = design/contract locked in this spec and linked P0
artifacts; planned = described but not yet contract-locked; implemented =
runtime behavior shipped and test-gated in-tree. Status is tracked here to
satisfy IMPLEMENTATION_PLAN.md G5 "Unimplemented sections marked as such".

| Section                                   | Status     |
| ----------------------------------------- | ---------- |
| 1 Purpose                                 | contracted |
| 2 Goals and non-goals                     | contracted |
| 3 Runtime reality and coverage matrix     | contracted |
| 4 Pollux component model                  | contracted |
| 5 Interceptor contract                    | contracted |
| 6 Advisor invocation and policy contract  | contracted |
| 7 Escalation detector contract            | contracted |
| 8 Settings and configuration contract     | contracted |
| 9 Telemetry and token accounting contract | contracted |
| 10 Benchmark protocol                     | contracted |
| 11 Command and output surface contract    | contracted |
| 12 CI, test, and release contract         | contracted |
| 13 Security and safety contract           | contracted |
| 14 Documentation and governance contract  | contracted |
| 15 Acceptance criteria                    | contracted |
| Appendix A Driver/interceptor matrix      | contracted |
| Appendix B Benchmark fairness checklist   | contracted |
| Appendix C Terminology                    | contracted |

No section is currently in "implemented" state. All runtime implementation and
test-gated behavior lands in Phase 1 through Phase 5 per IMPLEMENTATION_PLAN.md.

---

## 1) Purpose

Pollux adds an adaptive advisor path so a fast executor model can escalate
selected decisions to a stronger advisor model. The objective is to improve
hard-task success without paying full premium-model cost for every turn.

This spec defines execution contracts, not just architecture intent.

---

## 2) Goals and non-goals

### Goals

1. Improve hard-task completion quality over flash-only baseline.
2. Keep token and latency overhead controlled and measurable.
3. Preserve deterministic runtime behavior across supported surfaces.
4. Keep observability, policy, and configuration inside existing platform
   mechanisms.

### Non-goals for Phase 1

1. Full A2A runtime interception.
2. New standalone telemetry sink for token accounting.
3. New protocol event taxonomy for advisor-specific stream events.

---

## 3) Runtime reality and coverage matrix

Pollux is specified against actual runtime entry points.

| Surface                       | Entry path                                          | Phase 1 status       | Pollux expectation                                   |
| ----------------------------- | --------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| Interactive legacy            | useGeminiStream -> GeminiClient.sendMessageStream   | In scope             | Full behavior                                        |
| Non-interactive legacy        | runNonInteractive -> GeminiClient.sendMessageStream | In scope             | Full behavior                                        |
| Interactive agent-session     | useAgentStream -> LegacyAgentSession                | In scope             | Behavioral parity                                    |
| Non-interactive agent-session | runNonInteractiveAgentSession -> LegacyAgentSession | In scope             | Behavioral parity                                    |
| ACP                           | GeminiAgent.prompt                                  | In scope             | Pollux-compatible advisor policy/permission behavior |
| A2A CoderAgentExecutor        | a2a-server executor path                            | Out of scope Phase 1 | Explicit documented bypass and tests                 |

Important: processTurn-level integration is necessary but not sufficient for
cross-surface coverage.

---

## 4) Pollux component model

All Pollux modules live under packages/core/src/pollux/.

Required modules:

1. types.ts
2. models.ts
3. prompts.ts
4. advisor.ts
5. detector.ts
6. interceptor.ts
7. benchmark/runner.ts
8. benchmark/tasks.ts
9. benchmark/report.ts

No dedicated pollux/logger.ts token sink is defined in this spec.

---

## 5) Interceptor contract

### 5.1 Core behavior

On eligible turns:

1. Evaluate shouldEscalate(context).
2. If false: continue unchanged.
3. If true: consult advisor with bounded context.
4. Inject advisor guidance through approved injection path.
5. Resume executor path.

### 5.2 Safety behavior

1. Fail-open on advisor timeout/parse errors/policy denial.
2. Bound advisor calls per turn and per session.
3. Never mutate event ordering guarantees.
4. Never regress Pollux-off behavior.

### 5.3 Surface expectations

1. Legacy and agent-session paths must satisfy same observable contract.
2. ACP path must not introduce unexpected human permission prompts for
   advisor-only flow.

---

## 6) Advisor invocation and policy contract

### 6.1 Primary invocation shape

Preferred shape: advisor_consultation synthetic tool routed through scheduler
policy path.

### 6.2 Policy defaults

advisor_consultation must have a packaged default ALLOW rule, gated by Pollux
feature flag.

Policy decisions remain allow/deny/ask_user. Pollux does not introduce a new
policy decision type.

### 6.3 ACP behavior

ACP integration must prevent redundant requestPermission prompts for
advisor-only synthetic consultation.

### 6.4 Runtime policy constraints

1. No unbounded per-turn policy mutation.
2. No extension-based ALLOW dependency for advisor path.
3. Policy bypass is prohibited unless explicitly documented and tested.

### 6.5 Example packaged rule (illustrative)

```toml
[[rules]]
match_tool = "advisor_consultation"
decision = "allow"
when_feature_flag = "pollux.enabled"
scope = "built_in_default"
```

---

## 7) Escalation detector contract

### 7.1 Detector strategies

1. heuristic
2. structured
3. hybrid

### 7.2 Required detector properties

1. Deterministic reason codes.
2. Threshold-driven behavior from config.
3. Explicit false-positive and false-negative test coverage.

### 7.3 Structured confidence tag behavior

1. Tag extraction and stripping must not leak to user-visible output.
2. Missing/malformed tags must fail-open.

### 7.4 Baseline purity constraint

Detectors must not add extra LLM calls during baseline conditions that claim no
advisor behavior.

---

## 8) Settings and configuration contract

### 8.1 Phase 1 settings path

Phase 1 uses experimental.pollux.\* through CLI schema and loader.

### 8.2 Example settings block

When `experimental.pollux.enabled` is `true`,
`experimental.pollux.executorModel` is the source of truth for the executor
model — it supersedes `settings.model.name`. See §8.3 for the full precedence
rule.

```json
{
  "experimental": {
    "pollux": {
      "enabled": true,
      "executorModel": "gemini-2.5-flash",
      "advisorModel": "gemini-3.1-pro-preview",
      "strategy": "hybrid",
      "maxAdvisorCallsPerTurn": 2,
      "maxAdvisorCallsPerSession": 20,
      "confidenceThreshold": 6,
      "emitAdvisorDebug": false
    }
  }
}
```

### 8.3 Precedence and migration

The CLI resolves the executor model from the following sources, highest priority
first:

1. `argv.model` (i.e. `--model <name>` on the command line).
2. `GEMINI_MODEL` environment variable.
3. `experimental.pollux.executorModel`, but only when
   `experimental.pollux.enabled === true`. When Pollux is enabled the executor
   model is sourced from this field (or its schema default) rather than from
   `settings.model.name`, because Pollux's contract is "fast executor, smart
   advisor" and the executor model must be Pollux-controlled. When the override
   fires and `settings.model.name` was set to a different value, the CLI emits a
   single `debugLogger` startup line so users can discover why their pinned
   model was bypassed.
4. `settings.model.name`.
5. Built-in default (`PREVIEW_GEMINI_MODEL_AUTO`).

When `experimental.pollux.enabled` is `false`,
`experimental.pollux.executorModel` has no effect on routing and rule 4 wins
over rule 3. The advisor model is always sourced from
`experimental.pollux.advisorModel`; it is never affected by
`settings.model.name` or `argv.model`.

Migration to top-level `pollux.\*` is a post-stability milestone.

### 8.4 Required quality gates

1. schema generation check in CI.
2. ConfigParameters mapping invariant tests.

---

## 9) Telemetry and token accounting contract

### 9.1 Required extension

Add LlmRole.UTILITY_ADVISOR to existing role taxonomy.

### 9.2 Required sinks

1. LoggingContentGenerator events.
2. ChatRecordingService token persistence.
3. Existing metrics export path.

### 9.3 Prohibited patterns

1. Parallel token sink that becomes source-of-truth.
2. Advisor-only logging path that bypasses standard role-tagged accounting.

### 9.4 Reconciliation requirement

Token totals in metrics and conversation record must reconcile in automated
integration tests.

---

## 10) Benchmark protocol

### 10.1 Conditions

| ID  | Executor | Advisor | Strategy   |
| --- | -------- | ------- | ---------- |
| A   | Flash    | None    | None       |
| B   | Flash    | Pro     | Heuristic  |
| C   | Flash    | Pro     | Structured |
| D   | Flash    | Pro     | Hybrid     |
| E   | Pro      | None    | None       |

### 10.2 Fairness pins (mandatory)

All benchmark runs used for A-E comparison must enforce:

1. Router pinned to explicit override strategy for target model.
2. Loop detector LLM checks disabled for baseline fairness mode.
3. Availability state reset between runs.
4. Dynamic model configuration features fixed and deterministic.
5. Fresh isolated session IDs per iteration.

### 10.3 Run validity

A run is invalid if fairness pins are not active and recorded.

### 10.4 Metrics

1. Accuracy (binary pass/fail by oracle).
2. Executor/advisor tokens and totals.
3. End-to-end latency.
4. Escalation precision and recall.
5. Confidence intervals for reported rates.

---

## 11) Command and output surface contract

### 11.1 /pollux command registration

Phase 1 requires registration in all in-scope command surfaces:

1. Builtin command loader path.
2. ACP command registry path.

A2A command registration is Phase 2 scope and must be explicitly documented as
deferred.

### 11.2 Stream output contract

Phase 1 reuses existing tool_use/tool_result semantics for advisor interactions.

No new JSON stream event type is required for Phase 1 unless proven necessary by
test failures.

---

## 12) CI, test, and release contract

Required release-blocking gates:

1. Cross-surface parity tests.
2. Advisor policy double-prompt avoidance tests.
3. Token reconciliation tests.
4. Benchmark fairness gate tests.
5. Schema and config mapping tests.
6. Pollux-scoped binary build and perf/memory workflows.

No latest-channel promotion without all release-blocking gates green.

---

## 13) Security and safety contract

1. Pollux must respect existing trust and policy mechanisms.
2. Advisor behavior must not silently degrade into denied headless behavior.
3. Pollux must fail-open to executor path if advisor path is unavailable.
4. No unmanaged policy sprawl through per-turn rule append behavior.

---

## 14) Documentation and governance contract

Required updates as part of Pollux rollout:

1. Keep this spec and IMPLEMENTATION_PLAN.md versioned and synchronized.
2. Maintain explicit implemented status markers for major sections.
3. Keep ownership coverage for POLLUX\_\*.md and repo-compartment-analysis docs.
4. Keep per-finding correction ledger tied to implementation PR sequence.

---

## 15) Acceptance criteria

Pollux Phase 1 is accepted only when:

1. Pollux-off behavior is baseline-identical.
2. Pollux-on behavior is validated across all in-scope surfaces.
3. Advisor policy works in non-interactive and ACP modes without surprise
   prompts.
4. Token accounting is reconciled across all required sinks.
5. Benchmark A-E results are produced under documented fairness pins.
6. CI and governance contracts are fully green.

---

## Appendix A: Driver/interceptor matrix (Phase 1)

| Surface                       | Interceptor responsibility                      | Expected test                             |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Interactive legacy            | Pollux orchestration + event-order preservation | end-to-end interactive escalation test    |
| Non-interactive legacy        | Pollux orchestration + text/json stability      | end-to-end non-interactive parity test    |
| Interactive agent-session     | Pollux parity semantics with legacy             | agent-session interactive parity test     |
| Non-interactive agent-session | Pollux parity semantics with legacy             | agent-session non-interactive parity test |
| ACP                           | advisor policy/permission-safe integration      | ACP advisor prompt behavior test          |
| A2A (deferred)                | explicit bypass behavior only                   | documented bypass assertion test          |

---

## Appendix B: Benchmark fairness checklist

Each benchmark run artifact must record:

1. model override state
2. loop detector state
3. availability reset state
4. dynamic config state
5. session isolation state

Missing any item invalidates comparison claims.

---

## Appendix C: Terminology

1. Executor: default task-performing model.
2. Advisor: escalation model consulted by Pollux.
3. Fairness pins: controls that neutralize non-Pollux utility call noise.
4. In-scope surface: runtime path required to satisfy Phase 1 acceptance.
