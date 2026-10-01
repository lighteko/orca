/**
 * Ticket workspace: what does the Orca runtime actually report for worktree create/list/rm?
 *
 * Decides whether the standalone ticket-workspace git adapter can be deleted in favour of
 * delegating to the runtime. Runs the INSTALLED Orca against a disposable profile, home and
 * daemon; the user's own instance is untouched. Read-write only inside its own scratch dirs.
 *
 * Run: node tests/tools/ticket-coordinator-rm-probe/probe.mjs [outDir]
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

const ORCA_EXE = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'orca', 'Orca.exe')
const ORCA_CLI = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Programs',
  'orca',
  'resources',
  'bin',
  'orca.exe'
)
const DAEMON_HOST_DIR = path.join(process.env.LOCALAPPDATA ?? '', 'Orca', 'daemon-host')
const outDir = process.argv[2] ?? path.join(tmpdir(), `orca-rm-probe-${Date.now()}`)
const profileDir = path.join(outDir, 'profile')
const homeDir = path.join(outDir, 'home')
const repoDir = path.join(outDir, 'repo')
const observations = []

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
}

function cli(args, { expectOk = true } = {}) {
  const result = execFileSync(ORCA_CLI, [...args, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, ORCA_USER_DATA_PATH: profileDir },
    // A refusal is a result here, not a crash.
    maxBuffer: 64 * 1024 * 1024
  })
  const parsed = JSON.parse(result)
  if (expectOk && !parsed.ok) {
    throw new Error(`orca ${args.join(' ')} failed: ${JSON.stringify(parsed.error)}`)
  }
  return parsed
}

function cliAllowFailure(args) {
  try {
    return cli(args, { expectOk: false })
  } catch (error) {
    const text = String(error.stdout ?? '')
    try {
      return JSON.parse(text)
    } catch {
      return {
        ok: false,
        error: { code: 'cli_invocation_failed', message: text || String(error.message) }
      }
    }
  }
}

function record(step, detail) {
  observations.push({ step, ...detail })
  console.log(`[probe] ${step}: ${JSON.stringify(detail).slice(0, 220)}`)
}

function daemonHostStamp() {
  if (!existsSync(DAEMON_HOST_DIR)) {
    return []
  }
  return execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Get-ChildItem -LiteralPath '${DAEMON_HOST_DIR}' | ForEach-Object { "$($_.Name)|$($_.LastWriteTimeUtc.Ticks)" }`
    ],
    { encoding: 'utf8' }
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
}

function sleep(ms) {
  execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`])
}

function launchApp() {
  const child = spawn(ORCA_EXE, [], {
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
  for (;;) {
    try {
      const status = cli(['status'])
      if (status.result?.runtime?.state === 'ready') {
        return { pid: child.pid, status: status.result }
      }
    } catch {
      // Runtime is not up yet.
    }
    if (Date.now() >= deadline) {
      throw new Error('Isolated runtime never became ready')
    }
    sleep(1000)
  }
}

function killTree(pid) {
  if (!pid) {
    return
  }
  try {
    execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    // Already gone.
  }
}

function daemonPid() {
  const dir = path.join(profileDir, 'daemon')
  if (!existsSync(dir)) {
    return undefined
  }
  const file = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-ChildItem -LiteralPath '${dir}' -Filter 'daemon-v*.pid' | Select-Object -First 1).FullName`
    ],
    { encoding: 'utf8' }
  ).trim()
  if (!file) {
    return undefined
  }
  return JSON.parse(readFileSync(file, 'utf8')).pid
}

function worktreeRow(id) {
  const list = cli(['worktree', 'list'])
  return list.result.worktrees.find((row) => row.id === id)
}

function psRow(id) {
  const ps = cli(['worktree', 'ps'])
  return {
    row: ps.result.worktrees.find((row) => row.worktreeId === id),
    hostScope: ps.result.hostScope
  }
}

function makeWorktree(repoId, name) {
  const created = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', name])
  const worktree = created.result.worktree ?? created.result
  return {
    id: worktree.id ?? worktree.worktreeId,
    path: worktree.path,
    branch: worktree.branch,
    raw: created.result
  }
}

let appPid
try {
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(repoDir, { recursive: true })
  const hostBefore = daemonHostStamp()

  git('-C', repoDir, 'init', '--quiet')
  git('-C', repoDir, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  writeFileSync(path.join(repoDir, 'README.md'), 'probe\n')
  git('-C', repoDir, 'add', '.')
  git(
    '-C',
    repoDir,
    '-c',
    'user.name=probe',
    '-c',
    'user.email=p@p',
    'commit',
    '--quiet',
    '-m',
    'init'
  )

  const launched = launchApp()
  appPid = launched.pid
  record('runtime-ready', { appVersion: launched.status.runtime.appVersion, isolatedHome: homeDir })

  const added = cli(['repo', 'add', '--path', repoDir])
  const repoId = added.result.repo?.id ?? added.result.id
  record('repo-add', { repoId, kind: added.result.repo?.kind })

  // 1. Clean worktree removed without --force.
  const clean = makeWorktree(repoId, 'probe-clean')
  const cleanListed = worktreeRow(clean.id)
  const cleanPs = psRow(clean.id)
  record('create-clean', {
    id: clean.id,
    path: clean.path,
    branch: clean.branch,
    listedFields: cleanListed ? Object.keys(cleanListed) : null,
    psFields: cleanPs.row ? Object.keys(cleanPs.row) : null,
    hostScope: cleanPs.hostScope
  })
  const rmClean = cliAllowFailure(['worktree', 'rm', '--worktree', `id:${clean.id}`])
  record('rm-clean', {
    ok: rmClean.ok,
    result: rmClean.result,
    error: rmClean.error,
    stillListed: Boolean(worktreeRow(clean.id)),
    pathExists: existsSync(clean.path),
    branchSurvives:
      git(
        '-C',
        repoDir,
        'branch',
        '--list',
        String(clean.branch ?? '').replace('refs/heads/', '')
      ).trim().length > 0,
    trashPresent: existsSync(path.join(path.dirname(clean.path), '.orca-worktree-trash'))
  })

  // 2. Removing the same worktree twice.
  const rmAgain = cliAllowFailure(['worktree', 'rm', '--worktree', `id:${clean.id}`])
  record('rm-twice', { ok: rmAgain.ok, result: rmAgain.result, error: rmAgain.error })

  // 3. Dirty worktree, with and without --force.
  const dirty = makeWorktree(repoId, 'probe-dirty')
  writeFileSync(path.join(dirty.path, 'untracked.txt'), 'work in progress\n')
  writeFileSync(path.join(dirty.path, 'README.md'), 'modified\n')
  const rmDirty = cliAllowFailure(['worktree', 'rm', '--worktree', `id:${dirty.id}`])
  record('rm-dirty-refusal', {
    ok: rmDirty.ok,
    errorCode: rmDirty.error?.code,
    errorMessage: rmDirty.error?.message,
    result: rmDirty.result,
    stillListed: Boolean(worktreeRow(dirty.id)),
    pathExists: existsSync(dirty.path)
  })
  const rmDirtyForced = cliAllowFailure([
    'worktree',
    'rm',
    '--worktree',
    `id:${dirty.id}`,
    '--force'
  ])
  record('rm-dirty-forced', {
    ok: rmDirtyForced.ok,
    result: rmDirtyForced.result,
    error: rmDirtyForced.error,
    stillListed: Boolean(worktreeRow(dirty.id)),
    pathExists: existsSync(dirty.path)
  })

  // 4. Worktree whose directory vanished behind Orca's back.
  const vanished = makeWorktree(repoId, 'probe-vanished')
  let manualDelete = 'deleted'
  try {
    rmSync(vanished.path, { recursive: true, force: true })
  } catch (error) {
    // Orca watches the workspace directory, so Windows refuses the delete.
    manualDelete = String(error.code ?? error.message)
    rmSync(path.join(vanished.path, '.git'), { force: true })
  }
  const vanishedListed = worktreeRow(vanished.id)
  const rmVanished = cliAllowFailure(['worktree', 'rm', '--worktree', `id:${vanished.id}`])
  record('rm-vanished', {
    manualDelete,
    listedAfterManualDelete: Boolean(vanishedListed),
    ok: rmVanished.ok,
    result: rmVanished.result,
    error: rmVanished.error,
    stillListed: Boolean(worktreeRow(vanished.id))
  })

  // 5. Worktree with a live terminal attached.
  const busy = makeWorktree(repoId, 'probe-busy')
  const terminal = cliAllowFailure([
    'terminal',
    'create',
    '--worktree',
    `id:${busy.id}`,
    '--command',
    'node -e "setInterval(()=>{},1000)"'
  ])
  sleep(4000)
  const busyPs = psRow(busy.id)
  const rmBusy = cliAllowFailure(['worktree', 'rm', '--worktree', `id:${busy.id}`])
  record('rm-with-live-terminal', {
    terminalOk: terminal.ok,
    terminalHandle: terminal.result?.handle ?? terminal.result,
    psBefore: busyPs.row
      ? {
          liveTerminalCount: busyPs.row.liveTerminalCount,
          hasAttachedPty: busyPs.row.hasAttachedPty,
          status: busyPs.row.status
        }
      : null,
    ok: rmBusy.ok,
    result: rmBusy.result,
    error: rmBusy.error,
    stillListed: Boolean(worktreeRow(busy.id)),
    pathExists: existsSync(busy.path)
  })

  const hostAfter = daemonHostStamp()
  record('daemon-host-shared-dir', {
    before: hostBefore,
    after: hostAfter,
    changed: JSON.stringify(hostBefore) !== JSON.stringify(hostAfter)
  })
} finally {
  const dPid = daemonPid()
  killTree(appPid)
  killTree(dPid)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    path.join(outDir, 'observations.json'),
    `${JSON.stringify(observations, null, 2)}\n`
  )
  console.log(`[probe] wrote ${path.join(outDir, 'observations.json')}`)
  console.log(`[probe] isolated home was ${homeDir}; real home is ${homedir()}`)
}
