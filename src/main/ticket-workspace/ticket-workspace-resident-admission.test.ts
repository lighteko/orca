import {
  digestNavigatorSnapshotV1,
  serializeTicketNavigatorSnapshotUtf8V1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { describe, expect, it } from 'vitest'
import { admitTicketWorkspaceResidentSnapshot } from './ticket-workspace-resident-admission'
import { binding } from './ticket-workspace-resident-test-peer'

describe('resident snapshot admission', () => {
  it('accepts exact canonical bytes and the source timestamp interval at an arbitrary clock offset', () => {
    const value = snapshot({ generatedAt: '1900-01-01T00:00:00.000Z' })
    const bytes = Buffer.from(serializeTicketNavigatorSnapshotUtf8V1(value), 'utf8')

    expect(admitTicketWorkspaceResidentSnapshot(bytes, binding, value.source.ledgerEpoch)).toEqual({
      status: 'accepted',
      snapshot: value
    })
  })

  it.each([
    { name: 'fatal UTF-8', bytes: () => Buffer.from([0xc3, 0x28]), reason: 'invalid_utf8' },
    {
      name: 'noncanonical JSON bytes',
      bytes: () => Buffer.from(`${serializeTicketNavigatorSnapshotUtf8V1(snapshot())} `, 'utf8'),
      reason: 'noncanonical_bytes'
    },
    {
      name: 'snapshot digest mismatch',
      bytes: () => {
        const value = snapshot()
        return Buffer.from(
          serializeTicketNavigatorSnapshotUtf8V1({ ...value, snapshotRevision: '0'.repeat(64) }),
          'utf8'
        )
      },
      reason: 'invalid_snapshot'
    },
    { name: 'resident byte cap', bytes: () => Buffer.alloc(2_097_153), reason: 'byte_limit' }
  ])('rejects $name before source admission', ({ bytes, reason }) => {
    const value = snapshot()
    expect(
      admitTicketWorkspaceResidentSnapshot(bytes(), binding, value.source.ledgerEpoch)
    ).toMatchObject({ status: 'rejected', reason })
  })

  it.each([
    {
      name: 'expected service release',
      value: () => snapshot({ producerVersion: 'different-release' }),
      reason: 'producer_mismatch'
    },
    {
      name: 'bound authority',
      value: () => snapshot({ authorityId: 'different-authority' }),
      reason: 'binding_mismatch'
    },
    {
      name: 'bound epoch',
      value: () => snapshot({ ledgerEpoch: 'different-epoch' }),
      reason: 'binding_mismatch'
    },
    {
      name: 'profile tuple',
      value: () => snapshot({ profileId: 'different-profile' }),
      reason: 'binding_mismatch'
    },
    {
      name: 'projection sequence',
      value: () => snapshot({ projectionSequence: 1 }),
      reason: 'producer_policy'
    },
    {
      name: 'matched reference',
      value: () => snapshot({ referenceState: 'matched' }),
      reason: 'producer_policy'
    },
    {
      name: 'producer actions',
      value: () => snapshot({ withActions: true }),
      reason: 'producer_policy'
    },
    {
      name: 'timestamp interval',
      value: () => snapshot({ staleAfter: '2026-01-01T00:01:01.000Z' }),
      reason: 'timestamp_policy'
    }
  ])('rejects $name before source admission', ({ value, reason }) => {
    const candidate = value()
    const bytes = Buffer.from(serializeTicketNavigatorSnapshotUtf8V1(candidate), 'utf8')
    expect(admitTicketWorkspaceResidentSnapshot(bytes, binding, 'epoch-a')).toMatchObject({
      status: 'rejected',
      reason
    })
  })

  it('rejects the whole mixed snapshot when any ticket is unsupported', () => {
    const value = snapshot({ unsupportedTicket: true })
    const bytes = Buffer.from(serializeTicketNavigatorSnapshotUtf8V1(value), 'utf8')

    expect(admitTicketWorkspaceResidentSnapshot(bytes, binding, value.source.ledgerEpoch)).toEqual({
      status: 'unsupported'
    })
  })
})

type SnapshotChanges = Readonly<{
  authorityId?: string
  catalogDigest?: string
  generatedAt?: string
  ledgerEpoch?: string
  ledgerRevision?: number
  producerVersion?: string
  profileId?: string
  projectionSequence?: number
  referenceState?: 'unavailable' | 'matched' | 'unsupported'
  staleAfter?: string
  unsupportedTicket?: boolean
  withActions?: boolean
}>

function snapshot(changes: SnapshotChanges = {}): TicketNavigatorSnapshotV1 {
  const generatedAt = changes.generatedAt ?? '2026-01-01T00:00:00.000Z'
  const value: TicketNavigatorSnapshotV1 = {
    schemaId: 'ticket-navigator-snapshot',
    schemaVersion: 1,
    producer: {
      name: 'ticket-workspace',
      version: changes.producerVersion ?? binding.expectedService.releaseId,
      contractVersion: 1
    },
    profile: {
      profileId: changes.profileId ?? binding.profile.profileId,
      schemaVersion: binding.profile.schemaVersion,
      profileVersion: binding.profile.profileVersion
    },
    generatedAt,
    staleAfter: changes.staleAfter ?? new Date(Date.parse(generatedAt) + 60_000).toISOString(),
    snapshotRevision: '0'.repeat(64),
    source: {
      authorityId: changes.authorityId ?? binding.authorityId,
      ledgerEpoch: changes.ledgerEpoch ?? 'epoch-a',
      ledgerRevision: changes.ledgerRevision ?? 7,
      projectionSequence: changes.projectionSequence ?? 0,
      catalogDigest: changes.catalogDigest ?? 'a'.repeat(64)
    },
    tickets:
      changes.unsupportedTicket === true || changes.referenceState || changes.withActions === true
        ? [
            {
              ticketKey: 'SEL-1',
              label: 'Ticket 1',
              lifecycle: 'ready',
              availability: changes.unsupportedTicket === true ? 'unsupported' : 'available',
              orchestration: {
                executionHostId: 'wsl:machine-a:distro-a',
                runId: 'run-1',
                dispatchIds: [],
                requestIds: []
              },
              enrichment: { issue: 'unknown', mergeRequests: 'unknown' },
              actions:
                changes.withActions === true
                  ? [
                      {
                        action: 'refresh',
                        label: 'Refresh',
                        risk: 'read-only',
                        requiresConfirmation: false,
                        enabled: true
                      }
                    ]
                  : [],
              workspaces:
                changes.referenceState || changes.withActions === true
                  ? [
                      {
                        repositoryId: 'repo-1',
                        label: 'Repo 1',
                        role: 'isolated',
                        actualState: 'ready',
                        referenceState: changes.referenceState ?? 'unavailable',
                        actions: []
                      }
                    ]
                  : []
            }
          ]
        : []
  }
  return { ...value, snapshotRevision: digestNavigatorSnapshotV1(value) }
}
