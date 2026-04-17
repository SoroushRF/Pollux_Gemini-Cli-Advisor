## Summary

<!-- Concisely describe what this PR changes and why. Focus on impact and
urgency. -->

## Details

<!-- Add any extra context and design decisions. Keep it brief but complete. -->

## Related Issues

<!-- Use keywords to auto-close issues (Closes #123, Fixes #456). If this PR is
only related to an issue or is a partial fix, simply reference the issue number
without a keyword (Related to #123). -->

## How to Validate

<!-- List exact steps for reviewers to validate the change. Include commands,
expected results, and edge cases. -->

## Pollux TG Mapping (required for Pollux-touching PRs)

<!--
Complete this section when the PR touches Pollux runtime, settings, policy,
benchmarking, CI, or Pollux governance docs.

If this PR is not Pollux-related, set every row to N/A and add one short reason
in the Evidence column.
-->

| TG    | Requirement                                                | Status (Pass / N/A) | Evidence (tests, logs, artifacts, PR links) |
| ----- | ---------------------------------------------------------- | ------------------- | ------------------------------------------- |
| TG-1  | Harness suppresses router/loop utility noise for fairness  |                     |                                             |
| TG-2  | Cross-surface behavior parity (legacy, agent-session, ACP) |                     |                                             |
| TG-3  | Advisor policy path avoids double prompt                   |                     |                                             |
| TG-4  | Token usage metrics match conversation totals              |                     |                                             |
| TG-5  | Schema-to-ConfigParameters mapping invariant test          |                     |                                             |
| TG-6  | Pollux-specific integration tests exist and are green      |                     |                                             |
| TG-7  | /pollux command reachability across in-scope surfaces      |                     |                                             |
| TG-8  | ACP advisor flow regression test                           |                     |                                             |
| TG-9  | Binary build smoke test for Pollux-touching PRs            |                     |                                             |
| TG-10 | Doc/spec drift check for Pollux files                      |                     |                                             |

## Pre-Merge Checklist

<!-- Check all that apply before requesting review or merging. -->

- [ ] Updated relevant documentation and README (if needed)
- [ ] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [ ] Pollux TG mapping section is completed (or explicitly marked N/A)
- [ ] Validated on required platforms/methods:
  - [ ] MacOS
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
    - [ ] Podman
    - [ ] Seatbelt
  - [ ] Windows
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
  - [ ] Linux
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
