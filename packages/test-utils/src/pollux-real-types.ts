/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RealBenchmarkTaskSpec } from '../../core/src/pollux/benchmark/realTypes.js';
import type { RealBenchmarkLane } from '../../core/src/pollux/benchmark/realTypes.js';

export type RealBenchmarkConditionId = 'A' | 'E' | 'F';
export type RealBenchmarkCampaignMode =
  | 'pilot'
  | 'dress_rehearsal'
  | 'publishable';
export type RealBenchmarkRunVenue = 'local' | 'ci';
export type RealBenchmarkAuthIsolationMode = 'single_account' | 'isolated_keys';
export type RealBenchmarkEscalationTiming = 'same_turn' | 'next_turn';
export type RealBenchmarkEscalationTimingBucket =
  | RealBenchmarkEscalationTiming
  | 'missing_event';
export type RealBenchmarkEscalationOutcome =
  | 'consulted'
  | 'fail_open'
  | 'budget_exhausted'
  | 'policy_denied'
  | 'deferred_next_turn'
  | 'skipped';
export type RealBenchmarkAdvisorConsultOutcome =
  | 'not_expected'
  | 'not_attempted'
  | 'consulted'
  | 'fail_open'
  | 'budget_exhausted'
  | 'policy_denied';
export type RealBenchmarkAdvisorAttemptKind =
  | 'primary'
  | 'repair_retry'
  | 'fallback';
export type RealBenchmarkAdvisorAttemptOutcome =
  | 'consulted'
  | 'parse_error'
  | 'empty_response'
  | 'timeout'
  | 'capacity_exhausted'
  | 'quota_exhausted';
export type RealBenchmarkAdvisorParserOutcome =
  | 'direct'
  | 'recovered_fence'
  | 'recovered_substring'
  | 'parse_error'
  | 'malformed_json'
  | 'schema'
  | 'empty_response'
  | 'timeout'
  | 'capacity_exhausted'
  | 'quota_exhausted';
export type RealBenchmarkConfusionExclusion = 'budget_exhausted' | 'fail_open';
export type RealBenchmarkConfusionOutcome =
  | 'true_positive'
  | 'false_positive'
  | 'false_negative'
  | 'true_negative'
  | 'excluded';
export type RealBenchmarkDesiredOutcomeReasonCode =
  | 'core.oracle_pass'
  | 'core.oracle_failed'
  | 'core.invalidated'
  | 'stress.oracle_pass'
  | 'stress.oracle_failed'
  | 'stress.invalidated'
  | 'canary.true_negative'
  | 'canary.consulted_true_positive'
  | 'canary.fail_open'
  | 'canary.budget_exhausted'
  | 'canary.policy_denied'
  | 'canary.oracle_failed'
  | 'canary.missed_escalation'
  | 'canary.unexpected_escalation'
  | 'canary.predicted_without_consult'
  | 'canary.invalidated';
export type RealBenchmarkEntrypointPreference =
  | 'auto'
  | 'bundle'
  | 'dev_script';
export type RealBenchmarkInvalidationReason =
  | 'auth_failure'
  | 'rate_limit_contamination'
  | 'model_capacity_exhausted'
  | 'cli_exit_nonzero'
  | 'run_timeout'
  | 'model_call_ceiling_exceeded'
  | 'missing_telemetry'
  | 'missing_prompt_id'
  | 'missing_response_id'
  | 'fairness_pin_failure';

export interface RealBenchmarkStructuredErrorEvidence {
  source: 'process' | 'stderr';
  exitCode: number | null;
  exitCodeHex: string | null;
  matchedStatus: number | null;
  matchedReason: string | null;
  matchedCode: string | null;
  messageSnippet: string | null;
}

export interface RealBenchmarkBuildFreshness {
  gitHead: string;
  repoDirty: boolean;
  dirtyStatus: string[];
  cliSourceGitCommit: string | null;
  cliDistGitCommit: string | null;
  coreSourceGitCommit: string | null;
  coreDistGitCommit: string | null;
  sourceCommitsMatchHead: boolean;
  distCommitsMatchSource: boolean;
}

export interface RealBenchmarkConditionProfile {
  id: RealBenchmarkConditionId;
  executorModel: string;
  advisorModel?: string;
  advisorFallbackModel?: string | null;
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
  advisorAttempts: RealBenchmarkAdvisorAttemptRecord[];
  escalationAttemptCount: number;
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

export interface RealBenchmarkAdvisorAttemptRecord {
  turnId: string | null;
  reasonCode: string | null;
  escalationTiming: RealBenchmarkEscalationTiming | null;
  attemptIndex: number;
  attemptKind: RealBenchmarkAdvisorAttemptKind;
  model: string | null;
  parserOutcome: RealBenchmarkAdvisorParserOutcome | null;
  outcome: RealBenchmarkAdvisorAttemptOutcome | null;
  failureKind: string | null;
  eventIndex: number;
}

export interface RealBenchmarkRunRecord {
  campaignId: string;
  sampleId: string;
  taskId: string;
  conditionId: RealBenchmarkConditionId;
  sampleIndex: number;
  benchmarkLane: RealBenchmarkLane;
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
  observedEscalationAttempts: number;
  polluxEscalationTelemetryCount: number;
  stdoutStatusTagCount: number;
  malformedStatusTagCount: number;
  nearMissStatusTagCount: number;
  stderrWorkspacePathViolationCount: number;
  toolErrorCount: number;
  advisorAttempts: RealBenchmarkAdvisorAttemptRecord[];
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
  invalidationReason?: RealBenchmarkInvalidationReason;
  structuredErrorEvidence: RealBenchmarkStructuredErrorEvidence | null;
  exitCode: number | null;
  timedOut: boolean;
  modelResponseCount: number;
  expectedEscalation: boolean;
  predictedEscalation: boolean;
  confusionOutcome: RealBenchmarkConfusionOutcome;
  desiredOutcomeSatisfied: boolean;
  desiredOutcomeReasonCode: RealBenchmarkDesiredOutcomeReasonCode;
  advisorConsultOutcome: RealBenchmarkAdvisorConsultOutcome;
  advisorFailureKind: string | null;
  entrypointKind: 'bundle' | 'binary' | 'dev_script';
  entrypointPath: string;
  buildFreshness: RealBenchmarkBuildFreshness;
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
  buildFreshness: RealBenchmarkBuildFreshness;
  selfReportSmokeTest: {
    validStatusTagParsed: boolean;
    malformedStatusTagRejected: boolean;
    validStatusTagStripped: boolean;
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
  escalationAttempts: number;
  totalTokens: number;
  advisorTokens: number;
  executorTokens: number;
  totalCostUsd: number | null;
  meanWallClockMs: number;
  meanServiceLatencyMs: number;
}

export interface RealBenchmarkRateInterval {
  n: number;
  proportion: number | null;
  lower: number | null;
  upper: number | null;
}

export interface RealBenchmarkNumericStats {
  n: number;
  mean: number;
  median: number;
  stddev: number;
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
  timing: RealBenchmarkEscalationTimingBucket;
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

export interface RealBenchmarkLaneConditionSummary {
  lane: RealBenchmarkLane;
  conditionId: RealBenchmarkConditionId;
  sampleCount: number;
  validSamples: number;
  invalidSamples: number;
  oraclePassCount: number;
  desiredOutcomeSatisfiedCount: number;
  desiredOutcomeSatisfactionRate: number;
  advisorCalls: number;
  escalationAttempts: number;
  totalTokens: number;
  advisorTokens: number;
  executorTokens: number;
  meanWallClockMs: number;
  meanServiceLatencyMs: number;
}

export interface RealBenchmarkCanaryConsultSummary {
  expectedPositiveSampleCount: number;
  validExpectedPositiveSampleCount: number;
  attempted: number;
  consulted: number;
  failOpen: number;
  budgetExhausted: number;
  policyDenied: number;
  notAttempted: number;
  consultSuccessRate: number | null;
  consultSuccessWilson95: RealBenchmarkRateInterval;
}

export interface RealBenchmarkStressSummary {
  sampleCount: number;
  validSampleCount: number;
  invalidSampleCount: number;
  modelCallCeilingExceededCount: number;
  invalidationReasonCounts: Record<string, number>;
  meanModelResponseCount: number;
  meanTotalTokens: number;
}

export interface RealBenchmarkRunDiagnosticSummary {
  sampleId: string;
  taskId: string;
  conditionId: RealBenchmarkConditionId;
  benchmarkLane: RealBenchmarkLane;
  valid: boolean;
  oraclePass: boolean;
  desiredOutcomeSatisfied: boolean;
  desiredOutcomeReasonCode: RealBenchmarkDesiredOutcomeReasonCode;
  expectedEscalation: boolean;
  predictedEscalation: boolean;
  advisorConsultOutcome: RealBenchmarkAdvisorConsultOutcome;
  advisorFailureKind: string | null;
  confusionOutcome: RealBenchmarkConfusionOutcome;
  primaryTiming: RealBenchmarkEscalationTimingBucket;
  reasonCodes: string[];
  invalidationReason: RealBenchmarkInvalidationReason | null;
  toolErrorCount: number;
  stdoutStatusTagCount: number;
  malformedStatusTagCount: number;
  nearMissStatusTagCount: number;
}

export interface RealBenchmarkRepeatSummary {
  sampleIndex: number;
  sampleCount: number;
  validSampleCount: number;
  invalidSampleCount: number;
  canaryConsultSummary: RealBenchmarkCanaryConsultSummary;
  escalation: RealBenchmarkEscalationConfusionSummary;
  publishabilityBlockers: string[];
  summaryPath: string;
  reportPath: string;
}

export interface RealBenchmarkCellAggregateSummary {
  cellKey: string;
  taskId: string;
  conditionId: RealBenchmarkConditionId;
  lane: RealBenchmarkLane;
  repeatCount: number;
  sampleCount: number;
  validSampleCount: number;
  invalidSampleCount: number;
  desiredOutcomeSatisfiedCount: number;
  desiredOutcomeSatisfactionRate: number;
  desiredOutcomeWilson95: RealBenchmarkRateInterval;
  consultSuccessCount: number;
  consultSuccessRate: number | null;
  consultSuccessWilson95: RealBenchmarkRateInterval;
  failOpenCount: number;
  parseErrorCount: number;
  wallClockMs: RealBenchmarkNumericStats;
  totalTokens: RealBenchmarkNumericStats;
  advisorTokens: RealBenchmarkNumericStats;
}

export interface RealBenchmarkCanaryReliabilitySummary {
  expectedPositiveSampleCount: number;
  validExpectedPositiveSampleCount: number;
  consultedCount: number;
  failOpenCount: number;
  parseErrorCount: number;
  falseNegativeCount: number;
  budgetExhaustedCount: number;
  consultSuccessRate: number | null;
  consultSuccessWilson95: RealBenchmarkRateInterval;
  attemptPathCounts: {
    primarySuccess: number;
    repairRetrySuccess: number;
    fallbackSuccess: number;
    finalFailOpen: number;
  };
  failureKindCounts: Record<string, number>;
}

export interface RealBenchmarkCampaignSummary {
  generatedAt: string;
  manifest: RealBenchmarkCampaignManifest;
  corpusSha: string;
  sampleCount: number;
  validSampleCount: number;
  invalidSampleCount: number;
  conditionSummaries: RealBenchmarkConditionSummary[];
  laneConditionSummaries: RealBenchmarkLaneConditionSummary[];
  canaryConsultSummary: RealBenchmarkCanaryConsultSummary;
  repeatSummaries: RealBenchmarkRepeatSummary[];
  cellAggregateSummaries: RealBenchmarkCellAggregateSummary[];
  canaryReliabilitySummary: RealBenchmarkCanaryReliabilitySummary;
  stressSummary: RealBenchmarkStressSummary;
  escalation: RealBenchmarkEscalationConfusionSummary;
  escalationTiming: RealBenchmarkEscalationTimingSummary[];
  reasonCodeCounts: Record<string, number>;
  runDiagnostics: RealBenchmarkRunDiagnosticSummary[];
  buildFreshness?: RealBenchmarkBuildFreshness;
  publishabilityBlockers: string[];
}

export interface RealBenchmarkAcceptanceThresholds {
  campaignCount: number;
  repeatsPerCampaign: number;
  expectedPositiveValidSampleCount: number;
  minConsultSuccessRate: number;
  minConsultSuccessWilson95LowerBound: number;
  maxParseErrorCount: number;
  maxFalseNegativeCount: number;
  maxBudgetExhaustedCount: number;
}

export interface RealBenchmarkAcceptanceSummary {
  generatedAt: string;
  acceptanceId: string;
  pilotPair: {
    executorModel: string;
    advisorModel: string;
    advisorFallbackModel: string | null;
  };
  thresholds: RealBenchmarkAcceptanceThresholds;
  campaignCount: number;
  campaigns: Array<{
    campaignId: string;
    sampleCount: number;
    validSampleCount: number;
    canaryConsultSummary: RealBenchmarkCanaryConsultSummary;
    canaryReliabilitySummary: RealBenchmarkCanaryReliabilitySummary;
    publishabilityBlockers: string[];
  }>;
  aggregateCanaryReliability: RealBenchmarkCanaryReliabilitySummary;
  aggregateCoreDesiredOutcomeFailures: number;
  aggregateStressSummary: RealBenchmarkStressSummary;
  pass: boolean;
  failedThresholds: string[];
}

export interface PolluxRealPilotOptions {
  manifest: RealBenchmarkCampaignManifest;
  tasks: RealBenchmarkTaskSpec[];
  artifactRoot: string;
  pricingSnapshot?: RealBenchmarkPricingSnapshot;
  binaryPath?: string;
  entrypointPreference?: RealBenchmarkEntrypointPreference;
  keepScratchDirectories?: boolean;
  maxWallClockMs?: number;
  maxModelResponsesPerSample?: number;
}
