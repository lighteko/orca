import { describe, expect, it, vi } from 'vitest'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import type {
  CurrentTicketOwnerRead,
  TicketWorkspaceOwnerSourcePort
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import { RuntimeTicketWorkspaceLiveOwnerCompositionCommands } from './ticket-workspace-live-owner-composition'
import {
  createCompositionDependencies,
  createOwnerClock,
  createOwnerSelection,
  createOwnerSourcePort,
  makeResidentSnapshot,
  refreshSnapshot
} from './ticket-workspace-live-owner-composition-test-support'
import { makePositiveTicketWorkspaceSnapshot } from './__fixtures__/ticket-workspace-owner-fixtures'

describe('RuntimeTicketWorkspaceLiveOwnerCompositionCommands matching', () => {
  it('matches against two same-lease reads and keeps the displayed revision across regenerated timestamps', async () => {
    const { baseline, selection } = createOwnerSelection()
    const oldClockBaseline = refreshSnapshot(baseline, (snapshot) => {
      snapshot.generatedAt = '2001-01-01T00:00:00.000Z'
      snapshot.staleAfter = '2001-01-01T00:01:00.000Z'
    })
    const firstRead = refreshSnapshot(oldClockBaseline, (snapshot) => {
      snapshot.generatedAt = '2001-01-01T00:00:10.000Z'
      snapshot.staleAfter = '2001-01-01T00:01:10.000Z'
    })
    const secondRead = refreshSnapshot(firstRead, (snapshot) => {
      snapshot.generatedAt = '2001-01-01T00:00:20.000Z'
      snapshot.staleAfter = '2001-01-01T00:01:20.000Z'
    })
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(oldClockBaseline, [firstRead, secondRead], clock)
    const runtime = createCompositionDependencies(source.port, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    const result = await commands.matchSelection({
      ...selection,
      snapshotRevision: oldClockBaseline.snapshotRevision
    })

    expect(result).toEqual({
      status: 'matched',
      snapshotRevision: oldClockBaseline.snapshotRevision,
      ticketKey: selection.ticketKey,
      repositoryId: selection.repositoryId
    })
    expect(source.getReadCount()).toBe(2)
    expect(source.budgets).toEqual([10_000, 10_000])
    expect(source.signals[0]).toBe(source.signals[1])
    expect(runtime.getResolveCount()).toBe(1)
    expect(runtime.getRevalidationCount()).toBe(1)
    expect(result).not.toHaveProperty('binding')
  })

  it('rebinds on each click and returns only the exact Orca worktree ID', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    const result = await commands.rebindSelectionAtClick(selection)

    expect(result).toEqual({
      status: 'rebound',
      snapshotRevision: selection.snapshotRevision,
      ticketKey: selection.ticketKey,
      repositoryId: selection.repositoryId,
      worktreeId: 'common-api::/repo/worktree'
    })
    expect(source.getReadCount()).toBe(2)
    expect(runtime.getRevalidationCount()).toBe(1)
  })

  it('preserves eligible pending lifecycle and reference presentation states', async () => {
    const { baseline: original, selection: originalSelection } = createOwnerSelection()
    const baseline = refreshSnapshot(original, (snapshot) => {
      const ticket = snapshot.tickets.find((row) => row.ticketKey === originalSelection.ticketKey)
      const workspace = ticket?.workspaces.find(
        (row) => row.repositoryId === originalSelection.repositoryId
      )
      if (!ticket || !workspace) {
        throw new Error('Expected owner row missing from fixture.')
      }
      ticket.lifecycle = 'provisioning'
      workspace.actualState = 'provisioning'
      workspace.referenceState = 'unavailable'
    })
    const selection = { ...originalSelection, snapshotRevision: baseline.snapshotRevision }
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({ status: 'matched' })
    expect(source.getReadCount()).toBe(2)
  })

  it('fails before any read for pruned, pruned-lifecycle, excluded, absent, removing, or unavailable rows', async () => {
    const { baseline: original, selection: originalSelection } = createOwnerSelection()
    const suppressions = [
      (snapshot: TicketNavigatorSnapshotV1) => {
        const row = snapshot.tickets.find(
          (ticket) => ticket.ticketKey === originalSelection.ticketKey
        )
        const workspace = row?.workspaces.find(
          (candidate) => candidate.repositoryId === originalSelection.repositoryId
        )
        if (!row || !workspace) {
          throw new Error('Expected owner row missing.')
        }
        delete workspace.target
      },
      (snapshot: TicketNavigatorSnapshotV1) => {
        const row = snapshot.tickets.find(
          (ticket) => ticket.ticketKey === originalSelection.ticketKey
        )
        const workspace = row?.workspaces.find(
          (candidate) => candidate.repositoryId === originalSelection.repositoryId
        )
        if (!row || !workspace) {
          throw new Error('Expected owner row missing.')
        }
        row.lifecycle = 'tearing-down'
        delete workspace.target
      },
      (snapshot: TicketNavigatorSnapshotV1) => {
        const row = snapshot.tickets.find(
          (ticket) => ticket.ticketKey === originalSelection.ticketKey
        )
        const workspace = row?.workspaces.find(
          (candidate) => candidate.repositoryId === originalSelection.repositoryId
        )
        if (!row || !workspace) {
          throw new Error('Expected owner row missing.')
        }
        workspace.role = 'excluded'
      },
      (snapshot: TicketNavigatorSnapshotV1) => {
        const row = snapshot.tickets.find(
          (ticket) => ticket.ticketKey === originalSelection.ticketKey
        )
        const workspace = row?.workspaces.find(
          (candidate) => candidate.repositoryId === originalSelection.repositoryId
        )
        if (!row || !workspace) {
          throw new Error('Expected owner row missing.')
        }
        workspace.actualState = 'absent'
      },
      (snapshot: TicketNavigatorSnapshotV1) => {
        const row = snapshot.tickets.find(
          (ticket) => ticket.ticketKey === originalSelection.ticketKey
        )
        const workspace = row?.workspaces.find(
          (candidate) => candidate.repositoryId === originalSelection.repositoryId
        )
        if (!row || !workspace) {
          throw new Error('Expected owner row missing.')
        }
        workspace.actualState = 'removing'
      },
      (snapshot: TicketNavigatorSnapshotV1) => {
        const row = snapshot.tickets.find(
          (ticket) => ticket.ticketKey === originalSelection.ticketKey
        )
        if (!row) {
          throw new Error('Expected owner ticket missing.')
        }
        row.availability = 'unavailable'
      }
    ]

    for (const suppress of suppressions) {
      const baseline = refreshSnapshot(original, suppress)
      const selection = { ...originalSelection, snapshotRevision: baseline.snapshotRevision }
      const clock = createOwnerClock()
      const source = createOwnerSourcePort(baseline, [baseline], clock)
      const runtime = createCompositionDependencies(source.port, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

      await expect(commands.matchSelection(selection)).resolves.toMatchObject({
        status: 'unavailable'
      })
      expect(source.getReadCount()).toBe(0)
      expect(runtime.getResolveCount()).toBe(0)
    }
  })

  it('rejects any unsupported peer and stale displayed baseline before resolving a workspace', async () => {
    const { baseline: original, selection } = createOwnerSelection()
    const unsupportedPeer = refreshSnapshot(original, (snapshot) => {
      const selectedTicket = snapshot.tickets.find(
        (ticket) => ticket.ticketKey === selection.ticketKey
      )
      if (!selectedTicket) {
        throw new Error('Fixture owner ticket missing.')
      }
      const peer = structuredClone(selectedTicket)
      peer.ticketKey = 'OTHER-1'
      peer.availability = 'unsupported'
      snapshot.tickets.push(peer)
    })
    const clock = createOwnerClock()
    const mixedSource = createOwnerSourcePort(unsupportedPeer, [unsupportedPeer], clock)
    const mixedRuntime = createCompositionDependencies(mixedSource.port, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(
      mixedRuntime.dependencies
    )
    const mixedSelection = { ...selection, snapshotRevision: unsupportedPeer.snapshotRevision }
    await expect(commands.matchSelection(mixedSelection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(mixedSource.getReadCount()).toBe(0)

    const staleSource = createOwnerSourcePort(original, [original], clock)
    staleSource.setBaselineAvailable(false)
    const staleRuntime = createCompositionDependencies(staleSource.port, clock)
    const staleCommands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(
      staleRuntime.dependencies
    )
    await expect(staleCommands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(staleSource.getReadCount()).toBe(0)
    expect(staleRuntime.getResolveCount()).toBe(0)
  })

  it('fails closed on source tuple, profile, or connection-incarnation changes', async () => {
    const { baseline, selection } = createOwnerSelection()
    const changedReads = [
      refreshSnapshot(baseline, (snapshot) => {
        snapshot.source.catalogDigest = 'b'.repeat(64)
      }),
      refreshSnapshot(baseline, (snapshot) => {
        snapshot.source.ledgerEpoch = 'epoch-restarted'
      }),
      refreshSnapshot(baseline, (snapshot) => {
        snapshot.profile.profileVersion = 'different-profile'
      })
    ]
    for (const changed of changedReads) {
      const clock = createOwnerClock()
      const source = createOwnerSourcePort(baseline, [baseline, changed], clock)
      const runtime = createCompositionDependencies(source.port, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

      await expect(commands.matchSelection(selection)).resolves.toMatchObject({
        status: 'unavailable'
      })
      expect(source.getReadCount()).toBe(2)
      expect(runtime.getRevalidationCount()).toBe(0)
    }

    const clock = createOwnerClock()
    const changedLease = createOwnerSourcePort(baseline, [baseline, baseline], clock, {
      connectionIncarnations: ['connection-1', 'connection-restarted']
    })
    const runtime = createCompositionDependencies(changedLease.port, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
    await expect(commands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(changedLease.getReadCount()).toBe(2)
  })

  it('rejects wrong-host, folder, and repository-mismatched references', async () => {
    const variants = [
      makeResidentSnapshot(
        makePositiveTicketWorkspaceSnapshot({ executionHostId: 'ssh:builder' }).snapshot
      ),
      makeResidentSnapshot(makePositiveTicketWorkspaceSnapshot({ folderTarget: true }).snapshot),
      refreshSnapshot(createOwnerSelection().baseline, (snapshot) => {
        const workspace = snapshot.tickets[0]?.workspaces.find(
          (row) => row.repositoryId === 'common-api'
        )
        if (!workspace?.target || workspace.target.kind !== 'git-worktree') {
          throw new Error('Expected local git reference missing.')
        }
        workspace.target.repoId = 'different-repository'
      })
    ]
    for (const baseline of variants) {
      const ticket = baseline.tickets[0]
      const workspace = ticket?.workspaces.find((row) => row.repositoryId === 'common-api')
      if (!ticket || !workspace) {
        throw new Error('Expected local workspace row missing.')
      }
      const selection = {
        snapshotRevision: baseline.snapshotRevision,
        ticketKey: ticket.ticketKey,
        repositoryId: workspace.repositoryId
      }
      const clock = createOwnerClock()
      const source = createOwnerSourcePort(baseline, [baseline], clock)
      const runtime = createCompositionDependencies(source.port, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

      await expect(commands.matchSelection(selection)).resolves.toMatchObject({
        status: 'unavailable'
      })
      expect(runtime.getResolveCount()).toBe(0)
    }
  })

  it('passes one internal abort signal and refuses a non-current binding', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock, {
      ownerCurrent: () => false
    })
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
    const abort = new AbortController()

    await expect(commands.matchSelection(selection, abort.signal)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(source.getReadCount()).toBe(2)
    expect(source.signals[0]).toBe(source.signals[1])
    expect(source.signals[0]).not.toBe(abort.signal)
    expect(source.signals[0]?.aborted).toBe(false)
  })

  it('rejects a displayed baseline retired during final settlement', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    let baselineLookups = 0
    const sourcePort: TicketWorkspaceOwnerSourcePort = {
      readCurrentSnapshot: (signal, budget) => source.port.readCurrentSnapshot(signal, budget),
      isCurrent: (read) => source.port.isCurrent(read),
      getDisplayedBaseline: (revision) => {
        baselineLookups += 1
        const displayed = source.port.getDisplayedBaseline(revision)
        if (baselineLookups === 2) {
          queueMicrotask(() => source.setBaselineAvailable(false))
        }
        return displayed
      }
    }
    const runtime = createCompositionDependencies(sourcePort, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(baselineLookups).toBe(3)
    expect(runtime.getRevalidationCount()).toBe(1)
  })

  it('rejects catalog revision changes during the postbind read', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    let runtime: ReturnType<typeof createCompositionDependencies> | undefined
    const sourcePort: TicketWorkspaceOwnerSourcePort = {
      async readCurrentSnapshot(signal, budget) {
        const read = await source.port.readCurrentSnapshot(signal, budget)
        if (source.getReadCount() === 2) {
          runtime?.setOwnerCatalogRevision(4)
        }
        return read
      },
      isCurrent: (read) => source.port.isCurrent(read),
      getDisplayedBaseline: (revision) => source.port.getDisplayedBaseline(revision)
    }
    runtime = createCompositionDependencies(sourcePort, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(source.getReadCount()).toBe(2)
    expect(runtime.getRevalidationCount()).toBe(1)
  })

  it('rejects currentness loss in the settlement window after the owner check', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    let baselineLookups = 0
    const sourcePort: TicketWorkspaceOwnerSourcePort = {
      readCurrentSnapshot: (signal, budget) => source.port.readCurrentSnapshot(signal, budget),
      isCurrent: (read) => source.port.isCurrent(read),
      getDisplayedBaseline: (revision) => {
        baselineLookups += 1
        const displayed = source.port.getDisplayedBaseline(revision)
        if (baselineLookups === 2) {
          queueMicrotask(() => source.setCurrent(false))
        }
        return displayed
      }
    }
    const runtime = createCompositionDependencies(sourcePort, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(baselineLookups).toBe(2)
  })

  it('rechecks the displayed baseline after asynchronous binding revalidation', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock, {
      ownerCurrent: () => {
        source.setBaselineAvailable(false)
        return true
      }
    })
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(source.getReadCount()).toBe(2)
    expect(runtime.getRevalidationCount()).toBe(1)
  })

  it('never passes a non-finite remaining deadline budget to the source port', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock)
    let clockReads = 0
    const dependencies = {
      ...runtime.dependencies,
      clock: {
        monotonicNow: () => {
          clockReads += 1
          return clockReads === 4 ? Number.NaN : clock.now()
        }
      }
    }
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(source.getReadCount()).toBe(0)
    expect(source.budgets).toEqual([])
  })

  it('floors and caps the remaining read budget after earlier work consumes time', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const sourcePort: TicketWorkspaceOwnerSourcePort = {
      async readCurrentSnapshot(signal, budget) {
        const read = await source.port.readCurrentSnapshot(signal, budget)
        if (source.getReadCount() === 1) {
          clock.advanceBy(22_345.25)
        }
        return read
      },
      isCurrent: (read) => source.port.isCurrent(read),
      getDisplayedBaseline: (revision) => source.port.getDisplayedBaseline(revision)
    }
    const runtime = createCompositionDependencies(sourcePort, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({ status: 'matched' })
    expect(source.budgets).toEqual([10_000, 7_654])
  })

  it('uses the source port currentness gate when a read expires during owner binding', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock, {
      afterResolve: () => {
        const firstRead = source.reads[0]
        if (firstRead) {
          source.revoke(firstRead)
        }
      }
    })
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(source.getReadCount()).toBe(1)
    expect(runtime.getRevalidationCount()).toBe(0)
  })

  it('rejects external cancellation and an already-expired deadline after revalidation', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const cancel = new AbortController()
    const cancelledRuntime = createCompositionDependencies(source.port, clock, {
      ownerCurrent: () => {
        cancel.abort()
        return true
      }
    })
    const cancelledCommands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(
      cancelledRuntime.dependencies
    )
    await expect(cancelledCommands.matchSelection(selection, cancel.signal)).resolves.toMatchObject(
      {
        status: 'unavailable'
      }
    )
    expect(source.signals.every((signal) => signal.aborted)).toBe(true)

    const deadlineClock = createOwnerClock()
    const deadlineSource = createOwnerSourcePort(baseline, [baseline, baseline], deadlineClock)
    const deadlineRuntime = createCompositionDependencies(deadlineSource.port, deadlineClock, {
      ownerCurrent: () => {
        deadlineClock.advanceBy(30_000)
        return true
      }
    })
    const deadlineCommands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(
      deadlineRuntime.dependencies
    )
    await expect(deadlineCommands.matchSelection(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(deadlineSource.getReadCount()).toBe(2)
  })

  it('returns unavailable when a deferred owner revalidation settles after cancellation', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
    const cancel = new AbortController()
    let markRevalidationStarted!: () => void
    let releaseRevalidation!: (current: boolean) => void
    const revalidationStarted = new Promise<void>((resolve) => {
      markRevalidationStarted = resolve
    })
    const runtime = createCompositionDependencies(source.port, clock, {
      ownerCurrent: () => {
        markRevalidationStarted()
        return new Promise<boolean>((resolve) => {
          releaseRevalidation = resolve
        })
      }
    })
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
    const pending = commands.matchSelection(selection, cancel.signal)

    await revalidationStarted
    cancel.abort()
    await expect(pending).resolves.toMatchObject({ status: 'unavailable' })
    releaseRevalidation(true)
    await Promise.resolve()
    expect(source.signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('returns unavailable when the deadline expires during deferred owner revalidation', async () => {
    vi.useFakeTimers()
    try {
      const { baseline, selection } = createOwnerSelection()
      const clock = createOwnerClock()
      const source = createOwnerSourcePort(baseline, [baseline, baseline], clock)
      let markRevalidationStarted!: () => void
      let releaseRevalidation!: (current: boolean) => void
      const revalidationStarted = new Promise<void>((resolve) => {
        markRevalidationStarted = resolve
      })
      const runtime = createCompositionDependencies(source.port, clock, {
        ownerCurrent: () => {
          markRevalidationStarted()
          return new Promise<boolean>((resolve) => {
            releaseRevalidation = resolve
          })
        }
      })
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      const pending = commands.matchSelection(selection)

      await revalidationStarted
      await vi.advanceTimersByTimeAsync(30_000)
      await expect(pending).resolves.toMatchObject({ status: 'unavailable' })
      releaseRevalidation(true)
      await Promise.resolve()
      expect(source.signals.every((signal) => signal.aborted)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts the outer deadline before a stalled first source read', async () => {
    vi.useFakeTimers()
    try {
      const { baseline, selection } = createOwnerSelection()
      const clock = createOwnerClock()
      let releaseRead!: (read: CurrentTicketOwnerRead | null) => void
      let markReadStarted!: (signal: AbortSignal, budget: number) => void
      const readStarted = new Promise<Readonly<{ signal: AbortSignal; budget: number }>>(
        (resolve) => {
          markReadStarted = (signal, budget) => resolve({ signal, budget })
        }
      )
      const sourcePort: TicketWorkspaceOwnerSourcePort = {
        readCurrentSnapshot(signal, deadlineBudgetMs) {
          markReadStarted(signal, deadlineBudgetMs)
          return new Promise((resolve) => {
            releaseRead = resolve
          })
        },
        isCurrent: () => true,
        getDisplayedBaseline: (revision) =>
          revision === baseline.snapshotRevision ? baseline : null
      }
      const runtime = createCompositionDependencies(sourcePort, clock)
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)
      const pending = commands.matchSelection(selection)

      const started = await readStarted
      expect(started.budget).toBe(10_000)
      await vi.advanceTimersByTimeAsync(30_000)
      await expect(pending).resolves.toMatchObject({ status: 'unavailable' })
      expect(started.signal.aborted).toBe(true)
      expect(runtime.getResolveCount()).toBe(0)
      releaseRead(null)
    } finally {
      vi.useRealTimers()
    }
  })
})
