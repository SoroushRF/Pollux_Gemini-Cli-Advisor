import { readFileSync } from 'node:fs';

JSON.parse(readFileSync('registry.json', 'utf8'));
const source = readFileSync('src/launch.mjs', 'utf8');
if (source.includes('return "atlas"') || source.includes("return 'atlas'")) {
  throw new Error('selector must not return only the fixture key');
}
for (const input of ['data/candidates.json', 'data/rollout.json', 'rules/selection.md']) {
  if (readFileSync(input, 'utf8').length === 0) {
    throw new Error(`${input} was unexpectedly emptied`);
  }
}
const summary = readFileSync('launch-summary.txt', 'utf8');
if (!/adjusted|penalt|rule/i.test(summary)) {
  throw new Error('summary should include a rule-based reason category');
}
