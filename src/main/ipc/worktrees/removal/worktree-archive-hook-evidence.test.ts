import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'

const {
  execNonInteractiveMock,
  getEffectiveHooksFromConfigMock,
  getSshFilesystemProviderMock,
  requireSshGitProviderMock
} = vi.hoisted(() => ({
  execNonInteractiveMock: vi.fn(),
  getEffectiveHooksFromConfigMock: vi.fn(),
  getSshFilesystemProviderMock: vi.fn(),
  requireSshGitProviderMock: vi.fn()
}))

vi.mock('../../../effective-hook-config', () => ({
  getEffectiveHooksFromConfig: getEffectiveHooksFromConfigMock
}))
vi.mock('../../../hooks', () => ({
  getEffectiveHooks: vi.fn(),
  parseOrcaYaml: vi.fn()
}))
vi.mock('../../../providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: getSshFilesystemProviderMock
}))
vi.mock('../../../providers/ssh-git-dispatch', () => ({
  requireSshGitProvider: requireSshGitProviderMock
}))
vi.mock('../../../setup-hook-env-vars', () => ({
  getSetupRunnerEnvVars: vi.fn(() => ({}))
}))

import { getArchiveHooksForRemoval, runRemoteArchiveHook } from './worktree-archive-hook'

const repo: Repo = {
  id: 'repo-1',
  path: '/remote/repo',
  displayName: 'Remote',
  badgeColor: '#000',
  addedAt: 0,
  connectionId: 'conn-1'
}

describe('remote archive hook evidence boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSshGitProviderMock.mockReturnValue({ execNonInteractive: execNonInteractiveMock })
  })

  it('collapses unavailable, missing, and unreadable SSH config onto the same fallback', async () => {
    const fallback = { scripts: {} }
    const missingConfigError = Object.assign(new Error('config missing'), { code: 'ENOENT' })
    getEffectiveHooksFromConfigMock.mockReturnValue(fallback)
    getSshFilesystemProviderMock
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ readFile: vi.fn().mockRejectedValue(missingConfigError) })
      .mockReturnValueOnce({
        readFile: vi.fn().mockRejectedValue(new Error('relay disconnected'))
      })

    await expect(getArchiveHooksForRemoval(repo)).resolves.toBe(fallback)
    await expect(getArchiveHooksForRemoval(repo)).resolves.toBe(fallback)
    await expect(getArchiveHooksForRemoval(repo)).resolves.toBe(fallback)
    expect(getEffectiveHooksFromConfigMock).toHaveBeenNthCalledWith(1, repo, null)
    expect(getEffectiveHooksFromConfigMock).toHaveBeenNthCalledWith(2, repo, null)
    expect(getEffectiveHooksFromConfigMock).toHaveBeenNthCalledWith(3, repo, null)
  })

  it('flattens a non-zero exit into output text', async () => {
    execNonInteractiveMock.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 23,
      timedOut: false
    })

    await expect(runRemoteArchiveHook(repo, '/remote/worktree', 'exit 23')).resolves.toEqual({
      success: false,
      output: 'archive hook exited 23'
    })
  })

  it('flattens timeout and transport loss into unstructured failure output', async () => {
    execNonInteractiveMock
      .mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: true
      })
      .mockRejectedValueOnce(new Error('relay disconnected'))

    await expect(runRemoteArchiveHook(repo, '/remote/worktree', 'sleep 300')).resolves.toEqual({
      success: false,
      output: 'archive hook timed out'
    })
    await expect(runRemoteArchiveHook(repo, '/remote/worktree', 'echo archived')).resolves.toEqual({
      success: false,
      output: 'relay disconnected'
    })
  })
})
