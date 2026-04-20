# Detector Redesign — Brainstorm Notes

Status: brainstorming notes, not a spec. Captures a design conversation about
rethinking the Pollux escalation detector around live executor observation
instead of prospective user-input classification. Nothing here is committed.

> **Execution plan:** see
> [`DETECTOR_IMPLEMENTATION_PLAN.md`](./DETECTOR_IMPLEMENTATION_PLAN.md) for the
> phased, file-level, test-backed build plan derived from these notes. This
> document remains the conceptual north star; the plan is the delivery contract.

---

## 0) The reframe (the thesis)

The current detector (`packages/core/src/pollux/detector.ts`) is
**prospective**: it inspects `userContentDigest` and `pendingToolContext` (the
user's wording plus the prior tool result) and tries to predict whether the
upcoming turn will need help. That's the wrong window.

The whole point of Pollux is to **measure** when the executor is failing and
escalate at that moment. The primary signal should be the executor's own
behavior in the current turn — its thought stream, its tool-call patterns, its
output telemetry. The user's text becomes a mild prior, not the main input.

Architecturally this means the gate stops being a single function called once
before `processTurn` and becomes a `LiveExecutorWatcher` that runs alongside the
stream. `summarizeRequestForDetector` shrinks to a context-only contributor or
is deleted entirely.

Spec ramifications: this would be a Phase 4 redesign warranting its own section
— provisionally `POLLUX_SPEC §7.5 Live executor observation` — with the same
rigor as §7 (deterministic feature extraction, bounded buffers, fail-open
semantics, baseline-purity contract).

---

## 1) Signal taxonomy

Five tiers, each one a sensor category. The fusion layer (§2) decides what to do
with their combined output.

### Tier 1 — Read the mind (the `Thought` stream)

The Gemini API already emits `part.thought = true` chunks. They land in the CLI
as `ServerGeminiThoughtEvent` (`packages/core/src/core/turn.ts:307–319`) and
feed `setThought(...)` in `packages/cli/src/ui/hooks/useGeminiStream.ts:1444`.
The detector currently ignores them. Features that can be computed from the
stream with no extra LLM calls:

**Lexical**

- **Hedge density**: ratio of hedging tokens (`maybe`, `perhaps`, `I think`,
  `might`, `let me try`, `actually`, `wait`, `hmm`) per 100 thought tokens.
- **Self-contradiction tokens**: `actually no`, `wait that's wrong`,
  `scratch that`, `on second thought`, etc.
- **Negative self-talk**: `this isn't working`, `I can't figure out`,
  `I keep getting`, `that didn't help`.

**Structural**

- **Subject loop** (highest value): track the last N `ThoughtSummary.subject`
  strings; if the same subject (or near-duplicate by Levenshtein/embedding)
  recurs ≥3 times in a turn, the model is visibly going in circles.
- **Subject drift**: cosine distance between the running thought-subject
  centroid and the original user prompt embedding. Increasing drift = losing the
  plot.
- **Plan oscillation**: extract verbs from each subject; A-B-A-B patterns
  (`read → edit → revert → read → edit → revert`) signal indecision.
- **Thought-to-action ratio**: thoughts emitted vs tool calls + content tokens
  emitted. Lots of thinking, no doing = analysis paralysis.

**Temporal / streaming**

- **Thought entropy spike**: number of distinct subjects per minute suddenly
  increases.
- **Thought stall**: same subject twice with longer descriptions = elaborating
  on the same problem instead of solving it.
- **Time-since-last-tool-call**: monologue past a threshold without committing.

**Semantic (embeddings, optional)**

- Embed every thought subject; rolling window cluster-loop detection.
- Track thought↔prompt similarity vs thought↔tool-error similarity. If the
  former drops while the latter rises, the model has been pulled off course by
  an error and is digging in.

### Tier 2 — Read the body language (tool calls + outputs)

- **`LoopDetectionService` → detector** (instead of just halting the turn). The
  service at `packages/core/src/services/loopDetectionService.ts` already has a
  0.85+ precision signal we throw away.
- **Identical-tool-call repeat**: same tool name + args (or trivially mutated
  args like offset+1) called N times.
- **Tool result ignored**: model calls `read_file`, response arrives, next
  thought/content references no token from it.
- **Backtrack pattern**: edit → read → edit back to original.
- **Exit-code regression**: shell exit code oscillates 1 → 0 → 1 → 0.
- **Search-without-decide**: ratio of read-only tools (`read_file`, `grep`,
  `glob`) to mutating tools (`edit`, `run`). Caveat: needs prompt conditioning —
  pure-exploration tasks ("explain how X works") would false-trigger; only
  counts when the user prompt looks non-exploratory (verbs like `fix`,
  `implement`, `add`, `make it work`). Must require a corroborating signal from
  another category before it counts on its own.
- **Tool failure cascade**: ≥3 consecutive non-zero exits or schema errors
  across any combination of tools.
- **Token burn rate**: this turn has consumed >2× the median tokens of
  successful turns from this session.

### Tier 3 — Ask the executor itself

Cheap models are surprisingly good at meta-cognition when given an explicit
channel. Without a channel they default to projecting confidence.

- **`<pollux:status stuck_on="..." next="..."/>` structured emission**. Better
  than a binary `<pollux:request_help/>` token: the structure resists model
  confidence-projection because the model has to fill in `stuck_on` even when
  feeling fine, which surfaces uncertainty naturally. Prime the system prompt
  with concrete usage examples or it will never fire.
- **Asymmetric self-confidence**: keep `<pollux:confidence:N>` but treat it as
  **one-sided** — only low scores (≤3) count. The model has no incentive to
  falsely declare low confidence; it has every incentive to inflate. The "7s
  problem" (RLHF-induced mode collapse to safe-middle scores) goes away because
  we ignore inflated scores.
- **Falsifiable self-check** (event-driven, not periodic): when another signal
  trips, inject "name one assumption you're making that could be wrong" or
  "describe what would prove this approach won't work." Concrete artifacts are
  harder to fake than scalars. Inability to produce one _is_ the signal.
- **Pre-mortem at planning time**: after the first plan/thought, ask Flash-Lite
  to score "Does this plan look risky/wrong? low/med/high." The score becomes a
  turn-level prior.

Reject the **periodic 1-10 self-check** — it gets gamed with 7s.

### Tier 4 — Cross-turn / longitudinal

The current detector has amnesia between turns. Memory is free intel.

- **Question repetition**: current user message ≥0.85 cosine similar to a
  previous message in the same session = "you didn't get it." Strong signal.
- **Frustration arc**: sentiment trajectory across the session going negative
  lowers the threshold.
- **Time-on-task**: turn N where N>5 with no resolution = floor-raise.
- **Sunk-cost gate**: this turn has burned >X tokens / Y seconds / Z tool calls
  without an "I'm done" signal.
- **Topic memory**: if the user touched this file earlier and the executor
  failed, escalate at lower threshold this turn.
- **Per-tool failure history**: this session, `run_tests` returned non-zero 4
  times → flag the _tool_ (not the turn) and bias up.

### Tier 5 — Blast radius (asymmetric risk)

Some turns are cheap to be wrong about; others are catastrophic. This was
implicitly missing from v1 entirely.

- **Risk-weighted threshold**: pending tool is `delete`, `git push`,
  `db migrate`, `policy.write`, `shell run` with `rm -rf` etc. → drop the
  threshold to ~0. Always escalate before high-blast-radius actions. The most
  defensible Pro spend imaginable.
- **File count gate**: planned edit touches >N files or crosses package
  boundaries → escalate.
- **Production heuristic**: production-flavored paths (`/etc`, top-level
  `package.json` deps, `.env`, `migrations/`) → escalate.
- **Reversibility prior**: irreversible side effects (network write, DB write,
  file delete) get a much harsher gate than reversible ones.

---

## 2) The fusion layer (precision is the unsolved problem)

A pile of OR-ed signals torches the Pro budget. The fusion layer is what turns
recall into a usable system.

### 2.1 Per-signal precision priors

Every signal carries two numbers: **weight** when it fires, and **precision
prior** P(turn-truly-needed-escalation | signal fired). Hand-set conservatively
to start; relearn from outcome telemetry once it exists.

| Signal                                            | Weight     | Precision prior |
| ------------------------------------------------- | ---------- | --------------- |
| `LoopDetectionService` triggered                  | 3          | 0.85            |
| Subject-loop (≥3 near-duplicate thought subjects) | 2          | 0.75            |
| `<pollux:status stuck_on=...>` non-trivial        | 3          | 0.95            |
| Tool failure cascade (≥3 non-zero exits)          | 2          | 0.80            |
| Search-without-decide (8 reads, 0 mutations)      | 1          | 0.45            |
| Hedge density above threshold                     | 1          | 0.40            |
| Self-contradiction token                          | 1          | 0.55            |
| Risk gate (rm -rf, push, migrate, etc.)           | hard floor | n/a             |

Anything below ~0.5 precision **must not fire alone**.

### 2.2 Composite evidence requirement

Require ≥2 independent signal categories (Tier 1 thought / Tier 2 action / Tier
3 self-report / Tier 4 longitudinal) before escalating, except for
high-precision triggers (loop detector, structured self-help, risk gate). This
single rule probably handles 80% of the precision concern. Multiple signals from
the same category are correlated and shouldn't double-count.

### 2.3 Negative signals (de-escalators) — the missing half of v1

The current detector only accumulates evidence _for_ escalation. It needs
evidence _against_. Net score = positive − negative.

- Last tool call returned exit code 0 → −1
- Last `Thought.subject` is concrete and action-oriented
  (`Editing line 42 of foo.ts`) → −1
- Executor just produced a confident final-looking response (length above N, no
  hedges) → −2
- Recent successful advisor consultation in last K turns → −1 (cooldown)
- Within first 2 tool calls of the turn (too early to know) → −1

### 2.4 Time decay

Hedges from 30s ago shouldn't count the same as hedges from now. Apply
exponential decay (half-life ~15s of model output) to all soft signals. Hard
signals (loop detector, structured self-help) don't decay.

### 2.5 Budget-targeted threshold (the operator lever)

Don't pick `minScore` and pray. Pick a **target escalation rate** (e.g. 5% of
turns), measure actual rate, float the threshold to match.

- Operator-friendly: "spend Pro on my hardest 5% of turns" is a meaningful
  business statement; "set minScore to 2.7" is not.
- Auto-corrects for drift: a Flash upgrade that improves baseline quality raises
  the threshold automatically.

### 2.6 Outcome-labeled retraining loop

Every advisor consultation gets a delayed positive/negative label from UI oracle
signals (§3). After ~1000 labeled consultations per surface, replace hand-tuned
weights with a logistic regression fit on the labels. Features stay
interpretable; precision priors become _measured_.

---

## 3) UI feedback as oracle (free training labels)

User behavior in the UI is signal currently thrown away. Each event is a delayed
label on the prior turn:

- ESC mid-stream → "stop, this is wrong" (negative)
- Scroll back → "I'm trying to understand where you went wrong" (weak negative)
- Edit-then-accept on a diff → "almost right, you missed something" (mixed)
- Retype same prompt → "you didn't get it" (strong negative)
- New unrelated request → "you got it" (positive)
- Explicit "no", "wrong", "that's not right" → strong negative

Collect these passively first (don't act on them). Once a corpus exists, they
become the training data for §2.6.

---

## 4) Architectural inversions worth prototyping later

Not for first build. Keep on the table.

- **Continuous shadow advisor**: run advisor in parallel on every Nth turn for
  free; compare its plan to the executor's. Empirical recall metric generated by
  real traffic, not a synthetic corpus.
- **Speculative escalation**: when a Tier 1/2 signal trips, kick off the advisor
  _while the executor keeps streaming_. If executor finishes confidently,
  discard. Pure latency win.
- **Branch-and-merge**: on strong escalation, fork the turn — Branch A finishes
  with executor; Branch B uses advisor guidance. Fast judge picks the winner.
  Token-expensive; reserve for highest-confidence escalation.
- **Self-consistency vote**: at moment of detected uncertainty, run Flash twice
  with different temperatures. Disagreement = escalate. Cheapest possible second
  opinion.
- **Implicit advisor (no separate model)**: when detector fires, re-prompt the
  same executor with a structured "you've been struggling" preamble + forced
  think-aloud + plan-then-execute. Often that's enough; reserve the Pro call for
  when _that_ still fails.
- **Tiered cascade**: 1) self-consistency vote → 2) Flash-Lite mini-critic → 3)
  Flash mid-critic → 4) Pro heavy critic. Each rung filters; Pro is reached only
  with overwhelming prior.
- **Reverse polarity (autopilot mode)**: on hard tasks, advisor produces a
  one-shot plan and the executor merely executes deterministically. The detector
  chooses pilot vs autopilot at turn start.

---

## 5) Build order (precision-aware reordering)

1. **Risk gate (Tier 5)** — one day. High precision by construction. Defensible
   Pro spend.
2. **`LoopDetectionService` → detector** — one day. Signal already exists at
   high precision; we're just rerouting it.
3. **`<pollux:status stuck_on=... next=...>` structured emission** in the
   executor system prompt — days. Opens the self-report channel in a form that
   resists confidence-projection.
4. **Subject-loop + hedge density + self-contradiction**, gated by
   composite-evidence rule (must corroborate with a Tier 2 signal) — week.
5. **Negative signals + time decay + budget-targeted threshold** — week. This is
   what actually stops the system from blowing up the bill.
6. **Outcome telemetry collection** (collect, don't act) — days.
7. **Speculative escalation, tiered cascade, learned weights** — only after step
   6 has produced data.

---

## 6) Success metric change

The current calibration corpus (`packages/core/src/pollux/calibration.test.ts`)
measures "does the detector escalate when a labeler said it should?" That's
recall on a synthetic dataset. The metric that justifies Pro spend to anyone
paying the bill is:

- **Precision**: of advisor consultations that fired, what fraction did the user
  signal as valuable (via §3 oracle signals)?
- **Recall**: of user-rejected turns (cancel, retype, "no", etc.), what fraction
  did we _fail_ to escalate on?

The synthetic corpus stays useful as a regression guard. The real metric becomes
the dashboard the project is judged by.

---

## 7) Open questions

- Where does the `LiveExecutorWatcher` live in the file layout? Probably a new
  `packages/core/src/pollux/observer/` directory with one file per sensor
  category (thought-stream sensor, tool-pattern sensor, self-report sensor,
  longitudinal sensor) and a fusion file.
- ~~How do we keep determinism when sensors observe a streaming source? Likely
  buffer to turn boundary, evaluate fusion once at the gate, but allow
  speculative-escalation kick-off mid-stream.~~ **Resolved 2026-04-20** (see
  `DETECTOR_IMPLEMENTATION_PLAN.md` §2a Timing policy and `POLLUX_SPEC.md`
  §7.5). Policy: hybrid timing. Hard-precision signals (risk gate, hard loop,
  structured self-report) and emphatic fusion composites
  (`netScore ≥ sameTurnThreshold` with ≥2 categories) pause at an event boundary
  and invoke the advisor **same-turn**. Everything else queues a next-turn
  intent. One same-turn escalation per turn maximum; policy channel + budget +
  fail-open unchanged. Not to be confused with speculative escalation (deferred
  to a follow-up plan) — same-turn here is pause-then-invoke, not parallel.
- Baseline-purity contract: when Pollux is off, the watcher must be a no-op with
  zero allocations on the hot path. This is testable and should be required from
  day one.
- How do `<pollux:status>` emissions affect token accounting and the
  reconciliation tests in
  `docs/core/pollux/P3-06_TELEMETRY_RECONCILIATION_REPORT.md`? Tags must be
  stripped before user-visible output, mirroring the existing
  `stripPolluxConfidenceTags` contract.
- Does the budget-targeted threshold need separate caps per surface (legacy
  interactive vs ACP vs agent session)? Almost certainly yes.

---

## 8) References

- Current detector: `packages/core/src/pollux/detector.ts`
- Current heuristic rules: `DEFAULT_HEURISTIC_RULES` in same file
- Current calibration tuning guide:
  `docs/core/pollux/P3-05_ESCALATION_CALIBRATION_TUNING_GUIDE.md`
- Spec contract for detector: `POLLUX_SPEC.md` §7
- Thought stream plumbing: `packages/core/src/core/turn.ts:307–319`,
  `packages/cli/src/ui/hooks/useGeminiStream.ts:1444`,
  `packages/core/src/utils/thoughtUtils.ts`
- Loop detection (currently halts, candidate to reroute):
  `packages/core/src/services/loopDetectionService.ts`
- Detector integration seam: `packages/core/src/core/client.ts:719–891`
  (`maybeRunPolluxAdvisorConsultation`)
