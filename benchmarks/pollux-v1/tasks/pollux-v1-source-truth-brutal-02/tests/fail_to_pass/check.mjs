import { runtimeDecision, resolveRuntimeDecision } from '../../src/decision.mjs';

if (runtimeDecision.region !== 'north') throw new Error('region must come from environment');
if (runtimeDecision.mode !== 'live') throw new Error('mode must fall back to release plan');
if (runtimeDecision.guard !== 'strict') throw new Error('guard must fall back to defaults');

const custom = resolveRuntimeDecision({
  defaults: { region: 'base', mode: 'safe', guard: 'closed' },
  release: { mode: 'preview' },
  environment: { guard: 'locked' },
});
if (custom.region !== 'base') throw new Error('custom region fallback failed');
if (custom.mode !== 'preview') throw new Error('custom mode fallback failed');
if (custom.guard !== 'locked') throw new Error('custom guard override failed');

const second = resolveRuntimeDecision({
  defaults: { region: 'central', mode: 'safe', guard: 'audit' },
  release: { region: 'west', guard: 'warn' },
  environment: { mode: 'live' },
});
if (second.region !== 'west' || second.mode !== 'live' || second.guard !== 'warn') {
  throw new Error('second injected precedence failed');
}
