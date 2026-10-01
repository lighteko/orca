import { describe, expect, it, vi } from 'vitest'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import { canonicalWorktreeIdentity } from '../../shared/worktree/identity'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import type { NativeGitWorktreeStatusRecordCapture } from '../git/native-worktree-status-record-capture'
import type { NativeGitOperationMarkerCapture } from '../git/native-git-operation-marker-capture'
import type { NativeGitWorktreeRegistrationIdentity } from '../git/worktree-catalog-registration-identity'
import type {
  WorktreeCatalogBindingRequest,
  WorktreeCatalogBindingSourceSnapshot
} from '../persistence/loading-store/worktree-catalog-binding-types'
import { RuntimeWorktreeCatalogBindingCommands } from './runtime-worktree-catalog-binding'
import {
  RuntimeGitStatusRecordCaptureCommands,
  RuntimeGitStatusRecordCaptureUnavailableError
} from './runtime-git-status-record-capture'

const WORKTREE_PATH = '/repo/worktree'
const INSTANCE_ID = 'instance-1'
const IDENTITY_KEY = canonicalWorktreeIdentity({
  worktreeId: `repo-1::${WORKTREE_PATH}`,
  executionHostId: LOCAL_EXECUTION_HOST_ID,
  instanceId: INSTANCE_ID
})

function registrationIdentity(): NativeGitWorktreeRegistrationIdentity {
  return {
    fingerprint: 'registration-1',
    worktreeRoot: WORKTREE_PATH,
    gitDirectoryPath: '/repo/.git/worktrees/feature',
    commonDirectoryPath: '/repo/.git',
    indexPath: '/repo/.git/worktrees/feature/index',
    filesystemIdentity: {
      worktreeRoot: filesystemIdentity('2', 'directory'),
      gitDirectoryPath: filesystemIdentity('3', 'directory'),
      commonDirectoryPath: filesystemIdentity('4', 'directory'),
      indexPath: null
    }
  }
}

function filesystemIdentity(
  inode: string,
  kind: 'file' | 'directory'
): NativeGitWorktreeRegistrationIdentity['filesystemIdentity']['worktreeRoot'] {
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

async function createBinding() {
  const request: WorktreeCatalogBindingRequest = {
    repositoryId: 'repo-1',
    worktreeId: `repo-1::${WORKTREE_PATH}`,
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    instanceId: INSTANCE_ID,
    identityKey: IDENTITY_KEY
  }
  const repo: Repo = {
    id: 'repo-1',
    path: '/repo',
    displayName: 'repo',
    badgeColor: 'blue',
    addedAt: 1,
    executionHostId: LOCAL_EXECUTION_HOST_ID
  }
  const meta: WorktreeMeta = {
    instanceId: INSTANCE_ID,
    hostId: LOCAL_EXECUTION_HOST_ID,
    displayName: 'worktree',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1
  }
  const snapshot: WorktreeCatalogBindingSourceSnapshot = {
    token: { incarnationId: 'incarnation-1', revision: 3 },
    repo,
    meta
  }
  const gitWorktree: GitWorktreeInfo = {
    path: WORKTREE_PATH,
    head: 'abc123',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false
  }
  return new RuntimeWorktreeCatalogBindingCommands({
    getWorktreeCatalogBindingSourceSnapshot: () => snapshot,
    listNativeGitWorktrees: async () => [gitWorktree],
    readWorktreeRegistrationIdentity: async () => registrationIdentity()
  }).resolveExactLocalNativeGitTarget(request)
}

function statusCapture(
  overrides: Partial<NativeGitWorktreeStatusRecordCapture> = {}
): NativeGitWorktreeStatusRecordCapture {
  return {
    executionRoute: 'native',
    complete: false,
    rawRecordCount: 1,
    representedRecordCount: 0,
    unsupportedRecordCount: 1,
    records: [],
    ...overrides
  }
}

function operationMarkerCapture(
  overrides: Partial<NativeGitOperationMarkerCapture> = {}
): NativeGitOperationMarkerCapture {
  return {
    complete: true,
    filesystemRoute: 'native',
    markers: {
      mergeHead: 'absent',
      cherryPickHead: 'absent',
      rebaseMerge: 'absent',
      rebaseApply: 'absent'
    },
    ...overrides
  }
}

function testClock(startAt = 1_000, monotonicAt = 10) {
  return {
    wall: startAt,
    monotonic: monotonicAt,
    wallNow() {
      return this.wall
    },
    monotonicNow() {
      return this.monotonic
    }
  }
}

describe('RuntimeGitStatusRecordCaptureCommands', () => {
  it('stamps a frozen owner observation immediately before fresh source reads', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()
    const clock = testClock()
    const attestSubject = vi.fn(async () => ({ binding, effectiveSubject: subject }))
    const readStatusRecords = vi.fn(async () => {
      expect(clock.wall).toBe(1_000)
      return statusCapture()
    })
    const readOperationMarkers = vi.fn(async () => operationMarkerCapture())
    const commands = new RuntimeGitStatusRecordCaptureCommands(
      {
        attestSubject,
        readStatusRecords,
        readOperationMarkers
      },
      clock
    )

    const result = await commands.captureExactLocalNativeGitStatusRecords(binding)

    expect(result).toMatchObject({
      binding,
      effectiveSubject: subject,
      status: statusCapture(),
      operationMarkers: operationMarkerCapture(),
      observationId: expect.any(String),
      ownerReadStartedAt: 1_000
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(attestSubject).toHaveBeenCalledTimes(2)
    expect(readStatusRecords).toHaveBeenCalledOnce()
    expect(readOperationMarkers).toHaveBeenCalledWith(subject, expect.any(AbortSignal))
  })

  it('rejects a subject change or unavailable status instead of returning a partial capture', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()
    const changedSubject = { ...subject, indexPath: '/repo/.git/index' }
    const attestSubject = vi
      .fn(async () => ({ binding, effectiveSubject: subject }))
      .mockResolvedValueOnce({ binding, effectiveSubject: subject })
      .mockResolvedValueOnce({ binding, effectiveSubject: changedSubject })
    const readStatusRecords = vi.fn(async () => statusCapture())
    const readOperationMarkers = vi.fn(async () => operationMarkerCapture())
    const commands = new RuntimeGitStatusRecordCaptureCommands({
      attestSubject,
      readStatusRecords,
      readOperationMarkers
    })

    await expect(commands.captureExactLocalNativeGitStatusRecords(binding)).rejects.toBeInstanceOf(
      RuntimeGitStatusRecordCaptureUnavailableError
    )
    expect(readStatusRecords).toHaveBeenCalledOnce()

    const unavailable = new RuntimeGitStatusRecordCaptureCommands({
      attestSubject: async () => ({ binding, effectiveSubject: subject }),
      readStatusRecords: async () => null,
      readOperationMarkers: async () => operationMarkerCapture()
    })
    await expect(
      unavailable.captureExactLocalNativeGitStatusRecords(binding)
    ).rejects.toBeInstanceOf(RuntimeGitStatusRecordCaptureUnavailableError)
  })

  it('runs two overlapping calls as two independent status reads', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()
    const clock = testClock()
    let releaseReads: (() => void) | undefined
    const bothStarted = new Promise<void>((resolve) => {
      releaseReads = resolve
    })
    const attestSubject = vi.fn(async () => ({ binding, effectiveSubject: subject }))
    const readStatusRecords = vi.fn(async () => {
      if (readStatusRecords.mock.calls.length === 2) {
        releaseReads?.()
      }
      await bothStarted
      return statusCapture({ complete: true, unsupportedRecordCount: 0, representedRecordCount: 1 })
    })
    const readOperationMarkers = vi.fn(async () => operationMarkerCapture())
    const commands = new RuntimeGitStatusRecordCaptureCommands(
      {
        attestSubject,
        readStatusRecords,
        readOperationMarkers
      },
      clock
    )

    const results = await Promise.all([
      commands.captureExactLocalNativeGitStatusRecords(binding),
      commands.captureExactLocalNativeGitStatusRecords(binding)
    ])

    expect(readStatusRecords).toHaveBeenCalledTimes(2)
    expect(attestSubject).toHaveBeenCalledTimes(4)
    expect(results).toHaveLength(2)
    expect(results[0]?.observationId).not.toBe(results[1]?.observationId)
    expect(results.map((result) => result.ownerReadStartedAt)).toEqual([1_000, 1_000])
    expect(results.every((result) => result.binding === binding)).toBe(true)
  })

  it('rejects evidence older than 30 seconds or with a future owner timestamp', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()

    for (const elapsed of [30_001, -1]) {
      const clock = testClock()
      const commands = new RuntimeGitStatusRecordCaptureCommands(
        {
          attestSubject: async () => ({ binding, effectiveSubject: subject }),
          readStatusRecords: async () => {
            clock.wall += elapsed
            clock.monotonic += Math.max(elapsed, 0)
            return statusCapture()
          },
          readOperationMarkers: async () => operationMarkerCapture()
        },
        clock
      )

      await expect(
        commands.captureExactLocalNativeGitStatusRecords(binding)
      ).rejects.toBeInstanceOf(RuntimeGitStatusRecordCaptureUnavailableError)
    }
  })

  it('rejects wall-clock jumps and a backwards monotonic clock', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()

    for (const change of [
      (clock: ReturnType<typeof testClock>) => {
        clock.wall -= 2_000
      },
      (clock: ReturnType<typeof testClock>) => {
        clock.monotonic -= 1
      }
    ]) {
      const clock = testClock()
      const commands = new RuntimeGitStatusRecordCaptureCommands(
        {
          attestSubject: async () => ({ binding, effectiveSubject: subject }),
          readStatusRecords: async () => {
            change(clock)
            return statusCapture()
          },
          readOperationMarkers: async () => operationMarkerCapture()
        },
        clock
      )

      await expect(
        commands.captureExactLocalNativeGitStatusRecords(binding)
      ).rejects.toBeInstanceOf(RuntimeGitStatusRecordCaptureUnavailableError)
    }
  })

  it('aborts at the overall deadline and holds the source call until it settles', async () => {
    vi.useFakeTimers()
    try {
      const binding = await createBinding()
      const subject = registrationIdentity()
      let releaseStatus: (() => void) | undefined
      let sourceSignal: AbortSignal | undefined
      const readStatusRecords = vi.fn((_binding: typeof binding, signal?: AbortSignal) => {
        sourceSignal = signal
        return new Promise<NativeGitWorktreeStatusRecordCapture>((resolve) => {
          releaseStatus = () => resolve(statusCapture())
        })
      })
      const readOperationMarkers = vi.fn(async () => operationMarkerCapture())
      const commands = new RuntimeGitStatusRecordCaptureCommands({
        attestSubject: async () => ({ binding, effectiveSubject: subject }),
        readStatusRecords,
        readOperationMarkers
      })
      const capture = commands.captureExactLocalNativeGitStatusRecords(binding)
      const captureFailure = expect(capture).rejects.toBeInstanceOf(
        RuntimeGitStatusRecordCaptureUnavailableError
      )

      await vi.advanceTimersByTimeAsync(30_000)

      await captureFailure
      expect(sourceSignal?.aborted).toBe(true)
      expect(readOperationMarkers).not.toHaveBeenCalled()

      releaseStatus?.()
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies the overall deadline to the first subject attestation', async () => {
    const binding = await createBinding()
    vi.useFakeTimers()
    try {
      const subject = registrationIdentity()
      let releaseAttestation:
        | ((value: { binding: typeof binding; effectiveSubject: typeof subject }) => void)
        | undefined
      let attestationSignal: AbortSignal | undefined
      const attestSubject = vi.fn((_binding: typeof binding, signal?: AbortSignal) => {
        attestationSignal = signal
        return new Promise<{ binding: typeof binding; effectiveSubject: typeof subject }>(
          (resolve) => {
            releaseAttestation = resolve
          }
        )
      })
      const readStatusRecords = vi.fn(async () => statusCapture())
      const readOperationMarkers = vi.fn(async () => operationMarkerCapture())
      const commands = new RuntimeGitStatusRecordCaptureCommands({
        attestSubject,
        readStatusRecords,
        readOperationMarkers
      })
      const capture = commands.captureExactLocalNativeGitStatusRecords(binding)
      const captureFailure = expect(capture).rejects.toBeInstanceOf(
        RuntimeGitStatusRecordCaptureUnavailableError
      )

      await Promise.resolve()
      expect(attestSubject).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(30_000)

      await captureFailure
      expect(attestationSignal?.aborted).toBe(true)
      expect(readStatusRecords).not.toHaveBeenCalled()
      expect(readOperationMarkers).not.toHaveBeenCalled()

      releaseAttestation?.({ binding, effectiveSubject: subject })
      await Promise.resolve()
      await Promise.resolve()
      expect(readStatusRecords).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels an owner read without admitting late source evidence', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()
    const controller = new AbortController()
    let releaseStatus: (() => void) | undefined
    let sourceSignal: AbortSignal | undefined
    const readStatusRecords = vi.fn((_binding: typeof binding, signal?: AbortSignal) => {
      sourceSignal = signal
      return new Promise<NativeGitWorktreeStatusRecordCapture>((resolve) => {
        releaseStatus = () => resolve(statusCapture())
      })
    })
    const readOperationMarkers = vi.fn(async () => operationMarkerCapture())
    const commands = new RuntimeGitStatusRecordCaptureCommands({
      attestSubject: async () => ({ binding, effectiveSubject: subject }),
      readStatusRecords,
      readOperationMarkers
    })
    const capture = commands.captureExactLocalNativeGitStatusRecords(binding, controller.signal)

    await vi.waitFor(() => expect(readStatusRecords).toHaveBeenCalledOnce())
    controller.abort()

    await expect(capture).rejects.toBeInstanceOf(RuntimeGitStatusRecordCaptureUnavailableError)
    expect(sourceSignal?.aborted).toBe(true)
    expect(readOperationMarkers).not.toHaveBeenCalled()

    releaseStatus?.()
    await Promise.resolve()
  })

  it('does not give an empty complete record scan a clear verdict', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()
    const emptyStatus = statusCapture({
      complete: true,
      rawRecordCount: 0,
      representedRecordCount: 0,
      unsupportedRecordCount: 0,
      records: []
    })
    const commands = new RuntimeGitStatusRecordCaptureCommands({
      attestSubject: async () => ({ binding, effectiveSubject: subject }),
      readStatusRecords: async () => emptyStatus,
      readOperationMarkers: async () => operationMarkerCapture()
    })

    const result = await commands.captureExactLocalNativeGitStatusRecords(binding)

    expect(result.status).toEqual(emptyStatus)
    expect(result).not.toHaveProperty('clear')
  })

  it('preserves positive marker evidence alongside an unavailable marker', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()
    const operationMarkers = operationMarkerCapture({
      complete: false,
      markers: {
        mergeHead: 'present',
        cherryPickHead: 'unavailable',
        rebaseMerge: 'absent',
        rebaseApply: 'absent'
      }
    })
    const commands = new RuntimeGitStatusRecordCaptureCommands({
      attestSubject: async () => ({ binding, effectiveSubject: subject }),
      readStatusRecords: async () => statusCapture(),
      readOperationMarkers: async () => operationMarkers
    })

    const result = await commands.captureExactLocalNativeGitStatusRecords(binding)

    expect(result.operationMarkers).toEqual(operationMarkers)
    expect(result).not.toHaveProperty('clear')
  })

  it('rejects an unavailable operation-marker route instead of returning the status alone', async () => {
    const binding = await createBinding()
    const subject = registrationIdentity()
    const attestSubject = vi.fn(async () => ({ binding, effectiveSubject: subject }))
    const readStatusRecords = vi.fn(async () => statusCapture())
    const commands = new RuntimeGitStatusRecordCaptureCommands({
      attestSubject,
      readStatusRecords,
      readOperationMarkers: async () => null
    })

    await expect(commands.captureExactLocalNativeGitStatusRecords(binding)).rejects.toBeInstanceOf(
      RuntimeGitStatusRecordCaptureUnavailableError
    )
    expect(attestSubject).toHaveBeenCalledOnce()
  })

  it('rejects an already-aborted call before reading or attesting', async () => {
    const binding = await createBinding()
    const attestSubject = vi.fn(async () => ({ binding, effectiveSubject: registrationIdentity() }))
    const readStatusRecords = vi.fn(async () => statusCapture())
    const readOperationMarkers = vi.fn(async () => operationMarkerCapture())
    const commands = new RuntimeGitStatusRecordCaptureCommands({
      attestSubject,
      readStatusRecords,
      readOperationMarkers
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      commands.captureExactLocalNativeGitStatusRecords(binding, controller.signal)
    ).rejects.toBeInstanceOf(RuntimeGitStatusRecordCaptureUnavailableError)
    expect(attestSubject).not.toHaveBeenCalled()
    expect(readStatusRecords).not.toHaveBeenCalled()
  })
})
