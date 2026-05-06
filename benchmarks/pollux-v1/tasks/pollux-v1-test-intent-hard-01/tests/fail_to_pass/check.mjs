import { parseCsvLine } from '../../src/csv.mjs';

const parsed = parseCsvLine('alpha,"beta,gamma",,delta');
if (parsed.length !== 4) throw new Error('field count mismatch');
if (parsed[1] !== 'beta,gamma') throw new Error('quoted comma mismatch');
if (parsed[2] !== '') throw new Error('empty field mismatch');

const second = parseCsvLine('"a,b","c,d",e');
if (second.join('|') !== 'a,b|c,d|e') {
  throw new Error('multiple quoted fields mismatch');
}

