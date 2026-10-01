import { describe, expect, it } from 'vitest'
import {
  parseTicketWorkspaceFixtureSelection,
  reboundTicketWorkspaceFixtureResponse,
  validateTicketWorkspaceFixtureMatchResponse,
  validateTicketWorkspaceFixtureRebindResponse
} from './ticket-workspace-owner-binding-boundary'

const selection = {
  snapshotRevision: 'a'.repeat(64),
  ticketKey: 'ORCA-7',
  repositoryId: 'common-api'
}

describe('ticket workspace owner binding boundary', () => {
  it('accepts only bounded exact selector keys', () => {
    expect(parseTicketWorkspaceFixtureSelection(selection)).toEqual(selection)
    expect(parseTicketWorkspaceFixtureSelection({ ...selection, path: '/repo' })).toBeNull()
    expect(
      parseTicketWorkspaceFixtureSelection(
        Object.assign(Object.create({ path: '/repo' }), selection)
      )
    ).toBeNull()
    expect(
      parseTicketWorkspaceFixtureSelection({ ...selection, snapshotRevision: 'a'.repeat(63) })
    ).toBeNull()
    expect(parseTicketWorkspaceFixtureSelection({ ...selection, ticketKey: 'bad-0' })).toBeNull()
    expect(
      parseTicketWorkspaceFixtureSelection({ ...selection, repositoryId: 'x'.repeat(256) })
    ).toBeNull()
    expect(
      parseTicketWorkspaceFixtureSelection({ ...selection, repositoryId: '\u00e9'.repeat(128) })
    ).toBeNull()
  })

  it('validates exact match response keys and selector bounds', () => {
    expect(
      validateTicketWorkspaceFixtureMatchResponse({ status: 'matched', ...selection })
    ).toEqual({
      status: 'matched',
      ...selection
    })
    expect(
      validateTicketWorkspaceFixtureMatchResponse({ status: 'matched', ...selection, id: 'x' })
    ).toEqual({ status: 'unavailable' })
    expect(
      validateTicketWorkspaceFixtureMatchResponse({
        status: 'matched',
        ...selection,
        ticketKey: 'X'.repeat(256)
      })
    ).toEqual({ status: 'unavailable' })
    expect(validateTicketWorkspaceFixtureMatchResponse({ status: 'unavailable' })).toEqual({
      status: 'unavailable'
    })
  })

  it('returns an Orca worktree ID only when it encodes the selected repository', () => {
    const worktreeId = 'common-api::/repo/worktree'
    expect(reboundTicketWorkspaceFixtureResponse(selection, worktreeId)).toEqual({
      status: 'rebound',
      ...selection,
      worktreeId
    })
    expect(reboundTicketWorkspaceFixtureResponse(selection, 'other-repo::/repo/worktree')).toEqual({
      status: 'unavailable',
      ...selection
    })
    expect(reboundTicketWorkspaceFixtureResponse(selection, 'common-api::')).toEqual({
      status: 'unavailable',
      ...selection
    })
    expect(
      validateTicketWorkspaceFixtureRebindResponse({
        status: 'rebound',
        ...selection,
        worktreeId: 'other-repo::/repo/worktree'
      })
    ).toEqual({ status: 'unavailable' })
    expect(
      validateTicketWorkspaceFixtureRebindResponse({
        status: 'rebound',
        ...selection,
        worktreeId,
        extra: true
      })
    ).toEqual({ status: 'unavailable' })
  })
})
