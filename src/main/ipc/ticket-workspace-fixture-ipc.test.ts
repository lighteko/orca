import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TICKET_WORKSPACE_FIXTURE_CHANNEL } from '../../shared/ticket-workspace-fixture-boundary'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    ipcHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
  }
})

vi.mock('electron', () => ({ ipcMain: { handle: mocks.ipcHandle } }))

const { registerTicketWorkspaceFixtureIpcHandler } = await import('./ticket-workspace-fixture-ipc')

describe('ticket workspace fixture IPC', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.ipcHandle.mockClear()
  })

  it('accepts only the zero-argument fixture request', async () => {
    registerTicketWorkspaceFixtureIpcHandler()
    const handler = mocks.handlers.get(TICKET_WORKSPACE_FIXTURE_CHANNEL)

    expect(handler).toBeDefined()
    await expect(handler?.({})).resolves.toMatchObject({
      contractVersion: 1,
      provenance: { kind: 'fixture', snapshotCaseId: 'accepted-full-snapshot' }
    })
    expect(handler?.({}, { path: 'C:\\untrusted\\snapshot.json' })).toMatchObject({
      status: 'unavailable',
      scope: 'tickets-only'
    })
  })
})
