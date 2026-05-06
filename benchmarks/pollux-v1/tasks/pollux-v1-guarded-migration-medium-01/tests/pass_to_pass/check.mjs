import fs from 'node:fs';

const docs = fs.readFileSync('docs/compat.md', 'utf8');
if (!docs.includes('legacyGate') || !docs.includes('public API migration')) {
  throw new Error('compat docs changed');
}

