import { describe, expect, it, vi } from 'vitest'
import type { OrchestrationCompatibilityEvidence } from '../../shared/orchestration-compatibility-evidence'
import type { WorkerTerminalHostScope } from '../../shared/worker-terminal-host-scope'
import type {
  OrchestrationCompatibilityCallerAuthority,
  OrchestrationCompatibilityTerminalAuthority
} from './runtime-terminal-contracts'
import {
  readTicketWorkspaceRootRunRuntimeFactsV1,
  type TicketWorkspaceCurrentRootRunV1,
  type TicketWorkspaceRootRunAttestationRuntimeV1
} from './ticket-workspace-root-run-attestation'

const EVIDENCE: OrchestrationCompatibilityEvidence = {
  terminalHandle: 'terminal-1',
  paneKey: 'tab-1:leaf-1',
  launchToken: 'secret-launch-token'
}

const LOCAL_SCOPE: WorkerTerminalHostScope = { kind: 'local', hostId: 'local' }

function callerAuthority(
  hostScope: WorkerTerminalHostScope = LOCAL_SCOPE
): OrchestrationCompatibilityCallerAuthority {
  return {
    hostScope,
    paneKey: 'tab-1:leaf-1',
    terminalHandle: 'terminal-1',
    processIncarnation: 'pty-1:incarnation-1',
    launchTokenHash: 'secret-hash'
  }
}

function dispatchAuthority(
  hostScope: WorkerTerminalHostScope = LOCAL_SCOPE
): OrchestrationCompatibilityTerminalAuthority {
  return {
    runtimeId: 'runtime-1',
    terminalHandle: 'terminal-1',
    ptyId: 'pty-1',
    worktreeId: 'repo-1::worktree-1',
    processIncarnation: 'pty-1:incarnation-1',
    paneKey: 'tab-1:leaf-1',
    launchTokenHash: 'secret-hash',
    hostScope
  }
}

function runRow(
  overrides: Partial<TicketWorkspaceCurrentRootRunV1> = {}
): TicketWorkspaceCurrentRootRunV1 {
  return {
    id: 'run-1',
    legacy: 0,
    coordinator_handle: 'terminal-1',
    coordinator_pane_key: 'tab-1:leaf-1',
    consumer_generation: 3,
    ...overrides
  }
}

function fixture(
  options: {
    caller?: OrchestrationCompatibilityCallerAuthority | null
    dispatch?: OrchestrationCompatibilityTerminalAuthority | null
    runtimeId?: string
    run?: TicketWorkspaceCurrentRootRunV1 | null
    lookupError?: boolean
  } = {}
) {
  const caller = options.caller === undefined ? callerAuthority() : options.caller
  const dispatch = options.dispatch === undefined ? dispatchAuthority() : options.dispatch
  const currentRun = options.run === undefined ? runRow() : options.run
  const verifyOrchestrationCompatibilityCaller = vi.fn(() => caller)
  const getOrchestrationDispatchAuthority = vi.fn(() => dispatch)
  const getRuntimeId = vi.fn(() => options.runtimeId ?? 'runtime-1')
  const runtime: TicketWorkspaceRootRunAttestationRuntimeV1 = {
    verifyOrchestrationCompatibilityCaller,
    getOrchestrationDispatchAuthority,
    getRuntimeId
  }
  const readCurrentRun = vi.fn((_paneKey: string) => {
    if (options.lookupError) {
      throw new Error('synthetic lookup failure')
    }
    return currentRun
  })
  return { runtime, readCurrentRun, verifyOrchestrationCompatibilityCaller }
}

describe('ticket workspace root Run runtime facts', () => {
  it('returns frozen server facts without verifier secrets or options', () => {
    const state = fixture()
    const result = readTicketWorkspaceRootRunRuntimeFactsV1(
      state.runtime,
      EVIDENCE,
      state.readCurrentRun
    )

    expect(result).toEqual({
      verdict: 'available',
      facts: {
        runtimeId: 'runtime-1',
        runId: 'run-1',
        consumerGeneration: 3,
        paneKey: 'tab-1:leaf-1',
        terminalHandle: 'terminal-1',
        processIncarnation: 'pty-1:incarnation-1',
        worktreeId: 'repo-1::worktree-1',
        hostScope: LOCAL_SCOPE
      }
    })
    expect(state.verifyOrchestrationCompatibilityCaller).toHaveBeenCalledExactlyOnceWith(EVIDENCE)
    expect(state.runtime.getOrchestrationDispatchAuthority).toHaveBeenCalledExactlyOnceWith(
      'terminal-1'
    )
    expect(state.readCurrentRun).toHaveBeenCalledExactlyOnceWith('tab-1:leaf-1')
    expect(Object.isFrozen(result)).toBe(true)
    if (result.verdict === 'available') {
      expect(Object.isFrozen(result.facts)).toBe(true)
      expect(Object.isFrozen(result.facts.hostScope)).toBe(true)
      expect(result.facts.hostScope).not.toBe(LOCAL_SCOPE)
      expect(result.facts).not.toHaveProperty('launchToken')
      expect(result.facts).not.toHaveProperty('launchTokenHash')
      expect(result.facts).not.toHaveProperty('executionHostId')
      expect(result.facts).not.toHaveProperty('workspaceRef')
    }
  })

  it('fails closed when the caller verifier returns no authority or throws', () => {
    const missing = fixture({ caller: null })
    expect(
      readTicketWorkspaceRootRunRuntimeFactsV1(missing.runtime, EVIDENCE, missing.readCurrentRun)
    ).toEqual({ verdict: 'unavailable', reasonCode: 'caller_unverified' })

    const thrown = fixture()
    thrown.verifyOrchestrationCompatibilityCaller.mockImplementation(() => {
      throw new Error('synthetic verifier failure')
    })
    expect(
      readTicketWorkspaceRootRunRuntimeFactsV1(thrown.runtime, EVIDENCE, thrown.readCurrentRun)
    ).toEqual({ verdict: 'unavailable', reasonCode: 'caller_unverified' })
  })

  it('requires the same live dispatch identity and host scope', () => {
    const mismatches: OrchestrationCompatibilityTerminalAuthority[] = [
      { ...dispatchAuthority(), runtimeId: 'runtime-2' },
      { ...dispatchAuthority(), terminalHandle: 'terminal-2' },
      { ...dispatchAuthority(), paneKey: 'tab-2:leaf-2' },
      { ...dispatchAuthority(), processIncarnation: 'pty-1:incarnation-2' },
      { ...dispatchAuthority(), hostScope: { kind: 'wsl', hostId: 'local', distro: 'Ubuntu' } },
      { ...dispatchAuthority(), worktreeId: '' }
    ]
    for (const dispatch of mismatches) {
      const state = fixture({ dispatch })
      expect(
        readTicketWorkspaceRootRunRuntimeFactsV1(state.runtime, EVIDENCE, state.readCurrentRun)
      ).toEqual({ verdict: 'unavailable', reasonCode: 'dispatch_mismatch' })
      expect(state.readCurrentRun).not.toHaveBeenCalled()
    }

    const dispatchUnavailable = fixture({ dispatch: null })
    expect(
      readTicketWorkspaceRootRunRuntimeFactsV1(
        dispatchUnavailable.runtime,
        EVIDENCE,
        dispatchUnavailable.readCurrentRun
      )
    ).toEqual({ verdict: 'unavailable', reasonCode: 'dispatch_unavailable' })

    const runtimeMismatch = fixture({ runtimeId: '' })
    expect(
      readTicketWorkspaceRootRunRuntimeFactsV1(
        runtimeMismatch.runtime,
        EVIDENCE,
        runtimeMismatch.readCurrentRun
      )
    ).toEqual({ verdict: 'unavailable', reasonCode: 'dispatch_mismatch' })
  })

  it('requires the current nonlegacy Run to remain bound to the verified caller', () => {
    const unavailable = fixture({ run: null })
    expect(
      readTicketWorkspaceRootRunRuntimeFactsV1(
        unavailable.runtime,
        EVIDENCE,
        unavailable.readCurrentRun
      )
    ).toEqual({ verdict: 'unavailable', reasonCode: 'run_unavailable' })

    const failedLookup = fixture({ lookupError: true })
    expect(
      readTicketWorkspaceRootRunRuntimeFactsV1(
        failedLookup.runtime,
        EVIDENCE,
        failedLookup.readCurrentRun
      )
    ).toEqual({ verdict: 'unavailable', reasonCode: 'run_lookup_failed' })

    const staleRuns: TicketWorkspaceCurrentRootRunV1[] = [
      runRow({ legacy: 1 }),
      runRow({ coordinator_handle: 'terminal-2' }),
      runRow({ coordinator_pane_key: 'tab-2:leaf-2' }),
      runRow({ id: '' })
    ]
    for (const run of staleRuns) {
      const state = fixture({ run })
      expect(
        readTicketWorkspaceRootRunRuntimeFactsV1(state.runtime, EVIDENCE, state.readCurrentRun)
      ).toEqual({ verdict: 'unavailable', reasonCode: 'run_not_current' })
    }

    const remintedLeaf = '22222222-2222-4222-8222-222222222222'
    const paneKey = `tab-2:${remintedLeaf}`
    const remintedCaller = callerAuthority()
    const remintedState = fixture({
      caller: { ...remintedCaller, paneKey },
      dispatch: { ...dispatchAuthority(), paneKey },
      run: runRow({ coordinator_pane_key: `tab-1:${remintedLeaf}` })
    })
    expect(
      readTicketWorkspaceRootRunRuntimeFactsV1(
        remintedState.runtime,
        EVIDENCE,
        remintedState.readCurrentRun
      ).verdict
    ).toBe('available')
  })

  it('rejects invalid generations and preserves server host-scope variants unchanged', () => {
    for (const consumer_generation of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      const invalid = fixture({ run: runRow({ consumer_generation }) })
      expect(
        readTicketWorkspaceRootRunRuntimeFactsV1(invalid.runtime, EVIDENCE, invalid.readCurrentRun)
      ).toEqual({ verdict: 'unavailable', reasonCode: 'run_generation_invalid' })
    }

    const scopes: WorkerTerminalHostScope[] = [
      LOCAL_SCOPE,
      { kind: 'wsl', hostId: 'local', distro: 'Ubuntu-24.04' },
      { kind: 'ssh', targetId: 'connection-1' }
    ]
    for (const hostScope of scopes) {
      const state = fixture({
        caller: callerAuthority(hostScope),
        dispatch: dispatchAuthority(hostScope)
      })
      const result = readTicketWorkspaceRootRunRuntimeFactsV1(
        state.runtime,
        EVIDENCE,
        state.readCurrentRun
      )
      expect(result.verdict).toBe('available')
      if (result.verdict === 'available') {
        expect(result.facts.hostScope).toEqual(hostScope)
        expect(Object.isFrozen(result.facts.hostScope)).toBe(true)
      }
    }
  })
})
