const aliases = new Map([
  ['usr', 'user'],
  ['member', 'user'],
]);

export function resolveKind(kind) {
  return aliases.get(kind) ?? kind;
}
