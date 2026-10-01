/**
 * M0 item 3, WSL variant: the coordinator folder lives inside WSL and is registered from the
 * Windows host, so its terminal runs through wsl.exe. Same three shutdown scenarios and the same
 * identity fields as the Windows run, plus the WSL-specific questions:
 *   - does the path survive the Windows/WSL round trip (UNC in, POSIX out)?
 *   - does `worktree ps` name the WSL execution host in `hostScope`?
 *
 * The user's real distro is never terminated: `wsl --terminate` would kill their own sessions, so
 * the distro-restart verdict is left unmeasured and recorded as such.
 *
 * Run: node tests/tools/ticket-coordinator-rm-probe/resume-harness-wsl.mjs [outDir] [runs]
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const DISTRO = process.env.ORCA_PROBE_WSL_DISTRO ?? 'Ubuntu-24.04'
const baseOutDir = process.argv[2] ?? path.join(tmpdir(), `orca-resume-wsl-${Date.now()}`)
const runs = Number(process.argv[3] ?? '3')
const results = []

const ALL_SCENARIOS = [
  { id: 'wsl-app-killed-daemon-alive', kill: 'app', expect: 'same-session' },
  { id: 'wsl-daemon-killed-app-alive', kill: 'daemon', expect: 'replaced' },
  { id: 'wsl-app-and-daemon-killed', kill: 'both', expect: 'replaced' },
  // Only run against a disposable distro: terminating the user's distro kills their sessions.
  { id: 'wsl-distro-terminated', kill: 'distro', expect: 'replaced' }
]
const selected = (
  process.env.ORCA_PROBE_SCENARIOS ??
  'wsl-app-killed-daemon-alive,wsl-daemon-killed-app-alive,wsl-app-and-daemon-killed'
).split(',')
const SCENARIOS = ALL_SCENARIOS.filter((scenario) => selected.includes(scenario.id))
if (SCENARIOS.some((scenario) => scenario.kill === 'distro') && DISTRO === 'Ubuntu-24.04') {
  throw new Error(
    'Refusing to terminate the user distro; set ORCA_PROBE_WSL_DISTRO to a disposable one'
  )
}

const sleep = (ms) => execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`])
const powershell = (command) =>
  execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim()
const wsl = (...args) =>
  execFileSync('wsl.exe', ['-d', DISTRO, '--exec', ...args], { encoding: 'utf8' }).trim()

function uncPath(posix) {
  return `\\\\wsl.localhost\\${DISTRO}${posix.replaceAll('/', '\\')}`
}

function makeContext(outDir) {
  const profileDir = path.join(outDir, 'profile')
  const homeDir = path.join(outDir, 'home')

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

  function launch() {
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

  function daemonPid() {
    const dir = path.join(profileDir, 'daemon')
    if (!existsSync(dir)) {
      return undefined
    }
    const file = powershell(
      `(Get-ChildItem -LiteralPath '${dir}' -Filter 'daemon-v*.pid' | Select-Object -First 1).FullName`
    )
    return file ? JSON.parse(readFileSync(file, 'utf8')).pid : undefined
  }

  return { profileDir, homeDir, cli, launch, daemonPid }
}

function kill(pid, { tree = false } = {}) {
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

function terminalRows(cli, handle) {
  const read = cli(['terminal', 'read', '--terminal', handle, '--limit', '200'], {
    expectOk: false
  })
  if (!read.ok) {
    return { ok: false, text: '' }
  }
  const terminal = read.result.terminal ?? {}
  return {
    ok: true,
    text: (Array.isArray(terminal.tail) ? terminal.tail : []).join('\n'),
    status: terminal.status
  }
}

function terminalRecord(cli, handle, ptyId) {
  const shown = cli(['terminal', 'show', '--terminal', handle], { expectOk: false })
  if (shown.ok && shown.result?.terminal) {
    return shown.result.terminal
  }
  const terminals = cli(['terminal', 'list'], { expectOk: false }).result?.terminals ?? []
  return terminals.find((row) => row.ptyId === ptyId)
}

const paneKeyOf = (record) =>
  record?.tabId && record?.leafId ? `${record.tabId}:${record.leafId}` : undefined

/**
 * A distro restart keeps boot_id (the VM kernel is shared) and reuses small PIDs, so a live
 * process is identified by the distro's init start time plus the PID and its own start time.
 */
const wslProcessIdentity = (pid) => {
  if (!pid) {
    return undefined
  }
  try {
    const out = wsl(
      'sh',
      '-c',
      `[ -r /proc/${pid}/stat ] || exit 0; printf '%s:%s:%s' "$(awk '{print $22}' /proc/1/stat)" ${pid} "$(awk '{print $22}' /proc/${pid}/stat)"`
    )
    return out || undefined
  } catch {
    return undefined
  }
}
const distroIdentity = () =>
  wsl(
    'sh',
    '-c',
    `printf '%s:%s' "$(cat /proc/sys/kernel/random/boot_id)" "$(awk '{print $22}' /proc/1/stat)"`
  )

function runScenario(scenario, attempt) {
  const outDir = path.join(baseOutDir, `${scenario.id}-${attempt}`)
  const ctx = makeContext(outDir)
  const home = wsl('sh', '-c', 'printf %s "$HOME"')
  const posixFolder = `${home}/.local/share/ticket-workspace/coordinators/E2E-${Date.now()}-${attempt}`
  let appPid
  const observed = { scenario: scenario.id, attempt, posixFolder }
  try {
    // `repo add` accepts git repositories only; folder-kind projects are registered through the
    // desktop/IPC path instead (see the findings doc). The WSL execution-host question this run
    // answers does not depend on project kind.
    wsl('mkdir', '-p', posixFolder)
    wsl('git', '-C', posixFolder, 'init', '--quiet')
    wsl('git', '-C', posixFolder, 'symbolic-ref', 'HEAD', 'refs/heads/main')
    wsl(
      'sh',
      '-c',
      `printf 'coordinator
' > ${posixFolder}/README.md`
    )
    wsl('git', '-C', posixFolder, 'add', '.')
    wsl(
      'git',
      '-C',
      posixFolder,
      '-c',
      'user.name=probe',
      '-c',
      'user.email=p@p',
      'commit',
      '--quiet',
      '-m',
      'init'
    )
    const unc = uncPath(posixFolder)
    observed.uncVisibleFromWindows = existsSync(unc)

    mkdirSync(ctx.homeDir, { recursive: true })
    appPid = ctx.launch()
    const added = ctx.cli(['repo', 'add', '--path', unc]).result.repo
    // The catalog fills asynchronously after `repo add`; poll rather than read once.
    let workspaces = []
    for (let i = 0; i < 60 && workspaces.length === 0; i += 1) {
      workspaces = ctx
        .cli(['worktree', 'list'])
        .result.worktrees.filter((row) => row.repoId === added.id)
      if (workspaces.length === 0) {
        sleep(1000)
      }
    }
    const workspace = workspaces[0]
    if (!workspace) {
      throw new Error(`No workspace surfaced for ${unc} within 60s`)
    }
    observed.registration = {
      repoKind: added.kind,
      workspaceCount: workspaces.length,
      reportedPath: workspace?.path,
      // The path went in as a Windows UNC spelling and must come back naming the same folder.
      pathRoundTrip:
        typeof workspace?.path === 'string' &&
        workspace.path.replaceAll('\\', '/').endsWith(posixFolder.split('/').slice(-3).join('/'))
    }

    const marker = `WSL_ROOT_AGENT_${Date.now()}`
    // POSIX sh so the stub runs on a minimal distro; it echoes stdin to prove the same reader.
    const command = `sh -c 'echo ${marker}_PID=$$; while read line; do echo ECHO:$line; done'`
    const handle = ctx.cli([
      'terminal',
      'create',
      '--worktree',
      `id:${workspace.id}`,
      '--command',
      command
    ]).result.terminal
    sleep(8000)

    const before = terminalRows(ctx.cli, handle.handle)
    const pidMatch = /WSL_ROOT_AGENT_\d+_PID=(\d+)/.exec(before.text)
    const innerPid = pidMatch ? Number(pidMatch[1]) : undefined
    const innerIdentity = wslProcessIdentity(innerPid)
    const distroBefore = distroIdentity()
    const daemonBefore = ctx.daemonPid()
    const ps = ctx.cli(['worktree', 'ps'], { expectOk: false }).result
    observed.before = {
      worktreeId: workspace.id,
      hostPlatform: handle.hostPlatform,
      executionHostId: handle.executionHostId,
      ptyId: handle.ptyId,
      incarnationId: handle.incarnationId,
      paneKey: handle.paneKey,
      innerPid,
      innerIdentity,
      innerAlive: Boolean(innerIdentity),
      distroIdentity: distroBefore,
      daemonPid: daemonBefore,
      markerSeen: before.text.includes(marker),
      hostScope: ps?.hostScope,
      psTerminalPlatform: ps?.worktrees?.find((row) => row.worktreeId === workspace.id)
        ?.terminalPlatform
    }

    if (scenario.kill === 'app' || scenario.kill === 'both') {
      kill(appPid, { tree: false })
      appPid = undefined
    }
    sleep(2000)
    if (scenario.kill === 'daemon' || scenario.kill === 'both') {
      kill(daemonBefore, { tree: true })
    }
    if (scenario.kill === 'distro') {
      execFileSync('wsl.exe', ['--terminate', DISTRO], { stdio: 'ignore' })
    }
    sleep(3000)
    const aliveNow = () =>
      innerIdentity !== undefined && wslProcessIdentity(innerPid) === innerIdentity
    observed.innerAliveAfterShutdown = aliveNow()
    observed.distroIdentityAfter = distroIdentity()
    observed.distroRestarted = observed.distroIdentityAfter !== distroBefore
    observed.bootIdChanged =
      observed.distroIdentityAfter.split(':')[0] !== distroBefore.split(':')[0]
    observed.pidReusedByOther =
      innerPid !== undefined && wslProcessIdentity(innerPid) !== undefined && !aliveNow()

    if (!appPid) {
      appPid = ctx.launch()
    }
    sleep(8000)
    const match = terminalRecord(ctx.cli, handle.handle, handle.ptyId)
    const matchHandle = match?.handle ?? handle.handle
    const after = match ? terminalRows(ctx.cli, matchHandle) : { ok: false, text: '' }
    let writable = false
    if (match) {
      const echoMarker = `AFTER_${Date.now()}`
      const sent = ctx.cli(
        ['terminal', 'send', '--terminal', matchHandle, '--text', echoMarker, '--enter'],
        { expectOk: false }
      )
      if (sent.ok) {
        sleep(5000)
        writable = terminalRows(ctx.cli, matchHandle).text.includes(`ECHO:${echoMarker}`)
      }
    }
    observed.after = {
      daemonSame: ctx.daemonPid() === daemonBefore,
      terminalFound: Boolean(match),
      samePtyId: match ? match.ptyId === handle.ptyId : false,
      sameIncarnation: match ? match.incarnationId === handle.incarnationId : false,
      samePaneKey: paneKeyOf(match) === handle.paneKey,
      connected: match?.connected,
      innerAlive: innerIdentity !== undefined && wslProcessIdentity(innerPid) === innerIdentity,
      scrollbackHasMarker: after.text.includes(marker),
      writable
    }

    // Liveness is asked of the execution host (kill -0 inside the distro), never inferred from
    // `connected`, which stayed true here for a session whose process was already dead.
    const a = observed.after
    if (scenario.expect === 'same-session') {
      observed.verdict =
        a.terminalFound &&
        a.samePtyId &&
        a.sameIncarnation &&
        a.samePaneKey &&
        a.innerAlive &&
        a.daemonSame &&
        a.writable &&
        a.scrollbackHasMarker
          ? 'live'
          : 'failed'
    } else if (a.innerAlive || observed.innerAliveAfterShutdown) {
      observed.verdict = 'unexpectedly-alive'
    } else {
      observed.verdict = a.sameIncarnation ? 'exited' : 'exited-and-replaced'
    }
  } catch (error) {
    observed.verdict = 'error'
    observed.error = String(error.message ?? error)
  } finally {
    const dPid = ctx.daemonPid()
    kill(appPid, { tree: false })
    kill(dPid, { tree: true })
    sleep(1500)
    try {
      wsl('rm', '-rf', posixFolder)
    } catch {
      // Leave it; it is inside a disposable coordinator directory.
    }
    try {
      rmSync(outDir, { recursive: true, force: true })
    } catch (error) {
      observed.cleanup = String(error.code ?? error.message)
    }
  }
  return observed
}

mkdirSync(baseOutDir, { recursive: true })
for (const scenario of SCENARIOS) {
  for (let attempt = 1; attempt <= runs; attempt += 1) {
    const observed = runScenario(scenario, attempt)
    results.push(observed)
    console.log(
      `[wsl-resume] ${scenario.id} #${attempt}: ${observed.verdict} ${JSON.stringify(observed.after ?? observed.error ?? {}).slice(0, 200)}`
    )
  }
}
writeFileSync(path.join(baseOutDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
console.log(
  `[wsl-resume] summary\n${SCENARIOS.map(
    (scenario) =>
      `${scenario.id}: ${results
        .filter((row) => row.scenario === scenario.id)
        .map((row) => row.verdict)
        .join(', ')}`
  ).join('\n')}`
)
console.log(
  `[wsl-resume] distro-restart verdict: not measured (would terminate the user's own distro)`
)
console.log(`[wsl-resume] wrote ${path.join(baseOutDir, 'results.json')}`)
