# Ticket Workspace — Master Plan

- Status: Active. TW-02F fixture binding, TW-06F M4 boundary, TW-07F fixture M5, TW-04A common contract, and injected-only TW-06P/T passed independent review. Historical Orca PR HEAD `c4e87fa3b` pins private `9f10125` and passed 31 checks with eight skipped after one Windows job rerun. This Orca branch advances the submodule pin to private `14c69a1`; its exact-main fresh Ubuntu 24.04/ext4 CI passed frozen install, build, typecheck, 53 contract tests and 274 CLI tests with 21 skipped. TW-00-R4 then passed genuine WSL test replay with 53 contract and 292 CLI passes, three skips and zero failures; independent Sol 6.1 xhigh approved its evidence. TW-M1P-C1 passed experimental offline runtime closure; production P1-P8 host/key/endpoint/artifact/currentness gates remain open.
- Snapshot date: 2026-10-01
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

| Milestone | Purpose                                                              | Snapshot state                                                                                                                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0        | Verify and reuse Orca runtime/orchestration/cleanup seams            | Complete per the local detailed plan; Orca-side code and CI evidence are summarized in `project-state.md`.                                                                                                                                                                                                   |
| M1        | Ticket catalog, profile, schema, CLI, read-only status/plan evidence | In progress. Private source `f7d66d1` includes the reviewed injected producer and its self-contained golden test fixture, following the `54477c2` common resource-universe contract. TW-02F fixture mapping is complete, while authenticated live evidence/provider wiring and profile delivery remain open. |
| M2        | External-resource adapters and role convergence                      | Common TW-04A DTO/validator and synthetic corpus complete. Production adapter identity, endpoint, owner proof, query scope and clock handoff remain gates before typed Docker/IIS observations, effects or role mutation.                                                                                    |
| M3        | Ticket coordinator folder and local documents                        | Planned; depends on M1 coordinator/artifact schema.                                                                                                                                                                                                                                                          |
| M4        | Thin Orca local integration boundary                                 | Original fixture-backed TW-06F main/preload acceptance complete and reviewed. Its actual bundled preload passed the 22-case semantic corpus in PR CI. Live producer/resident cutover (TW-06) remains a later integration gate.                                                                               |
| M5        | Read-only Projects/Tickets tree                                      | Fixture checkpoint TW-07F implemented and independently reviewed, including selector-only click rebind, hidden mutation controls, a hidden CDP screenshot and same-head PR CI. Live snapshot cutover (TW-07) follows TW-06 and TW-02L live owner evidence.                                                   |
| M6        | Existing workspace/agent actions                                     | Planned. Effect-capable ticket actions depend on M3, the M5 tree, live M4/M5 cutover, exact owner mapping and root authority; existing trust/orchestration paths remain authoritative.                                                                                                                       |
| M7        | Real ticket state and Sellmate integration                           | Planned; depends on M2, M3, and M6.                                                                                                                                                                                                                                                                          |
| M8        | Packaging, rollout, clean-machine pilot, and fork updates            | Planned; follows M7.                                                                                                                                                                                                                                                                                         |

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

All four bounded modules and actual owner/source integration are complete locally at public code checkpoint `5b39c5963`; fresh Sol 6.1 issued `INTEGRATION_APPROVE`. Root regression passed 143 tests and final Node type/changed-quality gates passed. The commit retains published gitlink `14c69a1` and is not pushed. The continuing artifact Luna also completed independently approved TW-M1P-L1 at private `b556834`; its full contracts/CLI regression passed 59/273 tests with 45 CLI skips. Next, validate the publication candidate and the remaining local implementation frontier against current code. Real staging and durable ext4 activation retain their separate prerequisites.

The 2026-10-01 fresh Sol 6.1 review approved a bounded local code cycle: TW-06-B1's caller budget/shared source port, then disjoint TW-02L-I owner composition and TW-06-I semantic/high-water/currentness modules; TW-M1P-I private artifact verification is independent. The user authorized continued reviewed reversible local work within this project, including tests, integration and commits. Production provisioning is an activation gate, not a dependency of these injected modules. External publication, operational changes and actual key/security policy decisions remain Sol-routed approval gates.

TW-02F, TW-06F, TW-07F and private TW-04A are implemented, verified and independently reviewed within their fixture/common-contract scopes. The prior Orca commit `fa4e622f4ed742a02f689c1a066f29fa032a4ff4` pinned private source `54477c2371094f1cbc438845fdfde0ca3584e2aa`. Private `f0b3181` published the injected producer; `f7d66d1` adds its self-contained test fixture. The Orca client, approved public vectors and `f0b3181` submodule pin at `a29bc2169` passed [PR #1](https://github.com/lighteko/orca/pull/1) CI with 31 successful checks, eight skipped and no failures. The PR's `1ed22dd12` successor pins `f7d66d1` and also passed 31 checks with eight skipped and no failures. The original public snapshot package remains the user's exact approved [seven-file scope](./public-redistribution-proposal.md); this cycle has separate publication approval. The private source remains a submodule requiring authorized access.

The current [Task DAG checkpoint](./task-graph.md) closes the independently reviewed TW-06P/T injected code and TW-06P-F1 source-portability fix, then selects the next production proofs. The local fake-duplex cross-peer test passed a normal read and an authenticated epoch-change error with two fresh source reads each. Production setup still needs verified TW-M1P runtime/profile delivery, a pinned TW-06P service artifact, and trusted endpoint/key/host mapping; TW-06 main/cache additionally needs durable high-water and currentness policy. The [full parallel frontier](./task-graph.md#full-parallel-frontier-at-this-checkpoint) retains coordinator, adapter-owner evidence and owner-source contracts as separate gated workstreams.

TW-02L live owner evidence, TW-05/05G product code, TW-06P/T production setup, production external-resource adapters and all effects remain gated until their contracts and owner proofs pass review. The completed TW-06P/T code is injected-only and cannot publish live `current`, public `clear`, an Orca match or mutation authority. The approved new public vector files and Orca code passed code-head PR CI at `a29bc2169`. Detailed dependencies and open risks remain in the [Task DAG](./task-graph.md) and [project state](./project-state.md).
