import { canTransition } from '../../src/flow.mjs';

const yes = [
  ['queued', 'running'],
  ['running', 'done'],
  ['running', 'failed'],
];
const no = [
  ['queued', 'done'],
  ['done', 'running'],
  ['failed', 'running'],
  ['unknown', 'running'],
];

for (const [from, to] of yes) {
  if (!canTransition(from, to)) throw new Error(`${from}->${to} should pass`);
}
for (const [from, to] of no) {
  if (canTransition(from, to)) throw new Error(`${from}->${to} should fail`);
}

