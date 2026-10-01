import { afterEach, describe, expect, it, vi } from 'vitest'

const { gitStreamStdoutMock } = vi.hoisted(() => ({ gitStreamStdoutMock: vi.fn() }))

vi.mock('./runner', () => ({
  gitStreamStdout: gitStreamStdoutMock,
  gitExecFileAsync: vi.fn()
}))

import {
  createBoundedNativeGitStatusRecordReader,
  readNativeGitWorktreeStatusRecords,
  type NativeGitWorktreeStatusRecordCapture
} from './native-worktree-status-record-capture'

const HASH = 'b'.repeat(40)
const OUTPUT = `# branch.oid ${HASH}\n# branch.head feature\n? loose.txt\n`

afterEach(() => gitStreamStdoutMock.mockReset())

describe('readNativeGitWorktreeStatusRecords', () => {
  it('pins visibility and environment and returns only a complete native-route capture', async () => {
    gitStreamStdoutMock.mockImplementation(async (_args, options) => {
      options.onStdout(OUTPUT)
      return { stoppedEarly: false, executionRoute: 'native' }
    })

    await expect(readNativeGitWorktreeStatusRecords('/repo')).resolves.toMatchObject({
      complete: true,
      executionRoute: 'native',
      rawRecordCount: 1,
      representedRecordCount: 1,
      records: [{ kind: 'untracked', pathCount: 1 }]
    })

    const [args, options] = gitStreamStdoutMock.mock.calls[0]
    expect(args).toEqual([
      '-c',
      'core.quotePath=true',
      '-c',
      'core.fsmonitor=false',
      '--no-optional-locks',
      'status',
      '--porcelain=v2',
      '--branch',
      '--untracked-files=all',
      '--ignore-submodules=none'
    ])
    expect(options).toMatchObject({
      cwd: '/repo',
      admissionTier: 'status',
      requireNativeExecution: true,
      requireValidUtf8: true,
      waitForTerminationOnStop: true
    })
    expect(options.env).toMatchObject({
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0'
    })
    expect(
      Object.keys(options.env).some((key: string) =>
        /^GIT_(?!CONFIG_NOSYSTEM$|CONFIG_GLOBAL$|OPTIONAL_LOCKS$|TERMINAL_PROMPT$)/i.test(key)
      )
    ).toBe(false)
  })

  it('rejects overlapping reads instead of sharing a result or overlapping children', async () => {
    let releaseRead: (() => void) | undefined
    const pendingRead = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    gitStreamStdoutMock.mockImplementation(async (_args, options) => {
      await pendingRead
      options.onStdout(`${OUTPUT}x future-record\n`)
      return { stoppedEarly: false, executionRoute: 'native' }
    })

    const firstRead = readNativeGitWorktreeStatusRecords('/repo')
    await vi.waitFor(() => expect(gitStreamStdoutMock).toHaveBeenCalledOnce())
    await expect(readNativeGitWorktreeStatusRecords('/repo')).resolves.toBeNull()
    expect(gitStreamStdoutMock).toHaveBeenCalledOnce()

    releaseRead?.()
    await expect(firstRead).resolves.toMatchObject({
      complete: false,
      unsupportedRecordCount: 1
    })
  })

  it('aborts a read that exceeds its monotonic deadline', async () => {
    let aborted = false
    const readBounded = createBoundedNativeGitStatusRecordReader(
      (_worktreeRoot, signal) =>
        new Promise((_resolve, reject) => {
          const onAbort = (): void => {
            aborted = true
            reject(Object.assign(new Error('test read aborted'), { name: 'AbortError' }))
          }
          signal.addEventListener('abort', onAbort, { once: true })
          if (signal.aborted) {
            onAbort()
          }
        }),
      5
    )

    await expect(readBounded('/repo')).resolves.toBeNull()
    expect(aborted).toBe(true)
  })

  it('keeps the read slot until a timed-out subprocess operation actually settles', async () => {
    const pendingReads: ((value: null) => void)[] = []
    const readBounded = createBoundedNativeGitStatusRecordReader(
      () =>
        new Promise<null>((resolve) => {
          pendingReads.push(resolve)
        }),
      5
    )

    const firstRead = readBounded('/repo')
    await vi.waitFor(() => expect(pendingReads).toHaveLength(1))
    await expect(firstRead).resolves.toBeNull()
    await expect(readBounded('/repo')).resolves.toBeNull()
    expect(pendingReads).toHaveLength(1)

    pendingReads[0](null)
    let nextRead: Promise<NativeGitWorktreeStatusRecordCapture | null> | undefined
    await vi.waitFor(() => {
      nextRead = readBounded('/repo')
      expect(pendingReads).toHaveLength(2)
    })
    pendingReads[1](null)
    await expect(nextRead).resolves.toBeNull()
  })

  it('returns unavailable on abort, timeout, WSL paths, or an unobserved route', async () => {
    const controller = new AbortController()
    const abortedRead = readNativeGitWorktreeStatusRecords('/repo', controller.signal)
    gitStreamStdoutMock.mockImplementation((_args, options) => {
      const error = Object.assign(new Error('test read aborted'), { name: 'AbortError' })
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(error), { once: true })
        if (options.signal.aborted) {
          reject(error)
        }
      })
    })
    await vi.waitFor(() => expect(gitStreamStdoutMock).toHaveBeenCalledOnce())
    controller.abort()
    await expect(abortedRead).resolves.toBeNull()
    expect(gitStreamStdoutMock).toHaveBeenCalledOnce()

    gitStreamStdoutMock.mockResolvedValue({ stoppedEarly: false })
    await expect(
      readNativeGitWorktreeStatusRecords('\\\\wsl.localhost\\Ubuntu\\repo')
    ).resolves.toBeNull()
    expect(gitStreamStdoutMock).toHaveBeenCalledOnce()

    gitStreamStdoutMock.mockImplementation(async (_args, options) => {
      options.onStdout(OUTPUT)
      return { stoppedEarly: false }
    })
    await expect(readNativeGitWorktreeStatusRecords('/repo')).resolves.toBeNull()
  })
})
