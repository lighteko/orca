/**
 * Ticket workspace M0 item 3: does a coordinator workspace's terminal session survive the app?
 *
 * Scope is PTY/terminal session resume, not agent-state resume: a stub agent would paint a fake
 * screen, so an agent verdict here would overclaim (see the Orca findings doc).
 *
 * Judged on identity continuity, not counts: same ptyId, same incarnationId, same paneKey, the
 * in-terminal process still alive, scrollback still readable, and the PTY still writable.
 *
 * Runs the INSTALLED Orca against a disposable profile, home and daemon. The user's instance is
 * untouched.
 *
 * Run: node tests/tools/ticket-coordinator-rm-probe/resume-harness.mjs [outDir] [runs]
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
const baseOutDir = process.argv[2] ?? path.join(tmpdir(), `orca-resume-${Date.now()}`)
const runs = Number(process.argv[3] ?? '3')
const results = []

// A headless run has no window, so CloseMainWindow cannot exercise a graceful quit; killing the
// app is the strongest shutdown we can drive here, and the daemon is what must survive it.
const SCENARIOS = [
  { id: 'app-killed-daemon-alive', kill: 'app', expect: 'same-session' },
  { id: 'daemon-killed-app-alive', kill: 'daemon', expect: 'replaced' },
  { id: 'app-and-daemon-killed', kill: 'both', expect: 'replaced' }
]

function sleep(ms) {
  execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`])
}

function powershell(command) {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8'
  }).trim()
}

function makeContext(outDir) {
  const profileDir = path.join(outDir, 'profile')
  const homeDir = path.join(outDir, 'home')
  const repoDir = path.join(outDir, 'repo')

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

  return { profileDir, homeDir, repoDir, cli, launch, daemonPid }
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

function processAlive(pid) {
  if (!pid) {
    return false
  }
  return (
    powershell(
      `if (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { 'yes' } else { 'no' }`
    ) === 'yes'
  )
}

function terminalRows(cli, handle) {
  const read = cli(['terminal', 'read', '--terminal', handle, '--limit', '200'], {
    expectOk: false
  })
  if (!read.ok) {
    return { ok: false, error: read.error, text: '' }
  }
  const terminal = read.result.terminal ?? {}
  const tail = Array.isArray(terminal.tail) ? terminal.tail : []
  return { ok: true, text: tail.join('\n'), status: terminal.status }
}

/** `terminal show` keeps the original handle, so identity survives a list that renumbers tabs. */
function terminalRecord(cli, handle, ptyId) {
  const shown = cli(['terminal', 'show', '--terminal', handle], { expectOk: false })
  if (shown.ok && shown.result?.terminal) {
    return shown.result.terminal
  }
  const terminals = cli(['terminal', 'list'], { expectOk: false }).result?.terminals ?? []
  return terminals.find((row) => row.ptyId === ptyId)
}

function paneKeyOf(record) {
  return record?.tabId && record?.leafId ? `${record.tabId}:${record.leafId}` : undefined
}

function runScenario(scenario, attempt) {
  const outDir = path.join(baseOutDir, `${scenario.id}-${attempt}`)
  const ctx = makeContext(outDir)
  let appPid
  const observed = { scenario: scenario.id, attempt }
  try {
    mkdirSync(ctx.homeDir, { recursive: true })
    mkdirSync(ctx.repoDir, { recursive: true })
    execFileSync('git', ['-C', ctx.repoDir, 'init', '--quiet'])
    execFileSync('git', ['-C', ctx.repoDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'])
    writeFileSync(path.join(ctx.repoDir, 'README.md'), 'coordinator\n')
    execFileSync('git', ['-C', ctx.repoDir, 'add', '.'])
    execFileSync('git', [
      '-C',
      ctx.repoDir,
      '-c',
      'user.name=probe',
      '-c',
      'user.email=p@p',
      'commit',
      '--quiet',
      '-m',
      'init'
    ])

    appPid = ctx.launch()
    const repoId = ctx.cli(['repo', 'add', '--path', ctx.repoDir]).result.repo.id
    const created = ctx.cli([
      'worktree',
      'create',
      '--repo',
      `id:${repoId}`,
      '--name',
      `coordinator-${attempt}`
    ]).result
    const worktree = created.worktree ?? created
    const worktreeId = worktree.id ?? worktree.worktreeId

    const marker = `ROOT_AGENT_${Date.now()}`
    // Echoes stdin so a later write proves the same process still owns the PTY.
    const command = `node -e "console.log('${marker}_PID='+process.pid); process.stdin.on('data', (d) => console.log('ECHO:' + d.toString().trim())); setInterval(()=>{},1000)"`
    const handle = ctx.cli([
      'terminal',
      'create',
      '--worktree',
      `id:${worktreeId}`,
      '--command',
      command
    ]).result.terminal
    sleep(6000)

    const before = terminalRows(ctx.cli, handle.handle)
    const pidMatch = /ROOT_AGENT_\d+_PID=(\d+)/.exec(before.text)
    const innerPid = pidMatch ? Number(pidMatch[1]) : undefined
    const daemonBefore = ctx.daemonPid()
    observed.before = {
      worktreeId,
      ptyId: handle.ptyId,
      incarnationId: handle.incarnationId,
      paneKey: handle.paneKey,
      innerPid,
      innerAlive: processAlive(innerPid),
      daemonPid: daemonBefore,
      markerSeen: before.text.includes(marker)
    }

    observed.shutdown = scenario.kill
    if (scenario.kill === 'app' || scenario.kill === 'both') {
      kill(appPid, { tree: false })
      appPid = undefined
    }
    sleep(2000)
    if (scenario.kill === 'daemon' || scenario.kill === 'both') {
      kill(daemonBefore, { tree: true })
    }
    sleep(3000)
    observed.innerAliveAfterShutdown = processAlive(innerPid)

    if (!appPid) {
      appPid = ctx.launch()
    }
    sleep(6000)
    const terminals = ctx.cli(['terminal', 'list'], { expectOk: false }).result?.terminals ?? []
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
        sleep(4000)
        writable = terminalRows(ctx.cli, matchHandle).text.includes(`ECHO:${echoMarker}`)
      }
    }
    observed.after = {
      daemonPid: ctx.daemonPid(),
      daemonSame: ctx.daemonPid() === daemonBefore,
      terminalFound: Boolean(match),
      samePtyId: match ? match.ptyId === handle.ptyId : false,
      sameIncarnation: match ? match.incarnationId === handle.incarnationId : false,
      samePaneKey: paneKeyOf(match) === handle.paneKey,
      orphaned: match?.orphaned,
      connected: match?.connected,
      innerAlive: processAlive(innerPid),
      scrollbackHasMarker: after.text.includes(marker),
      writable,
      terminalCount: terminals.length
    }

    const a = observed.after
    if (scenario.expect === 'same-session') {
      // Same PTY, same incarnation, same pane, the original process still reading it.
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
    } else {
      // The old session died with the daemon; Orca must replace it rather than resurrect it.
      observed.verdict =
        !a.innerAlive &&
        !observed.innerAliveAfterShutdown &&
        !a.sameIncarnation &&
        !a.scrollbackHasMarker
          ? 'exited-and-replaced'
          : 'unverifiable'
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
      `[resume] ${scenario.id} #${attempt}: ${observed.verdict} ${JSON.stringify(observed.after ?? observed.error ?? {}).slice(0, 200)}`
    )
  }
}
writeFileSync(path.join(baseOutDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
const summary = SCENARIOS.map((scenario) => {
  const mine = results.filter((row) => row.scenario === scenario.id)
  return `${scenario.id}: ${mine.map((row) => row.verdict).join(', ')}`
})
console.log(`[resume] summary\n${summary.join('\n')}`)
console.log(`[resume] wrote ${path.join(baseOutDir, 'results.json')}`)
