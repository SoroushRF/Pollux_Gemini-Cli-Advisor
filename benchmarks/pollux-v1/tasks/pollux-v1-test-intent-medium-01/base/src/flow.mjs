const allowedTransitions = {
  queued: ['running', 'done'],
  running: ['done'],
  failed: ['running'],
  done: ['running'],
};

export function canTransition(from, to) {
  return allowedTransitions[from]?.includes(to) ?? false;
}

