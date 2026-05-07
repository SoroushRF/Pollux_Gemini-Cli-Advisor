import { readFileSync } from 'node:fs';
import { canTransition, explainTransition } from '../../src/flow.mjs';
import { activeStates } from '../../src/summary.mjs';

if (typeof canTransition !== 'function') throw new Error('canTransition export changed');
if (typeof explainTransition !== 'function') throw new Error('explainTransition export missing');
if (!Array.isArray(activeStates)) throw new Error('activeStates export missing');
if (!readFileSync('docs/states.md', 'utf8').includes('cancelled are terminal')) throw new Error('state docs changed');
if (!readFileSync('docs/states.md', 'utf8').includes('retrying')) throw new Error('retrying docs changed');
if (!readFileSync('tests_public/flow-smoke.mjs', 'utf8').includes('queued')) throw new Error('public tests changed');
