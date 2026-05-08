# pollux-v1-cross-contract-brutal-02

Medium-calibrated v1.3 replacement for the too-direct cascade contract task. It
adds alias resolution, malformed input handling, and source-contract checks.
v1.3 hardening expanded the contract to status aliases and optional key=value
metadata so the fix must preserve parser/resolver/normalizer responsibilities
instead of only normalizing casing.

A-only calibration after the latest hardening passed 3/3, so this task was
relabeled from hard to medium before E or FD calibration.
