# Ticket Workspace — Recovery-Verified Task DAG

Snapshot: 2026-09-29. This graph refines the [master milestones](./master-plan.md) using the current Orca checkout and a read-only check of the separate WSL ticket checkout. Its current M1 source is mostly untracked, so TW-00 must establish portable content provenance before downstream allocation. Task IDs describe deliverables, not automatic authorization to implement them.

## Dependency graph

```text
M0 (verified Orca seams) ──> TW-01 ──> TW-02 ──> TW-03 ───────────────┐
TW-00 (source/contracts) ─> TW-02, TW-04A, TW-05, TW-06T            │
TW-04A + TW-05G ──> TW-04B ──> TW-03, TW-04C                        ├─> TW-09 ─> TW-10
TW-05 ──> TW-05G ──> TW-04B, TW-08                                    │
TW-06T ──> TW-06 ──> TW-07 ──> TW-08 ──> TW-04C ──────────────────────┘
TW-02 + TW-04B + other owner-source contracts ──> TW-03
```

TW-01 and TW-00's read-only source audit ran in parallel. TW-01 passed independent review; TW-00 still needs portable source publication and current test verification. Implementation of TW-02 through TW-08 is gated by the specific contracts below. M2 effects, role mutation, and Tickets actions must not start from fixture-only evidence.

## Tasks

### TW-00 — Verify the ticket-domain source and publish its contracts

- **GOAL:** Verify the located WSL ticket checkout's M1 contract, ledger/CAS, doctor/status/plan, and fixture claims against its current source and tests, then make their content provenance portable.
- **DEPENDENCIES:** None; historical plan and current Orca checkout are inputs.
- **OWNERSHIP:** Sol Orchestrator for source identification and shared-state update; a fresh Luna worker may perform bounded read-only inventory once the source is identified.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain package/CLI in its own checkout; `docs/ticket-workspace-*` and `docs/contracts/`, `docs/fixtures/` here; these shared-state documents.
- **INPUT CONTRACT:** Historical M1 checklist is a claim. Source is `/home/sellmate/ticket-workspace` on Ubuntu-24.04 at Git HEAD `cf184eaa`, but most M1 source/tests are untracked, so HEAD is not their content revision.
- **OUTPUT CONTRACT:** Bounded content manifest **and** retrievable tracked/archived source plus fixtures, verified versus missing M1 slices, portable contract location, and corrected dependencies in shared state. Until the archive/revision exists, a manifest supports only local audit, not fresh-clone allocation.
- **CONSTRAINTS:** Read-only until ownership and repository boundary are established; preserve user changes and worktree isolation.
- **DO_NOT_TOUCH:** Ticket product code, external resources, Orca runtime/UI, and unrelated repositories during inventory.
- **ACCEPTANCE CRITERIA:** Every M1 completion claim needed by TW-02/TW-04A/TW-05/TW-06T has content provenance and a current test or is explicitly unresolved; fresh workers can access the required source and contracts without depending on the old Luna session.
- **VERIFICATION:** `git ls-files` and untracked inventory, bounded source inspection, package tests in an available Linux Node environment, fixture provenance/hash checks, shared-state review. The present WSL shell cannot run its Windows-resolved `corepack` shim.
- **PARALLELIZATION SAFETY:** Safe beside TW-01 while read-only; contract publication must finish before dependent work.
- **POTENTIAL CONFLICTS:** The WSL checkout has many untracked M1 files and seven modified tracked files; preserve that dirty state. Local ignored documents may diverge from the package; M4/M5 fixtures are not tracked in Orca.

### TW-01 — Add owner freshness to internal local-native Git capture

- **GOAL:** Give each exact local-native status/marker capture a unique owner observation ID, immutable start time, same-owner monotonic freshness, and an overall 30-second deadline.
- **DEPENDENCIES:** Verified M0 binding, effective-subject attestation, status-record capture, and marker reader already at `d500f2d47`.
- **OWNERSHIP:** One fresh Luna xhigh worker owns the Orca runtime capture seam and its tests.
- **FILES / MODULES LIKELY INVOLVED:** `src/main/runtime/runtime-git-status-record-capture.ts`, its tests, `orca-runtime-file-commands.ts`; existing Git capture types only if required.
- **INPUT CONTRACT:** Exact `ExactLocalNativeGitWorktreeBinding`; current native status/marker owner APIs and abort signal. No ticket `WorkspaceRef` is supplied.
- **OUTPUT CONTRACT:** Internal owner-created observation identity/start time bound to the existing exact capture; unavailable on cancellation, timeout, stale/future result, or clock anomaly.
- **CONSTRAINTS:** Stamp once before the first status/marker I/O; every admitted invocation gets its own uncached, non-coalesced read; overlapping calls may fail unavailable while a single owner slot is occupied. Keep child/probe slots until settlement and use one owner clock.
- **DO_NOT_TOUCH:** Ticket schema/CLI/provider, IPC/preload/renderer, WSL/SSH/folder evidence, public `clear`, external resources.
- **ACCEPTANCE CRITERIA:** Distinct IDs and reads for each admitted capture, with no evidence reuse for overlapping calls; no adapter receipt-time refresh; 30-second admission/deadline; conservative failure; existing capture behavior preserved.
- **VERIFICATION:** Focused timing, concurrent UI/plan, abort/timeout settlement, stale/future/clock-anomaly tests; Node typecheck and changed-code quality; fresh Sol xhigh review. Windows native integration remains CI-owned where MSVC is unavailable locally.
- **PARALLELIZATION SAFETY:** Serial within this seam; safe beside read-only TW-00. Do not assign another worker to its runtime files.
- **POTENTIAL CONFLICTS:** Binding/attestation already use shorter deadlines and single-slot ownership; avoid a second timeout that releases work early.

### TW-02 — Bind ticket `WorkspaceRef` to the exact Orca owner tuple

- **GOAL:** Define and implement the authoritative ticket-to-Orca local workspace join without path-only or cached-row identity.
- **DEPENDENCIES:** TW-00 verified ticket schema/owner tuple; TW-01 owner evidence; M0 identity and execution-host contracts.
- **OWNERSHIP:** One worker for the cross-boundary contract; implementation ownership split only after the DTO is frozen.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain `WorkspaceRefV1` and owner mapping; Orca worktree catalog binding and host-qualified workspace references.
- **INPUT CONTRACT:** Validated ticket authority/epoch/revision/ticket/repository tuple plus host-qualified `WorkspaceRefV1` with non-reused instance and canonical identity.
- **OUTPUT CONTRACT:** Exact, revalidated owner mapping or unavailable; no public cleanliness verdict.
- **CONSTRAINTS:** Folder, WSL, SSH, paired, stale, duplicate, and legacy-ambiguous references fail closed for this local-native slice.
- **DO_NOT_TOUCH:** Agent-status store, worktree lifecycle, external adapters, renderer state owner.
- **ACCEPTANCE CRITERIA:** Same path with changed instance, host, store incarnation/revision, route, or target cannot inherit evidence.
- **VERIFICATION:** Mapping/ABA/host isolation tests and mixed-version contract review.
- **PARALLELIZATION SAFETY:** Serial until DTO and ownership are frozen; later Orca and ticket implementations may be split by file boundary.
- **POTENTIAL CONFLICTS:** The ticket owner tuple's exact authoritative source and portable revision are unresolved inside the located WSL checkout.

### TW-03 — Compose read-only production plan evidence

- **GOAL:** Join exact worktree, agent, test/lease, ownership, and external-resource owner observations into conservative ticket plan projection.
- **DEPENDENCIES:** TW-02; TW-04B external-resource inspection/evidence; verified contracts for every other owner source.
- **OWNERSHIP:** Ticket-domain provider worker after owner-source contracts are frozen; Orca owner adapters separately reviewed.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain plan evidence provider/CLI; Orca execution-host status store and observation ports.
- **INPUT CONTRACT:** One invocation-bound, source-owned observation per required authority, with target identity, completeness, provenance, and clock handoff.
- **OUTPUT CONTRACT:** Versioned read-only `plan` evidence and blocker projection; incomplete/unverifiable where any required proof is missing.
- **CONSTRAINTS:** Positive blockers may be conservative; empty Git status and marker absence alone never yield `clear`; no WSL/Windows wall-clock equivalence assumption.
- **DO_NOT_TOUCH:** Parallel agent-status store, cached clear result, resource mutations, public `clear` before every source contract is proven.
- **ACCEPTANCE CRITERIA:** Exact source completeness and admission across all required authorities; old peers and missing sources fail closed.
- **VERIFICATION:** Cross-source fixture matrix, clock/cancel/partial-failure tests, provider contract and independent integration review.
- **PARALLELIZATION SAFETY:** Owner-source research can be parallel by authority; final composition is serial after contracts stabilize.
- **POTENTIAL CONFLICTS:** Exact agent status, test lease, ownership, external universe, WSL route, and clock handoff remain unresolved.

### TW-04A — Freeze external-resource adapter contracts and fixtures

- **GOAL:** Define `discover/plan/provision/inspect/teardown`, resource ownership, evidence, preview, and retry semantics before effects.
- **DEPENDENCIES:** TW-00 verifies canonical schema/CAS and contract repository.
- **OWNERSHIP:** Fresh Luna worker in the ticket-domain repository; no Orca runtime edits.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain adapter interfaces and fixtures for Docker, IIS, dev server, and test leases.
- **INPUT CONTRACT:** Ticket authority/epoch/revision, repository role, execution domain, and target-bound resource identity.
- **OUTPUT CONTRACT:** Strict adapter DTO/fixture corpus with partial-failure and ownership proof semantics.
- **CONSTRAINTS:** `referenced` repositories remain read-only; effects belong only to `isolated` resources; Orca receipts cannot stand in for external evidence.
- **DO_NOT_TOUCH:** Live Docker/IIS resources, Orca worktree mutations, renderer actions.
- **ACCEPTANCE CRITERIA:** Unsupported/mismatched/unverifiable resource states fail closed; teardown plans preserve unowned resources.
- **VERIFICATION:** Contract tests and failure fixtures; cross-platform/host-domain review.
- **PARALLELIZATION SAFETY:** Safe beside TW-01 after TW-00; serial with TW-04B.
- **POTENTIAL CONFLICTS:** Shared role/schema fields and resource-universe semantics affect TW-03 and TW-04B.

### TW-04B — Implement external adapters under the root gateway

- **GOAL:** Provision, inspect, reconcile, and prune only ticket-owned external resources under explicit user confirmation; prepare role evidence for later Orca-action convergence.
- **DEPENDENCIES:** TW-04A, TW-05G; verified ledger CAS and target-bound action preview contract from TW-00.
- **OWNERSHIP:** Ticket-domain adapter worker with one resource family at a time unless interfaces and files are isolated.
- **FILES / MODULES LIKELY INVOLVED:** Adapter implementations, ledger evidence/CAS, role transition commands, platform scripts.
- **INPUT CONTRACT:** One-use target-bound plan token, attested root Run and binding fence, confirmed target/current ledger revision, and adapter-specific resource evidence. Read-only `plan` observations never grant mutation authority.
- **OUTPUT CONTRACT:** Idempotent stage receipts and independent external-resource verdicts; safe recovery after partial/unknown effects.
- **CONSTRAINTS:** Reverse dependency cleanup, no deletion of unowned resources, no focus theft, no WSL auto-start by read-only checks.
- **DO_NOT_TOUCH:** Orca-owned worktree/agent/terminal lifecycles and unrelated user resources.
- **ACCEPTANCE CRITERIA:** Failure injection and retry preserve branches, documents, and ownership; external adapter stages are independently observable and recoverable. Full role convergence remains TW-04C.
- **VERIFICATION:** Adapter unit/fault tests and isolated integration fixtures before live pilot.
- **PARALLELIZATION SAFETY:** Resource families may split only after TW-04A freezes interfaces; shared ledger commands remain single-owner.
- **POTENTIAL CONFLICTS:** Docker/IIS execution domains may differ from repository host; lease state and auth provider contracts remain open.

### TW-04C — Integrate repository-role convergence

- **GOAL:** Join ticket role/CAS transitions, external adapter stages, and Orca workspace actions without treating one authority's receipt as another's success.
- **DEPENDENCIES:** TW-04B and TW-08.
- **OWNERSHIP:** One ticket-domain integration worker with Orca action seam frozen by the Orchestrator.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain role convergence/CAS commands, external stage evidence, Orca action receipt consumer.
- **INPUT CONTRACT:** Target-bound confirmed transition, current ledger revision, root gateway authority, adapter evidence, and Orca mutation receipts/read-back.
- **OUTPUT CONTRACT:** Durable role state with independently verified Orca and external outcomes, including `requires_orca_action` or unverifiable recovery state.
- **CONSTRAINTS:** No effect inferred from a read-only plan, missing receipt, contact loss, or another authority's success.
- **DO_NOT_TOUCH:** Orca lifecycle implementation or renderer as a second state owner.
- **ACCEPTANCE CRITERIA:** Partial Orca/external failure can be retried without duplicate effects or false convergence; excluded/referenced roles retain their safety boundaries.
- **VERIFICATION:** Cross-authority failure/replay tests and independent integration review.
- **PARALLELIZATION SAFETY:** Serial after both action and adapter contracts stabilize.
- **POTENTIAL CONFLICTS:** Ticket CAS revision races and independent cleanup/read-back verdicts.

### TW-05 — Coordinator folder and local artifacts

- **GOAL:** Create the ticket coordinator folder/document lifecycle using the existing Orca Run root agent.
- **DEPENDENCIES:** TW-00 verified coordinator/artifact schema and command-authority contract; M0 Run ownership.
- **OWNERSHIP:** Ticket-domain worker for catalog/artifacts; Orca changes only through an agreed seam.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain coordinator folder, artifact revision/retention, first-run enrollment.
- **INPUT CONTRACT:** Validated ticket identity, explicit user choice, and attested Orca root Run/pane.
- **OUTPUT CONTRACT:** Durable folder/document references and recoverable ticket-to-Run correlation.
- **CONSTRAINTS:** External ticket process never impersonates a coordinator; enrollment failure after Run creation must preserve and retry safely.
- **DO_NOT_TOUCH:** Orca agent-status or terminal ownership, unrelated workspace focus.
- **ACCEPTANCE CRITERIA:** Resume/rebind and local documents survive partial failure; no duplicate root Run enrollment.
- **VERIFICATION:** Command-authority fixtures, resume/failure tests, focused E2E on isolated display or CI if UI is involved.
- **PARALLELIZATION SAFETY:** Can proceed beside TW-04A after schema freeze; TW-04B must wait for TW-05G, which depends on this task.
- **POTENTIAL CONFLICTS:** First-run enrollment recovery and artifact retention policy are not closed.

### TW-05G — Enforce the root coordinator gateway for effects

- **GOAL:** Admit ticket effects only from the attested root Run through the existing Orca orchestration authority.
- **DEPENDENCIES:** TW-05 durable ticket-to-Run correlation and TW-00 command-authority contract.
- **OWNERSHIP:** One gateway worker; Orchestrator freezes the cross-repository token and Run-binding contract first.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain command authority/enrollment, Orca Run attestation and binding fence seam.
- **INPUT CONTRACT:** One-use five-minute target-bound plan token, ticket/authority/ledger revision, and server-derived root Run/pane identity.
- **OUTPUT CONTRACT:** Admission proof tied to a durable binding fence, revalidated immediately before each effect, or an explicit unavailable/blocked result.
- **CONSTRAINTS:** Serialize with Run use/create/bind/unbind; no external process impersonation, cached root context, or adapter effect on ambiguous authority.
- **DO_NOT_TOUCH:** Parallel coordinator/Run owner, agent-status store, renderer-created authority tokens.
- **ACCEPTANCE CRITERIA:** Changed Run, token reuse/expiry, lost contact, changed ledger or target, and fence failure prevent effects.
- **VERIFICATION:** Command-authority fixtures, concurrency/replay tests, host attestation review.
- **PARALLELIZATION SAFETY:** Serial with TW-05 identity and shared token contract; blocks live TW-04B and TW-08.
- **POTENTIAL CONFLICTS:** Run binding generation and ticket ledger revision may change between preview and effect.

### TW-06T — Establish the resident no-start ticket transport

- **GOAL:** Establish and own an authenticated resident ticket endpoint/connection lifecycle during explicit setup, then provide a no-start transport from Orca main during snapshot reads.
- **DEPENDENCIES:** TW-00 portable ticket snapshot/transport contract and M0 host ownership seams.
- **OWNERSHIP:** One Orca main transport worker after cross-repository protocol ownership is fixed.
- **FILES / MODULES LIKELY INVOLVED:** Orca main local integration service and ticket-domain snapshot producer/transport boundary.
- **INPUT CONTRACT:** Configured coordinator/authority/profile binding, explicit setup authority, and a versioned endpoint protocol verified by TW-00; no resident endpoint is assumed to exist yet.
- **OUTPUT CONTRACT:** Owned resident endpoint/connection lifecycle plus bounded snapshot byte stream with authenticated source/provenance, or unavailable during disconnected reads.
- **CONSTRAINTS:** Snapshot reads never launch WSL, CLI, or coordinator; connection setup requires its separate explicit authority. No path/secret exposure, new state owner, or silent local fallback.
- **DO_NOT_TOUCH:** Main/preload snapshot cache and renderer UI until TW-06 owns that layer.
- **ACCEPTANCE CRITERIA:** Disconnected, wrong authority/profile, oversized, partial, or untrusted endpoint fails closed without starting a process.
- **VERIFICATION:** No-start, auth binding, stream bound, cancellation and reconnect tests; independent transport review.
- **PARALLELIZATION SAFETY:** Serial with TW-06 main handler integration; fixture-only schema work can proceed after TW-00 in disjoint files.
- **POTENTIAL CONFLICTS:** No live resident ticket transport currently exists in this Orca checkout; its package-side producer contract also needs TW-00 verification.

### TW-06 — Thin Orca snapshot boundary

- **GOAL:** Transport and validate one bounded ticket snapshot across main/preload with no new state owner.
- **DEPENDENCIES:** TW-00 publishes canonical DTO/fixture corpus; TW-06T delivers the resident no-start transport.
- **OWNERSHIP:** One Orca main/preload worker; renderer is read-only consumer in TW-07.
- **FILES / MODULES LIKELY INVOLVED:** Shared Zod schema, main IPC handler/cache, preload bridge, ticket snapshot boundary fixtures.
- **INPUT CONTRACT:** Authenticated resident transport, strict zero-argument request, canonical ticket snapshot, profile/authority/epoch provenance.
- **OUTPUT CONTRACT:** `current`, `last-verified-stale`, or Tickets-only `unavailable` result under 2 MiB UTF-8 cap.
- **CONSTRAINTS:** No distro/CLI startup, no raw path/token exposure, main and preload both validate; stale snapshots disable actions.
- **DO_NOT_TOUCH:** Existing Projects/runtime state, renderer ownership, mutation authority, unnegotiated remote wire opcodes.
- **ACCEPTANCE CRITERIA:** Fixture parity, invalid response isolation, cache partition, byte bounds, no focus/state disruption.
- **VERIFICATION:** Main/preload contract tests, generated fixture parity, changed-code quality and mixed-version review.
- **PARALLELIZATION SAFETY:** Fixture-only schema and validation tests may start after TW-00 in disjoint files; live handler completion is serial after TW-06T.
- **POTENTIAL CONFLICTS:** Local IPC contract and fixture corpus are currently ignored/untracked and unavailable to fresh clones.

### TW-07 — Read-only Projects/Tickets tree

- **GOAL:** Present ticket hierarchy and workspace status from a validated snapshot without owning canonical state.
- **DEPENDENCIES:** TW-06 live validated boundary and stable snapshot DTO. Fixture-only presentation may be prototyped earlier but does not complete this task.
- **OWNERSHIP:** Renderer worker with exclusive sidebar/ticket-view files.
- **FILES / MODULES LIKELY INVOLVED:** Existing sidebar tree/virtualization, ticket preview components, renderer snapshot projection.
- **INPUT CONTRACT:** Preload-validated current/stale/unavailable renderer DTO.
- **OUTPUT CONTRACT:** Accessible read-only Tickets tree and preview; existing Projects mode remains available.
- **CONSTRAINTS:** Follow `docs/STYLEGUIDE.md`, existing tokens/primitives, keyboard/platform rules, single agent-status store.
- **DO_NOT_TOUCH:** Main transport/schema, ticket ledger, destructive actions, focus-changing prune behavior.
- **ACCEPTANCE CRITERIA:** Bounded trees, loading/failure states, stable selection/focus, stale actions disabled, Projects regression absent.
- **VERIFICATION:** Renderer tests and hidden-renderer CDP screenshots with `ORCA_BACKGROUND_LAUNCH=1`; design-system gate.
- **PARALLELIZATION SAFETY:** Safe after TW-06 contract freeze; avoid concurrent sidebar modifications.
- **POTENTIAL CONFLICTS:** Shared sidebar state and snapshot DTO churn.

### TW-08 — Connect existing workspace and agent actions

- **GOAL:** Expose ticket actions through Orca's existing worktree, agent, Run, and confirmation authorities.
- **DEPENDENCIES:** TW-05G root gateway, TW-06 live current snapshot boundary, and TW-07 read-only tree; separately proven preview/action contracts.
- **OWNERSHIP:** One integration worker per agreed action seam, with Orchestrator controlling shared contracts.
- **FILES / MODULES LIKELY INVOLVED:** Orca orchestration commands, worktree action routing, ticket action descriptors, renderer confirmation UI.
- **INPUT CONTRACT:** Live current validated ticket snapshot, exact target and execution-host reattestation, root gateway authority, explicit user confirmation for effects.
- **OUTPUT CONTRACT:** Existing Orca mutation receipts and ticket correlation; no copied lifecycle state.
- **CONSTRAINTS:** Preserve branch, folder, artifacts and focus; SSH/folder behavior cannot regress even though Tickets MVP is local. Ticket worktree removal sets `preserveBranchOnDelete: true` on the target host's authoritative metadata before invoking Orca removal.
- **DO_NOT_TOUCH:** Parallel worktree manager, message bus, agent-status store, unowned external resources.
- **ACCEPTANCE CRITERIA:** Existing actions work from ticket context with idempotent replay. Removal verifies same-host exact ref HEAD, registration, and path read-back; archive, Orca removal, and external cleanup have independent blocked/unverifiable retry verdicts.
- **VERIFICATION:** Existing Orca action tests, fault/replay matrix, hidden UI E2E where applicable.
- **PARALLELIZATION SAFETY:** Serial with shared action DTO and confirmation UI; distinct actions may split after contract freeze.
- **POTENTIAL CONFLICTS:** M0 receipt semantics and TW-04B external stage ordering.

### TW-09 — Integrate real ticket state and Sellmate flow

- **GOAL:** Join ticket catalog, adapters, coordinator, provider, snapshot, and actions into the MVP workflow.
- **DEPENDENCIES:** TW-03, TW-04C, TW-05, TW-06, TW-08.
- **OWNERSHIP:** Sol Orchestrator integration cycle with fresh Luna workers on isolated defects and fresh Sol review.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain CLI/provider, Orca main/preload/renderer, Sellmate profile and adapter configuration.
- **INPUT CONTRACT:** Verified source-owned evidence and explicit resource/action contracts from predecessor tasks.
- **OUTPUT CONTRACT:** One ticket can be provisioned, coordinated, inspected, role-changed, and safely pruned.
- **CONSTRAINTS:** Mixed-version fail-closed behavior, no hidden state owner, no focus theft, durable recovery from partial effects.
- **DO_NOT_TOUCH:** User resources outside the confirmed ticket ownership set.
- **ACCEPTANCE CRITERIA:** MVP scenarios in the local work plan pass with isolated/referenced/excluded roles and partial-failure recovery.
- **VERIFICATION:** Cross-component contract/integration/E2E, Windows and WSL pilot, independent semantic review.
- **PARALLELIZATION SAFETY:** Integration is serial at shared contracts; independent defects may be assigned by module ownership.
- **POTENTIAL CONFLICTS:** Host-domain clocks, adapter dependencies, action/ledger revision races.

### TW-10 — Package, roll out, and maintain the fork

- **GOAL:** Ship and validate repeatable installation/update/rollback on a clean machine.
- **DEPENDENCIES:** TW-09 accepted; package/profile provenance and compatibility contracts verified.
- **OWNERSHIP:** Release worker with Sol Orchestrator approval gates.
- **FILES / MODULES LIKELY INVOLVED:** Ticket package/profile installer, Orca packaging/CI, documentation, fork update process.
- **INPUT CONTRACT:** Accepted MVP build and verified native dependency/release provenance.
- **OUTPUT CONTRACT:** Reproducible install/update/rollback and pilot report.
- **CONSTRAINTS:** `pnpm install:release` before cross-architecture packaging; preserve user state and mixed-version behavior.
- **DO_NOT_TOUCH:** Live user resources without explicit target confirmation.
- **ACCEPTANCE CRITERIA:** Clean-machine pilot, rollback, packaging, and update scenarios pass on supported platforms.
- **VERIFICATION:** Release CI, clean-machine smoke, native module checks, documented rollback drill.
- **PARALLELIZATION SAFETY:** Release gate follows integration; platform checks may run in parallel on isolated runners.
- **POTENTIAL CONFLICTS:** Untracked standalone package content, native toolchains, fork/upstream compatibility.

## First execution cycle result and next allocation

1. **TW-01:** user authorized the slice. A fresh Luna xhigh worker implemented it exclusively in the runtime capture seam; the first fresh Sol xhigh review found a pre-attestation deadline gap, the worker corrected it, and a second fresh Sol xhigh review passed. The implementation is committed locally at `0c4b53ac2`. Focused tests passed 12/12; the reviewer ran 27 related tests; Node typecheck and changed-code quality passed. The previous main Luna session remains historical evidence only.
2. **TW-00 audit:** a separate fresh Luna xhigh worker recorded [ticket-source-audit.md](./ticket-source-audit.md) and [ticket-source-files.sha256](./ticket-source-files.sha256). The manifest was checked against the WSL checkout. No ticket-package tests ran because Linux Node is absent. TW-00 remains open.
3. **Next allocation:** prepare a source publication candidate, then publish the complete ticket checkout to a retrievable private revision and verify it from a fresh retrieval with Linux Node/pnpm. The user proposed pinning that separate repository as an Orca submodule; assess public-fork clone/CI access before integrating the gitlink. TW-02, TW-04A, TW-05, and TW-06T remain gated on TW-00.
