import { renderUser } from '../../src/renderer.mjs';

const cases = [
  ['user:lin:DISABLED', 'user=LIN status=disabled'],
  ['user:MiA:Pending', 'user=MIA status=pending'],
  ['user:ops:active', 'user=OPS status=active'],
];

for (const [input, expected] of cases) {
  const actual = renderUser(input);
  if (actual !== expected) {
    throw new Error(`render mismatch for ${input}: ${actual}`);
  }
}

let threw = false;
try {
  renderUser('team:ops:ACTIVE');
} catch {
  threw = true;
}
if (!threw) {
  throw new Error('unknown record kinds must throw');
}
