/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { tokenCosineSimilarity } from './tokenCosineSimilarity.js';

describe('tokenCosineSimilarity', () => {
  it('returns 0 for empty inputs', () => {
    expect(tokenCosineSimilarity('', 'x')).toBe(0);
    expect(tokenCosineSimilarity('x', '')).toBe(0);
    expect(tokenCosineSimilarity('', '')).toBe(0);
  });

  it('is symmetric', () => {
    const a = 'fix failing tests in core client';
    const b = 'fix failing tests in core client please';
    expect(tokenCosineSimilarity(a, b)).toBeCloseTo(
      tokenCosineSimilarity(b, a),
    );
  });

  it('scores identical text close to 1', () => {
    const s = 'implement pollux outcome telemetry phase g';
    expect(tokenCosineSimilarity(s, s)).toBeCloseTo(1);
  });

  it('treats punctuation and casing as insignificant', () => {
    expect(tokenCosineSimilarity('Hello, WORLD!', 'hello world')).toBeCloseTo(
      1,
    );
  });

  it('scores unrelated text low', () => {
    const score = tokenCosineSimilarity(
      'add retry logic for api errors',
      'theme dialog font size',
    );
    expect(score).toBeLessThan(0.5);
  });
});
