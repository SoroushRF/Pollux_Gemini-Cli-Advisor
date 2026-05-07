import { parseRecords, parseRecordLine, ParseRecordError } from '../../src/records.mjs';

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
