import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
import { readNativeGitEffectiveWorktreeSubject } from './native-worktree-subject-attestation'
import { readNativeGitOperationMarkers } from './native-git-operation-marker-capture'

let scratchDirectory = ''

afterEach(() => {
  if (scratchDirectory) {
    rmSync(scratchDirectory, { recursive: true, force: true })
    scratchDirectory = ''
  }
})

describe('readNativeGitOperationMarkers integration', () => {
  it('distinguishes absent and present markers on the effective linked-worktree gitdir, including Git forward-slash paths', async () => {
    scratchDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-operation-markers-')))
    const repositoryPath = join(scratchDirectory, 'repository')
    const worktreePath = join(scratchDirectory, 'ticket-worktree')
    mkdirSync(repositoryPath, { recursive: true })
    await runGit(repositoryPath, ['init'])
    await runGit(repositoryPath, ['config', 'user.name', 'Orca Test'])
    await runGit(repositoryPath, ['config', 'user.email', 'orca-test@example.invalid'])
    writeFileSync(join(repositoryPath, 'tracked.txt'), 'base\n')
    await runGit(repositoryPath, ['add', 'tracked.txt'])
    await runGit(repositoryPath, ['commit', '-m', 'base'])
    await runGit(repositoryPath, ['branch', 'ticket'])
    await runGit(repositoryPath, ['worktree', 'add', worktreePath, 'ticket'])

    const initialSubject = await readNativeGitEffectiveWorktreeSubject(worktreePath)
    if (!initialSubject) {
      throw new Error('effective Git subject was unavailable')
    }
    if (process.platform === 'win32') {
      expect(initialSubject.worktreeRoot).toContain('/')
    }
    await expect(readNativeGitOperationMarkers(initialSubject)).resolves.toEqual({
      complete: true,
      filesystemRoute: 'native',
      markers: {
        mergeHead: 'absent',
        cherryPickHead: 'absent',
        rebaseMerge: 'absent',
        rebaseApply: 'absent'
      }
    })

    const markerDirectory = initialSubject.gitDirectoryPath
    writeFileSync(join(markerDirectory, 'MERGE_HEAD'), `${'a'.repeat(40)}\n`)
    writeFileSync(join(markerDirectory, 'CHERRY_PICK_HEAD'), `${'b'.repeat(40)}\n`)
    mkdirSync(join(markerDirectory, 'rebase-merge'))
    mkdirSync(join(markerDirectory, 'rebase-apply'))

    const subjectWithMarkers = await readNativeGitEffectiveWorktreeSubject(worktreePath)
    if (!subjectWithMarkers) {
      throw new Error('effective Git subject with markers was unavailable')
    }
    const result = await readNativeGitOperationMarkers(subjectWithMarkers)
    expect(result).toEqual({
      complete: true,
      filesystemRoute: 'native',
      markers: {
        mergeHead: 'present',
        cherryPickHead: 'present',
        rebaseMerge: 'present',
        rebaseApply: 'present'
      }
    })
    expect(JSON.stringify(result)).not.toContain(markerDirectory)
  })
})

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
