# Pollux Release / Merge Checklist

Use this checklist when deciding whether a Pollux change is ready to merge or
promote.

## Current Status

- [x] Core Pollux tests passed locally on 2026-04-22.
- [x] CLI `/pollux` tests passed locally on 2026-04-22.
- [x] Benchmark-full harness passed locally on 2026-04-22.
- [x] TG-7 is green in the release-readiness decision log.
- [x] TG-10 is green in the release-readiness decision log.
- [ ] TG-9 is still pending the first observed green Pollux-touching PR cycle.
- [ ] Latest promotion remains on HOLD until TG-9 is confirmed.

## Required

- [x] Gates G0-G5 are complete in the implementation plan.
- [ ] TG-7, TG-9, and TG-10 are green.
- [x] `/pollux` reaches every in-scope command surface.
- [x] Pollux-off behavior still matches baseline behavior.
- [x] Pollux-on behavior is parity-verified across legacy, agent-session, and
      ACP surfaces.
- [x] Benchmark outputs are reproducible, fairness-validated, and reviewable.
- [x] Spec, plan, and docs are aligned with the shipped behavior.
- [x] Ownership and correction-ledger updates are in place for any doc/spec
      drift.
- [x] A rollback plan is attached to the release-readiness decision.
- [x] The branch is clean except for intentional Pollux changes.

## Verification Evidence

- [x] Core Pollux tests pass.
- [x] CLI `/pollux` tests pass.
- [x] Benchmark-full harness passes.
- [x] Pollux-scoped binary, perf, and memory checks are available for the
      release cycle.
- [ ] The first observed green Pollux-touching PR cycle exists before any
      latest-promotion decision.

## Promotion Rule

- Do not promote or label as latest until TG-7, TG-9, and TG-10 are green and
  the release-readiness decision log explicitly moves off HOLD.
- Do not treat the checklist as merge-ready until the upstream TG-9 PR-cycle
  evidence exists.
