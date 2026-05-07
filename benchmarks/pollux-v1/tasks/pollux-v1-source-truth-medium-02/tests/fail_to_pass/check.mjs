import { policy, resolvePolicy } from '../../src/policy.mjs';

if (policy.mode !== 'strict') throw new Error('mode mismatch');
if (policy.retentionDays !== 30) throw new Error('retention mismatch');
if (policy.rollout !== 'stable') throw new Error('rollout mismatch');
if (policy.guard !== 'audit') throw new Error('default fallback mismatch');

const custom = resolvePolicy({
  policy: { mode: 'observe' },
  defaults: { mode: 'default', retentionDays: 14, rollout: 'safe', guard: 'closed' },
});
if (custom.mode !== 'observe') throw new Error('explicit policy lost');
if (custom.retentionDays !== 14) throw new Error('custom fallback retention failed');
if (custom.guard !== 'closed') throw new Error('custom fallback guard failed');
