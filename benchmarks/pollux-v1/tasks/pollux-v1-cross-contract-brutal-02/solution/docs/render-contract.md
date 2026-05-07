parser.mjs parses raw records shaped as kind:id:status[:meta] into { kind, id,
status, meta }. Optional meta is semicolon-separated key=value pairs and
malformed meta must throw.

resolver.mjs owns kind aliases and status aliases before normalization: usr and
member resolve to user; on resolves to ACTIVE; off resolves to DISABLED; hold
resolves to PENDING.

normalizer.mjs must use parser and resolver, not re-split raw input.
renderer.mjs renders normalized user records. User IDs render uppercase.
Statuses render lowercase. If meta.role is present, renderer appends "
role=<role>". Unknown kinds throw. Malformed records throw.
