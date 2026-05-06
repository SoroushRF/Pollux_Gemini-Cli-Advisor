import fs from 'node:fs';
import { canTransition } from '../../src/flow.mjs';

if (typeof canTransition !== 'function') {
  throw new Error('canTransition export changed');
}
if (!fs.readFileSync('docs/states.md', 'utf8').includes('Terminal states')) {
  throw new Error('state docs changed');
}

