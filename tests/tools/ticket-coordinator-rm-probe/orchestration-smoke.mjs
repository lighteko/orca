/**
 * M0 orchestration delegation smoke test against an isolated installed Orca runtime.
 *
 * This intentionally covers the no-fault path first. The restart matrix builds on the
 * observed receipt shapes instead of guessing recovery fields.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const installDir = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'orca')
const orcaExe = path.join(installDir, 'Orca.exe')
const orcaCli = path.join(installDir, 'resources', 'bin', 'orca.exe')
const outDir = process.argv[2] ?? path.join(tmpdir(), `orca-orchestration-smoke-${Date.now()}`)
const profileDir = path.join(outDir, 'profile')
const homeDir = path.join(outDir, 'home')
const repoDir = path.join(outDir, 'repo')
const observations = []

function sleep(ms) {
  execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`])
}

function cli(args, { expectOk = true } = {}) {
  let text
  try {
    text = execFileSync(orcaCli, [...args, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, ORCA_USER_DATA_PATH: profileDir, ORCA_BACKGROUND_LAUNCH: '1' },
      maxBuffer: 64 * 1024 * 1024
    })
  } catch (error) {
    text = String(error.stdout ?? '')
    if (!text) {
      throw error
    }
  }
  const parsed = JSON.parse(text)
  if (expectOk && !parsed.ok) {
    throw new Error(`orca ${args.join(' ')} failed: ${JSON.stringify(parsed.error)}`)
  }
  return parsed
}

function launch() {
  const child = spawn(orcaExe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      ORCA_E2E_USER_DATA_DIR: profileDir,
      ORCA_E2E_HOME_DIR: homeDir,
      ORCA_E2E_HEADLESS: '1',
      ORCA_BACKGROUND_LAUNCH: '1',
      USERPROFILE: homeDir,
      HOME: homeDir
    }
  })
  child.unref()
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      if (cli(['status']).result?.runtime?.state === 'ready') {
        return child.pid
      }
    } catch {
      // Runtime is still starting.
    }
    sleep(1000)
  }
  throw new Error('Isolated runtime never became ready')
}

function kill(pid, tree = false) {
  if (!pid) {
    return
  }
  try {
    execFileSync('taskkill', ['/pid', String(pid), ...(tree ? ['/T'] : []), '/F'], {
      stdio: 'ignore'
    })
  } catch {
    // Already exited.
  }
}

function daemonPid() {
  const dir = path.join(profileDir, 'daemon')
  if (!existsSync(dir)) {
    return undefined
  }
  const names = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-ChildItem -LiteralPath '${dir}' -Filter 'daemon-v*.pid' | Select-Object -First 1).FullName`
    ],
    { encoding: 'utf8' }
  ).trim()
  return names ? JSON.parse(readFileSync(names, 'utf8')).pid : undefined
}

function git(args) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' })
}

function record(step, value) {
  observations.push({ step, value })
  console.log(`[orchestration-smoke] ${step}: ${JSON.stringify(value).slice(0, 1200)}`)
}

let appPid
try {
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(repoDir, { recursive: true })
  git(['init', '--quiet'])
  git(['symbolic-ref', 'HEAD', 'refs/heads/main'])
  writeFileSync(path.join(repoDir, 'README.md'), 'orchestration probe\n')
  writeFileSync(
    path.join(repoDir, 'orca.yaml'),
    "scripts:\n  setup: |\n    node -e \"require('fs').writeFileSync('setup.marker', 'ok')\"\n  archive: |\n    node -e \"require('fs').writeFileSync('archive.marker', 'ok')\"\n"
  )
  git(['add', '.'])
  git(['-c', 'user.name=probe', '-c', 'user.email=p@p', 'commit', '--quiet', '-m', 'init'])

  appPid = launch()
  const repo = cli(['repo', 'add', '--path', repoDir]).result.repo
  const coordinator = cli([
    'terminal',
    'create',
    '--worktree',
    `path:${repoDir}`,
    '--command',
    'powershell.exe -NoProfile -Command "Write-Output COORDINATOR_READY; while ($true) { Start-Sleep -Seconds 60 }"'
  ]).result.terminal
  sleep(3000)
  record('coordinator', coordinator)

  const runReceipt = cli([
    'orchestration',
    'run-create',
    '--objective',
    'ticket workspace delegation smoke',
    '--from',
    coordinator.handle
  ])
  const run = runReceipt.result.run
  record('run-create', runReceipt.result)

  const requestId = randomUUID()
  const startArgs = [
    'orchestration',
    'worker-start',
    '--spec',
    'Do not edit files. Report the setup.marker presence, send worker_done succeeded, then idle.',
    '--worktree',
    'new-top-level',
    '--repo',
    `id:${repo.id}`,
    '--name',
    'orchestration-smoke-worker',
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
  const started = cli(startArgs, { expectOk: false })
  record('worker-start', started)
  const shown = cli(['orchestration', 'request-show', '--request', requestId], {
    expectOk: false
  })
  record('request-show', shown)
  const replay = cli(startArgs, { expectOk: false })
  record('worker-start-replay', replay)
  const worktrees = cli(['worktree', 'list', '--repo', `id:${repo.id}`], { expectOk: false })
  record('worktrees', worktrees)
  const workers = cli(['orchestration', 'worker-list', '--run', run.id], { expectOk: false })
  record('workers', workers)

  assert.equal(started.ok, true, 'worker-start must return a durable receipt')
  assert.equal(shown.ok, true, 'request-show must read the durable receipt')
  assert.equal(shown.result.state, 'completed', 'the mutation receipt must be complete')
  assert.equal(replay.ok, true, 'the keyed replay must return the recorded receipt')
  assert.equal(replay.result.mutation?.replayed, true, 'the keyed retry must be a replay')
  assert.equal(replay.result.taskId, started.result.taskId, 'replay must preserve the Task')
  assert.equal(
    replay.result.dispatchId,
    started.result.dispatchId,
    'replay must preserve the Dispatch'
  )
  const repoWorktrees = worktrees.result?.worktrees ?? []
  const workerWorktrees = repoWorktrees.filter((row) => row.id !== coordinator.worktreeId)
  assert.equal(workerWorktrees.length, 1, 'exactly one worker worktree must exist')
  assert.equal(
    workerWorktrees[0]?.displayName,
    'orchestration-smoke-worker',
    'the worker name must not gain a duplicate suffix'
  )
  assert.equal(workers.result?.workers?.length, 1, 'exactly one worker row must exist')
  assert.equal(
    workers.result.workers[0]?.dispatchId,
    started.result.dispatchId,
    'the worker row must belong to the original Dispatch'
  )
  assert.equal(
    existsSync(path.join(workerWorktrees[0].path, 'setup.marker')),
    true,
    'the setup hook must have written its marker'
  )
  record('assertions', {
    passed: true,
    scope: 'placement, setup, and mutation-receipt replay; not agent task completion',
    workerState: started.result.state
  })
} catch (error) {
  record('error', { message: String(error.message ?? error), stack: error.stack })
  process.exitCode = 1
} finally {
  kill(appPid)
  kill(daemonPid(), true)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    path.join(outDir, 'observations.json'),
    `${JSON.stringify(observations, null, 2)}\n`
  )
  console.log(`[orchestration-smoke] wrote ${path.join(outDir, 'observations.json')}`)
}
