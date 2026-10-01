import {
  TicketWorkspaceResidentClient,
  type TicketResidentConnectResult
} from './ticket-workspace-resident-client'
import type { TicketWorkspaceResidentClientOptions } from './ticket-workspace-resident-client-contract'
import type { TicketResidentBinding } from './ticket-workspace-resident-protocol'
import type { ResidentSourceClockMonitor } from './ticket-workspace-resident-source-clock'
import type {
  TicketWorkspaceResidentSourceAdapter,
  TicketWorkspaceResidentSourceAdapterOptions,
  TicketWorkspaceResidentSourceConnectResult
} from './ticket-workspace-resident-source-adapter-contract'

export async function connectResidentSourceAdapterAfterSetup(
  options: TicketWorkspaceResidentSourceAdapterOptions,
  expectedBinding: TicketResidentBinding,
  clock: ResidentSourceClockMonitor,
  createAdapter: (
    client: TicketWorkspaceResidentClient,
    binding: TicketResidentBinding,
    ledgerEpoch: string,
    connectionIncarnation: string
  ) => TicketWorkspaceResidentSourceAdapter
): Promise<TicketWorkspaceResidentSourceConnectResult> {
  const clientOptions: TicketWorkspaceResidentClientOptions = {
    duplex: options.duplex,
    setupKey: options.setupKey,
    expectedBinding,
    now: clock.now,
    ...(options.setupBudgetMs !== undefined ? { setupBudgetMs: options.setupBudgetMs } : {}),
    ...(options.expectLaunchReady !== undefined
      ? { expectLaunchReady: options.expectLaunchReady }
      : {}),
    ...(options.randomBytes ? { randomBytes: options.randomBytes } : {})
  }
  const connected: TicketResidentConnectResult =
    await TicketWorkspaceResidentClient.connect(clientOptions)
  if (connected.status !== 'connected') {
    return connected
  }
  const ledgerEpoch = connected.client.boundLedgerEpoch
  const connectionIncarnation = connected.client.connectionIncarnation
  if (!ledgerEpoch || !connectionIncarnation || connected.client.isRetired) {
    connected.client.close()
    return { status: 'unavailable', reason: 'invalid_protocol' }
  }
  let canRegisterLease = true
  try {
    canRegisterLease = options.canRegisterLease?.() ?? true
  } catch {
    canRegisterLease = false
  }
  if (!canRegisterLease) {
    connected.client.close()
    return { status: 'unavailable', reason: 'deadline_exceeded' }
  }
  return {
    status: 'connected',
    source: createAdapter(connected.client, expectedBinding, ledgerEpoch, connectionIncarnation)
  }
}
