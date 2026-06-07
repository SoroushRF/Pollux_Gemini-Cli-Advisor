# Pollux v1 Difficulty Rubric

Pollux v1 difficulty labels are assigned from static task features before final
FD evaluation. Model outcomes are calibration evidence only; they are not the
definition of task difficulty.

## Rubric Dimensions

Each final task review records:

1. primary files or artifacts touched
2. cross-file reasoning
3. source-of-truth conflict
4. hidden edge-case depth
5. compatibility or public API constraints
6. regression traps
7. generalization required
8. solution-space ambiguity
9. protected-file constraint strength

## Difficulty Bands

Easy/control tasks usually have one primary source file or one obvious wiring
fix, no deep hidden edge cases, no substantial source-of-truth conflict, and a
prompt that directly states the intended behavior. Flash should usually pass
these tasks, but that expectation is a calibration check, not the label source.

Medium tasks usually touch two or three source files, or one nontrivial
function. They include at least one regression trap or contract-preservation
rule, require reading more than one artifact, and use hidden tests that require
moderate generalization beyond a visible example.

Hard tasks usually touch three or more files/artifacts, or require one
algorithmic function with multiple hidden edge classes. They include conflicting
evidence or precedence rules, multiple plausible wrong fixes, protected-file or
compatibility constraints, and hidden tests that require generalized behavior
rather than fixture matching.

## Calibration Policy

A/E calibration may flag a label for review:

1. If Flash passes a hard task cheaply, the task is reviewed as potentially too
   easy or too exposed.
2. If Pro repeatedly fails an easy task, the task is reviewed as potentially
   ambiguous, flaky, or unfair.
3. If both models fail a task, the prompt and oracle are reviewed before the
   task is treated as genuinely hard.

FD results must never be used to assign, preserve, reject, or harden a task
label. Final FD runs happen only after the calibrated task set is frozen.
