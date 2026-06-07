import { parseLine } from './parser.mjs';

export function normalizeRecord(raw) {
  const record = parseLine(raw);
  if (record.kind !== 'user') {
    throw new Error(`unsupported kind: ${record.kind}`);
  }
  const [, id, status] = raw.split(':');
  return { id, status };
}
