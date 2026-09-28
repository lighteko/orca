import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGitCapabilityStateForTests } from './git-capability-state'

const { gitExecFileAsyncMock } = vi.hoisted(() => ({
  gitExecFileAsyncMock: vi.fn()
}))

vi.mock('./runner', () => ({ gitExecFileAsync: gitExecFileAsyncMock }))

import { listNativeGitWorktreesForCatalog } from './worktree-catalog-listing'

beforeEach(() => {
  clearGitCapabilityStateForTests()
  gitExecFileAsyncMock.mockReset()
  vi.unstubAllEnvs()
})

afterEach(() => {
  clearGitCapabilityStateForTests()
})

describe('listNativeGitWorktreesForCatalog', () => {
  it('reads a complete fresh NUL-delimited catalog with inherited Git selectors removed', async () => {
    vi.stubEnv('GIT_DIR', '/wrong/repository')
    let capturedOptions:
      | {
          cwd?: string
          env?: NodeJS.ProcessEnv
          wslDistro?: string
        }
      | undefined
    gitExecFileAsyncMock.mockImplementationOnce(
      async (_args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
        capturedOptions = options
        return {
          stdout: [
            'worktree /repo',
            'HEAD abc123',
            'branch refs/heads/main',
            '',
            'worktree /repo/feature',
            'HEAD def456',
            'detached',
            '',
            ''
          ].join('\0'),
          stderr: ''
        }
      }
    )

    const rows = await listNativeGitWorktreesForCatalog('/repo')

    expect(rows.map(({ path, head }) => ({ path, head }))).toEqual([
      { path: '/repo', head: 'abc123' },
      { path: '/repo/feature', head: 'def456' }
    ])
    expect(gitExecFileAsyncMock).toHaveBeenCalledOnce()
    expect(gitExecFileAsyncMock.mock.calls[0]?.[0]).toEqual([
      '-c',
      'core.quotePath=true',
      'worktree',
      'list',
      '--porcelain',
      '-z'
    ])
    expect(capturedOptions?.cwd).toBe('/repo')
    expect(capturedOptions?.env).not.toHaveProperty('GIT_DIR')
    expect(capturedOptions?.env?.GIT_OPTIONAL_LOCKS).toBe('0')
    expect(capturedOptions?.wslDistro).toBeUndefined()
  })

  it('rejects empty, malformed, and truncated-looking catalog output', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({ stdout: '', stderr: '' })
    await expect(listNativeGitWorktreesForCatalog('/repo')).rejects.toThrow(
      'native_git_catalog_empty'
    )

    gitExecFileAsyncMock.mockResolvedValueOnce({
      stdout: ['worktree /repo', 'HEAD abc123', 'unknown future-field', ''].join('\0'),
      stderr: ''
    })
    await expect(listNativeGitWorktreesForCatalog('/repo')).rejects.toThrow(
      'native_git_catalog_incomplete'
    )

    gitExecFileAsyncMock.mockResolvedValueOnce({
      stdout: ['worktree /repo', 'HEAD abc123', 'branch refs/heads/main', ''].join('\0'),
      stderr: ''
    })
    await expect(listNativeGitWorktreesForCatalog('/repo')).rejects.toThrow(
      'native_git_catalog_incomplete'
    )
  })

  it('fails closed and caches unsupported -z capability instead of parsing unsafe line output', async () => {
    gitExecFileAsyncMock.mockRejectedValueOnce(
      Object.assign(new Error("unknown switch `z'"), { code: 129, stderr: "unknown switch `z'" })
    )

    await expect(listNativeGitWorktreesForCatalog('/repo')).rejects.toThrow(
      'native_git_catalog_unavailable'
    )
    await expect(listNativeGitWorktreesForCatalog('/repo')).rejects.toThrow(
      'native_git_catalog_unavailable'
    )
    expect(gitExecFileAsyncMock).toHaveBeenCalledOnce()
    expect(gitExecFileAsyncMock.mock.calls[0]?.[0]).toEqual([
      '-c',
      'core.quotePath=true',
      'worktree',
      'list',
      '--porcelain',
      '-z'
    ])
  })

  it('accepts a documented bare main record without HEAD alongside a linked worktree', async () => {
    gitExecFileAsyncMock.mockResolvedValueOnce({
      stdout: [
        'worktree /repo.git',
        'bare',
        '',
        'worktree /repo-feature',
        'HEAD def456',
        'branch refs/heads/feature',
        '',
        ''
      ].join('\0'),
      stderr: ''
    })

    await expect(listNativeGitWorktreesForCatalog('/repo.git')).resolves.toMatchObject([
      { path: '/repo.git', isBare: true, head: '' },
      { path: '/repo-feature', isBare: false, head: 'def456' }
    ])
  })

  it('does not invoke WSL for a WSL UNC repository path', async () => {
    await expect(
      listNativeGitWorktreesForCatalog('\\\\wsl.localhost\\Ubuntu\\home\\dev\\repo')
    ).rejects.toThrow('native_git_catalog_unavailable')
    expect(gitExecFileAsyncMock).not.toHaveBeenCalled()
  })
})
