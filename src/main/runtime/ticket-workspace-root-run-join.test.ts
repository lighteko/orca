import { describe, expect, it, vi } from 'vitest'
import type { TicketNavigatorSnapshotV1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { canonicalWorktreeIdentity } from '../../shared/worktree/identity'
import type { WorkerTerminalHostScope } from '../../shared/worker-terminal-host-scope'
import type {
  CurrentTicketOwnerRead,
  TicketWorkspaceOwnerSourcePort
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import type { TicketWorkspaceRootRunAttestationResultV1 } from './ticket-workspace-root-run-attestation'
import type { ExactLocalNativeGitWorktreeBinding } from './runtime-worktree-catalog-binding'
import {
  createLocalNativeWorktreeBindingHarness,
  OWNER_TEST_IDENTITY_KEY,
  OWNER_TEST_INSTANCE_ID,
  OWNER_TEST_REPOSITORY_ID,
  OWNER_TEST_WORKTREE_ID,
  createWorktreeCatalogSourceSnapshot,
  localNativeWorktree,
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
  prepareTicketWorkspaceRootRunCommonJoinV1,
  type TicketWorkspaceRootRunJoinDependenciesV1
} from './ticket-workspace-root-run-join'
import type { CommonJoinDependenciesV1 } from './ticket-workspace-root-run-join-operation'
import {
  runTicketWorkspaceOwnerOperation,
  type TicketWorkspaceOwnerClock
} from './ticket-workspace-live-owner-composition-operation'
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
  differentRepositoryIdentity?: boolean
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
      const worktreeId = options.differentRepositoryIdentity
        ? OWNER_TEST_WORKTREE_ID
        : `${OWNER_TEST_REPOSITORY_ID}::/repo/selected`
      repository.target = {
        schemaVersion: 1,
        kind: 'git-worktree',
        executionHostId: LOCAL_EXECUTION_HOST_ID,
        identityKey: options.differentRepositoryIdentity
          ? 'different-selected-identity'
          : canonicalWorktreeIdentity({
              worktreeId,
              executionHostId: LOCAL_EXECUTION_HOST_ID,
              instanceId: OWNER_TEST_INSTANCE_ID
            }),
        instanceId: OWNER_TEST_INSTANCE_ID,
        worktreeId,
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
  let catalogCurrentChecks = 0
  let onSourceCurrentCheck: ((read: CurrentTicketOwnerRead) => void) | undefined
  let onCatalogCurrentCheck: (() => void) | undefined
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
      onSourceCurrentCheck?.(read)
      const elapsedMs = clock.now() - read.evidence.readStartedAtMonotonicMs
      return elapsedMs >= 0 && elapsedMs < 30_000 && sourceState.port.isCurrent(read)
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
  const worktreeBindings: CommonJoinDependenciesV1['worktreeBindings'] = {
    async resolveExactLocalNativeGitTarget(request, signal) {
      events.push(
        request.worktreeId === OWNER_TEST_WORKTREE_ID ? 'resolve-coordinator' : 'resolve-repository'
      )
      return catalogHarness.commands.resolveExactLocalNativeGitTarget(request, signal)
    },
    async isExactLocalNativeGitBindingCurrent(binding, signal) {
      bindingCurrentCalls += 1
      events.push(`revalidate-${bindingCurrentCalls}`)
      const overridden = await options.ownerCurrent?.(binding, bindingCurrentCalls)
      return (
        overridden ?? catalogHarness.commands.isExactLocalNativeGitBindingCurrent(binding, signal)
      )
    },
    isExactLocalNativeGitBindingCatalogCurrent(binding: ExactLocalNativeGitWorktreeBinding) {
      catalogCurrentChecks += 1
      onCatalogCurrentCheck?.()
      return catalogHarness.commands.isExactLocalNativeGitBindingCatalogCurrent(binding)
    }
  }
  const rootResults: TicketWorkspaceRootRunAttestationResultV1[] = [
    ...(options.rootFacts ?? [Object.freeze({ verdict: 'available' as const, facts: rootFacts() })])
  ]
  let mappedHostScope = options.mapHostScope
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
      return mappedHostScope
        ? mappedHostScope(executionHostId, mapCalls)
        : executionHostId === ORCHESTRATION_HOST_ID
          ? HOST_SCOPE
          : null
    },
    clock: clock.clock
  }
  const commonDependencies: CommonJoinDependenciesV1 = {
    sourcePort,
    worktreeBindings,
    readRootRunFacts: dependencies.readRootRunFacts,
    mapOrchestrationHostScope: dependencies.mapOrchestrationHostScope
  }
  return {
    baseline,
    selection,
    dependencies,
    commonDependencies,
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
    getCatalogCurrentCheckCount: () => catalogCurrentChecks,
    setOnSourceCurrentCheck(hook: ((read: CurrentTicketOwnerRead) => void) | undefined) {
      onSourceCurrentCheck = hook
    },
    setOnCatalogCurrentCheck(hook: (() => void) | undefined) {
      onCatalogCurrentCheck = hook
    },
    setNextRootRunFacts(value: TicketWorkspaceRootRunAttestationResultV1) {
      rootResults.push(value)
    },
    setMapHostScope(value: JoinHarnessOptions['mapHostScope']) {
      mappedHostScope = value
    },
    setOwnerCatalogRevision(revision: number) {
      catalogHarness.setSourceSnapshot(createWorktreeCatalogSourceSnapshot({ revision }))
    },
    setWorktrees(worktrees: ReturnType<typeof localNativeWorktree>[]) {
      catalogHarness.setWorktrees(worktrees)
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

async function prepareCommonJoin(
  state: ReturnType<typeof createJoinHarness>,
  options: Readonly<{
    controller?: AbortController
    clock?: TicketWorkspaceOwnerClock
    advanceBeforeOperationMs?: number
  }> = {}
): Promise<
  Readonly<{
    witness: Awaited<ReturnType<typeof prepareTicketWorkspaceRootRunCommonJoinV1>>
    presentedRead: CurrentTicketOwnerRead
    controller: AbortController
  }>
> {
  const controller = options.controller ?? new AbortController()
  const presentedRead = await state.sourceState.port.readCurrentSnapshot(controller.signal, 10_000)
  if (!presentedRead) {
    throw new Error('Expected the source to admit its original displayed read.')
  }
  if (options.advanceBeforeOperationMs !== undefined) {
    state.clock.advanceBy(options.advanceBeforeOperationMs)
  }
  const witness = await runTicketWorkspaceOwnerOperation(
    state.commonDependencies.sourcePort,
    options.clock ?? state.clock.clock,
    state.selection,
    controller.signal,
    (context) =>
      prepareTicketWorkspaceRootRunCommonJoinV1(state.commonDependencies, {
        selection: state.selection,
        presentedRead,
        context,
        callerSignal: controller.signal
      })
  )
  return Object.freeze({ witness, presentedRead, controller })
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

  it('joins identical complete binding requests once and re-finalizes without another read', async () => {
    const state = createJoinHarness()
    const prepared = await prepareCommonJoin(state)
    expect(prepared.witness).not.toBeNull()
    const reads = state.getReadCount()

    const first = prepared.witness?.finalize()
    const second = prepared.witness?.finalize()

    expect(first).toMatchObject({
      rootRun: { verdict: 'available', runId: 'run-1' },
      selectedRepositoryWorktreeId: OWNER_TEST_WORKTREE_ID
    })
    expect(second).toEqual(first)
    expect(state.events.filter((event) => event.startsWith('resolve-'))).toHaveLength(1)
    expect(state.getBindingCurrentCount()).toBe(2)
    expect(state.getCatalogCurrentCheckCount()).toBe(2)
    expect(state.getReadCount()).toBe(reads)
    expect(reads).toBe(2)
  })

  it('resolves and revalidates distinct coordinator and selected repository bindings', async () => {
    const state = createJoinHarness({ distinctRepositoryTarget: true })
    state.setWorktrees([localNativeWorktree(), localNativeWorktree({ path: '/repo/selected' })])
    const prepared = await prepareCommonJoin(state)

    expect(prepared.witness?.finalize()).toMatchObject({
      rootRun: { verdict: 'available', coordinatorTarget: { worktreeId: OWNER_TEST_WORKTREE_ID } },
      selectedRepositoryWorktreeId: `${OWNER_TEST_REPOSITORY_ID}::/repo/selected`
    })
    expect(state.events.filter((event) => event.startsWith('resolve-'))).toHaveLength(2)
    expect(state.getBindingCurrentCount()).toBe(4)
    expect(state.getCatalogCurrentCheckCount()).toBe(2)
    expect(state.getReadCount()).toBe(2)
  })

  it('does not deduplicate requests that share IDs but differ in identity', async () => {
    const state = createJoinHarness({
      distinctRepositoryTarget: true,
      differentRepositoryIdentity: true
    })
    const prepared = await prepareCommonJoin(state)

    expect(prepared.witness).toBeNull()
    expect(state.events.filter((event) => event.startsWith('resolve-'))).toHaveLength(2)
    expect(state.getReadCount()).toBe(1)
  })

  it.each([
    { validatedFirst: 'coordinator', reverse: false },
    { validatedFirst: 'repository', reverse: true }
  ])(
    'rejects a catalog change to the $validatedFirst binding while the other revalidation waits',
    async ({ reverse }) => {
      let state: ReturnType<typeof createJoinHarness>
      let releasePending!: () => void
      let signalMutation!: () => void
      const mutationComplete = new Promise<void>((resolve) => {
        signalMutation = resolve
      })
      const pendingOther = new Promise<boolean>((resolve) => {
        releasePending = () => resolve(true)
      })
      const firstTarget = reverse
        ? `${OWNER_TEST_REPOSITORY_ID}::/repo/selected`
        : OWNER_TEST_WORKTREE_ID
      state = createJoinHarness({
        distinctRepositoryTarget: true,
        ownerCurrent: (binding, call) => {
          if (call <= 2 || call >= 5) {
            return true
          }
          if (binding.target.worktree.id !== firstTarget) {
            return pendingOther
          }
          return new Promise<boolean>((resolve) => {
            resolve(true)
            queueMicrotask(() => {
              state.setOwnerCatalogRevision(9)
              signalMutation()
            })
          })
        }
      })
      state.setWorktrees([localNativeWorktree(), localNativeWorktree({ path: '/repo/selected' })])
      const preparing = prepareCommonJoin(state)
      await mutationComplete
      releasePending()
      const prepared = await preparing

      expect(prepared.witness).not.toBeNull()
      expect(prepared.witness?.finalize()).toBeNull()
      expect(state.getReadCount()).toBe(2)
    }
  )

  it('rechecks the retained presentation read and original caller after operation cleanup', async () => {
    const state = createJoinHarness()
    const prepared = await prepareCommonJoin(state)
    const reads = state.getReadCount()
    state.sourceState.revoke(prepared.presentedRead)

    expect(prepared.witness?.finalize()).toBeNull()
    expect(state.getReadCount()).toBe(reads)

    const abortedState = createJoinHarness()
    const aborted = await prepareCommonJoin(abortedState)
    const abortedReads = abortedState.getReadCount()
    aborted.controller.abort()
    expect(aborted.witness?.finalize()).toBeNull()
    expect(abortedState.getReadCount()).toBe(abortedReads)
  })

  it.each(['catalog', 'inner-context', 'outer-context'] as const)(
    'rechecks presentation expiry during the final $0 guard',
    async (expiryBoundary) => {
      const state = createJoinHarness()
      let advanceInnerCheck = true
      const clock: TicketWorkspaceOwnerClock = {
        monotonicNow: () => {
          if (
            expiryBoundary === 'inner-context' &&
            state.getCatalogCurrentCheckCount() > 0 &&
            advanceInnerCheck
          ) {
            advanceInnerCheck = false
            state.clock.advanceBy(1)
          }
          return state.clock.now()
        }
      }
      const prepared = await prepareCommonJoin(state, {
        clock,
        advanceBeforeOperationMs: 1_000
      })
      state.clock.advanceBy(28_999)
      let postCatalogPresentationChecks = 0
      state.setOnCatalogCurrentCheck(() =>
        expiryBoundary === 'catalog' ? state.clock.advanceBy(1) : undefined
      )
      state.setOnSourceCurrentCheck((read) => {
        if (
          expiryBoundary === 'outer-context' &&
          read === prepared.presentedRead &&
          state.getCatalogCurrentCheckCount()
        ) {
          if (++postCatalogPresentationChecks === 2) {
            state.clock.advanceBy(1)
          }
        }
      })

      expect(prepared.witness?.finalize()).toBeNull()
      expect([state.getReadCount(), state.getCatalogCurrentCheckCount()]).toEqual([2, 1])
      const presentedStartedAt = prepared.presentedRead.evidence.readStartedAtMonotonicMs
      expect(state.clock.now() - presentedStartedAt).toBe(30_000)
      const operationReads = state.sourceState.reads.slice(1)
      expect(operationReads).toHaveLength(2)
      expect(operationReads.map((read) => read.evidence.readStartedAtMonotonicMs)).toEqual([
        11_000, 11_000
      ])
    }
  )

  it('rechecks original signals after the terminal presentation observation', async () => {
    const state = createJoinHarness()
    const controller = new AbortController()
    const prepared = await prepareCommonJoin(state, { controller })
    state.setOnSourceCurrentCheck((read) => {
      if (state.getCatalogCurrentCheckCount() > 0 && read === prepared.presentedRead) {
        controller.abort()
      }
    })

    expect(prepared.witness?.finalize()).toBeNull()
  })

  it('rejects A1, host-map, baseline, and source changes after witness preparation', async () => {
    const unavailableRun: TicketWorkspaceRootRunAttestationResultV1 = Object.freeze({
      verdict: 'unavailable',
      reasonCode: 'run_unavailable'
    })
    const changedRun = createJoinHarness()
    const runWitness = await prepareCommonJoin(changedRun)
    changedRun.setNextRootRunFacts(unavailableRun)
    expect(runWitness.witness?.finalize()).toBeNull()

    const changedMap = createJoinHarness()
    const mapWitness = await prepareCommonJoin(changedMap)
    changedMap.setMapHostScope(() => null)
    expect(mapWitness.witness?.finalize()).toBeNull()

    const changedBaseline = createJoinHarness()
    const baselineWitness = await prepareCommonJoin(changedBaseline)
    changedBaseline.setDisplayedBaseline(null)
    expect(baselineWitness.witness?.finalize()).toBeNull()

    const changedSource = createJoinHarness()
    const sourceWitness = await prepareCommonJoin(changedSource)
    changedSource.sourceState.setCurrent(false)
    expect(sourceWitness.witness?.finalize()).toBeNull()
  })

  it('rechecks both signals after the final operation clock observation', async () => {
    const state = createJoinHarness()
    const controller = new AbortController()
    let abortOnObservation = false
    const clock: TicketWorkspaceOwnerClock = {
      monotonicNow: () => {
        const now = state.clock.now()
        if (abortOnObservation) {
          abortOnObservation = false
          controller.abort()
        }
        return now
      }
    }
    const prepared = await prepareCommonJoin(state, { controller, clock })
    abortOnObservation = true

    expect(prepared.witness?.finalize()).toBeNull()
  })

  it('preserves the legacy earlier invocation deadline when its wrapper starts later', async () => {
    const state = createJoinHarness({
      ownerCurrent: (_binding, call) => {
        if (call === 2) {
          state.clock.advanceBy(20_001)
        }
        return true
      }
    })
    let clockCalls = 0
    const clock: TicketWorkspaceOwnerClock = {
      monotonicNow: () => {
        clockCalls += 1
        return clockCalls === 1 ? 0 : state.clock.now()
      }
    }

    const result = await createTicketWorkspaceRootRunJoinCandidateV1(
      { ...state.dependencies, clock },
      state.selection
    )

    expect(result.verdict).toBe('unavailable')
    expect(state.getReadCount()).toBe(2)
  })
})
