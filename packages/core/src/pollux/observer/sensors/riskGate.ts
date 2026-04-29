/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiEventType } from '../../../core/turn.js';
import type { ToolCallRequestInfo } from '../../../scheduler/types.js';
import type { PolluxDetectorConfig } from '../../types.js';
import type { Sensor, SensorInput, SensorSignal , PromptConstraintSummary } from './base.js';
import {
  EDIT_TOOL_NAME,
  PARAM_FILE_PATH,
  SHELL_PARAM_COMMAND,
  SHELL_TOOL_NAME,
  WRITE_FILE_PARAM_CONTENT,
  WRITE_FILE_TOOL_NAME,
} from '../../../tools/definitions/base-declarations.js';

/** Pre-tool risk gate sensor slot (Phase B). */
export const RISK_GATE_SENSOR_ID = 'sensor.risk_gate' as const;

/** Canonical high-risk signal id (DETECTOR_IMPLEMENTATION_PLAN.md §7.B.2). */
export const RISK_PRE_TOOL_HIGH_SIGNAL_ID = 'risk.pre_tool_high' as const;

/** High-risk signal weight/precision prior from the phase plan matrix. */
export const RISK_PRE_TOOL_HIGH_SIGNAL_WEIGHT = 3;
export const RISK_PRE_TOOL_HIGH_SIGNAL_PRECISION = 0.95;

/** Phase B default for file-count elevated classification (plan §7.B.2). */
export const RISK_GATE_ELEVATED_FILE_COUNT_THRESHOLD = 5;

export type RiskLevel = 'low' | 'elevated' | 'high';

export interface RiskClassification {
  readonly risk: RiskLevel;
  readonly reason?: string;
  readonly matchedPattern?: string;
}

const DEFAULT_HIGH_RISK_SHELL_PATTERN_SOURCES = [
  'rm\\s+-rf(?:\\s|$)',
  'git\\s+push\\s+--force(?:\\s|$)',
  'drop\\s+table(?:\\s|$)',
  'delete\\s+from\\b(?![\\s\\S]*\\bwhere\\b)',
  'chmod\\s+777(?:\\s|$)',
  '>\\s*/dev/sd[a-z][a-z0-9]*',
] as const;

const DEFAULT_HIGH_RISK_SHELL_PATTERNS = Object.freeze(
  DEFAULT_HIGH_RISK_SHELL_PATTERN_SOURCES.map(
    (source) => new RegExp(source, 'i'),
  ),
);

const DELETE_TOOL_NAMES = new Set([
  'delete_file',
  'remove_file',
  'unlink_file',
]);
const ENV_PATH_RE = /(^|\/)\.env(?:\.|$)/i;
const MIGRATIONS_PATH_RE = /(^|\/)migrations(\/|$)/i;
const RENAME_TOOL_NAMES = new Set(['rename_file', 'move_file']);

function toNormalizedPath(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeRegexFromConfigPattern(source: string): RegExp | undefined {
  try {
    return new RegExp(source, 'i');
  } catch {
    return undefined;
  }
}

function compileConfigPatterns(
  denyPatterns: readonly string[],
): readonly RegExp[] {
  const compiled: RegExp[] = [];
  for (const source of denyPatterns) {
    const maybe = safeRegexFromConfigPattern(source);
    if (maybe) {
      compiled.push(maybe);
    }
  }
  return compiled;
}

function findFirstPatternMatch(
  text: string,
  patterns: readonly RegExp[],
): string | undefined {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return pattern.source;
    }
  }
  return undefined;
}

function shellPatternAttribution(kind: string, value: string): string {
  return `generic_shell:${kind}:${value}`;
}

function classifyShellCommandRisk(
  command: string,
  riskGateConfig: Readonly<PolluxDetectorConfig['riskGate']>,
): RiskClassification {
  const normalizedCommand = command.trim();
  if (normalizedCommand.length === 0) {
    return { risk: 'low' };
  }

  const builtInMatch = findFirstPatternMatch(
    normalizedCommand,
    DEFAULT_HIGH_RISK_SHELL_PATTERNS,
  );
  if (builtInMatch) {
    return {
      risk: 'high',
      reason: 'shell command matched built-in high-risk pattern',
      matchedPattern: shellPatternAttribution('built_in', builtInMatch),
    };
  }

  const configuredPatterns = compileConfigPatterns(riskGateConfig.denyPatterns);
  if (riskGateConfig.mode === 'allowlist') {
    if (configuredPatterns.length === 0) {
      return {
        risk: 'high',
        reason: 'allowlist mode configured without any patterns',
      };
    }
    const allowlistMatch = findFirstPatternMatch(
      normalizedCommand,
      configuredPatterns,
    );
    if (allowlistMatch) {
      return { risk: 'low' };
    }
    return {
      risk: 'high',
      reason: 'shell command is not allowlisted',
      matchedPattern: shellPatternAttribution('not_allowlisted', 'default'),
    };
  }

  const configuredMatch = findFirstPatternMatch(
    normalizedCommand,
    configuredPatterns,
  );
  if (configuredMatch) {
    return {
      risk: 'high',
      reason: 'shell command matched configured high-risk pattern',
      matchedPattern: shellPatternAttribution('configured', configuredMatch),
    };
  }

  return { risk: 'low' };
}

function collectPathCandidates(
  args: Record<string, unknown>,
): readonly string[] {
  const out = new Set<string>();
  const seen = new Set<unknown>();

  const visit = (value: unknown, keyHint?: string, depth = 0): void => {
    if (depth > 6 || value == null) {
      return;
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }

    if (isNonEmptyString(value)) {
      const normalized = toNormalizedPath(value);
      const key = (keyHint ?? '').toLowerCase();
      const looksPathLike =
        key.includes('path') ||
        key === 'file' ||
        key === 'files' ||
        normalized.includes('/') ||
        normalized.includes('\\\\');
      if (looksPathLike) {
        out.add(normalized);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry, keyHint, depth + 1);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) {
        visit(childValue, childKey, depth + 1);
      }
    }
  };

  for (const [key, value] of Object.entries(args)) {
    visit(value, key);
  }

  return [...out];
}

function extractPackageNameFromPath(path: string): string | undefined {
  const trimmed = path.replace(/^\/+/, '').replace(/^\.\//, '');
  const m = /^packages\/([^/]+)/i.exec(trimmed);
  return m?.[1]?.toLowerCase();
}

function crossesPackageBoundaries(paths: readonly string[]): boolean {
  const packageNames = new Set<string>();
  for (const p of paths) {
    const pkg = extractPackageNameFromPath(p);
    if (pkg) {
      packageNames.add(pkg);
    }
    if (packageNames.size > 1) {
      return true;
    }
  }
  return false;
}

function isTopLevelPackageJson(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').replace(/^\.\//, '');
  return normalized.toLowerCase() === 'package.json';
}

function isEtcPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized.startsWith('/etc/') || normalized === '/etc';
}

function containsDependencyMutationHint(
  args: Record<string, unknown>,
): boolean {
  const candidateStrings = [
    args[WRITE_FILE_PARAM_CONTENT],
    args['new_string'],
    args['instruction'],
  ].filter((value): value is string => isNonEmptyString(value));

  if (candidateStrings.length === 0) {
    return false;
  }
  return candidateStrings.some((text) => /"dependencies"\s*:/i.test(text));
}

function classifyPathRisk(
  request: ToolCallRequestInfo,
): RiskClassification | undefined {
  const args = request.args;
  const rawPathValue = args[PARAM_FILE_PATH];
  const primaryPath = isNonEmptyString(rawPathValue)
    ? toNormalizedPath(rawPathValue)
    : undefined;

  if (primaryPath) {
    if (ENV_PATH_RE.test(primaryPath)) {
      return {
        risk: 'high',
        reason: 'target path is environment configuration (.env)',
        matchedPattern: `generic_path:${primaryPath}`,
      };
    }
    if (MIGRATIONS_PATH_RE.test(primaryPath)) {
      return {
        risk: 'high',
        reason: 'target path is in migrations',
        matchedPattern: `generic_path:${primaryPath}`,
      };
    }
    if (
      isTopLevelPackageJson(primaryPath) &&
      containsDependencyMutationHint(args)
    ) {
      return {
        risk: 'high',
        reason: 'top-level package.json dependency mutation detected',
        matchedPattern: 'generic_path:package.json:dependencies',
      };
    }
    if (isEtcPath(primaryPath)) {
      return {
        risk: 'elevated',
        reason: 'target path is under /etc',
      };
    }
  }

  const pathCandidates = collectPathCandidates(args);
  if (pathCandidates.length > RISK_GATE_ELEVATED_FILE_COUNT_THRESHOLD) {
    return {
      risk: 'elevated',
      reason: 'tool args indicate multi-file impact beyond threshold',
    };
  }

  if (crossesPackageBoundaries(pathCandidates)) {
    return {
      risk: 'elevated',
      reason: 'tool args span multiple package boundaries',
    };
  }

  return undefined;
}

function isPathMutationTool(toolName: string): boolean {
  return (
    toolName === WRITE_FILE_TOOL_NAME ||
    toolName === EDIT_TOOL_NAME ||
    DELETE_TOOL_NAMES.has(toolName) ||
    RENAME_TOOL_NAMES.has(toolName)
  );
}

function protectedPathAttribution(path: string): string {
  return `prompt_protected_path:${path}`;
}

function matchesProtectedPath(
  candidate: string,
  protectedPath: string,
): boolean {
  const normalizedCandidate = toNormalizedPath(candidate).toLowerCase();
  const normalizedProtected = toNormalizedPath(protectedPath).toLowerCase();
  return (
    normalizedCandidate === normalizedProtected ||
    normalizedCandidate.endsWith(`/${normalizedProtected}`) ||
    normalizedProtected.endsWith(`/${normalizedCandidate}`)
  );
}

function classifyPromptProtectedPathRisk(
  request: ToolCallRequestInfo,
  promptConstraintSummary?: PromptConstraintSummary,
): RiskClassification | undefined {
  if (
    promptConstraintSummary === undefined ||
    promptConstraintSummary.mutationProtectedPaths.length === 0
  ) {
    return undefined;
  }
  const toolName = request.name.trim().toLowerCase();
  if (!isPathMutationTool(toolName)) {
    return undefined;
  }

  const pathCandidates = collectPathCandidates(request.args);
  for (const candidate of pathCandidates) {
    const matchedProtectedPath =
      promptConstraintSummary.mutationProtectedPaths.find((protectedPath) =>
        matchesProtectedPath(candidate, protectedPath),
      );
    if (matchedProtectedPath) {
      return {
        risk: 'high',
        reason: 'prompt-protected path targeted for mutation',
        matchedPattern: protectedPathAttribution(matchedProtectedPath),
      };
    }
  }
  return undefined;
}

/**
 * Deterministically classify risk for a pending tool request.
 *
 * Phase B semantics:
 * - high: hard-precision pre-tool same-turn escalation candidate.
 * - elevated: recorded but not hard-precision on its own.
 * - low: no immediate escalation signal.
 */
export function classifyToolCallRisk(
  request: ToolCallRequestInfo,
  riskGateConfig: Readonly<PolluxDetectorConfig['riskGate']>,
  promptConstraintSummary?: PromptConstraintSummary,
): RiskClassification {
  const toolName = request.name.trim().toLowerCase();
  const promptProtectedPathRisk = classifyPromptProtectedPathRisk(
    request,
    promptConstraintSummary,
  );
  if (promptProtectedPathRisk) {
    return promptProtectedPathRisk;
  }

  if (DELETE_TOOL_NAMES.has(toolName)) {
    return {
      risk: 'high',
      reason: 'delete-like tool is always treated as high risk',
      matchedPattern: `generic_tool:${toolName}`,
    };
  }

  if (toolName === SHELL_TOOL_NAME) {
    const command = request.args[SHELL_PARAM_COMMAND];
    if (isNonEmptyString(command)) {
      return classifyShellCommandRisk(command, riskGateConfig);
    }
    return { risk: 'low' };
  }

  if (toolName === WRITE_FILE_TOOL_NAME || toolName === EDIT_TOOL_NAME) {
    return classifyPathRisk(request) ?? { risk: 'low' };
  }

  return { risk: 'low' };
}

/** Pure pre-tool risk sensor wrapper for the Phase D observer pipeline. */
export class RiskGateSensor implements Sensor {
  readonly id = RISK_GATE_SENSOR_ID;

  constructor(
    private readonly riskGateConfig: Readonly<PolluxDetectorConfig['riskGate']>,
  ) {}

  observe(input: SensorInput): readonly SensorSignal[] {
    try {
      if (!this.riskGateConfig.enabled) {
        return [];
      }
      if (input.event.type !== GeminiEventType.ToolCallRequest) {
        return [];
      }
      const classification = classifyToolCallRisk(
        input.event.value,
        this.riskGateConfig,
        input.promptConstraintSummary,
      );
      if (classification.risk !== 'high') {
        return [];
      }
      return [
        {
          id: RISK_PRE_TOOL_HIGH_SIGNAL_ID,
          weight: RISK_PRE_TOOL_HIGH_SIGNAL_WEIGHT,
          precisionPrior: RISK_PRE_TOOL_HIGH_SIGNAL_PRECISION,
          category: 'risk',
          hardPrecision: true,
          tsMs: Date.now(),
          attribution: classification.matchedPattern ?? classification.reason,
        },
      ];
    } catch {
      return [];
    }
  }
}
