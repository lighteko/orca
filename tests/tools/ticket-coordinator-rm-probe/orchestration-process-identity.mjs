import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const normalize = (value) => path.resolve(value).replaceAll('\\', '/').toLowerCase()

function parseCommand(command) {
  return [...command.matchAll(/"([^"]*)"|(\S+)/gu)].map((match) => match[1] ?? match[2])
}

async function readProcessIdentity(runtime, pid) {
  const rows = await runtime.readWindowsProcessTableFresh()
  const row = rows.find((candidate) => candidate.pid === pid)
  assert.ok(row, `process ${pid} is absent from the fresh process table`)
  assert.equal(typeof row.creationTimeMs, 'number', `process ${pid} has no creation time`)
  return { pid, creationTimeMs: row.creationTimeMs, command: row.command }
}

export async function captureProcessIdentity(runtime, pid, expectedExecutable) {
  const identity = await readProcessIdentity(runtime, pid)
  const [actualExecutable] = parseCommand(identity.command)
  assert.equal(
    normalize(actualExecutable),
    normalize(expectedExecutable),
    `process ${pid} does not run ${expectedExecutable}: ${identity.command}`
  )
  return identity
}

export async function captureScopedDaemonIdentity(runtime, profileDir, spawnerExecutable) {
  const daemonDir = path.join(profileDir, 'daemon')
  const recordEntries = readdirSync(daemonDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^daemon-v\d+\.pid$/.test(entry.name))
    .map((entry) => ({
      path: path.join(daemonDir, entry.name),
      record: JSON.parse(readFileSync(path.join(daemonDir, entry.name), 'utf8'))
    }))
    .filter(({ record }) => Number.isInteger(record.pid))
  assert.equal(
    recordEntries.length,
    1,
    `expected one daemon PID record, found ${recordEntries.length}`
  )
  const [{ path: pidRecordPath, record }] = recordEntries
  const identity = await readProcessIdentity(runtime, record.pid)
  const argv = parseCommand(identity.command)
  const executable = argv[0]
  const daemonRoot = path.join(process.env.LOCALAPPDATA ?? '', 'Orca', 'daemon-host')
  const daemonRelative = path.relative(daemonRoot, executable)
  assert.ok(
    daemonRelative && !daemonRelative.startsWith('..') && !path.isAbsolute(daemonRelative),
    `daemon executable is outside ${daemonRoot}: ${executable}`
  )
  assert.equal(path.basename(executable).toLowerCase(), 'orca.exe')
  assert.match(path.basename(argv[1] ?? ''), /^daemon-entry\.js$/u)

  const argument = (name) => {
    const index = argv.indexOf(name)
    assert.notEqual(index, -1, `daemon command omitted ${name}: ${identity.command}`)
    return argv[index + 1]
  }
  assert.equal(
    normalize(argument('--token')),
    normalize(pidRecordPath.replace(/\.pid$/u, '.token'))
  )
  assert.equal(normalize(argument('--pid-record')), normalize(pidRecordPath))
  assert.equal(normalize(argument('--spawner-exec-path')), normalize(spawnerExecutable))
  return identity
}

export async function killVerifiedProcess(runtime, identity, { tree = false } = {}) {
  const before = await runtime.readWindowsProcessTableFresh()
  const current = before.find((row) => row.pid === identity.pid)
  assert.equal(current?.creationTimeMs, identity.creationTimeMs, `PID ${identity.pid} was reused`)
  assert.equal(current?.command, identity.command, `PID ${identity.pid} command identity changed`)
  const result = await runtime.runProcess({
    program: 'taskkill.exe',
    args: ['/PID', String(identity.pid), ...(tree ? ['/T'] : []), '/F'],
    env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' },
    timeoutMs: 15_000
  })
  assert.equal(result.code, 0, `taskkill failed: ${result.stderr || result.stdout}`)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const after = await runtime.readWindowsProcessTableFresh()
    const same = after.find(
      (row) => row.pid === identity.pid && row.creationTimeMs === identity.creationTimeMs
    )
    if (!same) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`process ${identity.pid} did not exit`)
}
