import { createHash } from 'node:crypto'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { OrcaRuntimeService } from '../orca-runtime'

const WORKER_CALLER_PAYLOAD_V2_PREFIX = 'worker-caller-v2'
const WORKER_CALLER_PAYLOAD_V3_PREFIX = 'worker-caller-v3'
const CALLER_BINDING_PROPERTIES = ['from', 'callerTerminalHandle', 'terminal'] as const

type CallerBindingProperty = (typeof CALLER_BINDING_PROPERTIES)[number]

type CallerBindingIdentity = {
  rawHash: string | null
  stableHash: string | null
}

export type WorkerCallerPayloadIdentity = {
  bindings: Record<CallerBindingProperty, CallerBindingIdentity>
  businessHash: string
  hasUnresolvedBinding: boolean
  payloadHash: string
  rawHash: string
  stableHash: string
}

type ResolvedCallerParams = {
  bindings: Record<CallerBindingProperty, CallerBindingIdentity>
  hasUnresolvedBinding: boolean
  params: unknown
}

export function replayStableCallerParams(runtime: OrcaRuntimeService, params: unknown): unknown {
  return resolveReplayStableCallerParams(runtime, params).params
}

export function createWorkerCallerPayloadIdentity(
  runtime: OrcaRuntimeService,
  method: string,
  params: unknown
): WorkerCallerPayloadIdentity {
  const stable = resolveReplayStableCallerParams(runtime, params)
  const stableHash = hashCanonical({ method, params: stable.params })
  const rawHash = hashCanonical({ method, params: replayRawCallerParams(params) })
  const businessHash = hashCanonical({ method, params: workerBusinessParams(params) })
  const bindingHashes = CALLER_BINDING_PROPERTIES.flatMap((property) => {
    const binding = stable.bindings[property]
    return [binding.stableHash ?? '-', binding.rawHash ?? '-']
  })
  return {
    bindings: stable.bindings,
    businessHash,
    hasUnresolvedBinding: stable.hasUnresolvedBinding,
    payloadHash: [WORKER_CALLER_PAYLOAD_V3_PREFIX, businessHash, ...bindingHashes].join(':'),
    rawHash,
    stableHash
  }
}

export function matchesWorkerCallerPayloadHash(
  recordedHash: string,
  candidate: WorkerCallerPayloadIdentity
): boolean {
  const fields = recordedHash.split(':')
  if (fields[0] === WORKER_CALLER_PAYLOAD_V3_PREFIX) {
    return matchesV3WorkerCallerPayload(fields, candidate)
  }
  if (fields[0] === WORKER_CALLER_PAYLOAD_V2_PREFIX) {
    return matchesV2WorkerCallerPayload(fields, candidate)
  }
  return recordedHash === candidate.stableHash
}

export function hashCanonical(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

function resolveReplayStableCallerParams(
  runtime: OrcaRuntimeService,
  params: unknown
): ResolvedCallerParams {
  const emptyBindings = createEmptyBindings()
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { bindings: emptyBindings, hasUnresolvedBinding: false, params }
  }
  const source: Record<string, unknown> = { ...params }
  const result = { ...source }
  const bindings = createEmptyBindings()
  let hasUnresolvedBinding = false
  delete result.waitSubmitMs
  for (const property of CALLER_BINDING_PROPERTIES) {
    const handle = source[property]
    if (typeof handle !== 'string') {
      continue
    }
    const rawHash = hashCanonical(handle)
    const paneKey =
      property === 'from' && typeof source.senderPaneKey === 'string'
        ? source.senderPaneKey
        : runtime.getTerminalPaneKey(handle)
    if (!paneKey) {
      bindings[property] = { rawHash, stableHash: null }
      hasUnresolvedBinding = true
      continue
    }
    const leafId = parsePaneKey(paneKey)?.leafId
    const stableBinding = leafId ? { paneLeafId: leafId } : { paneKey }
    result[property] = stableBinding
    bindings[property] = { rawHash, stableHash: hashCanonical(stableBinding) }
  }
  return { bindings, hasUnresolvedBinding, params: result }
}

function createEmptyBindings(): Record<CallerBindingProperty, CallerBindingIdentity> {
  return {
    callerTerminalHandle: { rawHash: null, stableHash: null },
    from: { rawHash: null, stableHash: null },
    terminal: { rawHash: null, stableHash: null }
  }
}

function replayRawCallerParams(params: unknown): unknown {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params
  }
  const result: Record<string, unknown> = { ...params }
  delete result.waitSubmitMs
  return result
}

function workerBusinessParams(params: unknown): unknown {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params
  }
  const result: Record<string, unknown> = { ...params }
  delete result.waitSubmitMs
  delete result.senderPaneKey
  for (const property of CALLER_BINDING_PROPERTIES) {
    delete result[property]
  }
  return result
}

function matchesV3WorkerCallerPayload(
  fields: string[],
  candidate: WorkerCallerPayloadIdentity
): boolean {
  if (fields.length !== 8 || fields[1] !== candidate.businessHash) {
    return false
  }
  return CALLER_BINDING_PROPERTIES.every((property, index) => {
    const recordedStableHash = fields[2 + index * 2]
    const recordedRawHash = fields[3 + index * 2]
    const binding = candidate.bindings[property]
    if (binding.rawHash === null) {
      return recordedStableHash === '-' && recordedRawHash === '-'
    }
    return binding.stableHash === null
      ? recordedRawHash === binding.rawHash
      : recordedStableHash === binding.stableHash
  })
}

function matchesV2WorkerCallerPayload(
  fields: string[],
  candidate: WorkerCallerPayloadIdentity
): boolean {
  if (fields.length !== 3) {
    return false
  }
  const presentBindings = CALLER_BINDING_PROPERTIES.map(
    (property) => candidate.bindings[property]
  ).filter((binding) => binding.rawHash !== null)
  if (presentBindings.every((binding) => binding.stableHash !== null)) {
    return fields[1] === candidate.stableHash
  }
  if (presentBindings.every((binding) => binding.stableHash === null)) {
    return fields[2] === candidate.rawHash
  }
  return false
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    if (source[key] !== undefined) {
      result[key] = canonicalize(source[key])
    }
  }
  return result
}
