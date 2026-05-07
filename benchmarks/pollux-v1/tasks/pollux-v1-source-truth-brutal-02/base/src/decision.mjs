export function resolveRuntimeDecision() {
  return {
    region: 'archive',
    mode: 'archive',
    guard: 'open',
  };
}

export const runtimeDecision = resolveRuntimeDecision();
