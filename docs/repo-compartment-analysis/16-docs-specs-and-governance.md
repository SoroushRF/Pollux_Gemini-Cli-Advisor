# Compartment 16: Docs, Specs, and Governance

## Purpose

Analyze the repository's intent layer: user docs, technical specs, contribution
rules, security policy, roadmap direction, and governance automation.

This compartment distinguishes implemented behavior from documented intent.

## Boundary

In scope:

- user/developer docs structure,
- spec and plan documents,
- contribution and security policy docs,
- governance metadata (CODEOWNERS, templates, automation workflows),
- doc generation and alignment workflows.

Primary paths:

- `docs`
- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `ROADMAP.md`
- `POLLUX_SPEC.md`
- `IMPLEMENTATION_PLAN.md`
- `POLLUX_FULL_FORENSIC_CONTEXT.md`
- `.github/CODEOWNERS`
- `.github/ISSUE_TEMPLATE`
- `.github/pull_request_template.md`

Out of scope:

- runtime implementation specifics (except for claim verification),
- low-level test behavior,
- package build internals.

## Key Questions To Answer

1. What is documented as intent vs implemented in code?
2. Which docs are user-facing vs contributor-facing vs design/planning?
3. What governance rules influence contribution and review?
4. Where are contradictions or stale claims present?
5. What process is needed to keep docs aligned with code changes?

## Data Gathering Checklist

1. Map docs tree and classify sections.
2. Identify canonical policy and contribution files.
3. Compare specs/plans against current code evidence.
4. Inspect governance templates and CODEOWNERS.
5. Identify doc generation/maintenance scripts and workflows.

## Step-by-Step Analysis Recipe

### Step 1: Classify documentation surfaces

Read:

- `docs/index.md`
- docs subtrees (`cli`, `core`, `reference`, `resources`, etc.)
- top-level `README.md`

Capture:

- audience by section,
- scope and depth by section,
- discoverability gaps.

### Step 2: Analyze contributor and security governance

Read:

- `CONTRIBUTING.md`
- `SECURITY.md`
- `.github/CODEOWNERS`
- issue and PR templates.

Capture:

- contribution expectations,
- security reporting flow,
- ownership and review routing.

### Step 3: Analyze architecture/spec documents

Read:

- `POLLUX_SPEC.md`
- `IMPLEMENTATION_PLAN.md`
- `POLLUX_FULL_FORENSIC_CONTEXT.md`

Capture:

- implemented vs planned claims,
- contradictions and ambiguity points,
- update priority for stale claims.

### Step 4: Cross-check claims with code

For each major claim, cite primary code evidence from relevant compartments.

Do not accept spec text as implementation evidence.

### Step 5: Analyze governance workflows

Inspect `.github/workflows` for docs/review automation and governance jobs.

Capture:

- automated labeling/triage,
- docs rebuild checks,
- stale issue/pr automation effects.

### Step 6: Analyze docs generation scripts

Read:

- `scripts/generate-settings-doc.ts`
- `scripts/generate-settings-schema.ts`
- `scripts/generate-keybindings-doc.ts`

Capture:

- generated-doc ownership,
- regeneration trigger points,
- drift risks.

### Step 7: Build doc health register

Categorize docs into:

- accurate and current,
- partially stale,
- high-priority stale,
- design-only references.

### Step 8: Publish alignment procedure

Define a repeatable process to update docs when code changes.

## What Good Output Looks Like

1. Documentation taxonomy and audience map.
2. Governance and ownership model summary.
3. Claim accuracy matrix (intent vs implementation).
4. Doc drift risk register.
5. Doc-code alignment operating procedure.

## Do and Do Not

Do:

- clearly separate intent text from runtime truth,
- validate high-impact claims with code citations,
- include governance workflow effects on engineering process.

Do not:

- treat roadmap/spec text as implementation status,
- skip ownership and template analysis,
- ignore generated docs and regeneration dependencies.

## Common Failure Modes While Analyzing

- Blending design docs and runtime reality.
- Reporting docs quality without code cross-checking.
- Ignoring governance automation impact.
- Missing generated docs drift risk.

## Handoffs To Other Compartments

- Runtime truth sources -> compartments `01` through `13`
- Testing confidence -> `14-testing-and-evaluation-architecture.md`
- Delivery process context -> `15-build-packaging-release-and-ci.md`

## Definition of Done

This compartment is complete when:

1. Docs and governance surfaces are classified.
2. Major spec claims are validated against code.
3. Ownership and review routing are explicit.
4. Drift risks are prioritized.
5. Alignment procedure is documented and actionable.
