export const terminalStates = ['done', 'failed', 'cancelled'];

export function isTerminal(state) {
  return terminalStates.includes(state);
}
