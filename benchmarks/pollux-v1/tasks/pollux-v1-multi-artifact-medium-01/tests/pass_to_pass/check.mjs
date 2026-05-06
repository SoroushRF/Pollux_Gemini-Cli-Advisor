import fs from 'node:fs';

const defaults = JSON.parse(fs.readFileSync('config/defaults.json', 'utf8'));
const override = JSON.parse(fs.readFileSync('config/override.json', 'utf8'));
const denylist = fs.readFileSync('config/denylist.txt', 'utf8').trim();
if (defaults.features.join('|') !== 'alpha|beta|gamma') throw new Error('defaults changed');
if (override.addFeatures.join('|') !== 'delta') throw new Error('override changed');
if (denylist !== 'gamma') throw new Error('denylist changed');

