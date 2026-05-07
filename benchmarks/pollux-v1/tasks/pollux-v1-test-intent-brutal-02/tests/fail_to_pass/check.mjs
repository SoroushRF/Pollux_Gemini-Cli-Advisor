import { parseRecords, parseRecordLine, serializeRecordLine, ParseRecordError } from '../../src/records.mjs';

const one = parseRecordLine(String.raw`user|ada\|lovelace|active`);
if (one[1] !== 'ada|lovelace') throw new Error('escaped pipe failed');

const many = parseRecords(String.raw`
# comment
user|lin|disabled
user|mia\\ops|pending

`);
if (many.length !== 2) throw new Error('comments/blank lines failed');
if (many[1][1] !== String.raw`mia\ops`) throw new Error('escaped backslash failed');

let err;
try {
  parseRecords('user|bad\\');
} catch (e) {
  err = e;
}
if (!(err instanceof ParseRecordError)) throw new Error('wrong error type');
if (err.line !== 1 || err.column !== 9) throw new Error('wrong error location');

const serialized = serializeRecordLine(['user', 'ada|lovelace', 'line\nbreak', String.raw`slash\value`]);
if (serialized !== String.raw`user|ada\|lovelace|line\nbreak|slash\\value`) {
  throw new Error(`serialized form mismatch: ${serialized}`);
}
const roundTrip = parseRecordLine(serialized);
if (JSON.stringify(roundTrip) !== JSON.stringify(['user', 'ada|lovelace', 'line\nbreak', String.raw`slash\value`])) {
  throw new Error('serialized line did not round-trip');
}
