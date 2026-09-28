import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
import { readNativeGitWorktreeRegistrationIdentity } from './worktree-catalog-registration-identity'

let scratchDirectory = ''

afterEach(() => {
  if (scratchDirectory) {
    rmSync(scratchDirectory, { recursive: true, force: true })
    scratchDirectory = ''
  }
})

function createLinkedWorktreeFixture(): {
  repoPath: string
  worktreePath: string
  commonDirectoryPath: string
  adminDirectoryPath: string
} {
  scratchDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-catalog-registration-')))
  const repoPath = join(scratchDirectory, 'repo')
  const worktreePath = join(scratchDirectory, 'worktree')
  const commonDirectoryPath = join(repoPath, '.git')
  const adminDirectoryPath = join(commonDirectoryPath, 'worktrees', 'feature')
  mkdirSync(commonDirectoryPath, { recursive: true })
  mkdirSync(worktreePath, { recursive: true })
  mkdirSync(adminDirectoryPath, { recursive: true })
  writeFileSync(join(commonDirectoryPath, 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(join(worktreePath, '.git'), `gitdir: ${adminDirectoryPath}\n`)
  writeFileSync(join(adminDirectoryPath, 'HEAD'), 'ref: refs/heads/feature\n')
  writeFileSync(
    join(adminDirectoryPath, 'commondir'),
    `${relative(adminDirectoryPath, commonDirectoryPath)}\n`
  )
  writeFileSync(join(adminDirectoryPath, 'gitdir'), `${join(worktreePath, '.git')}\n`)
  return { repoPath, worktreePath, commonDirectoryPath, adminDirectoryPath }
}

describe('readNativeGitWorktreeRegistrationIdentity', () => {
  it('requires a reciprocal linked-worktree gitdir in the repository common directory', async () => {
    const { repoPath, worktreePath, adminDirectoryPath, commonDirectoryPath } =
      createLinkedWorktreeFixture()

    await expect(
      readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
    ).resolves.toMatchObject({
      fingerprint: expect.any(String),
      worktreeRoot: worktreePath,
      gitDirectoryPath: adminDirectoryPath,
      commonDirectoryPath,
      indexPath: join(adminDirectoryPath, 'index'),
      filesystemIdentity: {
        worktreeRoot: { kind: 'directory' },
        gitDirectoryPath: { kind: 'directory' },
        commonDirectoryPath: { kind: 'directory' },
        indexPath: null
      }
    })
  })

  it.skipIf(process.platform === 'win32')('rejects a linked-worktree index symlink', async () => {
    const { repoPath, worktreePath, adminDirectoryPath } = createLinkedWorktreeFixture()
    symlinkSync(join(adminDirectoryPath, 'HEAD'), join(adminDirectoryPath, 'index'))

    await expect(
      readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
    ).resolves.toBeNull()
  })

  it('changes identity when Git removes and recreates a registration at the same paths', async () => {
    const { repoPath, worktreePath, commonDirectoryPath, adminDirectoryPath } =
      createLinkedWorktreeFixture()
    const before = await readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
    const oldWorktreePath = join(scratchDirectory, 'old-worktree')
    const oldAdminDirectoryPath = join(scratchDirectory, 'old-admin')
    renameSync(worktreePath, oldWorktreePath)
    renameSync(adminDirectoryPath, oldAdminDirectoryPath)
    mkdirSync(worktreePath)
    mkdirSync(adminDirectoryPath, { recursive: true })
    writeFileSync(join(worktreePath, '.git'), `gitdir: ${adminDirectoryPath}\n`)
    writeFileSync(join(adminDirectoryPath, 'HEAD'), 'ref: refs/heads/feature\n')
    writeFileSync(
      join(adminDirectoryPath, 'commondir'),
      `${relative(adminDirectoryPath, commonDirectoryPath)}\n`
    )
    writeFileSync(join(adminDirectoryPath, 'gitdir'), `${join(worktreePath, '.git')}\n`)

    const after = await readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)

    expect(before?.fingerprint).toBeDefined()
    expect(after?.fingerprint).toBeDefined()
    expect(after?.fingerprint).not.toBe(before?.fingerprint)
  })

  it('rejects a linked worktree whose admin back-pointer names another path', async () => {
    const { repoPath, worktreePath, adminDirectoryPath } = createLinkedWorktreeFixture()
    writeFileSync(
      join(adminDirectoryPath, 'gitdir'),
      `${join(scratchDirectory, 'other', '.git')}\n`
    )

    await expect(
      readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
    ).resolves.toBeNull()
  })

  it('rejects a linked worktree whose private gitdir is outside the registered worktrees directory', async () => {
    const { repoPath, worktreePath, commonDirectoryPath } = createLinkedWorktreeFixture()
    const externalAdminDirectoryPath = join(scratchDirectory, 'external-admin')
    mkdirSync(externalAdminDirectoryPath)
    writeFileSync(join(worktreePath, '.git'), `gitdir: ${externalAdminDirectoryPath}\n`)
    writeFileSync(join(externalAdminDirectoryPath, 'HEAD'), 'ref: refs/heads/feature\n')
    writeFileSync(
      join(externalAdminDirectoryPath, 'commondir'),
      `${relative(externalAdminDirectoryPath, commonDirectoryPath)}\n`
    )
    writeFileSync(join(externalAdminDirectoryPath, 'gitdir'), `${join(worktreePath, '.git')}\n`)

    await expect(
      readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
    ).resolves.toBeNull()
  })

  it('changes identity after real Git removes and recreates a linked worktree registration', async () => {
    scratchDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-real-git-registration-')))
    const repoPath = join(scratchDirectory, 'repo')
    const worktreePath = join(scratchDirectory, 'worktree')
    mkdirSync(repoPath)

    await runGit(repoPath, ['init'])
    await runGit(repoPath, ['config', 'user.name', 'Orca Test'])
    await runGit(repoPath, ['config', 'user.email', 'orca-test@example.invalid'])
    writeFileSync(join(repoPath, 'tracked.txt'), 'registration identity test\n')
    await runGit(repoPath, ['add', 'tracked.txt'])
    await runGit(repoPath, ['commit', '-m', 'initial'])
    await runGit(repoPath, ['branch', 'feature'])
    await runGit(repoPath, ['worktree', 'add', worktreePath, 'feature'])

    const before = await readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
    expect(before?.filesystemIdentity.indexPath?.kind).toBe('file')
    await runGit(repoPath, ['worktree', 'remove', worktreePath])
    await runGit(repoPath, ['worktree', 'add', worktreePath, 'feature'])
    const after = await readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)

    expect(before?.fingerprint).toBeDefined()
    expect(after?.fingerprint).toBeDefined()
    expect(after?.fingerprint).not.toBe(before?.fingerprint)
  })
})

async function runGit(cwd: string, args: string[]): Promise<void> {
  const result = await runProcess({
    program: 'git',
    args,
    cwd,
    timeoutMs: 15_000,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(scratchDirectory, 'gitconfig'),
      GIT_TERMINAL_PROMPT: '0'
    }
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed with ${result.code}`)
  }
}
