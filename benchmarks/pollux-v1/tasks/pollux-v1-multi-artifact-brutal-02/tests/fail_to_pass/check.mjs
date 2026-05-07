import { readFileSync } from 'node:fs';
import { launchDecision, launchKey, selectLaunchCandidate } from '../../src/launch.mjs';
import { formatLaunchReason } from '../../src/reason.mjs';

const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
const summary = readFileSync('launch-summary.txt', 'utf8');

if (launchKey !== launchDecision.key) throw new Error('launchKey mismatch');
if (registry.launchKey !== launchDecision.key) throw new Error('registry mismatch');
if (registry.launchDecision.key !== launchDecision.key) throw new Error('registry decision key mismatch');
if (registry.launchDecision.adjustedScore !== launchDecision.adjustedScore) throw new Error('registry score mismatch');
if (registry.launchDecision.source !== 'rules/selection.md') throw new Error('registry source missing');
if (!summary.includes(launchDecision.key)) throw new Error('summary missing key');
if (!summary.includes(String(launchDecision.adjustedScore))) throw new Error('summary missing adjusted score');
if (!summary.includes(`${launchDecision.channel}/${launchDecision.region}`)) throw new Error('summary missing channel/region');
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

const migrationPenalty = selectLaunchCandidate([
  { key: 'migrate-ok', enabled: true, channel: 'stable', region: 'south', score: 90, risk: 'low', migration: 'required' },
  { key: 'safe-low', enabled: true, channel: 'stable', region: 'south', score: 86, risk: 'low', migration: 'none' },
], {
  primaryRegion: 'south',
  channel: 'stable',
  freezeMigrations: false,
  penalty: { highRisk: 10, migrationRequired: 3 },
});
if (migrationPenalty.key !== 'migrate-ok' || migrationPenalty.adjustedScore !== 87) {
  throw new Error(`migration penalty fixture failed: ${JSON.stringify(migrationPenalty)}`);
}
if (!/migration penalty/.test(migrationPenalty.reason)) throw new Error('migration penalty reason missing');

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

let emptyError = false;
try {
  selectLaunchCandidate([
    { key: 'wrong', enabled: true, channel: 'beta', region: 'north', score: 100, risk: 'low', migration: 'none' },
  ], {
    primaryRegion: 'north',
    channel: 'stable',
    freezeMigrations: false,
    penalty: { highRisk: 10, migrationRequired: 3 },
  });
} catch (error) {
  emptyError = /eligible/i.test(error.message);
}
if (!emptyError) throw new Error('no-eligible candidate did not throw clearly');
