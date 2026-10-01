import { lstat, open } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import type { NativeGitWorktreeFilesystemEntryIdentity } from './worktree-catalog-registration-identity'

const MAX_GIT_POINTER_BYTES = 64 * 1024

type NativeGitFilesystemEntryIdentity = NativeGitWorktreeFilesystemEntryIdentity

export type NativeGitPointerIdentity = {
  entry: NativeGitFilesystemEntryIdentity
  content: string
}

export async function inspectFilesystemEntry(
  path: string,
  expectedKind?: 'file' | 'directory'
): Promise<NativeGitFilesystemEntryIdentity | null> {
  const stats = await lstat(path, { bigint: true })
  if (
    stats.isSymbolicLink() ||
    (expectedKind === 'file' && !stats.isFile()) ||
    (expectedKind === 'directory' && !stats.isDirectory()) ||
    (!stats.isFile() && !stats.isDirectory()) ||
    stats.ino === 0n ||
    stats.birthtimeNs === 0n
  ) {
    return null
  }
  return filesystemIdentity(stats, stats.isFile() ? 'file' : 'directory')
}

export async function readPointer(path: string): Promise<NativeGitPointerIdentity | null> {
  const before = await inspectFilesystemEntry(path, 'file')
  if (!before || BigInt(before.size) > BigInt(MAX_GIT_POINTER_BYTES)) {
    return null
  }
  const handle = await open(path, 'r')
  try {
    const openedStats = await handle.stat({ bigint: true })
    const opened = filesystemIdentity(openedStats, 'file')
    if (!isSameFileIdentity(before, opened) || openedStats.size > BigInt(MAX_GIT_POINTER_BYTES)) {
      return null
    }
    const buffer = Buffer.alloc(Number(openedStats.size) + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const after = await inspectFilesystemEntry(path, 'file')
    if (bytesRead !== Number(openedStats.size) || !after || !isSameFileIdentity(before, after)) {
      return null
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead))
    return { entry: after, content }
  } finally {
    await handle.close()
  }
}

export function parseSinglePathPointer(content: string): string | null {
  const line = content.endsWith('\n') ? content.slice(0, -1) : content
  if (!line || line.includes('\n') || line.includes('\r')) {
    return null
  }
  return line.trim() || null
}

export function filesystemIdentity(
  stats: BigIntStats,
  kind: NativeGitFilesystemEntryIdentity['kind']
): NativeGitFilesystemEntryIdentity {
  return {
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
    birthtimeNs: stats.birthtimeNs.toString(),
    ctimeNs: stats.ctimeNs.toString(),
    mtimeNs: stats.mtimeNs.toString(),
    size: stats.size.toString(),
    kind
  }
}

export function sameFilesystemEntry(
  left: NativeGitFilesystemEntryIdentity,
  right: NativeGitFilesystemEntryIdentity
): boolean {
  return isSameFileIdentity(left, right) && left.kind === right.kind
}

function isSameFileIdentity(
  left: NativeGitFilesystemEntryIdentity,
  right: NativeGitFilesystemEntryIdentity
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.birthtimeNs === right.birthtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.mtimeNs === right.mtimeNs &&
    left.size === right.size
  )
}
