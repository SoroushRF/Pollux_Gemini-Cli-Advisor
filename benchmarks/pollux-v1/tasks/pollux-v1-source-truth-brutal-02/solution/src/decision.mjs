import { readFileSync } from 'node:fs';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function repositorySources() {
  return {
    defaults: readJson('config/defaults.json'),
    release: readJson('plans/release.json'),
    environment: readJson('config/environment.json'),
  };
}

export function resolveRuntimeDecision(optionalSources) {
  const sources = optionalSources ?? repositorySources();
  return {
    region: sources.environment.region ?? sources.release.region ?? sources.defaults.region,
    mode: sources.environment.mode ?? sources.release.mode ?? sources.defaults.mode,
    guard: sources.environment.guard ?? sources.release.guard ?? sources.defaults.guard,
  };
}

export const runtimeDecision = resolveRuntimeDecision();
