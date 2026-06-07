import { readFileSync } from 'node:fs';

for (const file of ['config/defaults.json', 'config/environment.json', 'plans/release.json', 'rules/precedence.md']) {
  if (readFileSync(file, 'utf8').length === 0) {
    throw new Error(`${file} was unexpectedly emptied`);
  }
}
const source = readFileSync('src/decision.mjs', 'utf8');
if (source.includes('archive') || source.includes("'open'") || source.includes('"open"')) {
  throw new Error('stale doc-only values remain in runtime decision source');
}
