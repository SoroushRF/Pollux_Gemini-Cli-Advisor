const kindAliases = new Map([
  ['usr', 'user'],
  ['member', 'user'],
]);

const statusAliases = new Map([
  ['on', 'ACTIVE'],
  ['off', 'DISABLED'],
  ['hold', 'PENDING'],
]);

export function resolveKind(kind) {
  return kindAliases.get(kind) ?? kind;
}

export function resolveStatus(status) {
  return statusAliases.get(status.toLowerCase()) ?? status;
}
