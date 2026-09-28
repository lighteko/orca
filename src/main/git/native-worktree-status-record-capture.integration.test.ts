import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
import { readNativeGitWorktreeStatusRecords } from './native-worktree-status-record-capture'

let scratchDirectory = ''

afterEach(() => {
  if (scratchDirectory) {
    rmSync(scratchDirectory, { recursive: true, force: true })
    scratchDirectory = ''
  }
})

describe('readNativeGitWorktreeStatusRecords integration', () => {
  it('captures untracked and submodule changes despite hiding local config and avoids index refresh writes', async () => {
    scratchDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-status-records-')))
    const repositoryPath = join(scratchDirectory, 'repository')
    const worktreePath = join(scratchDirectory, 'ticket-worktree')
    const submoduleRepositoryPath = join(scratchDirectory, 'submodule-repository')
    await initRepository(repositoryPath)
    await initRepository(submoduleRepositoryPath)

    writeFileSync(join(repositoryPath, 'tracked.txt'), 'base\n')
    await runGit(repositoryPath, ['add', 'tracked.txt'])
    await runGit(repositoryPath, ['commit', '-m', 'base'])
    await runGit(repositoryPath, ['branch', 'ticket'])
    await runGit(repositoryPath, ['worktree', 'add', worktreePath, 'ticket'])

    writeFileSync(join(submoduleRepositoryPath, 'library.txt'), 'library\n')
    await runGit(submoduleRepositoryPath, ['add', 'library.txt'])
    await runGit(submoduleRepositoryPath, ['commit', '-m', 'library'])
    await runGit(worktreePath, [
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      submoduleRepositoryPath,
      'vendor/library'
    ])
    await runGit(worktreePath, [
      'config',
      '-f',
      '.gitmodules',
      'submodule.vendor/library.ignore',
      'all'
    ])
    await runGit(worktreePath, ['add', '.gitmodules', 'vendor/library'])
    await runGit(worktreePath, ['commit', '-m', 'add submodule'])

    await runGit(worktreePath, ['config', 'status.showUntrackedFiles', 'no'])
    await runGit(worktreePath, ['config', 'diff.ignoreSubmodules', 'all'])
    await runGit(worktreePath, ['config', 'core.fsmonitor', 'orca-status-monitor-should-not-run'])
    writeFileSync(join(worktreePath, 'tracked.txt'), 'changed\n')
    mkdirSync(join(worktreePath, 'untracked', 'nested'), { recursive: true })
    writeFileSync(join(worktreePath, 'untracked', 'nested', 'café.txt'), 'new\n')
    writeFileSync(join(worktreePath, 'vendor', 'library', 'library.txt'), 'changed\n')

    const gitDirectory = (await runGit(worktreePath, ['rev-parse', '--absolute-git-dir'])).trim()
    const indexPath = join(gitDirectory, 'index')
    const indexBefore = statSync(indexPath, { bigint: true })
    const result = await readNativeGitWorktreeStatusRecords(worktreePath)
    const indexAfter = statSync(indexPath, { bigint: true })

    expect(result).toMatchObject({
      complete: true,
      executionRoute: 'native',
      rawRecordCount: 3,
      representedRecordCount: 3,
      unsupportedRecordCount: 0
    })
    expect(result?.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'tracked' }),
        expect.objectContaining({ kind: 'untracked' }),
        expect.objectContaining({ kind: 'tracked', submodule: expect.stringMatching(/^S/) })
      ])
    )
    expect(indexAfter.ino).toBe(indexBefore.ino)
    expect(indexAfter.mtimeNs).toBe(indexBefore.mtimeNs)
    expect(indexAfter.size).toBe(indexBefore.size)
    expect(JSON.stringify(result)).not.toContain('untracked/nested')
  })
})

async function initRepository(path: string): Promise<void> {
  mkdirSync(path, { recursive: true })
  await runGit(path, ['init'])
  await runGit(path, ['config', 'user.name', 'Orca Test'])
  await runGit(path, ['config', 'user.email', 'orca-test@example.invalid'])
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await runProcess({
    program: 'git',
    args,
    cwd,
    timeoutMs: 15_000,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(scratchDirectory, 'isolated-global-config'),
      GIT_TERMINAL_PROMPT: '0'
    }
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed with ${result.code}`)
  }
  return result.stdout
}
