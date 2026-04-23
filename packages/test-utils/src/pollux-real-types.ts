/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RealBenchmarkTaskSpec } from '../../core/src/pollux/benchmark/realTypes.js';

export type RealBenchmarkConditionId = 'A' | 'E' | 'F';
export type RealBenchmarkCampaignMode =
  | 'pilot'
  | 'dress_rehearsal'
  | 'publishable';
export type RealBenchmarkRunVenue = 'local' | 'ci';
export type RealBenchmarkAuthIsolationMode = 'single_account' | 'isolated_keys';
export type RealBenchmarkEscalationTiming = 'same_turn' | 'next_turn';
export type RealBenchmarkEscalationOutcome =
  | 'consulted'
  | 'fail_open'
  | 'budget_exhausted'
  | 'policy_denied'
  | 'deferred_next_turn'
  | 'skipped';
export type RealBenchmarkConfusionExclusion = 'budget_exhausted' | 'fail_open';

export interface RealBenchmarkConditionProfile {
  id: RealBenchmarkConditionId;
  executorModel: string;
  advisorModel?: string;
  polluxEnabled: boolean;
  settingsOverrides: Record<string, unknown>;
  authProfile: string;
  publishableEligible: boolean;
}

export interface RealBenchmarkPricingModel {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
}

export interface RealBenchmarkPricingSnapshot {
  id: string;
  capturedAt: string;
  sourceUrl: string;
  notes?: string;
  models: Record<string, RealBenchmarkPricingModel>;
}

export interface RealBenchmarkCostBreakdown {
  total: number | null;
  advisor: number | null;
  executor: number | null;
  pricingSnapshotId: string | null;
}

export interface RealBenchmarkTelemetrySummary {
  promptIds: string[];
  responseIds: string[];
  serviceLatencyMs: number[];
  advisorCalls: number;
  escalationEvents: RealBenchmarkEscalationEvent[];
  tokens: {
    total: number;
    advisor: number;
    executor: number;
  };
  costUsd: RealBenchmarkCostBreakdown;
  utilityRoleCounts: Readonly<Record<string, number>>;
}

export interface RealBenchmarkEscalationEvent {
  turnId: string | null;
  reasonCode: string | null;
  escalationTiming: RealBenchmarkEscalationTiming | null;
  outcome: RealBenchmarkEscalationOutcome | null;
  sameTurnDowngraded: boolean;
  pauseBoundary: 'pre_tool' | 'post_event' | null;
  contributingSignalIds: string[];
  failureKind: string | null;
  eventIndex: number;
}

export interface RealBenchmarkRunRecord {
  campaignId: string;
  sampleId: string;
  taskId: string;
  conditionId: RealBenchmarkConditionId;
  sampleIndex: number;
  gitSha: string;
  lockfileHash: string;
  corpusSha: string;
  promptId: string | null;
  responseIds: string[];
  wallClockMs: number;
  serviceLatencyMs: number[];
  tokens: {
    total: number;
    advisor: number;
    executor: number;
  };
  costUsd: RealBenchmarkCostBreakdown;
  observedAdvisorCalls: number;
  escalationEvents: RealBenchmarkEscalationEvent[];
  escalationTiming: RealBenchmarkEscalationTiming[];
  reasonCodes: string[];
  excludedFromConfusion: RealBenchmarkConfusionExclusion | null;
  fairnessPins: {
    routerPinned: boolean;
    loopDetectionDisabled: boolean;
    availabilityReset: boolean;
    dynamicConfigFixed: boolean;
    sessionIsolated: boolean;
    sandboxIsolated: boolean;
  };
  oraclePass: boolean;
  invalidated: boolean;
  invalidationReason?: string;
  exitCode: number | null;
  taskEscalates: boolean;
  workspaceDir: string;
  homeDir: string;
  telemetryPath: string;
  stdoutPath: string;
  stderrPath: string;
}

export interface RealBenchmarkCampaignManifest {
  campaignId: string;
  mode: RealBenchmarkCampaignMode;
  runVenue: RealBenchmarkRunVenue;
  authIsolationMode: RealBenchmarkAuthIsolationMode;
  repeatsPerCell: number;
  conditions: RealBenchmarkConditionProfile[];
  pricingSnapshotPath?: string;
  preregistrationPath?: string;
  powerAnalysisPath?: string;
  canonicalSurface: 'headless_non_interactive_cli';
  selectedTaskIds: string[];
}

export interface RealBenchmarkCorpusStats {
  totalTasks: number;
  difficultyCounts: Record<'simple' | 'moderate' | 'complex', number>;
  escalatingCount: number;
  nonEscalatingCount: number;
  domainCoverage: string[];
  missingProvenance: string[];
  tasksMissingPositiveFixtures: string[];
  tasksMissingNegativeFixtures: string[];
}

export interface RealBenchmarkPreflightReport {
  generatedAt: string;
  manifest: RealBenchmarkCampaignManifest;
  cliEntrypoint: {
    kind: 'bundle' | 'binary' | 'dev_script';
    path: string;
    publishableEligible: boolean;
  };
  corpus: RealBenchmarkCorpusStats;
  authSeed: {
    mode: RealBenchmarkAuthIsolationMode;
    sourceHome: string;
    presentFiles: string[];
    missingFiles: string[];
  };
  pricingSnapshot: {
    provided: boolean;
    valid: boolean;
    snapshotId: string | null;
  };
  runBlockers: string[];
  publishabilityBlockers: string[];
  warnings: string[];
}

export interface RealBenchmarkConditionSummary {
  conditionId: RealBenchmarkConditionId;
  sampleCount: number;
  validSamples: number;
  invalidSamples: number;
  accuracy: number;
  advisorCalls: number;
  totalTokens: number;
  advisorTokens: number;
  executorTokens: number;
  totalCostUsd: number | null;
  meanWallClockMs: number;
  meanServiceLatencyMs: number;
}

export interface RealBenchmarkEscalationConfusionSummary {
  includedSampleCount: number;
  predictedPositive: number;
  expectedPositive: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number | null;
  recall: number | null;
  exclusionCounts: {
    budgetExhausted: number;
    failOpen: number;
  };
}

export interface RealBenchmarkEscalationTimingSummary {
  timing: RealBenchmarkEscalationTiming;
  includedSampleCount: number;
  predictedPositive: number;
  expectedPositive: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number | null;
  recall: number | null;
}

export interface RealBenchmarkCampaignSummary {
  generatedAt: string;
  manifest: RealBenchmarkCampaignManifest;
  corpusSha: string;
  sampleCount: number;
  validSampleCount: number;
  invalidSampleCount: number;
  conditionSummaries: RealBenchmarkConditionSummary[];
  escalation: RealBenchmarkEscalationConfusionSummary;
  escalationTiming: RealBenchmarkEscalationTimingSummary[];
  reasonCodeCounts: Record<string, number>;
  publishabilityBlockers: string[];
}

export interface PolluxRealPilotOptions {
  manifest: RealBenchmarkCampaignManifest;
  tasks: RealBenchmarkTaskSpec[];
  artifactRoot: string;
  pricingSnapshot?: RealBenchmarkPricingSnapshot;
  binaryPath?: string;
  keepScratchDirectories?: boolean;
}
