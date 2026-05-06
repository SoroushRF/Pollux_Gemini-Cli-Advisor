import fs from 'node:fs';
import { totalWithTax } from '../../src/tax.mjs';

if (typeof totalWithTax !== 'function') {
  throw new Error('totalWithTax export changed');
}
if (!fs.readFileSync('docs/tax.md', 'utf8').includes('discount before')) {
  throw new Error('tax docs changed');
}

