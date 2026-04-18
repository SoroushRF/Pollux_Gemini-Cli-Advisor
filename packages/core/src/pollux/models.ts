/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pollux model registry and alias resolver (POLLUX_SPEC §4 models.ts, P1-02).
 *
 * Maps stable short aliases to canonical model IDs. When Pollux is disabled,
 * resolution is identity (trim only) so callers can skip behavior changes.
 */

import { VALID_GEMINI_MODELS } from '../config/models.js';
import type { PolluxExperimentalConfig } from './types.js';

/** Which Pollux config field supplies the fallback when an alias is absent. */
export const PolluxModelRole = {
  EXECUTOR: 'executor',
  ADVISOR: 'advisor',
} as const;

export type PolluxModelRole =
  (typeof PolluxModelRole)[keyof typeof PolluxModelRole];

export interface PolluxModelRegistryEntry {
  readonly alias: string;
  readonly canonicalModelId: string;
}

/** Thrown when two entries normalize to the same alias key. */
export class PolluxDuplicateAliasError extends Error {
  readonly normalizedAlias: string;
  readonly existingCanonicalModelId: string;
  readonly attemptedCanonicalModelId: string;

  constructor(
    normalizedAlias: string,
    existingCanonicalModelId: string,
    attemptedCanonicalModelId: string,
  ) {
    super(
      `Pollux model registry: duplicate alias after normalization ${JSON.stringify(normalizedAlias)} (existing ${JSON.stringify(existingCanonicalModelId)}, attempted ${JSON.stringify(attemptedCanonicalModelId)})`,
    );
    this.name = 'PolluxDuplicateAliasError';
    this.normalizedAlias = normalizedAlias;
    this.existingCanonicalModelId = existingCanonicalModelId;
    this.attemptedCanonicalModelId = attemptedCanonicalModelId;
  }
}

/**
 * Normalizes an alias for lookup: trim + lowercase ASCII.
 * Two user spellings that collide here are rejected at registry build time.
 */
export function normalizePolluxModelAlias(alias: string): string {
  return alias.trim().toLowerCase();
}

function roleDefaultModelId(
  role: PolluxModelRole,
  experimental: Readonly<PolluxExperimentalConfig>,
): string {
  return role === PolluxModelRole.EXECUTOR
    ? experimental.executorModel
    : experimental.advisorModel;
}

/**
 * True if the string should pass through as a concrete model id without
 * registry lookup (unknown short alias still falls back — see resolve).
 */
function isLikelyConcreteModelId(trimmed: string): boolean {
  if (VALID_GEMINI_MODELS.has(trimmed)) {
    return true;
  }
  return trimmed.startsWith('gemini-') || trimmed.startsWith('auto-gemini');
}

export type PolluxModelResolutionSource =
  | 'registry'
  | 'passthrough'
  | 'role_default';

export interface PolluxModelResolution {
  readonly canonicalModelId: string;
  readonly source: PolluxModelResolutionSource;
}

/**
 * Immutable alias → canonical map. Duplicate normalized aliases throw at
 * construction.
 */
export class PolluxModelRegistry {
  private readonly byAlias = new Map<string, string>();

  constructor(entries: readonly PolluxModelRegistryEntry[]) {
    for (const entry of entries) {
      const key = normalizePolluxModelAlias(entry.alias);
      if (key.length === 0) {
        continue;
      }
      const existing = this.byAlias.get(key);
      if (existing !== undefined) {
        throw new PolluxDuplicateAliasError(
          key,
          existing,
          entry.canonicalModelId,
        );
      }
      this.byAlias.set(key, entry.canonicalModelId);
    }
  }

  /** Number of registered aliases (after skipping empty keys). */
  get size(): number {
    return this.byAlias.size;
  }

  getCanonicalForAlias(alias: string): string | undefined {
    const key = normalizePolluxModelAlias(alias);
    if (key.length === 0) {
      return undefined;
    }
    return this.byAlias.get(key);
  }

  hasAlias(alias: string): boolean {
    return this.getCanonicalForAlias(alias) !== undefined;
  }
}

export interface ResolvePolluxModelOptions {
  readonly registry: PolluxModelRegistry;
  readonly role: PolluxModelRole;
  readonly experimental: Readonly<PolluxExperimentalConfig>;
}

/**
 * Resolves a requested executor or advisor model string.
 *
 * - **Pollux disabled:** returns trimmed input (passthrough); registry ignored.
 * - **Pollux enabled:** registry hit → canonical; empty → role default from
 *   `experimental`; unknown short alias → role default; strings that look like
 *   concrete model ids (VALID_GEMINI_MODELS or `gemini-` / `auto-gemini`
 *   prefix) → passthrough.
 */
export function resolvePolluxModel(
  requested: string,
  options: ResolvePolluxModelOptions,
): PolluxModelResolution {
  const trimmed = requested.trim();

  if (!options.experimental.enabled) {
    return { canonicalModelId: trimmed, source: 'passthrough' };
  }

  if (trimmed.length === 0) {
    return {
      canonicalModelId: roleDefaultModelId(options.role, options.experimental),
      source: 'role_default',
    };
  }

  const fromRegistry = options.registry.getCanonicalForAlias(trimmed);
  if (fromRegistry !== undefined) {
    return { canonicalModelId: fromRegistry, source: 'registry' };
  }

  if (isLikelyConcreteModelId(trimmed)) {
    return { canonicalModelId: trimmed, source: 'passthrough' };
  }

  return {
    canonicalModelId: roleDefaultModelId(options.role, options.experimental),
    source: 'role_default',
  };
}
