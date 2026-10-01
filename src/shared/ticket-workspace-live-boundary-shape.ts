const sourceIdentityKeys = [
  'authorityId',
  'ledgerEpoch',
  'ledgerRevision',
  'projectionSequence',
  'catalogDigest'
] as const
const workspaceKeys = ['repositoryId', 'label', 'role', 'actualState'] as const
const ticketKeys = ['ticketKey', 'label', 'lifecycle', 'availability', 'workspaces'] as const
const selectionKeys = [
  'requestId',
  'receiptId',
  'snapshotRevision',
  'sourceIdentity',
  'ticketKey',
  'repositoryId'
] as const

export function hasExactPresentationRequestShape(value: unknown): boolean {
  return hasExactKeys(value, ['requestId'])
}

export function hasExactSelectionRequestShape(value: unknown): boolean {
  return hasExactKeys(value, selectionKeys) && hasExactSourceIdentity(value.sourceIdentity)
}

export function hasExactPresentationResponseShape(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false
  }
  if (value.status === 'current') {
    return (
      hasExactKeys(value, [
        'status',
        'requestId',
        'receiptId',
        'snapshotRevision',
        'sourceIdentity',
        'currentnessRemainingMs',
        'tickets'
      ]) &&
      hasExactSourceIdentity(value.sourceIdentity) &&
      hasExactTickets(value.tickets)
    )
  }
  if (value.status === 'stale') {
    return (
      hasExactKeys(value, [
        'status',
        'requestId',
        'receiptId',
        'snapshotRevision',
        'sourceIdentity',
        'tickets'
      ]) &&
      hasExactSourceIdentity(value.sourceIdentity) &&
      hasExactTickets(value.tickets)
    )
  }
  return hasExactKeys(value, ['status', 'requestId'])
}

export function hasExactMatchResponseShape(value: unknown): boolean {
  return (
    hasExactKeys(value, [...selectionKeys, 'status']) &&
    hasExactSourceIdentity(value.sourceIdentity)
  )
}

export function hasExactRebindResponseShape(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false
  }
  return value.status === 'rebound'
    ? hasExactKeys(value, [...selectionKeys, 'status', 'worktreeId']) &&
        hasExactSourceIdentity(value.sourceIdentity)
    : hasExactMatchResponseShape(value)
}

function hasExactSourceIdentity(value: unknown): boolean {
  return hasExactKeys(value, sourceIdentityKeys)
}

function hasExactTickets(value: unknown): boolean {
  if (!hasExactArrayItems(value)) {
    return false
  }
  for (let index = 0; index < value.length; index += 1) {
    const ticket = value[index]
    if (!hasExactKeys(ticket, ticketKeys) || !hasExactWorkspaces(ticket.workspaces)) {
      return false
    }
  }
  return true
}

function hasExactWorkspaces(value: unknown): boolean {
  if (!hasExactArrayItems(value)) {
    return false
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!hasExactKeys(value[index], workspaceKeys)) {
      return false
    }
  }
  return true
}

function hasExactArrayItems(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== value.length + 1) {
    return false
  }
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex]
    if (key === 'length') {
      continue
    }
    if (typeof key !== 'string') {
      return false
    }
    const index = Number(key)
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= value.length ||
      String(index) !== key
    ) {
      return false
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return false
    }
  }
  return true
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[]
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return false
  }
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expectedKeys.length) {
    return false
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== 'string' || !expectedKeys.includes(key)) {
      return false
    }
  }
  return true
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype === null || prototype === Object.prototype) {
    return true
  }
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
  return (
    Object.getPrototypeOf(prototype) === null &&
    typeof constructor === 'function' &&
    constructor.name === 'Object' &&
    Object.getOwnPropertyDescriptor(constructor, 'prototype')?.value === prototype
  )
}
