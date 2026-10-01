import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../shared/child-process/run-process'
import { gitExecFileAsync } from './runner'
import {
  buildNativeGitSubjectAttestationEnvironment,
  createBoundedNativeGitSubjectReader,
  nativeGitSubjectMatchesRegistration,
  readNativeGitEffectiveWorktreeSubject
} from './native-worktree-subject-attestation'
import {
  readNativeGitWorktreeRegistrationIdentity,
  type NativeGitWorktreeFilesystemEntryIdentity
} from './worktree-catalog-registration-identity'

let scratchDirectory = ''

afterEach(() => {
  if (scratchDirectory) {
    rmSync(scratchDirectory, { recursive: true, force: true })
    scratchDirectory = ''
  }
})

describe('native Git subject attestation', () => {
  it('removes ambient Git selectors and config injection while preserving the process path', () => {
    const environment = buildNativeGitSubjectAttestationEnvironment(
      {
        PATH: 'trusted-path',
        PWD: '/ambient/path',
        GIT_DIR: '/attacker/git',
        GIT_WORK_TREE: '/attacker/worktree',
        GIT_COMMON_DIR: '/attacker/common',
        GIT_INDEX_FILE: '/attacker/index',
        GIT_CEILING_DIRECTORIES: '/attacker/ceiling',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.worktree',
        GIT_CONFIG_VALUE_0: '/attacker/worktree'
      },
      'linux'
    )

    expect(environment.PATH).toBe('trusted-path')
    expect(environment.PWD).toBeUndefined()
    expect(Object.keys(environment).filter((key) => /^GIT_/i.test(key))).toEqual([
      'GIT_CONFIG_NOSYSTEM',
      'GIT_CONFIG_GLOBAL',
      'GIT_OPTIONAL_LOCKS',
      'GIT_TERMINAL_PROMPT'
    ])
    expect(environment).toMatchObject({
      HOME: '/dev/null',
      USERPROFILE: '/dev/null',
      XDG_CONFIG_HOME: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0'
    })
  })

  it('does not treat case-folded Windows paths as the same filesystem object', () => {
    const expected = {
      worktreeRoot: 'C:\\Repos\\Ticket',
      gitDirectoryPath: 'C:\\Repos\\.git\\worktrees\\ticket',
      commonDirectoryPath: 'C:\\Repos\\.git',
      indexPath: 'C:\\Repos\\.git\\worktrees\\ticket\\index',
      filesystemIdentity: {
        worktreeRoot: filesystemIdentity('10', 'directory'),
        gitDirectoryPath: filesystemIdentity('11', 'directory'),
        commonDirectoryPath: filesystemIdentity('12', 'directory'),
        indexPath: filesystemIdentity('13', 'file')
      }
    }
    const actual = {
      ...expected,
      worktreeRoot: 'c:\\repos\\TICKET',
      filesystemIdentity: {
        ...expected.filesystemIdentity,
        worktreeRoot: filesystemIdentity('different', 'directory')
      }
    }

    expect(nativeGitSubjectMatchesRegistration(actual, expected)).toBe(false)
  })

  it('bounds the full subject probe and aborts an admitted or queued Git read', async () => {
    let observedSignal: AbortSignal | undefined
    const readSubject = (_worktreeRoot: string, signal: AbortSignal) => {
      observedSignal = signal
      return new Promise<string | null>(() => {})
    }
    const readBoundedSubject = createBoundedNativeGitSubjectReader(readSubject, 15)

    await expect(readBoundedSubject('/repo/worktree')).resolves.toBeNull()
    expect(observedSignal?.aborted).toBe(true)
    await expect(readBoundedSubject('/repo/other')).resolves.toBeNull()
  })

  it('cancels the full subject probe when its caller aborts', async () => {
    let observedSignal: AbortSignal | undefined
    const readSubject = (_worktreeRoot: string, signal: AbortSignal) => {
      observedSignal = signal
      return new Promise<string | null>(() => {})
    }
    const readBoundedSubject = createBoundedNativeGitSubjectReader(readSubject)
    const controller = new AbortController()
    const result = readBoundedSubject('/repo/worktree', controller.signal)
    controller.abort()

    await expect(result).resolves.toBeNull()
    expect(observedSignal?.aborted).toBe(true)
  })

  it('attests the effective subject of a real linked worktree against its filesystem registration', async () => {
    const { repoPath, worktreePath } = await createLinkedWorktreeFixture()
    const identity = await readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
    const subject = await readNativeGitEffectiveWorktreeSubject(worktreePath)

    expect(identity).not.toBeNull()
    expect(subject).not.toBeNull()
    if (!identity || !subject) {
      throw new Error('Expected a readable local native Git worktree subject.')
    }
    expect(nativeGitSubjectMatchesRegistration(subject, identity)).toBe(true)
  })

  it.skipIf(process.platform === 'win32')(
    'rejects an index redirected through a symlink',
    async () => {
      const { repoPath, worktreePath } = await createLinkedWorktreeFixture()
      const identity = await readNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath)
      if (!identity) {
        throw new Error('Expected a readable linked-worktree registration.')
      }
      unlinkSync(identity.indexPath)
      symlinkSync(join(identity.gitDirectoryPath, 'HEAD'), identity.indexPath)

      await expect(readNativeGitEffectiveWorktreeSubject(worktreePath)).resolves.toBeNull()
    }
  )

  it('rejects a requested WSL route before starting any Git command', async () => {
    await expect(
      gitExecFileAsync(['rev-parse', '--show-toplevel'], {
        cwd: process.cwd(),
        wslDistro: 'Ubuntu',
        requireNativeExecution: true
      })
    ).rejects.toThrow('native_git_execution_unavailable')
  })
})

async function createLinkedWorktreeFixture(): Promise<{
  repoPath: string
  worktreePath: string
}> {
  scratchDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'orca-subject-attestation-')))
  const repoPath = join(scratchDirectory, 'repo')
  const worktreePath = join(scratchDirectory, 'worktree')
  mkdirSync(repoPath)

  await runGit(repoPath, ['init'])
  await runGit(repoPath, ['config', 'user.name', 'Orca Test'])
  await runGit(repoPath, ['config', 'user.email', 'orca-test@example.invalid'])
  writeFileSync(join(repoPath, 'tracked.txt'), 'subject attestation test\n')
  await runGit(repoPath, ['add', 'tracked.txt'])
  await runGit(repoPath, ['commit', '-m', 'initial'])
  await runGit(repoPath, ['branch', 'feature'])
  await runGit(repoPath, ['worktree', 'add', worktreePath, 'feature'])

  return { repoPath, worktreePath }
}

function filesystemIdentity(
  inode: string,
  kind: 'file' | 'directory'
): NativeGitWorktreeFilesystemEntryIdentity {
  return {
    device: '1',
    inode,
    birthtimeNs: '3',
    ctimeNs: '4',
    mtimeNs: '5',
    size: '6',
    kind
  }
}

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
