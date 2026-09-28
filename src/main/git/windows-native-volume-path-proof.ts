import { win32 } from 'node:path'
import type { NativeGitWorktreeSubject } from './worktree-catalog-registration-identity'

export const WINDOWS_FILE_ATTRIBUTE_DIRECTORY = 0x10
export const WINDOWS_FILE_ATTRIBUTE_DEVICE = 0x40
export const WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT = 0x400

const LOCAL_HARD_DISK_VOLUME_TARGET = /^\\Device\\HarddiskVolume[0-9]+$/i
const SUBJECT_PATHS = [
  'worktreeRoot',
  'gitDirectoryPath',
  'commonDirectoryPath',
  'indexPath'
] as const

export type WindowsPathEntryEvidence =
  | { status: 'entry'; attributes: number; reparseTag: number }
  | { status: 'missing' }
  | { status: 'unavailable' }

export type WindowsNativeVolumePathProofDependencies = {
  queryDosDeviceTarget: (drive: string) => Promise<string | null>
  inspectPathEntry: (path: string) => Promise<WindowsPathEntryEvidence>
}

type ParsedWindowsDrivePath = { drive: string; components: string[] }
type SubjectPathRoute = {
  pathName: (typeof SUBJECT_PATHS)[number]
  originalPath: string
  devicePath: string
  components: string[]
  expectedKind: 'file' | 'directory'
  missingLeafAllowed: boolean
}

/** Returns GLOBALROOT paths only after every subject drive proves a local volume mapping. */
export async function proveLocalWindowsVolumeSubjectPaths(
  subject: NativeGitWorktreeSubject,
  dependencies: WindowsNativeVolumePathProofDependencies,
  signal?: AbortSignal
): Promise<Pick<NativeGitWorktreeSubject, (typeof SUBJECT_PATHS)[number]> | null> {
  if (signal?.aborted) {
    return null
  }
  const parsedPaths = SUBJECT_PATHS.map((pathName) => {
    const originalPath = subject[pathName]
    const parsed = parseWindowsDrivePath(originalPath)
    return parsed ? { pathName, originalPath, parsed } : null
  })
  if (signal?.aborted || parsedPaths.some((path) => path === null)) {
    return null
  }

  const drives = [...new Set(parsedPaths.map((path) => path?.parsed.drive ?? ''))]
  const queriedTargets = await Promise.all(
    drives.map(async (drive) => {
      try {
        return { drive, target: await dependencies.queryDosDeviceTarget(drive) }
      } catch {
        return { drive, target: null }
      }
    })
  )
  if (
    signal?.aborted ||
    queriedTargets.length !== drives.length ||
    queriedTargets.some(
      ({ target }) => target === null || !LOCAL_HARD_DISK_VOLUME_TARGET.test(target)
    )
  ) {
    return null
  }

  const routeByDrive = new Map<string, string>()
  for (const { drive, target } of queriedTargets) {
    if (target === null) {
      return null
    }
    routeByDrive.set(drive, `\\\\?\\GLOBALROOT${target}\\`)
  }

  const routes: SubjectPathRoute[] = []
  for (const parsedPath of parsedPaths) {
    if (!parsedPath) {
      return null
    }
    const { pathName, originalPath, parsed } = parsedPath
    const deviceRoot = routeByDrive.get(parsed.drive)
    if (!deviceRoot) {
      return null
    }
    routes.push({
      pathName,
      originalPath,
      components: parsed.components,
      devicePath: `${deviceRoot}${parsed.components.join('\\')}`,
      expectedKind: pathName === 'indexPath' ? 'file' : 'directory',
      missingLeafAllowed: pathName === 'indexPath' && subject.filesystemIdentity.indexPath === null
    })
  }

  if (!(await hasNoReparseAncestors(routes, routeByDrive, dependencies, signal))) {
    return null
  }

  const worktreeRoot = routes.find((route) => route.pathName === 'worktreeRoot')
  const gitDirectoryPath = routes.find((route) => route.pathName === 'gitDirectoryPath')
  const commonDirectoryPath = routes.find((route) => route.pathName === 'commonDirectoryPath')
  const indexPath = routes.find((route) => route.pathName === 'indexPath')
  if (!worktreeRoot || !gitDirectoryPath || !commonDirectoryPath || !indexPath) {
    return null
  }
  return {
    worktreeRoot: worktreeRoot.devicePath,
    gitDirectoryPath: gitDirectoryPath.devicePath,
    commonDirectoryPath: commonDirectoryPath.devicePath,
    indexPath: indexPath.devicePath
  }
}

function parseWindowsDrivePath(path: string): ParsedWindowsDrivePath | null {
  if (!path || path.includes('\0')) {
    return null
  }
  const normalizedPath = path.replaceAll('/', '\\')
  if (normalizedPath.startsWith('\\')) {
    return null
  }
  const root = win32.parse(normalizedPath).root
  if (!/^[A-Za-z]:\\$/.test(root)) {
    return null
  }
  const withoutTrailingSeparator =
    normalizedPath.length > root.length && normalizedPath.endsWith('\\')
      ? normalizedPath.slice(0, -1)
      : normalizedPath
  const suffix = withoutTrailingSeparator.slice(root.length)
  const components = suffix ? suffix.split('\\') : []
  if (
    components.some(
      (component) =>
        !component ||
        component === '.' ||
        component === '..' ||
        component.includes(':') ||
        component.endsWith('.') ||
        component.endsWith(' ')
    )
  ) {
    return null
  }
  return { drive: root.slice(0, 2).toUpperCase(), components }
}

async function hasNoReparseAncestors(
  routes: SubjectPathRoute[],
  routeByDrive: Map<string, string>,
  dependencies: WindowsNativeVolumePathProofDependencies,
  signal?: AbortSignal
): Promise<boolean> {
  const checks = new Map<
    string,
    { path: string; expectedKind: 'file' | 'directory'; missingLeafAllowed: boolean }
  >()
  for (const route of routes) {
    const root = routeByDrive.get(route.originalPath.slice(0, 2).toUpperCase())
    if (!root) {
      return false
    }
    let prefix = root
    if (!addPathCheck(checks, prefix, 'directory', false)) {
      return false
    }
    for (const [index, component] of route.components.entries()) {
      prefix += `${prefix.endsWith('\\') ? '' : '\\'}${component}`
      const isLeaf = index === route.components.length - 1
      const expectedKind = isLeaf ? route.expectedKind : 'directory'
      const missingLeafAllowed = isLeaf && route.missingLeafAllowed
      if (!addPathCheck(checks, prefix, expectedKind, missingLeafAllowed)) {
        return false
      }
    }
  }

  const orderedChecks = [...checks.values()].sort(
    (left, right) => left.path.length - right.path.length
  )
  for (const check of orderedChecks) {
    if (signal?.aborted) {
      return false
    }
    let evidence: WindowsPathEntryEvidence
    try {
      evidence = await dependencies.inspectPathEntry(check.path)
    } catch {
      return false
    }
    if (signal?.aborted) {
      return false
    }
    if (evidence.status === 'missing' && check.missingLeafAllowed) {
      continue
    }
    if (
      evidence.status !== 'entry' ||
      evidence.reparseTag !== 0 ||
      (evidence.attributes & WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT) !== 0
    ) {
      return false
    }
    const isDirectory = (evidence.attributes & WINDOWS_FILE_ATTRIBUTE_DIRECTORY) !== 0
    if (isDirectory !== (check.expectedKind === 'directory')) {
      return false
    }
  }
  return true
}

function addPathCheck(
  checks: Map<
    string,
    { path: string; expectedKind: 'file' | 'directory'; missingLeafAllowed: boolean }
  >,
  path: string,
  expectedKind: 'file' | 'directory',
  missingLeafAllowed: boolean
): boolean {
  const existing = checks.get(path)
  if (existing) {
    if (existing.expectedKind !== expectedKind) {
      return false
    }
    existing.missingLeafAllowed = existing.missingLeafAllowed && missingLeafAllowed
    return true
  }
  checks.set(path, { path, expectedKind, missingLeafAllowed })
  return true
}
