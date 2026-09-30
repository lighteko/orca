# Ticket Workspace — Master Plan

- Status: Active. TW-02F exact fixture owner binding, TW-06F read-only M4 main/preload boundary, TW-07F fixture M5 UI/navigation, and TW-04A common resource-universe contract passed independent review. TW-07F passed local hidden Electron CDP; the latest commits have not yet run PR CI. TW-06P/T has a reviewed contract candidate with P1–P8 owner decisions still open. New implementation allocations require independent next-step review and explicit user approval.
- Snapshot date: 2026-09-30
- Shared execution state: [project-state.md](./project-state.md)
- Readable current checklist: [current-todo.md](./current-todo.md)
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

## Agent workstream continuity

Keep one Luna xhigh session per broad implementation workstream and reuse it for related follow-on tasks. The contract/fixture workstream owns TW-00C then TW-00F; an owner-mapping workstream owns TW-02F and later TW-02L, while a main/preload workstream owns TW-06F and its later live cutover. Renderer and external-resource workstreams each retain their own context. Resume an existing workstream session when available. Create one successor only when the prior session is unavailable, then retain that successor across tasks. The former main Luna session is historical evidence only. Sol owns the DAG and coordinates approval gates; the user grants approvals. Fresh Sol reviewers remain independent at semantic checkpoints. Worker memory is supporting context, while these shared documents and repository evidence remain authoritative.

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

| Milestone | Purpose                                                              | Snapshot state                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0        | Verify and reuse Orca runtime/orchestration/cleanup seams            | Complete per the local detailed plan; Orca-side code and CI evidence are summarized in `project-state.md`.                                                                                                                                                                                                                                                                                                               |
| M1        | Ticket catalog, profile, schema, CLI, read-only status/plan evidence | In progress. Private source `54477c2` contains the reviewed common resource-universe contract; its package passed 53 tests and typecheck. TW-02F fixture mapping is complete, while authenticated live evidence/provider wiring and profile delivery remain open.                                                                                                                                                         |
| M2        | External-resource adapters and role convergence                      | Common TW-04A DTO/validator and synthetic corpus complete. Production adapter identity, endpoint, owner proof, query scope and clock handoff remain gates before typed Docker/IIS observations, effects or role mutation.                                                                                                                                                                                          |
| M3        | Ticket coordinator folder and local documents                        | Planned; depends on M1 coordinator/artifact schema.                                                                                                                                                                                                                                                                                                                                                                      |
| M4        | Thin Orca local integration boundary                                 | Original fixture-backed TW-06F main/preload acceptance complete and reviewed. Its actual bundled preload passed the 22-case semantic corpus in PR CI. Live producer/resident cutover (TW-06) remains a later integration gate.                                                                                                                                                                                       |
| M5        | Read-only Projects/Tickets tree                                      | Fixture checkpoint TW-07F implemented and independently reviewed locally, including selector-only click rebind, hidden mutation controls and CDP screenshot. Its latest commits still need PR CI. Live snapshot cutover (TW-07) follows TW-06 and TW-02L live owner evidence.                                                                                                                                              |
| M6        | Existing workspace/agent actions                                     | Planned. Effect-capable ticket actions depend on M3, the M5 tree, live M4/M5 cutover, exact owner mapping and root authority; existing trust/orchestration paths remain authoritative.                                                                                                                                                                                                                                   |
| M7        | Real ticket state and Sellmate integration                           | Planned; depends on M2, M3, and M6.                                                                                                                                                                                                                                                                                                                                                                                      |
| M8        | Packaging, rollout, clean-machine pilot, and fork updates            | Planned; follows M7.                                                                                                                                                                                                                                                                                                                                                                                                     |

```text
M0 -> M1
M0 -> M4
M1 snapshot/action DTO -> M4
M1 schema + CAS -> M2
M1 coordinator/artifact schema -> M3
M1 snapshot + M4 + exact owner mapping -> M5
M3 + M5 + live M4/M5 cutover -> M6 effect-capable actions
M2 + M3 + M6 -> M7
M7 -> M8
```

Dependency edges: M0 -> M1 and M4; M1 canonical schema plus required ledger CAS -> M2; M1 coordinator/artifact schema -> M3; M0 ownership decisions plus frozen M1 snapshot/action DTO -> M4; M1 snapshot plus M4 plus exact owner mapping -> M5; M3 plus M5 plus live M4/M5 cutover -> M6 effect-capable actions; M2 plus M3 plus M6 -> M7; M7 -> M8. M1 and M4 are not freely parallel: the fixture M4 boundary starts only after canonical ownership, the full semantic validator, and reproducible IPC fixtures are available. M5 fixture presentation then satisfies the original read-only milestone without live producer/transport. Fixture-based workspace navigation requires a click-time revalidated Orca-owned ID from TW-02F; TW-02L separately gates live owner status and M1 production evidence. Live M4/M5 cutover, root authority and separate effect previews gate later actions and M7 integration. M2 contract tests/fixtures may start earlier, but external effects and role mutation wait for M1 schema/CAS and adapter ownership contracts. M3 need not wait for every M2 adapter; destructive actions wait for separately verified preview contracts.

## Current next step

TW-02F, TW-06F, TW-07F and private TW-04A are implemented, verified and independently reviewed within their fixture/common-contract scopes. The earlier Orca implementation commit `8ba6d003e9d68148fe4c7a2e51063294cfa0546f` pins private source `54477c2371094f1cbc438845fdfde0ca3584e2aa`; [PR #1 CI](https://github.com/lighteko/orca/actions/runs/36587099645) passed 31 checks with eight skipped and zero failures at that older commit. TW-07F's newer local commits passed focused tests, type/quality gates and hidden Electron CDP, but still need PR CI after delivery. The public snapshot package remains the user's exact approved [seven-file scope](./public-redistribution-proposal.md); the private source remains a separate submodule requiring authorized access.

The next [Task DAG checkpoint](./task-graph.md) is remote CI for the reviewed M5 commit set and owner ratification of the TW-06P/T contract candidate's P1–P8 choices. Only after the shared live protocol freezes may disjoint TW-06P producer and TW-06T injected transport work run in parallel; production setup also needs verified TW-M1P runtime/profile delivery and the separate service artifact. The [full parallel frontier](./task-graph.md#full-parallel-frontier-at-this-checkpoint) retains coordinator, adapter-owner evidence, owner-source contracts and M1 profile delivery as separate gated workstreams.

TW-02L live owner evidence implementation, TW-05/05G product code, TW-06P/T production code, production external-resource adapters and all effects remain gated until their contracts and owner proofs pass review. Their contract/evidence preparation may proceed. Fixture results cannot claim live `current`, public `clear` or mutation authority. Detailed dependencies and open risks remain in the [Task DAG](./task-graph.md) and [project state](./project-state.md).
