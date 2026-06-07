import { readFileSync } from 'node:fs';

const docs = readFileSync('docs/compat.md', 'utf8');
if (!docs.includes('formatShade')) {
  throw new Error('compat docs must remain unchanged');
}
const theme = readFileSync('src/theme.mjs', 'utf8');
if (theme.includes('import { formatShade }')) {
  throw new Error('internal theme usage must use renderShade');
}
const registry = readFileSync('src/registry.mjs', 'utf8');
if (!registry.includes('renderShade')) {
  throw new Error('registry must expose canonical renderShade');
}
