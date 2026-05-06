import { policy } from '../../src/policy.mjs';

if (policy.mode !== 'strict') throw new Error('mode mismatch');
if (policy.retentionDays !== 30) throw new Error('retention mismatch');
if (policy.rollout !== 'stable') throw new Error('rollout mismatch');

