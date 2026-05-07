import { renderUser } from '../../src/renderer.mjs';
import { normalizeRecord } from '../../src/normalizer.mjs';

const cases = [
  ['user:lin:DISABLED', 'user=LIN status=disabled'],
  ['usr:mia:hold', 'user=MIA status=pending'],
  ['member:ops:ACTIVE', 'user=OPS status=active'],
  ['usr:lin:off:role=admin', 'user=LIN status=disabled role=admin'],
];

for (const [input, expected] of cases) {
  if (renderUser(input) !== expected) throw new Error(`render mismatch for ${input}`);
}

for (const bad of ['team:ops:ACTIVE', 'user:missing', '', 'user:ada:on:badmeta']) {
  let threw = false;
  try { renderUser(bad); } catch { threw = true; }
  if (!threw) throw new Error(`malformed/unknown input did not throw: ${bad}`);
}

const normalized = normalizeRecord('usr:ivy:on:role=viewer');
if (normalized.kind !== 'user' || normalized.id !== 'ivy' || normalized.status !== 'ACTIVE') {
  throw new Error('alias resolution did not flow through normalizer');
}
if (normalized.meta.role !== 'viewer') throw new Error('meta parsing did not flow through normalizer');
