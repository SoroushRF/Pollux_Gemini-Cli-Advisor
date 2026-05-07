import { policy } from '../src/policy.mjs';

if (policy.mode !== 'strict') {
  throw new Error('public policy mode failed');
}
