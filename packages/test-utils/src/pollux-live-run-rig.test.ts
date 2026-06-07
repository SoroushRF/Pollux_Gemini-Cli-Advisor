/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDefaultCampaignManifest,
  buildRealBenchmarkSettings,
  getPolluxRealConditionsById,
} from './pollux-real-config.js';
import {
  POLLUX_REAL_DEFAULT_MAX_MODEL_RESPONSES,
  POLLUX_REAL_DEFAULT_SCRATCH_ROOT,
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

  it('defaults live scratch workspaces outside the repository artifact tree', () => {
    const rig = createRig();

    expect((rig as unknown as { scratchRoot: string }).scratchRoot).toBe(
      POLLUX_REAL_DEFAULT_SCRATCH_ROOT,
    );
    expect(
      (rig as unknown as { scratchRoot: string }).scratchRoot,
    ).not.toContain('artifacts/pollux');
  });

  it('sets a bounded task-local shell inactivity timeout in benchmark settings', () => {
    const settings = buildRealBenchmarkSettings(
      getPolluxRealConditionsById(['A'])[0],
      'telemetry.log',
    ) as { tools?: { shell?: { inactivityTimeout?: number } } };

    expect(settings.tools?.shell?.inactivityTimeout).toBe(45);
  });

  it('does not invalidate an oracle-passing early stop solely for missing response telemetry', () => {
    const rig = createRig();
    const computeInvalidationReason = (
      rig as unknown as {
        computeInvalidationReason: (
          exitCode: number,
          timedOut: boolean,
          telemetryEvents: unknown[],
          telemetry: { responseIds: string[]; promptIds: string[] },
          maxModelResponsesPerSample: number,
          fairnessPins: Record<string, boolean>,
          structuredErrorEvidence: null,
          stderr: string,
          oraclePass: boolean,
          earlyStopOraclePassed: boolean,
          workspacePackageEscapedRepoRoot: boolean,
        ) => string | undefined;
      }
    ).computeInvalidationReason.bind(rig);

    expect(
      computeInvalidationReason(
        0,
        false,
        [{ body: 'event' }],
        { responseIds: [], promptIds: ['prompt'] },
        15,
        {
          routerPinned: true,
          loopDetectionDisabled: true,
          availabilityReset: true,
          dynamicConfigFixed: true,
          sessionIsolated: true,
          sandboxIsolated: true,
        },
        null,
        '',
        true,
        true,
        false,
      ),
    ).toBeUndefined();
  });
});
