import fs from 'node:fs';
import { launchKey } from '../../src/launch.mjs';

const registry = JSON.parse(fs.readFileSync('registry.json', 'utf8'));
const summary = fs.readFileSync('launch-summary.txt', 'utf8');

if (launchKey !== 'atlas') throw new Error('source launch key mismatch');
if (registry.launchKey !== 'atlas') throw new Error('registry launch key mismatch');
if (!summary.includes('atlas')) throw new Error('summary launch key mismatch');

