import { describe, expect, it } from 'vitest'
import type { NativeGitOperationMarkerCapture } from '../git/native-git-operation-marker-capture'
import type { NativeGitWorktreeStatusRecordCapture } from '../git/native-worktree-status-record-capture'
import type { TicketWorkspaceOwnerSourcePort } from '../ticket-workspace/ticket-workspace-resident-source-port'
import { RuntimeTicketWorkspaceLiveOwnerCompositionCommands } from './ticket-workspace-live-owner-composition'
import {
  completeCapture,
  createCompositionDependencies,
  createOwnerClock,
  createOwnerSelection,
  createOwnerSourcePort
} from './ticket-workspace-live-owner-composition-test-support'

describe('RuntimeTicketWorkspaceLiveOwnerCompositionCommands evidence', () => {
  it('brackets complete native evidence with three reads and preserves the capture owner stamps', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline, baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock, {
      capture: (binding) => {
        expect(source.getReadCount()).toBe(2)
        return completeCapture(binding)
      }
    })
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    const result = await commands.captureStatusEvidence(selection)

    expect(result).toMatchObject({
      status: 'captured',
      snapshotRevision: selection.snapshotRevision,
      ticketKey: selection.ticketKey,
      repositoryId: selection.repositoryId,
      observationId: 'owner-observation-1',
      ownerReadStartedAt: 1_800_000_000_000,
      statusCapture: {
        executionRoute: 'native',
        complete: true,
        rawRecordCount: 0,
        representedRecordCount: 0,
        unsupportedRecordCount: 0
      },
      operationMarkers: { complete: true, filesystemRoute: 'native' }
    })
    expect(source.getReadCount()).toBe(3)
    expect(source.signals[0]).toBe(source.signals[1])
    expect(source.signals[1]).toBe(source.signals[2])
    expect(source.budgets).toEqual([10_000, 10_000, 10_000])
    expect(runtime.getRevalidationCount()).toBe(1)
    expect(result).not.toHaveProperty('clear')
  })

  it('rejects every incomplete status or marker capture after the third source read', async () => {
    const incomplete = [
      (capture: ReturnType<typeof completeCapture>) => {
        capture.status.complete = false
      },
      (capture: ReturnType<typeof completeCapture>) => {
        capture.status.unsupportedRecordCount = 1
      },
      (capture: ReturnType<typeof completeCapture>) => {
        capture.status.representedRecordCount = 1
      },
      (capture: ReturnType<typeof completeCapture>) => {
        capture.operationMarkers.complete = false
      },
      (capture: ReturnType<typeof completeCapture>) => {
        capture.operationMarkers.markers.mergeHead = 'unavailable'
      }
    ]

    for (const update of incomplete) {
      const { baseline, selection } = createOwnerSelection()
      const clock = createOwnerClock()
      const source = createOwnerSourcePort(baseline, [baseline, baseline, baseline], clock)
      const runtime = createCompositionDependencies(source.port, clock, {
        capture: (binding) => {
          const capture = completeCapture(binding)
          update(capture)
          return capture
        }
      })
      const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

      await expect(commands.captureStatusEvidence(selection)).resolves.toMatchObject({
        status: 'unavailable'
      })
      expect(source.getReadCount()).toBe(3)
      expect(runtime.getRevalidationCount()).toBe(1)
    }
  })

  it('rejects catalog replacement during the third source read', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline, baseline], clock)
    let runtime: ReturnType<typeof createCompositionDependencies> | undefined
    const sourcePort: TicketWorkspaceOwnerSourcePort = {
      async readCurrentSnapshot(signal, budget) {
        const read = await source.port.readCurrentSnapshot(signal, budget)
        if (source.getReadCount() === 3) {
          runtime?.setOwnerCatalogRevision(4)
        }
        return read
      },
      isCurrent: (read) => source.port.isCurrent(read),
      getDisplayedBaseline: (revision) => source.port.getDisplayedBaseline(revision)
    }
    runtime = createCompositionDependencies(sourcePort, clock)
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.captureStatusEvidence(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(source.getReadCount()).toBe(3)
    expect(runtime.getRevalidationCount()).toBe(1)
  })

  it('rejects an outer-deadline expiry during capture', async () => {
    const { baseline, selection } = createOwnerSelection()
    const lateClock = createOwnerClock()
    const lateSource = createOwnerSourcePort(baseline, [baseline, baseline], lateClock)
    const lateRuntime = createCompositionDependencies(lateSource.port, lateClock, {
      capture: (binding) => {
        lateClock.advanceBy(30_000)
        return completeCapture(binding)
      }
    })
    const lateCommands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(
      lateRuntime.dependencies
    )
    await expect(lateCommands.captureStatusEvidence(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(lateSource.getReadCount()).toBe(2)
    expect(lateRuntime.getRevalidationCount()).toBe(0)
  })

  it('fails closed when a status marker is unavailable even if another marker is present', async () => {
    const { baseline, selection } = createOwnerSelection()
    const clock = createOwnerClock()
    const source = createOwnerSourcePort(baseline, [baseline, baseline, baseline], clock)
    const runtime = createCompositionDependencies(source.port, clock, {
      capture: (binding) => {
        const capture = completeCapture(binding)
        const operationMarkers: NativeGitOperationMarkerCapture = {
          ...capture.operationMarkers,
          complete: false,
          markers: {
            ...capture.operationMarkers.markers,
            mergeHead: 'present',
            cherryPickHead: 'unavailable'
          }
        }
        const statusCapture: NativeGitWorktreeStatusRecordCapture = capture.status
        return { ...capture, operationMarkers, status: statusCapture }
      }
    })
    const commands = new RuntimeTicketWorkspaceLiveOwnerCompositionCommands(runtime.dependencies)

    await expect(commands.captureStatusEvidence(selection)).resolves.toMatchObject({
      status: 'unavailable'
    })
    expect(source.getReadCount()).toBe(3)
  })
})
