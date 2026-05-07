import { readFileSync } from 'node:fs';

export function resolvePolicy({ policy, defaults }) {
  return { ...defaults, ...policy };
}

const policyConfig = JSON.parse(readFileSync('config/policy.json', 'utf8'));
const defaultConfig = JSON.parse(readFileSync('config/defaults.json', 'utf8'));

export const policy = resolvePolicy({ policy: policyConfig, defaults: defaultConfig });
