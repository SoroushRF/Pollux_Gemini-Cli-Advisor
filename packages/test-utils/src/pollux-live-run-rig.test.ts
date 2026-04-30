/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDefaultCampaignManifest } from './pollux-real-config.js';
import {
  POLLUX_REAL_DEFAULT_MAX_MODEL_RESPONSES,
  PolluxLiveRunRig,
} from './pollux-live-run-rig.js';

function createRig(params?: {
  maxModelResponsesPerSample?: number;
  fMaxModelResponsesPerSample?: number;
}) {
  return new PolluxLiveRunRig({
    manifest: buildDefaultCampaignManifest('unit-default-ceiling', []),
    tasks: [],
    artifactRoot: 'artifacts/pollux/unit-default-ceiling',
    repoRoot: process.cwd(),
    ...params,
  });
}

describe('PolluxLiveRunRig default response ceiling', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the permanent real benchmark ceiling when no override is supplied', () => {
    vi.stubEnv('POLLUX_REAL_MAX_MODEL_RESPONSES', '');

    const rig = createRig();

    expect(
      (rig as unknown as { maxModelResponsesPerSample: number })
        .maxModelResponsesPerSample,
    ).toBe(POLLUX_REAL_DEFAULT_MAX_MODEL_RESPONSES);
  });

  it('honors an explicit global response ceiling override', () => {
    const rig = createRig({ maxModelResponsesPerSample: 11 });

    expect(
      (rig as unknown as { maxModelResponsesPerSample: number })
        .maxModelResponsesPerSample,
    ).toBe(11);
  });

  it('honors an F-only response ceiling override while leaving other conditions on the global/default ceiling', () => {
    const rig = createRig({
      maxModelResponsesPerSample: 15,
      fMaxModelResponsesPerSample: 18,
    });
    const getMaxModelResponsesForCondition = (
      rig as unknown as {
        getMaxModelResponsesForCondition: (condition: { id: string }) => number;
      }
    ).getMaxModelResponsesForCondition.bind(rig);

    expect(getMaxModelResponsesForCondition({ id: 'F' })).toBe(18);
    expect(getMaxModelResponsesForCondition({ id: 'A' })).toBe(15);
    expect(getMaxModelResponsesForCondition({ id: 'FR' })).toBe(15);
  });
});
