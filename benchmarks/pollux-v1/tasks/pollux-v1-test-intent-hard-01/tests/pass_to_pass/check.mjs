import fs from 'node:fs';
import { parseCsvLine } from '../../src/csv.mjs';

if (parseCsvLine('a,b,c').join('|') !== 'a|b|c') {
  throw new Error('simple CSV behavior changed');
}
if (!fs.readFileSync('README.md', 'utf8').includes('quoted fields')) {
  throw new Error('README changed');
}

