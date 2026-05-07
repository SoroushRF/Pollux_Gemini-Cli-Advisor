import { normalizeRecord } from './normalizer.mjs';

export function renderUser(raw) {
  const record = normalizeRecord(raw);
  const role = record.meta.role ? ` role=${record.meta.role}` : '';
  return `user=${record.id.toUpperCase()} status=${record.status.toLowerCase()}${role}`;
}
