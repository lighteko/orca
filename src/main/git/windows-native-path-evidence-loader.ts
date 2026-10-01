import { createRequire } from 'node:module'
import type { WindowsPathEntryEvidence } from './windows-native-volume-path-proof'

export type WindowsNativePathEvidenceApi = {
  queryDosDeviceTarget: (drive: string) => Promise<string | null>
  inspectPathEntry: (path: string) => Promise<WindowsPathEntryEvidence>
}

const requireFromMain = createRequire(__filename)
let cachedWindowsNativePathEvidence: WindowsNativePathEvidenceApi | null | undefined

export function loadWindowsNativePathEvidence(): WindowsNativePathEvidenceApi | null {
  if (cachedWindowsNativePathEvidence !== undefined) {
    return cachedWindowsNativePathEvidence
  }
  if (process.platform !== 'win32') {
    cachedWindowsNativePathEvidence = null
    return cachedWindowsNativePathEvidence
  }
  try {
    const native: unknown = requireFromMain('@orca/windows-path-evidence')
    if (native === null || typeof native !== 'object') {
      cachedWindowsNativePathEvidence = null
      return cachedWindowsNativePathEvidence
    }
    const queryDosDeviceTarget = Reflect.get(native, 'queryDosDeviceTarget')
    const inspectPathEntry = Reflect.get(native, 'inspectPathEntry')
    if (typeof queryDosDeviceTarget !== 'function' || typeof inspectPathEntry !== 'function') {
      cachedWindowsNativePathEvidence = null
      return cachedWindowsNativePathEvidence
    }
    cachedWindowsNativePathEvidence = {
      queryDosDeviceTarget: async (drive) => {
        try {
          const target: unknown = await Reflect.apply(queryDosDeviceTarget, native, [drive])
          return typeof target === 'string' ? target : null
        } catch {
          return null
        }
      },
      inspectPathEntry: async (path) => {
        try {
          const evidence: unknown = await Reflect.apply(inspectPathEntry, native, [path])
          if (evidence === null || typeof evidence !== 'object') {
            return { status: 'unavailable' }
          }
          const status = Reflect.get(evidence, 'status')
          if (status === 'missing') {
            return { status: 'missing' }
          }
          if (status !== 'entry') {
            return { status: 'unavailable' }
          }
          const attributes: unknown = Reflect.get(evidence, 'attributes')
          const reparseTag: unknown = Reflect.get(evidence, 'reparseTag')
          return typeof attributes === 'number' &&
            Number.isSafeInteger(attributes) &&
            attributes >= 0 &&
            typeof reparseTag === 'number' &&
            Number.isSafeInteger(reparseTag) &&
            reparseTag >= 0
            ? { status, attributes, reparseTag }
            : { status: 'unavailable' }
        } catch {
          return { status: 'unavailable' }
        }
      }
    }
  } catch {
    cachedWindowsNativePathEvidence = null
  }
  return cachedWindowsNativePathEvidence
}
