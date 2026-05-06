import fs from 'node:fs';

if (!fs.readFileSync('rules/precedence.md', 'utf8').includes('environment overrides')) {
  throw new Error('precedence rules changed');
}
const config = JSON.parse(fs.readFileSync('config/environment.json', 'utf8'));
if (config.mode !== 'live' || config.guard !== 'strict') {
  throw new Error('environment config changed');
}

