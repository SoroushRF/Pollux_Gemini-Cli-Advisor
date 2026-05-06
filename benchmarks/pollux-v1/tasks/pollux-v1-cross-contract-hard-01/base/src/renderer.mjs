import { normalizeRecord } from './normalizer.mjs';

export function renderUser(raw) {
  const record = normalizeRecord(raw);
  return `user=${record.id} status=${record.status}`;
}

