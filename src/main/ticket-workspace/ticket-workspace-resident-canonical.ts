import { isRecord } from './ticket-workspace-resident-protocol'

export function parseTicketResidentCanonicalJson(body: Buffer): unknown {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body)
  const value: unknown = JSON.parse(text)
  const canonical = Buffer.from(ticketResidentCanonicalJson(value), 'utf8')
  if (!canonical.equals(body)) {
    throw new Error('Noncanonical JSON body')
  }
  return value
}

export function ticketResidentCanonicalJson(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('Canonical JSON requires safe integers')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(ticketResidentCanonicalJson).join(',')}]`
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${ticketResidentCanonicalJson(value[key])}`).join(',')}}`
  }
  throw new Error('Value is not representable as canonical JSON')
}
