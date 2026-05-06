import fs from 'node:fs';

const docs = fs.readFileSync('docs/compat.md', 'utf8');
if (!docs.includes('legacyGate') || !/public API\s+migration/.test(docs)) {
  throw new Error('compat docs changed');
}
