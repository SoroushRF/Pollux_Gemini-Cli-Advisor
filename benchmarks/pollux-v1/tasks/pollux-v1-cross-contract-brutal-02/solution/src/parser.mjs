export function parseRecord(raw) {
  const parts = raw.split(':');
  if (parts.length < 3 || parts[0] === '' || parts[1] === '' || parts[2] === '') {
    throw new Error('malformed record');
  }
  const [kind, id, status, meta = ''] = parts;
  return { kind, id, status, meta };
}
