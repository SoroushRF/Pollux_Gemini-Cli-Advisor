import { readFileSync } from 'node:fs';
import { createStableLabel } from '../../src/labels.mjs';
import { createLabel } from '../../src/index.mjs';

if (createStableLabel('BOB') !== 'stable:bob') throw new Error('labels export changed');
if (createLabel('BOB') !== 'stable:bob') throw new Error('index compatibility export changed');
if (!readFileSync('docs/label-contract.md', 'utf8').includes('compatibility alias')) throw new Error('docs changed');
if (!readFileSync('tests_public/label-smoke.mjs', 'utf8').includes('createLabel')) throw new Error('public tests changed');
