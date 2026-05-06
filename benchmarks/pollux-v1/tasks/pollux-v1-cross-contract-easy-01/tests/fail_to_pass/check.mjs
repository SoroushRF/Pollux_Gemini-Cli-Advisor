import { label } from '../../src/view.mjs';

if (label !== 'label:pollux') {
  throw new Error('view label contract mismatch');
}

