# Ticket Workspace — Project State

- Snapshot date: 2026-09-29
- Repository: `lighteko/orca`, branch `feature/ticket-workspace-orca-seams`
- Product-code baseline: `d500f2d474e6cde2c86b2808f26088b858ce760e` (`Fix cross-version upstream release tag fetch`); recovery documents were committed locally afterward.
- PR: [#1](https://github.com/lighteko/orca/pull/1)
- Status: TW-01 owner freshness was committed locally at `0c4b53ac2f9c1711c3915ae550b45baef4c5d5dd` and passed independent Sol review. The ticket source is published privately. Orca commit `d1f86d608` holds its initial submodule pin; the working gitlink now targets the reviewed `0b5ac0f` revision. The local Orca branch remains ahead of the remote branch.
- Authority for global sequencing: Sol Orchestrator. This file is implementation evidence, not a task scheduler.
- Recovery-verified execution dependencies and allocation: [task-graph.md](./task-graph.md).

Evidence labels: **FACT** is confirmed in this checkout or by recorded test/CI output; **DECISION** is an intentional project choice; **ASSUMPTION** is not yet verified; **RISK** is a possible failure or unresolved constraint; **PROPOSAL** is candidate work, not authorization.

## Completed

### FACT — Orca-side work in this checkout

- M0 established reuse boundaries for ticket/workspace ownership and hardened existing Orca orchestration, worktree cleanup, branch preservation, archive evidence, and Sleep/resume seams. Relevant changes are in the history from `cf19735a4` through `6dc456b96`; detailed test evidence remains in local notes and PR history.
- M1's first local-native Git evidence prerequisite is implemented in Orca main:
  - `src/main/runtime/runtime-worktree-catalog-binding.ts` binds a strict store incarnation/revision to one fresh exact native worktree registration and resolved target. Linked-worktree pointers and private gitdir location are checked; unsupported/ambiguous Git formats fail unavailable.
  - `src/main/runtime/runtime-git-subject-attestation.ts` isolates inherited Git environment/config overrides, requires the effective process route to remain native, and checks effective worktree/gitdir/common-dir/index identities against the binding.
  - `src/main/runtime/runtime-git-status-record-capture.ts` streams porcelain-v2 records outside ordinary UI status single-flight/coalescing, pins untracked/submodule visibility, validates complete supported records and UTF-8, rechecks binding, and keeps its single slot occupied until timed-out/aborted child work settles.
  - `src/main/git/native-git-operation-marker-capture.ts` and `src/main/git/windows-native-volume-path-proof.ts` capture operation markers. On Windows, `QueryDosDeviceW` proves direct local-volume routes before filesystem access; GLOBALROOT pinning, reparse checks, and no-follow leaf reads prevent accidentally starting/reconnecting a mapped WSL distro.
- These capabilities are **internal evidence only**. TW-01 now adds an owner-created observation ID, immutable read-start timestamp, and a 30-second overall deadline to the runtime capture. No ticket `WorkspaceRef` mapping, production provider, CLI/IPC/UI connection, or final public aggregation exists in this checkout. Empty status plus marker absence must not produce `clear`.
- The separate ticket-domain source is published at private `lighteko/ticket-workspace` commit `0b5ac0fbe34adfc4537be3f10ee0227807c0cccc` (tree `5831ae7ab972284316a5d406fe3a89db4abef440`; 132 tracked files). Its initial `2045808ffdb6baead2e659855cefb02f7b36491c` revision passed fresh-clone verification of 128 paths and hashes plus an isolated Linux replay of 314 tests with one skipped across 32 files and typecheck, under Node 22.23.2/pnpm 12.0.0 with an ext4 temporary directory and WSL distro identity. The current revision passed focused contract tests and typecheck, with browser bundle corpus parity verified separately. This is a bounded M1 source baseline, not proof of live owner providers or public `clear`.
- CI blocker fixed at `d500f2d47`: `.github/workflows/pr.yml` now fetches exact authentic stable `vX.Y.Z` tag refs from upstream `stablyai/orca`, preserving the partial-clone blob filter and verifying tag object IDs/commit resolution. It rejects unadvertised or conflicting preexisting local stable tags and requires historical `v1.4.184`/`v1.4.190`. The workflow contract lives in `config/scripts/pr-workflow-parallelism.test.mjs`.
- The commit's local validation passed: workflow contract tests 19/19; changed-code quality and `git diff --check`; disposable Ubuntu-24.04 WSL smoke rejected synthetic local `v99.99.999`, imported 401 upstream stable tags, selected `v1.4.216`, and ran the exact five-path `git archive` + `tar` extraction in 14,148 ms against the 45,000 ms subprocess deadline.
- Remote verification on product baseline `d500f2d47` passed: PR `verify`, Mobile Checks `verify`, cross-version wire compatibility, Node 24 test shards 8/8, static analysis, typecheck, Git compatibility, Windows/Linux packaging, changed E2E, and native-smoke jobs. See [PR Checks run](https://github.com/lighteko/orca/actions/runs/36504452574), [Mobile Checks run](https://github.com/lighteko/orca/actions/runs/36504452368), and [native-smoke run](https://github.com/lighteko/orca/actions/runs/36504452382).

### FACT — checkout boundary

- This is the Orca repository. Its root pnpm workspace does not own the standalone ticket-domain packages; the separate private repository is pinned as the `ticket-workspace/` submodule. Orca's recent implementation remains host-side runtime/native code plus tests and CI.
- The detailed `docs/ticket-workspace-work-plan.md`, implementation spec, and evidence-provider notes remain locally ignored because `.gitignore` excludes `docs/**`. Their M1 completion checklist is historical context; the bounded M1 source and package tests can now be independently verified from the pinned private submodule. Do not make unpublished local notes a hidden dependency for fresh-clone workers.
- The GitHub fork `lighteko/orca` has no stable release tags. Its parent/source is `stablyai/orca`; fetching authentic stable refs from that source is required for the cross-version CI lane.

## In Progress

- TW-01 is implemented and committed locally. It passed a fresh Sol review after a blocking pre-attestation deadline finding was corrected; focused tests passed (12/12), Node typecheck and changed-code quality passed.
- TW-00's bounded source audit, private publication, fresh-clone hash verification, and initial-revision package replay and current focused contract tests/typecheck are complete. The Orca submodule gitlink passed fresh Sol review and was committed locally at `d1f86d608`. See [ticket-source-audit.md](./ticket-source-audit.md) and [ticket-published-source.sha256](./ticket-published-source.sha256).
- Parallel read-only TW-02, TW-05, and TW-06T contract discovery found source/owner gaps. Implementation allocation is being revalidated; no live provider, effect gateway, or resident transport is authorized by source publication alone.

## Current Repository State

FACT: This branch is an Orca host-side foundation, not the complete ticket-workspace product. Current host evidence is restricted to local-native Git worktrees. Ticket-facing code cannot yet bind a ticket repository reference to this evidence or expose it through a production provider.

DECISION: The ticket domain owns canonical ticket/role/external-resource state; Orca owns workspaces, agent status, terminals, orchestration, and Orca mutation receipts. The renderer is a projection/action surface, not an owner. Existing Orca worktree and agent lifecycles are reused.

### Recovery audit, 2026-09-29

- **FACT:** The former main Luna transcript was read directly from local Codex session `01a0c693-8941-7b21-aa17-05480027dcc2` (2026-09-22 through 2026-09-29). Its last completed work created these shared-state files; later attempts to message a replacement session failed before delivery. That session is a historical source and is not a worker in the new execution structure.
- **FACT:** The independent shared-state reviewer transcript `01a0eac9-05b1-7510-b284-8bb7ca95055b` identified two missing milestone edges and the local-only M4/M5 contract dependency. The current master plan includes those edges; the M4/M5 allocation gate remains open.
- **FACT:** At recovery start, local `HEAD` and `origin/feature/ticket-workspace-orca-seams` both resolved to `d500f2d474e6cde2c86b2808f26088b858ce760e`; `.gitignore`, `AGENTS.md`, and three shared-state documents were uncommitted. The recovery commit includes those documents and this DAG, leaving product code unchanged and the local branch ahead of origin. No ticket-domain `packages/` directory or tracked ticket package exists in this Orca checkout.
- **FACT:** The former Luna tool transcript identified the separate `/home/sellmate/ticket-workspace` checkout in `Ubuntu-24.04`. A read-only check found it at `cf184eaa588f9155636dec036f624595c3d46532` on `main`, with `packages/contracts` and `packages/cli`. Most M1 source and tests are **untracked** there, and seven tracked files have local modifications. That commit alone cannot reproduce the current M1 source; Orca's registered repository list does not include this checkout.
- **FACT:** After that recovery audit, the complete ticket source was committed as `2045808ffdb6baead2e659855cefb02f7b36491c`, pushed to the verified private repository, and checked from a fresh clone. The original WSL source checkout is now historical; the private submodule is clean at `0b5ac0fbe34adfc4537be3f10ee0227807c0cccc`. [The current published manifest](./ticket-published-source.sha256) covers all 132 tracked Git blobs; the original audit manifest and initial publication commit remain historical evidence.
- **FACT:** At recovery baseline the internal runtime capture had no `ownerReadStartedAt` or owner observation ID and returned no public ticket evidence DTO. TW-01 added the internal owner fields and deadline after that baseline; it still returns no public ticket evidence DTO. Direct baseline Vitest execution passed 18/18 across three files; TW-01 focused tests passed 12/12, and the fresh Sol reviewer ran 27 related tests successfully.
- **FACT:** The standard `pnpm test` entrypoint stopped in native-runtime preflight before Vitest because local patched Windows native modules are missing and this PC has no MSVC C++ toolchain. This is a local verification limit, not a product-test failure; the recorded CI evidence covers native build/load on baseline `d500f2d47`.
- **FACT:** The WSL shell itself has no Linux Node, so a disposable `node:22` container replayed the exact audited 128-file copy. With Node 22.23.2, pnpm 12.0.0, WSL ext4 `TMPDIR`, and `WSL_DISTRO_NAME=Ubuntu-24.04`, the initial 128-file revision passed 314 tests with one skipped across 32 files; typecheck passed. Initial failures on overlay `/tmp` with no distro identity were environment setup failures, not reproduced source defects.
- **FACT:** The current 132-file revision removed Node `buffer`/`crypto` from the `/v1` validator import graph using pinned `@noble/hashes@1.8.0` and a browser-safe UTF-8 length helper. Contract tests passed 48/48 on the Linux source copy, workspace typecheck and build passed, and a browser-target bundle without Node globals matched all 48 corpus verdicts and the serialized artifact bytes. The broader CLI replay was inconclusive because the container authority identity environment caused unrelated failures; it is not recorded as a current full-suite pass. The package root still reaches Node imports, and ignored local `dist` is stale, so TW-00C must clean-build, inspect any distributable output, and verify an actual Electron preload bundle.
- **RISK:** Source presence and test replay do not establish live owner observations, authenticated resident transport, root command authority, or all task-specific contracts. Do not release those implementations solely because TW-00 source publication passed.

### Contract discovery checkpoint, 2026-09-29

- **FACT:** Ticket `WorkspaceRefV1` git-worktree fields map to Orca's five-field `WorktreeCatalogBindingRequest`; the ticket repository ID must equal `workspaceRef.repoId` at the join because the catalog validator does not enforce it. The ticket authority's WSL host and the workspace execution host are represented separately and cannot be inferred equal. Orca's native binder independently checks host, instance, alias, route, registration, and catalog currentness. The published ticket source is in a separate package graph, and Orca has no ticket-contract dependency or validated ticket-to-owner transport today.
- **FACT:** The ticket catalog stores only optional coordinator location/reference and a shallow artifact schema/revision; orchestration correlation has Run/dispatch/request IDs but no pane or binding generation. Orca owns Run binding and increments `consumer_generation`, but the inspected binding transactions do not fence an external ticket effect.
- **FACT:** Current `runCreate`/`runUse` may resolve a pane from the request's `from` handle when strict caller evidence is absent; stable pane lookup is not sufficient live root attestation for ticket effects or enrollment. `orchestration.reset --all` deletes Run rows, and `folderWorkspace.create` can return a record without a host stamp. TW-05/TW-05G need explicit strict attestation, host-qualified folder identity, and a reset-safe durable exclusion contract.
- **FACT:** `repo.add(kind: 'folder')` is the closer existing first-registration seam for a local coordinator Repo and synthetic main workspace. The current host-unaware RPC may deduplicate by path to a Repo on another host; it does not prove ticket ownership or actual WSL storage route. `folderWorkspace.create` is a separate group-child entity with no Repo ID, and `projectHostSetup.setupExistingFolder` assumes an existing project ID. TW-05's exact host-qualified folder reference and retry proof remain open.
- **FACT:** The ticket package defines a strict 2 MiB navigator snapshot DTO and fixtures but has no production snapshot producer, authenticated resident protocol, or endpoint lifecycle. Its `status` CLI emits a different one-shot report. Invoking WSL/CLI on a snapshot read would violate the no-start contract.
- **FACT:** The catalog has no ticket `availability` field. The snapshot validator requires SSH target claims to project as `unsupported` at both ticket and workspace levels. A ticket producer cannot establish Orca `matched` state; changing its published snapshot afterward changes the canonical digest.
- **FACT:** The generated JSON Schema artifact omits the runtime validator's duplicate-identity and canonical-digest checks. Orca main/preload need the full ticket-owned semantic validation, not the artifact alone. The public Orca CI does not fetch the private submodule; there is no ticket-contract dependency in its package graph.
- **FACT:** The ticket `/v1` catalog is the current ledger/CLI contract surface. Its external-resource envelope is generic; the older default export has typed Docker/IIS models but is structurally incompatible with the `/v1` ledger. Current `/v1` fixtures show a generic Docker example and no typed IIS case.
- **DECISION:** Keep the ticket source/subject tuple and `WorkspaceRef` ticket-owned, and keep Orca catalog tokens, Run/pane evidence, and TW-01 observation fields owner-internal. Freeze shared field/provenance rules before parallel implementation; this does not add a TW-02 implementation dependency to TW-05 or TW-06T.
- **DECISION:** Keep the ticket snapshot immutable and represent an Orca-attested workspace match in a separate Orca-owned result tied to `snapshotRevision`. Split TW-06P ticket producer and TW-06T Orca resident client by repository ownership after one shared protocol freeze. The TW-02 pure five-field mapping remains independent of live transport.
- **OPEN:** Choose how the full ticket-owned runtime contract reaches Orca without importing lifecycle code or creating a second schema owner. A generated narrow artifact is technically attractive for public CI, but public distribution of the private ticket schema is not authorized by the current source/publication record; the existing JSON Schema is insufficient by itself. Freeze TW-05 coordinator/artifact and root command-authority contracts, TW-06P projection/currentness, and TW-06T authenticated transport/setup before their implementation slices. Do not treat fixture admission's `mutationAllowed` flag as live effect authorization.
- **OPEN:** TW-00C now owns the contract-delivery gate. The private `/v1` validator source is now browser safe, but Orca main/preload has no contract dependency or tested delivery artifact; the same complete semantic checks must reach its sandboxed preload before TW-06 implementation. Public distribution and the exact delivery channel remain decisions, not completed work.
- **OPEN:** TW-04A uses the canonical `/v1` catalog as its current source and migration input, not the older default model. Its strict objects cannot accept structured typed rows as a compatible in-place extension; decide catalog v2 versus a separately versioned capability path while preserving generic v1 rows. Adapter discriminator, Docker/IIS identity/host binding, complete-universe discovery, clock handoff, and ownership semantics need evidence before normative fixtures are frozen.

### Plan versus repository reality

- The local work plan checks off standalone M1 contracts, WSL ledger/CAS, doctor, status, and plan projection. Their initial bounded source baseline is reproducible from the private repository and passed its package suite; the current revision passed focused contract tests and typecheck; the CLI still lacks production owner observation wiring and cannot claim an end-to-end clear plan.
- M4/M5 have a locally ignored IPC contract and fixture corpus, but no tracked implementation. A fresh clone cannot assign those tasks from the present shared state alone.
- The M4 resident no-start ticket transport and live main/preload bridge are not implemented in the Orca checkout; the ignored IPC document defines their contract only. Live external effects also require a root coordinator gateway and target-bound confirmation beyond ledger CAS.
- The M1 native Git evidence path is implemented only as an internal Orca prerequisite. The milestone's end-to-end read-only ticket plan and authoritative external-resource status remain incomplete.

## Important Decisions

- A ticket root agent pane is the coordinator for its Orca Run; an external ticket process must not impersonate a coordinator pane.
- Keep ticket catalog/schema and external-resource lifecycle separate from Orca worktree/agent lifecycle. Do not introduce a duplicate worktree coordinator/ledger or ticket-specific agent-status store.
- First source-specific plan evidence is local-native Git worktree status. WSL, folder, SSH, and paired targets are unavailable for this slice unless their actual route/owner is independently proven; never fall back to local Git.
- Any `clear` claim needs exact target binding, successful complete status-record accounting, successful operation-marker absence, and fresh owner evidence. Positive blockers may be reported conservatively; incomplete/ambiguous evidence remains unavailable/incomplete.
- Use `runProcess`/Orca Git routing; honor cancellation, deadlines, actual host selection, no-start behavior, Git 2.25 compatibility, and existing single in-flight child ownership.
- Cross-version CI uses authentic upstream stable tags, exact refs, no forced overwrite, and the live latest stable tag; tests are not skipped and tags are not synthesized.

## Discovered Constraints

- A mapped Windows drive's ordinary `lstat` can start a WSL distro. The Windows operation-marker reader therefore performs `QueryDosDeviceW` route proof before filesystem access and only then uses a pinned local volume path. This route proof covers that marker reader only; it does not prove that preceding binding/attestation/status calls use the same execution domain.
- `git status` presentation output is not a complete census: unresolved gitlink conflicts can be omitted, limits are not completeness proof, operation state can conflate absence with probe failure, and `sharedLinkPaths` may filter records. The new internal capture accounts for raw porcelain records and does not inherit ordinary status filtering.
- Exact Git route and filesystem-marker route are separate authorities. A configured WSL distro value or a successful preflight is not proof that a command avoided starting WSL.
- Windows native C++ addon could not be built locally because MSVC C++ tools are absent; the real build/load and marker integration ran successfully in CI on baseline `d500f2d47`.
- Generic `runner-command-exec.test.ts` has Windows-host failures in POSIX process-group/detached assertions; focused strict-stream tests pass. Do not interpret that unrelated platform fixture mismatch as evidence to weaken child termination semantics.

## Failed / Rejected Approaches

- Using tags from the `lighteko/orca` fork failed because it contains no stable desktop tags. Hard-coding only a baseline, synthesizing refs, skipping the lane, or pinning away dynamic latest was rejected. The fix fetches upstream tags with their provenance and validates collisions.
- The first local-tag preflight used process substitution under `set -e`; failure of `git tag --list` would have been invisible. It was changed to capture the command result first, then read the here-string; a fresh reviewer verified this failure boundary.
- Treating empty entries or a clean-looking status as `clear` was rejected because completeness, exact subject, operation-marker success, and freshness are separate proofs.
- Reimplementing Orca's coordinator, worktree manager, agent status, Sleep/resume, and mutation receipt system was rejected in favor of existing runtime ownership.

## Assumptions Invalidated

- The `lighteko/orca` fork would provide stable release tags: false; it has none, so the CI lane uses authentic tags from `stablyai/orca`.
- A failing `git tag --list` inside process substitution would fail the enclosing `set -e` command: false; its result had to be captured explicitly.
- A clean-looking status or empty entry set proves the repository is clear: false; completeness, target identity, marker-probe success, and freshness are separate evidence.
- Ordinary `lstat` on a Windows drive path is a harmless local read: false; mapped-drive access can start WSL, so the marker reader proves a local-volume route before filesystem access.
- This Orca checkout owns the standalone ticket-domain package/CLI directly: false; the source belongs to a separate private repository now pinned as a submodule, with its own package graph and commit.

## Temporary Solutions

- The current local-native Git capture is an internal prerequisite rather than a production ticket evidence provider. It must remain conservative until ticket mapping, clock handoff, provider integration, and aggregation are independently validated.
- Detailed design/decision history is still in local ignored files. This shared state is the portable handoff; the local notes must not be a hidden dependency for workers in a fresh clone.

## Known Risks / Open Issues

- Owner freshness now exists only in Orca's internal local-native runtime capture. There is no ticket-facing admission or validated cross-process clock handoff.
- The authoritative ticket `WorkspaceRef` tuple and its exact mapping to Orca's host-qualified workspace row are unresolved in this checkout.
- Production plan-evidence provider composition is unwired. Exact-workspace agent source, test lease, ownership, and external-resource universe/provider contracts remain open.
- Windows-vs-WSL clock transfer is not defined. Do not compare separate wall clocks as synchronized; current proposed source scope uses one Orca-main owner clock.
- The pre/post registration checks cannot atomically exclude a hostile concurrent filesystem replacement after preflight (including coordinated A→B→A timing). Do not reuse this read as transactional proof for mutation.
- M1/M2/M3/M4 code ownership spans Orca and the separate ticket repository. Its published source is portable, but cross-repository contracts and independent ownership boundaries still need freezing before parallel implementation.
- Prior `Track Community PRs` run failed for missing `BUFO_BOT_PRIVATE_KEY`; it is separate from `verify` and not evidence of a product-code failure. Confirm whether the Orchestrator wants that workflow/secret handled.

## Current Critical Path

TW-01 implementation and independent review are complete. Remaining dependency order:

1. Freeze the ticket `WorkspaceRef` to Orca owner mapping using the published contract and the TW-01 internal capture (TW-02). Read-only contract discovery can run in parallel with disjoint command-authority (TW-05) and resident-transport (TW-06T) investigation; implementation follows contract decisions.
2. Resolve root gateway, resident transport, external-resource and other owner-source contracts on their DAG branches, then compose the conservative production provider and plan projection. Public `clear` remains prohibited until every source completeness/freshness contract is joined.

## Parallel work and allocation

TW-00's source publication and package test gate is satisfied; TW-01 is integrated. Next-cycle contract discovery can run in parallel by ownership, but TW-02 mapping and its shared DTO remain serial until frozen. TW-04A, TW-05, and TW-06T still have their own contract prerequisites even though the source is now portable. The exact dependencies and worker boundaries are in [task-graph.md](./task-graph.md). M4/M5's current IPC contract and fixture corpus are local ignored files (`docs/ticket-workspace-ipc-boundary.md`, `docs/contracts/ticket-workspace-ipc-boundary-v1.ts`, `docs/fixtures/ticket-workspace-ipc-boundary-v1/`), so fixture-backed work cannot be assigned to a fresh clone until those files are published or equivalently shared.
