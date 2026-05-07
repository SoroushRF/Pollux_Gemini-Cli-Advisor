export const terminalStates = ['done', 'failed', 'cancelled'];
export const activeStates = ['queued', 'running', 'paused', 'retrying'];

export function isTerminal(state) {
  return terminalStates.includes(state);
}
