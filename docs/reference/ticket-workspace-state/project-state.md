# Ticket Workspace — Project State

- Snapshot date: 2026-09-29
- Repository: `lighteko/orca`, branch `feature/ticket-workspace-orca-seams`
- Product-code baseline: `d500f2d474e6cde2c86b2808f26088b858ce760e` (`Fix cross-version upstream release tag fetch`); recovery documents were committed locally afterward.
- PR: [#1](https://github.com/lighteko/orca/pull/1)
- Status: no product-code change after the baseline; the local recovery-doc commit is ahead of the remote branch.
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
- These capabilities are **internal evidence only**. There is no owner observation ID or freshness timestamp yet; no ticket `WorkspaceRef` mapping, production provider, CLI/IPC/UI connection, or final public aggregation exists in this checkout. Empty status plus marker absence must not produce `clear`.
- CI blocker fixed at `d500f2d47`: `.github/workflows/pr.yml` now fetches exact authentic stable `vX.Y.Z` tag refs from upstream `stablyai/orca`, preserving the partial-clone blob filter and verifying tag object IDs/commit resolution. It rejects unadvertised or conflicting preexisting local stable tags and requires historical `v1.4.184`/`v1.4.190`. The workflow contract lives in `config/scripts/pr-workflow-parallelism.test.mjs`.
- The commit's local validation passed: workflow contract tests 19/19; changed-code quality and `git diff --check`; disposable Ubuntu-24.04 WSL smoke rejected synthetic local `v99.99.999`, imported 401 upstream stable tags, selected `v1.4.216`, and ran the exact five-path `git archive` + `tar` extraction in 14,148 ms against the 45,000 ms subprocess deadline.
- Remote verification on product baseline `d500f2d47` passed: PR `verify`, Mobile Checks `verify`, cross-version wire compatibility, Node 24 test shards 8/8, static analysis, typecheck, Git compatibility, Windows/Linux packaging, changed E2E, and native-smoke jobs. See [PR Checks run](https://github.com/lighteko/orca/actions/runs/36504452574), [Mobile Checks run](https://github.com/lighteko/orca/actions/runs/36504452368), and [native-smoke run](https://github.com/lighteko/orca/actions/runs/36504452382).

### FACT — checkout boundary

- This is the Orca repository. It has no `packages/` directory and no tracked standalone ticket-workspace contracts/CLI package source. `git ls-files` confirms the recent implementation is Orca-side runtime/native code plus tests and CI.
- The detailed `docs/ticket-workspace-work-plan.md`, implementation spec, and evidence-provider notes exist only as locally ignored files because `.gitignore` excludes `docs/**`. The local plan describes M1 contract/profile/ledger/CLI slices as completed, but those implementations cannot be independently verified from this checkout. Do not silently assign those slices here or treat local-only notes as cross-clone state; identify their owning repository/worktree with the Orchestrator.
- The GitHub fork `lighteko/orca` has no stable release tags. Its parent/source is `stablyai/orca`; fetching authentic stable refs from that source is required for the cross-version CI lane.

## In Progress

- No product implementation is in progress in this worktree.
- The next M1 candidate is owner-side observation freshness, independently reviewed as the next bounded slice; implementation is awaiting user/Orchestrator authorization. See [master plan](./master-plan.md) and [review findings](./review-findings.md).

## Current Repository State

FACT: This branch is an Orca host-side foundation, not the complete ticket-workspace product. Current host evidence is restricted to local-native Git worktrees. Ticket-facing code cannot yet bind a ticket repository reference to this evidence or expose it through a production provider.

DECISION: The ticket domain owns canonical ticket/role/external-resource state; Orca owns workspaces, agent status, terminals, orchestration, and Orca mutation receipts. The renderer is a projection/action surface, not an owner. Existing Orca worktree and agent lifecycles are reused.

### Recovery audit, 2026-09-29

- **FACT:** The former main Luna transcript was read directly from local Codex session `01a0c693-8941-7b21-aa17-05480027dcc2` (2026-09-22 through 2026-09-29). Its last completed work created these shared-state files; later attempts to message a replacement session failed before delivery. That session is a historical source and is not a worker in the new execution structure.
- **FACT:** The independent shared-state reviewer transcript `01a0eac9-05b1-7510-b284-8bb7ca95055b` identified two missing milestone edges and the local-only M4/M5 contract dependency. The current master plan includes those edges; the M4/M5 allocation gate remains open.
- **FACT:** At recovery start, local `HEAD` and `origin/feature/ticket-workspace-orca-seams` both resolved to `d500f2d474e6cde2c86b2808f26088b858ce760e`; `.gitignore`, `AGENTS.md`, and three shared-state documents were uncommitted. The recovery commit includes those documents and this DAG, leaving product code unchanged and the local branch ahead of origin. No ticket-domain `packages/` directory or tracked ticket package exists in this Orca checkout.
- **FACT:** The former Luna tool transcript identified the separate `/home/sellmate/ticket-workspace` checkout in `Ubuntu-24.04`. A read-only check found it at `cf184eaa588f9155636dec036f624595c3d46532` on `main`, with `packages/contracts` and `packages/cli`. Most M1 source and tests are **untracked** there, and seven tracked files have local modifications. That commit alone cannot reproduce the current M1 source; Orca's registered repository list does not include this checkout.
- **FACT:** The existing internal runtime capture still has no `ownerReadStartedAt` or owner observation ID and returns no public ticket evidence DTO. Direct Vitest execution of the binding, subject-attestation, and status-capture tests passed 18/18 across three files. `pnpm tc:node` and `git diff --check` passed.
- **FACT:** The standard `pnpm test` entrypoint stopped in native-runtime preflight before Vitest because local patched Windows native modules are missing and this PC has no MSVC C++ toolchain. This is a local verification limit, not a product-test failure; the recorded CI evidence covers native build/load on baseline `d500f2d47`.
- **FACT:** The WSL ticket checkout's package manifests define contract build/tests and CLI build/tests. A current package test run could not start because the WSL non-login shell has no `corepack`, while the login shell resolves a Windows `corepack` shim that cannot execute inside WSL. Historical passing test counts remain recorded evidence, not a current rerun.
- **RISK:** The local ignored plan's completed M1 contract/ledger/CLI claims have source files, but their current content, tests, and portable provenance are not yet verified. Do not release dependent cross-repository tasks until the untracked source and fixtures have a content manifest **and** retrievable tracked/archived revision plus focused verification.

### Plan versus repository reality

- The local work plan checks off standalone M1 contracts, WSL ledger/CAS, doctor, status, and plan projection. The separate WSL checkout contains candidate source, but most of it is untracked, so the checklist is not yet verified as a reproducible cross-repository completion.
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
- This Orca checkout contains the standalone ticket-domain package/CLI described by local planning notes: false; no such tracked source exists here, and its owner repository/worktree remains to be located.

## Temporary Solutions

- The current local-native Git capture is an internal prerequisite rather than a production ticket evidence provider. It should remain conservative until freshness, ticket mapping, provider integration, and aggregation are approved and independently validated.
- Detailed design/decision history is still in local ignored files. This shared state is the portable handoff; the local notes must not be a hidden dependency for workers in a fresh clone.

## Known Risks / Open Issues

- Owner observation ID, immutable `ownerReadStartedAt`, monotonic freshness, and an overall call deadline are not implemented.
- The authoritative ticket `WorkspaceRef` tuple and its exact mapping to Orca's host-qualified workspace row are unresolved in this checkout.
- Production plan-evidence provider composition is unwired. Exact-workspace agent source, test lease, ownership, and external-resource universe/provider contracts remain open.
- Windows-vs-WSL clock transfer is not defined. Do not compare separate wall clocks as synchronized; current proposed source scope uses one Orca-main owner clock.
- The pre/post registration checks cannot atomically exclude a hostile concurrent filesystem replacement after preflight (including coordinated A→B→A timing). Do not reuse this read as transactional proof for mutation.
- M1/M2/M3/M4 code ownership spans the Orca checkout and the located, dirty WSL ticket checkout. Most ticket M1 files are untracked, so establish portable content provenance before splitting dependent code tasks.
- Prior `Track Community PRs` run failed for missing `BUFO_BOT_PRIVATE_KEY`; it is separate from `verify` and not evidence of a product-code failure. Confirm whether the Orchestrator wants that workflow/secret handled.

## Current Critical Path

This is a proposal for the Orchestrator, not an implementation authorization:

1. Verify the separate ticket checkout's untracked M1 content and fixture provenance; publish a portable source/contract revision before dependent assignments (TW-00).
2. Obtain approval for the reviewed internal-only owner-freshness slice (TW-01). Keep it in the Orca runtime owner code, reusing the exact binding, subject attestation, status-record capture, and marker-probe lifetimes. Stamp the observation ID/read start once before the first status/marker I/O; never refresh it with adapter receipt time.
3. Give every admitted capture an independent uncached/non-coalesced owner read; overlapping requests may fail unavailable while the single slot is occupied. Enforce same-owner monotonic 30-second freshness/overall deadline and fail unavailable on cancel, timeout, stale/future time, or clock anomaly.
4. Add timing, in-flight UI/read separation, unique ID, stale/future, clock movement, timeout/cancel settlement, and no-reuse tests; get a fresh independent review.
5. Only later, and as separately reviewed work, resolve ticket `WorkspaceRef` mapping, root gateway, resident transport, provider composition, CLI clock handoff, and conservative plan projection. Public `clear` remains prohibited until all source completeness/freshness contracts are joined.

## Parallel work and allocation

TW-00's read-only source/provenance audit and TW-01's isolated Orca runtime implementation are the only safe first-cycle pair. TW-02 through TW-08 depend on portable ticket contracts, root gateway, live resident transport, or stable shared DTOs. The exact dependencies and worker boundaries are in [task-graph.md](./task-graph.md). M4/M5's current IPC contract and fixture corpus are local ignored files (`docs/ticket-workspace-ipc-boundary.md`, `docs/contracts/ticket-workspace-ipc-boundary-v1.ts`, `docs/fixtures/ticket-workspace-ipc-boundary-v1/`), so fixture-backed work cannot be assigned to a fresh clone until those files are published or equivalently shared.
