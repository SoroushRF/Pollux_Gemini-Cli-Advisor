import { createLabel } from '../../src/labels.mjs';

if (createLabel('Ada') !== 'label:ada') {
  throw new Error('createLabel behavior changed');
}

