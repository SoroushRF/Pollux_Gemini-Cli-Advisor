import { canTransition, explainTransition } from '../../src/flow.mjs';
import { terminalStates } from '../../src/summary.mjs';

const yes = [['queued','running'], ['running','paused'], ['paused','cancelled']];
const no = [['queued','done'], ['done','running'], ['cancelled','running'], ['unknown','running']];

for (const [from, to] of yes) {
  if (!canTransition(from, to)) throw new Error(`${from}->${to} should pass`);
}
for (const [from, to] of no) {
  if (canTransition(from, to)) throw new Error(`${from}->${to} should fail`);
}

const explained = explainTransition('done', 'running');
if (explained.allowed !== false) throw new Error('terminal transition allowed');
if (!/terminal/i.test(explained.reason)) throw new Error('missing terminal reason');

if (terminalStates.join('|') !== 'done|failed|cancelled') {
  throw new Error('terminal summary mismatch');
}
