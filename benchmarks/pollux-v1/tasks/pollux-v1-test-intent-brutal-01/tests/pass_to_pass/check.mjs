import { readFileSync } from 'node:fs';
import { parseCsvLine } from '../../src/csv.mjs';

if (JSON.stringify(parseCsvLine('a,b,c')) !== JSON.stringify(['a', 'b', 'c'])) {
  throw new Error('simple CSV parsing regressed');
}
const source = readFileSync('src/csv.mjs', 'utf8');
if (source.includes('beta,gamma') || source.includes('unterminated,b')) {
  throw new Error('fixture-specific CSV branch detected');
}
