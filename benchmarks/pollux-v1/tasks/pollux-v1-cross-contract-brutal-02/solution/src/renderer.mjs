import { normalizeRecord } from './normalizer.mjs';

export function renderUser(raw) {
  const record = normalizeRecord(raw);
  return `user=${record.id.toUpperCase()} status=${record.status.toLowerCase()}`;
}
