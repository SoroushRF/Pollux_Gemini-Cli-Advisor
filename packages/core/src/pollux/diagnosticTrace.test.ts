/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PolluxDiagnosticTraceWriter } from './diagnosticTrace.js';
import { DEFAULT_POLLUX_EXPERIMENTAL_CONFIG } from './types.js';

function makeTracePath(): string {
  return path.join(
    os.tmpdir(),
    `pollux-trace-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`,
  );
}

describe('pollux/diagnosticTrace', () => {
  it('writes sanitized JSONL and tracks event counts', () => {
    const outputPath = makeTracePath();
    const writer = new PolluxDiagnosticTraceWriter({
      ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.diagnosticTrace,
      enabled: true,
      outputPath,
      includeAdvisorGuidanceText: true,
      maxTextCharsPerEvent: 32,
    });

    writer.record('executor_thought', {
      text: 'token=secret-value '.repeat(10),
    });
    writer.record('advisor_guidance', {
      guidance: 'Use explicit terminal states.',
    });

    const lines = fs
      .readFileSync(outputPath, 'utf8')
      .trim()
      .split(/\r?\n/g)
      .map((line) => JSON.parse(line) as { type: string; payload: unknown });

    expect(lines).toHaveLength(2);
    expect(lines[0].type).toBe('executor_thought');
    expect(JSON.stringify(lines[0].payload)).toContain(
      '[REDACTED_SECRET_ASSIGNMENT]',
    );
    expect(writer.counts).toMatchObject({
      eventCount: 2,
      thoughtEventCount: 1,
      advisorGuidanceTextCaptured: true,
    });
  });
});
