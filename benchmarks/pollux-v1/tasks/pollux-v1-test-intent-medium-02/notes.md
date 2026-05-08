# pollux-v1-test-intent-medium-02

Hard-calibrated v1.3 replacement for the small state table task. It adds
paused/cancelled states plus explanation and summary surfaces. v1.3 hardening
added retrying, active-state summary output, and a terminal flag in explanations
to avoid a cheap table-only repair.

A-only calibration after the latest hardening passed 0/3 with one
model-call-ceiling invalidation, so this task was relabeled from medium to hard
before E or FD calibration.
