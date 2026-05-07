queued -> running running -> paused | done | failed paused -> running |
cancelled done, failed, cancelled are terminal unknown states are rejected
explainTransition(from, to) returns { allowed, reason }
