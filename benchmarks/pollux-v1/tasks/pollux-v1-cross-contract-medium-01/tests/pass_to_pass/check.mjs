import { createStableLabel } from '../../src/labels.mjs';

if (createStableLabel('ADA') !== 'stable:ada') {
  throw new Error('canonical label behavior changed');
}

