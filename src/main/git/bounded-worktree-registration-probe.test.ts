import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import { createBoundedWorktreeRegistrationIdentityReader } from './bounded-worktree-registration-probe'

describe('createBoundedWorktreeRegistrationIdentityReader', () => {
  it('rejects a probe result after a blocked event loop passes the deadline', async () => {
    const readIdentity = vi.fn(async () => {
      const blockedUntil = performance.now() + 30
      while (performance.now() < blockedUntil) {
        // Simulate synchronous filesystem-adjacent work delaying the timer callback.
      }
      return 'late-identity'
    })
    const readBoundedIdentity = createBoundedWorktreeRegistrationIdentityReader(readIdentity, 5)

    await expect(readBoundedIdentity('/repo', '/repo/worktree')).resolves.toBeNull()
    expect(readIdentity).toHaveBeenCalledOnce()
  })

  it('times out and prevents overlapping probes until late filesystem work settles', async () => {
    let finishProbe: ((value: string | null) => void) | undefined
    const hangingProbe = new Promise<string | null>((resolve) => {
      finishProbe = resolve
    })
    const readIdentity = vi
      .fn<(repoPath: string, worktreePath: string) => Promise<string | null>>()
      .mockImplementationOnce(() => hangingProbe)
      .mockResolvedValueOnce('fresh-identity')
    const readBoundedIdentity = createBoundedWorktreeRegistrationIdentityReader(readIdentity, 5)

    await expect(readBoundedIdentity('/repo', '/repo/worktree')).resolves.toBeNull()
    await expect(readBoundedIdentity('/repo', '/repo/worktree')).resolves.toBeNull()
    expect(readIdentity).toHaveBeenCalledOnce()

    finishProbe?.('late-identity')
    await hangingProbe
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(readBoundedIdentity('/repo', '/repo/worktree')).resolves.toBe('fresh-identity')
    expect(readIdentity).toHaveBeenCalledTimes(2)
  })

  it('returns unavailable on abort without releasing a still-running probe slot', async () => {
    let finishProbe: ((value: string | null) => void) | undefined
    const hangingProbe = new Promise<string | null>((resolve) => {
      finishProbe = resolve
    })
    const readIdentity = vi.fn<(repoPath: string, worktreePath: string) => Promise<string | null>>(
      () => hangingProbe
    )
    const readBoundedIdentity = createBoundedWorktreeRegistrationIdentityReader(readIdentity, 1_000)
    const abortController = new AbortController()
    const pending = readBoundedIdentity('/repo', '/repo/worktree', abortController.signal)

    abortController.abort()

    await expect(pending).resolves.toBeNull()
    await expect(readBoundedIdentity('/repo', '/repo/worktree')).resolves.toBeNull()
    expect(readIdentity).toHaveBeenCalledOnce()
    finishProbe?.('late-identity')
    await hangingProbe
  })
})
