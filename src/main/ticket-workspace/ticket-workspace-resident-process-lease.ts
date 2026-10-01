import { randomBytes as systemRandomBytes } from 'node:crypto'
import type { Duplex } from 'node:stream'
import { buildWslExecArgs } from '../../shared/wsl-login-shell-command'
import { spawnProcess } from '../../shared/child-process/run-process'
import type { TicketResidentUnavailableReason } from './ticket-workspace-resident-client-contract'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'
import { validateTicketResidentBinding } from './ticket-workspace-resident-protocol'
import type { TicketWorkspaceResidentHighWater } from './ticket-workspace-resident-high-water'
import type { TicketWorkspaceResidentSourceClock } from './ticket-workspace-resident-source-clock'
import {
  connectTicketWorkspaceResidentSourceAdapter,
  type TicketWorkspaceResidentSourceAdapter
} from './ticket-workspace-resident-source-adapter'
import {
  encodeResidentLaunchBootstrap,
  isAbsoluteResidentGuestPath,
  isAbsoluteResidentHostPath,
  isResidentLaunchIdentifier,
  sortedResidentLaunchIdentifiers,
  TICKET_RESIDENT_STARTUP_MAX_MS
} from './ticket-workspace-resident-launch-bootstrap'
import {
  createResidentProcessDuplex,
  retireResidentProcessHandle,
  waitForResidentProcessSpawn,
  writeResidentLaunchFrame
} from './ticket-workspace-resident-process-lease-child'

export type TicketWorkspaceResidentProcessLeaseOptions = Readonly<{
  wslExecutablePath: string
  distro: string
  nodeExecutablePath: string
  cliEntrypointPath: string
  profileConfigPath: string
  machineConfigPath: string
  expectedBinding: TicketResidentBinding
  allowedOrchestrationIds: readonly string[]
  allowedReferenceHostIds: readonly string[]
  highWater: TicketWorkspaceResidentHighWater
  clock: TicketWorkspaceResidentSourceClock
  getDisplayedSnapshotRevision(): string | null
  signal?: AbortSignal
  now?: () => number
  randomBytes?: (size: number) => Buffer
}>

export type TicketWorkspaceResidentProcessLease = Readonly<{
  source: TicketWorkspaceResidentSourceAdapter
  close(): Promise<void>
}>

export type TicketWorkspaceResidentProcessLeaseResult =
  | { status: 'connected'; lease: TicketWorkspaceResidentProcessLease }
  | { status: 'unavailable'; reason: TicketResidentUnavailableReason }

type LeaseState = 'starting' | 'connected' | 'retired'
type ResidentChild = ReturnType<typeof spawnProcess>

export async function openTicketWorkspaceResidentProcessLease(
  options: TicketWorkspaceResidentProcessLeaseOptions
): Promise<TicketWorkspaceResidentProcessLeaseResult> {
  return await new ResidentProcessLeaseAttempt(options).run()
}

class ResidentProcessLeaseAttempt {
  private readonly now: () => number
  private readonly randomBytes: (size: number) => Buffer
  private readonly deadline: number
  private readonly binding: TicketResidentBinding
  private readonly allowedOrchestrationIds: string[]
  private readonly allowedReferenceHostIds: string[]
  private state: LeaseState = 'starting'
  private child: ResidentChild | undefined
  private duplex: Duplex | undefined
  private source: TicketWorkspaceResidentSourceAdapter | undefined
  private setupKey: Buffer | undefined
  private setupTimer: ReturnType<typeof setTimeout> | undefined
  private removeAbortListener: (() => void) | undefined
  private resolveRetired: () => void = () => undefined
  private readonly retired = new Promise<void>((resolve) => {
    this.resolveRetired = resolve
  })
  private resolveResult: (result: TicketWorkspaceResidentProcessLeaseResult) => void = () =>
    undefined
  private readonly result = new Promise<TicketWorkspaceResidentProcessLeaseResult>((resolve) => {
    this.resolveResult = resolve
  })
  private resultSettled = false
  private cleanup: Promise<void> = Promise.resolve()

  constructor(private readonly options: TicketWorkspaceResidentProcessLeaseOptions) {
    this.now = options.now ?? options.clock.now
    this.randomBytes = options.randomBytes ?? systemRandomBytes
    this.deadline = this.now() + TICKET_RESIDENT_STARTUP_MAX_MS
    this.binding = structuredClone(options.expectedBinding)
    this.allowedOrchestrationIds =
      sortedResidentLaunchIdentifiers(options.allowedOrchestrationIds) ?? []
    this.allowedReferenceHostIds =
      sortedResidentLaunchIdentifiers(options.allowedReferenceHostIds) ?? []
  }

  async run(): Promise<TicketWorkspaceResidentProcessLeaseResult> {
    if (!validLaunchOptions(this.options) || !Number.isFinite(this.deadline)) {
      return { status: 'unavailable', reason: 'invalid_protocol' }
    }
    if (this.options.signal?.aborted) {
      return { status: 'unavailable', reason: 'cancelled' }
    }
    const remaining = this.remainingBudget(TICKET_RESIDENT_STARTUP_MAX_MS)
    if (remaining < 1) {
      return { status: 'unavailable', reason: 'deadline_exceeded' }
    }
    this.setupTimer = setTimeout(() => this.retire('deadline_exceeded'), remaining)
    this.setupTimer.unref?.()
    if (this.options.signal) {
      const onAbort = (): void => this.retire('cancelled')
      this.options.signal.addEventListener('abort', onAbort, { once: true })
      this.removeAbortListener = () => this.options.signal?.removeEventListener('abort', onAbort)
    }
    void this.start()
    return await this.result
  }

  private async start(): Promise<void> {
    try {
      const key = this.randomBytes(32)
      if (!Buffer.isBuffer(key) || key.byteLength !== 32) {
        this.retire('invalid_protocol')
        return
      }
      const setupKey = Buffer.from(key)
      if (key !== setupKey) {
        key.fill(0)
      }
      this.setupKey = setupKey
      const child = spawnProcess({
        program: this.options.wslExecutablePath,
        args: buildWslExecArgs(this.options.distro, [
          this.options.nodeExecutablePath,
          this.options.cliEntrypointPath,
          'resident',
          'serve',
          '--profile-config',
          this.options.profileConfigPath,
          '--machine-config',
          this.options.machineConfigPath
        ]),
        stdio: ['pipe', 'pipe', 'pipe']
      })
      this.child = child
      this.watchChild(child)
      const duplex = createResidentProcessDuplex(child, () => this.retire('disconnected'))
      this.duplex = duplex
      duplex.once('error', () => this.retire('disconnected'))
      duplex.once('end', () => this.retire('disconnected'))
      duplex.once('close', () => this.retire('disconnected'))
      const spawned = await waitForResidentProcessSpawn(child, this.retired)
      if (!spawned || !this.canRegisterLease()) {
        this.retire(this.failureReason())
        return
      }
      const startupBudgetMs = this.remainingBudget(TICKET_RESIDENT_STARTUP_MAX_MS)
      if (startupBudgetMs < 1) {
        this.retire('deadline_exceeded')
        return
      }
      const frame = encodeResidentLaunchBootstrap(
        this.binding,
        this.allowedOrchestrationIds,
        this.allowedReferenceHostIds,
        setupKey,
        startupBudgetMs
      )
      try {
        await writeResidentLaunchFrame(duplex, frame, this.deadline, this.now, this.options.signal)
      } finally {
        frame.fill(0)
      }
      if (!this.canRegisterLease()) {
        this.retire(this.failureReason())
        return
      }
      const setupBudgetMs = this.remainingBudget(TICKET_RESIDENT_STARTUP_MAX_MS)
      if (setupBudgetMs < 1) {
        this.retire('deadline_exceeded')
        return
      }
      const connected = await connectTicketWorkspaceResidentSourceAdapter({
        duplex,
        setupKey,
        expectedBinding: this.binding,
        highWater: this.options.highWater,
        clock: this.options.clock,
        getDisplayedSnapshotRevision: this.options.getDisplayedSnapshotRevision,
        setupBudgetMs,
        expectLaunchReady: true,
        canRegisterLease: () => this.canRegisterLease(),
        randomBytes: this.options.randomBytes
      })
      setupKey.fill(0)
      this.setupKey = undefined
      if (connected.status !== 'connected') {
        this.retire(connected.reason)
        return
      }
      if (!this.canRegisterLease()) {
        connected.source.close()
        this.retire(this.failureReason())
        return
      }
      this.source = connected.source
      this.state = 'connected'
      this.clearSetupWait()
      this.resolveOnce({
        status: 'connected',
        lease: {
          source: connected.source,
          close: () => this.close()
        }
      })
    } catch {
      this.retire(this.failureReason())
    }
  }

  private watchChild(child: ResidentChild): void {
    const onTerminal = (): void => this.retire('disconnected')
    child.once('error', onTerminal)
    child.once('exit', onTerminal)
    child.once('close', onTerminal)
  }

  private canRegisterLease(): boolean {
    const child = this.child
    return (
      this.state === 'starting' &&
      !this.options.signal?.aborted &&
      this.now() < this.deadline &&
      child !== undefined &&
      child.exitCode === null &&
      child.signalCode === null &&
      this.duplex !== undefined &&
      !this.duplex.destroyed
    )
  }

  private remainingBudget(maximum: number): number {
    return Math.floor(Math.min(maximum, this.deadline - this.now()))
  }

  private failureReason(): TicketResidentUnavailableReason {
    if (this.options.signal?.aborted) {
      return 'cancelled'
    }
    return this.now() >= this.deadline ? 'deadline_exceeded' : 'disconnected'
  }

  private close(): Promise<void> {
    this.retire('disconnected')
    return this.cleanup
  }

  private retire(reason: TicketResidentUnavailableReason): void {
    if (this.state === 'retired') {
      return
    }
    this.state = 'retired'
    this.clearSetupWait()
    this.resolveRetired()
    this.source?.close()
    this.source = undefined
    this.setupKey?.fill(0)
    this.setupKey = undefined
    if (this.duplex && !this.duplex.destroyed) {
      this.duplex.destroy()
    }
    if (this.child) {
      this.cleanup = retireResidentProcessHandle(this.child)
    }
    this.resolveOnce({ status: 'unavailable', reason })
  }

  private clearSetupWait(): void {
    if (this.setupTimer !== undefined) {
      clearTimeout(this.setupTimer)
      this.setupTimer = undefined
    }
    this.removeAbortListener?.()
    this.removeAbortListener = undefined
  }

  private resolveOnce(result: TicketWorkspaceResidentProcessLeaseResult): void {
    if (this.resultSettled) {
      return
    }
    this.resultSettled = true
    this.resolveResult(result)
  }
}

function validLaunchOptions(options: TicketWorkspaceResidentProcessLeaseOptions): boolean {
  return (
    isAbsoluteResidentHostPath(options.wslExecutablePath) &&
    isAbsoluteResidentGuestPath(options.nodeExecutablePath) &&
    isAbsoluteResidentGuestPath(options.cliEntrypointPath) &&
    isAbsoluteResidentGuestPath(options.profileConfigPath) &&
    isAbsoluteResidentGuestPath(options.machineConfigPath) &&
    isResidentLaunchIdentifier(options.distro) &&
    validateTicketResidentBinding(options.expectedBinding) &&
    options.expectedBinding.executionHost.distro === options.distro &&
    sortedResidentLaunchIdentifiers(options.allowedOrchestrationIds) !== null &&
    sortedResidentLaunchIdentifiers(options.allowedReferenceHostIds) !== null
  )
}
