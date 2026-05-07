# pollux-v1-test-intent-brutal-02

Hard v1.3 replacement for the standard CSV task. It adds escaping, comments,
multiline parsing, and structured error reporting. v1.3 hardening added
serializeRecordLine round-tripping so the parser contract is bidirectional and
harder to satisfy with one-off parsing branches.
