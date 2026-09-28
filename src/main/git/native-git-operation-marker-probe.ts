import { posix, win32 } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { isWslUncPath } from '../../shared/wsl-paths'
import type {
  NativeGitWorktreeSubject,
  NativeGitWorktreeSubjectPaths
} from './worktree-catalog-registration-identity'
import {
  proveLocalWindowsVolumeSubjectPaths,
  WINDOWS_FILE_ATTRIBUTE_DEVICE,
  WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
  WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT,
  type WindowsPathEntryEvidence
} from './windows-native-volume-path-proof'
import type {
  NativeGitOperationMarkerCapture,
  NativeGitOperationMarkerReaderDependencies,
  NativeGitOperationMarkerStatus
} from './native-git-operation-marker-capture'

export async function readNativeGitOperationMarkersOnce(
  subject: NativeGitWorktreeSubject,
  signal: AbortSignal,
  dependencies: NativeGitOperationMarkerReaderDependencies
): Promise<NativeGitOperationMarkerCapture | null> {
  if (signal.aborted) {
    return null
  }

  const subjectPaths =
    dependencies.platform === 'win32'
      ? await proveLocalWindowsVolumeSubjectPaths(
          subject,
          {
            queryDosDeviceTarget: dependencies.queryDosDeviceTarget,
            inspectPathEntry: dependencies.inspectWindowsPathEntry
          },
          signal
        )
      : isLocalNativePosixSubject(subject)
        ? nativeSubjectPaths(subject)
        : null
  if (
    signal.aborted ||
    !subjectPaths ||
    !(await subjectFilesystemIdentityMatches(subject, subjectPaths, dependencies))
  ) {
    return null
  }

  const joinPath = dependencies.platform === 'win32' ? win32.join : posix.join
  const [mergeHead, cherryPickHead, rebaseMerge, rebaseApply] = await Promise.all([
    readStableMarker(subjectPaths.gitDirectoryPath, 'file', signal, dependencies, joinPath),
    readStableMarker(
      subjectPaths.gitDirectoryPath,
      'file',
      signal,
      dependencies,
      joinPath,
      'CHERRY_PICK_HEAD'
    ),
    readStableMarker(
      subjectPaths.gitDirectoryPath,
      'directory',
      signal,
      dependencies,
      joinPath,
      'rebase-merge'
    ),
    readStableMarker(
      subjectPaths.gitDirectoryPath,
      'directory',
      signal,
      dependencies,
      joinPath,
      'rebase-apply'
    )
  ])
  if (
    signal.aborted ||
    !(await subjectFilesystemIdentityMatches(subject, subjectPaths, dependencies))
  ) {
    return null
  }

  const markers = { mergeHead, cherryPickHead, rebaseMerge, rebaseApply }
  return {
    complete: Object.values(markers).every((status) => status !== 'unavailable'),
    filesystemRoute: 'native',
    markers
  }
}

async function readStableMarker(
  gitDirectoryPath: string,
  expectedKind: 'file' | 'directory',
  signal: AbortSignal,
  dependencies: NativeGitOperationMarkerReaderDependencies,
  joinPath: typeof posix.join,
  markerName = 'MERGE_HEAD'
): Promise<NativeGitOperationMarkerStatus> {
  const markerPath = joinPath(gitDirectoryPath, markerName)
  const first = await readMarkerState(markerPath, expectedKind, signal, dependencies)
  if (signal.aborted || first === 'unavailable') {
    return 'unavailable'
  }
  const second = await readMarkerState(markerPath, expectedKind, signal, dependencies)
  return first === second ? second : 'unavailable'
}

async function readMarkerState(
  markerPath: string,
  expectedKind: 'file' | 'directory',
  signal: AbortSignal,
  dependencies: NativeGitOperationMarkerReaderDependencies
): Promise<NativeGitOperationMarkerStatus> {
  if (signal.aborted) {
    return 'unavailable'
  }
  if (dependencies.platform === 'win32') {
    let evidence: WindowsPathEntryEvidence
    try {
      evidence = await dependencies.inspectWindowsPathEntry(markerPath)
    } catch {
      return 'unavailable'
    }
    if (signal.aborted || evidence.status === 'unavailable') {
      return 'unavailable'
    }
    if (evidence.status === 'missing') {
      return 'absent'
    }
    if (
      evidence.reparseTag !== 0 ||
      (evidence.attributes &
        (WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT | WINDOWS_FILE_ATTRIBUTE_DEVICE)) !==
        0
    ) {
      return 'unavailable'
    }
    const isDirectory = (evidence.attributes & WINDOWS_FILE_ATTRIBUTE_DIRECTORY) !== 0
    return isDirectory === (expectedKind === 'directory') ? 'present' : 'unavailable'
  }
  try {
    const stats = await dependencies.lstat(markerPath)
    if (stats.isSymbolicLink()) {
      return 'unavailable'
    }
    return (expectedKind === 'file' ? stats.isFile() : stats.isDirectory())
      ? 'present'
      : 'unavailable'
  } catch (error) {
    return isMarkerAbsent(error) ? 'absent' : 'unavailable'
  }
}

async function subjectFilesystemIdentityMatches(
  subject: NativeGitWorktreeSubject,
  paths: NativeGitWorktreeSubjectPaths,
  dependencies: NativeGitOperationMarkerReaderDependencies
): Promise<boolean> {
  const identity = await dependencies.readSubjectFilesystemIdentity(paths)
  return identity !== null && isDeepStrictEqual(identity, subject.filesystemIdentity)
}

function isLocalNativePosixSubject(subject: NativeGitWorktreeSubject): boolean {
  return [
    subject.worktreeRoot,
    subject.gitDirectoryPath,
    subject.commonDirectoryPath,
    subject.indexPath
  ].every(isLocalNativePath)
}

function nativeSubjectPaths(subject: NativeGitWorktreeSubject): NativeGitWorktreeSubjectPaths {
  return {
    worktreeRoot: subject.worktreeRoot,
    gitDirectoryPath: subject.gitDirectoryPath,
    commonDirectoryPath: subject.commonDirectoryPath,
    indexPath: subject.indexPath
  }
}

function isLocalNativePath(path: string): boolean {
  if (!path || path.includes('\0') || isWslUncPath(path)) {
    return false
  }
  return posix.isAbsolute(path) && !path.startsWith('//')
}

function isMarkerAbsent(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
}
