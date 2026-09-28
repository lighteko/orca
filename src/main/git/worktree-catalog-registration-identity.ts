import { lstat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { parseGitdirMarkerPayload } from '../../shared/gitdir-marker-payload'
import { resolveGitMetadataPath } from '../../shared/git-metadata-path'
import { areWorktreePathsEqual } from './worktree-path-comparison'
import { createBoundedWorktreeRegistrationIdentityReader } from './bounded-worktree-registration-probe'
import {
  filesystemIdentity,
  inspectFilesystemEntry,
  parseSinglePathPointer,
  readPointer,
  sameFilesystemEntry,
  type NativeGitPointerIdentity
} from './worktree-catalog-filesystem-evidence'

export type NativeGitWorktreeFilesystemEntryIdentity = {
  device: string
  inode: string
  birthtimeNs: string
  ctimeNs: string
  mtimeNs: string
  size: string
  kind: 'file' | 'directory'
}

type NativeGitFilesystemEntryIdentity = NativeGitWorktreeFilesystemEntryIdentity

type GitDirectoryInspection = {
  marker: NativeGitPointerIdentity | NativeGitFilesystemEntryIdentity
  gitDirectoryPath: string
  gitDirectory: NativeGitFilesystemEntryIdentity
  head: NativeGitPointerIdentity
  backPointer?: NativeGitPointerIdentity
  commonDirectoryPointer?: NativeGitPointerIdentity
  commonDirectoryPath: string
  commonDirectory: NativeGitFilesystemEntryIdentity
  registrationDirectoryPath?: string
  registrationDirectory?: NativeGitFilesystemEntryIdentity
}

type NativeGitWorktreeRegistrationSnapshot = {
  repoCommonDirectoryPath: string
  repoCommonDirectory: NativeGitFilesystemEntryIdentity
  worktreePath: string
  worktreeDirectory: NativeGitFilesystemEntryIdentity
  worktreeGitEntryPath: string
  worktreeGit: GitDirectoryInspection
  worktreeIndex: NativeGitFilesystemEntryIdentity | null
}

export type NativeGitWorktreeSubjectPaths = {
  worktreeRoot: string
  gitDirectoryPath: string
  commonDirectoryPath: string
  indexPath: string
}

export type NativeGitWorktreeSubjectFilesystemIdentity = {
  worktreeRoot: NativeGitFilesystemEntryIdentity
  gitDirectoryPath: NativeGitFilesystemEntryIdentity
  commonDirectoryPath: NativeGitFilesystemEntryIdentity
  indexPath: NativeGitFilesystemEntryIdentity | null
}

export type NativeGitWorktreeSubject = NativeGitWorktreeSubjectPaths & {
  filesystemIdentity: NativeGitWorktreeSubjectFilesystemIdentity
}

export type NativeGitWorktreeRegistrationIdentity = NativeGitWorktreeSubject & {
  fingerprint: string
}

export async function readNativeGitWorktreeSubjectFilesystemIdentity(
  paths: NativeGitWorktreeSubjectPaths
): Promise<NativeGitWorktreeSubjectFilesystemIdentity | null> {
  const [worktreeRoot, gitDirectoryPath, commonDirectoryPath] = await Promise.all([
    inspectFilesystemEntry(paths.worktreeRoot, 'directory'),
    inspectFilesystemEntry(paths.gitDirectoryPath, 'directory'),
    inspectFilesystemEntry(paths.commonDirectoryPath, 'directory')
  ])
  const index = await inspectOptionalGitIndex(paths.indexPath)
  if (!worktreeRoot || !gitDirectoryPath || !commonDirectoryPath || index.status === 'invalid') {
    return null
  }
  return {
    worktreeRoot,
    gitDirectoryPath,
    commonDirectoryPath,
    indexPath: index.status === 'present' ? index.identity : null
  }
}

export async function readNativeGitWorktreeRegistrationIdentity(
  repoPath: string,
  worktreePath: string,
  signal?: AbortSignal
): Promise<NativeGitWorktreeRegistrationIdentity | null> {
  return readBoundedNativeGitWorktreeRegistrationIdentity(repoPath, worktreePath, signal)
}

const readBoundedNativeGitWorktreeRegistrationIdentity =
  createBoundedWorktreeRegistrationIdentityReader(readNativeGitWorktreeRegistrationIdentityOnce)

async function readNativeGitWorktreeRegistrationIdentityOnce(
  repoPath: string,
  worktreePath: string
): Promise<NativeGitWorktreeRegistrationIdentity | null> {
  try {
    const first = await readRegistrationIdentityOnce(repoPath, worktreePath)
    const second = await readRegistrationIdentityOnce(repoPath, worktreePath)
    if (!first || !isDeepStrictEqual(first, second)) {
      return null
    }
    return {
      fingerprint: createHash('sha256').update(JSON.stringify(first)).digest('hex'),
      worktreeRoot: first.worktreePath,
      gitDirectoryPath: first.worktreeGit.gitDirectoryPath,
      commonDirectoryPath: first.worktreeGit.commonDirectoryPath,
      indexPath: join(first.worktreeGit.gitDirectoryPath, 'index'),
      filesystemIdentity: {
        worktreeRoot: first.worktreeDirectory,
        gitDirectoryPath: first.worktreeGit.gitDirectory,
        commonDirectoryPath: first.worktreeGit.commonDirectory,
        indexPath: first.worktreeIndex
      }
    }
  } catch {
    return null
  }
}

async function readRegistrationIdentityOnce(
  repoPath: string,
  worktreePath: string
): Promise<NativeGitWorktreeRegistrationSnapshot | null> {
  const repoGit = await inspectGitDirectory(repoPath)
  const worktreeGit = await inspectGitDirectory(worktreePath)
  const worktreeDirectory = await inspectFilesystemEntry(worktreePath, 'directory')
  const worktreeIndex = worktreeGit
    ? await inspectOptionalGitIndex(join(worktreeGit.gitDirectoryPath, 'index'))
    : { status: 'invalid' as const }
  if (
    !repoGit ||
    !worktreeGit ||
    !worktreeDirectory ||
    worktreeIndex.status === 'invalid' ||
    !sameFilesystemEntry(repoGit.commonDirectory, worktreeGit.commonDirectory) ||
    !areWorktreePathsEqual(repoGit.commonDirectoryPath, worktreeGit.commonDirectoryPath)
  ) {
    return null
  }
  return {
    repoCommonDirectoryPath: repoGit.commonDirectoryPath,
    repoCommonDirectory: repoGit.commonDirectory,
    worktreePath,
    worktreeDirectory,
    worktreeGitEntryPath: join(worktreePath, '.git'),
    worktreeGit,
    worktreeIndex: worktreeIndex.status === 'present' ? worktreeIndex.identity : null
  }
}

type OptionalGitIndexIdentity =
  | { status: 'present'; identity: NativeGitFilesystemEntryIdentity }
  | { status: 'missing' }
  | { status: 'invalid' }

async function inspectOptionalGitIndex(path: string): Promise<OptionalGitIndexIdentity> {
  try {
    const stats = await lstat(path, { bigint: true })
    if (stats.isSymbolicLink() || !stats.isFile() || stats.ino === 0n || stats.birthtimeNs === 0n) {
      return { status: 'invalid' }
    }
    return { status: 'present', identity: filesystemIdentity(stats, 'file') }
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { status: 'missing' }
    }
    throw error
  }
}

async function inspectGitDirectory(worktreePath: string): Promise<GitDirectoryInspection | null> {
  const markerPath = join(worktreePath, '.git')
  const markerEntry = await inspectFilesystemEntry(markerPath)
  if (!markerEntry) {
    return null
  }

  let gitDirectoryPath = markerPath
  let marker: NativeGitPointerIdentity | NativeGitFilesystemEntryIdentity = markerEntry
  if (markerEntry.kind === 'file') {
    const pointer = await readPointer(markerPath)
    const markerLine = pointer ? parseSinglePathPointer(pointer.content) : null
    const gitDirectoryPointer = markerLine ? parseGitdirMarkerPayload(markerLine) : null
    const resolvedGitDirectory =
      gitDirectoryPointer === null
        ? null
        : resolveGitMetadataPath(worktreePath, gitDirectoryPointer)
    if (!pointer || !resolvedGitDirectory) {
      return null
    }
    marker = pointer
    gitDirectoryPath = resolvedGitDirectory
  }

  const gitDirectory = await inspectFilesystemEntry(gitDirectoryPath, 'directory')
  const head = await readPointer(join(gitDirectoryPath, 'HEAD'))
  if (!gitDirectory || !head) {
    return null
  }

  if (markerEntry.kind === 'directory') {
    return {
      marker,
      gitDirectoryPath,
      gitDirectory,
      head,
      commonDirectoryPath: gitDirectoryPath,
      commonDirectory: gitDirectory
    }
  }

  const backPointer = await readPointer(join(gitDirectoryPath, 'gitdir'))
  const commonDirectoryPointer = await readPointer(join(gitDirectoryPath, 'commondir'))
  const backPointerPath = backPointer
    ? resolveGitMetadataPath(gitDirectoryPath, parseSinglePathPointer(backPointer.content) ?? '')
    : null
  const commonDirectoryPath = commonDirectoryPointer
    ? resolveGitMetadataPath(
        gitDirectoryPath,
        parseSinglePathPointer(commonDirectoryPointer.content) ?? ''
      )
    : null
  const commonDirectory = commonDirectoryPath
    ? await inspectFilesystemEntry(commonDirectoryPath, 'directory')
    : null
  const registrationDirectoryPath = commonDirectoryPath
    ? join(commonDirectoryPath, 'worktrees')
    : null
  const registrationDirectory = registrationDirectoryPath
    ? await inspectFilesystemEntry(registrationDirectoryPath, 'directory')
    : null
  const registrationPathWithinDirectory = registrationDirectoryPath
    ? relative(registrationDirectoryPath, gitDirectoryPath)
    : null
  if (
    !backPointer ||
    !commonDirectoryPointer ||
    !backPointerPath ||
    !areWorktreePathsEqual(backPointerPath, markerPath) ||
    !commonDirectoryPath ||
    !commonDirectory ||
    !registrationDirectoryPath ||
    !registrationDirectory ||
    !registrationPathWithinDirectory ||
    registrationPathWithinDirectory === '.' ||
    registrationPathWithinDirectory === '..' ||
    registrationPathWithinDirectory.startsWith(`..${sep}`) ||
    isAbsolute(registrationPathWithinDirectory) ||
    registrationPathWithinDirectory.includes(sep)
  ) {
    return null
  }
  return {
    marker,
    gitDirectoryPath,
    gitDirectory,
    head,
    backPointer,
    commonDirectoryPointer,
    commonDirectoryPath,
    commonDirectory,
    registrationDirectoryPath,
    registrationDirectory
  }
}
