import { readFileSync } from 'node:fs';

const docs = readFileSync('docs/compat.md', 'utf8');
if (!docs.includes('legacyGate')) throw new Error('compat docs changed');
if (!readFileSync('tests_public/gate-smoke.mjs', 'utf8').includes('legacyGate')) throw new Error('public tests changed');
const app = readFileSync('src/app.mjs', 'utf8');
if (app.includes('legacyGate')) throw new Error('internal app must use stableGate');
