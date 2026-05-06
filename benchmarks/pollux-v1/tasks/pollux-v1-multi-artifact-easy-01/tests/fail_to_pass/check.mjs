import fs from 'node:fs';
import { service } from '../../src/service.mjs';

if (service.name !== 'pollux') throw new Error('name mismatch');
if (service.port !== 8080) throw new Error('port mismatch');

const summary = fs.readFileSync('service-summary.txt', 'utf8');
if (!summary.includes('pollux') || !summary.includes('8080')) {
  throw new Error('service summary mismatch');
}

