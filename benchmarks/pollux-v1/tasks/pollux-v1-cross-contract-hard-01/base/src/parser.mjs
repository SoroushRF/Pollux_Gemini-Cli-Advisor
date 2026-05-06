export function parseRecord(raw) {
  const [kind, id, status] = raw.split(':');
  return { kind, id, status };
}

