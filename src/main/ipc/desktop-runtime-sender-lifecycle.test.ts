import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { DesktopRuntimeSenderLifecycle } from './desktop-runtime-sender-lifecycle'

type FakeSender = EventEmitter & {
  id: number
  mainFrame: object
  isDestroyed(): boolean
}

function fakeSender(id = 1): FakeSender {
  let destroyed = false
  const sender = Object.assign(new EventEmitter(), {
    id,
    mainFrame: {},
    isDestroyed: () => destroyed
  })
  sender.on('destroyed', () => {
    destroyed = true
  })
  return sender
}

function asWebContents(sender: FakeSender): WebContents {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the lifecycle calls only id, mainFrame, isDestroyed, on, once, and removeListener, all represented by this harness.
  return sender as unknown as WebContents
}

function createLifecycle() {
  return new DesktopRuntimeSenderLifecycle({ cleanupSubscriptionsForConnection: vi.fn() })
}

describe('desktop runtime sender document capture', () => {
  it('returns null for missing state and repeated capture never enrolls or advances it', () => {
    const sender = fakeSender()
    const lifecycle = createLifecycle()

    expect(lifecycle.captureCurrentDocument(asWebContents(sender))).toBeNull()
    expect(sender.listenerCount('did-navigate')).toBe(0)

    const connectionId = lifecycle.connectionIdFor(asWebContents(sender))
    const first = lifecycle.captureCurrentDocument(asWebContents(sender))
    const second = lifecycle.captureCurrentDocument(asWebContents(sender))

    expect(first?.isCurrent()).toBe(true)
    expect(second?.isCurrent()).toBe(true)
    expect(lifecycle.connectionIdFor(asWebContents(sender))).toBe(connectionId)
    expect(sender.listenerCount('did-navigate')).toBe(1)
    expect(sender.listenerCount('render-process-gone')).toBe(1)
    expect(sender.listenerCount('destroyed')).toBe(2)
  })

  it.each(['did-navigate', 'render-process-gone', 'destroyed'] as const)(
    'invalidates a captured document after %s',
    (eventName) => {
      const sender = fakeSender()
      const lifecycle = createLifecycle()
      lifecycle.connectionIdFor(asWebContents(sender))
      const captured = lifecycle.captureCurrentDocument(asWebContents(sender))

      sender.emit(eventName)

      expect(captured?.isCurrent()).toBe(false)
      if (eventName === 'destroyed') {
        expect(lifecycle.captureCurrentDocument(asWebContents(sender))).toBeNull()
      }
    }
  )

  it('invalidates a replaced sender without letting old events retire the replacement', () => {
    const lifecycle = createLifecycle()
    const oldSender = fakeSender(8)
    const newSender = fakeSender(8)
    lifecycle.connectionIdFor(asWebContents(oldSender))
    const oldCapture = lifecycle.captureCurrentDocument(asWebContents(oldSender))

    const newConnectionId = lifecycle.connectionIdFor(asWebContents(newSender))
    const newCapture = lifecycle.captureCurrentDocument(asWebContents(newSender))
    oldSender.emit('did-navigate')
    oldSender.emit('render-process-gone')
    oldSender.emit('destroyed')

    expect(oldCapture?.isCurrent()).toBe(false)
    expect(newCapture?.isCurrent()).toBe(true)
    expect(lifecycle.connectionIdFor(asWebContents(newSender))).toBe(newConnectionId)
  })

  it('keeps the capture current through same-document and blocked navigations', () => {
    const sender = fakeSender()
    const lifecycle = createLifecycle()
    lifecycle.connectionIdFor(asWebContents(sender))
    const captured = lifecycle.captureCurrentDocument(asWebContents(sender))

    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    sender.emit('did-navigate-in-page', 'file:///app#route')
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    sender.emit('will-navigate', { defaultPrevented: true }, 'https://example.invalid')

    expect(captured?.isCurrent()).toBe(true)
  })
})
