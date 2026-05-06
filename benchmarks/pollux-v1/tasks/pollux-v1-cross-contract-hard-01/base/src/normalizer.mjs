import { parseLine } from './parser.mjs';

export function normalizeRecord(raw) {
  const record = parseLine(raw);
  return { id: record.id, status: record.status };
}

