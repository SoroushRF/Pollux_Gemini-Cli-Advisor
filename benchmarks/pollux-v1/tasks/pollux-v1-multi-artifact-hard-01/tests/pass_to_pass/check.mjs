import fs from 'node:fs';

const candidates = JSON.parse(fs.readFileSync('data/candidates.json', 'utf8'));
const rules = fs.readFileSync('rules/selection.md', 'utf8');
if (candidates.length !== 3) throw new Error('candidate data changed');
if (!rules.includes('enabled') || !rules.includes('stable')) {
  throw new Error('selection rules changed');
}

