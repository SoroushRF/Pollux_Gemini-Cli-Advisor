function parseMeta(rawMeta) {
  if (rawMeta === '') return {};
  const meta = {};
  for (const part of rawMeta.split(';')) {
    const pieces = part.split('=');
    if (pieces.length !== 2 || pieces[0] === '' || pieces[1] === '') {
      throw new Error('malformed meta');
    }
    meta[pieces[0]] = pieces[1];
  }
  return meta;
}

export function parseRecord(raw) {
  const parts = raw.split(':');
  if (parts.length < 3 || parts.length > 4 || parts[0] === '' || parts[1] === '' || parts[2] === '') {
    throw new Error('malformed record');
  }
  const [kind, id, status, meta = ''] = parts;
  return { kind, id, status, meta: parseMeta(meta) };
}
