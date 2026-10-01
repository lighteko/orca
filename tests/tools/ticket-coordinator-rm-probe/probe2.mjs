/**
 * Follow-up measurements the reviewer required before deleting the standalone git adapter:
 *   B  — does `worktree rm` delete a branch that carries unique commits?
 *   A2 — how does create refuse a name/path that already exists?
 *   A3 — are worktree id, hostId, instanceId, ptyId and incarnationId stable across an app restart?
 *
 * Runs the INSTALLED Orca against a disposable profile, home and daemon. The user's instance is
 * untouched. A3 also pre-stages the M0 item 3 continuity check.
 *
 * Run: node tests/tools/ticket-coordinator-rm-probe/probe2.mjs [outDir]
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
const outDir = process.argv[2] ?? path.join(tmpdir(), `orca-rm-probe2-${Date.now()}`)
const profileDir = path.join(outDir, 'profile')
const homeDir = path.join(outDir, 'home')
const repoDir = path.join(outDir, 'repo')
const observations = []

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
}

function cli(args, { expectOk = true } = {}) {
  let text
  try {
    text = execFileSync(ORCA_CLI, [...args, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, ORCA_USER_DATA_PATH: profileDir },
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

function record(step, detail) {
  observations.push({ step, ...detail })
  console.log(`[probe2] ${step}: ${JSON.stringify(detail).slice(0, 300)}`)
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
      if (cli(['status']).result?.runtime?.state === 'ready') {
        return child.pid
      }
    } catch {
      // Not up yet.
    }
    if (Date.now() >= deadline) {
      throw new Error('Isolated runtime never became ready')
    }
    sleep(1000)
  }
}

// `tree: false` leaves the daemon alive, which is what keeps a PTY across an app restart.
function killTree(pid, { tree = true } = {}) {
  if (!pid) {
    return
  }
  try {
    execFileSync('taskkill', ['/pid', String(pid), ...(tree ? ['/T'] : []), '/F'], {
      stdio: 'ignore'
    })
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
  return file ? JSON.parse(readFileSync(file, 'utf8')).pid : undefined
}

function listRow(id) {
  return cli(['worktree', 'list']).result.worktrees.find((row) => row.id === id)
}

function makeWorktree(repoId, name) {
  const created = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', name])
  const worktree = created.result.worktree ?? created.result
  return { id: worktree.id ?? worktree.worktreeId, path: worktree.path, branch: worktree.branch }
}

function branchExists(branch) {
  const name = String(branch ?? '').replace('refs/heads/', '')
  return name.length > 0 && git('-C', repoDir, 'branch', '--list', name).trim().length > 0
}

let appPid
try {
  mkdirSync(homeDir, { recursive: true })
  mkdirSync(repoDir, { recursive: true })
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

  appPid = launchApp()
  const repoId = cli(['repo', 'add', '--path', repoDir]).result.repo.id
  record('setup', { repoId })

  // B: a branch carrying an unmerged commit must survive removal.
  const withWork = makeWorktree(repoId, 'probe-branch-work')
  writeFileSync(path.join(withWork.path, 'work.txt'), 'ticket work\n')
  git('-C', withWork.path, 'add', 'work.txt')
  git(
    '-C',
    withWork.path,
    '-c',
    'user.name=probe',
    '-c',
    'user.email=p@p',
    'commit',
    '--quiet',
    '-m',
    'ticket work'
  )
  const headBefore = git('-C', withWork.path, 'rev-parse', 'HEAD').trim()
  const rmWithWork = cli(['worktree', 'rm', '--worktree', `id:${withWork.id}`], { expectOk: false })
  record('rm-branch-with-unmerged-commit', {
    ok: rmWithWork.ok,
    result: rmWithWork.result,
    error: rmWithWork.error,
    branchSurvives: branchExists(withWork.branch),
    commitReachable: (() => {
      try {
        return git('-C', repoDir, 'cat-file', '-t', headBefore).trim() === 'commit'
      } catch {
        return false
      }
    })(),
    branch: withWork.branch
  })

  // B control: an empty branch (no unique commits).
  const empty = makeWorktree(repoId, 'probe-branch-empty')
  const rmEmpty = cli(['worktree', 'rm', '--worktree', `id:${empty.id}`], { expectOk: false })
  record('rm-branch-without-commits', {
    ok: rmEmpty.ok,
    result: rmEmpty.result,
    branchSurvives: branchExists(empty.branch)
  })

  // A2: creating the same name twice, and creating onto an existing path.
  const first = makeWorktree(repoId, 'probe-duplicate')
  const duplicate = cli(
    ['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'probe-duplicate'],
    { expectOk: false }
  )
  record('create-duplicate-name', {
    firstId: first.id,
    ok: duplicate.ok,
    error: duplicate.error,
    resultId: duplicate.result?.worktree?.id ?? duplicate.result?.id,
    sameAsFirst: (duplicate.result?.worktree?.id ?? duplicate.result?.id) === first.id
  })

  // A3: identity stability across an app restart, including a live terminal.
  const persistent = makeWorktree(repoId, 'probe-restart')
  const terminal = cli([
    'terminal',
    'create',
    '--worktree',
    `id:${persistent.id}`,
    '--command',
    'node -e "setInterval(()=>{},1000)"'
  ])
  const handleBefore = terminal.result.terminal ?? terminal.result
  sleep(5000)
  const rowBefore = listRow(persistent.id)
  const terminalsBefore = cli(['terminal', 'list']).result
  const daemonBefore = daemonPid()
  record('before-restart', {
    worktreeId: persistent.id,
    hostId: rowBefore?.hostId,
    instanceId: rowBefore?.instanceId,
    identityKey: rowBefore?.identity?.key,
    ptyId: handleBefore.ptyId,
    incarnationId: handleBefore.incarnationId,
    paneKey: handleBefore.paneKey,
    tabId: handleBefore.tabId,
    daemonPid: daemonBefore,
    terminalCount: Array.isArray(terminalsBefore.terminals)
      ? terminalsBefore.terminals.length
      : null
  })

  // Kill the app only, leaving the daemon to hold the PTY.
  killTree(appPid, { tree: false })
  appPid = undefined
  sleep(3000)
  appPid = launchApp()
  sleep(5000)
  const rowAfter = listRow(persistent.id)
  const terminalsAfter = cli(['terminal', 'list']).result
  const matching = (Array.isArray(terminalsAfter.terminals) ? terminalsAfter.terminals : []).filter(
    (row) => row.worktreeId === persistent.id
  )
  record('after-restart', {
    worktreeIdStable: rowAfter?.id === persistent.id,
    hostIdStable: rowAfter?.hostId === rowBefore?.hostId,
    instanceIdStable: rowAfter?.instanceId === rowBefore?.instanceId,
    identityKeyStable: rowAfter?.identity?.key === rowBefore?.identity?.key,
    daemonPidStable: daemonPid() === daemonBefore,
    matchingTerminals: matching.map((row) => ({
      ptyId: row.ptyId ?? row.id,
      incarnationId: row.incarnationId,
      paneKey: row.paneKey,
      samePtyAsBefore: (row.ptyId ?? row.id) === handleBefore.ptyId,
      sameIncarnation: row.incarnationId === handleBefore.incarnationId
    }))
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
  console.log(`[probe2] wrote ${path.join(outDir, 'observations.json')}`)
}
