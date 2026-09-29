import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { performance } from 'node:perf_hooks'
import { nativeGitSubjectMatchesRegistration } from '../git/native-worktree-subject-attestation'
import type { NativeGitWorktreeStatusRecordCapture } from '../git/native-worktree-status-record-capture'
import type { NativeGitOperationMarkerCapture } from '../git/native-git-operation-marker-capture'
import type { NativeGitWorktreeSubject } from '../git/worktree-catalog-registration-identity'
import type { ExactLocalNativeGitWorktreeBinding } from './runtime-worktree-catalog-binding'
import type { ExactLocalNativeGitSubjectAttestation } from './runtime-git-subject-attestation'

export type ExactLocalNativeGitStatusRecordCapture = {
  readonly binding: ExactLocalNativeGitWorktreeBinding
  readonly effectiveSubject: NativeGitWorktreeSubject
  readonly status: NativeGitWorktreeStatusRecordCapture
  readonly operationMarkers: NativeGitOperationMarkerCapture
  readonly observationId: string
  readonly ownerReadStartedAt: number
}

type RuntimeGitStatusRecordCaptureClock = {
  wallNow(): number
  monotonicNow(): number
}

const OWNER_CAPTURE_DEADLINE_MS = 30_000
const OWNER_CLOCK_DRIFT_TOLERANCE_MS = 250
const OWNER_CAPTURE_TIMED_OUT = Symbol('owner-capture-timed-out')
const OWNER_CAPTURE_ABORTED = Symbol('owner-capture-aborted')
const OWNER_CAPTURE_UNAVAILABLE = Symbol('owner-capture-unavailable')

const defaultClock: RuntimeGitStatusRecordCaptureClock = {
  wallNow: () => Date.now(),
  monotonicNow: () => performance.now()
}

export type RuntimeGitStatusRecordCaptureHost = {
  attestSubject(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<ExactLocalNativeGitSubjectAttestation>
  readStatusRecords(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<NativeGitWorktreeStatusRecordCapture | null>
  readOperationMarkers(
    subject: NativeGitWorktreeSubject,
    signal?: AbortSignal
  ): Promise<NativeGitOperationMarkerCapture | null>
}

export class RuntimeGitStatusRecordCaptureUnavailableError extends Error {
  readonly code = 'runtime_git_status_record_capture_unavailable'

  constructor() {
    super('The exact local native Git status record capture is unavailable.')
    this.name = 'RuntimeGitStatusRecordCaptureUnavailableError'
  }
}

export class RuntimeGitStatusRecordCaptureCommands {
  constructor(
    private readonly host: RuntimeGitStatusRecordCaptureHost,
    private readonly clock: RuntimeGitStatusRecordCaptureClock = defaultClock
  ) {}

  async captureExactLocalNativeGitStatusRecords(
    binding: ExactLocalNativeGitWorktreeBinding,
    signal?: AbortSignal
  ): Promise<ExactLocalNativeGitStatusRecordCapture> {
    if (signal?.aborted) {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }
    let invocationMonotonicStartedAt: number
    try {
      invocationMonotonicStartedAt = this.clock.monotonicNow()
    } catch {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }
    if (!Number.isFinite(invocationMonotonicStartedAt)) {
      throw new RuntimeGitStatusRecordCaptureUnavailableError()
    }

    const ownerSignal = new AbortController()
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    let stopCapture!: (
      reason: typeof OWNER_CAPTURE_TIMED_OUT | typeof OWNER_CAPTURE_ABORTED
    ) => void
    const stopped = new Promise<typeof OWNER_CAPTURE_TIMED_OUT | typeof OWNER_CAPTURE_ABORTED>(
      (resolve) => {
        stopCapture = resolve
      }
    )

    const stop = (reason: typeof OWNER_CAPTURE_TIMED_OUT | typeof OWNER_CAPTURE_ABORTED): void => {
      ownerSignal.abort()
      stopCapture(reason)
    }
    deadlineTimer = setTimeout(() => stop(OWNER_CAPTURE_TIMED_OUT), OWNER_CAPTURE_DEADLINE_MS)
    if (signal) {
      onAbort = () => stop(OWNER_CAPTURE_ABORTED)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
      }
    }

    const operation = Promise.resolve()
      .then(async () => {
        if (ownerSignal.signal.aborted) {
          return OWNER_CAPTURE_UNAVAILABLE
        }
        const before = await this.host.attestSubject(binding, ownerSignal.signal)
        if (ownerSignal.signal.aborted || !isDeepStrictEqual(before.binding, binding)) {
          return OWNER_CAPTURE_UNAVAILABLE
        }

        const isWithinOverallDeadline = (): boolean => {
          const monotonicNow = this.clock.monotonicNow()
          const elapsed = monotonicNow - invocationMonotonicStartedAt
          if (!Number.isFinite(monotonicNow) || elapsed < 0) {
            stop(OWNER_CAPTURE_ABORTED)
            return false
          }
          if (elapsed >= OWNER_CAPTURE_DEADLINE_MS) {
            stop(OWNER_CAPTURE_TIMED_OUT)
            return false
          }
          return !ownerSignal.signal.aborted
        }
        if (!isWithinOverallDeadline()) {
          return OWNER_CAPTURE_UNAVAILABLE
        }

        const isOwnerReadFresh = (
          monotonicStartedAt: number,
          ownerReadStartedAt: number
        ): boolean => {
          const monotonicNow = this.clock.monotonicNow()
          const wallNow = this.clock.wallNow()
          const monotonicElapsed = monotonicNow - monotonicStartedAt
          const wallElapsed = wallNow - ownerReadStartedAt
          return (
            Number.isFinite(monotonicNow) &&
            Number.isFinite(wallNow) &&
            monotonicElapsed >= 0 &&
            monotonicElapsed < OWNER_CAPTURE_DEADLINE_MS &&
            wallElapsed >= 0 &&
            wallElapsed < OWNER_CAPTURE_DEADLINE_MS &&
            Math.abs(wallElapsed - monotonicElapsed) <= OWNER_CLOCK_DRIFT_TOLERANCE_MS
          )
        }
        const readIsAvailable = (monotonicStartedAt: number, ownerReadStartedAt: number): boolean =>
          !ownerSignal.signal.aborted &&
          isWithinOverallDeadline() &&
          isOwnerReadFresh(monotonicStartedAt, ownerReadStartedAt)

        const observationId = randomUUID()
        const monotonicStartedAt = this.clock.monotonicNow()
        const ownerReadStartedAt = this.clock.wallNow()
        if (!Number.isFinite(monotonicStartedAt) || !Number.isFinite(ownerReadStartedAt)) {
          return OWNER_CAPTURE_UNAVAILABLE
        }

        const status = await this.host.readStatusRecords(binding, ownerSignal.signal)
        if (
          !readIsAvailable(monotonicStartedAt, ownerReadStartedAt) ||
          !status ||
          status.executionRoute !== 'native'
        ) {
          return OWNER_CAPTURE_UNAVAILABLE
        }
        const operationMarkers = await this.host.readOperationMarkers(
          before.effectiveSubject,
          ownerSignal.signal
        )
        if (
          !readIsAvailable(monotonicStartedAt, ownerReadStartedAt) ||
          !operationMarkers ||
          operationMarkers.filesystemRoute !== 'native'
        ) {
          return OWNER_CAPTURE_UNAVAILABLE
        }

        const after = await this.host.attestSubject(binding, ownerSignal.signal)
        if (
          !readIsAvailable(monotonicStartedAt, ownerReadStartedAt) ||
          !isDeepStrictEqual(after.binding, binding) ||
          !nativeGitSubjectMatchesRegistration(after.effectiveSubject, before.effectiveSubject)
        ) {
          return OWNER_CAPTURE_UNAVAILABLE
        }
        return Object.freeze({
          binding,
          effectiveSubject: before.effectiveSubject,
          status,
          operationMarkers,
          observationId,
          ownerReadStartedAt
        })
      })
      .catch(() => OWNER_CAPTURE_UNAVAILABLE)

    try {
      const result = await Promise.race([operation, stopped])
      if (
        typeof result !== 'object' ||
        result === null ||
        signal?.aborted ||
        ownerSignal.signal.aborted
      ) {
        throw new RuntimeGitStatusRecordCaptureUnavailableError()
      }
      return result
    } finally {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer)
      }
      if (onAbort && signal) {
        signal.removeEventListener('abort', onAbort)
      }
    }
  }
}
