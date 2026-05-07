import { canTransition, explainTransition } from '../../src/flow.mjs';
import { activeStates, terminalStates } from '../../src/summary.mjs';

const yes = [
  ['queued','running'],
  ['running','paused'],
  ['running','retrying'],
  ['retrying','running'],
  ['retrying','failed'],
  ['paused','cancelled'],
];
const no = [
  ['queued','done'],
  ['done','running'],
  ['cancelled','running'],
  ['retrying','done'],
  ['unknown','running'],
];

for (const [from, to] of yes) {
  if (!canTransition(from, to)) throw new Error(`${from}->${to} should pass`);
}
for (const [from, to] of no) {
  if (canTransition(from, to)) throw new Error(`${from}->${to} should fail`);
}

const explained = explainTransition('done', 'running');
if (explained.allowed !== false) throw new Error('terminal transition allowed');
if (explained.terminal !== true) throw new Error('terminal flag missing');
if (!/terminal/i.test(explained.reason)) throw new Error('missing terminal reason');

const unknown = explainTransition('unknown', 'running');
if (unknown.allowed !== false || !/unknown/i.test(unknown.reason)) throw new Error('unknown reason missing');

if (terminalStates.join('|') !== 'done|failed|cancelled') {
  throw new Error('terminal summary mismatch');
}
if (activeStates.join('|') !== 'queued|running|paused|retrying') {
  throw new Error('active summary mismatch');
}
