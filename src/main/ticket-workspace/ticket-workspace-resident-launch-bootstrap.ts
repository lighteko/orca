import { isAbsolute } from 'node:path'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'
import { isRecord } from './ticket-workspace-resident-protocol'
import {
  parseTicketResidentCanonicalJson,
  ticketResidentCanonicalJson
} from './ticket-workspace-resident-canonical'

export const TICKET_RESIDENT_LAUNCH_MAX_BYTES = 4_096
export const TICKET_RESIDENT_STARTUP_MAX_MS = 10_000
export const TICKET_RESIDENT_SETUP_PHASE_MAX_MS = 5_000

type LaunchBootstrap = {
  contract: 'ticket.navigator.resident.launch'
  version: 1
  type: 'bootstrap'
  remainingStartupMs: number
  binding: TicketResidentBinding
  setupKey: string
  allowedOrchestrationIds: string[]
  allowedReferenceHostIds: string[]
}

export function sortedResidentLaunchIdentifiers(values: readonly string[]): string[] | null {
  if (!Array.isArray(values) || values.length > TICKET_RESIDENT_LAUNCH_MAX_BYTES) {
    return null
  }
  const sorted = [...values]
  if (sorted.some((value) => !isResidentLaunchIdentifier(value))) {
    return null
  }
  sorted.sort()
  return sorted.some((value, index) => index > 0 && sorted[index - 1] === value) ? null : sorted
}

export function isResidentLaunchIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    Buffer.byteLength(value, 'utf8') <= 255
  )
}

export function isAbsoluteResidentHostPath(value: string): boolean {
  return value.length > 0 && !value.includes('\0') && isAbsolute(value)
}

export function isAbsoluteResidentGuestPath(value: string): boolean {
  return value.startsWith('/') && !value.includes('\0')
}

export function encodeResidentLaunchBootstrap(
  binding: TicketResidentBinding,
  allowedOrchestrationIds: string[],
  allowedReferenceHostIds: string[],
  setupKey: Buffer,
  remainingStartupMs: number
): Buffer {
  const message: LaunchBootstrap = {
    contract: 'ticket.navigator.resident.launch',
    version: 1,
    type: 'bootstrap',
    remainingStartupMs,
    binding,
    setupKey: setupKey.toString('base64url'),
    allowedOrchestrationIds,
    allowedReferenceHostIds
  }
  const body = Buffer.from(ticketResidentCanonicalJson(message), 'utf8')
  if (body.byteLength < 1 || body.byteLength > TICKET_RESIDENT_LAUNCH_MAX_BYTES) {
    throw new Error('Resident launch frame outside limit')
  }
  const prefix = Buffer.allocUnsafe(4)
  prefix.writeUInt32BE(body.byteLength)
  return Buffer.concat([prefix, body])
}

export function parseResidentLaunchReady(body: Buffer): number {
  const value: unknown = parseTicketResidentCanonicalJson(body)
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    !Object.hasOwn(value, 'contract') ||
    !Object.hasOwn(value, 'version') ||
    !Object.hasOwn(value, 'type') ||
    !Object.hasOwn(value, 'remainingSetupMs') ||
    value.contract !== 'ticket.navigator.resident.launch' ||
    value.version !== 1 ||
    value.type !== 'ready' ||
    typeof value.remainingSetupMs !== 'number' ||
    !Number.isSafeInteger(value.remainingSetupMs) ||
    value.remainingSetupMs < 1 ||
    value.remainingSetupMs > TICKET_RESIDENT_SETUP_PHASE_MAX_MS
  ) {
    throw new Error('Invalid resident launch ready frame')
  }
  return value.remainingSetupMs
}
