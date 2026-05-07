import { launchDecision } from '../src/launch.mjs';

if (!launchDecision || typeof launchDecision.key !== 'string') {
  throw new Error('launch decision shape failed');
}
