import { renderUser } from '../../src/renderer.mjs';
import { normalizeRecord } from '../../src/normalizer.mjs';

const cases = [
  ['user:lin:DISABLED', 'user=LIN status=disabled'],
  ['usr:mia:Pending', 'user=MIA status=pending'],
  ['member:ops:ACTIVE', 'user=OPS status=active'],
];

for (const [input, expected] of cases) {
  if (renderUser(input) !== expected) throw new Error(`render mismatch for ${input}`);
}

for (const bad of ['team:ops:ACTIVE', 'user:missing', '']) {
  let threw = false;
  try { renderUser(bad); } catch { threw = true; }
  if (!threw) throw new Error(`malformed/unknown input did not throw: ${bad}`);
}

const normalized = normalizeRecord('usr:ivy:ACTIVE');
if (normalized.kind !== 'user' || normalized.id !== 'ivy') {
  throw new Error('alias resolution did not flow through normalizer');
}
