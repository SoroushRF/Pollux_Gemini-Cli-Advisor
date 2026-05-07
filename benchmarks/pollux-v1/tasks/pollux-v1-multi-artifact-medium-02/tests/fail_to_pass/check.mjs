import { mergeConfig } from '../../src/mergeConfig.mjs';
import fs from 'node:fs';

const effective = JSON.parse(fs.readFileSync('effective-config.json', 'utf8'));
if (effective.mode !== 'enforce') throw new Error('mode mismatch');
if (JSON.stringify(effective.features) !== JSON.stringify(['alpha', 'delta'])) {
  throw new Error('effective feature merge mismatch');
}

const custom = mergeConfig(
  { mode: 'observe', features: ['a', 'b', 'c'] },
  { addFeatures: ['d', 'b'], disableFeatures: ['a'] },
  ['c', 'x'],
);
if (JSON.stringify(custom.features) !== JSON.stringify(['b', 'd'])) {
  throw new Error(`custom merge failed: ${JSON.stringify(custom.features)}`);
}
