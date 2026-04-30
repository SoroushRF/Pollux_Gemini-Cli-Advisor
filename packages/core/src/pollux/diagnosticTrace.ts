/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import type { PolluxDiagnosticTraceConfig } from './types.js';

export type PolluxDiagnosticTraceEventType =
  | 'executor_text_delta'
  | 'executor_thought'
  | 'tool_call_request'
  | 'tool_call_result'
  | 'observer_signals'
  | 'observer_decision'
  | 'advisor_attempt'
  | 'advisor_guidance'
  | 'guidance_injection'
  | 'fr_decision_checkpoint'
  | 'oracle_result';

export interface PolluxDiagnosticTraceEvent {
  readonly tsMs: number;
  readonly type: PolluxDiagnosticTraceEventType;
  readonly payload: unknown;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]',
  ],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]'],
  [
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    '[REDACTED_JWT]',
  ],
  [
    /\b(?:api[_-]?key|token|secret|password|client[_-]?secret)\s*[:=]\s*["']?[^"'\s,;]+/gi,
    '[REDACTED_SECRET_ASSIGNMENT]',
  ],
  [/\b(?:AIza|ya29\.|sk-)[A-Za-z0-9._-]{16,}\b/g, '[REDACTED_API_TOKEN]'],
  [/\b[A-Za-z0-9+/]{120,}={0,2}\b/g, '[REDACTED_LONG_BLOB]'],
];

function sanitizeString(
  value: string,
  config: PolluxDiagnosticTraceConfig,
): string | { value: string; truncated: true } {
  let out = value;
  if (config.redactSensitiveText) {
    for (const [pattern, replacement] of SECRET_PATTERNS) {
      out = out.replace(pattern, replacement);
    }
  }
  if (out.length > config.maxTextCharsPerEvent) {
    return {
      value: out.slice(0, config.maxTextCharsPerEvent),
      truncated: true,
    };
  }
  return out;
}

function sanitizeValue(
  value: unknown,
  config: PolluxDiagnosticTraceConfig,
  depth = 0,
): unknown {
  if (depth > 8) {
    return '[TRUNCATED_DEPTH]';
  }
  if (typeof value === 'string') {
    return sanitizeString(value, config);
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, config, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (
        config.redactSensitiveText &&
        /(secret|token|password|credential|auth|api[_-]?key|key)/i.test(
          lowerKey,
        )
      ) {
        out[key] = '[REDACTED_FIELD]';
        continue;
      }
      out[key] = sanitizeValue(child, config, depth + 1);
    }
    return out;
  }
  return String(value);
}

export class PolluxDiagnosticTraceWriter {
  private eventCount = 0;
  private thoughtEventCount = 0;
  private observerDecisionCount = 0;
  private advisorGuidanceTextCaptured = false;

  constructor(private readonly config: PolluxDiagnosticTraceConfig) {
    if (!config.outputPath) {
      return;
    }
    fs.mkdirSync(path.dirname(config.outputPath), { recursive: true });
    fs.writeFileSync(config.outputPath, '');
  }

  get outputPath(): string | null {
    return this.config.outputPath;
  }

  get counts(): {
    readonly eventCount: number;
    readonly thoughtEventCount: number;
    readonly observerDecisionCount: number;
    readonly advisorGuidanceTextCaptured: boolean;
  } {
    return {
      eventCount: this.eventCount,
      thoughtEventCount: this.thoughtEventCount,
      observerDecisionCount: this.observerDecisionCount,
      advisorGuidanceTextCaptured: this.advisorGuidanceTextCaptured,
    };
  }

  record(type: PolluxDiagnosticTraceEventType, payload: unknown): void {
    if (!this.config.enabled || !this.config.outputPath) {
      return;
    }
    try {
      const event: PolluxDiagnosticTraceEvent = {
        tsMs: Date.now(),
        type,
        payload: sanitizeValue(payload, this.config),
      };
      fs.appendFileSync(this.config.outputPath, `${JSON.stringify(event)}\n`);
      this.eventCount++;
      if (type === 'executor_thought') {
        this.thoughtEventCount++;
      }
      if (type === 'observer_decision') {
        this.observerDecisionCount++;
      }
      if (type === 'advisor_guidance') {
        this.advisorGuidanceTextCaptured = true;
      }
    } catch {
      // Fail-open: diagnostics must never perturb agent execution.
    }
  }
}

export function createPolluxDiagnosticTraceWriter(
  config: PolluxDiagnosticTraceConfig,
): PolluxDiagnosticTraceWriter | undefined {
  if (!config.enabled || !config.outputPath) {
    return undefined;
  }
  try {
    return new PolluxDiagnosticTraceWriter(config);
  } catch {
    return undefined;
  }
}
