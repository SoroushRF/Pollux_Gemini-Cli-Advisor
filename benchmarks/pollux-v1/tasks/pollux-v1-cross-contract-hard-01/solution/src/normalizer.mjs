import { parseRecord } from './parser.mjs';

export function normalizeRecord(raw) {
  const record = parseRecord(raw);
  return { id: record.id.toUpperCase(), status: record.status.toLowerCase() };
}

