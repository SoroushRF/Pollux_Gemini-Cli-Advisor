parser.mjs parses raw records into { kind, id, status, meta }. resolver.mjs
resolves aliases before normalization. normalizer.mjs must use parser and
resolver, not re-split raw input. renderer.mjs renders normalized user records.
User IDs render uppercase. Statuses render lowercase. Aliases are defined in
resolver.mjs. Unknown kinds throw. Malformed records throw.
