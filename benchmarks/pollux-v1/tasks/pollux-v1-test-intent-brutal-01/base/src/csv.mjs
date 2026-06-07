export function parseCsvLine(line) {
  return line.split(',').filter((field) => field.length > 0);
}
