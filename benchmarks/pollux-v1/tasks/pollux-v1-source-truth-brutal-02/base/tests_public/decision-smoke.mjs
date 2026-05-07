import { runtimeDecision } from '../src/decision.mjs';

if (runtimeDecision.region !== 'north') {
  throw new Error('public precedence smoke failed');
}
