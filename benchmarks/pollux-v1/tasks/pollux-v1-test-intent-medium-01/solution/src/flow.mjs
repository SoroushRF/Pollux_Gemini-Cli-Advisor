const allowedTransitions = {
  queued: ['running'],
  running: ['done', 'failed'],
  failed: [],
  done: [],
};

export function canTransition(from, to) {
  return allowedTransitions[from]?.includes(to) ?? false;
}

