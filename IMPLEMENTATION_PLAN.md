# Pollux — Detailed Implementation Plan

This document breaks down the Pollux roadmap into actionable Epics, Phases, and
Tasks.

---

## Epic 1: Foundations & Infrastructure

**Goal:** Establish the development environment and core data structures.

### Phase 0: Environment Setup (Day 1)

**Objective:** Create a stable sandbox for development where the baseline CLI is
functional. **Overview:** Before modifying the agentic loop, we must have a
functional "Flash-only" baseline. This phase ensures the repository is correctly
forked, built, and tested in a local environment.

- **Task 0.1: Repository Initialization** **Objective:** Secure the source code
  and confirm the build pipeline is intact. **Overview:** We clone `gemini-cli`,
  install necessary Node.js dependencies, and run an initial build to catch any
  environment-specific issues early.
  - [x] **Step 1:** Fork/Clone the `gemini-cli` repository.
  - [x] **Step 2:** Run `npm install` and verify the base build.
  - [x] **Step 3:** Confirm `npm run dev` works and the CLI is operational.
        **Notes:** Baseline stability is crucial. Do not modify anything until
        the original project runs.

- **Task 0.2: Project Scaffolding** **Objective:** Isolate Pollux logic from the
  core `gemini-cli` source directory. **Overview:** Following a modular
  architecture, we create the `pollux/` subdirectory. This ensures that our
  advisor layer can be easily identified or even extracted as a standalone
  package later.
  - [x] **Step 1:** Create directory `packages/core/src/pollux/`.
  - [x] **Step 2:** Create sub-directory `packages/core/src/pollux/benchmark/`.
  - [x] **Step 3:** Initialize `index.ts` for public exports.

---

### Phase 1: Core Foundation (Days 2–3)

**Objective:** Define the shared vocabulary and configuration layer for the
entire advisor system. **Overview:** In this phase, we build the "Data Layer."
We define the core TypeScript interfaces that will be used by the interceptor,
detectors, and loggers. We also ensure that Pollux settings are accessible via
the standard CLI configuration paths.

- **Task 1.1: Type System Definition (`types.ts`)** **Objective:** Create a
  single source of truth for interfaces. **Overview:** We define what a
  `TurnContext` looks like (history, stream buffer, etc.) and what an
  `EscalationDecision` must contain. This prevents type mismatches during
  integration.
  - [ ] **Step 1:** Define `TurnContext` (turn number, history, buffer, etc.).
  - [ ] **Step 2:** Define `EscalationDetector` and `EscalationDecision`
        interfaces.
  - [ ] **Step 3:** Define `AdvisorPlan` and `TurnLog` structures. **Notes:**
        **MANDATORY START.** All other files depend on these types.

- **Task 1.2: Model Registry (`models.ts`)** **Objective:** Register the
  specific model IDs for both Executor and Advisor roles. **Overview:** We
  create a registry that maps friendly names (like `flash`) to actual Gemini API
  model strings and includes metadata for token counting.
  - [ ] **Step 1:** define `EXECUTOR_MODELS` and `ADVISOR_MODELS`.
  - [ ] **Step 2:** Include tier metadata and pricing (even if 0 for
        benchmarking).

- **Task 1.3: Settings Schema Integration (`config.ts`)** **Objective:** Allow
  users to toggle and tune Pollux from their settings file. **Overview:** We
  hook into the existing `GeminiConfig` logic so that settings like
  `escalationStrategy` or `maxAdvisorCalls` can be read from
  `~/.gemini/settings.json`.
  - [ ] **Step 1:** Extend the core config to include the `PolluxConfig` block.
  - [ ] **Step 2:** Update the settings parser to read the new block from
        `~/.gemini/settings.json`.

---

## Epic 2: The Advisor Intelligence Layer

**Goal:** Build the components that detect failure and provide expert guidance.

### Phase 2: Advisor Client & Logic (Days 4–5)

**Objective:** Build a stateless "Expert Engine" that provides high-level plans
when the junior model is stuck. **Overview:** This phase focuses on the Pro
model's role. It doesn't perform tasks; it only observes the failure and issues
a 3-5 step plan to fix it. We implement the "synthetic tool" method to feed this
plan back to the executor.

- **Task 2.1: Prompt Engineering (`prompts.ts`)** **Objective:** Define how we
  describe the failure to the Pro model. **Overview:** We create the System
  Prompt that tells the Advisor how to behave (JSON output, planning only) and
  implement logic to trim long conversation histories to fit within token
  limits.
  - [ ] **Step 1:** Write the system prompt for the Pro Advisor.
  - [ ] **Step 2:** Implement the context formatter (history trimming logic).
        **Notes:** History trimming is essential to prevent token explosion on
        long tasks.

- **Task 2.2: Advisor Client Implementation (`advisor.ts`)** **Objective:**
  Implement the actual API call to the Pro model. **Overview:** This class
  handles the communication with the Gemini API specified for the Advisor role.
  It sends the formatted history and returns the parsed `AdvisorPlan`.
  - [ ] **Step 1:** Implement `consult()` to call the Pro model via
        `generateContent`.
  - [ ] **Step 2:** Parse JSON response into the `AdvisorPlan` structure.

- **Task 2.3: Synthetic Tool Registration** **Objective:** Trick the executor
  into following the advisor's advice. **Overview:** We register a virtual tool
  called `advisor_consultation`. When the advisor returns a plan, we inject it
  into the history as if it were the result of this tool, which ensures the
  executor (Flash) treats it as a grounded instruction.
  - [ ] **Step 1:** Register `advisor_consultation` as a tool in the registry.
  - [ ] **Step 2:** Test that Flash can "receive" this tool result as guidance.

---

### Phase 3: Escalation Detectors (Days 6–8)

**Objective:** Build the logic that decides _when_ to pay for a Pro call.
**Overview:** This is the brains of the "Adaptive" aspect. We implement three
strategies: Heuristic (looking for loops/errors), Structured (model reporting
its own confidence), and Hybrid (using both).

- **Task 3.1: Heuristic Detector** **Objective:** Catch obvious logic loops and
  mechanical failures. **Overview:** We implement "dumb but reliable" checks,
  such as calling the same tool twice with identical arguments or hitting a turn
  limit without progress.
  - [ ] **Step 1:** Implement loop detection (same tool/args twice).
  - [ ] **Step 2:** Implement confusion detection (uncertainty markers after
        error).
  - [ ] **Step 3:** Implement overflow detection (turn > 8).

- **Task 3.2: Structured Detector** **Objective:** Leverage the model's
  self-awareness to predict failure. **Overview:** We inject a prompt
  instruction asking the executor to output a confidence score. This detector
  parses that score from the live stream to catch a "stuck" state before it
  leads to an error.
  - [ ] **Step 1:** Implement system prompt injection for `<pollux_confidence>`.
  - [ ] **Step 2:** Implement the stream parser to extract and then strip the
        tag.

- **Task 3.3: Hybrid Detector** **Objective:** Provide a "best of both worlds"
  safety net. **Overview:** A simple composition class that triggers escalation
  if _either_ the heuristic or structured detector fires.
  - [ ] **Step 1:** Implement the composition of the two detectors.

- **Task 3.4: Unit Testing** **Objective:** Ensure detection logic is robust
  without running full API loops. **Overview:** We use mocked `TurnContext`
  objects to verify that detectors fire on the correct triggers and ignore
  noise.
  - [ ] **Step 1:** Write unit tests for each detector using mocked context
        inputs.

---

## Epic 3: Integration & Execution

**Goal:** Wire Pollux into the main agent loop without breaking streaming or
history.

### Phase 4: Interceptor & Integration (Days 9–11)

**Objective:** Splice the Pollux logic into the live `gemini-cli` execution
path. **Overview:** This is the most complex phase. We create an `Interceptor`
that wraps the turn loop. It has to pause the live stream output to the UI while
it consults the advisor, and then resume it seamlessly.

- **Task 4.1: The Interceptor Core (`interceptor.ts`)** **Objective:** Manage
  the lifecycle of an escalation during a turn. **Overview:** This module acts
  as the "Traffic Controller," choosing which detector to run and handling the
  handoff Between Flash and Pro.
  - [ ] **Step 1:** Implement main orchestration: `shouldEscalate` -> `consult`
        -> `inject`.

- **Task 4.2: Client Wiring (`client.ts`)** **Objective:** Physically connect
  Pollux to the existing `GeminiClient`. **Overview:** We find the entry point
  where the CLI processes a turn and inject our interceptor logic there.
  - [ ] **Step 1:** Inject `PolluxInterceptor` into the
        `GeminiClient.processTurn()` method.

- **Task 4.3: Stream Splicing Logic (`turn.ts`)** **Objective:** Handle the
  "Pause/Inject/Resume" UI dance. **Overview:** Since `gemini-cli` streams
  output to the terminal, we must ensure that injecting advisor logic doesn't
  corrupt the terminal state or output partial tags to the user.
  - [ ] **Step 1:** Implement pause logic to halt the stream while the advisor
        thinks.
  - [ ] **Step 2:** Resume the stream with the synthetic tool result injected.
        **CRITICAL RISK:** Stream corruption is likely here. Test thoroughly.

- **Task 4.4: Integration Testing** **Objective:** Verify the full "end-to-end"
  loop works with real API calls. **Overview:** We run a task designed to
  trigger escalation and confirm the advisor provides a plan and Flash follows
  it.
  - [ ] **Step 1:** Verify Flash-only stability then test real escalation path.

---

## Epic 4: Data & Evaluation

**Goal:** Quantitative measurement of accuracy and cost efficiency.

### Phase 5: Benchmark Harness (Days 12–14)

**Objective:** Create a lab environment for repeatable testing. **Overview:** To
prove Pollux works, we need data. We build a harness that runs the same tasks
across different configurations (Flash only vs. Flash+Advisor vs. Pro only) and
collects metrics.

- **Task 5.1: Task Suite Architecture (`benchmark/tasks.ts`)** **Objective:**
  Define a diverse set of coding challenges. **Overview:** We create 30 tasks
  with clear "pass/fail" oracles (e.g., "does this command return 0?") to ensure
  our performance numbers are objective.
  - [ ] **Step 1:** Define 30 tasks (10 Easy, 10 Medium, 10 Hard).
  - [ ] **Step 2:** Implement correctness oracles (e.g., test commands or state
        checks).

- **Task 5.2: Token Logger & Data Collection (`logger.ts`)** **Objective:**
  Track every token and every dollar (proxy) spent. **Overview:** We record
  detailed JSONL logs for every session, capturing prompt tokens, completion
  tokens, and escalation reasons for post-run analysis.
  - [ ] **Step 1:** Implement JSONL logging for every turn and escalation event.

- **Task 5.3: The Run Harness (`benchmark/runner.ts`)** **Objective:** Automate
  450+ trials without intervention. **Overview:** This script iterates through
  tasks and conditions. It includes "checkpointing" so if it crashes
  mid-benchmark, it can resume where it left off.
  - [ ] **Step 1:** Implement the execution loop for 5 benchmark conditions.
  - [ ] **Step 2:** Add rate limiting (1 req/sec) and task checkpointing
        (idempotency).

- **Task 5.4: Analytics Engine (`benchmark/report.ts`)** **Objective:** Turn raw
  logs into human-readable insights. **Overview:** We create a script that reads
  the JSONL files and outputs a statistical report showing Accuracy, Cost, and
  "Escalation Efficiency."
  - [ ] **Step 1:** Implement scripts to aggregate logs into Markdown tables.
  - [ ] **Step 2:** Calculate Precision/Recall for escalation triggers.

---

### Phase 6: Benchmark Execution (Days 15–17)

**Objective:** Collect the definitive dataset for the project. **Overview:** We
run the actual high-volume tests. This requires monitoring for rate limits and
ensuring the results aren't skewed by temporary API failures.

- **Task 6.1: Full Run** **Objective:** Complete all 450 trials across all 5
  conditions. **Overview:** This is a "leave it running overnight" task. We
  verify final log integrity before moving to analysis.
  - [ ] **Step 1:** Execute 450 trials.
  - [ ] **Step 2:** Monitor for rate limits or runtime failures.

---

## Epic 5: Finalization

**Goal:** Prepare Pollux for public presentation.

### Phase 7: Polish (Days 18–20)

**Objective:** Finalize the user experience and documentation. **Overview:** We
wrap up by adding CLI commands to toggle the advisor and cleaning up the
documentation so it's ready for high-visibility showcase (e.g., portfolio or GDG
demo).

- **Task 7.1: Documentation & PR Prep** **Objective:** Tell the story of the
  project. **Overview:** We update the README with the "Grand Table" of
  benchmark results and architectural diagrams.
  - [ ] **Step 1:** Finalize README with benchmark data and architecture
        diagrams.

- **Task 7.2: Power User Features** **Objective:** Add runtime control for
  developers. **Overview:** We implement a slash command `/pollux` and small UI
  indicators so users know exactly when the "Pro Advisor" is helping them.
  - [ ] **Step 1:** Implement `/pollux` slash command for runtime toggling.
  - [ ] **Step 2:** Add minimal UI indicator (e.g., `[Advisor consulted]`).
