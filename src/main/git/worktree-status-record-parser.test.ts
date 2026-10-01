import { describe, expect, it } from 'vitest'
import { NativeGitStatusRecordParser } from './worktree-status-record-parser'

const HASH = 'a'.repeat(40)
const HEADERS = `# branch.oid ${HASH}\n# branch.head feature\n# branch.ab +0 -0\n`

describe('NativeGitStatusRecordParser', () => {
  it('accounts each porcelain-v2 record once, including unmerged gitlinks', () => {
    const parser = new NativeGitStatusRecordParser()
    const output = [
      HEADERS,
      `1 .M N... 100644 100644 100644 ${HASH} ${HASH} tracked.txt\n`,
      `2 R. N... 100644 100644 100644 ${HASH} ${HASH} R100 new name.txt\told name.txt\n`,
      `u UU S... 160000 160000 160000 160000 ${HASH} ${HASH} ${HASH} modules/sub\n`,
      '? loose.txt\n'
    ].join('')
    for (const chunk of [output.slice(0, 17), output.slice(17, 101), output.slice(101)]) {
      parser.update(chunk)
    }

    parser.finish()

    expect(parser.result()).toEqual({
      complete: true,
      rawRecordCount: 4,
      representedRecordCount: 4,
      unsupportedRecordCount: 0,
      records: [
        { kind: 'tracked', pathCount: 1, xy: '.M', submodule: 'N...' },
        { kind: 'renamed-or-copied', pathCount: 2, xy: 'R.', submodule: 'N...' },
        { kind: 'unmerged', pathCount: 1, xy: 'UU', submodule: 'S...' },
        { kind: 'untracked', pathCount: 1 }
      ]
    })
  })

  it('ignores extensible headers but marks unknown or malformed status records incomplete', () => {
    const parser = new NativeGitStatusRecordParser()
    parser.update(`${HEADERS}# future.optional-header value\nx future-record\n`)
    parser.finish()

    expect(parser.result()).toMatchObject({
      complete: false,
      rawRecordCount: 1,
      representedRecordCount: 0,
      unsupportedRecordCount: 1
    })
  })

  it('does not count an unterminated final record as a complete read', () => {
    const parser = new NativeGitStatusRecordParser()
    parser.update(`${HEADERS}? partial-path`)
    parser.finish()

    expect(parser.result()).toMatchObject({
      complete: false,
      rawRecordCount: 1,
      representedRecordCount: 1,
      records: [{ kind: 'untracked', pathCount: 1 }]
    })
  })

  it('rejects malformed C-quoted paths rather than counting them as represented', () => {
    const parser = new NativeGitStatusRecordParser()
    parser.update(`${HEADERS}? "unterminated\\q"\n`)
    parser.finish()

    expect(parser.result()).toMatchObject({
      complete: false,
      rawRecordCount: 1,
      representedRecordCount: 0,
      unsupportedRecordCount: 1
    })
  })

  it('requires the branch headers requested by the command', () => {
    const parser = new NativeGitStatusRecordParser()
    parser.update(`? loose.txt\n`)
    parser.finish()

    expect(parser.result()).toMatchObject({ complete: false, rawRecordCount: 1 })
  })

  it('rejects control characters in the branch head header', () => {
    const parser = new NativeGitStatusRecordParser()
    parser.update(`# branch.oid ${HASH}\n# branch.head feature\u0000malformed\n`)
    parser.finish()

    expect(parser.result()).toMatchObject({
      complete: false,
      rawRecordCount: 0,
      representedRecordCount: 0
    })
  })
})
