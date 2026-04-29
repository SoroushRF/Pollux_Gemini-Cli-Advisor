/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parsePromptConstraintSummary } from './promptConstraints.js';

describe('pollux/observer/promptConstraints', () => {
  it('extracts mutation-protected paths and semantic flags from source-of-truth prompts', () => {
    const summary = parsePromptConstraintSummary(
      'Update src/policy.ts so runtime policy follows config/policy.json as the source of truth. Do not edit config/policy.json or docs/policy.md. Create m3-done.txt containing exactly done.',
    );

    expect(summary.mutationProtectedPaths).toEqual(
      expect.arrayContaining(['config/policy.json', 'docs/policy.md']),
    );
    expect(summary.sourceOfTruthPaths).toEqual(
      expect.arrayContaining(['config/policy.json', 'docs/policy.md']),
    );
    expect(summary.referencedPaths).toEqual(
      expect.arrayContaining([
        'src/policy.ts',
        'config/policy.json',
        'docs/policy.md',
      ]),
    );
    expect(summary.hasProtectedTestsOrDocs).toBe(true);
    expect(summary.hasCrossFileRepairConstraint).toBe(true);
  });

  it('infers protected test and readme anchors from noun references', () => {
    const summary = parsePromptConstraintSummary(
      'Fix src/csv.ts so it satisfies the parser edge cases expressed by tests/csv.test.ts. Do not weaken or edit the test or README. Create m3-done.txt containing exactly done.',
    );

    expect(summary.mutationProtectedPaths).toEqual(
      expect.arrayContaining(['tests/csv.test.ts', 'README.md']),
    );
    expect(summary.sourceOfTruthPaths).toEqual(
      expect.arrayContaining(['tests/csv.test.ts', 'README.md']),
    );
    expect(summary.hasProtectedTestsOrDocs).toBe(true);
  });

  it('separates public-interface behavior anchors from protected tests', () => {
    const summary = parsePromptConstraintSummary(
      'Fix the transitive import/export mismatch so view.ts uses the canonical createStableLabel implementation through the public index. Do not change src/labels.ts behavior or tests/view.test.ts.',
    );

    expect(summary.hasPublicInterfaceConstraint).toBe(true);
    expect(summary.hasBehaviorPreservationConstraint).toBe(true);
    expect(summary.hasCrossFileRepairConstraint).toBe(true);
    expect(summary.behaviorAnchorPaths).toEqual(
      expect.arrayContaining(['src/labels.ts']),
    );
    expect(summary.mutationProtectedPaths).toEqual(
      expect.arrayContaining(['tests/view.test.ts']),
    );
    expect(summary.mutationProtectedPaths).not.toContain('src/labels.ts');
  });

  it('detects alias-preservation constraints with protected tests', () => {
    const summary = parsePromptConstraintSummary(
      'Rename the canonical shade formatter to renderShade and update internal source usage to that name, but keep formatShade exported as a compatibility alias. Do not edit tests/color.test.ts. Create m3-done.txt containing exactly done.',
    );

    expect(summary.hasCompatibilityAliasConstraint).toBe(true);
    expect(summary.hasCrossFileRepairConstraint).toBe(true);
    expect(summary.mutationProtectedPaths).toEqual(
      expect.arrayContaining(['tests/color.test.ts']),
    );
  });
});
