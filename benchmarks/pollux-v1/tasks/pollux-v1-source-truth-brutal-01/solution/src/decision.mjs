import { readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function resolveRuntimeDecision(sources = {
  defaults: readJson('config/defaults.json'),
  release: readJson('plans/release.json'),
  environment: readJson('config/environment.json'),
}) {
  return {
    region: sources.environment.region ?? sources.release.region ?? sources.defaults.region,
    mode: sources.environment.mode ?? sources.release.mode ?? sources.defaults.mode,
    guard: sources.environment.guard ?? sources.release.guard ?? sources.defaults.guard,
  };
}

export const runtimeDecision = resolveRuntimeDecision();
