import { parseRecordLine } from '../src/records.mjs';

const parsed = parseRecordLine('user|ada|active');
if (JSON.stringify(parsed) !== JSON.stringify(['user', 'ada', 'active'])) {
  throw new Error('public record smoke failed');
}
