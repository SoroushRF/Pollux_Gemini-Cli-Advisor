import { readFileSync } from 'node:fs';

export function resolvePolicy({ policy = {}, defaults = {}, environment = {} }) {
  const resolved = { ...defaults, ...policy };
  if (environment.rollout !== undefined) {
    resolved.rollout = environment.rollout;
  }
  if (environment.disableStrict === true && resolved.mode === 'strict') {
    resolved.mode = 'observe';
  }
  return resolved;
}

const policyConfig = JSON.parse(readFileSync('config/policy.json', 'utf8'));
const defaultConfig = JSON.parse(readFileSync('config/defaults.json', 'utf8'));
const environmentConfig = JSON.parse(readFileSync('config/environment.json', 'utf8'));

export const policy = resolvePolicy({
  policy: policyConfig,
  defaults: defaultConfig,
  environment: environmentConfig,
});
