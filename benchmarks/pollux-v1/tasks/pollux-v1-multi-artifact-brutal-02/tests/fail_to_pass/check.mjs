import { readFileSync } from 'node:fs';
import { launchDecision, launchKey, selectLaunchCandidate } from '../../src/launch.mjs';
import { formatLaunchReason } from '../../src/reason.mjs';

const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
const summary = readFileSync('launch-summary.txt', 'utf8');

if (launchKey !== launchDecision.key) throw new Error('launchKey mismatch');
if (registry.launchKey !== launchDecision.key) throw new Error('registry mismatch');
if (!summary.includes(launchDecision.key)) throw new Error('summary missing key');
if (!summary.includes(String(launchDecision.adjustedScore))) throw new Error('summary missing adjusted score');
if (formatLaunchReason(launchDecision).length < 10) throw new Error('reason formatter too thin');

const fixture = [
  { key: 'rawtop', enabled: true, channel: 'stable', region: 'east', score: 99, risk: 'high', migration: 'required' },
  { key: 'keeper', enabled: true, channel: 'stable', region: 'east', score: 90, risk: 'low', migration: 'none' },
  { key: 'wrongregion', enabled: true, channel: 'stable', region: 'west', score: 100, risk: 'low', migration: 'none' },
];
const decision = selectLaunchCandidate(fixture, {
  primaryRegion: 'east',
  channel: 'stable',
  freezeMigrations: true,
  penalty: { highRisk: 10, migrationRequired: 3 },
});
if (decision.key !== 'keeper') throw new Error(`alternate fixture failed: ${JSON.stringify(decision)}`);

const tie = selectLaunchCandidate([
  { key: 'zeta', enabled: true, channel: 'stable', region: 'north', score: 50, risk: 'low', migration: 'none' },
  { key: 'alpha', enabled: true, channel: 'stable', region: 'north', score: 50, risk: 'low', migration: 'none' },
], {
  primaryRegion: 'north',
  channel: 'stable',
  freezeMigrations: false,
  penalty: { highRisk: 10, migrationRequired: 3 },
});
if (tie.key !== 'alpha') throw new Error('tie-break failed');
