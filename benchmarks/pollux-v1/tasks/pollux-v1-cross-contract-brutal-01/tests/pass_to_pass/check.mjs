import { readFileSync } from 'node:fs';
import { parseRecord } from '../../src/parser.mjs';

const parsed = parseRecord('user:ada:ACTIVE');
if (parsed.kind !== 'user' || parsed.id !== 'ada' || parsed.status !== 'ACTIVE') {
  throw new Error('parser contract changed');
}

const normalizerSource = readFileSync('src/normalizer.mjs', 'utf8');
if (!normalizerSource.includes('parseRecord')) {
  throw new Error('normalizer must use parser.mjs as the canonical parser');
}
if (normalizerSource.includes(".split(':')") || normalizerSource.includes('.split(":")')) {
  throw new Error('normalizer must not re-split raw records');
}
