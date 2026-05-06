import { label } from '../../src/view.mjs';

if (label !== 'stable:pollux') {
  throw new Error('label contract mismatch');
}

