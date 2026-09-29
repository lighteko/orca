import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import {
  parseTicketNavigatorSnapshotUtf8V1,
  serializeTicketNavigatorSnapshotUtf8V1,
  TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1,
  validateTicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import { materializeTicketNavigatorSnapshotFixtureV1 as materializeTicketContractFixtureV1 } from '@lighteko/ticket-workspace-contracts/test-fixtures'
import {
  decodeFixtureBytes,
  makeFixtureResponse,
  makeMainRequest,
  unavailable,
  validateFixtureResponse,
  validateFixtureUnavailableEnvelope
} from './boundary-runtime.mjs'

const candidate = await readJson(new URL('./fixture-ipc-corpus-v1.json', import.meta.url))
const snapshotCorpusBytes = await readFile(
  new URL(import.meta.resolve('@lighteko/ticket-workspace-contracts/fixtures/ticket-navigator-snapshot-v1.corpus.json'))
)
const snapshotCorpus = JSON.parse(snapshotCorpusBytes.toString('utf8'))
const historicalCorpusBytes = await readFile(
  new URL('./historical-orca-ipc-boundary-v1.corpus.json', import.meta.url)
)
const historicalCorpus = JSON.parse(historicalCorpusBytes.toString('utf8'))
const artifact = await readJson(
  new URL(import.meta.resolve('@lighteko/ticket-workspace-contracts/artifacts/ticket-navigator-snapshot-v1.json'))
)
const contractSourcePin = candidate.source.ticketWorkspaceContractCommit
assert.equal(candidate.source.ticketWorkspaceFixtureSourceCommit, '31b3768e8043b6aeef66f0fe0fe648439ba80b2b')
assert.equal(candidate.source.ticketWorkspaceFixtureSourceTree, '150b23c5c7380f255c86d229a04e8f97c3366987')
const installedPackageEntry = import.meta.resolve('@lighteko/ticket-workspace-contracts/navigator-snapshot-v1')
const installedPackage = await readJson(new URL('../package.json', installedPackageEntry))
assert.equal(installedPackage.name, '@lighteko/ticket-workspace-contracts')
assert.equal(installedPackage.ticketWorkspaceSourceCommit, contractSourcePin)
const preloadBundlePath = readArgument('--preload-bundle=')
const nodeApi = {
  decodeFixtureBytes,
  makeFixtureResponse,
  makeMainRequest,
  unavailable,
  validateFixtureResponse,
  validateFixtureUnavailableEnvelope
}

assert.equal(readArgument('--contract-source-commit='), contractSourcePin)
assert.equal(
  createHash('sha256').update(snapshotCorpusBytes).digest('hex'),
  candidate.source.snapshotCorpusSha256
)
assert.equal(
  createHash('sha256').update(historicalCorpusBytes).digest('hex'),
  candidate.source.historicalBoundaryCorpusSha256
)
assert.equal(artifact.artifactDigest, candidate.source.snapshotArtifactDigest)
assert.equal(artifact.fixture.sha256, candidate.source.snapshotCorpusSha256)
assert.equal(snapshotCorpus.cases.length, 22)
assert.deepEqual(candidate.sourceSnapshotCaseIds, snapshotCorpus.cases.map(({ id }) => id))
assert.equal(historicalCorpus.fixtures.length, candidate.source.historicalBoundaryCaseCount)
assert.deepEqual(
  candidate.legacyCaseCrosswalk.map(({ legacyId }) => legacyId),
  historicalCorpus.fixtures.map(({ id }) => id)
)

const preparedCases = snapshotCorpus.cases.map((fixtureCase) => {
  const value = materializeTicketContractFixtureV1(snapshotCorpus, fixtureCase.input)
  const options = { writeRequested: fixtureCase.input.context?.writeRequested }
  const validation = typeof value === 'string'
    ? parseTicketNavigatorSnapshotUtf8V1(value, options)
    : validateTicketNavigatorSnapshotV1(value, options)
  assert.equal(validation.schemaVerdict, fixtureCase.expected.schemaVerdict, fixtureCase.id)
  assert.equal(
    validation.reasonCode,
    fixtureCase.expected.schemaVerdict === 'rejected'
      ? fixtureCase.expected.reasonCode
      : 'compatible',
    fixtureCase.id
  )
  return { fixtureCase, value, validation }
})

const snapshotRevisionByCaseId = Object.fromEntries(
  preparedCases.flatMap(({ fixtureCase, validation }) =>
    validation.schemaVerdict === 'accepted'
      ? [[fixtureCase.id, validation.value.snapshotRevision]]
      : []
  )
)
const expected = {
  artifactDigest: artifact.artifactDigest,
  ticketWorkspaceContractCommit: contractSourcePin,
  snapshotCorpusSha256: candidate.source.snapshotCorpusSha256,
  snapshotCaseIds: candidate.sourceSnapshotCaseIds,
  snapshotRevisionByCaseId
}
const executedSnapshotCases = new Set()
const sourceOutcomes = preparedCases.map(({ fixtureCase, value, validation }) => {
  const wire = makeWire(
    value,
    fixtureCase.id,
    expected,
    artifact.artifactDigest,
    validation.schemaVerdict === 'accepted'
  )
  const parsedWire = parseTicketNavigatorSnapshotUtf8V1(wire.payloadUtf8)
  assert.equal(parsedWire.schemaVerdict, fixtureCase.expected.schemaVerdict, fixtureCase.id)
  if (validation.schemaVerdict === 'accepted') {
    assert.equal(wire.payloadUtf8, serializeTicketNavigatorSnapshotUtf8V1(validation.value))
    assert.equal(parsedWire.value.snapshotRevision, validation.value.snapshotRevision)
  }
  const nodeResult = validateFixtureResponse(wire, expected)
  assert.equal(
    nodeResult.status,
    fixtureCase.expected.schemaVerdict === 'accepted' ? 'fixture' : 'unavailable',
    fixtureCase.id
  )
  assertFixtureSafety(nodeResult, fixtureCase.id)
  executedSnapshotCases.add('snapshot:' + fixtureCase.id)
  return { fixtureCase, value, validation, wire, nodeResult }
})

const nodeEnvelopeCases = verifyEnvelopeCases(nodeApi, expected, sourceOutcomes)
const executedCases = new Set([...executedSnapshotCases, ...nodeEnvelopeCases])
for (const legacy of candidate.legacyCaseCrosswalk) {
  if (legacy.disposition.startsWith('deferred-to-')) {
    assert.equal(typeof legacy.reason, 'string', legacy.legacyId)
    continue
  }
  if (legacy.liveAssertion) {
    assert.equal(legacy.liveAssertion, 'deferred-to-TW-06P/T', legacy.legacyId)
  }
  assert.ok(executedCases.has(legacy.replacement), legacy.legacyId + ' -> ' + legacy.replacement)
}

const preload = await runBrowserChecks(
  preloadBundlePath,
  expected,
  sourceOutcomes,
  nodeEnvelopeCases
)
console.log(JSON.stringify({
  contractSourcePinProvidedByCaller: contractSourcePin,
  snapshotCorpusSha256: candidate.source.snapshotCorpusSha256,
  historicalCorpusSha256: candidate.source.historicalBoundaryCorpusSha256,
  snapshotCases: sourceOutcomes.length,
  historicalBoundaryRows: historicalCorpus.fixtures.length,
  deferredLiveRows: candidate.legacyCaseCrosswalk.filter((row) => row.disposition === 'deferred-to-TW-06P/T').length,
  liveFreshnessAssertionsDeferred: candidate.legacyCaseCrosswalk.filter((row) => row.liveAssertion).length,
  m5PresentationProjection: candidate.fixtureResultRules.m5PresentationProjection,
  fixtureEnvelopeCases: nodeEnvelopeCases.size,
  node: 'passed',
  sandboxedPreload: preload.status,
  orcaMatch: 'not-evaluated'
}, null, 2))

function verifyEnvelopeCases(api, metadata, outcomes) {
  const executed = new Set()
  const valid = outcomes.find(({ fixtureCase }) => fixtureCase.id === 'accepted-full-snapshot')
  const alternate = outcomes.find(({ fixtureCase }) => fixtureCase.id === 'accepted-minimal-snapshot')
  assert.ok(valid?.wire)
  assert.ok(alternate?.wire)
  const response = valid.wire

  assert.equal(
    normalizedJson(api.makeMainRequest([])),
    normalizedJson({ accepted: true, request: { contractVersion: 1 } })
  )
  assert.equal(api.makeMainRequest([{ path: 'forbidden' }]).accepted, false)
  executed.add('ipc:zero-argument-request')
  assert.equal(api.validateFixtureResponse(response, metadata).status, 'fixture')
  executed.add('ipc:valid-fixture-envelope')

  const boundedUnavailable = makeUnavailableWire(metadata)
  assert.equal(api.validateFixtureUnavailableEnvelope(boundedUnavailable, metadata), true)
  const unavailableResult = api.validateFixtureResponse(boundedUnavailable, metadata)
  assertFixtureSafety(unavailableResult, 'ipc:bounded-unavailable')
  assert.equal(unavailableResult.status, 'unavailable')
  executed.add('ipc:bounded-unavailable')

  const exactDiagnostic = '\uAC00'.repeat(1365) + 'a'
  assert.equal(new TextEncoder().encode(exactDiagnostic).byteLength, 4096)
  assert.equal(
    api.validateFixtureUnavailableEnvelope(makeUnavailableWire(metadata, exactDiagnostic), metadata),
    true
  )
  executed.add('ipc:diagnostic-exact-4kib-utf8')
  const oversizedDiagnostic = '\uAC00'.repeat(1366)
  assert.equal(new TextEncoder().encode(oversizedDiagnostic).byteLength, 4098)
  const oversizedDiagnosticWire = makeUnavailableWire(metadata, oversizedDiagnostic)
  assert.equal(api.validateFixtureUnavailableEnvelope(oversizedDiagnosticWire, metadata), false)
  assertFixtureSafety(
    api.validateFixtureResponse(oversizedDiagnosticWire, metadata),
    'ipc:diagnostic-over-4kib-multibyte'
  )
  executed.add('ipc:diagnostic-over-4kib-multibyte')

  assert.equal(api.validateFixtureResponse({ ...response, unknownField: true }, metadata).status, 'unavailable')
  executed.add('ipc:unknown-envelope-field')
  const missingProvenance = { ...response }
  delete missingProvenance.provenance
  assert.equal(api.validateFixtureResponse(missingProvenance, metadata).status, 'unavailable')
  executed.add('ipc:missing-fixture-provenance')
  assert.equal(api.validateFixtureResponse({ ...response, contractVersion: 2 }, metadata).status, 'unavailable')
  executed.add('ipc:unknown-contract-version')
  assert.equal(api.validateFixtureResponse({ ...response, artifactDigest: '0'.repeat(64) }, metadata).status, 'unavailable')
  executed.add('ipc:artifact-digest-mismatch')

  const badByteCount = {
    ...response,
    provenance: { ...response.provenance, payloadUtf8Bytes: 1 }
  }
  assert.equal(api.validateFixtureResponse(badByteCount, metadata).status, 'unavailable')
  executed.add('ipc:utf8-byte-count-mismatch')
  const badRevision = {
    ...response,
    provenance: { ...response.provenance, snapshotRevision: '0'.repeat(64) }
  }
  assert.equal(api.validateFixtureResponse(badRevision, metadata).status, 'unavailable')
  executed.add('ipc:provenance-snapshot-revision-mismatch')
  const swappedCaseId = {
    ...response,
    provenance: { ...response.provenance, snapshotCaseId: alternate.fixtureCase.id }
  }
  assert.equal(api.validateFixtureResponse(swappedCaseId, metadata).status, 'unavailable')
  executed.add('ipc:swapped-case-id')

  assert.equal(api.decodeFixtureBytes([0xc3, 0x28], response, metadata).status, 'unavailable')
  executed.add('ipc:invalid-utf8')
  const oversizedPayload = '"' + '\uAC00'.repeat(699051) + '"'
  const oversizedResponse = {
    ...response,
    payloadUtf8: oversizedPayload,
    provenance: {
      ...response.provenance,
      payloadUtf8Bytes: new TextEncoder().encode(oversizedPayload).byteLength
    }
  }
  assert.equal(api.validateFixtureResponse(oversizedResponse, metadata).status, 'unavailable')
  executed.add('ipc:multibyte-over-2mib')
  assertOversizedByteArrayBypass(api, response, metadata)
  executed.add('ipc:oversized-byte-array-rejected-before-decode')
  return executed
}

async function runBrowserChecks(bundlePath, metadata, outcomes, expectedEnvelopeCases) {
  assert.ok(bundlePath, 'Pass the representative browser-target preload bundle explicitly')
  const source = await readFile(bundlePath, 'utf8')
  const decoderStats = { calls: 0 }
  const byteArrayStats = { fromCalls: 0 }
  class BrowserTextDecoder extends TextDecoder {
    constructor(...argumentsList) {
      super(...argumentsList)
      decoderStats.calls += 1
    }
  }
  class BrowserUint8Array extends Uint8Array {}
  BrowserUint8Array.from = (...argumentsList) => {
    byteArrayStats.fromCalls += 1
    return Uint8Array.from(...argumentsList)
  }
  const sandbox = {
    TextEncoder,
    TextDecoder: BrowserTextDecoder,
    Uint8Array: BrowserUint8Array,
    ArrayBuffer
  }
  runInNewContext(source, sandbox)
  const api = sandbox.orcaTicketFixturePreload
  assert.ok(api)
  for (const { fixtureCase, wire, nodeResult } of outcomes) {
    const actual = api.validateFixtureResponse(wire, metadata)
    assert.equal(
      normalizedJson(actual),
      normalizedJson(nodeResult),
      'preload parity:' + fixtureCase.id
    )
    assertFixtureSafety(actual, 'preload:' + fixtureCase.id)
  }
  const browserEnvelopeCases = verifyEnvelopeCases(api, metadata, outcomes)
  assert.deepEqual([...browserEnvelopeCases].sort(), [...expectedEnvelopeCases].sort())
  assertOversizedByteArrayBypass(api, outcomes[0].wire, metadata, {
    decoderStats,
    byteArrayStats
  })
  assert.equal(sandbox.Buffer, undefined)
  assert.equal(sandbox.process, undefined)
  assert.equal(sandbox.require, undefined)
  return { status: 'passed', caseCount: outcomes.length }
}

function assertOversizedByteArrayBypass(api, response, metadata, browserStats) {
  const oversizedBytes = []
  oversizedBytes.length = TICKET_SNAPSHOT_MAX_UTF8_BYTES_V1 + 1
  let decoderCalls = 0
  let fromCalls = 0
  const originalTextDecoder = globalThis.TextDecoder
  const originalFrom = Uint8Array.from
  try {
    globalThis.TextDecoder = class extends originalTextDecoder {
      constructor(...argumentsList) {
        super(...argumentsList)
        decoderCalls += 1
      }
    }
    Uint8Array.from = (...argumentsList) => {
      fromCalls += 1
      return originalFrom(...argumentsList)
    }
    if (browserStats) {
      browserStats.decoderStats.calls = 0
      browserStats.byteArrayStats.fromCalls = 0
    }
    assert.equal(api.decodeFixtureBytes(oversizedBytes, response, metadata).status, 'unavailable')
  } finally {
    globalThis.TextDecoder = originalTextDecoder
    Uint8Array.from = originalFrom
  }
  assert.equal(decoderCalls, 0)
  assert.equal(fromCalls, 0)
  if (browserStats) {
    assert.equal(browserStats.decoderStats.calls, 0)
    assert.equal(browserStats.byteArrayStats.fromCalls, 0)
  }
}

function makeWire(value, caseId, metadata, artifactDigest, accepted) {
  if (accepted) {
    return makeFixtureResponse(value, {
      ticketWorkspaceContractCommit: metadata.ticketWorkspaceContractCommit,
      snapshotCorpusSha256: metadata.snapshotCorpusSha256,
      snapshotCaseId: caseId
    }, artifactDigest)
  }
  const payloadUtf8 = typeof value === 'string'
    ? value
    : serializeTicketNavigatorSnapshotUtf8V1(value)
  const parsedValue = parseJsonOrUndefined(payloadUtf8)
  return {
    contractVersion: 1,
    artifactDigest,
    provenance: {
      kind: 'fixture',
      ticketWorkspaceContractCommit: metadata.ticketWorkspaceContractCommit,
      snapshotCorpusSha256: metadata.snapshotCorpusSha256,
      snapshotCaseId: caseId,
      snapshotRevision:
        isRecord(parsedValue) && typeof parsedValue.snapshotRevision === 'string'
          ? parsedValue.snapshotRevision
          : '0'.repeat(64),
      payloadUtf8Bytes: new TextEncoder().encode(payloadUtf8).byteLength
    },
    payloadUtf8
  }
}

function makeUnavailableWire(metadata, diagnostic) {
  return {
    status: 'unavailable',
    contractVersion: 1,
    artifactDigest: metadata.artifactDigest,
    scope: 'tickets-only',
    reason: 'boundary_response_invalid',
    retryable: false,
    ...(diagnostic === undefined ? {} : { diagnostic })
  }
}

function assertFixtureSafety(result, label) {
  assert.ok(result.status === 'fixture' || result.status === 'unavailable', label)
  assert.equal(result.provenance.kind, 'fixture', label)
  assert.equal(JSON.stringify(result.orcaMatch), '{"status":"not-evaluated"}', label)
  assert.equal(Object.hasOwn(result, 'snapshot'), false, label)
  assert.equal(Object.hasOwn(result, 'visibleActions'), false, label)
  assert.equal(Object.hasOwn(result, 'diagnostic'), false, label)
  assert.equal(/mutationAllowed|"clear"/i.test(JSON.stringify(result)), false, label)
}

function normalizedJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(normalizedJson(item))))
  if (isRecord(value)) {
    const normalized = Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, JSON.parse(normalizedJson(value[key]))])
    )
    return JSON.stringify(normalized)
  }
  return JSON.stringify(value)
}

function parseJsonOrUndefined(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'))
}

function readArgument(prefix) {
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix))
  return value?.slice(prefix.length)
}
