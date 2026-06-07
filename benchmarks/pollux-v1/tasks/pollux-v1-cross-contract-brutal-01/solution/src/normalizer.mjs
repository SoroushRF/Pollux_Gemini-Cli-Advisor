import { parseRecord } from './parser.mjs';

export function normalizeRecord(raw) {
  const record = parseRecord(raw);
  if (record.kind !== 'user') {
    throw new Error(`unsupported kind: ${record.kind}`);
  }
  return {
    id: record.id.toUpperCase(),
    status: record.status.toLowerCase(),
  };
}
