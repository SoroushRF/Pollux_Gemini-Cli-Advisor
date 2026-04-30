/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RealBenchmarkTaskSpec } from '../../core/src/pollux/benchmark/realTypes.js';
import type {
  RealBenchmarkEscalationSignalClass,
  RealBenchmarkLane,
} from '../../core/src/pollux/benchmark/realTypes.js';

export type RealBenchmarkConditionId =
  | 'A'
  | 'E'
  | 'F'
  | 'L'
  | 'LF'
  | 'FS'
  | 'FR'
  | 'FD'
  | 'LFR'
  | 'LFD';
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
  | 'plain_text_fallback'
  | 'parse_error'
  | 'malformed_json'
  | 'schema'
  | 'empty_response'
  | 'timeout'
  | 'capacity_exhausted'
  | 'quota_exhausted';
export type RealBenchmarkAdvisorInjectionTiming =
  | 'next_turn'
  | 'same_turn_next_continuation';
export type RealBenchmarkAdvisorTriggerMode =
  | 'executor_request'
  | 'detector'
  | 'hybrid';
export type RealBenchmarkAdvisorTriggerSource =
  | 'executor_request'
  | 'executor_request_status'
  | 'executor_request_checkpoint'
  | 'executor_request_checkpoint_default'
  | 'pre_mutation'
  | 'final_audit'
  | 'risk_gate'
  | 'fusion'
  | 'self_status'
  | 'loop'
  | 'unknown';
export type RealBenchmarkConfusionExclusion = 'budget_exhausted' | 'fail_open';
export type RealBenchmarkPolluxFailureCause =
  | 'oracle_structural_completeness'
  | 'oracle_behavioral_failure'
  | 'advisor_not_called'
  | 'advisor_called_too_late'
  | 'advisor_guidance_too_generic'
  | 'advisor_failed_open'
  | 'executor_ignored_guidance'
  | 'model_call_ceiling'
  | 'provider_failure'
  | 'unknown';
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
  advisorGuidanceEvents: RealBenchmarkAdvisorGuidanceRecord[];
  escalationAttemptCount: number;
  escalationEvents: RealBenchmarkEscalationEvent[];
  tokens: {
    total: number;
    advisor: number;
    executor: number;
  };
  costUsd: RealBenchmarkCostBreakdown;
  utilityRoleCounts: Readonly<Record<string, number>>;
  modelCallBreakdown: RealBenchmarkModelCallBreakdown;
}

export interface RealBenchmarkModelCallBreakdown {
  totalApiResponses: number;
  totalResponseIds: number;
  byRole: Record<string, number>;
  tokensByRole: Record<string, number>;
  byModel: Record<string, number>;
  tokensByModel: Record<string, number>;
}

export interface RealBenchmarkResponseCeilingEvidence {
  maxModelResponsesPerSample: number;
  countedModelResponses: number;
  overflowBy: number;
  invalidatedByCeiling: boolean;
  ceilingScope: 'all_model_responses';
}

export interface RealBenchmarkPolluxTimingDiagnostics {
  firstAdvisorCallEventIndex: number | null;
  firstAdvisorCallModelResponseOrdinal: number | null;
  executorResponsesBeforeFirstAdvisor: number | null;
  executorResponsesAfterFirstAdvisor: number | null;
  firstEscalationReasonCode: string | null;
  firstEscalationTiming: RealBenchmarkEscalationTiming | null;
  firstEscalationOutcome: string | null;
  firstEscalationPauseBoundary: 'pre_tool' | 'post_event' | null;
  firstEscalationSignalIds: string[];
  firstEscalationSignalAttributions?: string[];
}

export interface RealBenchmarkDetectorOpportunity {
  signalClass: RealBenchmarkEscalationSignalClass;
  expectedSignalClasses?: RealBenchmarkEscalationSignalClass[];
  expectedForM3: boolean;
  observedReasonCodes: string[];
  observedSignalIds?: string[];
  observedSignalAttributions?: string[];
  matchedExpectedSignalClass: boolean | null;
  matchedExpectedSignalEvidence?: string | null;
}

export interface RealBenchmarkAllSampleUsageSummary {
  totalTokens: number;
  advisorTokens: number;
  executorTokens: number;
  totalCostUsd: number | null;
  advisorCalls: number;
  advisorGuidanceInjections: number;
  advisorGuidanceInjectedSamples: number;
  advisorGuidanceChars: number;
  advisorGuidanceWords: number;
  avgAdvisorTokensPerInjectedConsultation: number | null;
  escalationAttempts: number;
  rawOraclePasses: number;
  ceilingInvalidations: number;
  meanModelResponses: number;
  meanWallClockMs: number;
}

export interface RealBenchmarkEscalationEvent {
  turnId: string | null;
  reasonCode: string | null;
  escalationTiming: RealBenchmarkEscalationTiming | null;
  outcome: RealBenchmarkEscalationOutcome | null;
  sameTurnDowngraded: boolean;
  pauseBoundary: 'pre_tool' | 'post_event' | null;
  contributingSignalIds: string[];
  contributingSignalAttributions?: string[];
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

export interface RealBenchmarkAdvisorGuidanceRecord {
  turnId: string | null;
  reasonCode: string | null;
  escalationTiming: RealBenchmarkEscalationTiming | null;
  injectionTiming: RealBenchmarkAdvisorInjectionTiming | null;
  guidanceChars: number;
  guidanceWords: number;
  parserOutcome: RealBenchmarkAdvisorParserOutcome | null;
  advisorTriggerMode: RealBenchmarkAdvisorTriggerMode | null;
  advisorTriggerSource: RealBenchmarkAdvisorTriggerSource;
  model: string | null;
  attemptKind: RealBenchmarkAdvisorAttemptKind | null;
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
  advisorGuidanceEvents?: RealBenchmarkAdvisorGuidanceRecord[];
  advisorGuidanceInjected?: boolean;
  advisorGuidanceInjectionCount?: number;
  advisorGuidanceChars?: number;
  advisorGuidanceWords?: number;
  advisorParserOutcomes?: RealBenchmarkAdvisorParserOutcome[];
  advisorTriggerModes?: RealBenchmarkAdvisorTriggerMode[];
  advisorTriggerSources?: RealBenchmarkAdvisorTriggerSource[];
  advisorInjectionTimings?: RealBenchmarkAdvisorInjectionTiming[];
  firstAdvisorGuidanceInjectionEventIndex?: number | null;
  advisorTriggerSourceCounts?: Partial<
    Record<RealBenchmarkAdvisorTriggerSource, number>
  >;
  advisorParserOutcomeCounts?: Partial<
    Record<RealBenchmarkAdvisorParserOutcome, number>
  >;
  firstAdvisorBeforeFirstMutation?: boolean | null;
  firstAdvisorBeforeFinalization?: boolean | null;
  meanAdvisorGuidanceWords?: number | null;
  diagnosticTracePath?: string | null;
  diagnosticTraceEventCount?: number;
  diagnosticThoughtEventCount?: number;
  diagnosticObserverDecisionCount?: number;
  diagnosticAdvisorGuidanceTextCaptured?: boolean;
  polluxFailureCause?: RealBenchmarkPolluxFailureCause;
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
  responseCeiling?: RealBenchmarkResponseCeilingEvidence;
  modelCallBreakdown?: RealBenchmarkModelCallBreakdown;
  expectedEscalation: boolean;
  predictedEscalation: boolean;
  confusionOutcome: RealBenchmarkConfusionOutcome;
  desiredOutcomeSatisfied: boolean;
  desiredOutcomeReasonCode: RealBenchmarkDesiredOutcomeReasonCode;
  advisorConsultOutcome: RealBenchmarkAdvisorConsultOutcome;
  actualAdvisorConsultOutcome?: RealBenchmarkAdvisorConsultOutcome;
  advisorFailureKind: string | null;
  polluxTimingDiagnostics?: RealBenchmarkPolluxTimingDiagnostics;
  detectorOpportunity?: RealBenchmarkDetectorOpportunity;
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
  allSamples: RealBenchmarkAllSampleUsageSummary;
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
  allSamples: RealBenchmarkAllSampleUsageSummary;
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
  modelResponseCount: number;
  responseCeiling: RealBenchmarkResponseCeilingEvidence | null;
  totalTokens: number;
  advisorTokens: number;
  totalCostUsd: number | null;
  advisorCalls: number;
  escalationAttempts: number;
  signalClass: RealBenchmarkEscalationSignalClass | null;
  m3Opportunity: boolean | null;
  firstAdvisorCallModelResponseOrdinal: number | null;
  executorResponsesBeforeFirstAdvisor: number | null;
  executorResponsesAfterFirstAdvisor: number | null;
  actualAdvisorConsultOutcome: RealBenchmarkAdvisorConsultOutcome;
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
  allSamples: RealBenchmarkAllSampleUsageSummary;
}

export interface RealBenchmarkInvalidationSummary {
  byCondition: Record<string, Record<string, number>>;
  byLane: Record<string, Record<string, number>>;
  byCell: Record<string, Record<string, number>>;
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
  invalidationSummary: RealBenchmarkInvalidationSummary;
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

export type RealBenchmarkM3CalibrationLabel =
  | 'easy'
  | 'discriminative'
  | 'impossible_or_noisy'
  | 'flaky';

export interface RealBenchmarkM3CalibrationThresholds {
  maxFlashPassRateForDiscriminative: number;
  minProPassRateForDiscriminative: number;
  maxInvalidRateForStableTask: number;
  minSelectedTaskCount: number;
  maxSelectedTaskCount: number;
}

export interface RealBenchmarkM3ValueThresholds {
  minFOverAAbsolute: number;
  maxFCostPerTaskVsE: number;
  maxFCostPerSuccessVsE: number;
  maxInvalidRate: number;
  minSelectedTaskCount: number;
}

export interface RealBenchmarkM3ConditionTaskStats {
  conditionId: RealBenchmarkConditionId;
  sampleCount: number;
  validSamples: number;
  invalidSamples: number;
  passCount: number;
  passRate: number | null;
  invalidRate: number;
  totalCostUsd: number | null;
  meanWallClockMs: number;
  totalTokens: number;
}

export interface RealBenchmarkM3TaskCalibrationSummary {
  taskId: string;
  domain: string;
  difficulty: string;
  label: RealBenchmarkM3CalibrationLabel;
  rationale: string;
  flash: RealBenchmarkM3ConditionTaskStats;
  pro: RealBenchmarkM3ConditionTaskStats;
}

export interface RealBenchmarkM3CalibrationSummary {
  generatedAt: string;
  calibrationBatchId: string;
  corpusSha: string;
  thresholds: RealBenchmarkM3CalibrationThresholds;
  candidateTaskCount: number;
  selectedTaskCount: number;
  labelCounts: Record<RealBenchmarkM3CalibrationLabel, number>;
  taskSummaries: RealBenchmarkM3TaskCalibrationSummary[];
  selectedTaskIds: string[];
  rejectedTaskIds: string[];
  pass: boolean;
  failedThresholds: string[];
}

export interface RealBenchmarkM3SelectedTaskSet {
  generatedAt: string;
  calibrationBatchId: string;
  corpusSha: string;
  thresholds: RealBenchmarkM3CalibrationThresholds;
  selectedTaskIds: string[];
  rejectedTaskIds: string[];
  taskSummaries: RealBenchmarkM3TaskCalibrationSummary[];
}

export type RealBenchmarkTemporaryFlashOnlyGroup =
  | 'temporary_easy_for_flash'
  | 'temporary_hard_candidate'
  | 'temporary_ceiling_sensitive_candidate'
  | 'temporary_flash_flaky';

export interface RealBenchmarkTemporaryFlashOnlyTaskSummary {
  taskId: string;
  domain: string;
  difficulty: string;
  group: RealBenchmarkTemporaryFlashOnlyGroup;
  rationale: string;
  flash: RealBenchmarkM3ConditionTaskStats;
}

export interface RealBenchmarkTemporaryFlashOnlySelectedTaskSet {
  generatedAt: string;
  calibrationBatchId: string;
  provisional: true;
  provisionalReason: string;
  corpusSha: string;
  thresholds: Pick<
    RealBenchmarkM3CalibrationThresholds,
    | 'maxFlashPassRateForDiscriminative'
    | 'maxInvalidRateForStableTask'
    | 'maxSelectedTaskCount'
  >;
  selectedTaskIds: string[];
  rejectedTaskIds: string[];
  taskSummaries: RealBenchmarkTemporaryFlashOnlyTaskSummary[];
}

export interface RealBenchmarkTemporaryFlashOnlySummary {
  generatedAt: string;
  calibrationBatchId: string;
  provisional: true;
  provisionalReason: string;
  corpusSha: string;
  thresholds: Pick<
    RealBenchmarkM3CalibrationThresholds,
    | 'maxFlashPassRateForDiscriminative'
    | 'maxInvalidRateForStableTask'
    | 'maxSelectedTaskCount'
  >;
  candidateTaskCount: number;
  selectedTaskCount: number;
  groupCounts: Record<RealBenchmarkTemporaryFlashOnlyGroup, number>;
  taskSummaries: RealBenchmarkTemporaryFlashOnlyTaskSummary[];
  selectedTaskIds: string[];
  rejectedTaskIds: string[];
}

export interface RealBenchmarkM3ConditionValueSummary {
  conditionId: RealBenchmarkConditionId;
  advisorTriggerMode: RealBenchmarkAdvisorTriggerMode | null;
  sampleCount: number;
  validSamples: number;
  invalidSamples: number;
  passCount: number;
  passRate: number | null;
  passRateWilson95: RealBenchmarkRateInterval;
  totalCostUsd: number | null;
  meanCostPerTaskUsd: number | null;
  costPerSuccessUsd: number | null;
  meanWallClockMs: number;
  meanServiceLatencyMs: number;
  totalTokens: number;
  executorTokens: number;
  advisorTokens: number;
  advisorCallRate: number | null;
  advisorGuidanceInjectionCount: number;
  advisorGuidanceInjectionRate: number | null;
  avgAdvisorTokensPerInjectedConsultation: number | null;
  advisorTriggerSourceCounts?: Partial<
    Record<RealBenchmarkAdvisorTriggerSource, number>
  >;
  advisorParserOutcomeCounts?: Partial<
    Record<RealBenchmarkAdvisorParserOutcome, number>
  >;
  diagnosticTraceSampleCount?: number;
  diagnosticTraceEventCount?: number;
  polluxFailureCauseCounts?: Partial<
    Record<RealBenchmarkPolluxFailureCause, number>
  >;
  costPerInjectedSuccessfulSampleUsd: number | null;
  costPerPassWithInjectedGuidanceUsd: number | null;
  advisorTokenShare: number | null;
  invalidRate: number;
  allSamples: RealBenchmarkAllSampleUsageSummary;
}

export interface RealBenchmarkM3TriggerModeComparisonSummary {
  baselineConditionId: RealBenchmarkConditionId;
  comparisonConditionId: RealBenchmarkConditionId;
  comparisonKind: 'executor_request' | 'detector';
  baselinePassRate: number | null;
  comparisonPassRate: number | null;
  passRateDelta: number | null;
  baselineCostPerSuccessUsd: number | null;
  comparisonCostPerSuccessUsd: number | null;
  costPerSuccessRatio: number | null;
  baselineAdvisorGuidanceInjectionCount: number;
  comparisonAdvisorGuidanceInjectionCount: number;
}

export interface RealBenchmarkM3TaskValueSummary {
  taskId: string;
  passByCondition: Partial<Record<RealBenchmarkConditionId, number | null>>;
  validByCondition: Partial<Record<RealBenchmarkConditionId, number>>;
  invalidByCondition: Partial<Record<RealBenchmarkConditionId, number>>;
}

export interface RealBenchmarkM3ValueSummary {
  generatedAt: string;
  valueBatchId: string;
  selectedTaskSetPath: string;
  corpusSha: string;
  thresholds: RealBenchmarkM3ValueThresholds;
  selectedTaskIds: string[];
  conditionIds: RealBenchmarkConditionId[];
  conditionValueSummaries: RealBenchmarkM3ConditionValueSummary[];
  taskValueSummaries: RealBenchmarkM3TaskValueSummary[];
  triggerModeComparisons: RealBenchmarkM3TriggerModeComparisonSummary[];
  uplift: {
    absoluteFOverA: number | null;
    gapClosedByF: number | null;
  };
  economics: {
    fCostPerTaskVsE: number | null;
    fCostPerSuccessVsE: number | null;
    fCheaperThanE: boolean;
  };
  advisorTokenShareF: number | null;
  fAdvisorEvidencePresent: boolean;
  fM3AlignedAdvisorEvidencePresent: boolean;
  fConsultedSampleCount: number;
  fM3AlignedConsultedSampleCount: number;
  fTasksWithAdvisorEvidence: string[];
  fTasksWithM3AlignedAdvisorEvidence: string[];
  diagnosticOnly: boolean;
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
  fMaxModelResponsesPerSample?: number;
  diagnosticTrace?: {
    enabled?: boolean;
    includeAdvisorGuidanceText?: boolean;
    includeModelThoughts?: 'summary' | 'raw_model_exposed';
  };
}
