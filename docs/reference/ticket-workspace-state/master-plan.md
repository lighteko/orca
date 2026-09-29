# Ticket Workspace — Master Plan

- Status: Active; fixture/live sequencing was corrected after an off-track audit. The continuing Luna contract/fixture workstream completed the user-approved TW-00N private candidate, and fresh Sol review approved its technical scope. New implementation allocations require independent next-step review and explicit user approval.
- Snapshot date: 2026-09-29
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

Keep one Luna xhigh session per broad implementation workstream and reuse it for related follow-on tasks. The contract/fixture workstream owns TW-00C then TW-00F; an owner-mapping workstream owns TW-02 after its contract-delivery gate; later main/preload, renderer, and external-resource workstreams each retain their own context. Resume an existing workstream session when available. Create one successor only when the prior session is unavailable, then retain that successor across tasks. The former main Luna session is historical evidence only. Sol owns the DAG and coordinates approval gates; the user grants approvals. Fresh Sol reviewers remain independent at semantic checkpoints. Worker memory is supporting context, while these shared documents and repository evidence remain authoritative.

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
| M1        | Ticket catalog, profile, schema, CLI, read-only status/plan evidence | In progress. The bounded contract/ledger/CLI source is published in a separate private repository; the initial 128-file revision passed fresh-clone hash checks and 314 isolated Linux tests with one skipped. The current 157-file revision passed 51 contract checks, typecheck, and private snapshot-candidate replay. Live evidence/provider wiring, profile delivery, and ticket-to-Orca owner mapping remain open. |
| M2        | External-resource adapters and role convergence                      | Planned. Contract/fixture work may precede mutation wiring; effects depend on M1 schema/CAS and adapter ownership contracts.                                                                                                                                                                                                                                                                                             |
| M3        | Ticket coordinator folder and local documents                        | Planned; depends on M1 coordinator/artifact schema.                                                                                                                                                                                                                                                                                                                                                                      |
| M4        | Thin Orca local integration boundary                                 | Planned. Its original acceptance check is a fixture-backed, read-only main/preload boundary (TW-06F) after the canonical runtime contract and reproducible IPC corpus are delivered. The live producer/resident cutover (TW-06) is a later integration gate.                                                                                                                                                             |
| M5        | Read-only Projects/Tickets tree                                      | Planned. Its original acceptance check is a fixture-backed read-only Tickets tree with actions hidden (TW-07F), after TW-06F and TW-02 exact owner mapping for navigation. Live snapshot cutover (TW-07) follows TW-06.                                                                                                                                                                                                  |
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

Dependency edges: M0 -> M1 and M4; M1 canonical schema plus required ledger CAS -> M2; M1 coordinator/artifact schema -> M3; M0 ownership decisions plus frozen M1 snapshot/action DTO -> M4; M1 snapshot plus M4 plus exact owner mapping -> M5; M3 plus M5 plus live M4/M5 cutover -> M6 effect-capable actions; M2 plus M3 plus M6 -> M7; M7 -> M8. M1 and M4 are not freely parallel: the fixture M4 boundary starts only after canonical ownership, the full semantic validator, and reproducible IPC fixtures are available. M5 fixture presentation then satisfies the original read-only milestone without live producer/transport. Fixture-based workspace navigation requires a revalidated Orca-owned ID from TW-02; live M4/M5 cutover, root authority and separate effect previews gate later actions and M7 integration. M2 contract tests/fixtures may start earlier, but external effects and role mutation wait for M1 schema/CAS and adapter ownership contracts. M3 need not wait for every M2 adapter; destructive actions wait for separately verified preview contracts.

## Current next step

The separate ticket checkout has a bounded [source audit](./ticket-source-audit.md), an initially verified private commit `2045808ffdb6baead2e659855cefb02f7b36491c` and current private commit `31b3768e8043b6aeef66f0fe0fe648439ba80b2b` (tree `150b23c5c7380f255c86d229a04e8f97c3366987`), with a [Git-blob manifest](./ticket-published-source.sha256). The initial revision passed fresh retrieval and the isolated Linux package suite; the current contract pin passed 51 tests, typecheck/build, deterministic private packing, and 22 source plus 15 fixture-envelope Node/browser VM checks. The user-authorized `ticket-workspace/` submodule in the public Orca fork passed independent review and was initially pinned in commit `d1f86d608`; its current gitlink points to the new private source commit. Authorized developers need private-repository access to initialize it, while current ordinary Orca CI does not fetch submodules. The detailed dependency gates are in [task-graph.md](./task-graph.md).

The Orca-main local-native evidence source's internal freshness envelope (TW-01) is implemented and passed a fresh Sol review. It gives each capture a unique owner observation ID, an immutable `ownerReadStartedAt` stamped before status I/O, same-owner monotonic freshness with a 30-second maximum and an overall deadline that includes pre-attestation, and conservative cancellation/timeout failure. This is a prerequisite only; ticket `WorkspaceRef` mapping, provider/CLI/IPC/UI wiring, cross-machine clock transfer, and public `clear` remain open.

The continuing Luna workstream completed TW-00N snapshot-only private candidate implementation and the later TW-00C/TW-00F private delivery preparation. Fresh Sol approved both checkpoints after required corrections. The reviewed 30-file, 17,941-byte private `UNLICENSED` archive is source-pinned at `d27fe24`, excludes catalog/resource/config/plan implementation code, and passed tarball-only cached offline/frozen install, TypeScript and 22-source/15-envelope Node/browser VM replay. A neutral archive derived from it and six fixture files form the separately reviewed [exact seven-file public-byte proposal](./public-redistribution-proposal.md); no proposed bytes are public yet. The old 37-row IPC corpus is tracked privately with executable replacements or explicit live/M5 deferrals; its ignored proposal is historical. The full-`/v1` candidate remains a private fallback. Public copying requires separate exact-byte rights approval. TW-06F fixture main/preload validation and TW-02 exact ticket-to-Orca join then precede TW-07F read-only Tickets presentation. TW-05 coordinator/root authority, TW-06P ticket producer and TW-06T authenticated resident transport remain separate live branches. No private candidate implements those live boundaries or permits effects or public `clear`.
