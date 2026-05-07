export const terminalStates = ['done', 'failed'];

export function isTerminal(state) {
  return terminalStates.includes(state);
}
