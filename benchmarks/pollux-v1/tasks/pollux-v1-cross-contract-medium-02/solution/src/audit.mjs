import { createLabel, createStableLabel } from './index.mjs';

export function auditLabels(value) {
  return {
    canonical: createStableLabel(value),
    compat: createLabel(value),
  };
}
