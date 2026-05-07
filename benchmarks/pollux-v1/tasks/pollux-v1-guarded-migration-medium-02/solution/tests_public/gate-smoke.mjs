import { legacyGate } from '../src/flags.mjs';

if (!legacyGate({ beta: true })) {
  throw new Error('public legacy gate failed');
}
