import snapshotCorpus from '@lighteko/ticket-workspace-contracts/fixtures/ticket-navigator-snapshot-v1.corpus.json' with { type: 'json' }
import {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1,
  validateTicketNavigatorSnapshotV1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  createTicketWorkspaceFixtureWireResponse,
  projectTicketWorkspaceFixtureResponse,
  TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION,
  unavailableTicketWorkspaceFixtureWireResponse,
  type TicketWorkspaceFixtureWireResponse
} from '../../shared/ticket-workspace-fixture-boundary'

const DEFAULT_FIXTURE_LOAD_TIMEOUT_MS = 1_000
const SNAPSHOT_FULL_BASE_ID = 'snapshot.full'
const fixtureContract = {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  maxUtf8Bytes: TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1
}

export type LoadValidatedTicketWorkspaceFixture = (
  snapshotRevision: string
) => Promise<TicketNavigatorSnapshotV1 | null>

export type TicketWorkspaceFixtureService = {
  getFixtureWireResponse: () => Promise<TicketWorkspaceFixtureWireResponse>
  loadValidatedFixture: LoadValidatedTicketWorkspaceFixture
  restart: () => void
  disable: () => void
}

export type TicketWorkspaceFixtureServiceOptions = {
  loadPayloadUtf8?: () => Promise<unknown>
  timeoutMs?: number
}

export function createTicketWorkspaceFixtureService(
  options: TicketWorkspaceFixtureServiceOptions = {}
): TicketWorkspaceFixtureService {
  const loadPayloadUtf8 = options.loadPayloadUtf8 ?? loadActiveFixturePayloadUtf8
  const timeoutMs = validTimeout(options.timeoutMs)
  let generation = 0
  let enabled = true

  return {
    getFixtureWireResponse: async () => {
      const readGeneration = generation
      const snapshot = await loadValidatedSnapshot()
      if (!isActive(readGeneration) || snapshot === null) {
        return unavailableTicketWorkspaceFixtureWireResponse()
      }
      const response = createTicketWorkspaceFixtureWireResponse(snapshot, fixtureContract)
      return projectTicketWorkspaceFixtureResponse(response, fixtureContract).status === 'fixture'
        ? response
        : unavailableTicketWorkspaceFixtureWireResponse()
    },
    loadValidatedFixture: async (snapshotRevision) => {
      if (snapshotRevision !== TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION) {
        return null
      }
      const readGeneration = generation
      const snapshot = await loadValidatedSnapshot()
      if (!isActive(readGeneration) || snapshot?.snapshotRevision !== snapshotRevision) {
        return null
      }
      return snapshot
    },
    restart: () => {
      generation += 1
      enabled = true
    },
    disable: () => {
      generation += 1
      enabled = false
    }
  }

  async function loadValidatedSnapshot(): Promise<TicketNavigatorSnapshotV1 | null> {
    if (!enabled) {
      return null
    }
    const payloadUtf8 = await readPayloadWithinDeadline(loadPayloadUtf8, timeoutMs)
    if (!enabled || payloadUtf8 === null) {
      return null
    }
    const parsed = parseTicketNavigatorSnapshotUtf8V1(payloadUtf8)
    if (
      parsed.schemaVerdict !== 'accepted' ||
      parsed.value.snapshotRevision !== TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION ||
      serializeTicketNavigatorSnapshotUtf8V1(parsed.value) !== payloadUtf8 ||
      new TextEncoder().encode(payloadUtf8).byteLength > TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1
    ) {
      return null
    }
    return parsed.value
  }

  function isActive(readGeneration: number): boolean {
    return enabled && generation === readGeneration
  }
}

const ticketWorkspaceFixtureService = createTicketWorkspaceFixtureService()

export function getTicketWorkspaceFixtureWireResponse(): Promise<TicketWorkspaceFixtureWireResponse> {
  return ticketWorkspaceFixtureService.getFixtureWireResponse()
}

export const loadValidatedFixture: LoadValidatedTicketWorkspaceFixture = (snapshotRevision) =>
  ticketWorkspaceFixtureService.loadValidatedFixture(snapshotRevision)

function loadActiveFixturePayloadUtf8(): Promise<string | null> {
  const base = readSnapshotFullBase(snapshotCorpus)
  if (base === null) {
    return Promise.resolve(null)
  }
  const validation = validateTicketNavigatorSnapshotV1(base)
  if (
    validation.schemaVerdict !== 'accepted' ||
    validation.value.snapshotRevision !== TICKET_WORKSPACE_FIXTURE_SNAPSHOT_REVISION
  ) {
    return Promise.resolve(null)
  }
  return Promise.resolve(serializeTicketNavigatorSnapshotUtf8V1(validation.value))
}

async function readPayloadWithinDeadline(
  loadPayload: () => Promise<unknown>,
  timeoutMs: number
): Promise<string | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(null), timeoutMs)
  })
  try {
    const result = await Promise.race([Promise.resolve().then(loadPayload), timeout])
    return typeof result === 'string' ? result : null
  } catch {
    return null
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle)
    }
  }
}

function readSnapshotFullBase(corpus: unknown): unknown {
  if (!isRecord(corpus) || !isRecord(corpus.bases)) {
    return null
  }
  return Object.hasOwn(corpus.bases, SNAPSHOT_FULL_BASE_ID)
    ? corpus.bases[SNAPSHOT_FULL_BASE_ID]
    : null
}

function validTimeout(timeoutMs: number | undefined): number {
  return Number.isSafeInteger(timeoutMs) && timeoutMs !== undefined && timeoutMs > 0
    ? Math.min(timeoutMs, DEFAULT_FIXTURE_LOAD_TIMEOUT_MS)
    : DEFAULT_FIXTURE_LOAD_TIMEOUT_MS
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
