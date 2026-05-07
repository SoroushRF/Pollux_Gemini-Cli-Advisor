export function parseRecord(raw) {
  const [kind, id, status, meta = ''] = raw.split(':');
  return { kind, id, status, meta };
}
