import { performance } from 'node:perf_hooks'
import { Duplex, PassThrough, type Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as processRunner from '../../shared/child-process/run-process'
import {
  binding,
  randomSource,
  setupKey,
  sourceBoundWire,
  vector
} from './ticket-workspace-resident-test-peer'
import { MemoryResidentSourceHighWaterStore } from './ticket-workspace-resident-high-water-test-store'
import { TicketWorkspaceResidentHighWater } from './ticket-workspace-resident-high-water'
import { openTicketWorkspaceResidentProcessLease } from './ticket-workspace-resident-process-lease'
import {
  createResidentProcessDuplex,
  retireResidentProcessHandle,
  writeResidentLaunchFrame
} from './ticket-workspace-resident-process-lease-child'

const realSpawnProcess = processRunner.spawnProcess

describe('resident foreground process lease', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('launches once, authenticates through the existing adapter, and never spawns on reads', async () => {
    const requests: processRunner.ProcessSpec[] = []
    let setupKeyIssued = false
    let child: ReturnType<typeof realSpawnProcess> | undefined
    const spawn = vi.spyOn(processRunner, 'spawnProcess').mockImplementation((spec) => {
      requests.push(spec)
      child = realSpawnProcess({
        ...spec,
        program: process.execPath,
        args: ['-e', protocolPeerScript()]
      })
      return child
    })
    const highWater = createHighWater()
    const random = randomSource()
    const opened = await openTicketWorkspaceResidentProcessLease({
      wslExecutablePath: process.execPath,
      distro: binding.executionHost.distro,
      nodeExecutablePath: '/usr/bin/node',
      cliEntrypointPath: '/opt/orca/bin/orca',
      profileConfigPath: '/tmp/profile.json',
      machineConfigPath: '/tmp/machine.json',
      expectedBinding: binding,
      allowedOrchestrationIds: ['orch-2', 'orch-1'],
      allowedReferenceHostIds: ['host-1'],
      highWater,
      clock: { now: () => performance.now(), suspendGeneration: () => 0 },
      getDisplayedSnapshotRevision: () => null,
      randomBytes: (size) => {
        if (size === 32 && !setupKeyIssued) {
          setupKeyIssued = true
          return Buffer.from(setupKey)
        }
        return random(size)
      }
    })

    if (opened.status !== 'connected') {
      throw new Error(JSON.stringify(opened))
    }
    expect(opened.status).toBe('connected')
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(requests[0]?.args).toEqual([
      '-d',
      binding.executionHost.distro,
      '--exec',
      '/usr/bin/node',
      '/opt/orca/bin/orca',
      'resident',
      'serve',
      '--profile-config',
      '/tmp/profile.json',
      '--machine-config',
      '/tmp/machine.json'
    ])
    expect(requests[0]?.args?.join(' ')).not.toContain(setupKey.toString('base64url'))
    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(child?.exitCode).toBeNull()
    const connectedLease = opened.lease
    const abort = new AbortController()
    abort.abort()
    await expect(connectedLease.source.readCurrentSnapshot(abort.signal, 1_000)).resolves.toBeNull()
    expect(spawn).toHaveBeenCalledTimes(1)
    await connectedLease.close()
  })

  it('retires on caller cancellation before adapter construction or HWM registration', async () => {
    const controller = new AbortController()
    let child: ReturnType<typeof realSpawnProcess> | undefined
    const spawn = vi.spyOn(processRunner, 'spawnProcess').mockImplementation((spec) => {
      child = realSpawnProcess({
        ...spec,
        program: process.execPath,
        args: ['-e', 'process.stdin.resume()']
      })
      setTimeout(() => controller.abort(), 10)
      return child
    })
    const highWater = createHighWater()
    const registerLease = vi.spyOn(highWater, 'registerLease')
    const random = randomSource()
    const opened = await openTicketWorkspaceResidentProcessLease({
      wslExecutablePath: process.execPath,
      distro: binding.executionHost.distro,
      nodeExecutablePath: '/usr/bin/node',
      cliEntrypointPath: '/opt/orca/bin/orca',
      profileConfigPath: '/tmp/profile.json',
      machineConfigPath: '/tmp/machine.json',
      expectedBinding: binding,
      allowedOrchestrationIds: [],
      allowedReferenceHostIds: [],
      highWater,
      clock: { now: () => performance.now(), suspendGeneration: () => 0 },
      getDisplayedSnapshotRevision: () => null,
      signal: controller.signal,
      randomBytes: (size) => (size === 32 ? Buffer.from(setupKey) : random(size))
    })

    expect(opened).toEqual({ status: 'unavailable', reason: 'cancelled' })
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(registerLease).not.toHaveBeenCalled()
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => child?.once('close', () => resolve()))
    }
  })

  it('hands the decreasing outer remainder through bootstrap and logical bind', async () => {
    let observedNow = 100
    let setupKeyIssued = false
    let childStderr = ''
    let child: ReturnType<typeof realSpawnProcess> | undefined
    vi.spyOn(processRunner, 'spawnProcess').mockImplementation((spec) => {
      child = realSpawnProcess({
        ...spec,
        program: process.execPath,
        args: ['-e', protocolPeerScript(true)]
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        childStderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
      })
      observedNow = 8_000
      return child
    })
    const random = randomSource()
    const opened = await openTicketWorkspaceResidentProcessLease({
      wslExecutablePath: process.execPath,
      distro: binding.executionHost.distro,
      nodeExecutablePath: '/usr/bin/node',
      cliEntrypointPath: '/opt/orca/bin/orca',
      profileConfigPath: '/tmp/profile.json',
      machineConfigPath: '/tmp/machine.json',
      expectedBinding: binding,
      allowedOrchestrationIds: [],
      allowedReferenceHostIds: [],
      highWater: createHighWater(),
      clock: { now: () => observedNow, suspendGeneration: () => 0 },
      getDisplayedSnapshotRevision: () => null,
      now: () => observedNow,
      randomBytes: (size) => {
        if (size === 32 && !setupKeyIssued) {
          setupKeyIssued = true
          return Buffer.from(setupKey)
        }
        return random(size)
      }
    })

    if (opened.status !== 'connected') {
      throw new Error(JSON.stringify(opened))
    }
    try {
      if (!child) {
        throw new Error('Expected the resident child to be started')
      }
      await waitForStreamText(child.stderr, () => childStderr, '2100|2100', 2_000)
      expect(childStderr).toContain('2100|2100')
    } finally {
      await opened.lease.close()
    }
  })

  it('retires when child stderr exceeds its drain ceiling', async () => {
    let child: ReturnType<typeof realSpawnProcess> | undefined
    const childSpawn = vi.spyOn(processRunner, 'spawnProcess').mockImplementation((spec) => {
      child = realSpawnProcess({
        ...spec,
        program: process.execPath,
        args: ['-e', "process.stderr.write('x'.repeat(65537));process.stdin.resume();"]
      })
      return child
    })
    const highWater = createHighWater()
    const registerLease = vi.spyOn(highWater, 'registerLease')
    let setupKeyIssued = false
    const random = randomSource()
    const opened = await openTicketWorkspaceResidentProcessLease({
      wslExecutablePath: process.execPath,
      distro: binding.executionHost.distro,
      nodeExecutablePath: '/usr/bin/node',
      cliEntrypointPath: '/opt/orca/bin/orca',
      profileConfigPath: '/tmp/profile.json',
      machineConfigPath: '/tmp/machine.json',
      expectedBinding: binding,
      allowedOrchestrationIds: [],
      allowedReferenceHostIds: [],
      highWater,
      clock: { now: () => performance.now(), suspendGeneration: () => 0 },
      getDisplayedSnapshotRevision: () => null,
      randomBytes: (size) => {
        if (size === 32 && !setupKeyIssued) {
          setupKeyIssued = true
          return Buffer.from(setupKey)
        }
        return random(size)
      }
    })

    expect(opened).toEqual({ status: 'unavailable', reason: 'disconnected' })
    expect(childSpawn).toHaveBeenCalledTimes(1)
    expect(registerLease).not.toHaveBeenCalled()
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => child?.once('close', () => resolve()))
    }
  })

  it('settles a stalled bootstrap write at the original monotonic deadline', async () => {
    const duplex = new StalledLaunchWriteDuplex()
    const deadline = performance.now() + 25
    await expect(
      writeResidentLaunchFrame(duplex, Buffer.alloc(8), deadline, () => performance.now())
    ).rejects.toThrow('deadline_exceeded')
    expect(duplex.writeCount).toBe(1)
    duplex.destroy()
  })

  it.each(['live', 'already-exited'] as const)(
    'owns a queued stderr error through close for an %s wrapper',
    async (wrapperState) => {
      const child = realSpawnProcess({
        program: process.execPath,
        args: ['-e', wrapperState === 'live' ? 'process.stdin.resume()' : 'process.exit(0)'],
        stdio: ['pipe', 'pipe', 'pipe']
      })
      await new Promise<void>((resolve) =>
        child.once(wrapperState === 'live' ? 'spawn' : 'exit', () => resolve())
      )
      const stderr = wrapperState === 'live' ? child.stderr : new PassThrough()
      if (wrapperState === 'already-exited') {
        child.stderr = stderr
      }
      const dataListeners = stderr.listenerCount('data')
      const errorListeners = stderr.listenerCount('error')
      const onFailure = vi.fn()
      const duplex = createResidentProcessDuplex(child, onFailure)
      const kill = vi.spyOn(child, 'kill')
      const stderrClosed = new Promise<void>((resolve) => stderr.once('close', () => resolve()))

      expect(stderr.listenerCount('data')).toBe(dataListeners + 1)
      stderr.destroy(new Error('queued stderr failure'))
      const cleanup = retireResidentProcessHandle(child)
      expect(retireResidentProcessHandle(child)).toBe(cleanup)
      expect(stderr.destroyed).toBe(true)
      expect(stderr.listenerCount('data')).toBe(dataListeners)
      expect(stderr.listenerCount('error')).toBe(errorListeners + 1)

      await Promise.all([cleanup, stderrClosed])
      expect(onFailure).not.toHaveBeenCalled()
      expect(stderr.listenerCount('error')).toBe(errorListeners)
      expect(kill).toHaveBeenCalledTimes(wrapperState === 'live' ? 1 : 0)
      duplex.destroy()
    }
  )

  it('disposes stderr and settles at the cleanup bound when the wrapper never closes', async () => {
    const child = realSpawnProcess({
      program: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000);process.stdin.on("end",()=>{});'],
      stdio: ['pipe', 'pipe', 'pipe']
    })
    await new Promise<void>((resolve) => child.once('spawn', () => resolve()))
    const dataListeners = child.stderr.listenerCount('data')
    const errorListeners = child.stderr.listenerCount('error')
    const duplex = createResidentProcessDuplex(child, () => undefined)
    const stderrClosed = new Promise<void>((resolve) => child.stderr.once('close', () => resolve()))
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true)
    duplex.destroy()
    vi.useFakeTimers()
    const cleanup = retireResidentProcessHandle(child)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(cleanup).resolves.toBeUndefined()
    await stderrClosed

    expect(kill).toHaveBeenCalledTimes(2)
    expect(child.stderr.destroyed).toBe(true)
    expect(child.stderr.listenerCount('data')).toBe(dataListeners)
    expect(child.stderr.listenerCount('error')).toBe(errorListeners)
    kill.mockRestore()
    const childClosed = waitForChildClose(child)
    child.kill()
    await childClosed
  })
})

function createHighWater(): TicketWorkspaceResidentHighWater {
  return new TicketWorkspaceResidentHighWater(new MemoryResidentSourceHighWaterStore(), {
    authorizeFirstAdoption: async () => true,
    authorizeRebind: async () => true,
    authorizeRecovery: async () => true
  })
}

function protocolPeerScript(reportBudgets = false): string {
  const ready = Buffer.from(
    '{"contract":"ticket.navigator.resident.launch","remainingSetupMs":5000,"type":"ready","version":1}',
    'utf8'
  )
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(ready.byteLength)
  const readyFrame = Buffer.concat([prefix, ready]).toString('hex')
  return [
    `const ready=Buffer.from('${readyFrame}','hex');`,
    `const serverHello=Buffer.from('${vector.hello.serverHello.wireHex}','hex');`,
    `const sourceBound=Buffer.from('${sourceBoundWire.toString('hex')}','hex');`,
    'let input=Buffer.alloc(0);let stage=0;',
    `function consume(){for(;;){if(input.length<4)return;const size=input.readUInt32BE(0);const total=4+size+(stage===3?32:0);if(input.length<total)return;if(${reportBudgets}&&stage===0)process.stderr.write(String(JSON.parse(input.subarray(4,4+size)).remainingStartupMs)+'|');if(${reportBudgets}&&stage===3)process.stderr.write(String(JSON.parse(input.subarray(4,4+size)).deadlineBudgetMs));input=input.subarray(total);if(stage===0)process.stdout.write(ready);if(stage===1)process.stdout.write(serverHello);if(stage===3)process.stdout.write(sourceBound);stage++;}}`,
    "process.stdin.on('data',chunk=>{input=Buffer.concat([input,chunk]);consume();});",
    "process.stdin.on('error',()=>{});process.stdout.on('error',()=>process.exit(0));"
  ].join('')
}

class StalledLaunchWriteDuplex extends Duplex {
  writeCount = 0
  private finishWrite: ((error?: Error | null) => void) | undefined

  constructor() {
    super({ writableHighWaterMark: 1 })
  }

  _read(): void {}

  _write(
    _chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.writeCount += 1
    this.finishWrite = callback
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.finishWrite?.(error ?? new Error('Test stream retired'))
    callback(error)
  }
}

function waitForChildClose(child: ReturnType<typeof realSpawnProcess>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => child.once('close', () => resolve()))
}

function waitForStreamText(
  stream: Readable,
  readText: () => string,
  expected: string,
  timeoutMs: number
): Promise<void> {
  if (readText().includes(expected)) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout)
      stream.off('data', check)
      stream.off('error', fail)
      stream.off('close', closed)
    }
    const finish = (error?: Error): void => {
      cleanup()
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const check = (): void => {
      if (readText().includes(expected)) {
        finish()
      }
    }
    const fail = (error: Error): void => finish(error)
    const closed = (): void => finish(new Error('Stream closed before expected output'))
    const timeout = setTimeout(
      () => finish(new Error('Timed out waiting for expected output')),
      timeoutMs
    )

    stream.on('data', check)
    stream.once('error', fail)
    stream.once('close', closed)
    check()
  })
}
