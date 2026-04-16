# Pollux Compartment Priority

## Is there a required order?

**No.** Each compartment is self-contained and can be analyzed independently.
The 16 guideline files were designed to be mutually exclusive with explicit
handoffs; parallel agents can run different compartments at the same time (see
`INDEX.md`).

**However, order matters for Pollux.** The Pollux integration touches a specific
slice of the repo, and the forensic audit (`POLLUX_FULL_FORENSIC_CONTEXT.md` §11
"Safe Implementation Sequence") and spec (`POLLUX_SPEC.md` §3, §12, §14) both
point at the same handful of subsystems as the critical path.

This file gives you a **Pollux-optimized analysis order** so findings arrive in
the order implementation decisions need them.

---

## TL;DR order

Run the compartments in four tiers. Within a tier, order is flexible and
parallel-safe.

| Tier | Compartments       | When to run      |
| ---- | ------------------ | ---------------- |
| 1    | 02, 07, 06, 01, 04 | Start here       |
| 2    | 03, 08, 11, 14     | After tier 1     |
| 3    | 12, 05, 09, 16     | Before synthesis |
| 4    | 15, 10, 13         | Optional / last  |

If you only had budget for 5 compartments, do **02, 07, 06, 01, 04**. Those five
cover every Pollux integration surface named in the forensic report's
high-severity findings.

---

## Tier 1 — Critical path (do first)

These are the compartments Pollux **directly modifies or depends on**. Any wrong
assumption here breaks implementation.

### 02 — Core Turn Engine

The heart of the integration. Pollux inserts the interceptor between
`GeminiClient` and `Turn.run()`, and needs to understand event emission and
stream lifecycle before anything else can be designed correctly.

- Spec anchors: §3 (architecture), §7 (advisor call path), §12 Risk 1 (stream
  splice corruption), §14 ("Don't touch `GeminiChat` directly").
- Forensic anchors: §3.2 (`client.ts#L593/L747`, `turn.ts#L253/L132-L163`), F-04
  ("stream splice model is too narrow"), §11 step 4 ("integrate orchestration in
  core client turn flow behind feature flag").

### 07 — Routing, Availability, Loop Detection, and Pollux

Pollux scaffold lives here (`packages/core/src/pollux/`). The "single-model
baseline" assumption in the spec is **outdated** — a multi-strategy router
already exists. Benchmark fairness depends on controlling this layer.

- Spec anchors: §4 (model registry), §9 (benchmark conditions A/E need router
  control).
- Forensic anchors: F-01 (outdated single-model baseline), §3.1 (Pollux scaffold
  is scaffold-only), §9.2 (model routing/baseline control), §9.5 (loop detection
  has advanced behavior that interferes with benchmarks).

### 06 — Settings Schema and Config Plumbing

Pollux adds a `pollux` settings block. The spec misplaces settings ownership —
CLI owns schema/validation/merge, not core. Getting this right up front avoids a
config refactor mid-implementation.

- Spec anchors: §5 (settings block), §3 (claim that `config.ts` is the reader —
  partially wrong).
- Forensic anchors: F-02 ("settings integration ownership is mislocated in
  docs"), C-03 (config ownership ambiguity), §9.1 (settings/path layering), §11
  steps 1–2.

### 01 — CLI Runtime Surface

Two continuation loops exist (interactive `useGeminiStream.ts` and
non-interactive `nonInteractiveCli.ts`) and **both matter** for Pollux. The
spec's "CLI unchanged" claim is wrong: Phase 7 adds `/pollux`, and Risk 1 is the
stream hook receiving out-of-order events.

- Spec anchors: §3 ("packages/cli unchanged") — contradicted by §10 Phase 7; §12
  Risk 1 (useGeminiStream.ts crash risk).
- Forensic anchors: F-03 ("CLI unchanged" contradicts required work), §3.3 (both
  loops matter), C-01, §11 step 5.

### 04 — Tools and MCP Platform

Pollux injects the advisor plan as a synthetic `advisor_consultation` tool
result. This requires understanding the tool registry, declaration flow, and
existing synthetic-interaction precedents.

- Spec anchors: §7 ("synthetic tool approach is the right injection method"),
  §10 Phase 2 ("Register `advisor_consultation` as a synthetic tool").
- Forensic anchors: F-08 (synthetic tool path is valid), §9.3 (tool registry
  pathways), §9.4 (existing synthetic interaction precedent).

---

## Tier 2 — High leverage (do before integration)

These compartments inform **how** the critical-path changes are made, and must
be understood before the interceptor/advisor code is integration- tested.

### 03 — Agent Runtime and Modes

An agent-session branch exists in interactive mode (legacy + current). The
validation checklist explicitly requires Pollux to not regress this branch.

- Forensic anchors: §3.4 (AppContainer branch, legacy-agent-session), §12
  validation item: "agent-session interactive mode behavior remains stable when
  feature flag is on/off", §11 step 5.

### 08 — Context, Memory, and Compression

Advisor context trimming (Risk 3) lives here. History compression already exists
— the spec's "don't touch `GeminiChat` directly" is too absolute and needs
nuance that this compartment provides.

- Spec anchors: §12 Risk 3 (advisor context size), §14 ("Don't touch
  `GeminiChat` directly").
- Forensic anchors: F-09 ("Don't touch GeminiChat directly" is too absolute).

### 11 — Telemetry, Observability, and Billing Signals

The token logger in the spec duplicates token capture that **already exists** in
`geminiChat.ts` and `chatRecordingService.ts`. Reusing the existing path is
strictly better than inventing a parallel logger.

- Spec anchors: §8 (TurnLog design), §14 ("Log everything from day one").
- Forensic anchors: F-10 ("token logger guidance duplicates existing token
  capture capability"), §9.6 (token data already captured), §10.5 (token logger
  rewrite).

### 14 — Testing and Evaluation Architecture

The benchmark harness (§9, §10 Phase 5–6) must control the existing router and
loop-detection side effects or condition A/E numbers are invalid. This
compartment tells you what test infrastructure already exists to plug into.

- Spec anchors: §9 (benchmark design), §10 Phase 5.
- Forensic anchors: F-07 ("zero extra API calls / zero latency is over-broad in
  benchmark context"), §11 step 6 ("benchmark harness that controls model router
  and loop-detection side effects"), §12 validation items about router policy
  and loop detection.

---

## Tier 3 — Supporting (before synthesis)

Important for correctness and completeness of the Pollux report, but not on the
hot path of "can we implement it?"

### 12 — Output Protocol and ACP Adapters

Stream-json and JSON output contracts must not regress when Pollux toggles.
Non-interactive agent-session output is adjacent here.

- Forensic anchors: §12 validation item: "non-interactive continuation remains
  stable with advisor escalations".

### 05 — Extensibility (Skills, Hooks, Commands, Extensions)

Phase 7 adds a `/pollux` slash command and an optional UI marker. Both are
extensibility surfaces.

- Spec anchors: §10 Phase 7.
- Forensic anchors: §11 step 7.

### 09 — Policy, Trust, and Safety Engine

If `advisor_consultation` is registered as a tool, does the policy engine gate
it? This answers that.

- Spec anchors: §7 (synthetic tool injection).
- Forensic anchors: §9.3 (tool registry pathways couple to policy).

### 16 — Docs, Specs, and Governance

The spec and implementation plan already contain claims the forensic report
classifies as outdated or contradictory. Analyzing this compartment produces the
doc-alignment plan.

- Forensic anchors: §10 (suggested doc corrections), §1 executive verdict
  ("documents are not 100% technically correct").

---

## Tier 4 — Peripheral (optional or last)

No direct Pollux dependency based on the spec and forensic. Run these for
completeness, not blockers.

### 15 — Build, Packaging, Release, and CI

Pollux lives inside `packages/core/src/pollux/`; existing build pipeline should
pick it up without changes. Confirm, don't assume.

### 10 — Sandbox, Shell, and Filesystem Substrate

Pollux does not change execution substrate. Benchmarks may interact with shell
tools, but that's a benchmark-task concern (covered in 14), not a substrate
concern.

### 13 — Integration Products (SDK, VS Code, A2A, DevTools)

Out of scope for Pollux per spec §2 non-goals. Analyze to confirm no accidental
coupling breaks them.

---

## Recommended execution batches

If running with multiple agents in parallel, these batches are collision- free
(no shared primary paths):

- **Batch α (parallel):** 02, 06, 04
- **Batch β (parallel, after α):** 07, 01
- **Batch γ (parallel):** 03, 08, 11, 14
- **Batch δ (parallel):** 12, 05, 09, 16
- **Batch ε (parallel, optional):** 15, 10, 13

Why this specific batching:

- 02 and 07 both read `client.ts` but on different concerns (lifecycle vs
  routing); the tightened handoff in the guidelines keeps them distinct.
  Splitting them across α and β reduces cognitive overlap.
- 06 touches CLI config files; 04 touches tools; they don't overlap with 02, so
  α can run them together.
- Batch γ compartments all depend on tier-1 findings but don't share primary
  files, so they parallelize cleanly.

---

## How to use this file

1. Start with Tier 1. In `INDEX.md`, claim the row.
2. When tier 1 is complete, read the reports and update `GLOSSARY.md` if any
   term definitions drifted from real code (likely for "router", "loop
   detection", "token logger", "settings").
3. Proceed to tier 2. If any tier 1 finding contradicts a tier 2 guideline's
   "Primary paths", update the tier 2 report's Contradictions section
   accordingly.
4. Continue through tiers 3 and 4.
5. Once >= 12 of 16 are done, run the capstone via
   `_TEMPLATES/cross-compartment-synthesis.md`.
6. The synthesis's **Pollux Integration Readiness Table** (section 5 of that
   recipe) is the final deliverable for an implementation go/no-go.

---

## Sources used to build this ordering

- `POLLUX_SPEC.md` §3 architecture, §5 settings, §7 advisor, §9 benchmark, §10
  roadmap, §12 risks, §14 implementation notes.
- `POLLUX_FULL_FORENSIC_CONTEXT.md` §3 repo reality snapshot, §4–§5 findings
  (F-01 through F-10), §8 contradictions (C-01, C-03), §9 subsystem notes, §10
  suggested corrections, §11 safe implementation sequence, §12 validation
  checklist, §13 evidence index.
