import { readFileSync } from 'node:fs';
import { parseRecord } from '../../src/parser.mjs';
import { resolveKind, resolveStatus } from '../../src/resolver.mjs';

if (parseRecord('user:ada:ACTIVE').id !== 'ada') throw new Error('parser export changed');
if (resolveKind('usr') !== 'user') throw new Error('resolver export changed');
if (resolveStatus('off') !== 'DISABLED') throw new Error('status resolver export changed');
const normalizer = readFileSync('src/normalizer.mjs', 'utf8');
if (!normalizer.includes('parseRecord') || !normalizer.includes('resolveKind') || !normalizer.includes('resolveStatus')) throw new Error('normalizer must use parser and resolver');
if (normalizer.includes(".split(':')") || normalizer.includes('.split(":"')) throw new Error('normalizer must not re-split raw input');
if (!readFileSync('docs/render-contract.md', 'utf8').includes('Malformed records throw')) throw new Error('docs changed');
