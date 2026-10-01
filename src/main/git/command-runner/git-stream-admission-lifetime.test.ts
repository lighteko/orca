import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { gitSpawnMock, killSpawnedCommandTreeMock } = vi.hoisted(() => ({
  gitSpawnMock: vi.fn(),
  killSpawnedCommandTreeMock: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('./git-spawn', () => ({ gitSpawn: gitSpawnMock }))
vi.mock('./spawned-command-tree-kill', () => ({
  killSpawnedCommandTree: killSpawnedCommandTreeMock
}))

import { gitStreamStdout } from './git-stream-stdout'
import {
  GitAdmissionScheduler,
  _gitAdmissionSnapshotForTests,
  _resetGitAdmissionForTests
} from './git-subprocess-admission'
import { NativeGitStatusRecordParser } from '../worktree-status-record-parser'

function mockChild(): ChildProcess {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>
  child.pid = 1234
  child.kill = vi.fn(() => true)
  child.stdin = null
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child as unknown as ChildProcess
}

describe('git stream admission lifetime', () => {
  beforeEach(() => {
    gitSpawnMock.mockReset()
    killSpawnedCommandTreeMock.mockClear()
    _resetGitAdmissionForTests(new GitAdmissionScheduler({ generalCap: 1, generalHeadroom: 1 }))
  })

  afterEach(() => _resetGitAdmissionForTests())

  it('retains the permit after maxBuffer settlement until close', async () => {
    const child = mockChild()
    gitSpawnMock.mockReturnValue(child)
    const pending = gitStreamStdout(['status'], {
      cwd: '/repo',
      maxBuffer: 1,
      onStdout: () => {}
    })
    await vi.waitFor(() => expect(gitSpawnMock).toHaveBeenCalledOnce())

    child.stdout?.emit('data', Buffer.from('xx'))
    await expect(pending).rejects.toThrow('maxBuffer')
    expect(_gitAdmissionSnapshotForTests().budgets.general?.baseUsed).toBe(1)

    child.emit('close', null, 'SIGKILL')
    await Promise.resolve()
    expect(_gitAdmissionSnapshotForTests().budgets.general?.baseUsed).toBe(0)
  })

  it('retains the permit after abort settlement until close', async () => {
    const child = mockChild()
    const controller = new AbortController()
    gitSpawnMock.mockReturnValue(child)
    const pending = gitStreamStdout(['status'], {
      cwd: '/repo',
      signal: controller.signal,
      onStdout: () => {}
    })
    await vi.waitFor(() => expect(gitSpawnMock).toHaveBeenCalledOnce())

    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(_gitAdmissionSnapshotForTests().budgets.general?.baseUsed).toBe(1)

    child.emit('close', null, 'SIGKILL')
    await Promise.resolve()
    expect(_gitAdmissionSnapshotForTests().budgets.general?.baseUsed).toBe(0)
  })

  it('reports and enforces the route resolved at the actual spawn boundary', async () => {
    const child = mockChild()
    gitSpawnMock.mockImplementation((_args, _options, onCommandResolved) => {
      onCommandResolved?.({ wsl: null, wslMode: null })
      return child
    })
    const pending = gitStreamStdout(['status'], {
      cwd: '/repo',
      requireNativeExecution: true,
      onStdout: () => {}
    })
    await vi.waitFor(() => expect(gitSpawnMock).toHaveBeenCalledOnce())
    child.emit('close', 0, null)

    await expect(pending).resolves.toMatchObject({
      stoppedEarly: false,
      executionRoute: 'native'
    })
  })

  it('refuses a WSL route selected at spawn even when the earlier route was native', async () => {
    gitSpawnMock.mockImplementation((_args, _options, onCommandResolved) => {
      onCommandResolved?.({ wsl: { distro: 'Ubuntu' }, wslMode: 'login-shell' })
      return mockChild()
    })

    await expect(
      gitStreamStdout(['status'], {
        cwd: '/repo',
        requireNativeExecution: true,
        onStdout: () => {}
      })
    ).rejects.toThrow('native_git_execution_unavailable')
  })

  it('rejects an incomplete final UTF-8 sequence when strict validation is requested', async () => {
    const child = mockChild()
    gitSpawnMock.mockReturnValue(child)
    const parser = new NativeGitStatusRecordParser()

    const pending = gitStreamStdout(['status'], {
      cwd: '/repo',
      requireValidUtf8: true,
      onStdout: (chunk) => parser.update(chunk)
    })
    const rejection = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(gitSpawnMock).toHaveBeenCalledOnce())
    child.stdout?.emit(
      'data',
      Buffer.from(`# branch.oid ${'a'.repeat(40)}\n# branch.head feature\n`)
    )
    child.stdout?.emit('data', Buffer.from([0xc3]))
    child.emit('close', 0, null)

    await rejection
    parser.finish()
    expect(parser.result()).toMatchObject({ complete: true, rawRecordCount: 0 })
  })

  it('does not settle an aborted capture until the child has closed', async () => {
    const child = mockChild()
    const controller = new AbortController()
    gitSpawnMock.mockReturnValue(child)
    const pending = gitStreamStdout(['status'], {
      cwd: '/repo',
      signal: controller.signal,
      waitForTerminationOnStop: true,
      onStdout: () => {}
    })
    await vi.waitFor(() => expect(gitSpawnMock).toHaveBeenCalledOnce())

    let settled = false
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    controller.abort()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(killSpawnedCommandTreeMock).toHaveBeenCalledOnce()

    child.emit('close', null, 'SIGTERM')
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(settled).toBe(true)
  })
})
