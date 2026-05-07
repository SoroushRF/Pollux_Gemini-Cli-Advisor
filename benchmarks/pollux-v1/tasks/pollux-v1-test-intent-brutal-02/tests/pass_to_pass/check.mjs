import { readFileSync } from 'node:fs';
import { parseRecordLine, parseRecords, serializeRecordLine, ParseRecordError } from '../../src/records.mjs';

if (JSON.stringify(parseRecordLine('user|ada|active')) !== JSON.stringify(['user', 'ada', 'active'])) throw new Error('simple parsing regressed');
if (parseRecords('# ignored\nuser|a|b').length !== 1) throw new Error('comment parsing failed');
if (typeof serializeRecordLine !== 'function') throw new Error('serializeRecordLine export missing');
if (typeof ParseRecordError !== 'function') throw new Error('ParseRecordError export missing');
const source = readFileSync('src/records.mjs', 'utf8');
if (source.includes('ada|lovelace')) throw new Error('fixture-specific parser branch detected');
if (!readFileSync('docs/record-contract.md', 'utf8').includes('line and column')) throw new Error('docs changed');
