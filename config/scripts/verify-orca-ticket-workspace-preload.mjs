import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { serializeTicketNavigatorSnapshotUtf8V1 } from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { materializeTicketNavigatorSnapshotFixtureV1 } from '@lighteko/ticket-workspace-contracts/test-fixtures'

const root = resolve(import.meta.dirname, '../..')
const bundlePath = resolve(root, 'out/preload/index.js')
const bundle = await readFile(bundlePath, 'utf8')
const corpus = await readJson(
  new URL(
    import.meta
      .resolve('@lighteko/ticket-workspace-contracts/fixtures/ticket-navigator-snapshot-v1.corpus.json')
  )
)
const envelopeCorpus = await readJson(
  resolve(root, 'config/ticket-workspace-fixture-v1/fixture-ipc-corpus-v1.json')
)
const source = envelopeCorpus.source
const bundledParserVerdictCounts = { accepted: 0, blocked: 0, rejected: 0 }
let response
let invokeFailure
let exposedApi
const invokeCalls = []
const rendererWindow = {
  addEventListener() {},
  removeEventListener() {},
  top: null
}
rendererWindow.top = rendererWindow
const electron = {
  contextBridge: {
    exposeInMainWorld(name, api) {
      assert.equal(name, 'api')
      exposedApi = api
    }
  },
  ipcRenderer: {
    invoke: async (channel, ...args) => {
      invokeCalls.push({ channel, args })
      if (invokeFailure !== undefined) {
        throw invokeFailure
      }
      return response
    },
    on() {},
    removeListener() {},
    send() {}
  },
  webUtils: { getPathForFile: () => '' }
}
const sandbox = {
  Buffer,
  TextDecoder,
  TextEncoder,
  clearTimeout,
  console,
  document: { addEventListener() {} },
  process: { contextIsolated: true, env: {}, platform: process.platform },
  require: (specifier) => {
    if (specifier === 'electron') {
      return electron
    }
    throw new Error(`Unexpected external preload import: ${specifier}`)
  },
  setTimeout,
  window: rendererWindow
}
sandbox.globalThis = sandbox

runInNewContext(bundle, sandbox, { filename: 'out/preload/index.js' })
assert.ok(exposedApi, 'actual Orca preload did not expose window.api')
assert.equal(typeof exposedApi.ticketWorkspace.getSnapshot, 'function')
assert.equal(
  typeof sandbox.parseTicketNavigatorSnapshotUtf8V1,
  'function',
  'actual preload bundle does not expose its internal parser to the VM context'
)
assert.equal(Object.hasOwn(exposedApi, 'parseTicketNavigatorSnapshotUtf8V1'), false)

for (const fixtureCase of corpus.cases) {
  const materialized = materializeTicketNavigatorSnapshotFixtureV1(corpus, fixtureCase.input)
  const payloadUtf8 =
    typeof materialized === 'string'
      ? materialized
      : serializeTicketNavigatorSnapshotUtf8V1(materialized)
  const validation = sandbox.parseTicketNavigatorSnapshotUtf8V1(payloadUtf8)
  assert.equal(validation.schemaVerdict, fixtureCase.expected.schemaVerdict, fixtureCase.id)
  if (fixtureCase.expected.schemaVerdict === 'rejected') {
    assert.equal(validation.reasonCode, fixtureCase.expected.reasonCode, fixtureCase.id)
  }
  bundledParserVerdictCounts[validation.schemaVerdict] += 1
}

const fullCase = corpus.cases.find(({ id }) => id === 'accepted-full-snapshot')
assert.ok(fullCase, 'fixture corpus is missing accepted-full-snapshot')
const fullSnapshot = materializeTicketNavigatorSnapshotFixtureV1(corpus, fullCase.input)
const fullPayloadUtf8 =
  typeof fullSnapshot === 'string'
    ? fullSnapshot
    : serializeTicketNavigatorSnapshotUtf8V1(fullSnapshot)
response = makeWireResponse(fullCase.id, fullPayloadUtf8, readSnapshotRevision(fullSnapshot))
const fullResult = await exposedApi.ticketWorkspace.getSnapshot()
assert.equal(fullResult.status, 'fixture')
if (fullResult.status !== 'fixture') {
  throw new Error('The active full fixture was unexpectedly unavailable')
}
assert.equal(fullResult.provenance.snapshotCaseId, 'accepted-full-snapshot')
assert.equal(fullResult.orcaMatch.status, 'not-evaluated')
assert.equal(fullResult.tickets.length > 0, true)
assert.deepEqual(invokeCalls.at(-1), {
  channel: 'ticketWorkspace:getFixtureSnapshot',
  args: []
})

invokeFailure = new Error('private transport detail')
const rejectedInvokeResult = await exposedApi.ticketWorkspace.getSnapshot()
assert.equal(
  JSON.stringify(rejectedInvokeResult),
  JSON.stringify({
    status: 'unavailable',
    scope: 'tickets-only',
    provenance: { kind: 'fixture' },
    orcaMatch: { status: 'not-evaluated' }
  })
)
assert.deepEqual(invokeCalls.at(-1), {
  channel: 'ticketWorkspace:getFixtureSnapshot',
  args: []
})

console.log(
  JSON.stringify(
    {
      bundleBytes: Buffer.byteLength(bundle),
      fixtureCases: corpus.cases.length,
      bundledParserVerdicts: bundledParserVerdictCounts,
      rejectedIpcCall: 'unavailable',
      actualOrcaPreload: 'passed',
      exposedApiKeys: Object.keys(exposedApi).length
    },
    null,
    2
  )
)

function makeWireResponse(snapshotCaseId, payloadUtf8, snapshotRevision) {
  return {
    contractVersion: 1,
    artifactDigest: source.snapshotArtifactDigest,
    provenance: {
      kind: 'fixture',
      ticketWorkspaceContractCommit: source.ticketWorkspaceContractCommit,
      snapshotCorpusSha256: source.snapshotCorpusSha256,
      snapshotCaseId,
      snapshotRevision,
      payloadUtf8Bytes: new TextEncoder().encode(payloadUtf8).byteLength
    },
    payloadUtf8
  }
}

function readSnapshotRevision(value) {
  let snapshot = value
  if (typeof value === 'string') {
    try {
      snapshot = JSON.parse(value)
    } catch {
      return ''
    }
  }
  return snapshot !== null &&
    typeof snapshot === 'object' &&
    typeof snapshot.snapshotRevision === 'string'
    ? snapshot.snapshotRevision
    : ''
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'))
}
