import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('config/policy.json', 'utf8'));
if (config.mode !== 'strict' || config.retentionDays !== 30) throw new Error('policy config changed');
if (!readFileSync('docs/policy.md', 'utf8').includes('loose')) throw new Error('docs changed');
const source = readFileSync('src/policy.mjs', 'utf8');
if (source.includes('canary') || source.includes('open')) throw new Error('stale doc-only values remain');
