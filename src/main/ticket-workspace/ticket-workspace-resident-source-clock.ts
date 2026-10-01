export type TicketWorkspaceResidentSourceClock = Readonly<{
  now(): number
  suspendGeneration(): number
}>

export type ResidentSourceClockObservation = Readonly<{
  now: number
  suspendGeneration: number
  clockGeneration: number
  anomaly: boolean
}>

export class ResidentSourceClockMonitor {
  private lastMonotonicNow: number | undefined
  private lastSuspendGeneration: number | undefined
  private clockGeneration = 0
  private onAnomaly = (): void => undefined

  constructor(private readonly clock: TicketWorkspaceResidentSourceClock) {}

  readonly now = (): number => this.observe().now

  setOnAnomaly(onAnomaly: () => void): void {
    this.onAnomaly = onAnomaly
  }

  observe(): ResidentSourceClockObservation {
    let now: number
    let suspendGeneration: number
    try {
      now = this.clock.now()
      suspendGeneration = this.clock.suspendGeneration()
    } catch {
      this.clockGeneration += 1
      this.onAnomaly()
      return {
        now: Number.NaN,
        suspendGeneration: Number.NaN,
        clockGeneration: this.clockGeneration,
        anomaly: true
      }
    }
    if (
      !Number.isFinite(now) ||
      !Number.isSafeInteger(suspendGeneration) ||
      suspendGeneration < 0
    ) {
      this.clockGeneration += 1
      this.onAnomaly()
      return { now, suspendGeneration, clockGeneration: this.clockGeneration, anomaly: true }
    }
    const anomaly =
      (this.lastMonotonicNow !== undefined && now < this.lastMonotonicNow) ||
      (this.lastSuspendGeneration !== undefined && suspendGeneration !== this.lastSuspendGeneration)
    if (anomaly) {
      this.clockGeneration += 1
      this.onAnomaly()
    }
    this.lastMonotonicNow = now
    this.lastSuspendGeneration = suspendGeneration
    return { now, suspendGeneration, clockGeneration: this.clockGeneration, anomaly }
  }
}
