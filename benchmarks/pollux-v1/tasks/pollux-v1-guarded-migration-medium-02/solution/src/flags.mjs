export function stableGate(user) {
  return user.beta === true;
}

export const legacyGate = stableGate;
