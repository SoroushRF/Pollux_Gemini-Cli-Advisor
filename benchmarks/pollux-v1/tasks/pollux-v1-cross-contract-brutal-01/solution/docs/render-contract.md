parser.mjs is the canonical raw-record parser. normalizer.mjs must use
parser.mjs and must not re-split raw input itself. renderer.mjs renders
normalized user records as `user=<UPPERCASE_ID> status=<lowercase_status>`.
Unknown record kinds must throw an error.
