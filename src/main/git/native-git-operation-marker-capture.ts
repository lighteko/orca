import { lstat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { performance } from 'node:perf_hooks'
import {
  readNativeGitWorktreeSubjectFilesystemIdentity,
  type NativeGitWorktreeSubject,
  type NativeGitWorktreeSubjectFilesystemIdentity,
  type NativeGitWorktreeSubjectPaths
} from './worktree-catalog-registration-identity'
import { readNativeGitOperationMarkersOnce } from './native-git-operation-marker-probe'
import { loadWindowsNativePathEvidence } from './windows-native-path-evidence-loader'
import type { WindowsPathEntryEvidence } from './windows-native-volume-path-proof'

export const NATIVE_GIT_OPERATION_MARKER_CAPTURE_TIMEOUT_MS = 5_000

const OPERATION_MARKER_TIMED_OUT = Symbol('operation-marker-timed-out')
const OPERATION_MARKER_ABORTED = Symbol('operation-marker-aborted')

export type NativeGitOperationMarkerStatus = 'present' | 'absent' | 'unavailable'

export type NativeGitOperationMarkerCapture = {
  complete: boolean
  filesystemRoute: 'native'
  markers: {
    mergeHead: NativeGitOperationMarkerStatus
    cherryPickHead: NativeGitOperationMarkerStatus
    rebaseMerge: NativeGitOperationMarkerStatus
    rebaseApply: NativeGitOperationMarkerStatus
  }
}

type NativeGitOperationMarkerEntryStats = Pick<Stats, 'isFile' | 'isDirectory' | 'isSymbolicLink'>

export type NativeGitOperationMarkerReaderDependencies = {
  lstat: (path: string) => Promise<NativeGitOperationMarkerEntryStats>
  readSubjectFilesystemIdentity: (
    paths: NativeGitWorktreeSubjectPaths
  ) => Promise<NativeGitWorktreeSubjectFilesystemIdentity | null>
  queryDosDeviceTarget: (drive: string) => Promise<string | null>
  inspectWindowsPathEntry: (path: string) => Promise<WindowsPathEntryEvidence>
  platform: NodeJS.Platform
}

type NativeGitOperationMarkerReader = (
  subject: NativeGitWorktreeSubject,
  signal?: AbortSignal
) => Promise<NativeGitOperationMarkerCapture | null>

const defaultDependencies: NativeGitOperationMarkerReaderDependencies = {
  lstat: (path) => lstat(path),
  readSubjectFilesystemIdentity: (paths) => readNativeGitWorktreeSubjectFilesystemIdentity(paths),
  queryDosDeviceTarget: (drive) =>
    loadWindowsNativePathEvidence()?.queryDosDeviceTarget(drive) ?? Promise.resolve(null),
  inspectWindowsPathEntry: (path) =>
    loadWindowsNativePathEvidence()?.inspectPathEntry(path) ??
    Promise.resolve({ status: 'unavailable' }),
  platform: process.platform
}

const readBoundedNativeGitOperationMarkers = createNativeGitOperationMarkerReader()

export function readNativeGitOperationMarkers(
  subject: NativeGitWorktreeSubject,
  signal?: AbortSignal
): Promise<NativeGitOperationMarkerCapture | null> {
  return readBoundedNativeGitOperationMarkers(subject, signal)
}

export function createNativeGitOperationMarkerReader(
  dependencies = defaultDependencies,
  timeoutMs = NATIVE_GIT_OPERATION_MARKER_CAPTURE_TIMEOUT_MS
): NativeGitOperationMarkerReader {
  return createBoundedNativeGitOperationMarkerReader(
    (subject, signal) => readNativeGitOperationMarkersOnce(subject, signal, dependencies),
    timeoutMs
  )
}

export function createBoundedNativeGitOperationMarkerReader(
  readMarkers: (
    subject: NativeGitWorktreeSubject,
    signal: AbortSignal
  ) => Promise<NativeGitOperationMarkerCapture | null>,
  timeoutMs = NATIVE_GIT_OPERATION_MARKER_CAPTURE_TIMEOUT_MS
): NativeGitOperationMarkerReader {
  let readInFlight = false

  return async (subject, signal) => {
    if (readInFlight || signal?.aborted) {
      return null
    }
    readInFlight = true
    const deadlineAt = performance.now() + timeoutMs
    const controller = new AbortController()
    const operation = Promise.resolve()
      .then(() => readMarkers(subject, controller.signal))
      .catch(() => null)
    void operation.then(() => {
      readInFlight = false
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const deadline = new Promise<typeof OPERATION_MARKER_TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(OPERATION_MARKER_TIMED_OUT)
      }, timeoutMs)
    })
    const aborted = new Promise<typeof OPERATION_MARKER_ABORTED>((resolve) => {
      if (!signal) {
        return
      }
      onAbort = () => {
        controller.abort()
        resolve(OPERATION_MARKER_ABORTED)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
      }
    })

    const result = await Promise.race([operation, deadline, aborted])
    if (timer) {
      clearTimeout(timer)
    }
    if (onAbort && signal) {
      signal.removeEventListener('abort', onAbort)
    }
    return result === OPERATION_MARKER_TIMED_OUT ||
      result === OPERATION_MARKER_ABORTED ||
      signal?.aborted ||
      performance.now() >= deadlineAt
      ? null
      : result
  }
}
