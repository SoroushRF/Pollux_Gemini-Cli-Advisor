import { parseRecord } from '../../src/parser.mjs';

const parsed = parseRecord('user:ada:ACTIVE');
if (parsed.kind !== 'user' || parsed.id !== 'ada' || parsed.status !== 'ACTIVE') {
  throw new Error('parseRecord contract changed');
}

