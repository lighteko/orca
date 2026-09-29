# Ticket Workspace — Master Plan

- Status: Active; the next implementation task is not authorized yet.
- Snapshot date: 2026-09-29
- Shared execution state: [project-state.md](./project-state.md)
- Active invariants and review constraints: [review-findings.md](./review-findings.md)
- Recovery-verified task DAG and first-cycle allocation: [task-graph.md](./task-graph.md)

## Original goal

Let a developer provision a ticket workspace, coordinate repository-specific agents from one ticket-root Orca Run, inspect and safely change repository roles, and prune only owned resources without losing branches, coordinator documents, or the user's current focus. The eventual Sellmate experience is a Tickets tree alongside the existing Projects/Workspaces view.

## Scope and architecture

The plan divides ownership into three layers:

1. **Ticket domain package:** owns canonical ticket/catalog state, repository roles, external-resource intent/evidence, and ticket-specific planning. Its intended canonical ledger is a strict versioned WSL XDG state store with explicit initialization and CAS updates.
2. **Orca runtime:** remains authoritative for Git worktrees, folder workspaces, agent sessions/status, terminals, orchestration Runs/Tasks/Dispatches, mutation receipts, Sleep/resume, and worktree cleanup. Ticket code must call existing Orca seams instead of duplicating those lifecycles.
3. **Sellmate integration:** joins ticket IDs to host-qualified Orca workspace/Run references, publishes bounded snapshots, and presents a Tickets tree/preview/confirmation UI. It must not make the renderer a second state owner.

An external ticket process does not impersonate the stable coordinator pane. The ticket's root agent pane is the Orca Run coordinator; repository worker starts use the existing orchestration authority. Docker/IIS/dev-server/test-lease effects are ticket-owned external resources, separate from Orca worktree mutations and receipts.

The MVP described by the plan is one developer PC using Windows Orca with local Windows/WSL execution. Existing Orca folder/SSH support must not regress, but SSH, paired remote runtime, relay, `orca serve`, and mobile Tickets UI are not part of this MVP. The current Git evidence implementation is narrower still: local-native Git worktrees only.

## Global invariants

- Reuse Orca's existing worktree, folder, terminal, agent-status, orchestration, Sleep/resume, and mutation-receipt authorities.
- Only `isolated` repositories own ticket-specific worktrees/runtime resources. `referenced` repositories remain read-only references; `excluded` repositories do not participate.
- User-visible planning is read-only. Destructive external actions require a target-bound preview/confirmation and idempotent, evidence-backed recovery.
- Orca mutation success is not proof that Docker/IIS/external cleanup succeeded. Record each authority's evidence independently and retry from the last trustworthy state.
- Preserve branches, coordinator folders, and local artifacts by default. `Prune` must not steal workspace/editor/terminal focus.
- Missing, stale, partial, mismatched, or untrusted evidence fails closed. In particular, empty Git status is not by itself a public `clear` result.
- No ticket-specific agent-status store, worktree lifecycle, message bus, inbox, or liveness vocabulary may be introduced.
- Provider-specific Git-host behavior is explicit; Git commands honor the Git 2.25 core-workflow baseline.

## Milestones and dependencies

| Milestone | Purpose                                                              | Snapshot state                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Verify and reuse Orca runtime/orchestration/cleanup seams            | Complete per the local detailed plan; Orca-side code and CI evidence are summarized in `project-state.md`.                                                                                                                                                                                               |
| M1        | Ticket catalog, profile, schema, CLI, read-only status/plan evidence | In progress. The local plan marks several contract/ledger/CLI slices complete. Their source is in a separate WSL checkout, but most current files are untracked; content provenance and current tests remain to be verified. Live evidence/provider wiring and ticket-to-Orca owner mapping remain open. |
| M2        | External-resource adapters and role convergence                      | Planned. Contract/fixture work may precede mutation wiring; effects depend on M1 schema/CAS and adapter ownership contracts.                                                                                                                                                                             |
| M3        | Ticket coordinator folder and local documents                        | Planned; depends on M1 coordinator/artifact schema.                                                                                                                                                                                                                                                      |
| M4        | Thin Orca local integration boundary                                 | Planned; M0 ownership decisions and M1 snapshot contract are prerequisites. It may progress in parallel with independent M1 contract work after the shared DTO contract is frozen.                                                                                                                       |
| M5        | Read-only Projects/Tickets tree                                      | Planned; depends on M1 snapshot and M4 boundary. Fixture-backed presentation may precede live providers.                                                                                                                                                                                                 |
| M6        | Existing workspace/agent actions                                     | Planned; depends on M3 and M5 and must use existing trust/orchestration paths.                                                                                                                                                                                                                           |
| M7        | Real ticket state and Sellmate integration                           | Planned; depends on M2, M3, and M6.                                                                                                                                                                                                                                                                      |
| M8        | Packaging, rollout, clean-machine pilot, and fork updates            | Planned; follows M7.                                                                                                                                                                                                                                                                                     |

```text
M0 -> M1
M0 -> M4
M1 snapshot/action DTO -> M4
M1 schema + CAS -> M2
M1 coordinator/artifact schema -> M3
M1 snapshot + M4 -> M5
M3 + M5 -> M6
M2 + M3 + M6 -> M7
M7 -> M8
```

Dependency edges: M0 -> M1 and M4; M1 canonical schema plus required ledger CAS -> M2; M1 coordinator/artifact schema -> M3; M0 ownership decisions plus frozen M1 snapshot/action DTO -> M4; M1 snapshot plus M4 -> M5; M3 plus M5 -> M6; M2 plus M3 plus M6 -> M7; M7 -> M8. M1 and M4 are not freely parallel: M4 starts only after canonical ownership and the DTO contract are stable. M2 contract tests/fixtures may start earlier, but external effects and role mutation wait for M1 schema/CAS and adapter ownership contracts. M3 need not wait for every M2 adapter. M5 may use fixtures, but its contract/corpus must be available to the worker first; destructive actions wait for separately verified preview contracts.

## Current next step (proposal, awaiting approval)

The separate ticket checkout first needs a content manifest and a retrievable tracked/archived revision for its untracked M1 source (TW-00). The manifest audit is read-only and independent of the Orca runtime implementation below; publication remains a later gate. The detailed task and approval gates are in [task-graph.md](./task-graph.md).

Finish the Orca-main local-native evidence source's internal freshness envelope: unique owner observation ID; immutable `ownerReadStartedAt` stamped before the first status/marker I/O; same-owner monotonic-clock freshness with a 30-second maximum and an overall call deadline; independent uncached/non-coalesced read per invocation; fail unavailable on cancellation, timeout, stale/future evidence, or clock anomaly. This is a prerequisite only. It does **not** implement ticket `WorkspaceRef` mapping, provider/CLI/IPC/UI wiring, cross-machine clock transfer, or public `clear`.
