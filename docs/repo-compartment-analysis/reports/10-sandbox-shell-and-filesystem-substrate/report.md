# Compartment Report: 10 — Sandbox, Shell, and File System Substrate

## Metadata

- **Compartment**: 10 — Sandbox, Shell, and File System Substrate
- **Tier**: T4
- **Guideline file**: `10-sandbox-shell-and-filesystem-substrate.md`
- **Owner**: composer-agent
- **Started**: 2026-04-16
- **Finished**: 2026-04-16
- **Repo commit analyzed**: c8127045c5832b0e66cb1efd04e0dd6800ce78e7
- **Upstream base commit**: null

## 0. Pre-flight

| Path                                                         | Exists? | Notes (only if material)                                                          |
| ------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------- |
| `packages/core/src/services/sandboxManager.ts`               | yes     | Defines `SandboxManager` interface + `NoopSandboxManager` + `LocalSandboxManager` |
| `packages/core/src/services/sandboxManagerFactory.ts`        | yes     | Platform dispatch (win32/linux/darwin/else)                                       |
| `packages/core/src/services/shellExecutionService.ts`        | yes     | Single static-class gateway for pty + background processes                        |
| `packages/core/src/services/fileSystemService.ts`            | yes     | 2-method interface: `readTextFile` / `writeTextFile`                              |
| `packages/core/src/services/sandboxedFileSystemService.ts`   | yes     | Wraps FS ops via `sandboxManager.prepareCommand('__read'/'__write')`              |
| `packages/core/src/services/executionLifecycleService.ts`    | yes     | Owns background task registry, abort propagation, completion injection            |
| `packages/core/src/sandbox/linux/LinuxSandboxManager.ts`     | yes     | `bwrap` + seccomp BPF                                                             |
| `packages/core/src/sandbox/macos/MacOsSandboxManager.ts`     | yes     | `sandbox-exec` Seatbelt profile                                                   |
| `packages/core/src/sandbox/windows/WindowsSandboxManager.ts` | yes     | Restricted token + `GeminiSandbox.cs` helper                                      |
| `packages/core/src/sandbox/windows/GeminiSandbox.cs`         | yes     | C# helper for Windows restricted-token spawning                                   |
| `packages/core/src/sandbox/utils/commandSafety.ts`           | yes     |                                                                                   |
| `packages/core/src/sandbox/windows/commandSafety.ts`         | yes     | Separate Windows safety set                                                       |
| `packages/core/src/tools/shell.ts`                           | yes     |                                                                                   |
| `packages/core/src/tools/shellBackgroundTools.ts`            | yes     | `list_background_processes`, etc.                                                 |
| `bundle/sandbox-*.sb`                                        | no      | Staged into `bundle/` only at release build time (see compartment 15)             |

## 1. Scope and Boundary

This compartment owns the execution substrate: sandbox-mode selection per
platform, the `ShellExecutionService` pty/child-process gateway (including
background-task lifecycle), and the `FileSystemService` abstraction with its
sandboxed variant. It explains how `bwrap`/Seatbelt/RestrictedToken wrap a
command, how ANSI-capable pty output is captured and injected back into the turn
loop on background completion, and how secret and governance files (`.env*`,
`.git`, `.gitignore`, `.geminiignore`) are write-protected universally.

Explicitly handed off: policy decision semantics (compartment 09 — this layer
enforces what it receives, it does not decide), tool abstractions calling into
this substrate (compartment 04), CLI command parsing (compartment 01), and
performance/integration test baselines (compartment 14). Pollux has no direct
dependency here — confirmed by zero `pollux` references in
`packages/core/src/{services,sandbox}/**` — so this report is a compatibility
confirmation, not a design input.

## 2. Runtime Flow Summary

### Sandbox manager selection

1. Config resolves `SandboxConfig` from settings; factory entry at
   `packages/core/src/services/sandboxManagerFactory.ts:22-43`.
2. If `sandbox.enabled` is false, factory returns `NoopSandboxManager` (env
   sanitization only): `sandboxManagerFactory.ts:42`.
3. If enabled, branch on `os.platform()` to `WindowsSandboxManager`,
   `LinuxSandboxManager`, or `MacOsSandboxManager`; otherwise
   `LocalSandboxManager` (which throws
   `'Tool sandboxing is not yet implemented'`):
   `sandboxManagerFactory.ts:31-40`, `sandboxManager.ts:337-339`.
4. Factory hydrates `options.modeConfig` from
   `policyManager.getModeConfig(approvalMode)` when absent:
   `sandboxManagerFactory.ts:27-29`.

### Per-platform wrapping

1. Linux: `LinuxSandboxManager` builds `bwrap` args via `buildBwrapArgs` and
   attaches a precompiled seccomp-BPF blob located by architecture:
   `packages/core/src/sandbox/linux/LinuxSandboxManager.ts:40-50` +
   `bwrapArgsBuilder.ts`.
2. macOS: `MacOsSandboxManager` assembles a Seatbelt profile via
   `buildSeatbeltProfile` and runs through `sandbox-exec`:
   `packages/core/src/sandbox/macos/MacOsSandboxManager.ts:24-50`.
3. Windows: `WindowsSandboxManager` loads the C# `GeminiSandbox.cs` helper to
   spawn via Restricted Tokens:
   `packages/core/src/sandbox/windows/WindowsSandboxManager.ts:45-51` +
   `GeminiSandbox.cs`.
4. Universal: `GOVERNANCE_FILES` (`.gitignore`, `.geminiignore`, `.git`) and
   `SECRET_FILES` (`.env`, `.env.*`) are protected by every platform manager via
   `resolveSandboxPaths`: `sandboxManager.ts:193-233`.

### Shell execution pathway

1. Entry from tool: `packages/core/src/tools/shell.ts:38` imports
   `ShellExecutionService`.
2. `ShellExecutionService` is a static class holding per-process maps for active
   ptys, child processes, background log streams, and a per-session
   `backgroundProcessHistory`:
   `packages/core/src/services/shellExecutionService.ts:254-262`.
3. Pty selection: `getPty()` picks `@lydell/node-pty` → `node-pty` →
   `child_process` fallback (see `ExecutionMethod` enum):
   `executionLifecycleService.ts:12-17`.
4. Output is captured through a headless xterm serializer
   (`terminalSerializer.ts`) with a 300,000-line scrollback bound:
   `shellExecutionService.ts:66`.
5. Bash commands are guarded: `BASH_SHOPT_GUARD` disables
   `promptvars nullglob extglob nocaseglob dotglob` before the command to
   neutralize shell-opt surprises: `shellExecutionService.ts:68-79`.
6. Environment is sanitized via
   `sanitizeEnvironment(env, getSecureSanitizationConfig(policy.sanitizationConfig))`
   before spawn: `sandboxManager.ts:292-303`.
7. Background flow: on backgrounding, `ExecutionLifecycleService` registers
   completion callbacks with `CompletionBehavior` = `inject | notify | silent`
   to control re-injection into the conversation:
   `executionLifecycleService.ts:62-95`.
8. Background process history is recorded per-session;
   `list_background_processes` tool reads from
   `ShellExecutionService.listBackgroundProcesses(sessionId)`:
   `shellExecutionService.ts:1528` + `shellBackgroundTools.ts:45-55`.

### Filesystem pathway

1. Direct operations: `StandardFileSystemService` uses `node:fs/promises` — two
   methods only: `fileSystemService.ts:33-41`.
2. Sandboxed operations: `SandboxedFileSystemService.sanitizeAndValidatePath`
   confirms the real path is inside the workspace or in `includeDirectories`,
   then spawns `__read` / `__write` through the sandbox manager's
   `prepareCommand`: `sandboxedFileSystemService.ts:23-129`.
3. Writes stream via child `stdin`; EPIPE is tolerated; ENOENT is detected from
   stderr text patterns (cross-platform):
   `sandboxedFileSystemService.ts:140-158`, `:86-96`.

## 3. Key Files and Citations

| Path                                                         | Role                                   | Notes                                                   |
| ------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------- |
| `packages/core/src/services/sandboxManagerFactory.ts`        | platform dispatch                      | Only entrypoint for creating a SandboxManager           |
| `packages/core/src/services/sandboxManager.ts`               | interface + Noop/Local managers        | Hosts GOVERNANCE_FILES + SECRET_FILES + secret walk     |
| `packages/core/src/sandbox/linux/LinuxSandboxManager.ts`     | Linux sandbox (bwrap + seccomp)        | arch-specific BPF blob lookup                           |
| `packages/core/src/sandbox/macos/MacOsSandboxManager.ts`     | macOS sandbox (Seatbelt)               | Builds profile from permissions                         |
| `packages/core/src/sandbox/windows/WindowsSandboxManager.ts` | Windows sandbox (Restricted Token)     | Uses C# helper                                          |
| `packages/core/src/services/shellExecutionService.ts`        | pty + child_process + background store | Static class; session-scoped history                    |
| `packages/core/src/services/executionLifecycleService.ts`    | abort + completion + background inject | Owns `ExecutionMethod` + `CompletionBehavior`           |
| `packages/core/src/services/sandboxedFileSystemService.ts`   | sandboxed read/write                   | Routes I/O through `prepareCommand('__read'/'__write')` |
| `packages/core/src/services/fileSystemService.ts`            | 2-method FS interface                  | Tool-side consumers depend on this only                 |

## 4. Verified Truths and Contradictions

**Verified truths**

- **VT-10.1** — The factory chooses a platform-specific manager only when
  `sandbox.enabled`; otherwise returns `NoopSandboxManager`, which still applies
  environment sanitization (it is not "no-op" for secrets).
  - Primary: `packages/core/src/services/sandboxManagerFactory.ts:31-43`
  - Supporting: `packages/core/src/services/sandboxManager.ts:285-329`
    (NoopSandboxManager impl)
  - Confidence: high
- **VT-10.2** — `LocalSandboxManager` is a placeholder that throws
  `'Tool sandboxing is not yet implemented.'` and
  `isKnownSafeCommand`/`isDangerousCommand` always return false; in practice
  only the three OS-specific managers actually sandbox.
  - Primary: `packages/core/src/services/sandboxManager.ts:334-360`
  - Confidence: high
- **VT-10.3** — `SandboxedFileSystemService` does not call `node:fs` directly;
  every read/write is routed through `sandboxManager.prepareCommand` with
  synthetic `__read`/`__write` program names and an explicit per-op
  `allowedPaths` policy, then spawned with `child_process.spawn`.
  - Primary: `packages/core/src/services/sandboxedFileSystemService.ts:50-112`
  - Supporting:
    `packages/core/src/services/sandboxedFileSystemService.ts:114-183` (write
    path)
  - Confidence: high
- **VT-10.4** — `ShellExecutionService` is a singleton by virtue of being an
  all-static class with per-process `Map`s for active ptys, child processes, and
  a session-keyed `backgroundProcessHistory`; `list_background_processes` reads
  from that session-scoped map.
  - Primary: `packages/core/src/services/shellExecutionService.ts:254-262`
  - Supporting: `packages/core/src/tools/shellBackgroundTools.ts:45-55`
    (`listBackgroundProcesses` consumer)
  - Confidence: high
- **VT-10.5** — Governance and secret file protection is shared across platforms
  via `GOVERNANCE_FILES` + `SECRET_FILES` + `findSecretFiles` defined in
  `sandboxManager.ts`; Windows/Linux/macOS managers all re-import these
  constants.
  - Primary: `packages/core/src/services/sandboxManager.ts:193-279`
  - Supporting: `packages/core/src/sandbox/linux/LinuxSandboxManager.ts:10-19`,
    `packages/core/src/sandbox/windows/WindowsSandboxManager.ts:15-21`
    (re-imports)
  - Confidence: high

**Contradictions or ambiguities**

- **C-10.1** — The guideline lists `bundle/sandbox-*.sb` as a primary path, but
  no `.sb` files are tracked in the working tree; these are generated at
  bundle/release time (see compartment 15). Evidence: pre-flight result plus
  `scripts/build_binary.js:281-288` which globs `sandbox-macos-*.sb` from
  `bundle/` only after build. Resolution: resolved — the paths exist as build
  outputs, not source.
- **C-10.2** — Windows uses a **separate** `commandSafety.ts` module
  (`packages/core/src/sandbox/windows/commandSafety.ts`) rather than the
  cross-platform one at `packages/core/src/sandbox/utils/commandSafety.ts`;
  `sandboxManager.ts:10-17` imports both under different aliases. Evidence:
  those two files plus `sandboxManager.ts:10-17`. Resolution: resolved —
  intentional, but worth noting for any future "shared safe-command list"
  refactor.

## 5. Risks and Open Questions

**Risks**

- **R-10.1** — Pollux shell-tool benchmarks (compartment 14) may exercise
  `ShellExecutionService` under different `SandboxConfig` inputs; the
  static-class design means background-process history is keyed by `sessionId`
  and can leak across benchmark iterations if sessions are reused. Severity:
  medium. Mitigating test: `no test` at the benchmark level (see compartment
  14's OQ-14.2). Suggested guard: benchmarks must pass a fresh `sessionId` per
  iteration, or call a reset helper.
- **R-10.2** — `LocalSandboxManager` throws at `prepareCommand` time, which
  would surface as a turn-level error only when the first tool executes; if a
  platform dispatcher adds a new value without a manager, this failure mode
  appears silently until the first shell tool runs. Severity: low. Mitigating
  test: `packages/core/src/services/sandboxManager*.test.ts` (existence
  confirmed by guideline). Suggested guard: prefer a synchronous "unsupported
  platform" error at factory time over the lazy throw.
- **R-10.3** — `SandboxedFileSystemService` relies on stderr substring matching
  to translate ENOENT back to Node-style errors; future sandbox wrappers with
  different stderr formatting will miss the ENOENT heuristic and callers will
  see generic `Sandbox Error`. Severity: low. Mitigating test: `no test` cited
  here. Suggested guard: add explicit exit-code mapping alongside the substring
  check.

**Open questions**

- [ ] **OQ-10.1** — Does any advisor-driven tool in Pollux plan to spawn shell
      commands directly, bypassing `ShellExecutionService`? Escalate to
      compartment 04 (tools) and 07 (pollux scaffold).
- [ ] **OQ-10.2** — Should benchmark runs force `sandbox.enabled=false` for
      condition-A/E fairness, and is the resulting `NoopSandboxManager`
      env-sanitization behavior acceptable for perf numbers? Escalate to
      compartment 14.

## 6. Test and Observability Coverage

- **Tests**:
  - `packages/core/src/sandbox/linux/LinuxSandboxManager.test.ts`,
    `.../macos/MacOsSandboxManager.test.ts`,
    `.../windows/WindowsSandboxManager.test.ts`: platform-sandbox behavior and
    denial parsing.
  - `packages/core/src/sandbox/utils/{commandSafety,fsUtils,proactivePermissions,sandboxDenialUtils}.test.ts`:
    shared-utility coverage.
  - `packages/core/src/sandbox/windows/{commandSafety,windowsSandboxDenialUtils}.test.ts`:
    Windows-only denial + safety.
  - `packages/core/src/sandbox/{linux,macos}/{bwrapArgsBuilder,seatbeltArgsBuilder}.test.ts`:
    profile/arg builder unit tests.
- **Observability signals**: `debugLogger` calls in
  `sandboxedFileSystemService.ts`, `shellExecutionService.ts`, sandbox managers;
  per-pid background log files at
  `Storage.getGlobalTempDir()/background-processes/background-<pid>.log`
  (`shellExecutionService.ts:264-287`); `ExecutionMethod` tag on every
  `ExecutionResult`.
- **Coverage gaps**:
  - No integration test for cross-session `backgroundProcessHistory` isolation
    (R-10.1).
  - ENOENT substring heuristic in `SandboxedFileSystemService` not under test
    (R-10.3).

## 7. Definition of Done

- [x] Sandbox architecture is mapped across modes and platforms.
- [x] Shell/background and filesystem pathways are documented.
- [x] Lifecycle and cleanup semantics are evidence-backed.
- [x] Execution risk matrix is published (Section 5).
- [x] Troubleshooting guidance is actionable (R-IDs + OQ-IDs).
- [x] Pre-flight path validation recorded in report section 0.
- [x] Evidence matrix populated in the JSON sidecar.
- [x] `INDEX.md` row 10 flipped to `done`.

## 8. Handoffs

- **Depends on**: 4, 9
- **Affects**: 14
- **Escalated to**: 4 — OQ-10.1 (advisor direct-spawn?); 14 — OQ-10.2 (benchmark
  sandbox mode).
