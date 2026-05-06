import fs from 'node:fs';
import { runtimeDecision } from '../../src/decision.mjs';

if (runtimeDecision.region !== 'north') throw new Error('region mismatch');
if (runtimeDecision.mode !== 'live') throw new Error('mode mismatch');
if (runtimeDecision.guard !== 'strict') throw new Error('guard mismatch');

const decision = fs.readFileSync('decision.txt', 'utf8').trim();
if (decision !== 'region=north mode=live guard=strict') {
  throw new Error('decision.txt mismatch');
}

