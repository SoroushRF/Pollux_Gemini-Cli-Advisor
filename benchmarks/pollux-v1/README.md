# Pollux v1 Stratified Agentic Coding Benchmark

Pollux v1 is a custom synthetic benchmark for small agentic coding tasks. It is
SWE-bench-inspired, but it is not SWE-bench and should not be described as a
replacement for broad open-source software engineering evaluation.

The suite contains 15 frozen tasks across five task families and three
difficulty levels:

1. cross-file contract repair
2. test-intent / edge-case bugfix
3. guarded migration / compatibility
4. source-of-truth conflict resolution
5. multi-artifact consistency

Each family has one easy control, one medium task, and one hard task. The final
claim protocol is 15 tasks x 3 tracks x 5 repeats = 225 runs across:

1. A: Flash baseline, Pollux disabled
2. E: Pro baseline, Pollux disabled
3. FD: Flash executor with detector-guided Pro advisor

The benchmark uses executable hidden tests. Regex or string-shape checks are not
the primary oracle. A task passes only when fail-to-pass tests, pass-to-pass
tests, and protected-file hash checks all pass.

Hidden tests must not be present in the live agent workspace while the agent is
solving. The live runner verifies Pollux v1 tasks in an isolated clone so
early-stop oracle checks cannot leak hidden tests into the candidate workspace.

Difficulty labels are assigned by the static rubric in `difficulty-rubric.md`,
then sanity-checked with A/E calibration. Flash or Pro outcomes may flag a task
for review, but model outcomes are not the definition of difficulty.

## Anti-Bias Protocol

The final benchmark suite is selected by task family and difficulty before final
FD evaluation. A/E calibration is used only to validate difficulty labels and
remove flaky or invalid tasks. FD results must not be used to select the final
task set.

Pollux v1.1 is the intended post-calibration freeze. It should be finalized only
after hidden-test isolation, rubric review metadata, and A/E calibration have
been reviewed. FD must not be run for final value claims until that freeze is
complete.

## Allowed Claims

It is acceptable to claim that this benchmark evaluates detector-guided hybrid
execution on a frozen, stratified set of small agentic coding tasks.

Do not claim that Pollux v1 proves broad coding superiority, replaces SWE-bench,
or shows FD is generally better than Pro.
