# pollux-v1-cross-contract-brutal-02

Hard v1.3 replacement for the too-direct cascade contract task. It adds alias
resolution, malformed input handling, and source-contract checks. v1.3 hardening
expanded the contract to status aliases and optional key=value metadata so the
fix must preserve parser/resolver/normalizer responsibilities instead of only
normalizing casing.
