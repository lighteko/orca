import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type {
  TicketWorkspaceFixtureMatchResponse,
  TicketWorkspaceFixtureRebindResponse,
  TicketWorkspaceFixtureSelection
} from '../../../../shared/ticket-workspace-owner-binding-boundary'

export type TicketWorkspaceOwnerMatchState = 'checking' | 'matched' | 'unavailable'

export function createTicketWorkspaceFixtureSelection(
  snapshotRevision: string,
  ticketKey: string,
  repositoryId: string
): TicketWorkspaceFixtureSelection {
  return { snapshotRevision, ticketKey, repositoryId }
}

export function useTicketWorkspaceFixtureOwnerBinding(
  selection: TicketWorkspaceFixtureSelection | null
): {
  matchState: TicketWorkspaceOwnerMatchState | null
  beginSelectionChange: (selection: TicketWorkspaceFixtureSelection | null) => void
  activateSelection: (selection: TicketWorkspaceFixtureSelection) => void
} {
  const [matchState, setMatchState] = useState<TicketWorkspaceOwnerMatchState | null>(null)
  const viewActiveRef = useRef(false)
  const selectionEpochRef = useRef(0)
  const clickEpochRef = useRef(0)
  const matchRequestRef = useRef(0)
  const currentSelectionKeyRef = useRef<string | null>(null)
  const snapshotRevision = selection?.snapshotRevision
  const ticketKey = selection?.ticketKey
  const repositoryId = selection?.repositoryId
  const stableSelection = useMemo(
    () =>
      snapshotRevision && ticketKey && repositoryId
        ? { snapshotRevision, ticketKey, repositoryId }
        : null,
    [repositoryId, snapshotRevision, ticketKey]
  )
  const selectionKey = stableSelection ? getSelectionKey(stableSelection) : null

  useEffect(() => {
    viewActiveRef.current = true
    return () => {
      viewActiveRef.current = false
      selectionEpochRef.current += 1
      clickEpochRef.current += 1
      matchRequestRef.current += 1
    }
  }, [])

  useEffect(() => {
    currentSelectionKeyRef.current = selectionKey
    if (!stableSelection || !selectionKey) {
      setMatchState(null)
      return
    }

    const selectionEpoch = selectionEpochRef.current
    const requestEpoch = ++matchRequestRef.current
    setMatchState('checking')
    void Promise.resolve()
      .then(() => window.api.ticketWorkspace.matchFixtureSelection(stableSelection))
      .then(
        (response) => {
          if (!isCurrentRequest(selectionEpoch, requestEpoch, selectionKey)) {
            return
          }
          setMatchState(isMatchedResponse(response, stableSelection) ? 'matched' : 'unavailable')
        },
        () => {
          if (isCurrentRequest(selectionEpoch, requestEpoch, selectionKey)) {
            setMatchState('unavailable')
          }
        }
      )

    return () => {
      if (matchRequestRef.current === requestEpoch) {
        matchRequestRef.current += 1
      }
    }
  }, [selectionKey, stableSelection])

  const beginSelectionChange = useCallback(
    (nextSelection: TicketWorkspaceFixtureSelection | null) => {
      selectionEpochRef.current += 1
      clickEpochRef.current += 1
      matchRequestRef.current += 1
      currentSelectionKeyRef.current = nextSelection ? getSelectionKey(nextSelection) : null
      setMatchState(null)
    },
    []
  )

  const activateSelection = useCallback((requestedSelection: TicketWorkspaceFixtureSelection) => {
    const requestedKey = getSelectionKey(requestedSelection)
    if (!viewActiveRef.current || currentSelectionKeyRef.current !== requestedKey) {
      return
    }

    const selectionEpoch = selectionEpochRef.current
    const clickEpoch = ++clickEpochRef.current
    void Promise.resolve()
      .then(() => window.api.ticketWorkspace.rebindFixtureSelection(requestedSelection))
      .then(
        (response) => {
          if (
            !isCurrentRequest(selectionEpoch, clickEpoch, requestedKey, true) ||
            !isReboundResponse(response, requestedSelection)
          ) {
            return
          }
          activateAndRevealWorkspace(response.worktreeId, {
            executionHostId: LOCAL_EXECUTION_HOST_ID
          })
        },
        () => undefined
      )
  }, [])

  function isCurrentRequest(
    expectedSelectionEpoch: number,
    expectedRequestEpoch: number,
    expectedSelectionKey: string,
    isClick = false
  ): boolean {
    const requestEpoch = isClick ? clickEpochRef.current : matchRequestRef.current
    return (
      viewActiveRef.current &&
      selectionEpochRef.current === expectedSelectionEpoch &&
      requestEpoch === expectedRequestEpoch &&
      currentSelectionKeyRef.current === expectedSelectionKey
    )
  }

  return { matchState, beginSelectionChange, activateSelection }
}

function getSelectionKey(selection: TicketWorkspaceFixtureSelection): string {
  return JSON.stringify([selection.snapshotRevision, selection.ticketKey, selection.repositoryId])
}

function isMatchedResponse(
  response: TicketWorkspaceFixtureMatchResponse,
  selection: TicketWorkspaceFixtureSelection
): boolean {
  return response.status === 'matched' && hasMatchingSelectors(response, selection)
}

function isReboundResponse(
  response: TicketWorkspaceFixtureRebindResponse,
  selection: TicketWorkspaceFixtureSelection
): response is Extract<TicketWorkspaceFixtureRebindResponse, { status: 'rebound' }> {
  return response.status === 'rebound' && hasMatchingSelectors(response, selection)
}

function hasMatchingSelectors(
  response: TicketWorkspaceFixtureSelection,
  selection: TicketWorkspaceFixtureSelection
): boolean {
  return (
    response.snapshotRevision === selection.snapshotRevision &&
    response.ticketKey === selection.ticketKey &&
    response.repositoryId === selection.repositoryId
  )
}
