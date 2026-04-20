/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  PolluxDuplicateAliasError,
  PolluxModelRegistry,
  PolluxModelRole,
  normalizePolluxModelAlias,
  resolvePolluxModel,
} from './models.js';
import {
  DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
  mergePolluxExperimentalConfig,
  PolluxDetectorStrategy,
  type PolluxExperimentalConfig,
  type PolluxExperimentalConfigMergeInput,
} from './types.js';

function makeExperimental(
  overrides: PolluxExperimentalConfigMergeInput = {},
): PolluxExperimentalConfig {
  return mergePolluxExperimentalConfig({
    enabled: true,
    executorModel: 'gemini-2.5-flash',
    advisorModel: 'gemini-3.1-pro-preview',
    strategy: PolluxDetectorStrategy.HYBRID,
    maxAdvisorCallsPerTurn: 2,
    maxAdvisorCallsPerSession: 20,
    confidenceThreshold: 6,
    emitAdvisorDebug: false,
    advisorRequestTimeoutMs:
      DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.advisorRequestTimeoutMs,
    ...overrides,
  });
}

describe('pollux/models', () => {
  describe('PolluxModelRegistry', () => {
    it('rejects duplicate normalized aliases', () => {
      expect(
        () =>
          new PolluxModelRegistry([
            { alias: 'flash', canonicalModelId: 'gemini-2.5-flash' },
            { alias: 'flash', canonicalModelId: 'gemini-2.5-flash' },
          ]),
      ).toThrow(PolluxDuplicateAliasError);
    });

    it('rejects aliases that collide after normalization', () => {
      expect(
        () =>
          new PolluxModelRegistry([
            { alias: 'Flash', canonicalModelId: 'a' },
            { alias: 'FLASH', canonicalModelId: 'b' },
          ]),
      ).toThrow(PolluxDuplicateAliasError);
    });

    it('registers distinct aliases', () => {
      const reg = new PolluxModelRegistry([
        { alias: 'flash', canonicalModelId: 'gemini-2.5-flash' },
        { alias: 'pro', canonicalModelId: 'gemini-2.5-pro' },
      ]);
      expect(reg.size).toBe(2);
      expect(reg.getCanonicalForAlias('flash')).toBe('gemini-2.5-flash');
      expect(reg.hasAlias('Pro')).toBe(true);
    });
  });

  describe('normalizePolluxModelAlias', () => {
    it('trims and lowercases', () => {
      expect(normalizePolluxModelAlias('  Flash  ')).toBe('flash');
    });
  });

  describe('resolvePolluxModel', () => {
    const registry = new PolluxModelRegistry([
      { alias: 'flash', canonicalModelId: 'gemini-2.5-flash-resolved' },
    ]);

    it('passthrough when Pollux is disabled (no registry effect)', () => {
      const exp = makeExperimental({ enabled: false });
      const r = resolvePolluxModel('flash', {
        registry,
        role: PolluxModelRole.EXECUTOR,
        experimental: exp,
      });
      expect(r).toEqual({
        canonicalModelId: 'flash',
        source: 'passthrough',
      });
    });

    it('uses registry when enabled and alias matches', () => {
      const exp = makeExperimental({ enabled: true });
      const r = resolvePolluxModel('flash', {
        registry,
        role: PolluxModelRole.EXECUTOR,
        experimental: exp,
      });
      expect(r.source).toBe('registry');
      expect(r.canonicalModelId).toBe('gemini-2.5-flash-resolved');
    });

    it('falls back deterministically to role default when alias is absent', () => {
      const exp = makeExperimental({
        enabled: true,
        executorModel: 'exec-default',
        advisorModel: 'adv-default',
      });
      const exec = resolvePolluxModel('unknown-short-alias', {
        registry,
        role: PolluxModelRole.EXECUTOR,
        experimental: exp,
      });
      expect(exec).toEqual({
        canonicalModelId: 'exec-default',
        source: 'role_default',
      });

      const adv = resolvePolluxModel('unknown-short-alias', {
        registry,
        role: PolluxModelRole.ADVISOR,
        experimental: exp,
      });
      expect(adv).toEqual({
        canonicalModelId: 'adv-default',
        source: 'role_default',
      });
    });

    it('passthrough concrete model ids not in registry', () => {
      const exp = makeExperimental({ enabled: true });
      const r = resolvePolluxModel('gemini-2.5-flash', {
        registry: new PolluxModelRegistry([]),
        role: PolluxModelRole.EXECUTOR,
        experimental: exp,
      });
      expect(r.source).toBe('passthrough');
      expect(r.canonicalModelId).toBe('gemini-2.5-flash');
    });

    it('uses role default for empty request when enabled', () => {
      const exp = makeExperimental({ enabled: true });
      const r = resolvePolluxModel('   ', {
        registry,
        role: PolluxModelRole.EXECUTOR,
        experimental: exp,
      });
      expect(r.source).toBe('role_default');
      expect(r.canonicalModelId).toBe(exp.executorModel);
    });
  });

  describe('DEFAULT_POLLUX_EXPERIMENTAL_CONFIG integration', () => {
    it('disabled path matches baseline identity for configured defaults', () => {
      const r = resolvePolluxModel(
        DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.executorModel,
        {
          registry: new PolluxModelRegistry([
            { alias: 'x', canonicalModelId: 'should-not-use' },
          ]),
          role: PolluxModelRole.EXECUTOR,
          experimental: {
            ...DEFAULT_POLLUX_EXPERIMENTAL_CONFIG,
            enabled: false,
          },
        },
      );
      expect(r.canonicalModelId).toBe(
        DEFAULT_POLLUX_EXPERIMENTAL_CONFIG.executorModel,
      );
      expect(r.source).toBe('passthrough');
    });
  });
});
