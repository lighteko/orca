import { describe, expect, it, vi } from 'vitest'
import { binding } from './ticket-workspace-resident-test-peer'
import {
  connectSource,
  snapshot,
  sourceLeaseIdentity
} from './ticket-workspace-resident-source-adapter-test-fixture'
import { createResidentSourceHighWaterKey } from './ticket-workspace-resident-high-water'

describe('resident source read settlement', () => {
  it('rejects a read when its lifetime observation reaches the original operation deadline', async () => {
    let now = 100
    let onClockRead = (): void => undefined
    const connected = await connectSource(
      [snapshot()],
      () => {
        onClockRead()
        return now
      },
      () => 0,
      () => null
    )
    afterFinalPreLifetimeHighWaterCheck(connected, () => {
      onClockRead = () => {
        now = 5_100
        onClockRead = () => undefined
      }
    })

    await expect(
      connected.source.readCurrentPresentationSnapshot(new AbortController().signal, 5_000)
    ).resolves.toEqual({ status: 'unavailable' })
    connected.source.close()
  })

  it('rejects a read when the lifetime observation triggers the original caller abort', async () => {
    const controller = new AbortController()
    let abortOnClockRead = false
    const connected = await connectSource(
      [snapshot()],
      () => {
        if (abortOnClockRead) {
          abortOnClockRead = false
          controller.abort()
        }
        return 100
      },
      () => 0,
      () => null
    )
    afterFinalPreLifetimeHighWaterCheck(connected, () => {
      abortOnClockRead = true
    })

    await expect(
      connected.source.readCurrentPresentationSnapshot(controller.signal, 5_000)
    ).resolves.toEqual({ status: 'unavailable' })
    connected.source.close()
  })

  it('rejects a read when the lifetime observation detects a suspend', async () => {
    let suspendGeneration = 0
    const connected = await connectSource(
      [snapshot()],
      () => 100,
      () => suspendGeneration,
      () => null
    )
    afterFinalPreLifetimeHighWaterCheck(connected, () => {
      suspendGeneration += 1
    })

    await expect(
      connected.source.readCurrentPresentationSnapshot(new AbortController().signal, 5_000)
    ).resolves.toEqual({ status: 'unavailable' })
    connected.source.close()
  })

  it('rechecks the original owner, deadline, and HWM facts after the nullable delegate await', async () => {
    const controller = new AbortController()
    const connected = await connectSource(
      [snapshot()],
      () => 100,
      () => 0,
      () => null
    )
    const detailedRead = vi.spyOn(connected.source, 'readCurrentPresentationSnapshot')
    const key = createResidentSourceHighWaterKey(binding, 'epoch-a')
    const leaseGeneration = connected.highWater.registerLease(key, sourceLeaseIdentity())
    afterFinalCurrentnessCheck(connected, () => {
      queueMicrotask(() => connected.highWater.invalidateLease(key, leaseGeneration))
    })

    await expect(connected.source.readCurrentSnapshot(controller.signal, 5_000)).resolves.toBeNull()
    expect(detailedRead).toHaveBeenCalledTimes(1)
    connected.source.close()
  })

  it('rechecks the original deadline and signal after the nullable delegate await', async () => {
    let now = 100
    const deadlineRead = await connectSource(
      [snapshot()],
      () => now,
      () => 0,
      () => null
    )
    afterFinalCurrentnessCheck(deadlineRead, () => {
      queueMicrotask(() => {
        now = 5_100
      })
    })
    await expect(
      deadlineRead.source.readCurrentSnapshot(new AbortController().signal, 5_000)
    ).resolves.toBeNull()
    deadlineRead.source.close()

    const controller = new AbortController()
    const abortRead = await connectSource(
      [snapshot()],
      () => 100,
      () => 0,
      () => null
    )
    afterFinalCurrentnessCheck(abortRead, () => {
      queueMicrotask(() => controller.abort())
    })
    await expect(abortRead.source.readCurrentSnapshot(controller.signal, 5_000)).resolves.toBeNull()
    abortRead.source.close()
  })
})

function afterFinalPreLifetimeHighWaterCheck(
  connected: Awaited<ReturnType<typeof connectSource>>,
  afterCheck: () => void
): void {
  observeHighWaterChecks(connected, 2, afterCheck)
}

function afterFinalCurrentnessCheck(
  connected: Awaited<ReturnType<typeof connectSource>>,
  afterCheck: () => void
): void {
  observeHighWaterChecks(connected, 5, afterCheck)
}

function observeHighWaterChecks(
  connected: Awaited<ReturnType<typeof connectSource>>,
  checkToObserve: number,
  afterCheck: () => void
): void {
  const originalIsCurrent = connected.highWater.isCurrent.bind(connected.highWater)
  let checks = 0
  vi.spyOn(connected.highWater, 'isCurrent').mockImplementation((facts) => {
    const current = originalIsCurrent(facts)
    checks += 1
    if (checks === checkToObserve) {
      afterCheck()
    }
    return current
  })
}
