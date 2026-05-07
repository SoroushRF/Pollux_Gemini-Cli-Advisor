import { parseRecord } from './parser.mjs';
import { resolveKind } from './resolver.mjs';

export function normalizeRecord(raw) {
  const record = parseRecord(raw);
  const kind = resolveKind(record.kind);
  if (kind !== 'user') {
    throw new Error(`unsupported kind: ${record.kind}`);
  }
  return { kind, id: record.id, status: record.status, meta: record.meta };
}
