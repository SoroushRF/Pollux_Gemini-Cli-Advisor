import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('config/runtime.json', 'utf8'));
const docs = fs.readFileSync('docs/runtime.md', 'utf8');
if (config.mode !== 'live') throw new Error('runtime config changed');
if (!docs.includes('archive')) throw new Error('runtime docs changed');

