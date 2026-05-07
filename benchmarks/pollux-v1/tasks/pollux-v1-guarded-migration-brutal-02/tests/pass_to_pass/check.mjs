import { readFileSync } from 'node:fs';

if (!readFileSync('docs/compat.md', 'utf8').includes('formatShade')) throw new Error('docs changed');
if (!readFileSync('tests_public/color-smoke.mjs', 'utf8').includes('formatShade')) throw new Error('public tests changed');
const theme = readFileSync('src/theme.mjs', 'utf8');
if (theme.includes('import { formatShade }')) throw new Error('theme internals must use renderShade');
const source = readFileSync('src/color.mjs', 'utf8');
if (source.includes('COBALT') || source.includes('AMBER') || source.includes('SLATE')) throw new Error('fixture-specific color branch detected');
