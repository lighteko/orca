import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import ts from 'typescript-api'

const root = resolve(import.meta.dirname, '../..')
const contractSourceCommit = 'd27fe24e5cead1fae9ba86ac7b57ac5decf067d9'
const packageName = '@lighteko/ticket-workspace-contracts'
const packageVersion = '1.0.0'
const files = [
  {
    path: 'config/ticket-workspace-contracts-v1/lighteko-ticket-workspace-contracts-1.0.0.tgz',
    sizeBytes: 18108,
    sha256: '521b32fcfce7e464b7f04ca1945b72311311a9ba362902462bca77bbee361183'
  },
  {
    path: 'config/ticket-workspace-fixture-v1/README.md',
    sizeBytes: 3618,
    sha256: '6af6ad3364b33e632652253276da0e349fc2bd00914c260ef22666c3bcef1c10'
  },
  {
    path: 'config/ticket-workspace-fixture-v1/boundary-runtime.mjs',
    sizeBytes: 6095,
    sha256: '657c7eeb10a254ac0cab38ae3b5f309d23f0dccb06e8a801b7ddd389fcc37edb'
  },
  {
    path: 'config/ticket-workspace-fixture-v1/fixture-ipc-corpus-v1.json',
    sizeBytes: 11833,
    sha256: '8306f0181a26365e5c0a7b14018232e95f19a34859c458eceeefb5193ef1638c'
  },
  {
    path: 'config/ticket-workspace-fixture-v1/historical-orca-ipc-boundary-v1.corpus.json',
    sizeBytes: 30632,
    sha256: '52a68df5b1b76692bcfae3561e3f8b7d58133d924d955a2fd569675fe8b49663'
  },
  {
    path: 'config/ticket-workspace-fixture-v1/preload-entry.mjs',
    sizeBytes: 370,
    sha256: '0809847781245f51c5bfd09c6d60d1224175408821547e4c324327fa475a6da8'
  },
  {
    path: 'config/ticket-workspace-fixture-v1/replay.mjs',
    sizeBytes: 16543,
    sha256: '3f84e31eaee6eb59ee7f367ef1d690484f35e711b59bab7d398aebd2dc8457b5'
  }
]

for (const file of files) {
  const bytes = await readFile(join(root, file.path))
  assert.equal(bytes.byteLength, file.sizeBytes, `unexpected size: ${file.path}`)
  assert.equal(sha256(bytes), file.sha256, `unexpected SHA-256: ${file.path}`)
}

const packageEntry = import.meta.resolve(`${packageName}/navigator-snapshot-v1`)
const installedPackage = JSON.parse(
  await readFile(new URL('../package.json', packageEntry), 'utf8')
)
assert.equal(installedPackage.name, packageName)
assert.equal(installedPackage.version, packageVersion)
assert.equal(installedPackage.private, true)
assert.equal(installedPackage.license, 'UNLICENSED')
assert.equal(installedPackage.ticketWorkspaceSourceCommit, contractSourceCommit)

const osTempParent = resolve(tmpdir())
const typesTempParent = resolve(root, 'tmp')
let tempRoot
let typesTempRoot
try {
  tempRoot = await mkdtemp(join(osTempParent, 'orca-ticket-workspace-snapshot-'))
  assertStrictDescendant(osTempParent, tempRoot)
  await mkdir(typesTempParent, { recursive: true })
  typesTempRoot = await mkdtemp(join(typesTempParent, 'orca-ticket-workspace-types-'))
  assertStrictDescendant(typesTempParent, typesTempRoot)

  const bundlePath = join(tempRoot, 'ticket-workspace-fixture-preload.js')
  const typeProbePath = join(typesTempRoot, 'probe.ts')
  await writeFile(
    typeProbePath,
    `
import {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  type TicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  materializeTicketNavigatorSnapshotFixtureV1,
  type TicketNavigatorSnapshotCorpusV1
} from '@lighteko/ticket-workspace-contracts/test-fixtures'

declare const snapshot: TicketNavigatorSnapshotV1
declare const corpus: TicketNavigatorSnapshotCorpusV1
void parseTicketNavigatorSnapshotUtf8V1(serializeTicketNavigatorSnapshotUtf8V1(snapshot))
void materializeTicketNavigatorSnapshotFixtureV1(corpus, corpus.cases[0].input)
`
  )
  const typeProgram = ts.createProgram([typeProbePath], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: []
  })
  const typeDiagnostics = ts.getPreEmitDiagnostics(typeProgram)
  assert.equal(
    typeDiagnostics.length,
    0,
    `TypeScript consumer probe failed:\n${ts.formatDiagnostics(typeDiagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n'
    })}`
  )

  const buildResult = await build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: ['config/ticket-workspace-fixture-v1/preload-entry.mjs'],
    format: 'iife',
    globalName: 'OrcaTicketFixturePreload',
    metafile: true,
    outfile: bundlePath,
    platform: 'browser'
  })
  const inputs = Object.keys(buildResult.metafile.inputs).map((path) => path.replaceAll('\\', '/'))
  const nodeBuiltinInputs = inputs.filter((path) => path.startsWith('node:'))
  const privateSourceInputs = inputs.filter((path) =>
    /(?:^|\/)(?:ticket-workspace\/)?packages\/contracts\/src\//i.test(path)
  )
  const archiveRuntimeInputs = inputs.filter((path) =>
    path.includes('/node_modules/@lighteko/ticket-workspace-contracts/dist/')
  )
  assert.equal(nodeBuiltinInputs.length, 0, 'browser bundle resolved a Node builtin')
  assert.equal(privateSourceInputs.length, 0, 'browser bundle reached private contract source')
  assert.ok(archiveRuntimeInputs.length > 0, 'browser bundle did not use the installed archive')

  console.log(
    JSON.stringify(
      {
        verifiedFiles: files.length,
        declarationProbeDiagnostics: typeDiagnostics.length,
        browserBundleInputs: inputs.length,
        nodeBuiltinInputs: nodeBuiltinInputs.length,
        privateContractSourceInputs: privateSourceInputs.length,
        installedArchiveRuntimeInputs: archiveRuntimeInputs.length
      },
      null,
      2
    )
  )

  const replayPath = resolve(root, 'config/ticket-workspace-fixture-v1/replay.mjs')
  const originalArguments = process.argv.slice(2)
  process.argv.splice(
    2,
    process.argv.length - 2,
    `--contract-source-commit=${contractSourceCommit}`,
    `--preload-bundle=${bundlePath}`
  )
  try {
    await import(pathToFileURL(replayPath).href)
  } finally {
    process.argv.splice(2, process.argv.length - 2, ...originalArguments)
  }
} finally {
  if (typesTempRoot) {
    assertStrictDescendant(typesTempParent, typesTempRoot)
    await rm(typesTempRoot, { force: true, recursive: true })
  }
  if (tempRoot) {
    assertStrictDescendant(osTempParent, tempRoot)
    await rm(tempRoot, { force: true, recursive: true })
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertStrictDescendant(parentPath, targetPath) {
  const relativeTarget = relative(resolve(parentPath), resolve(targetPath))
  assert.ok(
    relativeTarget &&
      relativeTarget !== '..' &&
      !relativeTarget.startsWith(`..${sep}`) &&
      !isAbsolute(relativeTarget),
    `temporary cleanup target must be strictly inside its parent: ${targetPath}`
  )
}
