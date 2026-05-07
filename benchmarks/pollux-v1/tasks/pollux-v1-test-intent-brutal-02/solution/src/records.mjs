export class ParseRecordError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = 'ParseRecordError';
    this.line = line;
    this.column = column;
  }
}

function parseLineInternal(line, lineNumber) {
  const fields = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\') {
      if (i === line.length - 1) {
        throw new ParseRecordError('Dangling escape', lineNumber, i + 1);
      }
      const next = line[i + 1];
      if (next === '|' || next === '\\' || next === 'n') {
        current += next === 'n' ? '\n' : next;
        i += 1;
        continue;
      }
      current += next;
      i += 1;
      continue;
    }
    if (char === '|') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseRecordLine(line) {
  return parseLineInternal(line, 1);
}

export function parseRecords(text) {
  const records = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || line.startsWith('#')) continue;
    records.push(parseLineInternal(line, index + 1));
  }
  return records;
}
