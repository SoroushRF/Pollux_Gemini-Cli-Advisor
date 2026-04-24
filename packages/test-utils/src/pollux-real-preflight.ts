/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REAL_BENCHMARK_REQUIRED_DOMAINS } from '../../core/src/pollux/benchmark/realTypes.js';
import {
  PILOT_SENTINEL_TASK_IDS,
  REAL_BENCHMARK_SEED_CORPUS,
} from '../../core/src/pollux/benchmark/realTasks.js';
import type { RealBenchmarkTaskSpec } from '../../core/src/pollux/benchmark/realTypes.js';
import {
  POLLUX_REAL_AUTH_SEED_FILES,
  POLLUX_REAL_ARTIFACT_ROOT,
  POLLUX_REAL_DEFAULT_POWER_ANALYSIS_PATH,
  POLLUX_REAL_DEFAULT_PREREGISTRATION_PATH,
  buildDefaultCampaignManifest,
  collectRealBenchmarkBuildFreshness,
  getDefaultGeminiHome,
  resolveCliEntrypoint,
} from './pollux-real-config.js';
import {
  parsePolluxStatusTag,
  stripPolluxStatusTags,
} from '../../core/src/pollux/prompts.js';
import type {
  RealBenchmarkCampaignManifest,
  RealBenchmarkCorpusStats,
  RealBenchmarkEntrypointPreference,
  RealBenchmarkPreflightReport,
  RealBenchmarkPricingSnapshot,
} from './pollux-real-types.js';

function parseEntrypointPreference(
  value: string | undefined,
): RealBenchmarkEntrypointPreference | undefined {
  if (value === 'auto' || value === 'bundle' || value === 'dev_script') {
    return value;
  }
  return undefined;
}

function computeCorpusSha(tasks: RealBenchmarkTaskSpec[]): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify(
        tasks.map((task) => ({
          id: task.id,
          difficulty: task.difficulty,
          prompt: task.prompt,
          domain: task.domain,
          escalates: task.escalates === true,
          provenance: task.provenance,
        })),
      ),
    )
    .digest('hex');
}

export function buildRealBenchmarkCorpusStats(
  tasks: RealBenchmarkTaskSpec[],
): RealBenchmarkCorpusStats {
  const missingNegativeFixtures = tasks
    .filter((task) => task.negativeFixturePaths.length < 3)
    .map((task) => task.id);
  const missingPositiveFixtures = tasks
    .filter((task) => task.positiveFixturePaths.length < 1)
    .map((task) => task.id);

  return {
    totalTasks: tasks.length,
    difficultyCounts: tasks.reduce<
      Record<'simple' | 'moderate' | 'complex', number>
    >(
      (accumulator, task) => {
        accumulator[task.difficulty] += 1;
        return accumulator;
      },
      {
        simple: 0,
        moderate: 0,
        complex: 0,
      },
    ),
    escalatingCount: tasks.filter((task) => task.escalates === true).length,
    nonEscalatingCount: tasks.filter((task) => task.escalates !== true).length,
    domainCoverage: [...new Set(tasks.map((task) => task.domain))].sort(),
    missingProvenance: tasks
      .filter((task) => task.provenance.sourceRef.trim().length === 0)
      .map((task) => task.id),
    tasksMissingPositiveFixtures: missingPositiveFixtures,
    tasksMissingNegativeFixtures: missingNegativeFixtures,
  };
}

export function loadPricingSnapshotFromPath(
  pricingSnapshotPath?: string,
): RealBenchmarkPricingSnapshot | undefined {
  if (!pricingSnapshotPath) {
    return undefined;
  }
  if (!fs.existsSync(pricingSnapshotPath)) {
    return undefined;
  }
  const snapshot = JSON.parse(
    fs.readFileSync(pricingSnapshotPath, 'utf8'),
  ) as RealBenchmarkPricingSnapshot;
  const looksLikeTemplate =
    snapshot.id.toLowerCase().includes('template') ||
    snapshot.sourceUrl.includes('example.com') ||
    Object.values(snapshot.models).every(
      (pricing) =>
        pricing.inputUsdPerMillion === 0 &&
        pricing.outputUsdPerMillion === 0 &&
        (pricing.cachedInputUsdPerMillion ?? 0) === 0,
    );
  return looksLikeTemplate ? undefined : snapshot;
}

export function buildRealBenchmarkPreflightReport(
  manifest: RealBenchmarkCampaignManifest,
  tasks: RealBenchmarkTaskSpec[],
  pricingSnapshot?: RealBenchmarkPricingSnapshot,
  explicitBinaryPath?: string,
  entrypointPreference?: RealBenchmarkEntrypointPreference,
): RealBenchmarkPreflightReport {
  const corpus = buildRealBenchmarkCorpusStats(tasks);
  const cliEntrypoint = resolveCliEntrypoint(
    explicitBinaryPath,
    entrypointPreference,
  );
  const buildFreshness = collectRealBenchmarkBuildFreshness();
  const selfReportSmokeTest = {
    validStatusTagParsed:
      parsePolluxStatusTag(
        '<pollux:status stuck_on="ci fails on windows" next="inspect logs"/>',
      )[0]?.stuckOn === 'ci fails on windows',
    malformedStatusTagRejected:
      parsePolluxStatusTag(
        '<pollux:statusstuck_on="ci fails on windows" next="inspect logs"/>',
      ).length === 0,
    validStatusTagStripped:
      stripPolluxStatusTags(
        'x <pollux:status stuck_on="ci fails on windows" next="inspect logs"/> y',
      ) === 'x y',
  };
  const authSeedHome = getDefaultGeminiHome();
  const presentFiles = POLLUX_REAL_AUTH_SEED_FILES.filter((fileName) =>
    fs.existsSync(path.join(authSeedHome, fileName)),
  );
  const missingFiles = POLLUX_REAL_AUTH_SEED_FILES.filter(
    (fileName) => !presentFiles.includes(fileName),
  );

  const runBlockers: string[] = [];
  const publishabilityBlockers: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(cliEntrypoint.path)) {
    runBlockers.push(`CLI entrypoint does not exist: ${cliEntrypoint.path}`);
  }

  if (manifest.canonicalSurface !== 'headless_non_interactive_cli') {
    runBlockers.push(
      'Canonical surface must remain headless_non_interactive_cli for real benchmarks.',
    );
  }

  if (
    manifest.authIsolationMode === 'single_account' &&
    !presentFiles.includes('oauth_creds.json')
  ) {
    runBlockers.push(
      'Single-account pilot mode requires an existing OAuth seed at ~/.gemini/oauth_creds.json.',
    );
  }

  if (manifest.mode === 'publishable') {
    if (!cliEntrypoint.publishableEligible) {
      publishabilityBlockers.push(
        'Publishable campaigns must use a built bundle or explicit binary, not the dev start script fallback.',
      );
    }
    if (buildFreshness.repoDirty) {
      publishabilityBlockers.push(
        `Publishable campaigns require a clean git worktree; observed ${buildFreshness.dirtyStatus.length} dirty paths.`,
      );
    }
    if (!buildFreshness.sourceCommitsMatchHead) {
      publishabilityBlockers.push(
        'Generated source git-commit metadata does not match HEAD; run the build before publishable campaigns.',
      );
    }
    if (!buildFreshness.distCommitsMatchSource) {
      publishabilityBlockers.push(
        'Built dist git-commit metadata does not match source metadata; run npm run build before publishable campaigns.',
      );
    }
    if (manifest.authIsolationMode !== 'isolated_keys') {
      publishabilityBlockers.push(
        'Publishable campaigns require isolated benchmark credentials or quota windows.',
      );
    }
  } else if (!cliEntrypoint.publishableEligible) {
    warnings.push(
      'Using the dev start-script fallback is acceptable for pilot debugging, but not for publishable evidence.',
    );
  }

  if (buildFreshness.repoDirty) {
    warnings.push(
      `Benchmark build freshness check saw ${buildFreshness.dirtyStatus.length} dirty paths; pilot runs may be useful for debugging but are not publishable evidence.`,
    );
  }
  if (!buildFreshness.distCommitsMatchSource) {
    warnings.push(
      'Dist git-commit metadata is stale relative to source metadata; rebuild before trusting bundle-backed benchmark evidence.',
    );
  }
  if (
    !selfReportSmokeTest.validStatusTagParsed ||
    !selfReportSmokeTest.malformedStatusTagRejected ||
    !selfReportSmokeTest.validStatusTagStripped
  ) {
    runBlockers.push(
      'Synthetic Pollux self-report smoke test failed; status-tag parsing/stripping is not trustworthy enough to run live benchmarks.',
    );
  }

  if (corpus.totalTasks < 24) {
    publishabilityBlockers.push(
      `Corpus currently has ${corpus.totalTasks} tasks; real-model methodology requires at least 24.`,
    );
  }
  for (const difficulty of ['simple', 'moderate', 'complex'] as const) {
    if (corpus.difficultyCounts[difficulty] < 8) {
      publishabilityBlockers.push(
        `Corpus has ${corpus.difficultyCounts[difficulty]} ${difficulty} tasks; methodology requires at least 8.`,
      );
    }
  }
  if (corpus.escalatingCount < 8) {
    publishabilityBlockers.push(
      `Corpus has ${corpus.escalatingCount} escalating tasks; methodology requires at least 8.`,
    );
  }
  if (corpus.nonEscalatingCount < 8) {
    publishabilityBlockers.push(
      `Corpus has ${corpus.nonEscalatingCount} non-escalating tasks; methodology requires at least 8.`,
    );
  }

  const missingDomains = REAL_BENCHMARK_REQUIRED_DOMAINS.filter(
    (domain) => !corpus.domainCoverage.includes(domain),
  );
  if (missingDomains.length > 0) {
    publishabilityBlockers.push(
      `Corpus is missing required domains: ${missingDomains.join(', ')}.`,
    );
  }
  if (corpus.missingProvenance.length > 0) {
    publishabilityBlockers.push(
      `Tasks missing provenance metadata: ${corpus.missingProvenance.join(', ')}.`,
    );
  }
  if (corpus.tasksMissingPositiveFixtures.length > 0) {
    publishabilityBlockers.push(
      `Tasks missing positive fixtures: ${corpus.tasksMissingPositiveFixtures.join(', ')}.`,
    );
  }
  if (corpus.tasksMissingNegativeFixtures.length > 0) {
    publishabilityBlockers.push(
      `Tasks missing the required three negative fixtures: ${corpus.tasksMissingNegativeFixtures.join(', ')}.`,
    );
  }

  if (!pricingSnapshot) {
    publishabilityBlockers.push(
      'A frozen pricing snapshot is required before reporting real-model USD costs.',
    );
  }

  if (
    !manifest.preregistrationPath ||
    !fs.existsSync(manifest.preregistrationPath)
  ) {
    publishabilityBlockers.push(
      'A preregistration artifact must exist before any publishable campaign starts.',
    );
  }
  if (
    !manifest.powerAnalysisPath ||
    !fs.existsSync(manifest.powerAnalysisPath)
  ) {
    publishabilityBlockers.push(
      'A power-analysis artifact must exist before any publishable campaign starts.',
    );
  }

  if (manifest.mode === 'pilot') {
    warnings.push(
      'Pilot mode is intentionally non-publishable even when runs are valid. Use it to harden the pipeline, tasks, and cost expectations.',
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    manifest,
    cliEntrypoint: {
      kind: cliEntrypoint.kind,
      path: cliEntrypoint.path,
      publishableEligible: cliEntrypoint.publishableEligible,
    },
    buildFreshness,
    selfReportSmokeTest,
    corpus,
    authSeed: {
      mode: manifest.authIsolationMode,
      sourceHome: authSeedHome,
      presentFiles,
      missingFiles,
    },
    pricingSnapshot: {
      provided: pricingSnapshot !== undefined,
      valid: pricingSnapshot !== undefined,
      snapshotId: pricingSnapshot?.id ?? null,
    },
    runBlockers,
    publishabilityBlockers: [...new Set(publishabilityBlockers)],
    warnings,
  };
}

export function renderRealBenchmarkPreflightReport(
  report: RealBenchmarkPreflightReport,
): string {
  const lines: string[] = [];

  lines.push('# Pollux Real-Model Benchmark Preflight');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Campaign: ${report.manifest.campaignId}`);
  lines.push(`Mode: ${report.manifest.mode}`);
  lines.push(`Canonical surface: ${report.manifest.canonicalSurface}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1) Entrypoint');
  lines.push('');
  lines.push(`- Kind: ${report.cliEntrypoint.kind}`);
  lines.push(`- Path: \`${report.cliEntrypoint.path}\``);
  lines.push(
    `- Publishable eligible: ${report.cliEntrypoint.publishableEligible ? 'yes' : 'no'}`,
  );
  lines.push(`- Git HEAD: \`${report.buildFreshness.gitHead}\``);
  lines.push(
    `- Dirty worktree: ${report.buildFreshness.repoDirty ? `yes (${report.buildFreshness.dirtyStatus.length} paths)` : 'no'}`,
  );
  lines.push(
    `- Source git metadata matches HEAD: ${report.buildFreshness.sourceCommitsMatchHead ? 'yes' : 'no'}`,
  );
  lines.push(
    `- Dist git metadata matches source: ${report.buildFreshness.distCommitsMatchSource ? 'yes' : 'no'}`,
  );
  lines.push(
    `- Self-report smoke: parsed=${report.selfReportSmokeTest.validStatusTagParsed ? 'yes' : 'no'}, malformed rejected=${report.selfReportSmokeTest.malformedStatusTagRejected ? 'yes' : 'no'}, stripped=${report.selfReportSmokeTest.validStatusTagStripped ? 'yes' : 'no'}`,
  );
  lines.push('');
  lines.push('## 2) Corpus');
  lines.push('');
  lines.push(`- Total tasks: ${report.corpus.totalTasks}`);
  lines.push(
    `- Difficulty counts: simple=${report.corpus.difficultyCounts.simple}, moderate=${report.corpus.difficultyCounts.moderate}, complex=${report.corpus.difficultyCounts.complex}`,
  );
  lines.push(`- Escalating tasks: ${report.corpus.escalatingCount}`);
  lines.push(`- Non-escalating tasks: ${report.corpus.nonEscalatingCount}`);
  lines.push(`- Domain coverage: ${report.corpus.domainCoverage.join(', ')}`);
  lines.push('');
  lines.push('## 3) Auth and pricing');
  lines.push('');
  lines.push(`- Auth mode: ${report.authSeed.mode}`);
  lines.push(`- Auth seed home: \`${report.authSeed.sourceHome}\``);
  lines.push(
    `- Present auth files: ${report.authSeed.presentFiles.length > 0 ? report.authSeed.presentFiles.join(', ') : 'none'}`,
  );
  lines.push(
    `- Pricing snapshot: ${report.pricingSnapshot.provided ? (report.pricingSnapshot.snapshotId ?? 'provided') : 'not provided'}`,
  );
  lines.push('');
  lines.push('## 4) Run blockers');
  lines.push('');
  if (report.runBlockers.length === 0) {
    lines.push('- None');
  } else {
    for (const blocker of report.runBlockers) {
      lines.push(`- ${blocker}`);
    }
  }
  lines.push('');
  lines.push('## 5) Publishability blockers');
  lines.push('');
  if (report.publishabilityBlockers.length === 0) {
    lines.push('- None');
  } else {
    for (const blocker of report.publishabilityBlockers) {
      lines.push(`- ${blocker}`);
    }
  }
  lines.push('');
  lines.push('## 6) Warnings');
  lines.push('');
  if (report.warnings.length === 0) {
    lines.push('- None');
  } else {
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join('\n');
}

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

async function main() {
  const campaignId =
    parseArg('--campaign-id') ??
    `pilot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const taskIds = parseArg('--task-ids')
    ?.split(',')
    .map((value) => value.trim()) ?? [...PILOT_SENTINEL_TASK_IDS];
  const selectedTasks = REAL_BENCHMARK_SEED_CORPUS.filter((task) =>
    taskIds.includes(task.id),
  );
  const manifest = buildDefaultCampaignManifest(campaignId, taskIds);
  const pricingSnapshotPath = parseArg('--pricing-snapshot');
  if (pricingSnapshotPath) {
    manifest.pricingSnapshotPath = pricingSnapshotPath;
  }
  manifest.preregistrationPath =
    parseArg('--preregistration-path') ??
    POLLUX_REAL_DEFAULT_PREREGISTRATION_PATH;
  manifest.powerAnalysisPath =
    parseArg('--power-analysis-path') ??
    POLLUX_REAL_DEFAULT_POWER_ANALYSIS_PATH;

  const pricingSnapshot = loadPricingSnapshotFromPath(
    manifest.pricingSnapshotPath,
  );
  const report = buildRealBenchmarkPreflightReport(
    manifest,
    REAL_BENCHMARK_SEED_CORPUS,
    pricingSnapshot,
    parseArg('--binary-path'),
    parseEntrypointPreference(parseArg('--entrypoint')),
  );

  const artifactRoot = path.join(POLLUX_REAL_ARTIFACT_ROOT, campaignId);
  fs.mkdirSync(artifactRoot, { recursive: true });
  writeJson(path.join(artifactRoot, 'preflight.json'), report);
  fs.writeFileSync(
    path.join(artifactRoot, 'preflight.md'),
    renderRealBenchmarkPreflightReport(report),
  );
  writeJson(path.join(artifactRoot, 'corpus-lock.json'), {
    corpusSha: computeCorpusSha(selectedTasks),
    taskIds: selectedTasks.map((task) => task.id),
  });
}

const currentFilePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (currentFilePath === invokedPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { computeCorpusSha };
