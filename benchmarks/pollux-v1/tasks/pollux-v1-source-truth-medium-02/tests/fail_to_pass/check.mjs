import { policy, resolvePolicy } from '../../src/policy.mjs';

if (policy.mode !== 'strict') throw new Error('mode mismatch');
if (policy.retentionDays !== 30) throw new Error('retention mismatch');
if (policy.rollout !== 'stable') throw new Error('rollout mismatch');
if (policy.guard !== 'audit') throw new Error('default fallback mismatch');

const custom = resolvePolicy({
  policy: { mode: 'strict', retentionDays: 7, rollout: 'canary' },
  defaults: { mode: 'default', retentionDays: 14, rollout: 'safe', guard: 'closed' },
  environment: { rollout: 'stable', disableStrict: true },
});
if (custom.mode !== 'observe') throw new Error('strict downgrade failed');
if (custom.retentionDays !== 7) throw new Error('explicit policy retention lost');
if (custom.rollout !== 'stable') throw new Error('environment rollout override failed');
if (custom.guard !== 'closed') throw new Error('custom fallback guard failed');

const second = resolvePolicy({
  policy: { mode: 'strict' },
  defaults: { mode: 'default', retentionDays: 3, rollout: 'fallback', guard: 'audit' },
  environment: {},
});
if (second.mode !== 'strict') throw new Error('strict mode changed without environment override');
if (second.rollout !== 'fallback') throw new Error('empty environment fallback failed');
