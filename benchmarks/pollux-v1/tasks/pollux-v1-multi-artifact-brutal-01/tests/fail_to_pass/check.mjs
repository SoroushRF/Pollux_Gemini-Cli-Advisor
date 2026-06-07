import { readFileSync } from 'node:fs';
import { launchKey, selectLaunchCandidate } from '../../src/launch.mjs';

const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
const summary = readFileSync('launch-summary.txt', 'utf8');

if (launchKey !== 'atlas') throw new Error('source launch key mismatch');
if (registry.launchKey !== 'atlas') throw new Error('registry launch key mismatch');
if (!summary.includes('atlas')) throw new Error('summary launch key mismatch');
if (summary.includes('zephyr') || JSON.stringify(registry).includes('zephyr')) {
  throw new Error('stale candidate remained in output artifacts');
}

const tieFixture = [
  { key: 'delta', enabled: true, channel: 'stable', region: 'east', score: 50, risk: 'low', migration: 'none' },
  { key: 'alpha', enabled: true, channel: 'stable', region: 'east', score: 50, risk: 'low', migration: 'none' },
  { key: 'omega', enabled: true, channel: 'stable', region: 'west', score: 90, risk: 'low', migration: 'none' },
];
if (selectLaunchCandidate(tieFixture, { primaryRegion: 'east' }) !== 'alpha') {
  throw new Error('tie-breaker or region filter failed');
}
