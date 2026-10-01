import { beforeEach, describe, expect, it, vi } from 'vitest'
import snapshotCorpus from '@lighteko/ticket-workspace-contracts/fixtures/ticket-navigator-snapshot-v1.corpus.json' with { type: 'json' }
import {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1,
  validateTicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  createTicketWorkspaceFixtureWireResponse,
  TICKET_WORKSPACE_FIXTURE_CHANNEL
} from '../../shared/ticket-workspace-fixture-boundary'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
const fixtureContract = {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  maxUtf8Bytes: TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1
}

vi.mock('electron', () => ({ ipcRenderer: { invoke: mocks.invoke } }))

const { ticketWorkspaceFixtureApi } = await import('./ticket-workspace-fixture-bridge')

describe('ticket workspace fixture preload bridge', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
  })

  it('validates and projects the canonical fixture without ticket targets or actions', async () => {
    const wireResponse = await fixtureWireResponse()
    mocks.invoke.mockResolvedValue(wireResponse)

    const result = await ticketWorkspaceFixtureApi.getSnapshot()

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(TICKET_WORKSPACE_FIXTURE_CHANNEL)
    expect(result.status).toBe('fixture')
    if (result.status !== 'fixture') {
      throw new Error('Fixture was unexpectedly unavailable')
    }
    expect(result.orcaMatch).toEqual({ status: 'not-evaluated' })
    expect(result.tickets).toHaveLength(1)
    expect(result.tickets[0]?.workspaces[0]).toMatchObject({
      repositoryId: 'common-api',
      role: 'isolated'
    })
    expect(result.tickets[0]?.workspaces[0]).not.toHaveProperty('target')
    expect(result.tickets[0]?.workspaces[0]).not.toHaveProperty('referenceState')
    expect(result.tickets[0]).not.toHaveProperty('actions')
    expect(result.tickets[0]).not.toHaveProperty('coordinatorTarget')
    expect(JSON.stringify(result)).not.toMatch(/path|token|runId|dispatchIds|requestIds/i)
  })

  it('isolates invalid, oversized and unavailable main responses', async () => {
    const response = await fixtureWireResponse()
    if (!('payloadUtf8' in response)) {
      throw new Error('Fixture source failed validation')
    }
    const invalidPayload = '{"unknown":true}'
    mocks.invoke.mockResolvedValueOnce({
      ...response,
      payloadUtf8: invalidPayload,
      provenance: {
        ...response.provenance,
        payloadUtf8Bytes: new TextEncoder().encode(invalidPayload).byteLength
      }
    })
    await expect(ticketWorkspaceFixtureApi.getSnapshot()).resolves.toMatchObject({
      status: 'unavailable',
      scope: 'tickets-only',
      orcaMatch: { status: 'not-evaluated' }
    })

    const oversizedPayload = '\uAC00'.repeat(700_000)
    mocks.invoke.mockResolvedValueOnce({
      ...response,
      payloadUtf8: oversizedPayload,
      provenance: {
        ...response.provenance,
        payloadUtf8Bytes: new TextEncoder().encode(oversizedPayload).byteLength
      }
    })
    await expect(ticketWorkspaceFixtureApi.getSnapshot()).resolves.toMatchObject({
      status: 'unavailable',
      scope: 'tickets-only'
    })

    mocks.invoke.mockResolvedValueOnce({
      status: 'unavailable',
      contractVersion: 1,
      artifactDigest: 'invalid',
      reason: 'transport_error'
    })
    await expect(ticketWorkspaceFixtureApi.getSnapshot()).resolves.toMatchObject({
      status: 'unavailable',
      scope: 'tickets-only'
    })
  })

  it('returns bounded unavailable when the main IPC invocation rejects', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('private transport detail'))

    await expect(ticketWorkspaceFixtureApi.getSnapshot()).resolves.toEqual({
      status: 'unavailable',
      scope: 'tickets-only',
      provenance: { kind: 'fixture' },
      orcaMatch: { status: 'not-evaluated' }
    })
  })
})

function fixtureWireResponse() {
  const validation = validateTicketNavigatorSnapshotV1(snapshotCorpus.bases['snapshot.full'])
  if (validation.schemaVerdict !== 'accepted') {
    throw new Error('Canonical fixture failed semantic validation')
  }
  return createTicketWorkspaceFixtureWireResponse(validation.value, fixtureContract)
}
