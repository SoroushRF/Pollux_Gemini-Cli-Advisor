const allowedTransitions = {
  queued: ['running'],
  running: ['paused', 'retrying', 'done', 'failed'],
  retrying: ['running', 'failed'],
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
    return { allowed: false, reason: `Unknown state: ${from}`, terminal: false };
  }
  if (terminalStates.has(from)) {
    return { allowed: false, reason: `${from} is a terminal state`, terminal: true };
  }
  if (canTransition(from, to)) {
    return { allowed: true, reason: `${from} may transition to ${to}`, terminal: false };
  }
  return { allowed: false, reason: `${from} cannot transition to ${to}`, terminal: false };
}
