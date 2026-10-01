const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const action = process.argv[2]
const config = JSON.parse(readFileSync(path.join(__dirname, 'orchestration-probe.json'), 'utf8'))
const evidenceDir = config.evidenceDir
const prefix = `${config.nonce}-${action}`
const event = (phase) => {
  appendFileSync(
    path.join(evidenceDir, 'hook-events.jsonl'),
    `${JSON.stringify({
      nonce: config.nonce,
      action,
      phase,
      pid: process.pid,
      cwd: process.cwd(),
      worktreePath: process.env.ORCA_WORKTREE_PATH ?? null,
      timestamp: new Date().toISOString()
    })}\n`
  )
}

if (action === 'archive') {
  process.on('exit', (exitCode) => {
    writeFileSync(
      path.join(evidenceDir, `${prefix}-exited.json`),
      JSON.stringify({ pid: process.pid, exitCode })
    )
  })
}

async function waitForRelease() {
  const deadline = Date.now() + config.setupDeadlineMs
  while (!existsSync(path.join(evidenceDir, `${config.nonce}-release`))) {
    if (Date.now() >= deadline) {
      throw new Error('setup barrier release deadline exceeded')
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function main() {
  event('entered')
  writeFileSync(
    path.join(evidenceDir, `${prefix}-entered.json`),
    JSON.stringify({ pid: process.pid })
  )
  if (action === 'setup') {
    await waitForRelease()
  }
  event('completed')
  writeFileSync(
    path.join(evidenceDir, `${prefix}-completed.json`),
    JSON.stringify({
      pid: process.pid,
      ...(action === 'archive' ? { exitCode: config.archiveExitCode } : {})
    })
  )
  if (action === 'archive') {
    process.exitCode = config.archiveExitCode
  }
}

main().catch((error) => {
  event('failed')
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 24
})
