# DeepSWE / Pollux Handoff Prompt - 2026-06-05

Use this prompt to continue the Pollux DeepSWE work in a fresh Codex thread.

## Prompt To Paste

You are Codex working in `C:\Users\sorou\OneDrive\Desktop\Pollux` on Windows
PowerShell. Continue from the current repository and artifact state. Do not
restart from scratch. Read local files and artifacts before making claims. Do
not run paid Gemini model calls unless explicitly asked. Prioritize zero-token
verification, harness correctness, and clear separation between model failures
and infrastructure failures.

### Current Project Context

Pollux is the user's benchmark/harness project around Gemini CLI and Pollux
advisor/executor modes. The user originally wanted to avoid contaminated
SWE-bench and pivot to DeepSWE as a secondary benchmark lane while keeping the
user's own Pollux corpus as primary. DeepSWE is not to be merged into the
primary score. It is a secondary lane used for harder, official, external tasks.

The user has limited Gemini Pro quota. A screenshot during the session showed:

- Flash: about 30 percent used.
- Pro: about 91 percent used.
- Flash Lite: 0 percent.
- A `gemini-3.1-...` line: 0 percent.
- Reset shown around 8:59 PM with roughly 23h 20m remaining at that moment.

This means do not casually rerun E or FD live model samples. Use saved patches
and rescoring whenever possible.

### Important User Preferences And Constraints

- The user is on Windows and wants benchmarks to work on Windows, not only WSL.
- Docker Desktop Linux engine is available from the user's normal PowerShell,
  but sandboxed Codex may need escalation for Docker pipe access.
- Networked dependency preflight/warmup is allowed for verifier infrastructure,
  but live model runs must not start until preflight is clean.
- DeepSWE actual verifier scoring should stay as close to official semantics as
  possible and must record when network/warmup was used.
- Do not count dependency/DNS/npm/Docker failures as model failures.
- Do not rerun E or FD paid model calls until the user approves after quota
  reset or after a specific plan.
- If a saved patch exists, rescore it first. Only rerun a model if the saved
  patch is missing/corrupt or the user explicitly wants fresh samples.

### Original DeepSWE Pivot

The user wanted research on DeepSWE, their website and GitHub, methodology, and
logistics to run DeepSWE through Gemini CLI with Pollux. The important takeaways
that drove implementation:

- DeepSWE uses official task artifacts and reports detailed trajectories,
  metrics, model patches, verifier output, and costs.
- DeepSWE's website presents mini-swe-agent as a fixed model-agnostic harness
  and compares it to native harnesses. The user cared about this because Gemini
  CLI under native harness looked weaker than mini-swe-agent in the site's pilot
  chart.
- The user wanted similar transparency in Pollux: read model trajectories, tool
  calls, patch evolution, costs, calls, verifier output, and compare local
  Gemini CLI/Pollux behavior to official DeepSWE trial logs.
- The user specifically linked:
  - `https://deepswe.datacurve.ai/data/tasks/wazero-multi-module-snapshots`
  - `https://deepswe.datacurve.ai/data/trials/wazero-multi-module-snapshots__H8AsmiS`
- The user wanted to understand if Gemini CLI harness quality, Pollux steering,
  or the model itself caused failures.

### Top-10 DeepSWE Task Selection

The first DeepSWE run set is the top 10 Gemini 3.1 Pro DeepSWE tasks selected
from official DeepSWE artifacts. Initial top 10:

1. `wazero-multi-module-snapshots`
2. `ts-pattern-match-each`
3. `true-myth-iterable-collection-combinators`
4. `testem-per-launcher-reports`
5. `opa-rego-rule-profiling`
6. `ofetch-per-origin-circuit-breaker`
7. `psd-tools-blend-range-api`
8. `ipython-session-bundle-replay`
9. `ytt-jsonpath-query-api`
10. `kombu-single-active-consumer-priority`

There is also a holdout top-20 set, but the user decided not to run holdout
tasks in the first benchmark.

Expected official DeepSWE scale from prior analysis:

- Top-10 Gemini Pro average wall time: about 16.75 minutes per task.
- Top-10 Gemini Pro average output tokens: about 32k per task.
- First full `E,FD,A` top-10 run would be about 30 samples and many hours at
  concurrency 1.

### Condition Semantics

Keep these condition meanings straight:

- `A`: Flash executor, Pollux off.
- `E`: Gemini 3.1 Pro executor, Pollux off.
- `FD`: Flash executor, Pro advisor, detector/advisor lane.
- `F`: Earlier/other Flash naming exists in the project; do not confuse with FD.
  FD is the important Pollux hybrid lane.

The user later decided FD needed to become real steering, not just a tiny
detector/advisor blip. Current FD strict plan:

- Pro advisor should extract contract before executor edits.
- Pro advisor should review risk after big edits or repeated test failures.
- Pro advisor should audit final diff before submission.
- For wazero, a good advisor should have blocked restore-time memory growth and
  enforced `insufficient_memory`.

### Big Decisions And Reversals

- Initial default target was WSL2 Ubuntu because DeepSWE tasks are repo-heavy
  and WSL avoids Windows path/process weirdness.
- The user later insisted Windows must work, so the harness was hardened for
  Windows + Docker Desktop.
- Initial A/FD runs looked "invalid" due provider quota/capacity text.
  Investigation found Flash had transient backend capacity/retry messages,
  Gemini CLI exited 0, and patches existed. Decision: recovered provider
  warnings should not invalidate samples.
- Initial E verifier failures looked like model failures. Investigation found
  Windows CRLF contamination in `tests/test.sh` mounted into Linux Docker.
  Decision: normalize verifier inputs to LF and use normalized copies.
- One E true-myth sample had Gemini CLI non-interactive shell confirmation/tool
  policy text but still produced a patch. Decision: recovered tool-policy text
  should be a warning if exit 0 and patch exists; verifier decides.
- The user initially thought E had 1/3 on wazero because they thought wazero had
  been run three times. Correction: the top-3 run was three different tasks once
  each. E passed wazero after rescore.
- The user asked whether to do more samples of same task or new tasks while
  waiting for quota reset. Decision: do no paid sampling; first fix infra and FD
  steering, then use zero-token rescore and analysis.
- The user agreed with improving FD checkpoints before more FD runs.

### Paid Runs Already Performed

Top-3 task order:

- offset 0: `wazero-multi-module-snapshots`
- offset 1: `ts-pattern-match-each`
- offset 2: `true-myth-iterable-collection-combinators`

Live paid/model runs:

- `deepswe-top3-a-r1`
- `deepswe-top3-fd-r1`
- `deepswe-top3-e-r1`

Approx local original summary token/call data from `*.summary.json`:

E original:

- wazero: executorTokens 570,134; apiResponses 23; patch chars 12,615;
  originally verifier infra invalid due old verifier/CRLF path, later rescored
  clean pass.
- ts-pattern: executorTokens 982,430; apiResponses 32; patch chars 15,944; still
  verifier infra due npm/npx dependency behavior.
- true-myth: executorTokens 3,304,286; apiResponses 76; patch chars 236,605;
  originally tool policy invalid, now recovered warning plus verifier infra.

A original:

- wazero: executorTokens 1,071,013; apiResponses 28; patch chars 18,755;
  originally provider failure invalid, later rescored and showed real failure on
  hidden verifier.
- ts-pattern: executorTokens 1,935,662; apiResponses 38; patch chars 18,220;
  originally provider failure invalid.
- true-myth: executorTokens 3,349,601; apiResponses 67; patch chars 19,449;
  originally provider failure invalid.

FD original:

- wazero: executorTokens 919,808; advisorTokens 1,570; totalTokens 921,378;
  apiResponses 22; patch chars 22,484; originally provider failure invalid,
  later rescored and showed real failure on hidden verifier.
- ts-pattern: executorTokens 5,321,212; advisorTokens 1,437; totalTokens
  5,322,649; apiResponses 84; patch chars 295,962.
- true-myth: executorTokens 6,495,155; advisorTokens 2,748; totalTokens
  6,497,903; apiResponses 66; patch chars 36,825.

Key interpretation:

- FD advisor usage was tiny compared with executor tokens, so old FD was not
  meaningfully steering.
- A and FD failures on wazero were real after rescore: they changed memory
  restore behavior incorrectly, especially around `mem.Grow`.
- E passed wazero after verifier fixes. This supports that Pro can solve wazero
  locally under Gemini CLI for that one sample.

### Important Artifact Runs

DeepSWE artifact root:

- `artifacts/pollux/deepswe-runs/`

Important run directories:

- `deepswe-top3-a-r1`
- `deepswe-top3-fd-r1`
- `deepswe-top3-e-r1`
- `deepswe-gold-wazero-verifier-canary`
- `deepswe-gold-wazero-verifier-canary-002`
- `deepswe-top3-a-r1-rescore-002`
- `deepswe-top3-fd-r1-rescore-002`
- `deepswe-top3-e-r1-rescore-001`
- `deepswe-top3-e-r1-rescore-005`
- `deepswe-top3-e-r1-rescore-006`
- `deepswe-top3-e-r1-rescore-007`

Most meaningful latest E rescore:

- `artifacts/pollux/deepswe-runs/deepswe-top3-e-r1-rescore-007`
- Summary:
  - total 3
  - valid_for_score 1
  - invalid 2
  - resolved 1
  - unresolved 0
  - verifier_infra_failures 2
  - invalidation_reasons: `verifier_infra_failure: 2`
  - warnings: `tool_policy_confirmation_recovered: 1`

Per-task latest E rescore result:

- `wazero-multi-module-snapshots`: `resolved`, valid for score, verifier
  baseline exit 0, new tests exit 0, verifier exit 0.
- `ts-pattern-match-each`: `invalid`, `verifier_infra_failure`, dependency
  failure, baseline exit 1, new tests exit 1, patch applied.
- `true-myth-iterable-collection-combinators`: `invalid`,
  `verifier_infra_failure`, dependency failure, baseline exit 1, new tests exit
  1, patch applied, warning `tool_policy_confirmation_recovered`.

The Node infra failure evolved:

- Earlier: `EAI_AGAIN getaddrinfo registry.npmjs.org`.
- After warmup/cache/offline changes: `ENOTCACHED`, meaning npm in network-off
  verifier still tries `npx jest` or `npx vitest` and cannot satisfy the
  unversioned package metadata from cache.
- Conclusion: classification is now honest, but Node tasks still need a better
  verifier dependency strategy before they can become true pass/fail offline.

### DeepSWE Runner Implementation State

The DeepSWE runner files currently show as untracked in `git status`, likely
because they were introduced during the DeepSWE work but never staged:

- `scripts/pollux-deepswe-runner.mjs`
- `scripts/pollux-deepswe-runner-lib.mjs`
- `scripts/tests/pollux-deepswe-runner-lib.test.js`

Important implemented behavior:

- DeepSWE manifest and top-10/holdout support were added earlier.
- Runner supports modes:
  - preflight
  - prepare
  - smoke
  - run
  - rescore
  - summarize
- Package scripts exist:
  - `benchmark:pollux:deepswe:preflight`
  - `benchmark:pollux:deepswe:prepare`
  - `benchmark:pollux:deepswe:smoke`
  - `benchmark:pollux:deepswe:run`
  - `benchmark:pollux:deepswe:rescore`
  - `benchmark:pollux:deepswe:summarize`
- Rescore mode reuses saved `model.patch`, creates a clean worktree, applies the
  saved patch, applies verifier patch, runs verifier, and does not invoke Gemini
  CLI.
- Windows CRLF verifier input normalization exists.
- Provider/tool-policy recovered-warning behavior exists.
- Docker verifier artifacts and normalized tests are saved under raw sample
  artifacts.

Latest hardening added:

- `--dependency-preflight`
- `--dependency-warmup`
- `--networked-verifier-preflight`
- `--fd-profile detector|strict`
- Default DeepSWE FD profile is `strict`.
- `buildDeepSweConditions(fdProfile)` returns strict FD by default and detector
  FD if requested.
- `classifyVerifierResult` recognizes dependency/network/package-manager
  failures.
- Metadata fields:
  - `verifier_baseline_exit_code`
  - `verifier_new_tests_exit_code`
  - `verifier_failure_kind`
  - `verifier_dependency_failure`
  - `verifier_invalidation_reason`
- Summary separates:
  - resolved
  - unresolved model failures
  - invalid samples
  - verifier infra failures
  - patch apply failures
  - recovered warnings
- Dependency preflight inspects both `tests/test.sh` and `tests/test.patch`,
  because DeepSWE's outer verifier script often creates the real task-level
  `/app/test.sh` via `test.patch`.
- Dependency preflight/warmup saves:
  - `dependency-preflight.json`
  - per-task stdout/stderr
  - `dependency-preflight-command.json`
  - cache directories
- Verifier containers can mount warmed dependency cache.
- Verifier uses `npm_config_offline=true` when warmed cache is mounted. This
  caused clearer `ENOTCACHED` rather than DNS, but did not fully solve Node
  verifier offline execution.
- Git cached repo handling was hardened for Windows:
  - `safe.directory` overrides for bare repos.
  - `core.longpaths` config writes are best-effort for existing caches owned by
    normal Windows user.

### FD Strict Steering Implementation

FD strict settings:

- `advisorTriggerMode: "hybrid"`
- `advisorBudgetMode: "fixed"`
- `maxAdvisorCallsPerTurn: 3`
- `maxAdvisorCallsPerSession: 8`
- `maxAdvisorCallsShortTask: 3`
- `maxAdvisorCallsLongTask: 5`
- same-turn escalations enabled
- diagnostic traces include advisor guidance text where supported

FD prompt adds mandatory checkpoint instructions:

- Before first source edit:
  - `<pollux:advisor_request reason="contract extraction before source edit" timing="now"/>`
- After substantial source edits or repeated failed tests:
  - `<pollux:advisor_request reason="mid-run risk review after edits or failed tests" timing="now"/>`
- Before final completion:
  - `<pollux:advisor_request reason="final diff audit before completion" timing="now"/>`

Task-specific contract checklist:

- Generated from `instruction.md`.
- Saved as `contract-checklist.json` in raw sample artifacts.
- Included in FD prompt.
- Includes required APIs, explicit error conditions, forbidden behaviors,
  expected verification focus, and final-diff hazards.

Wazero special checklist:

- Restore target memory must already be large enough.
- Do not grow target memory during restore.
- Return an error whose `ErrorCode(err)` is `insufficient_memory`.
- The final hazard was narrowed to flag nonzero/variable `mem.Grow(...)`, while
  allowing `mem.Grow(0)` size checks.

### Verifier / Node Dependency Problem Still Open

The current blocker for `ts-pattern` and `true-myth` is not model scoring. It is
verifier infra:

- DeepSWE verifier network is intended to be off.
- The task-level hidden `test.sh` uses `npx jest` or `npx vitest`.
- Networked warmup can run:
  - `npm view jest`
  - `npm exec --yes --package jest jest -- --version`
  - `npm view vitest`
  - `npm exec --yes --package vitest vitest -- --version`
- But the later network-off verifier still calls unversioned `npx jest` /
  `npx vitest`.
- With `npm_config_offline=true`, npm fails with `ENOTCACHED`.

Do not count this as model unresolved. It is `verifier_infra_failure`.

Potential next engineering options:

1. Mount a task-specific npm cache and rewrite or wrap npx resolution inside the
   verifier environment without modifying hidden test semantics too much.
2. During verifier setup, use a wrapper `npx` on PATH that resolves
   `jest`/`vitest` from the warmed npm exec cache or from a preinstalled global
   package in a mounted directory.
3. Run an official-comparable but explicitly networked verifier mode for Node
   tasks and mark it as non-official/networked-verifier. This may be acceptable
   for diagnosis, not for final official-comparable scoring.
4. Investigate DeepSWE images to see whether they should already contain package
   deps and whether our worktree/cache mounting prevents their expected package
   setup.
5. Inspect official DeepSWE task image behavior and mini-swe-agent verifier
   behavior for these Node tasks if available locally or from their artifacts.

### Commands Already Verified

These passed after latest changes:

```powershell
npm.cmd run test:scripts -- pollux-deepswe-runner-lib
npm.cmd run test:scripts -- pollux-swebench-runner-lib
node --check .\scripts\pollux-deepswe-runner.mjs
node --check .\scripts\pollux-deepswe-runner-lib.mjs
```

No-token dependency preflight/warmup command:

```powershell
npm.cmd run benchmark:pollux:deepswe:preflight -- --limit 3 --conditions E --allow-non-wsl --scratch-root C:\tmp\pollux-deepswe --deepswe-repo C:\tmp\deep-swe --dependency-warmup --networked-verifier-preflight
```

Meaningful no-token E rescore command, run outside sandbox with Docker access:

```powershell
npm.cmd run benchmark:pollux:deepswe:rescore -- --source-run deepswe-top3-e-r1 --run-id deepswe-top3-e-r1-rescore-007 --conditions E --limit 3 --allow-non-wsl --scratch-root C:\tmp\pollux-deepswe --deepswe-repo C:\tmp\deep-swe --dependency-warmup --networked-verifier-preflight
```

If Codex sandbox cannot access Docker Desktop, rerun with escalation or have the
user run in normal PowerShell. Sandbox Docker failures looked like:

- `Access is denied` on `C:\Users\sorou\.docker\config.json`
- `permission denied while trying to connect to the docker API at npipe:////./pipe/docker_engine`

Those sandbox failures are not meaningful benchmark results.

### Current Git State

Current branch:

- `main`

Recent commits:

- `b1d40b544 docs(pollux): relabel v1.3 calibrated tasks`
- `e4c5be68a test(pollux): harden v1.3 benchmark tasks after calibration`
- `df2dc8c1e test(pollux): add v1.3 hard tasks and validation`
- `d521c8769 test(pollux): add v1.3 medium benchmark tasks`
- `c171f4244 docs(pollux): add v1.3 hardening metadata`
- `0517e9fae feat(pollux): support v1 tasks in real pilot runner`
- `08dfccae2 docs(pollux): materialize v1 solution patches`
- `37be2a90e feat(pollux): add v1 stratified benchmark corpus`
- `deabdf38c fix(pollux): enable long paths for SWE checkouts`
- `26f1330c5 fix(pollux): harden SWE runner ceilings`
- `50d4b4f6b fix(pollux): guard external fake response canaries`
- `cb3a34cd6 fix(pollux): resolve fake response paths for SWE canaries`
- `f337104a1 feat(pollux): harden SWE benchmark runner`
- `3e545e313 feat(pollux): add diagnostic trace and advisor hardening`
- `a1c171a04 test(pollux): refresh FR vs FD benchmark diagnostics expectations`
- `73401167b fix(pollux): suppress duplicate detector advisor consults`
- `8e8e7a3b8 test(pollux): add executor-request smoke coverage`
- `ada4499a5 feat(pollux): strengthen executor-request advisor priming`
- `c42222d91 docs(pollux): align real benchmark ceiling guidance with default 15`
- `e8860943c feat(pollux): raise real benchmark default response ceiling to 15`

Worktree is dirty. Do not revert anything. Many files are modified/untracked
from broader Pollux v1/v1.3 calibration and DeepSWE work.

Modified tracked files include:

- `benchmarks/pollux-v1/README.md`
- many `benchmarks/pollux-v1/tasks/*/review.json`
- `docs/core/pollux/P4-03_SMOKE_BENCHMARK_REPRODUCIBILITY.md`
- `docs/core/pollux/P4-05_BENCHMARK_METRICS_REPORT.md`
- `docs/core/pollux/P4-06_FAIRNESS_AUDIT_LOG.md`
- `docs/core/pollux/P4-09_REAL_BENCHMARK_OPERATOR_PLAYBOOK.md`
- `docs/core/pollux/P4-16_MILESTONE_3_PRODUCT_VALUE_BENCHMARK_HANDOFF.md`
- `docs/core/pollux/P4-17_MILESTONE_3_CALIBRATION_AND_VALUE_PROTOCOL.md`
- `docs/core/pollux/P4-20_POLLUX_V1_STRATIFIED_BENCHMARK.md`
- `package.json`
- `packages/cli/src/config/settingsSchema.ts`
- `packages/cli/src/config/settingsSchema.test.ts`
- `packages/core/src/core/client.ts`
- `packages/core/src/core/client.test.ts`
- `packages/core/src/pollux/benchmark/polluxV1Tasks.ts`
- `packages/core/src/pollux/benchmark/realTasks.ts`
- `packages/core/src/pollux/benchmark/realTypes.ts`
- `packages/core/src/pollux/diagnosticTrace.ts`
- `packages/core/src/pollux/diagnosticTrace.test.ts`
- `packages/core/src/pollux/observer/calibration.ts`
- `packages/core/src/pollux/observer/fusion.test.ts`
- `packages/core/src/pollux/prompts.ts`
- `packages/core/src/pollux/prompts.test.ts`
- `packages/core/src/pollux/types.ts`
- `packages/core/src/pollux/types.test.ts`
- `packages/core/src/telemetry/types.ts`
- `packages/test-utils/src/benchmark-harness.ts`
- `packages/test-utils/src/pollux-live-run-rig.ts`
- `packages/test-utils/src/pollux-live-run-rig.test.ts`
- `packages/test-utils/src/pollux-real-acceptance.test.ts`
- `packages/test-utils/src/pollux-real-config.ts`
- `packages/test-utils/src/pollux-real-pilot.ts`
- `packages/test-utils/src/pollux-real-preflight.test.ts`
- `packages/test-utils/src/pollux-real-report.ts`
- `packages/test-utils/src/pollux-real-report.test.ts`
- `packages/test-utils/src/pollux-real-types.ts`
- `scripts/pollux-swebench-runner-lib.mjs`
- `scripts/tests/pollux-swebench-runner-lib.test.js`

Important untracked additions include:

- `scripts/pollux-deepswe-runner.mjs`
- `scripts/pollux-deepswe-runner-lib.mjs`
- `scripts/tests/pollux-deepswe-runner-lib.test.js`
- `evaluation_results/deepswe-top20-gemini-3.1-pro.json`
- many `evaluation_results/pollux-swe-lite-15/...` runs/repos/evals
- many new `benchmarks/pollux-v1` calibration files and brutal task directories
- `benchmarks/pollux-v1/difficulty-rubric.md`
- `benchmarks/pollux-v1/relabel-log.v1.2.json`
- `benchmarks/pollux-v1/selected-task-set.v1.1.json`
- `benchmarks/pollux-v1/selected-task-set.v1.2.json`
- `benchmarks/pollux-v1/v1.2-calibration.md`
- `docs/core/pollux/P4-13_REAL_BENCHMARK_PRICING_SNAPSHOT_2026-04-30-LITE.json`
- `docs/core/pollux/P4-18_MILESTONE_3_HARD_TASK_FACTORY_GUIDE.md`
- `docs/core/pollux/P4-19_MILESTONE_3_CONTEXT_EXPORT_2026-04-26.md`
- `logs/`
- `packages/core/src/sandbox/windows/GeminiSandbox.exe`

Use `git status --short` and `git diff --stat` again before editing. Avoid
touching unrelated dirty files unless the user asks.

### What To Do Next

If the user asks "what next":

1. Do not run paid model calls yet.
2. Decide how to handle Node verifier infra:
   - Either implement an explicit Node verifier dependency strategy.
   - Or exclude Node tasks from the next paid DeepSWE batch until verifier is
     official-comparable.
3. Run no-token rescore for A/FD again only if needed after any verifier
   changes.
4. Inspect FD strict generated settings/prompt before any paid FD run.
5. For the next paid FD run after quota reset, start with one task only,
   preferably wazero, because:
   - E solved it.
   - A/old FD failed it.
   - The expected advisor intervention is concrete: block restore-time memory
     growth and require `insufficient_memory`.
6. Only after one strict-FD sample shows actual advisor checkpoints in trace
   should more FD tasks be run.

### Do Not Forget

- The user was upset about lost prior conversation. Be direct and careful; do
  not invent missing history.
- The user wants deep technical audit, not generic reassurance.
- Always distinguish:
  - model failure
  - recovered provider warning
  - recovered tool-policy warning
  - verifier infra failure
  - patch apply failure
  - response ceiling kill
- Preserve artifacts. They are expensive.
- Do not merge DeepSWE results with the primary Pollux corpus.
- Do not treat Node verifier `EAI_AGAIN` or `ENOTCACHED` as model unresolved.
- The current DeepSWE FD strict implementation is code-level ready, but not yet
  validated by a paid FD live run.
