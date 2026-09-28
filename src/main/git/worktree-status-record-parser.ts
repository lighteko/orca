export type NativeGitStatusRecord = {
  kind: 'tracked' | 'renamed-or-copied' | 'unmerged' | 'untracked'
  pathCount: 1 | 2
  xy?: string
  submodule?: string
}

export type NativeGitStatusRecordAccounting = {
  complete: boolean
  rawRecordCount: number
  representedRecordCount: number
  unsupportedRecordCount: number
  records: NativeGitStatusRecord[]
}

type PrefixFields = { fields: string[]; remainder: string }

export class NativeGitStatusRecordParser {
  private carry = ''
  private hasBranchOid = false
  private hasBranchHead = false
  private malformedLineCount = 0
  private unterminatedLineCount = 0
  private rawRecordCount = 0
  private unsupportedRecordCount = 0
  private readonly records: NativeGitStatusRecord[] = []

  update(chunk: string): void {
    const text = this.carry + chunk
    let start = 0
    while (true) {
      const newline = text.indexOf('\n', start)
      if (newline === -1) {
        break
      }
      const line = text.slice(start, newline)
      this.parseLine(line)
      start = newline + 1
    }
    this.carry = text.slice(start)
  }

  finish(): void {
    if (this.carry.length === 0) {
      return
    }
    this.unterminatedLineCount += 1
    this.parseLine(this.carry)
    this.carry = ''
  }

  result(): NativeGitStatusRecordAccounting {
    const representedRecordCount = this.records.length
    return {
      complete:
        this.hasBranchOid &&
        this.hasBranchHead &&
        this.malformedLineCount === 0 &&
        this.unterminatedLineCount === 0 &&
        this.unsupportedRecordCount === 0 &&
        representedRecordCount === this.rawRecordCount,
      rawRecordCount: this.rawRecordCount,
      representedRecordCount,
      unsupportedRecordCount: this.unsupportedRecordCount,
      records: [...this.records]
    }
  }

  private parseLine(line: string): void {
    if (!line) {
      this.malformedLineCount += 1
      return
    }
    if (line.startsWith('#')) {
      this.parseHeader(line)
      return
    }
    this.rawRecordCount += 1
    const record = parseStatusRecord(line)
    if (!record) {
      this.unsupportedRecordCount += 1
      return
    }
    this.records.push(record)
  }

  private parseHeader(line: string): void {
    if (line.startsWith('# branch.oid ')) {
      const value = line.slice('# branch.oid '.length)
      this.hasBranchOid = value === '(initial)' || isObjectId(value)
      return
    }
    if (line.startsWith('# branch.head ')) {
      const value = line.slice('# branch.head '.length)
      this.hasBranchHead = Boolean(value) && !/\s/.test(value) && hasNoControlCharacters(value)
    }
    // Porcelain v2 headers are extensible; unknown headers are not status records.
  }
}

function hasNoControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) {
      return false
    }
  }
  return true
}

function parseStatusRecord(line: string): NativeGitStatusRecord | null {
  if (line.startsWith('1 ')) {
    const prefix = splitPrefixFields(line, 8)
    if (!prefix || !isTrackedRecordPrefix(prefix.fields) || !isStatusPath(prefix.remainder)) {
      return null
    }
    return {
      kind: 'tracked',
      pathCount: 1,
      xy: prefix.fields[1],
      submodule: prefix.fields[2]
    }
  }
  if (line.startsWith('2 ')) {
    const paths = line.split('\t')
    if (paths.length !== 2) {
      return null
    }
    const prefix = splitPrefixFields(paths[0], 9)
    const originalPath = paths[1]
    if (
      !prefix ||
      !isTrackedRecordPrefix(prefix.fields) ||
      !/^[RC](?:[0-9]|[1-9][0-9]|100)$/.test(prefix.fields[8]) ||
      !isStatusPath(prefix.remainder) ||
      !isStatusPath(originalPath)
    ) {
      return null
    }
    return {
      kind: 'renamed-or-copied',
      pathCount: 2,
      xy: prefix.fields[1],
      submodule: prefix.fields[2]
    }
  }
  if (line.startsWith('u ')) {
    const prefix = splitPrefixFields(line, 10)
    if (
      !prefix ||
      !isStatusXY(prefix.fields[1]) ||
      prefix.fields[1] === '..' ||
      !isSubmoduleState(prefix.fields[2]) ||
      !prefix.fields.slice(3, 7).every(isFileMode) ||
      !prefix.fields.slice(7, 10).every(isObjectId) ||
      !isStatusPath(prefix.remainder)
    ) {
      return null
    }
    return {
      kind: 'unmerged',
      pathCount: 1,
      xy: prefix.fields[1],
      submodule: prefix.fields[2]
    }
  }
  if (line.startsWith('? ')) {
    return isStatusPath(line.slice(2)) ? { kind: 'untracked', pathCount: 1 } : null
  }
  return null
}

function splitPrefixFields(line: string, count: number): PrefixFields | null {
  const fields: string[] = []
  let start = 0
  for (let index = 0; index < count; index += 1) {
    const separator = line.indexOf(' ', start)
    if (separator <= start) {
      return null
    }
    fields.push(line.slice(start, separator))
    start = separator + 1
  }
  const remainder = line.slice(start)
  return remainder.length > 0 ? { fields, remainder } : null
}

function isTrackedRecordPrefix(fields: string[]): boolean {
  return (
    (fields[0] === '1' || fields[0] === '2') &&
    isStatusXY(fields[1]) &&
    fields[1] !== '..' &&
    isSubmoduleState(fields[2]) &&
    fields.slice(3, 6).every(isFileMode) &&
    fields.slice(6, 8).every(isObjectId)
  )
}

function isStatusXY(value: string | undefined): value is string {
  return typeof value === 'string' && /^[.MADRCUT]{2}$/.test(value)
}

function isSubmoduleState(value: string | undefined): value is string {
  return value === 'N...' || (typeof value === 'string' && /^S[.C][.M][.U]$/.test(value))
}

function isFileMode(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-7]{6}$/.test(value)
}

function isObjectId(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value)
}

function isStatusPath(value: string): boolean {
  if (!value || /[\0\r\n]/.test(value)) {
    return false
  }
  const quoted = value.startsWith('"')
  if (quoted !== value.endsWith('"')) {
    return false
  }
  const path = quoted ? value.slice(1, -1) : value
  if (!path) {
    return false
  }
  for (let index = 0; index < path.length; index += 1) {
    const character = path[index]
    const code = character.charCodeAt(0)
    if (code < 0x20 || code > 0x7e || character === '"') {
      return false
    }
    if (character !== '\\') {
      continue
    }
    if (!quoted) {
      return false
    }
    index += 1
    const escaped = path[index]
    if (!escaped) {
      return false
    }
    if ('abfnrtv\\"'.includes(escaped)) {
      continue
    }
    if (!/[0-7]/.test(escaped)) {
      return false
    }
    let octalDigits = 1
    while (octalDigits < 3 && /[0-7]/.test(path[index + 1] ?? '')) {
      index += 1
      octalDigits += 1
    }
  }
  return true
}
