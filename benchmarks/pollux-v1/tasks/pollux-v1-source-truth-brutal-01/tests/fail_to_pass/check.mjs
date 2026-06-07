import { runtimeDecision, resolveRuntimeDecision } from '../../src/decision.mjs';

if (runtimeDecision.region !== 'north') throw new Error('region must come from environment');
if (runtimeDecision.mode !== 'live') throw new Error('mode must fall back to release plan');
if (runtimeDecision.guard !== 'strict') throw new Error('guard must fall back to defaults');

const custom = resolveRuntimeDecision({
  defaults: { region: 'base', mode: 'safe', guard: 'closed' },
  release: { mode: 'preview' },
  environment: { guard: 'locked' },
});
if (custom.region !== 'base' || custom.mode !== 'preview' || custom.guard !== 'locked') {
  throw new Error(`custom fallback precedence failed: ${JSON.stringify(custom)}`);
}
