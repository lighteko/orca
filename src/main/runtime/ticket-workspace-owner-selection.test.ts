import { describe, expect, it } from 'vitest'
import {
  digestNavigatorSnapshotV1,
  validateTicketNavigatorSnapshotV1
} from '@lighteko/ticket-workspace-contracts/navigator-snapshot-v1'
import {
  makePositiveTicketWorkspaceSnapshot,
  validatedFullTicketSnapshot
} from './__fixtures__/ticket-workspace-owner-fixtures'
import { selectTicketWorkspaceOwnerMapping } from './ticket-workspace-owner-selection'

describe('selectTicketWorkspaceOwnerMapping', () => {
  it('rejects the delivered snapshot.full repository/target mismatch', () => {
    const snapshot = validatedFullTicketSnapshot()
    const ticket = snapshot.tickets[0]
    const workspace = ticket?.workspaces.find((row) => row.repositoryId === 'common-api')
    if (!ticket || !workspace?.target || workspace.target.kind !== 'git-worktree') {
      throw new Error('The delivered snapshot.full mismatch fixture changed shape.')
    }

    expect(workspace.repositoryId).toBe('common-api')
    expect(workspace.target.repoId).toBe('repo-1')
    expect(
      selectTicketWorkspaceOwnerMapping(snapshot, {
        ticketKey: ticket.ticketKey,
        repositoryId: workspace.repositoryId
      })
    ).toEqual({
      status: 'unavailable',
      snapshotRevision: snapshot.snapshotRevision,
      ticketKey: ticket.ticketKey,
      repositoryId: workspace.repositoryId
    })
  })

  it('maps only the five local Git fields and ignores producer reference states', () => {
    for (const referenceState of ['matched', 'unavailable', 'unsupported'] as const) {
      const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot({ referenceState })
      const result = selectTicketWorkspaceOwnerMapping(snapshot, selector)
      expect(result.status).toBe('mapped')
      if (result.status !== 'mapped') {
        throw new Error('The positive Orca-owned target did not map.')
      }

      expect(result.request).toEqual({
        repositoryId: 'common-api',
        worktreeId: 'common-api::/repo/worktree',
        executionHostId: 'local',
        instanceId: 'instance-1',
        identityKey: result.workspaceRef.identityKey
      })
      expect(Object.keys(result.request).sort()).toEqual([
        'executionHostId',
        'identityKey',
        'instanceId',
        'repositoryId',
        'worktreeId'
      ])
      expect(result).toMatchObject({
        snapshotRevision: snapshot.snapshotRevision,
        ticketKey: selector.ticketKey,
        repositoryId: selector.repositoryId,
        source: snapshot.source
      })
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.request)).toBe(true)
      expect(Object.isFrozen(result.workspaceRef)).toBe(true)
    }
  })

  it('fails closed for missing, folder, non-local, and ambiguous selections', () => {
    for (const options of [
      { removeTarget: true },
      { folderTarget: true },
      { executionHostId: 'ssh:builder' },
      { executionHostId: 'wsl:Ubuntu-24.04' }
    ]) {
      const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot(options)
      expect(selectTicketWorkspaceOwnerMapping(snapshot, selector).status).toBe('unavailable')
    }

    const { snapshot, selector } = makePositiveTicketWorkspaceSnapshot()
    const duplicateTicket = structuredClone(snapshot)
    const firstTicket = duplicateTicket.tickets[0]
    if (!firstTicket) {
      throw new Error('The positive synthetic snapshot has no ticket.')
    }
    duplicateTicket.tickets.push(structuredClone(firstTicket))
    duplicateTicket.snapshotRevision = digestNavigatorSnapshotV1(duplicateTicket)
    expect(selectTicketWorkspaceOwnerMapping(duplicateTicket, selector).status).toBe('unavailable')

    const duplicateWorkspace = structuredClone(snapshot)
    const ticket = duplicateWorkspace.tickets[0]
    const firstWorkspace = ticket?.workspaces[0]
    if (!ticket || !firstWorkspace) {
      throw new Error('The positive synthetic snapshot has no workspace.')
    }
    ticket.workspaces.push(structuredClone(firstWorkspace))
    duplicateWorkspace.snapshotRevision = digestNavigatorSnapshotV1(duplicateWorkspace)
    expect(selectTicketWorkspaceOwnerMapping(duplicateWorkspace, selector).status).toBe(
      'unavailable'
    )
  })

  it('does not infer the Orca host from ticket orchestration metadata', () => {
    const { snapshot: original, selector } = makePositiveTicketWorkspaceSnapshot()
    const snapshot = structuredClone(original)
    const ticket = snapshot.tickets[0]
    if (!ticket) {
      throw new Error('The positive synthetic snapshot has no ticket.')
    }
    ticket.orchestration.executionHostId = 'ticket-authority-wsl'
    snapshot.snapshotRevision = digestNavigatorSnapshotV1(snapshot)
    const validation = validateTicketNavigatorSnapshotV1(snapshot)
    if (validation.schemaVerdict !== 'accepted') {
      throw new Error(`The host-isolation vector was rejected: ${validation.reasonCode}`)
    }

    expect(selectTicketWorkspaceOwnerMapping(validation.value, selector).status).toBe('mapped')
  })
})
