import { renderUser } from '../../src/renderer.mjs';

const cases = [
  ['user:ada:ACTIVE', 'user=ADA status=active'],
  ['user:lin:DISABLED', 'user=LIN status=disabled'],
];

for (const [input, expected] of cases) {
  if (renderUser(input) !== expected) {
    throw new Error(`render mismatch for ${input}`);
  }
}

