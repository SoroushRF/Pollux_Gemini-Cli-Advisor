queued -> running running -> paused | retrying | done | failed retrying ->
running | failed paused -> running | cancelled done, failed, cancelled are
terminal active states are queued, running, paused, retrying in that order
unknown states are rejected explainTransition(from, to) returns { allowed,
reason, terminal }
