/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BenchmarkTask } from './tasks.js';

export type RealBenchmarkDomain =
  | 'file_authoring'
  | 'multi_file_refactor'
  | 'json_yaml_transform'
  | 'shell_tool_chain'
  | 'read_then_write'
  | 'code_search_summarize';

export type RealBenchmarkSourceType =
  | 'issue'
  | 'ticket'
  | 'writeup'
  | 'adapter';

export type RealBenchmarkEscalationSignalClass =
  | 'none'
  | 'self_report'
  | 'risk_gate'
  | 'hard_loop'
  | 'fusion_composite';

export interface RealBenchmarkTaskProvenance {
  sourceType: RealBenchmarkSourceType;
  sourceRef: string;
}

export interface RealBenchmarkTaskSpec extends BenchmarkTask {
  domain: RealBenchmarkDomain;
  provenance: RealBenchmarkTaskProvenance;
  escalationSignalClass: RealBenchmarkEscalationSignalClass;
  positiveFixturePaths: string[];
  negativeFixturePaths: string[];
}

export const REAL_BENCHMARK_REQUIRED_DOMAINS: readonly RealBenchmarkDomain[] = [
  'file_authoring',
  'multi_file_refactor',
  'json_yaml_transform',
  'shell_tool_chain',
  'read_then_write',
  'code_search_summarize',
] as const;
