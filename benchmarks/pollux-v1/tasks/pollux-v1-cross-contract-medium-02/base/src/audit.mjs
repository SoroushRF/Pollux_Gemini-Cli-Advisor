import { createLabel } from './index.mjs';

export function auditLabels(value) {
  return { label: createLabel(value) };
}
