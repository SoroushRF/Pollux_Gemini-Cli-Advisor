import { parseCsvLine } from '../../src/csv.mjs';

const cases = [
  ['alpha,"beta,gamma",,delta', ['alpha', 'beta,gamma', '', 'delta']],
  ['"a,b","c,d",e', ['a,b', 'c,d', 'e']],
  ['"a ""quoted"" value",x', ['a "quoted" value', 'x']],
  ['a,,b,', ['a', '', 'b', '']],
];

for (const [input, expected] of cases) {
  const actual = parseCsvLine(input);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`CSV mismatch for ${input}: ${JSON.stringify(actual)}`);
  }
}

let threw = false;
try {
  parseCsvLine('"unterminated,b');
} catch {
  threw = true;
}
if (!threw) {
  throw new Error('unterminated quotes must throw');
}
