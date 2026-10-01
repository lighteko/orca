import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const projectDir = resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const { createPackagedRuntimeNodeModuleResources } = require('../packaged-runtime-node-modules.cjs')
const readProject = (file) => readFileSync(join(projectDir, file), 'utf8')
const packageJson = JSON.parse(readProject('package.json'))
const pnpmWorkspace = parse(readProject('pnpm-workspace.yaml'))
const windowsAddonsInstalled = existsSync(
  join(projectDir, 'node_modules', '@vscode', 'windows-process-tree', 'package.json')
)
const packageTargets = {
  win32: windowsAddonsInstalled ? createPackagedRuntimeNodeModuleResources('win32') : [],
  darwin: createPackagedRuntimeNodeModuleResources('darwin'),
  linux: createPackagedRuntimeNodeModuleResources('linux')
}

describe('Windows native path evidence package contract', () => {
  it('packages the no-follow path evidence addon only for Windows', () => {
    const rebuildScript = readProject('config/scripts/rebuild-native-deps.mjs')
    const ensureScript = readProject('config/scripts/ensure-native-runtime.mjs')
    const packageRuntimeSource = readProject('config/packaged-runtime-node-modules.cjs')
    const nativeSource = readProject('native/windows-path-evidence/src/addon.cc')
    expect(packageJson.optionalDependencies['@orca/windows-path-evidence']).toBe('workspace:*')
    expect(pnpmWorkspace.allowBuilds['@orca/windows-path-evidence']).toBe(false)
    expect(pnpmWorkspace.packages).toContain('native/windows-path-evidence')
    expect(JSON.parse(readProject('native/windows-path-evidence/package.json')).os).toEqual([
      'win32'
    ])
    expect(rebuildScript).toContain("'@orca/windows-path-evidence'")
    expect(ensureScript).toContain("'@orca/windows-path-evidence'")
    expect(packageRuntimeSource).toContain('orca_windows_path_evidence.node')
    expect(nativeSource).toContain('QueryDosDeviceW')
    expect(nativeSource).toContain('kDeviceTargetMaxChars')
    expect(nativeSource).toContain('FILE_FLAG_OPEN_REPARSE_POINT')
    expect(nativeSource).toContain('GetFileInformationByHandleEx')
    expect(nativeSource).toContain('error == ERROR_FILE_NOT_FOUND ? kMissing : kUnavailable')
    if (windowsAddonsInstalled) {
      expect(packageTargets.win32).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ to: join('node_modules', '@orca', 'windows-path-evidence') }),
          expect.objectContaining({ to: join('node_modules', 'node-addon-api') })
        ])
      )
    }
    for (const platform of ['darwin', 'linux']) {
      expect(packageTargets[platform]).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ to: join('node_modules', '@orca', 'windows-path-evidence') })
        ])
      )
    }
  })

  it('loads the optional addon lazily from the Windows marker reader', () => {
    const markerReader = readProject('src/main/git/native-git-operation-marker-capture.ts')
    const loader = readProject('src/main/git/windows-native-path-evidence-loader.ts')
    expect(markerReader).not.toContain("from '@orca/windows-path-evidence'")
    expect(loader).toContain('createRequire(__filename)')
    expect(loader).toContain("requireFromMain('@orca/windows-path-evidence')")
    expect(loader).toContain("process.platform !== 'win32'")
  })
})
