import { parseCsvLine } from '../src/csv.mjs';

const parsed = parseCsvLine('alpha,"beta,gamma",,delta');
if (parsed.length !== 4 || parsed[1] !== 'beta,gamma' || parsed[2] !== '') {
  throw new Error('public CSV smoke failed');
}
