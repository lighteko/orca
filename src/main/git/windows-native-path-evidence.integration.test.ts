import { createRequire } from 'node:module'
import { win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  WINDOWS_FILE_ATTRIBUTE_DIRECTORY,
  WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT
} from './windows-native-volume-path-proof'

describe.runIf(process.platform === 'win32')('Windows native path evidence addon', () => {
  it('proves the current drive target and opens its GLOBALROOT volume without following reparse points', async () => {
    const requireNative = createRequire(import.meta.url)
    const native: unknown = requireNative('@orca/windows-path-evidence')
    if (native === null || typeof native !== 'object') {
      throw new Error('Windows native path evidence addon is unavailable')
    }
    const queryDosDeviceTarget = Reflect.get(native, 'queryDosDeviceTarget')
    const inspectPathEntry = Reflect.get(native, 'inspectPathEntry')
    if (typeof queryDosDeviceTarget !== 'function' || typeof inspectPathEntry !== 'function') {
      throw new Error('Windows native path evidence addon exports are unavailable')
    }
    const drive = win32.parse(process.cwd()).root.slice(0, 2)
    const target: unknown = await Reflect.apply(queryDosDeviceTarget, native, [drive])
    if (typeof target !== 'string') {
      throw new Error('The current drive did not resolve to a local volume')
    }
    expect(target).toMatch(/^\\Device\\HarddiskVolume[0-9]+$/i)

    const volumeRoot = `\\\\?\\GLOBALROOT${target}\\`
    const entry: unknown = await Reflect.apply(inspectPathEntry, native, [volumeRoot])
    const status = entry !== null && typeof entry === 'object' ? Reflect.get(entry, 'status') : null
    expect(status).toBe('entry')
    if (entry === null || typeof entry !== 'object') {
      return
    }
    const attributes: unknown = Reflect.get(entry, 'attributes')
    if (status !== 'entry' || typeof attributes !== 'number') {
      return
    }
    expect(attributes & WINDOWS_FILE_ATTRIBUTE_DIRECTORY).not.toBe(0)
    expect(attributes & WINDOWS_FILE_ATTRIBUTE_REPARSE_POINT).toBe(0)
  })
})
