export function parseRecordLine(line) {
  return line.split('|');
}

export function parseRecords(text) {
  return text.split('\n').map(parseRecordLine);
}
