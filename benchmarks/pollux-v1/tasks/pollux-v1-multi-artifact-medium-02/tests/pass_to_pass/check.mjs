import fs from 'node:fs';
import { mergeConfig } from '../../src/mergeConfig.mjs';

if (typeof mergeConfig !== 'function') throw new Error('mergeConfig export missing');
JSON.parse(fs.readFileSync('effective-config.json', 'utf8'));
if (!fs.readFileSync('rules/merge.md', 'utf8').includes('denylisted')) throw new Error('rules changed');
if (JSON.parse(fs.readFileSync('config/defaults.json', 'utf8')).features.join('|') !== 'alpha|beta|gamma') throw new Error('defaults changed');
