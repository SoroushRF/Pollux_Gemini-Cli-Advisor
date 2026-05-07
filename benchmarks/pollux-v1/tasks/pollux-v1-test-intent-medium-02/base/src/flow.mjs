const allowedTransitions = {
  queued: ['running', 'done'],
  running: ['done', 'failed'],
  failed: ['running'],
  done: ['running'],
};

export function canTransition(from, to) {
  return allowedTransitions[from]?.includes(to) ?? false;
}

export function explainTransition(from, to) {
  return canTransition(from, to);
}
