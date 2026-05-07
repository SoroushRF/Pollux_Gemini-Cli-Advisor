parseRecords(text) parses newline-separated records. Fields are pipe-separated.
Backslash escapes pipe, newline, and backslash inside fields. Blank lines are
ignored. A line beginning with # is a comment. Malformed dangling escapes throw
ParseRecordError with line and column. parseRecordLine(line) parses one
non-comment line.
