import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export async function createUniqueBranchEvidence({ command, workerWorktreeId, nonce, enabled }) {
  if (!enabled) {
    return undefined
  }
  const worktreePath = workerWorktreeId.slice(workerWorktreeId.indexOf('::') + 2)
  writeFileSync(path.join(worktreePath, 'unique-branch-evidence.txt'), `${nonce}\n`)
  await command('git.exe', ['add', 'unique-branch-evidence.txt'], { cwd: worktreePath })
  await command(
    'git.exe',
    ['-c', 'user.name=probe', '-c', 'user.email=p@p', 'commit', '--quiet', '-m', 'unique'],
    { cwd: worktreePath }
  )
  const branchName = (
    await command('git.exe', ['symbolic-ref', '--short', 'HEAD'], { cwd: worktreePath })
  ).stdout.trim()
  const head = (
    await command('git.exe', ['rev-parse', '--verify', 'HEAD'], { cwd: worktreePath })
  ).stdout.trim()
  assert.ok(branchName, 'worker branch name missing before removal')
  assert.ok(head, 'worker branch HEAD missing before removal')
  return { branchName, head, worktreePath }
}

export function verifyResidualResourceSnapshot({
  showBeforeStop,
  terminalsBeforeRemoval,
  workerWorktreeId,
  expectLiveTerminals
}) {
  const resources = showBeforeStop.result?.worker?.residualResources
  assert.ok(Array.isArray(resources))
  assert.ok(
    resources.some((resource) => resource.kind === 'worktree' && resource.id === workerWorktreeId),
    'durable residual snapshot omitted the created worktree'
  )
  const terminalIds = resources
    .filter((resource) => resource.kind === 'terminal')
    .map((resource) => resource.id)
  const listedIds = terminalsBeforeRemoval.result.terminals.map((terminal) => terminal.handle)
  assert.ok(terminalIds.length > 0, 'durable residual snapshot omitted created terminals')
  if (expectLiveTerminals) {
    assert.ok(
      terminalIds.every((terminalId) => listedIds.includes(terminalId)),
      'durable residual snapshot terminals do not match the live worktree inventory'
    )
  } else {
    assert.equal(
      listedIds.length,
      0,
      'verified daemon loss left live terminals in the replacement daemon inventory'
    )
  }
  return resources
}

export function readArchiveExitEvidence({ evidenceDir, nonce, archiveExitCode }) {
  const completion = JSON.parse(
    readFileSync(path.join(evidenceDir, `${nonce}-archive-completed.json`), 'utf8')
  )
  const exit = JSON.parse(
    readFileSync(path.join(evidenceDir, `${nonce}-archive-exited.json`), 'utf8')
  )
  assert.equal(completion.exitCode, archiveExitCode)
  assert.equal(exit.exitCode, archiveExitCode)
  assert.equal(exit.pid, completion.pid)
  return { completion, exit }
}

export async function verifyPreservedBranchEvidence({
  command,
  removed,
  repoDir,
  branchBeforeRemoval,
  archiveEvidence
}) {
  if (!branchBeforeRemoval) {
    return undefined
  }
  assert.equal(removed.ok, true)
  assert.equal(removed.result?.removed, true)
  assert.deepEqual(removed.result?.preservedBranch, {
    branchName: branchBeforeRemoval.branchName,
    head: branchBeforeRemoval.head
  })
  assert.equal(existsSync(branchBeforeRemoval.worktreePath), false)
  const registered = (
    await command('git.exe', ['worktree', 'list', '--porcelain'], { cwd: repoDir })
  ).stdout
    .replaceAll('\\', '/')
    .toLowerCase()
  assert.equal(
    registered.includes(branchBeforeRemoval.worktreePath.replaceAll('\\', '/').toLowerCase()),
    false,
    'removed worktree remains registered'
  )
  const preservedHead = (
    await command(
      'git.exe',
      ['rev-parse', '--verify', `refs/heads/${branchBeforeRemoval.branchName}`],
      { cwd: repoDir }
    )
  ).stdout.trim()
  assert.equal(preservedHead, branchBeforeRemoval.head)
  return {
    archiveCompletionEvidence: archiveEvidence.completion,
    archiveExitEvidence: archiveEvidence.exit,
    preservedBranch: removed.result.preservedBranch,
    preservedHead,
    worktreeExistsAfterRemoval: existsSync(branchBeforeRemoval.worktreePath),
    worktreeRegisteredAfterRemoval: false
  }
}
