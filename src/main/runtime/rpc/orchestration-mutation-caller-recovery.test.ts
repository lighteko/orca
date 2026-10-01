import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../orca-runtime'
import { OrchestrationDb } from '../orchestration/db'
import type { RpcRequest } from './core'
import { OrchestrationMutationExecutor } from './orchestration-mutation-executor'
import { createWorkerCallerPayloadIdentity } from './orchestration-mutation-payload-identity'

const leafId = '11111111-1111-4111-8111-111111111111'
const targetLeafId = '22222222-2222-4222-8222-222222222222'
const differentLeafId = '33333333-3333-4333-8333-333333333333'

function request(method: string, requestId: string, params: unknown): RpcRequest {
  return {
    id: `rpc-${requestId}`,
    authToken: 'token',
    method,
    orchestrationRequestId: requestId,
    params
  }
}

function createHarness(dbPath: string = ':memory:') {
  const db = new OrchestrationDb(dbPath)
  const runtime = new OrcaRuntimeService()
  runtime.setOrchestrationDb(db)
  let defaultPaneKey: string | null = `tab-1:${leafId}`
  const paneKeys = new Map<string, string | null>()
  vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) => {
    const boundPaneKey = paneKeys.get(handle)
    return boundPaneKey === undefined ? defaultPaneKey : boundPaneKey
  })
  return {
    db,
    runtime,
    executor: new OrchestrationMutationExecutor(runtime),
    bindHandle: (handle: string, paneKey: string | null) => paneKeys.set(handle, paneKey),
    bindPane: (paneKey: string | null) => {
      defaultPaneKey = paneKey
    }
  }
}

function acceptedInvoke(harness: ReturnType<typeof createHarness>) {
  return vi.fn(
    async (mutation?: { identity: Parameters<OrchestrationDb['beginMutationReceipt']>[0] }) => {
      if (mutation) {
        harness.db.beginMutationReceipt(mutation.identity)
      }
      return { dispatchId: 'dispatch-1' }
    }
  )
}

function seedPending(
  harness: ReturnType<typeof createHarness>,
  requestId: string,
  params: unknown,
  legacy = false
) {
  const method = 'orchestration.workerStart'
  const payload = createWorkerCallerPayloadIdentity(harness.runtime, method, params)
  const identity = {
    callerFingerprint: harness.db.getOrCreateLocalMutationCallerFingerprint(),
    requestId,
    method,
    payloadHash: legacy ? payload.stableHash : payload.payloadHash
  }
  harness.db.beginMutationReceipt(identity)
  harness.db.checkpointPendingMutationReceipt({
    ...identity,
    receipt: JSON.stringify({ accepted: { dispatchId: 'dispatch-1' } })
  })
  return identity
}

describe('worker-start caller recovery', () => {
  const databases: OrchestrationDb[] = []
  const tempDirs: string[] = []

  afterEach(() => {
    for (const db of databases.splice(0)) {
      db.close()
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
    vi.restoreAllMocks()
  })

  it.each(['pending', 'completed'] as const)(
    'recovers a %s receipt after DB reopen when pane lookup is lost',
    async (state) => {
      const dir = mkdtempSync(join(tmpdir(), 'orca-worker-caller-recovery-'))
      tempDirs.push(dir)
      const dbPath = join(dir, 'orchestration.db')
      const initial = createHarness(dbPath)
      databases.push(initial.db)
      const params = { from: 'term-original', taskId: 'task-1' }
      const requestId = `restart-${state}`
      if (state === 'pending') {
        seedPending(initial, requestId, params)
      } else {
        await initial.executor.run(
          request('orchestration.workerStart', requestId, params),
          params,
          acceptedInvoke(initial)
        )
      }
      initial.db.close()
      databases.splice(databases.indexOf(initial.db), 1)

      const resumed = createHarness(dbPath)
      databases.push(resumed.db)
      resumed.bindPane(null)
      const invoke = vi.fn()
      const replay = resumed.executor.run(
        request('orchestration.workerStart', requestId, params),
        params,
        invoke
      )

      await (state === 'pending'
        ? expect(replay).rejects.toMatchObject({
            code: 'operation_unknown',
            data: { dispatchId: 'dispatch-1' }
          })
        : expect(replay).resolves.toMatchObject({
            dispatchId: 'dispatch-1',
            mutation: { replayed: true }
          }))
      expect(invoke).not.toHaveBeenCalled()
    }
  )

  it.each(['pending', 'completed'] as const)(
    'rejects a %s receipt when one binding changes leaf and another lookup is lost',
    async (state) => {
      const harness = createHarness()
      databases.push(harness.db)
      const params = { from: 'caller-old', terminal: 'target-old', taskId: 'task-1' }
      harness.bindHandle('caller-old', `caller-tab:${leafId}`)
      harness.bindHandle('target-old', `target-tab:${targetLeafId}`)
      const requestId = `partial-different-${state}`
      if (state === 'pending') {
        seedPending(harness, requestId, params)
      } else {
        await harness.executor.run(
          request('orchestration.workerStart', requestId, params),
          params,
          acceptedInvoke(harness)
        )
      }

      harness.bindHandle('caller-old', `other-tab:${differentLeafId}`)
      harness.bindHandle('target-old', null)
      const invoke = vi.fn()
      await expect(
        new OrchestrationMutationExecutor(harness.runtime).run(
          request('orchestration.workerStart', requestId, params),
          params,
          invoke
        )
      ).rejects.toMatchObject({ code: 'request_mismatch' })
      expect(invoke).not.toHaveBeenCalled()
    }
  )

  it.each(['pending', 'completed'] as const)(
    'recovers a %s receipt with a reminted same-leaf binding and one lost lookup',
    async (state) => {
      const harness = createHarness()
      databases.push(harness.db)
      const initialParams = { from: 'caller-old', terminal: 'target-old', taskId: 'task-1' }
      harness.bindHandle('caller-old', `caller-tab:${leafId}`)
      harness.bindHandle('target-old', `target-tab:${targetLeafId}`)
      const requestId = `partial-same-${state}`
      if (state === 'pending') {
        seedPending(harness, requestId, initialParams)
      } else {
        await harness.executor.run(
          request('orchestration.workerStart', requestId, initialParams),
          initialParams,
          acceptedInvoke(harness)
        )
      }

      const replayParams = { ...initialParams, from: 'caller-reminted' }
      harness.bindHandle('caller-reminted', `new-tab:${leafId}`)
      harness.bindHandle('target-old', null)
      const invoke = vi.fn()
      const replay = new OrchestrationMutationExecutor(harness.runtime).run(
        request('orchestration.workerStart', requestId, replayParams),
        replayParams,
        invoke
      )
      await (state === 'pending'
        ? expect(replay).rejects.toMatchObject({
            code: 'operation_unknown',
            data: { dispatchId: 'dispatch-1' }
          })
        : expect(replay).resolves.toMatchObject({
            dispatchId: 'dispatch-1',
            mutation: { replayed: true }
          }))
      expect(invoke).not.toHaveBeenCalled()
    }
  )

  it('keeps a legacy receipt compatible without granting lookup-loss recovery', async () => {
    const harness = createHarness()
    databases.push(harness.db)
    const params = { from: 'term-original', taskId: 'task-1' }
    seedPending(harness, 'legacy-pending', params, true)

    harness.bindPane(`tab-2:${leafId}`)
    await expect(
      new OrchestrationMutationExecutor(harness.runtime).run(
        request('orchestration.workerStart', 'legacy-pending', params),
        params,
        vi.fn()
      )
    ).rejects.toMatchObject({ code: 'operation_unknown' })

    harness.bindPane(null)
    await expect(
      new OrchestrationMutationExecutor(harness.runtime).run(
        request('orchestration.workerStart', 'legacy-pending', params),
        params,
        vi.fn()
      )
    ).rejects.toMatchObject({ code: 'request_mismatch' })
  })

  it('keeps caller fingerprints isolated for the same request ID', async () => {
    const harness = createHarness()
    databases.push(harness.db)
    const params = { from: 'term-original', taskId: 'task-1' }
    const invoke = acceptedInvoke(harness)

    await harness.executor.run(
      request('orchestration.workerStart', 'caller-isolation', params),
      params,
      invoke,
      'caller-a'
    )
    await harness.executor.run(
      request('orchestration.workerStart', 'caller-isolation', params),
      params,
      invoke,
      'caller-b'
    )
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('rejects reuse of a request ID with a different method', async () => {
    const harness = createHarness()
    databases.push(harness.db)
    const params = { from: 'term-original', taskId: 'task-1' }
    const invoke = acceptedInvoke(harness)

    await harness.executor.run(
      request('orchestration.workerStart', 'method-change', params),
      params,
      invoke
    )
    await expect(
      harness.executor.run(
        request('orchestration.federationAttachStart', 'method-change', params),
        params,
        invoke
      )
    ).rejects.toMatchObject({ code: 'request_mismatch' })
    expect(invoke).toHaveBeenCalledOnce()
  })
})
