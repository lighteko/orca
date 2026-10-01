import {
  digestNavigatorSnapshotV1,
  serializeTicketNavigatorSnapshotUtf8V1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  binding,
  parseProtectedRequestId,
  protectedFrames,
  randomSource,
  setupKey,
  ScriptedDuplex,
  snapshotMessages,
  sourceBoundWire,
  vector
} from './ticket-workspace-resident-test-peer'
import { connectTicketWorkspaceResidentSourceAdapter } from './ticket-workspace-resident-source-adapter'
import { TicketWorkspaceResidentHighWater } from './ticket-workspace-resident-high-water'
import { MemoryResidentSourceHighWaterStore } from './ticket-workspace-resident-high-water-test-store'

type SnapshotChanges = Readonly<{
  catalogDigest?: string
  generatedAt?: string
  ledgerRevision?: number
  unsupportedTicket?: boolean
}>

export function snapshot(changes: SnapshotChanges = {}): TicketNavigatorSnapshotV1 {
  const value: TicketNavigatorSnapshotV1 = {
    schemaId: 'ticket-navigator-snapshot',
    schemaVersion: 1,
    producer: {
      name: 'ticket-workspace',
      version: binding.expectedService.releaseId,
      contractVersion: 1
    },
    profile: { ...binding.profile },
    generatedAt: changes.generatedAt ?? '2026-01-01T00:00:00.000Z',
    staleAfter: changes.generatedAt
      ? new Date(Date.parse(changes.generatedAt) + 60_000).toISOString()
      : '2026-01-01T00:01:00.000Z',
    snapshotRevision: '0'.repeat(64),
    source: {
      authorityId: binding.authorityId,
      ledgerEpoch: 'epoch-a',
      ledgerRevision: changes.ledgerRevision ?? 7,
      projectionSequence: 0,
      catalogDigest: changes.catalogDigest ?? 'a'.repeat(64)
    },
    tickets:
      changes.unsupportedTicket === true
        ? [
            {
              ticketKey: 'SEL-1',
              label: 'Unsupported ticket',
              lifecycle: 'ready',
              availability: 'unsupported',
              orchestration: {
                executionHostId: 'wsl:machine-a:distro-a',
                runId: 'run-1',
                dispatchIds: [],
                requestIds: []
              },
              enrichment: { issue: 'unknown', mergeRequests: 'unknown' },
              workspaces: [],
              actions: []
            }
          ]
        : []
  }
  return { ...value, snapshotRevision: digestNavigatorSnapshotV1(value) }
}

export async function connectSource(
  snapshots: TicketNavigatorSnapshotV1[],
  now: () => number,
  suspendGeneration: () => number,
  getDisplayedSnapshotRevision: () => string | null,
  store = new MemoryResidentSourceHighWaterStore(),
  beforeSnapshotResponse?: (highWater: TicketWorkspaceResidentHighWater) => void
) {
  let sequence = 1
  let nextSnapshotIndex = 0
  let responseHighWater: TicketWorkspaceResidentHighWater | undefined
  const duplex = new ScriptedDuplex((index, frame, push) => {
    if (index === 0) {
      push(Buffer.from(vector.hello.serverHello.wireHex, 'hex'))
    }
    if (index === 2) {
      push(sourceBoundWire)
    }
    if (index >= 3) {
      if (!responseHighWater) {
        throw new Error('Resident high-water manager is not ready')
      }
      beforeSnapshotResponse?.(responseHighWater)
      const value = snapshots[nextSnapshotIndex]
      if (!value) {
        throw new Error('No synthetic resident snapshot remains')
      }
      nextSnapshotIndex += 1
      const frames = protectedFrames(
        snapshotMessages(
          Buffer.from(serializeTicketNavigatorSnapshotUtf8V1(value), 'utf8'),
          parseProtectedRequestId(frame)
        ),
        sequence
      )
      sequence += frames.length
      for (const responseFrame of frames) {
        push(responseFrame)
      }
    }
  })
  const highWater = new TicketWorkspaceResidentHighWater(store, {
    authorizeFirstAdoption: async () => true,
    authorizeRebind: async () => true,
    authorizeRecovery: async () => true
  })
  responseHighWater = highWater
  const connected = await connectTicketWorkspaceResidentSourceAdapter({
    duplex,
    setupKey,
    expectedBinding: binding,
    highWater,
    clock: { now, suspendGeneration },
    getDisplayedSnapshotRevision,
    randomBytes: randomSource()
  })
  if (connected.status !== 'connected') {
    throw new Error(`Resident source setup failed: ${connected.reason}`)
  }
  return { source: connected.source, duplex, store, highWater }
}

export function sourceLeaseIdentity(): string {
  return JSON.stringify([
    binding.expectedService.releaseId,
    binding.expectedService.artifactSha256,
    vector.inputs.connectionIncarnation
  ])
}
