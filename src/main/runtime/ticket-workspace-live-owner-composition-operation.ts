import type {
  CurrentTicketOwnerRead,
  TicketWorkspaceOwnerSourcePort
} from '../ticket-workspace/ticket-workspace-resident-source-port'
import {
  isAdmittedCurrentOwnerRead,
  sameOwnerReadFacts,
  sameSelectedOwnerFacts
} from './ticket-workspace-live-owner-composition-policy'
import type { TicketWorkspaceOwnerSelection } from './ticket-workspace-owner-selection'

const OWNER_JOIN_DEADLINE_MS = 30_000
const SOURCE_READ_BUDGET_MS = 10_000
const OWNER_JOIN_TIMED_OUT = Symbol('ticket-workspace-owner-join-timed-out')

export type TicketWorkspaceOwnerClock = Readonly<{ monotonicNow(): number }>

export type TicketWorkspaceOwnerOperationContext = Readonly<{
  signal: AbortSignal
  reads: CurrentTicketOwnerRead[]
  check(): boolean
  readCurrent(): Promise<CurrentTicketOwnerRead | null>
}>

export async function runTicketWorkspaceOwnerOperation<Result extends object>(
  sourcePort: TicketWorkspaceOwnerSourcePort,
  clock: TicketWorkspaceOwnerClock,
  selection: TicketWorkspaceOwnerSelection,
  signal: AbortSignal | undefined,
  operation: (context: TicketWorkspaceOwnerOperationContext) => Promise<Result | null>
): Promise<Result | null> {
  let startedAt: number
  try {
    startedAt = clock.monotonicNow()
  } catch {
    return null
  }
  const deadlineAt = startedAt + OWNER_JOIN_DEADLINE_MS
  if (!Number.isFinite(startedAt) || !Number.isFinite(deadlineAt)) {
    return null
  }

  const controller = new AbortController()
  let settleStopped!: () => void
  const stopped = new Promise<typeof OWNER_JOIN_TIMED_OUT>((resolve) => {
    settleStopped = () => resolve(OWNER_JOIN_TIMED_OUT)
  })
  const stop = (): void => {
    controller.abort()
    settleStopped()
  }
  const onAbort = (): void => stop()
  const timer = setTimeout(stop, OWNER_JOIN_DEADLINE_MS)
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) {
    stop()
  }

  const reads: CurrentTicketOwnerRead[] = []
  const check = (): boolean => {
    if (controller.signal.aborted) {
      return false
    }
    let now: number
    try {
      now = clock.monotonicNow()
    } catch {
      stop()
      return false
    }
    if (!Number.isFinite(now) || now < startedAt || now >= deadlineAt) {
      stop()
      return false
    }
    for (const read of reads) {
      if (!isCurrentRead(read, sourcePort, startedAt, now)) {
        stop()
        return false
      }
    }
    return true
  }
  const readCurrent = async (): Promise<CurrentTicketOwnerRead | null> => {
    if (!check()) {
      return null
    }
    let now: number
    try {
      now = clock.monotonicNow()
    } catch {
      stop()
      return null
    }
    if (!Number.isFinite(now) || now < startedAt || now >= deadlineAt) {
      stop()
      return null
    }
    const remaining = Math.floor(Math.min(SOURCE_READ_BUDGET_MS, deadlineAt - now))
    if (
      !Number.isFinite(remaining) ||
      !Number.isInteger(remaining) ||
      remaining < 1 ||
      remaining > SOURCE_READ_BUDGET_MS
    ) {
      stop()
      return null
    }

    let read: CurrentTicketOwnerRead | null
    try {
      read = await sourcePort.readCurrentSnapshot(controller.signal, remaining)
    } catch {
      stop()
      return null
    }
    let readCompletedAt: number
    try {
      readCompletedAt = clock.monotonicNow()
    } catch {
      stop()
      return null
    }
    if (
      !read ||
      !isAdmittedCurrentOwnerRead(read) ||
      !check() ||
      !isCurrentRead(read, sourcePort, startedAt, readCompletedAt)
    ) {
      if (!controller.signal.aborted) {
        stop()
      }
      return null
    }
    const firstRead = reads[0]
    if (firstRead && !sameOwnerReadFacts(firstRead, read, selection)) {
      stop()
      return null
    }
    reads.push(read)
    if (!check()) {
      return null
    }
    return read
  }
  const context: TicketWorkspaceOwnerOperationContext = {
    signal: controller.signal,
    reads,
    check,
    readCurrent
  }

  const pending = Promise.resolve()
    .then(() => operation(context))
    .catch(() => null)
  try {
    const result = await Promise.race([pending, stopped])
    if (
      result === OWNER_JOIN_TIMED_OUT ||
      result === null ||
      !context.check() ||
      !isDisplayedBaselineCurrent(sourcePort, selection, reads) ||
      !context.check()
    ) {
      return null
    }
    return result
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function isDisplayedBaselineCurrent(
  sourcePort: TicketWorkspaceOwnerSourcePort,
  selection: TicketWorkspaceOwnerSelection,
  reads: readonly CurrentTicketOwnerRead[]
): boolean {
  const currentRead = reads.at(-1)
  if (!currentRead) {
    return false
  }
  try {
    const baseline = sourcePort.getDisplayedBaseline(selection.snapshotRevision)
    return (
      baseline?.snapshotRevision === selection.snapshotRevision &&
      sameSelectedOwnerFacts(baseline, currentRead.snapshot, selection)
    )
  } catch {
    return false
  }
}

function isCurrentRead(
  read: CurrentTicketOwnerRead,
  sourcePort: TicketWorkspaceOwnerSourcePort,
  startedAt: number,
  now: number
): boolean {
  try {
    return (
      read.evidence.readStartedAtMonotonicMs >= startedAt &&
      read.evidence.readStartedAtMonotonicMs <= now &&
      sourcePort.isCurrent(read)
    )
  } catch {
    return false
  }
}
