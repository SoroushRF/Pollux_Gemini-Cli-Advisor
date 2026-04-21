/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { ToolCallRequestInfo } from '../../../scheduler/types.js';
import type { PolluxDetectorConfig } from '../../types.js';
import {
  classifyToolCallRisk,
  RISK_GATE_ELEVATED_FILE_COUNT_THRESHOLD,
  RISK_PRE_TOOL_HIGH_SIGNAL_ID,
  RISK_PRE_TOOL_HIGH_SIGNAL_PRECISION,
  RISK_PRE_TOOL_HIGH_SIGNAL_WEIGHT,
  RISK_GATE_SENSOR_ID,
} from './riskGate.js';

function makeRequest(
  name: string,
  args: Record<string, unknown>,
): ToolCallRequestInfo {
  return {
    callId: 'call-1',
    name,
    args,
    isClientInitiated: false,
    prompt_id: 'prompt-1',
  };
}

const BLOCKLIST_CONFIG: PolluxDetectorConfig['riskGate'] = {
  enabled: true,
  mode: 'blocklist',
  denyPatterns: [],
};

describe('pollux/observer/sensors/riskGate', () => {
  it('exports stable sensor + hard-precision metadata constants', () => {
    expect(RISK_GATE_SENSOR_ID).toBe('sensor.risk_gate');
    expect(RISK_PRE_TOOL_HIGH_SIGNAL_ID).toBe('risk.pre_tool_high');
    expect(RISK_PRE_TOOL_HIGH_SIGNAL_WEIGHT).toBe(3);
    expect(RISK_PRE_TOOL_HIGH_SIGNAL_PRECISION).toBe(0.95);
    expect(RISK_GATE_ELEVATED_FILE_COUNT_THRESHOLD).toBe(5);
  });

  it('classifies all seeded dangerous shell commands as high risk (20/20)', () => {
    const dangerousCommands = [
      'rm -rf /tmp/*',
      'sudo rm -rf .',
      'git push --force origin main',
      'git push --force upstream release',
      'DROP TABLE users;',
      'drop table audit_logs',
      'DELETE FROM users',
      'delete from sessions;',
      'chmod 777 /var/www/app.sh',
      'chmod 777 scripts/deploy.sh',
      'cat payload.bin > /dev/sda',
      'dd if=/dev/zero > /dev/sdb',
      'rm   -rf   ../',
      'sh -c "rm -rf /"',
      'psql -c "DELETE FROM accounts"',
      'python -c "print(\'DROP TABLE x\')"',
      'git    push    --force',
      'echo ok; rm -rf ./build',
      'delete from logs',
      'cat image.bin > /dev/sdc',
    ];

    let highCount = 0;
    for (const command of dangerousCommands) {
      const result = classifyToolCallRisk(
        makeRequest('run_shell_command', { command }),
        BLOCKLIST_CONFIG,
      );
      if (result.risk === 'high') {
        highCount++;
      }
    }

    expect(highCount).toBe(dangerousCommands.length);
  });

  it('classifies all seeded benign shell commands as non-high risk (50/50)', () => {
    const benignCommands = [
      'ls',
      'pwd',
      'git status',
      'git log --oneline -5',
      'git diff',
      'git branch',
      'git checkout feature/risk-gate',
      'git pull --rebase',
      'git push origin main',
      'npm test',
      'npm run build',
      'npm run lint',
      'npm ci',
      'node --version',
      'pnpm test',
      'yarn test',
      'python --version',
      'pytest -q',
      'mvn test',
      'gradle test',
      'go test ./...',
      'cargo test',
      'echo "hello"',
      'cat README.md',
      'head -n 20 package.json',
      'tail -n 50 logs/app.log',
      'grep -R "TODO" src',
      'find src -name "*.ts"',
      'du -sh .',
      'df -h',
      'ps aux',
      'top -bn1 | head -n 5',
      'whoami',
      'date',
      'hostname',
      'chmod 755 scripts/release.sh',
      'chown user:group ./tmp',
      'cp src/a.ts src/a.bak',
      'mv src/a.bak src/a.ts',
      'mkdir -p tmp/cache',
      'touch tmp/file.txt',
      'rm tmp/file.txt',
      'sed -n "1,40p" src/index.ts',
      'awk "{print $1}" data.txt',
      'curl -I https://example.com',
      'wget https://example.com/file.tar.gz',
      'docker ps',
      'kubectl get pods',
      'terraform plan',
      'ansible-playbook --check site.yml',
    ];

    let nonHighCount = 0;
    for (const command of benignCommands) {
      const result = classifyToolCallRisk(
        makeRequest('run_shell_command', { command }),
        BLOCKLIST_CONFIG,
      );
      if (result.risk !== 'high') {
        nonHighCount++;
      }
    }

    expect(nonHighCount).toBe(benignCommands.length);
  });

  it('treats delete-like tools as high risk', () => {
    const result = classifyToolCallRisk(
      makeRequest('delete_file', { file_path: 'src/app.ts' }),
      BLOCKLIST_CONFIG,
    );
    expect(result.risk).toBe('high');
  });

  it('uses configured deny patterns in blocklist mode', () => {
    const config: PolluxDetectorConfig['riskGate'] = {
      enabled: true,
      mode: 'blocklist',
      denyPatterns: ['npx\\s+dangerous-script'],
    };

    const blocked = classifyToolCallRisk(
      makeRequest('run_shell_command', { command: 'npx dangerous-script' }),
      config,
    );
    expect(blocked.risk).toBe('high');

    const safe = classifyToolCallRisk(
      makeRequest('run_shell_command', { command: 'npx eslint .' }),
      config,
    );
    expect(safe.risk).toBe('low');
  });

  it('supports allowlist mode while still enforcing built-in high-risk patterns', () => {
    const allowlist: PolluxDetectorConfig['riskGate'] = {
      enabled: true,
      mode: 'allowlist',
      denyPatterns: ['^npm\\s+test$'],
    };

    const allowlisted = classifyToolCallRisk(
      makeRequest('run_shell_command', { command: 'npm test' }),
      allowlist,
    );
    expect(allowlisted.risk).toBe('low');

    const nonAllowlisted = classifyToolCallRisk(
      makeRequest('run_shell_command', { command: 'npm run build' }),
      allowlist,
    );
    expect(nonAllowlisted.risk).toBe('high');

    const builtInDanger = classifyToolCallRisk(
      makeRequest('run_shell_command', { command: 'rm -rf ./dist' }),
      allowlist,
    );
    expect(builtInDanger.risk).toBe('high');
  });

  it('classifies write/edit path risks per phase-B heuristics', () => {
    const envWrite = classifyToolCallRisk(
      makeRequest('write_file', {
        file_path: '.env.production',
        content: 'TOKEN=abc',
      }),
      BLOCKLIST_CONFIG,
    );
    expect(envWrite.risk).toBe('high');

    const migrationEdit = classifyToolCallRisk(
      makeRequest('replace', {
        file_path: 'migrations/001_init.sql',
        old_string: 'A',
        new_string: 'B',
      }),
      BLOCKLIST_CONFIG,
    );
    expect(migrationEdit.risk).toBe('high');

    const packageDepsWrite = classifyToolCallRisk(
      makeRequest('write_file', {
        file_path: 'package.json',
        content: '{"dependencies":{"left-pad":"1.3.0"}}',
      }),
      BLOCKLIST_CONFIG,
    );
    expect(packageDepsWrite.risk).toBe('high');

    const etcWrite = classifyToolCallRisk(
      makeRequest('write_file', {
        file_path: '/etc/hosts',
        content: '127.0.0.1 localhost',
      }),
      BLOCKLIST_CONFIG,
    );
    expect(etcWrite.risk).toBe('elevated');

    const normalEdit = classifyToolCallRisk(
      makeRequest('replace', {
        file_path: 'src/app.ts',
        old_string: 'foo',
        new_string: 'bar',
      }),
      BLOCKLIST_CONFIG,
    );
    expect(normalEdit.risk).toBe('low');
  });

  it('detects elevated multi-file and cross-package blast radius', () => {
    const manyFiles = classifyToolCallRisk(
      makeRequest('write_file', {
        file_path: 'src/index.ts',
        file_paths: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
        content: 'x',
      }),
      BLOCKLIST_CONFIG,
    );
    expect(manyFiles.risk).toBe('elevated');

    const crossPackage = classifyToolCallRisk(
      makeRequest('write_file', {
        file_path: 'packages/core/src/a.ts',
        file_paths: ['packages/core/src/a.ts', 'packages/cli/src/b.ts'],
        content: 'x',
      }),
      BLOCKLIST_CONFIG,
    );
    expect(crossPackage.risk).toBe('elevated');
  });
});
