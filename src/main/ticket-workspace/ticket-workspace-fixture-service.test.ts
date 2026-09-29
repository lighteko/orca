import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  projectTicketWorkspaceFixtureResponse,
  TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION
} from '../../shared/ticket-workspace-fixture-boundary'
import { createTicketWorkspaceFixtureService } from './ticket-workspace-fixture-service'

describe('ticket workspace fixture service', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns only fixture presentation data and reloads the canonical snapshot for selectors', async () => {
    const loadPayloadUtf8 = vi.fn(async () => await fixturePayload())
    const service = createTicketWorkspaceFixtureService({ loadPayloadUtf8 })
    const wireResponse = await service.getFixtureWireResponse()
    const contract = await import('@lighteko/ticket-workspace-contracts/navigator-snapshot-v1')
    const presentation = projectTicketWorkspaceFixtureResponse(wireResponse, {
      parseTicketNavigatorSnapshotUtf8V1: contract.parseTicketNavigatorSnapshotUtf8V1,
      serializeTicketNavigatorSnapshotUtf8V1: contract.serializeTicketNavigatorSnapshotUtf8V1,
      maxUtf8Bytes: contract.TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1
    })

    expect(presentation.status).toBe('fixture')
    if (presentation.status !== 'fixture') {
      throw new Error('Fixture was unexpectedly unavailable')
    }
    expect(presentation.provenance).toEqual({
      kind: 'fixture',
      snapshotCaseId: 'accepted-full-snapshot',
      snapshotRevision: TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION
    })
    expect(presentation.orcaMatch).toEqual({ status: 'not-evaluated' })
    expect(presentation.tickets.length).toBeGreaterThan(0)
    expect(presentation.tickets[0]).toHaveProperty('coordinatorTargetDeclared')
    expect(presentation.tickets[0]).not.toHaveProperty('coordinatorTarget')
    expect(presentation.tickets[0]).not.toHaveProperty('actions')
    expect(presentation.tickets[0]?.workspaces[0]).not.toHaveProperty('target')
    expect(presentation.tickets[0]?.workspaces[0]).not.toHaveProperty('referenceState')
    expect(JSON.stringify(presentation)).not.toMatch(/path|token|runId|dispatchIds|requestIds/i)

    const snapshot = await service.loadValidatedFixture(TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION)
    expect(snapshot?.snapshotRevision).toBe(TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION)
    expect(await service.loadValidatedFixture('0'.repeat(64))).toBeNull()
    expect(loadPayloadUtf8).toHaveBeenCalledTimes(2)
  })

  it('does not keep a fixture cache that can mask a later invalid source', async () => {
    const payload = await fixturePayload()
    const loadPayloadUtf8 = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(payload)
      .mockResolvedValueOnce('{"unknown":true}')
    const service = createTicketWorkspaceFixtureService({ loadPayloadUtf8 })

    expect(await service.getFixtureWireResponse()).toMatchObject({
      provenance: { kind: 'fixture' }
    })
    expect(await service.getFixtureWireResponse()).toMatchObject({ status: 'unavailable' })
    expect(loadPayloadUtf8).toHaveBeenCalledTimes(2)
  })

  it('times out and discards a late source response', async () => {
    const payload = await fixturePayload()
    vi.useFakeTimers()
    let finishSource: ((result: unknown) => void) | undefined
    const service = createTicketWorkspaceFixtureService({
      loadPayloadUtf8: () =>
        new Promise((resolve) => {
          finishSource = resolve
        }),
      timeoutMs: 20
    })
    const request = service.getFixtureWireResponse()
    await vi.advanceTimersByTimeAsync(20)

    await expect(request).resolves.toMatchObject({ status: 'unavailable' })
    finishSource?.(payload)
    await Promise.resolve()
  })

  it('discards work across service restart and integration disable', async () => {
    const payload = await fixturePayload()
    let finishFirstLoad: ((result: unknown) => void) | undefined
    const loadPayloadUtf8 = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstLoad = resolve
          })
      )
      .mockResolvedValue(payload)
    const service = createTicketWorkspaceFixtureService({ loadPayloadUtf8 })
    const beforeRestart = service.getFixtureWireResponse()
    service.restart()
    finishFirstLoad?.(payload)
    await expect(beforeRestart).resolves.toMatchObject({ status: 'unavailable' })
    expect(await service.getFixtureWireResponse()).toMatchObject({
      provenance: { kind: 'fixture' }
    })

    service.disable()
    await expect(service.getFixtureWireResponse()).resolves.toMatchObject({ status: 'unavailable' })
    expect(
      await service.loadValidatedFixture(TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION)
    ).toBeNull()
    service.restart()
    expect(await service.getFixtureWireResponse()).toMatchObject({
      provenance: { kind: 'fixture' }
    })
  })

  it('isolates service instances and only returns a fixture under its pinned provenance', async () => {
    const payload = await fixturePayload()
    const fixtureService = createTicketWorkspaceFixtureService({
      loadPayloadUtf8: async () => payload
    })
    const unavailableService = createTicketWorkspaceFixtureService({
      loadPayloadUtf8: async () => '{"snapshotRevision":"foreign"}'
    })

    expect(await fixtureService.getFixtureWireResponse()).toMatchObject({
      provenance: { kind: 'fixture' }
    })
    expect(await unavailableService.getFixtureWireResponse()).toMatchObject({
      status: 'unavailable'
    })
  })
})

async function fixturePayload(): Promise<string> {
  const response = await createTicketWorkspaceFixtureService().getFixtureWireResponse()
  if (!('payloadUtf8' in response)) {
    throw new Error('Fixture source failed validation')
  }
  return response.payloadUtf8
}
