import fs from 'node:fs';

const parsed = JSON.parse(fs.readFileSync('effective-config.json', 'utf8'));

if (parsed.mode !== 'enforce') throw new Error('mode mismatch');
if (JSON.stringify(parsed.features) !== JSON.stringify(['alpha', 'delta'])) {
  throw new Error('features mismatch');
}

