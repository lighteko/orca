import { describe, expect, it, vi } from 'vitest'
import type { NativeGitWorktreeSubject } from './worktree-catalog-registration-identity'
import {
  createNativeGitOperationMarkerReader,
  type NativeGitOperationMarkerReaderDependencies
} from './native-git-operation-marker-capture'
import {
  WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
  WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT
} from './windows-native-volume-path-proof'

const SUBJECT: NativeGitWorktreeSubject = {
  worktreeRoot: '/repo/worktree',
  gitDirectoryPath: '/repo/.git/worktrees/feature',
  commonDirectoryPath: '/repo/.git',
  indexPath: '/repo/.git/worktrees/feature/index',
  filesystemIdentity: {
    worktreeRoot: identity('2', 'directory'),
    gitDirectoryPath: identity('3', 'directory'),
    commonDirectoryPath: identity('4', 'directory'),
    indexPath: identity('5', 'file')
  }
}

describe('readNativeGitOperationMarkers', () => {
  it('reports confirmed absence only after stable marker reads on the bound native subject', async () => {
    const lstat = vi.fn(async () => {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    })
    const readSubjectFilesystemIdentity = vi.fn(async () => SUBJECT.filesystemIdentity)
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, readSubjectFilesystemIdentity)
    )

    await expect(readMarkers(SUBJECT)).resolves.toEqual({
      complete: true,
      filesystemRoute: 'native',
      markers: {
        mergeHead: 'absent',
        cherryPickHead: 'absent',
        rebaseMerge: 'absent',
        rebaseApply: 'absent'
      }
    })
    expect(readSubjectFilesystemIdentity).toHaveBeenCalledTimes(2)
    expect(lstat).toHaveBeenCalledTimes(8)
  })

  it('recognizes each marker only with its expected non-symlink entry type', async () => {
    const lstat = vi.fn(async (path: string) =>
      entryStats(
        path.endsWith('rebase-merge') || path.endsWith('rebase-apply') ? 'directory' : 'file'
      )
    )
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, async () => SUBJECT.filesystemIdentity)
    )

    await expect(readMarkers(SUBJECT)).resolves.toMatchObject({
      complete: true,
      markers: {
        mergeHead: 'present',
        cherryPickHead: 'present',
        rebaseMerge: 'present',
        rebaseApply: 'present'
      }
    })
  })

  it('keeps I/O failures distinct from confirmed absence while preserving other observations', async () => {
    const lstat = vi.fn(async (path: string) => {
      if (path.endsWith('MERGE_HEAD')) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      }
      if (path.endsWith('rebase-apply')) {
        throw Object.assign(new Error('device failure'), { code: 'EIO' })
      }
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    })
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, async () => SUBJECT.filesystemIdentity)
    )

    await expect(readMarkers(SUBJECT)).resolves.toEqual({
      complete: false,
      filesystemRoute: 'native',
      markers: {
        mergeHead: 'unavailable',
        cherryPickHead: 'absent',
        rebaseMerge: 'absent',
        rebaseApply: 'unavailable'
      }
    })
  })

  it('rejects UNC/WSL paths before any filesystem access', async () => {
    const lstat = vi.fn(async () => entryStats('file'))
    const readSubjectFilesystemIdentity = vi.fn(async () => SUBJECT.filesystemIdentity)
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, readSubjectFilesystemIdentity, 'win32')
    )
    const wslSubject = {
      ...SUBJECT,
      worktreeRoot: String.raw`\\wsl.localhost\Ubuntu\repo\worktree`,
      gitDirectoryPath: String.raw`\\wsl.localhost\Ubuntu\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`\\wsl.localhost\Ubuntu\repo\.git`,
      indexPath: String.raw`\\wsl.localhost\Ubuntu\repo\.git\worktrees\feature\index`
    }
    const uncSubject = {
      ...wslSubject,
      worktreeRoot: String.raw`\\server\share\repo\worktree`,
      gitDirectoryPath: String.raw`\\server\share\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`\\server\share\repo\.git`,
      indexPath: String.raw`\\server\share\repo\.git\worktrees\feature\index`
    }

    await expect(readMarkers(wslSubject)).resolves.toBeNull()
    await expect(readMarkers(uncSubject)).resolves.toBeNull()
    expect(readSubjectFilesystemIdentity).not.toHaveBeenCalled()
    expect(lstat).not.toHaveBeenCalled()
  })

  it('uses only OS-proven GLOBALROOT paths for Windows subject identity and marker reads', async () => {
    const windowsSubject: NativeGitWorktreeSubject = {
      worktreeRoot: 'C:/repo/worktree',
      gitDirectoryPath: 'C:/repo/.git/worktrees/feature',
      commonDirectoryPath: 'C:/repo/.git',
      indexPath: 'C:/repo/.git/worktrees/feature/index',
      filesystemIdentity: SUBJECT.filesystemIdentity
    }
    const queriedDrives: string[] = []
    const queryDosDeviceTarget = vi.fn(async (drive: string) => {
      queriedDrives.push(drive)
      return String.raw`\Device\HarddiskVolume3`
    })
    const inspectWindowsPathEntry = vi.fn(async (path: string) => {
      if (
        path.endsWith('MERGE_HEAD') ||
        path.endsWith('CHERRY_PICK_HEAD') ||
        path.endsWith('rebase-merge') ||
        path.endsWith('rebase-apply')
      ) {
        return { status: 'missing' as const }
      }
      if (path.endsWith('index')) {
        return { status: 'entry' as const, attributes: 0x80, reparseTag: 0 }
      }
      return {
        status: 'entry' as const,
        attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
        reparseTag: 0
      }
    })
    const readSubjectFilesystemIdentity = vi.fn(async () => SUBJECT.filesystemIdentity)
    const lstat = vi.fn(async () => entryStats('directory'))
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, readSubjectFilesystemIdentity, 'win32', {
        queryDosDeviceTarget,
        inspectWindowsPathEntry
      })
    )

    await expect(readMarkers(windowsSubject)).resolves.toMatchObject({
      complete: true,
      filesystemRoute: 'native',
      markers: {
        mergeHead: 'absent',
        cherryPickHead: 'absent',
        rebaseMerge: 'absent',
        rebaseApply: 'absent'
      }
    })
    expect(queriedDrives).toEqual(['C:'])
    expect(readSubjectFilesystemIdentity).toHaveBeenCalledWith({
      worktreeRoot: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\worktree`,
      gitDirectoryPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git`,
      indexPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git\worktrees\feature\index`
    })
    expect(inspectWindowsPathEntry).toHaveBeenCalledWith(
      String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git\worktrees\feature\MERGE_HEAD`
    )
    expect(lstat).not.toHaveBeenCalled()
  })

  it('fails closed for mapped Windows drives before identity or marker filesystem access', async () => {
    const windowsSubject: NativeGitWorktreeSubject = {
      worktreeRoot: String.raw`Z:\repo\worktree`,
      gitDirectoryPath: String.raw`Z:\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`Z:\repo\.git`,
      indexPath: String.raw`Z:\repo\.git\worktrees\feature\index`,
      filesystemIdentity: SUBJECT.filesystemIdentity
    }
    const lstat = vi.fn(async () => entryStats('directory'))
    const readSubjectFilesystemIdentity = vi.fn(async () => SUBJECT.filesystemIdentity)
    const inspectWindowsPathEntry = vi.fn(async () => ({
      status: 'entry' as const,
      attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
      reparseTag: 0
    }))
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, readSubjectFilesystemIdentity, 'win32', {
        queryDosDeviceTarget: async () => String.raw`\Device\Mup\server\share`,
        inspectWindowsPathEntry
      })
    )

    await expect(readMarkers(windowsSubject)).resolves.toBeNull()
    expect(lstat).not.toHaveBeenCalled()
    expect(readSubjectFilesystemIdentity).not.toHaveBeenCalled()
    expect(inspectWindowsPathEntry).not.toHaveBeenCalled()
  })

  it('rejects a reparse point in a Windows subject ancestor before identity or marker reads', async () => {
    const windowsSubject: NativeGitWorktreeSubject = {
      worktreeRoot: String.raw`C:\repo\worktree`,
      gitDirectoryPath: String.raw`C:\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`C:\repo\.git`,
      indexPath: String.raw`C:\repo\.git\worktrees\feature\index`,
      filesystemIdentity: SUBJECT.filesystemIdentity
    }
    const lstat = vi.fn(async () => entryStats('directory'))
    const readSubjectFilesystemIdentity = vi.fn(async () => SUBJECT.filesystemIdentity)
    const inspectWindowsPathEntry = vi.fn(async (path: string) => ({
      status: 'entry' as const,
      attributes: path.endsWith(String.raw`\repo`)
        ? WINDOWS_FILE_ATTRIBUTE_DIRECTORY | WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT
        : WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
      reparseTag: 0
    }))
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, readSubjectFilesystemIdentity, 'win32', {
        queryDosDeviceTarget: async () => String.raw`\Device\HarddiskVolume3`,
        inspectWindowsPathEntry
      })
    )

    await expect(readMarkers(windowsSubject)).resolves.toBeNull()
    expect(readSubjectFilesystemIdentity).not.toHaveBeenCalled()
    expect(lstat).not.toHaveBeenCalled()
    expect(inspectWindowsPathEntry).not.toHaveBeenCalledWith(expect.stringContaining('MERGE_HEAD'))
  })

  it('treats a Windows marker reparse point as unavailable rather than following it', async () => {
    const windowsSubject: NativeGitWorktreeSubject = {
      worktreeRoot: String.raw`C:\repo\worktree`,
      gitDirectoryPath: String.raw`C:\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`C:\repo\.git`,
      indexPath: String.raw`C:\repo\.git\worktrees\feature\index`,
      filesystemIdentity: SUBJECT.filesystemIdentity
    }
    const inspectWindowsPathEntry = vi.fn(async (path: string) => {
      if (path.endsWith('MERGE_HEAD')) {
        return {
          status: 'entry' as const,
          attributes: WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT,
          reparseTag: 0xa000000c
        }
      }
      if (path.endsWith('index')) {
        return { status: 'entry' as const, attributes: 0x80, reparseTag: 0 }
      }
      if (
        path.endsWith('CHERRY_PICK_HEAD') ||
        path.endsWith('rebase-merge') ||
        path.endsWith('rebase-apply')
      ) {
        return { status: 'missing' as const }
      }
      return {
        status: 'entry' as const,
        attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
        reparseTag: 0
      }
    })
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(
        vi.fn(async () => entryStats('file')),
        async () => SUBJECT.filesystemIdentity,
        'win32',
        {
          queryDosDeviceTarget: async () => String.raw`\Device\HarddiskVolume3`,
          inspectWindowsPathEntry
        }
      )
    )

    await expect(readMarkers(windowsSubject)).resolves.toMatchObject({
      complete: false,
      markers: {
        mergeHead: 'unavailable',
        cherryPickHead: 'absent',
        rebaseMerge: 'absent',
        rebaseApply: 'absent'
      }
    })
  })

  it('marks a marker unavailable if its observed state changes during the probe', async () => {
    let mergeCalls = 0
    const lstat = vi.fn(async (path: string) => {
      if (path.endsWith('MERGE_HEAD') && mergeCalls++ === 0) {
        return entryStats('file')
      }
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    })
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, async () => SUBJECT.filesystemIdentity)
    )

    await expect(readMarkers(SUBJECT)).resolves.toMatchObject({
      complete: false,
      markers: {
        mergeHead: 'unavailable',
        cherryPickHead: 'absent',
        rebaseMerge: 'absent',
        rebaseApply: 'absent'
      }
    })
  })

  it('retains its single probe slot until timed-out filesystem I/O settles', async () => {
    let releaseLstat: ((stats: ReturnType<typeof entryStats>) => void) | undefined
    let delayed = true
    const lstat = vi.fn((path: string) => {
      if (path.endsWith('MERGE_HEAD') && delayed) {
        delayed = false
        return new Promise<ReturnType<typeof entryStats>>((resolve) => {
          releaseLstat = resolve
        })
      }
      return Promise.reject(Object.assign(new Error('not found'), { code: 'ENOENT' }))
    })
    const readMarkers = createNativeGitOperationMarkerReader(
      dependencies(lstat, async () => SUBJECT.filesystemIdentity),
      5
    )

    const firstRead = readMarkers(SUBJECT)
    await vi.waitFor(() => expect(lstat).toHaveBeenCalled())
    await expect(firstRead).resolves.toBeNull()
    const callsAtTimeout = lstat.mock.calls.length
    await expect(readMarkers(SUBJECT)).resolves.toBeNull()
    expect(lstat).toHaveBeenCalledTimes(callsAtTimeout)

    releaseLstat?.(entryStats('file'))
    let nextRead: ReturnType<typeof readMarkers> | undefined
    await vi.waitFor(() => {
      nextRead = readMarkers(SUBJECT)
      expect(lstat.mock.calls.length).toBeGreaterThan(callsAtTimeout)
    })
    await expect(nextRead).resolves.toMatchObject({ complete: true })
  })
})

function dependencies(
  lstat: NativeGitOperationMarkerReaderDependencies['lstat'],
  readSubjectFilesystemIdentity: NativeGitOperationMarkerReaderDependencies['readSubjectFilesystemIdentity'],
  platform: NodeJS.Platform = 'linux',
  windows: Partial<
    Pick<
      NativeGitOperationMarkerReaderDependencies,
      'queryDosDeviceTarget' | 'inspectWindowsPathEntry'
    >
  > = {}
): NativeGitOperationMarkerReaderDependencies {
  return {
    lstat,
    readSubjectFilesystemIdentity,
    queryDosDeviceTarget: windows.queryDosDeviceTarget ?? (async () => null),
    inspectWindowsPathEntry:
      windows.inspectWindowsPathEntry ?? (async () => ({ status: 'unavailable' })),
    platform
  }
}

function identity(
  inode: string,
  kind: 'file' | 'directory'
): NativeGitWorktreeSubject['filesystemIdentity']['worktreeRoot'] {
  return {
    device: '1',
    inode,
    birthtimeNs: '3',
    ctimeNs: '4',
    mtimeNs: '5',
    size: '6',
    kind
  }
}

function entryStats(kind: 'file' | 'directory' | 'symlink' | 'other') {
  return {
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
    isSymbolicLink: () => kind === 'symlink'
  }
}
