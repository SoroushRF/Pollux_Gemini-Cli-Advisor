import { readFileSync } from 'node:fs';

JSON.parse(readFileSync('registry.json', 'utf8'));
if (!readFileSync('rules/selection.md', 'utf8').includes('freezeMigrations')) throw new Error('rules changed');
if (readFileSync('data/candidates.json', 'utf8').length === 0) throw new Error('candidate data changed');
const summary = readFileSync('launch-summary.txt', 'utf8');
if (!/adjusted|score|reason/i.test(summary)) throw new Error('summary missing rule-based reason');
if (!/channel|region/i.test(summary)) throw new Error('summary missing channel/region context');
const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
if (registry.launchDecision?.source !== 'rules/selection.md') throw new Error('registry decision source missing');
const source = readFileSync('src/launch.mjs', 'utf8');
if (source.includes('return "atlas"') || source.includes("return 'atlas'")) throw new Error('fixture-only selector detected');
if (readFileSync('tests_public/launch-smoke.mjs', 'utf8').includes('atlas')) throw new Error('public smoke reveals hidden key');
