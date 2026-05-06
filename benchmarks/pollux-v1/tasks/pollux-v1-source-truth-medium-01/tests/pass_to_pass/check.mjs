import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('config/policy.json', 'utf8'));
const docs = fs.readFileSync('docs/policy.md', 'utf8');
if (config.mode !== 'strict' || config.retentionDays !== 30) {
  throw new Error('policy config changed');
}
if (!docs.includes('loose') || !docs.includes('canary')) {
  throw new Error('policy docs changed');
}

