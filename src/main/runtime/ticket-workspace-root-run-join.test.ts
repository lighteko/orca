import { describe, expect, it, vi } from 'vitest'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { WorkerTerminalHostScope } from '../../shared/worker-terminal-host-scope'
import type { TicketWorkspaceOwnerSourcePort } from '../ticket-workspace/ticket-workspace-resident-source-port'
import type { TicketWorkspaceRootRunAttestationResultV1 } from './ticket-workspace-root-run-attestation'
import type { ExactLocalNativeGitWorktreeBinding } from './runtime-worktree-catalog-binding'
import {
  createLocalNativeWorktreeBindingHarness,
  OWNER_TEST_IDENTITY_KEY,
  OWNER_TEST_INSTANCE_ID,
  OWNER_TEST_REPOSITORY_ID,
  OWNER_TEST_WORKTREE_ID,
  createWorktreeCatalogSourceSnapshot,
  makePositiveTicketWorkspaceSnapshot
} from './__fixtures__/ticket-workspace-owner-fixtures'
import {
  createOwnerClock,
  createOwnerSourcePort,
  makeResidentSnapshot,
  refreshSnapshot
} from './ticket-workspace-live-owner-composition-test-support'
import {
  createTicketWorkspaceRootRunJoinCandidateV1,
  type TicketWorkspaceRootRunJoinDependenciesV1
} from './ticket-workspace-root-run-join'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'

const HOST_SCOPE: WorkerTerminalHostScope = Object.freeze({
  kind: 'local',
  hostId: LOCAL_EXECUTION_HOST_ID
})
const ORCHESTRATION_HOST_ID = 'orchestration-host-1'

function rootFacts(overrides: Partial<RootFacts> = {}): RootFacts {
  return {
    runtimeId: 'runtime-1',
    runId: 'run-1',
    consumerGeneration: 4,
    paneKey: 'tab-1:leaf-1',
    terminalHandle: 'terminal-1',
    processIncarnation: 'process-1',
    worktreeId: OWNER_TEST_WORKTREE_ID,
    hostScope: HOST_SCOPE,
    ...overrides
  }
}

type RootFacts = Extract<
  TicketWorkspaceRootRunAttestationResultV1,
  { verdict: 'available' }
>['facts']

type JoinHarnessOptions = Readonly<{
  snapshots?: (baseline: TicketNavigatorSnapshotV1) => readonly TicketNavigatorSnapshotV1[]
  rootFacts?: readonly TicketWorkspaceRootRunAttestationResultV1[]
  mapHostScope?: (executionHostId: string, call: number) => WorkerTerminalHostScope | null
  ownerCurrent?: (
    binding: ExactLocalNativeGitWorktreeBinding,
    call: number
  ) => boolean | Promise<boolean>
  afterRead?: (readNumber: number) => void
  onBaselineRead?: (
    call: number,
    baseline: TicketNavigatorSnapshotV1
  ) => TicketNavigatorSnapshotV1 | null
  distinctRepositoryTarget?: boolean
}>

function createJoinHarness(options: JoinHarnessOptions = {}) {
  const { snapshot: fixtureSnapshot, selector } = makePositiveTicketWorkspaceSnapshot({
    referenceState: 'matched'
  })
  const baseSnapshot = refreshSnapshot(fixtureSnapshot, (snapshot) => {
    const ticket = snapshot.tickets.find((row) => row.ticketKey === selector.ticketKey)
    const repository = ticket?.workspaces.find((row) => row.repositoryId === selector.repositoryId)
    if (!ticket || !repository) {
      throw new Error('Expected ticket and repository fixtures.')
    }
    ticket.orchestration.executionHostId = ORCHESTRATION_HOST_ID
    ticket.orchestration.runId = 'run-1'
    ticket.coordinatorTarget = {
      schemaVersion: 1,
      kind: 'git-worktree',
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      identityKey: OWNER_TEST_IDENTITY_KEY,
      instanceId: OWNER_TEST_INSTANCE_ID,
      worktreeId: OWNER_TEST_WORKTREE_ID,
      repoId: OWNER_TEST_REPOSITORY_ID
    }
    if (options.distinctRepositoryTarget) {
      repository.target = {
        schemaVersion: 1,
        kind: 'git-worktree',
        executionHostId: LOCAL_EXECUTION_HOST_ID,
        identityKey: 'selected-repository-identity',
        instanceId: OWNER_TEST_INSTANCE_ID,
        worktreeId: `${OWNER_TEST_REPOSITORY_ID}::/repo/selected`,
        repoId: OWNER_TEST_REPOSITORY_ID
      }
    }
  })
  const baseline = makeResidentSnapshot(baseSnapshot)
  const selection: TicketWorkspaceOwnerSelection = Object.freeze({
    ...selector,
    snapshotRevision: baseline.snapshotRevision
  })
  const clock = createOwnerClock()
  const sourceState = createOwnerSourcePort(
    baseline,
    options.snapshots?.(baseline) ?? [baseline, baseline],
    clock
  )
  const events: string[] = []
  let readCount = 0
  let baselineCalls = 0
  let rootFactsCall = 0
  let mapCalls = 0
  let bindingCurrentCalls = 0
  let displayedBaseline: TicketNavigatorSnapshotV1 | null = baseline
  const sourcePort: TicketWorkspaceOwnerSourcePort = {
    async readCurrentSnapshot(signal, deadlineBudgetMs) {
      const read = await sourceState.port.readCurrentSnapshot(signal, deadlineBudgetMs)
      readCount += 1
      events.push(`read-${readCount}`)
      options.afterRead?.(readCount)
      return read
    },
    isCurrent(read) {
      return sourceState.port.isCurrent(read)
    },
    getDisplayedBaseline(snapshotRevision) {
      baselineCalls += 1
      if (snapshotRevision !== selection.snapshotRevision || !displayedBaseline) {
        return null
      }
      return options.onBaselineRead
        ? options.onBaselineRead(baselineCalls, displayedBaseline)
        : displayedBaseline
    }
  }
  const catalogHarness = createLocalNativeWorktreeBindingHarness()
  const worktreeBindings: TicketWorkspaceRootRunJoinDependenciesV1['worktreeBindings'] = {
    async resolveExactLocalNativeGitTarget(request, signal) {
      events.push('resolve-coordinator')
      return catalogHarness.commands.resolveExactLocalNativeGitTarget(request, signal)
    },
    async isExactLocalNativeGitBindingCurrent(binding, signal) {
      bindingCurrentCalls += 1
      events.push(`revalidate-${bindingCurrentCalls}`)
      const overridden = await options.ownerCurrent?.(binding, bindingCurrentCalls)
      return (
        overridden ?? catalogHarness.commands.isExactLocalNativeGitBindingCurrent(binding, signal)
      )
    }
  }
  const rootResults: TicketWorkspaceRootRunAttestationResultV1[] = [
    ...(options.rootFacts ?? [Object.freeze({ verdict: 'available' as const, facts: rootFacts() })])
  ]
  const dependencies: TicketWorkspaceRootRunJoinDependenciesV1 = {
    sourcePort,
    worktreeBindings,
    readRootRunFacts: vi.fn(() => {
      rootFactsCall += 1
      return (
        rootResults.shift() ?? Object.freeze({ verdict: 'available' as const, facts: rootFacts() })
      )
    }),
    mapOrchestrationHostScope: (executionHostId) => {
      mapCalls += 1
      return options.mapHostScope
        ? options.mapHostScope(executionHostId, mapCalls)
        : executionHostId === ORCHESTRATION_HOST_ID
          ? HOST_SCOPE
          : null
    },
    clock: clock.clock
  }
  return {
    baseline,
    selection,
    dependencies,
    events,
    sourceState,
    clock,
    setDisplayedBaseline(value: TicketNavigatorSnapshotV1 | null) {
      displayedBaseline = value ?? baseline
      if (value === null) {
        displayedBaseline = null
      }
    },
    getReadCount: () => readCount,
    getBindingCurrentCount: () => bindingCurrentCalls,
    getBaselineCallCount: () => baselineCalls,
    getRootFactsCallCount: () => rootFactsCall,
    getMapCallCount: () => mapCalls,
    setOwnerCatalogRevision(revision: number) {
      catalogHarness.setSourceSnapshot(createWorktreeCatalogSourceSnapshot({ revision }))
    }
  }
}

function refreshTime(
  snapshot: TicketNavigatorSnapshotV1,
  seconds: number
): TicketNavigatorSnapshotV1 {
  return refreshSnapshot(snapshot, (next) => {
    next.generatedAt = `2001-01-01T00:00:${String(seconds).padStart(2, '0')}.000Z`
    next.staleAfter = `2001-01-01T00:01:${String(seconds).padStart(2, '0')}.000Z`
  })
}

function changedRunId(snapshot: TicketNavigatorSnapshotV1): TicketNavigatorSnapshotV1 {
  return refreshSnapshot(snapshot, (next) => {
    const ticket = next.tickets[0]
    if (!ticket) {
      throw new Error('Expected a ticket fixture.')
    }
    ticket.orchestration.runId = 'different-run'
  })
}

describe('ticket workspace root Run join candidate', () => {
  it('brackets coordinator binding with fresh reads and allows timestamp-only snapshot regeneration', async () => {
    const state = createJoinHarness({
      distinctRepositoryTarget: true,
      snapshots: (baseline) => [refreshTime(baseline, 10), refreshTime(baseline, 20)]
    })

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result).toMatchObject({
      verdict: 'available',
      displayedSnapshotRevision: state.selection.snapshotRevision,
      ticketKey: state.selection.ticketKey,
      repositoryId: state.selection.repositoryId,
      runId: 'run-1',
      consumerGeneration: 4,
      coordinatorTarget: { worktreeId: OWNER_TEST_WORKTREE_ID },
      repositoryTarget: { worktreeId: `${OWNER_TEST_REPOSITORY_ID}::/repo/selected` }
    })
    expect(state.events).toEqual([
      'read-1',
      'resolve-coordinator',
      'revalidate-1',
      'read-2',
      'revalidate-2'
    ])
    expect(state.dependencies.readRootRunFacts).toHaveBeenCalledTimes(2)
    expect(state.sourceState.budgets).toEqual([10_000, 10_000])
    expect(result).not.toHaveProperty('binding')
  })

  it('rejects a V1 run or coordinator change between reads even when the source tuple is reused', async () => {
    const state = createJoinHarness({
      snapshots: (baseline) => [baseline, changedRunId(baseline)]
    })

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.getReadCount()).toBe(2)
    expect(state.getBindingCurrentCount()).toBe(1)
  })

  it('rejects source and owner-lease changes across the two admitted reads', async () => {
    const { baseline } = createJoinHarness()
    const changedSource = refreshSnapshot(baseline, (snapshot) => {
      snapshot.source.ledgerRevision += 1
    })
    const state = createJoinHarness({ snapshots: () => [baseline, changedSource] })

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.getReadCount()).toBe(2)
    expect(state.getBindingCurrentCount()).toBe(1)
  })

  it('rejects a coordinator reference change before publishing a candidate', async () => {
    const { baseline } = createJoinHarness()
    const changedCoordinator = refreshSnapshot(baseline, (snapshot) => {
      const ticket = snapshot.tickets[0]
      if (!ticket?.coordinatorTarget || ticket.coordinatorTarget.kind !== 'git-worktree') {
        throw new Error('Expected a Git coordinator reference.')
      }
      ticket.coordinatorTarget = { ...ticket.coordinatorTarget, worktreeId: 'other::/root' }
    })
    const state = createJoinHarness({ snapshots: () => [baseline, changedCoordinator] })

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.getBindingCurrentCount()).toBe(1)
  })

  it('requires a present local Git coordinator reference matching the current Run worktree', async () => {
    const { baseline } = createJoinHarness()
    const invalidRefs = [
      refreshSnapshot(baseline, (snapshot) => {
        const ticket = snapshot.tickets[0]
        if (!ticket) {
          throw new Error('Expected a ticket fixture.')
        }
        ticket.coordinatorTarget = undefined
      }),
      refreshSnapshot(baseline, (snapshot) => {
        const ticket = snapshot.tickets[0]
        if (!ticket) {
          throw new Error('Expected a ticket fixture.')
        }
        ticket.coordinatorTarget = {
          schemaVersion: 1,
          kind: 'folder',
          executionHostId: LOCAL_EXECUTION_HOST_ID,
          repoId: OWNER_TEST_REPOSITORY_ID
        }
      }),
      refreshSnapshot(baseline, (snapshot) => {
        const ticket = snapshot.tickets[0]
        if (!ticket?.coordinatorTarget || ticket.coordinatorTarget.kind !== 'git-worktree') {
          throw new Error('Expected a Git coordinator reference.')
        }
        ticket.availability = 'unsupported'
        ticket.coordinatorTarget = {
          ...ticket.coordinatorTarget,
          executionHostId: 'ssh:host-1'
        }
      }),
      refreshSnapshot(baseline, (snapshot) => {
        const ticket = snapshot.tickets[0]
        if (!ticket?.coordinatorTarget || ticket.coordinatorTarget.kind !== 'git-worktree') {
          throw new Error('Expected a Git coordinator reference.')
        }
        ticket.coordinatorTarget = {
          ...ticket.coordinatorTarget,
          worktreeId: 'other::/root'
        }
      })
    ]

    for (const invalid of invalidRefs) {
      const state = createJoinHarness({ snapshots: () => [invalid, invalid] })
      const result = await createTicketWorkspaceRootRunJoinCandidateV1(
        state.dependencies,
        state.selection
      )
      expect(result.verdict).toBe('unavailable')
      expect(state.getReadCount()).toBe(1)
      expect(state.events).toEqual(['read-1'])
    }
  })

  it('requires the catalog orchestration run and trusted full host-scope mapping to match A1', async () => {
    const wrongRun = createJoinHarness({
      snapshots: (baseline) => [changedRunId(baseline), changedRunId(baseline)]
    })
    const wrongRunResult = await createTicketWorkspaceRootRunJoinCandidateV1(
      wrongRun.dependencies,
      wrongRun.selection
    )
    expect(wrongRunResult.verdict).toBe('unavailable')
    expect(wrongRun.getReadCount()).toBe(1)

    const wrongHost = createJoinHarness({
      mapHostScope: () => ({
        kind: 'wsl',
        hostId: LOCAL_EXECUTION_HOST_ID,
        distro: 'Ubuntu-24.04'
      })
    })
    const wrongHostResult = await createTicketWorkspaceRootRunJoinCandidateV1(
      wrongHost.dependencies,
      wrongHost.selection
    )
    expect(wrongHostResult.verdict).toBe('unavailable')
    expect(wrongHost.getReadCount()).toBe(0)
  })

  it('requires the selected repository row to remain independently eligible', async () => {
    const { baseline } = createJoinHarness()
    const excluded = refreshSnapshot(baseline, (snapshot) => {
      const ticket = snapshot.tickets[0]
      const workspace = ticket?.workspaces[0]
      if (!workspace) {
        throw new Error('Expected a repository fixture.')
      }
      workspace.role = 'excluded'
    })
    const state = createJoinHarness({ snapshots: () => [excluded, excluded] })

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.getReadCount()).toBe(1)
    expect(state.getBindingCurrentCount()).toBe(0)
  })

  it('rechecks the original coordinator binding after the second read', async () => {
    let state: ReturnType<typeof createJoinHarness>
    state = createJoinHarness({
      afterRead: (readNumber) => {
        if (readNumber === 2) {
          state.setOwnerCatalogRevision(4)
        }
      }
    })
    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.getReadCount()).toBe(2)
  })

  it('rejects owner replacement reported by the second exact-current check', async () => {
    const state = createJoinHarness({ ownerCurrent: (_binding, call) => call === 1 })

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.events).toEqual([
      'read-1',
      'resolve-coordinator',
      'revalidate-1',
      'read-2',
      'revalidate-2'
    ])
  })

  it('rechecks A1 facts and the host mapping after the operation wrapper settles', async () => {
    const initialFacts = rootFacts()
    const changedFacts = rootFacts({ consumerGeneration: 5 })
    const changedRun = createJoinHarness({
      rootFacts: [
        { verdict: 'available', facts: initialFacts },
        { verdict: 'available', facts: changedFacts }
      ]
    })
    const runResult = await createTicketWorkspaceRootRunJoinCandidateV1(
      changedRun.dependencies,
      changedRun.selection
    )
    expect(runResult.verdict).toBe('unavailable')
    expect(changedRun.getRootFactsCallCount()).toBe(2)

    const changedMapping = createJoinHarness({
      mapHostScope: (_executionHostId, call) => (call < 5 ? HOST_SCOPE : null)
    })
    const mappingResult = await createTicketWorkspaceRootRunJoinCandidateV1(
      changedMapping.dependencies,
      changedMapping.selection
    )
    expect(mappingResult.verdict).toBe('unavailable')
    expect(changedMapping.getMapCallCount()).toBeGreaterThanOrEqual(5)
  })

  it('fails closed when the displayed baseline disappears during final settlement', async () => {
    let state: ReturnType<typeof createJoinHarness>
    state = createJoinHarness({
      onBaselineRead: (call, baseline) => (call >= 4 ? null : baseline)
    })

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      state.dependencies,
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.getBaselineCallCount()).toBeGreaterThanOrEqual(4)
  })

  it('rejects an expired or cancelled operation without returning a candidate', async () => {
    const expired = createJoinHarness({
      ownerCurrent: (_binding, call) => {
        if (call === 1) {
          expired.clock.advanceBy(30_001)
        }
        return true
      }
    })
    const expiredResult = await createTicketWorkspaceRootRunJoinCandidateV1(
      expired.dependencies,
      expired.selection
    )
    expect(expiredResult.verdict).toBe('unavailable')
    expect(expired.getReadCount()).toBe(1)

    const cancelled = createJoinHarness()
    const controller = new AbortController()
    controller.abort()
    const cancelledResult = await createTicketWorkspaceRootRunJoinCandidateV1(
      cancelled.dependencies,
      cancelled.selection,
      controller.signal
    )
    expect(cancelledResult.verdict).toBe('unavailable')
    expect(cancelled.getReadCount()).toBe(0)
  })
})
