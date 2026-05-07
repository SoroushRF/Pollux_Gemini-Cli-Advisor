import { canTransition } from '../src/flow.mjs';

if (!canTransition('queued', 'running')) {
  throw new Error('public queued transition failed');
}
