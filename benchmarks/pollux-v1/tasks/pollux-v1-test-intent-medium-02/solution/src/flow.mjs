const allowedTransitions = {
  queued: ['running'],
  running: ['paused', 'done', 'failed'],
  paused: ['running', 'cancelled'],
  failed: [],
  done: [],
  cancelled: [],
};

const terminalStates = new Set(['done', 'failed', 'cancelled']);

export function canTransition(from, to) {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export function explainTransition(from, to) {
  if (!Object.hasOwn(allowedTransitions, from)) {
    return { allowed: false, reason: `Unknown state: ${from}` };
  }
  if (terminalStates.has(from)) {
    return { allowed: false, reason: `${from} is a terminal state` };
  }
  if (canTransition(from, to)) {
    return { allowed: true, reason: `${from} may transition to ${to}` };
  }
  return { allowed: false, reason: `${from} cannot transition to ${to}` };
}
