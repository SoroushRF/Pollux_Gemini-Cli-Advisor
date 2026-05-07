export function createStableLabel(value) {
  return `stable:${value.trim().toLowerCase()}`;
}

export const createLabel = createStableLabel;
