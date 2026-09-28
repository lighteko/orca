import { describe, expect, it, vi } from 'vitest'
import type { NativeGitWorktreeSubject } from './worktree-catalog-registration-identity'
import {
  proveLocalWindowsVolumeSubjectPaths,
  WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
  type WindowsNativeVolumePathProofDependencies
} from './windows-native-volume-path-proof'

const SUBJECT: NativeGitWorktreeSubject = {
  worktreeRoot: String.raw`C:\repo\worktree`,
  gitDirectoryPath: String.raw`C:\repo\.git\worktrees\feature`,
  commonDirectoryPath: String.raw`D:\repo\.git`,
  indexPath: String.raw`C:\repo\.git\worktrees\feature\index`,
  filesystemIdentity: {
    worktreeRoot: identity('2', 'directory'),
    gitDirectoryPath: identity('3', 'directory'),
    commonDirectoryPath: identity('4', 'directory'),
    indexPath: identity('5', 'file')
  }
}

describe('proveLocalWindowsVolumeSubjectPaths', () => {
  it('queries every distinct drive before inspecting local-volume ancestors', async () => {
    const events: string[] = []
    const dependencies = createDependencies({
      queryDosDeviceTarget: async (drive) => {
        events.push(`query:${drive}`)
        return drive === 'C:'
          ? String.raw`\Device\HarddiskVolume3`
          : String.raw`\Device\HarddiskVolume5`
      },
      inspectPathEntry: async (path) => {
        events.push(`inspect:${path}`)
        if (path.endsWith('index')) {
          return { status: 'entry', attributes: 0x80, reparseTag: 0 }
        }
        return { status: 'entry', attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY, reparseTag: 0 }
      }
    })

    await expect(proveLocalWindowsVolumeSubjectPaths(SUBJECT, dependencies)).resolves.toEqual({
      worktreeRoot: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\worktree`,
      gitDirectoryPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume5\repo\.git`,
      indexPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git\worktrees\feature\index`
    })
    expect(events.slice(0, 2)).toEqual(['query:C:', 'query:D:'])
    expect(events[2]).toContain('inspect:')
  })

  it('normalizes Git drive paths that use forward slashes', async () => {
    const forwardSlashSubject: NativeGitWorktreeSubject = {
      ...SUBJECT,
      worktreeRoot: SUBJECT.worktreeRoot.replaceAll('\\', '/'),
      gitDirectoryPath: SUBJECT.gitDirectoryPath.replaceAll('\\', '/'),
      commonDirectoryPath: SUBJECT.commonDirectoryPath.replaceAll('\\', '/'),
      indexPath: SUBJECT.indexPath.replaceAll('\\', '/')
    }
    const result = await proveLocalWindowsVolumeSubjectPaths(
      forwardSlashSubject,
      createDependencies({
        inspectPathEntry: async (path) =>
          path.endsWith('index')
            ? { status: 'entry', attributes: 0x80, reparseTag: 0 }
            : {
                status: 'entry',
                attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
                reparseTag: 0
              }
      })
    )

    expect(result).toEqual({
      worktreeRoot: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\worktree`,
      gitDirectoryPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git\worktrees\feature`,
      commonDirectoryPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git`,
      indexPath: String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo\.git\worktrees\feature\index`
    })
  })

  it('does not inspect paths when a drive query resolves after cancellation', async () => {
    const controller = new AbortController()
    let resolveTarget: ((target: string | null) => void) | undefined
    const queryDosDeviceTarget = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveTarget = resolve
        })
    )
    const inspectPathEntry = vi.fn(async () => ({
      status: 'entry' as const,
      attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
      reparseTag: 0
    }))
    const proof = proveLocalWindowsVolumeSubjectPaths(
      { ...SUBJECT, commonDirectoryPath: String.raw`C:\repo\.git` },
      createDependencies({ queryDosDeviceTarget, inspectPathEntry }),
      controller.signal
    )

    controller.abort()
    resolveTarget?.(String.raw`\Device\HarddiskVolume3`)

    await expect(proof).resolves.toBeNull()
    expect(inspectPathEntry).not.toHaveBeenCalled()
  })

  it('stops scheduling ancestor inspections after cancellation', async () => {
    const controller = new AbortController()
    const inspectPathEntry = vi.fn(async () => {
      controller.abort()
      return {
        status: 'entry' as const,
        attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
        reparseTag: 0
      }
    })

    await expect(
      proveLocalWindowsVolumeSubjectPaths(
        SUBJECT,
        createDependencies({ inspectPathEntry }),
        controller.signal
      )
    ).resolves.toBeNull()
    expect(inspectPathEntry).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['mapped drive', String.raw`\Device\Mup\server\share`],
    ['SUBST drive', String.raw`\??\C:\repo`],
    ['volume alias', String.raw`\Device\HarddiskVolumeShadowCopy3`],
    ['malformed target', String.raw`not-a-device-path`]
  ])('rejects %s without path inspection', async (_label, target) => {
    const inspectPathEntry = vi.fn(async () => ({
      status: 'entry' as const,
      attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
      reparseTag: 0
    }))
    const dependencies = createDependencies({
      queryDosDeviceTarget: async () => target,
      inspectPathEntry
    })

    await expect(proveLocalWindowsVolumeSubjectPaths(SUBJECT, dependencies)).resolves.toBeNull()
    expect(inspectPathEntry).not.toHaveBeenCalled()
  })

  it('rejects UNC, device namespace, traversal, and malformed drive paths before OS calls', async () => {
    const queryDosDeviceTarget = vi.fn(async () => String.raw`\Device\HarddiskVolume3`)
    const inspectPathEntry = vi.fn(async () => ({
      status: 'entry' as const,
      attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
      reparseTag: 0
    }))
    const dependencies = createDependencies({ queryDosDeviceTarget, inspectPathEntry })

    for (const worktreeRoot of [
      String.raw`\\wsl.localhost\Ubuntu\repo`,
      String.raw`\\?\GLOBALROOT\Device\HarddiskVolume3\repo`,
      String.raw`C:\repo\..\other`,
      String.raw`C:repo`
    ]) {
      await expect(
        proveLocalWindowsVolumeSubjectPaths({ ...SUBJECT, worktreeRoot }, dependencies)
      ).resolves.toBeNull()
    }
    expect(queryDosDeviceTarget).not.toHaveBeenCalled()
    expect(inspectPathEntry).not.toHaveBeenCalled()
  })

  it('allows only a missing optional index leaf, never a missing ancestor', async () => {
    const subjectWithoutIndex = {
      ...SUBJECT,
      filesystemIdentity: { ...SUBJECT.filesystemIdentity, indexPath: null }
    }
    const inspectPathEntry = vi.fn(async (path: string) =>
      path.endsWith('index')
        ? { status: 'missing' as const }
        : { status: 'entry' as const, attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY, reparseTag: 0 }
    )
    const dependencies = createDependencies({ inspectPathEntry })

    await expect(
      proveLocalWindowsVolumeSubjectPaths(subjectWithoutIndex, dependencies)
    ).resolves.toMatchObject({ indexPath: expect.stringContaining(String.raw`\index`) })

    inspectPathEntry.mockImplementation(async (path: string) =>
      path.endsWith(String.raw`\worktrees`)
        ? { status: 'missing' as const }
        : { status: 'entry' as const, attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY, reparseTag: 0 }
    )
    await expect(
      proveLocalWindowsVolumeSubjectPaths(subjectWithoutIndex, dependencies)
    ).resolves.toBeNull()
  })
})

function createDependencies(
  overrides: Partial<WindowsNativeVolumePathProofDependencies> = {}
): WindowsNativeVolumePathProofDependencies {
  return {
    queryDosDeviceTarget: async () => String.raw`\Device\HarddiskVolume3`,
    inspectPathEntry: async () => ({
      status: 'entry',
      attributes: WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
      reparseTag: 0
    }),
    ...overrides
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
