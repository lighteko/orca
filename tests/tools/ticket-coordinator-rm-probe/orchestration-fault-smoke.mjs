import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  readdirSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  captureProcessIdentity,
  captureScopedDaemonIdentity,
  killVerifiedProcess
} from './orchestration-process-identity.mjs'
import {
  createUniqueBranchEvidence,
  readArchiveExitEvidence,
  verifyPreservedBranchEvidence,
  verifyResidualResourceSnapshot
} from './orchestration-archive-failure-evidence.mjs'

const runtimePath = process.env.ORCA_PROBE_PROCESS_RUNTIME
assert.ok(runtimePath, 'ORCA_PROBE_PROCESS_RUNTIME must name the bundled process runtime')
const runtime = createRequire(import.meta.url)(runtimePath)
assert.equal(
  runtime.isWindowsProcessStartTimeAvailable(),
  true,
  'native process start time required'
)

const installDir =
  process.env.ORCA_PROBE_INSTALL_DIR ??
  path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'orca')
const orcaExe = process.env.ORCA_PROBE_APP_EXE ?? path.join(installDir, 'Orca.exe')
const orcaCli =
  process.env.ORCA_PROBE_CLI_EXE ?? path.join(installDir, 'resources', 'bin', 'orca.exe')
const outDir = process.argv[2] ?? path.join(tmpdir(), `orca-orchestration-fault-${Date.now()}`)
const scenario = process.argv[3] ?? 'app-only'
assert.ok(['app-only', 'app-and-daemon'].includes(scenario), `unknown scenario: ${scenario}`)
const expectedDaemonReplay = process.env.ORCA_PROBE_EXPECT_DAEMON_REPLAY ?? 'request_mismatch'
assert.ok(
  ['request_mismatch', 'operation_unknown'].includes(expectedDaemonReplay),
  `unknown daemon replay expectation: ${expectedDaemonReplay}`
)
const archiveExitCode = Number.parseInt(process.env.ORCA_PROBE_ARCHIVE_EXIT_CODE ?? '0', 10)
assert.ok(
  Number.isInteger(archiveExitCode) && archiveExitCode >= 0 && archiveExitCode <= 255,
  `invalid archive exit code: ${process.env.ORCA_PROBE_ARCHIVE_EXIT_CODE}`
)
const preserveUniqueBranch = process.env.ORCA_PROBE_PRESERVE_UNIQUE_BRANCH === '1'
if (preserveUniqueBranch) {
  assert.notEqual(archiveExitCode, 0, 'branch-preservation probe requires archive failure')
}
assert.equal(existsSync(outDir), false, `probe output directory already exists: ${outDir}`)
mkdirSync(outDir, { recursive: false })
const profileDir = path.join(outDir, 'profile')
const homeDir = path.join(outDir, 'home')
const repoDir = path.join(outDir, 'repo')
const evidenceDir = path.join(outDir, 'evidence')
const nonce = randomUUID()
const requestId = randomUUID()
const env = { ...process.env, ORCA_USER_DATA_PATH: profileDir, ORCA_BACKGROUND_LAUNCH: '1' }
const spawnedAppPids = new Set()
const liveAppIdentities = new Map()

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function command(program, args, options = {}) {
  const result = await runtime.runProcess({
    program,
    args,
    cwd: options.cwd,
    env: options.env ?? env,
    timeoutMs: options.timeoutMs ?? 120_000
  })
  if (!options.allowFailure) {
    assert.equal(result.timedOut, false, `${program} timed out`)
    assert.equal(result.code, 0, `${program} failed: ${result.stderr || result.stdout}`)
  }
  return result
}

async function cli(args, options = {}) {
  const result = await command(orcaCli, [...args, '--json'], {
    ...options,
    allowFailure: true
  })
  const text = result.stdout.trim()
  assert.ok(text, `orca ${args.join(' ')} returned no JSON: ${result.stderr}`)
  const parsed = JSON.parse(text)
  if (!options.allowFailure) {
    assert.equal(parsed.ok, true, JSON.stringify(parsed.error))
  }
  return parsed
}

async function waitFor(predicate, description, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) {
      return value
    }
    await delay(100)
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function launchApp() {
  const child = runtime.spawnProcess({
    program: orcaExe,
    args: [],
    env: {
      ...process.env,
      ORCA_E2E_USER_DATA_DIR: profileDir,
      ORCA_E2E_HOME_DIR: homeDir,
      ORCA_E2E_HEADLESS: '1',
      ORCA_BACKGROUND_LAUNCH: '1',
      USERPROFILE: homeDir,
      HOME: homeDir
    },
    cwd: outDir,
    timeoutMs: null
  })
  child.stdout.on('error', () => {})
  child.stderr.on('error', () => {})
  assert.ok(child.pid, 'Orca launch returned no PID')
  spawnedAppPids.add(child.pid)
  const identity = await waitFor(async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`spawned Orca process ${child.pid} exited before identity capture`)
    }
    try {
      const captured = await captureProcessIdentity(runtime, child.pid, orcaExe)
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`spawned Orca process ${child.pid} exited during identity capture`)
      }
      return captured
    } catch {
      return null
    }
  }, 'isolated app process identity')
  liveAppIdentities.set(child.pid, identity)
  if (process.env.ORCA_PROBE_FAIL_AFTER_APP_IDENTITY === '1') {
    throw new Error('injected failure after app identity capture')
  }
  await waitFor(
    async () => {
      try {
        return (await cli(['status'], { allowFailure: true })).result?.runtime?.state === 'ready'
      } catch {
        return false
      }
    },
    'isolated runtime readiness',
    120_000
  )
  return { child, identity }
}

async function killTrackedApp(identity) {
  await killVerifiedProcess(runtime, identity)
  spawnedAppPids.delete(identity.pid)
  liveAppIdentities.delete(identity.pid)
}

async function setupRepo() {
  mkdirSync(repoDir, { recursive: true })
  mkdirSync(evidenceDir, { recursive: true })
  copyFileSync(
    path.join(import.meta.dirname, 'orchestration-probe-hooks.cjs'),
    path.join(repoDir, '.orca-probe-hooks.cjs')
  )
  writeFileSync(
    path.join(repoDir, 'orchestration-probe.json'),
    JSON.stringify({ nonce, evidenceDir, setupDeadlineMs: 120_000, archiveExitCode })
  )
  writeFileSync(
    path.join(repoDir, 'orca.yaml'),
    'setupAgentStartupPolicy: wait-for-setup\nscripts:\n  setup: |\n    node ".orca-probe-hooks.cjs" setup\n  archive: |\n    node ".orca-probe-hooks.cjs" archive\n'
  )
  writeFileSync(path.join(repoDir, 'README.md'), 'fault probe\n')
  await command('git.exe', ['init', '--quiet'], { cwd: repoDir })
  await command('git.exe', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: repoDir })
  await command('git.exe', ['add', '.'], { cwd: repoDir })
  await command(
    'git.exe',
    ['-c', 'user.name=probe', '-c', 'user.email=p@p', 'commit', '--quiet', '-m', 'init'],
    { cwd: repoDir }
  )
}

let app
let daemon
let activeDaemon
const observations = {}
const cleanupErrors = []
let mainError
try {
  mkdirSync(homeDir, { recursive: true })
  await setupRepo()
  app = await launchApp()
  const repo = (await cli(['repo', 'add', '--path', repoDir])).result.repo
  const coordinator = (
    await cli([
      'terminal',
      'create',
      '--worktree',
      `path:${repoDir}`,
      '--command',
      'powershell.exe -NoProfile -Command "while ($true) { Start-Sleep -Seconds 60 }"'
    ])
  ).result.terminal
  const run = (
    await cli([
      'orchestration',
      'run-create',
      '--objective',
      'fault barrier smoke',
      '--from',
      coordinator.handle
    ])
  ).result.run
  const startArgs = [
    'orchestration',
    'worker-start',
    '--spec',
    'Probe only. Do not edit files.',
    '--worktree',
    'new-top-level',
    '--repo',
    `id:${repo.id}`,
    '--name',
    'fault-worker',
    '--agent',
    'claude',
    '--setup',
    'run',
    '--run',
    run.id,
    '--from',
    coordinator.handle,
    '--retry-request',
    requestId,
    '--timeout-ms',
    '120000'
  ]
  const startPromise = cli(startArgs, { allowFailure: true }).catch((error) => ({
    error: String(error)
  }))
  await waitFor(
    () => existsSync(path.join(evidenceDir, `${nonce}-setup-entered.json`)),
    'setup barrier entry'
  )
  const pending = await waitFor(async () => {
    const shown = await cli(['orchestration', 'request-show', '--request', requestId], {
      allowFailure: true
    })
    return shown.result?.state === 'pending' ? shown : null
  }, 'pending mutation receipt')
  const beforeWorkers = await cli(['orchestration', 'worker-list', '--run', run.id])
  const beforeWorktrees = await cli(['worktree', 'list', '--repo', `id:${repo.id}`])
  assert.equal(beforeWorkers.result.workers.length, 1)
  assert.equal(beforeWorktrees.result.worktrees.length, 2)
  const originalDispatchId = pending.result.receipt.accepted.dispatchId
  const workerWorktreeId = beforeWorkers.result.workers[0].resource.worktreeId
  daemon = await captureScopedDaemonIdentity(runtime, profileDir, orcaExe)
  activeDaemon = daemon
  observations.before = { pending, workers: beforeWorkers.result.workers, daemon }

  await killTrackedApp(app.identity)
  if (scenario === 'app-only') {
    const daemonAfterKill = await captureScopedDaemonIdentity(runtime, profileDir, orcaExe)
    assert.equal(daemonAfterKill.pid, daemon.pid)
    assert.equal(daemonAfterKill.creationTimeMs, daemon.creationTimeMs)
  } else {
    await killVerifiedProcess(runtime, daemon, { tree: true })
    activeDaemon = undefined
  }
  app = await launchApp()
  activeDaemon = await captureScopedDaemonIdentity(runtime, profileDir, orcaExe)
  if (scenario === 'app-and-daemon') {
    assert.notEqual(activeDaemon.creationTimeMs, daemon.creationTimeMs)
  }

  const afterShow = await cli(['orchestration', 'request-show', '--request', requestId], {
    allowFailure: true
  })
  assert.equal(afterShow.result?.state, 'pending')
  const replay = await cli(startArgs, { allowFailure: true })
  const afterWorkers = await cli(['orchestration', 'worker-list', '--run', run.id])
  const afterWorktrees = await cli(['worktree', 'list', '--repo', `id:${repo.id}`])
  assert.equal(afterWorkers.result.workers.length, 1, 'fault recovery created another worker')
  assert.equal(afterWorktrees.result.worktrees.length, 2, 'fault recovery created another worktree')
  assert.equal(
    afterWorkers.result.workers[0].dispatchId,
    beforeWorkers.result.workers[0].dispatchId
  )
  assert.equal(afterWorkers.result.workers[0].taskId, beforeWorkers.result.workers[0].taskId)
  assert.equal(afterWorkers.result.workers[0].resource.worktreeId, workerWorktreeId)
  assert.deepEqual(
    afterWorktrees.result.worktrees.map(({ id, path: worktreePath, name }) => ({
      id,
      path: worktreePath,
      name
    })),
    beforeWorktrees.result.worktrees.map(({ id, path: worktreePath, name }) => ({
      id,
      path: worktreePath,
      name
    }))
  )
  if (scenario === 'app-only') {
    assert.equal(replay.error?.code, 'operation_unknown')
    assert.equal(replay.error?.data?.dispatchId, originalDispatchId)
  } else {
    assert.equal(replay.error?.code, expectedDaemonReplay)
    if (expectedDaemonReplay === 'operation_unknown') {
      assert.equal(replay.error?.data?.dispatchId, originalDispatchId)
    }
  }
  if (scenario === 'app-and-daemon') {
    const replacementCoordinator = (
      await cli([
        'terminal',
        'create',
        '--worktree',
        `path:${repoDir}`,
        '--command',
        'powershell.exe -NoProfile -Command "while ($true) { Start-Sleep -Seconds 60 }"'
      ])
    ).result.terminal
    const rebound = await cli([
      'orchestration',
      'run-use',
      '--id',
      run.id,
      '--from',
      replacementCoordinator.handle
    ])
    const current = await cli([
      'orchestration',
      'run-current',
      '--from',
      replacementCoordinator.handle
    ])
    assert.equal(rebound.result.run.id, run.id)
    assert.equal(current.result.run.id, run.id)
    observations.rebind = { replacementCoordinator, rebound, current }
  }
  observations.after = { scenario, afterShow, replay, workers: afterWorkers.result.workers }

  writeFileSync(path.join(evidenceDir, `${nonce}-release`), 'release\n')
  if (scenario === 'app-only') {
    await waitFor(
      () => existsSync(path.join(evidenceDir, `${nonce}-setup-completed.json`)),
      'setup barrier completion'
    )
  } else {
    await delay(1000)
    assert.equal(
      existsSync(path.join(evidenceDir, `${nonce}-setup-completed.json`)),
      false,
      'daemon loss must not fabricate setup completion'
    )
  }
  observations.originalCommand = await startPromise
  const events = readFileSync(path.join(evidenceDir, 'hook-events.jsonl'), 'utf8')
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line))
  assert.equal(
    events.filter((event) => event.action === 'setup' && event.phase === 'entered').length,
    1,
    'setup hook ran more than once'
  )
  const branchBeforeRemoval = await createUniqueBranchEvidence({
    command,
    workerWorktreeId,
    nonce,
    enabled: preserveUniqueBranch
  })
  if (branchBeforeRemoval) {
    observations.branchBeforeRemoval = branchBeforeRemoval
  }
  const showBeforeStop = await cli(
    ['orchestration', 'worker-show', '--dispatch', originalDispatchId],
    { allowFailure: true }
  )
  const terminalsBeforeRemoval = await cli([
    'terminal',
    'list',
    '--worktree',
    `id:${workerWorktreeId}`
  ])
  observations.preCleanup = { showBeforeStop, terminalsBeforeRemoval }
  const residualResourcesBeforeRemoval = verifyResidualResourceSnapshot({
    showBeforeStop,
    terminalsBeforeRemoval,
    workerWorktreeId,
    expectLiveTerminals: scenario === 'app-only'
  })
  const stopped = await cli(['orchestration', 'worker-stop', '--dispatch', originalDispatchId], {
    allowFailure: true
  })
  const showAfterStop = await cli(
    ['orchestration', 'worker-show', '--dispatch', originalDispatchId],
    { allowFailure: true }
  )
  const abandoned = await cli(
    ['orchestration', 'worker-abandon', '--dispatch', originalDispatchId],
    { allowFailure: true }
  )
  const released = await cli(
    ['orchestration', 'worker-release', '--dispatch', originalDispatchId],
    { allowFailure: true }
  )
  const removed = await cli(
    ['worktree', 'rm', '--worktree', `id:${workerWorktreeId}`, '--run-hooks'],
    { allowFailure: true }
  )
  await waitFor(
    () => existsSync(path.join(evidenceDir, `${nonce}-archive-completed.json`)),
    'archive hook completion'
  )
  await waitFor(
    () => existsSync(path.join(evidenceDir, `${nonce}-archive-exited.json`)),
    'archive hook process exit'
  )
  const archiveEvidence = readArchiveExitEvidence({ evidenceDir, nonce, archiveExitCode })
  const verifiedArchiveFailure = await verifyPreservedBranchEvidence({
    command,
    removed,
    repoDir,
    branchBeforeRemoval,
    archiveEvidence
  })
  if (verifiedArchiveFailure) {
    observations.archiveFailure = verifiedArchiveFailure
  }
  const showAfterRemoval = await cli(
    ['orchestration', 'worker-show', '--dispatch', originalDispatchId],
    { allowFailure: true }
  )
  const listAfterRemoval = await cli(['orchestration', 'worker-list', '--run', run.id], {
    allowFailure: true
  })
  const worktreesAfterRemoval = await cli(['worktree', 'list', '--repo', `id:${repo.id}`])
  const releaseAfterRemoval = await cli(
    ['orchestration', 'worker-release', '--dispatch', originalDispatchId],
    { allowFailure: true }
  )
  const previousAppIdentity = app.identity
  await killTrackedApp(previousAppIdentity)
  app = await launchApp()
  activeDaemon = await captureScopedDaemonIdentity(runtime, profileDir, orcaExe)
  const showAfterRestart = await cli(
    ['orchestration', 'worker-show', '--dispatch', originalDispatchId],
    { allowFailure: true }
  )
  const listAfterRestart = await cli(['orchestration', 'worker-list', '--run', run.id], {
    allowFailure: true
  })
  assert.equal(abandoned.result?.state, 'abandoned')
  if (scenario === 'app-only') {
    assert.equal(stopped.result?.state, 'stop_unknown')
    assert.equal(released.result?.state, 'retained')
  }
  const expectedReleaseAfterRemoval = scenario === 'app-only' ? 'not_requested' : 'released'
  assert.equal(removed.result?.removed, true)
  assert.equal(showAfterRemoval.result?.worker?.state, 'abandoned')
  assert.equal(showAfterRemoval.result?.terminalResource?.releaseState, expectedReleaseAfterRemoval)
  assert.equal(listAfterRemoval.result?.workers?.[0]?.resource?.worktreeId, workerWorktreeId)
  assert.equal(
    listAfterRemoval.result?.workers?.[0]?.resource?.releaseState,
    expectedReleaseAfterRemoval
  )
  assert.equal(
    releaseAfterRemoval.result?.state,
    scenario === 'app-only' ? 'released' : 'already_released'
  )
  assert.equal(showAfterRestart.result?.worker?.state, 'abandoned')
  assert.equal(showAfterRestart.result?.terminalResource?.worktreeId, workerWorktreeId)
  assert.equal(showAfterRestart.result?.terminalResource?.ownershipState, 'released')
  assert.equal(showAfterRestart.result?.terminalResource?.releaseState, 'released')
  assert.equal(listAfterRestart.result?.workers?.[0]?.resource?.worktreeId, workerWorktreeId)
  assert.equal(listAfterRestart.result?.workers?.[0]?.resource?.releaseState, 'released')
  assert.equal(
    worktreesAfterRemoval.result.worktrees.some((worktree) => worktree.id === workerWorktreeId),
    false,
    'removed worktree remains in Orca inventory'
  )
  assert.deepEqual(
    showAfterRestart.result?.worker?.residualResources,
    residualResourcesBeforeRemoval,
    'residualResources changed instead of remaining a durable failure-time snapshot'
  )
  observations.residualResourceClassification = {
    classification: 'durable_failure_snapshot_not_current_inventory',
    beforeRemoval: residualResourcesBeforeRemoval,
    currentWorktreePresentAfterRemoval: worktreesAfterRemoval.result.worktrees.some(
      (worktree) => worktree.id === workerWorktreeId
    ),
    finalTerminalOwnership: showAfterRestart.result?.terminalResource?.ownershipState,
    finalTerminalRelease: showAfterRestart.result?.terminalResource?.releaseState
  }
  observations.cleanup = {
    showBeforeStop,
    terminalsBeforeRemoval,
    stopped,
    showAfterStop,
    abandoned,
    released,
    removed,
    showAfterRemoval,
    listAfterRemoval,
    worktreesAfterRemoval,
    releaseAfterRemoval,
    showAfterRestart,
    listAfterRestart
  }
} catch (error) {
  mainError = error
} finally {
  for (const pid of spawnedAppPids) {
    const rows = await runtime.readWindowsProcessTableFresh()
    if (!rows.some((row) => row.pid === pid)) {
      continue
    }
    const identity = liveAppIdentities.get(pid)
    if (!identity) {
      cleanupErrors.push(
        new Error(`app process ${pid} is still present but its spawn identity is unverifiable`)
      )
      continue
    }
    try {
      await killVerifiedProcess(runtime, identity, { tree: true })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  const daemonDir = path.join(profileDir, 'daemon')
  const hasDaemonPidRecord =
    existsSync(daemonDir) &&
    readdirSync(daemonDir, { withFileTypes: true }).some(
      (entry) => entry.isFile() && /^daemon-v\d+\.pid$/u.test(entry.name)
    )
  if (hasDaemonPidRecord) {
    try {
      const daemonIdentity = await captureScopedDaemonIdentity(runtime, profileDir, orcaExe)
      await killVerifiedProcess(runtime, daemonIdentity, { tree: true })
    } catch (error) {
      const rows = await runtime.readWindowsProcessTableFresh()
      const recordedPids = readdirSync(daemonDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^daemon-v\d+\.pid$/u.test(entry.name))
        .map((entry) => JSON.parse(readFileSync(path.join(daemonDir, entry.name), 'utf8')).pid)
      if (rows.some((row) => recordedPids.includes(row.pid))) {
        cleanupErrors.push(error)
      }
    }
  }
  if (cleanupErrors.length > 0) {
    observations.cleanupErrors = cleanupErrors.map(String)
  }
  writeFileSync(
    path.join(outDir, 'observations.json'),
    `${JSON.stringify(observations, null, 2)}\n`
  )
}

if (mainError) {
  throw cleanupErrors.length > 0
    ? new AggregateError([mainError, ...cleanupErrors], 'probe and cleanup failed')
    : mainError
}
if (cleanupErrors.length > 0) {
  throw new AggregateError(cleanupErrors, 'probe cleanup failed')
}
console.log(
  JSON.stringify(
    {
      ok: true,
      stage: preserveUniqueBranch
        ? 'archive-failure-and-branch-preservation-validated'
        : 'fault-and-accounting-validated',
      observations
    },
    null,
    2
  )
)
