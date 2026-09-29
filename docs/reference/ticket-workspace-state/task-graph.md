# Ticket Workspace — Recovery-Verified Task DAG

Snapshot: 2026-09-29. This graph refines the [master milestones](./master-plan.md) using the current Orca checkout and the separately published private ticket source. TW-00's source provenance/test gate has passed; task-specific contracts still govern downstream allocation. Task IDs describe deliverables, not automatic authorization to implement them.

## Dependency graph

```text
TW-00 ──> TW-00C + TW-00F; TW-00 ──> TW-00N ──> TW-00C (optional narrow route)
TW-00C + TW-00F ──> TW-06F; TW-06F + TW-02 ──> TW-07F (original M4/M5 fixture checkpoint)
M0 ──> TW-01; TW-00C + TW-01 ──> TW-02
TW-00 + frozen producer/transport protocol ──> TW-06P + TW-06T
TW-06F + TW-06P + TW-06T ──> TW-06
TW-07F + TW-06 + TW-02 ──> TW-07          (live Tickets and owner-status cutover)
TW-00 ──> TW-04A + TW-05; TW-05 ──> TW-05G
TW-04A + TW-05G ──> TW-04B
TW-02 + TW-04B + other owner-source contracts ──> TW-03
TW-05G + TW-06 + TW-07 ──> TW-08; TW-04B + TW-08 ──> TW-04C
TW-03 + TW-04C + TW-05 + TW-06 + TW-08 ──> TW-09 ──> TW-10
```

TW-01 passed independent review; TW-00's private publication, fresh-clone hashes, isolated Linux test replay, and Orca submodule integration passed. The initial submodule pin is in Orca commit `d1f86d608`; the reviewed TW-00N source is private commit `ec2dc67` and is pinned in Orca. Original M4 and M5 accept fixture-backed read-only results before live producer/transport. TW-06F and TW-07F restore those checkpoints; TW-06 and TW-07 are later live cutovers. No fixture snapshot can claim live `current`, enable ticket mutation/effects, or support public `clear`; existing workspace navigation requires TW-02 revalidation. Every new worker allocation requires a reviewed next step and explicit user approval; previous A/B assignments were interrupted without tracked changes.

## Tasks

### TW-00 — Verify the ticket-domain source and publish its contracts

- **STATUS:** Complete. Initial private commit `2045808ffdb6baead2e659855cefb02f7b36491c` (128 files) was fresh-cloned and hash-verified; isolated Linux tests passed 314 with one skipped, plus typecheck. Current private commit `ec2dc6739a65cb882067929ed6d6fcb9bb7df438` (tree `17f5980c08566b87fe3ec13f9d557b9b6b4d623a`; 148 files) is covered by [the published Git-blob manifest](./ticket-published-source.sha256). Its focused contract tests passed 51/51 with typecheck and 22-case Node/browser-preload-shape parity; the full CLI suite was not replayed on this revision. The user-approved Orca submodule gitlink passed independent review and was initially committed at `d1f86d608`.
- **GOAL:** Verify the located WSL ticket checkout's M1 contract, ledger/CAS, doctor/status/plan, and fixture claims against its current source and tests, then make their content provenance portable.
- **DEPENDENCIES:** None; historical plan and current Orca checkout are inputs.
- **OWNERSHIP:** Sol Orchestrator for source identification and shared-state update; a fresh Luna worker may perform bounded read-only inventory once the source is identified.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain package/CLI in its own checkout; `docs/ticket-workspace-*` and `docs/contracts/`, `docs/fixtures/` here; these shared-state documents.
- **INPUT CONTRACT:** Historical M1 checklist was a claim. The recovery baseline was `/home/sellmate/ticket-workspace` on Ubuntu-24.04 at `cf184eaa` with 90 untracked source/test files; published commit `2045808` now captures that content with an updated README.
- **OUTPUT CONTRACT:** Bounded content manifest **and** retrievable tracked/archived source plus fixtures, verified versus missing M1 slices, portable contract location, and corrected dependencies in shared state. Until the archive/revision exists, a manifest supports only local audit, not fresh-clone allocation.
- **CONSTRAINTS:** Read-only until ownership and repository boundary are established; preserve user changes and worktree isolation.
- **DO_NOT_TOUCH:** Ticket product code, external resources, Orca runtime/UI, and unrelated repositories during inventory.
- **ACCEPTANCE CRITERIA:** Every M1 completion claim needed by TW-02/TW-04A/TW-05/TW-06T has content provenance and a current test or is explicitly unresolved; fresh workers can access the required source and contracts without depending on the old Luna session.
- **VERIFICATION:** Fresh clone commit/tree and 128 hashes matched; exact audited source replay passed 32 test files, 314 passed/one skipped, and typecheck under Node 22.23.2/pnpm 12.0.0 in an ext4-backed Linux container. The WSL shell itself lacks Linux Node.
- **PARALLELIZATION SAFETY:** Safe beside TW-01 while read-only; contract publication must finish before dependent work.
- **POTENTIAL CONFLICTS:** The source checkout is now clean, but local ignored documents may diverge from the package; M4/M5 fixtures are not tracked in Orca. Private submodule access and future ticket CI policy remain separate integration constraints.

### TW-00C — Deliver the ticket-owned semantic contract to Orca

- **STATUS:** Private candidate preparation independently reviewed; Orca delivery open. The former `59714ba` full-`/v1` review candidate (48 files, 48,115-byte tarball, SHA-256 `4855c77580abe941af187cf4f999cd74f5abcdfb95854a70ec1a04971b638b49`) remains a historical fallback with 48 schema plus 24 evidence cases in Node and representative sandboxed preload VM. TW-00N now supplies a source-owned, reviewed snapshot-only private candidate from `ec2dc67` (25 files, 14,364-byte tarball, SHA-256 `dd4a6bc8a32183b23efaaaf68b974efbcc933d0a12338d8ef1f218144febf1dd`; manifest SHA-256 `747b2bd05a688af6acd455b4d7de8797b499bd11fa2f79f869ea565aaade54dd`). It passed 22-case Node/browser-preload-shape verdict/admission parity and excludes catalog/resource/config/plan from runtime/declaration closure. Both candidates remain ignored/private and `UNLICENSED`; no exact public-copy bytes, rights approval, public-CI-safe delivery, actual Orca integrated preload, or release package exists. Ordinary public CI cannot rebuild from the private source.
- **GOAL:** Make the canonical ticket `WorkspaceRefV1` and navigator snapshot types, runtime semantic validator, and corpus reproducibly consumable by Orca main and sandboxed preload without a handwritten second schema owner.
- **DEPENDENCIES:** TW-00 published the pinned private source and corpus. Decide the delivery channel and any public distribution scope before publishing contract bytes into the public Orca repository.
- **OWNERSHIP:** Ticket-contract worker owns source-derived build/artifact generation; Orca integration worker owns consumption and CI wiring after one reviewed artifact contract. Sol Orchestrator prepares the scoped distribution decision for user approval and owns the resulting cross-repository pin.
- **FILES / MODULES LIKELY INVOLVED:** Private `packages/contracts` exports/generator/tests; Orca contract artifact/verification, package or bundler wiring, main/preload boundary tests, public PR CI configuration.
- **INPUT CONTRACT:** Pinned ticket commit and full semantic rules, including duplicate identities, SSH presentation, canonical UTF-8 cap, and snapshot digest. The current generated JSON Schema alone is insufficient.
- **OUTPUT CONTRACT:** A source-pinned, digest-verified runtime contract consumable by Orca main and sandboxed preload. A representative preload-shaped artifact harness passes the same corpus before TW-06F; actual Orca main/preload wiring and bundle parity are TW-06F acceptance.
- **CONSTRAINTS:** Public Orca PR CI cannot require private submodule credentials. The narrow `/navigator-snapshot-v1` entry avoids Node builtins and excludes the broader `/v1` closure, but the full package root still reaches Node imports. Orca must use the accepted narrow entry and validate its actual preload bundle. The private source's public redistribution scope remains undecided.
- **DO_NOT_TOUCH:** Ticket CLI lifecycle, external effects, renderer UI, or public release of private protocol bytes before the reviewed distribution decision.
- **ACCEPTANCE CRITERIA:** Reproducible source/digest pin, full corpus parity in a Node/main-shaped harness and representative sandboxed-preload-shaped harness, fail-closed unknown version/digest, and untrusted public PR CI that does not expose private credentials. Document exactly which contract bytes are public. Integrated Orca preload parity remains TW-06F's gate.
- **VERIFICATION:** Source-to-artifact reproducibility check, Node and representative preload-shaped bundle/corpus tests, public-CI-safe replay, changed-code quality, and independent privacy/semantic review.
- **PARALLELIZATION SAFETY:** Private contract generation can proceed beside TW-04A/TW-05/TW-06P in disjoint files after schema scope is frozen; Orca consumer wiring follows the accepted artifact and is serial with TW-02/TW-06 boundary edits.
- **POTENTIAL CONFLICTS:** A private package link would break ordinary public PR CI without scoped access; generated JSON Schema misses runtime checks; a public vendored artifact needs a distribution decision.

### TW-00N — Build and test a source-owned snapshot-only artifact (optional narrow route)

- **STATUS:** Complete as a **private technical candidate** at `ec2dc6739a65cb882067929ed6d6fcb9bb7df438`; fresh Sol review APPROVE after an SSH metadata correction. The clean source passed 51/51 contract tests, typecheck/build, and targeted lint. The 22-case snapshot corpus adds four duplicate-ID/SSH rejection cases; generic and narrow Node/browser-preload-shape verdict/admission results match. Multibyte raw snapshots pass exact 2 MiB/+1 boundary tests. The 25-file candidate is 68,462 expanded / 14,364 packed bytes versus 102 files / 643,839 expanded / 71,550 packed bytes for the same-commit full package. Manifest SHA-256 `747b2bd05a688af6acd455b4d7de8797b499bd11fa2f79f869ea565aaade54dd`; tarball SHA-256 `dd4a6bc8a32183b23efaaaf68b974efbcc933d0a12338d8ef1f218144febf1dd`. Two clean-pin stage/pack runs matched. The artifact remains private and unapproved for public redistribution; actual Orca main/preload integration is outside this task.
- **GOAL:** Determine by implementation and parity tests whether a smaller source-owned package can supply `WorkspaceRefV1`, `TicketNavigatorSnapshotV1`, complete snapshot semantic validation and bounded fixture corpus without the wider `/v1` closure.
- **DEPENDENCIES:** TW-00 pinned private source and user approval for this bounded private implementation were satisfied. The reviewed candidate is TW-00C's narrow delivery input; full-v1 remains the fallback. TW-00F boundary delivery still follows the accepted contract artifact.
- **OWNERSHIP:** Continue the same Luna xhigh contract/fixture workstream; one owner for private contract source and selective pack generation. Sol owns cross-repository sequencing and user approval routing.
- **FILES / MODULES LIKELY INVOLVED:** Private `packages/contracts/src/ticket-contract-validator-v1.ts`, `ticket-contract-admission-v1.ts`, `ticket-workspace-common-v1.ts`, navigator/canonical modules, source-owned narrow entry, selective schema/artifact generator and package generator, snapshot corpus and focused tests. No Orca product-code edits in this task.
- **INPUT CONTRACT:** Pinned full `/v1` semantic validator; 18 snapshot/raw/generator cases in the 48-case schema corpus, relevant adversarial and exact-byte tests; public CI must later consume pinned bytes without private credentials.
- **OUTPUT CONTRACT:** A deterministic, private snapshot-only artifact with exact file/byte manifest and new private source pin, plus measured runtime closure and comparative Node/sandboxed-preload parity. It is a candidate for review, not public distribution.
- **CONSTRAINTS:** Extract/delegate snapshot validation and admission from the existing source owner; split common declarations so the narrow type surface does not expose unrelated schemas, while existing `/v1` APIs re-export/delegate the same definitions. Do not create a second handwritten Orca schema. Preserve duplicate ticket/repository checks, SSH coordinator/workspace rejection, canonical digest, multibyte UTF-8/2 MiB limits, malformed/version/limit reason order and fixture-only non-authority. Keep existing `/v1` behavior compatible.
- **DO_NOT_TOUCH:** Public Orca artifact/package/lockfile, CLI ledger/storage, resource adapters, runtime/UI, live producer/transport and external resources.
- **ACCEPTANCE CRITERIA:** Static/runtime and declaration surfaces exclude catalog, resource, config and plan modules; measured package is actually smaller in disclosed bytes/surface. Source-owned corpus adds rejected snapshot duplicate-ID and SSH mismatch cases and preserves relevant old cases; exact 2 MiB/+1 and semantic verdicts match the pinned generic validator. A selective artifact generator emits only the approved snapshot schemas and metadata. Existing full contract suite does not regress. No `clear` or mutation authority is inferred.
- **VERIFICATION:** Full private contract suite/typecheck/build, source-to-artifact deterministic pack/digest, old-vs-new snapshot verdict matrix, Node and sandboxed-preload corpus parity without Node globals, package import-closure audit, fresh Sol semantic/privacy review.
- **PARALLELIZATION SAFETY:** Serial in the continuing contract/fixture session with TW-00C source/package edits; TW-02 and TW-06F code allocations wait for an accepted delivery artifact. Independent read-only planning may overlap in disjoint files.
- **POTENTIAL CONFLICTS:** The earlier generic validator/admission/corpus runner imported catalog/resource code. TW-00N extracted snapshot-owned paths and passed focused contract/parity review, but downstream CLI and actual Orca integration have not been fully replayed. Filtering JSON or adding a thin export alone would not have shrunk the closure.

### TW-00F — Recover and deliver the M4/M5 fixture boundary inputs

- **STATUS:** Provenance audit complete; delivery open. The ignored old source schema corpus was byte-identical to private commit `59714ba` (51,313 bytes; SHA-256 `e083a1838d3cea35f1cc0a67c08d5422d203d4266069725da0bb1c139bff7801`), but the new `ec2dc67` source corpus has 52 cases and must be reconciled. The ignored boundary corpus is 30,632 bytes (SHA-256 `52a68df5b1b76692bcfae3561e3f8b7d58133d924d955a2fd569675fe8b49663`) with 37 cases, but has no tracked executable runner/generator. Its type-only IPC contract imports a parallel handwritten snapshot type, and three fixture responses are labeled `current` without explicit fixture provenance. No corpus asserts M5's hidden-action tree behavior. Reconciliation and fresh-clone delivery remain open.
- **GOAL:** Make the original fixture IPC contract and corpus reproducible for a fresh worker and public Orca CI under an approved distribution scope.
- **DEPENDENCIES:** TW-00's pinned ticket source; coordinate exact runtime-validation and artifact scope with TW-00C. Audit/reconciliation may proceed privately before the distribution decision; public delivery waits for it.
- **OWNERSHIP:** The same Luna contract/fixture workstream that owns TW-00C performs bounded audit and candidate preparation; Sol Orchestrator prepares the public distribution decision for user approval and owns the resulting pin.
- **FILES / MODULES LIKELY INVOLVED:** The three locally ignored M4/M5 inputs above, private ticket contract/corpus source, and the approved Orca artifact/CI location.
- **INPUT CONTRACT:** The original fixture M4/M5 acceptance criteria, pinned private snapshot corpus and semantic validator, and existing ignored IPC proposal as unverified historical evidence.
- **OUTPUT CONTRACT:** Reviewed, source-pinned fixture IPC wire/renderer contract and corpus that a fresh clone and ordinary public PR CI can consume without private credentials; exact public bytes and provenance documented.
- **CONSTRAINTS:** Reconcile the ignored proposal's generated-Zod-only language with the full ticket-owned runtime validator, immutable snapshot digest, and separate Orca match result. Do not publish private protocol bytes without the user's scoped decision.
- **DO_NOT_TOUCH:** Live producer/transport, renderer, mutation authority, and unrelated ignored notes.
- **ACCEPTANCE CRITERIA:** Fresh-clone reproducibility, full semantic corpus parity, bounded fixture provenance, public-CI-safe delivery, and explicit review of exposed bytes. Unknown or stale contract versions fail closed.
- **VERIFICATION:** Hash/source comparison, private/public artifact review, fresh-clone fixture replay and CI wiring check, independent semantic/privacy review.
- **PARALLELIZATION SAFETY:** Serial after the TW-00C candidate review within the same contract/fixture Luna session. It may overlap only with unrelated workstreams in disjoint files; artifact/publication and shared package edits remain serial.
- **POTENTIAL CONFLICTS:** Ignored IPC files may be stale and contain private contract data; public Orca CI cannot fetch the private submodule.

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
- **DEPENDENCIES:** TW-00 published `WorkspaceRefV1` and catalog source tuple; TW-01 owner evidence; TW-00C delivers the canonical runtime contract for Orca implementation; M0 identity and execution-host contracts. Pure mapping design remains independent of live transport; freeze the validated cross-repository data boundary before a live adapter.
- **OWNERSHIP:** One worker for the cross-boundary contract; implementation ownership split only after the DTO is frozen.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain `WorkspaceRefV1` and owner mapping; Orca worktree catalog binding and host-qualified workspace references.
- **INPUT CONTRACT:** Published `WorkspaceRefV1`, catalog authority/epoch/revision/ticket/repository tuple, and a join that explicitly requires `workspaceRef.repoId === repository.repositoryId` because the catalog validator does not enforce it. The `git-worktree` ref supplies the exact five Orca binding-request fields.
- **OUTPUT CONTRACT:** Exact, revalidated owner mapping or unavailable; no public cleanliness verdict.
- **CONSTRAINTS:** Folder, WSL, SSH, paired, stale, duplicate, and legacy-ambiguous references fail closed for this local-native slice.
- **DO_NOT_TOUCH:** Agent-status store, worktree lifecycle, external adapters, renderer state owner.
- **ACCEPTANCE CRITERIA:** Same path with changed instance, host, store incarnation/revision, ticket source tuple, route, or target cannot inherit evidence. Ticket WSL authority host is never inferred as the Orca workspace execution route; owner catalog tokens and TW-01 stamps remain internal.
- **VERIFICATION:** Mapping/ABA/host isolation tests and mixed-version contract review.
- **PARALLELIZATION SAFETY:** Serial until DTO and ownership are frozen; later Orca and ticket implementations may be split by file boundary.
- **POTENTIAL CONFLICTS:** Orca has no ticket-contract package dependency or validated ticket-to-owner transport. Freeze field/provenance ownership with TW-05 and TW-06T; do not import lifecycle source by relative submodule path or add a duplicate serialized schema owner.

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

- **STATUS:** The common identity/universe decision draft passed independent review. No schema or adapter is implemented. Docker/IIS production pairs remain gated on owner evidence.
- **GOAL:** Define `discover/plan/provision/inspect/teardown`, resource ownership, evidence, preview, and retry semantics before effects.
- **DEPENDENCIES:** TW-00 verifies canonical schema/CAS and contract repository.
- **OWNERSHIP:** Fresh Luna worker in the ticket-domain repository; no Orca runtime edits.
- **FILES / MODULES LIKELY INVOLVED:** Current canonical ticket `/v1` resource envelope as migration input; a separate versioned universe DTO, generated artifact, and synthetic corpus. Typed Docker/IIS intent and observation variants follow only after owner-ratified identities and routes; dev server and test lease remain later resource families.
- **INPUT CONTRACT:** Ticket authority/epoch/revision, repository role, execution domain, target-bound resource identity, and reviewed adapter discriminator/host/evidence semantics. The current `/v1` catalog is generic; the older default export is not its schema source.
- **OUTPUT CONTRACT:** A strict versioned universe DTO and synthetic corpus with partial-failure, owner/host, clock, and complete-query semantics while preserving generic `/v1` rows. Typed production adapter variants remain an explicitly unavailable output until the relevant owner evidence is ratified.
- **CONSTRAINTS:** `referenced` repositories remain read-only; effects belong only to `isolated` resources; Orca receipts cannot stand in for external evidence.
- **DO_NOT_TOUCH:** Live Docker/IIS resources, Orca worktree mutations, renderer actions.
- **ACCEPTANCE CRITERIA:** Preserve generic `/v1` rows and ratify catalog v2 before structured typed production rows. The common universe DTO and synthetic fixtures fail closed on incomplete scope, missing route/owner/clock proof, permission gaps, and stale capture. Any Docker/IIS typed intent, observation, or positive production fixture additionally requires owner-ratified discriminator, physical identity, ownership, query scope, and clock handoff; absent evidence leaves that adapter unsupported and TW-04B blocked.
- **VERIFICATION:** Contract tests and failure fixtures; cross-platform/host-domain review.
- **PARALLELIZATION SAFETY:** The reviewed design was safe beside TW-00C package preparation in separate docs. Contract-package implementation must be serial with TW-00C package edits because both own `packages/contracts`; TW-04B remains downstream.
- **POTENTIAL CONFLICTS:** Shared role/schema fields and resource-universe semantics affect TW-03 and TW-04B. The older package default model has incompatible typed Docker/IIS contracts; copying it would create a second authority.

### TW-04B — Implement external adapters under the root gateway

- **GOAL:** Provision, inspect, reconcile, and prune only ticket-owned external resources under explicit user confirmation; prepare role evidence for later Orca-action convergence.
- **DEPENDENCIES:** TW-04A and TW-05G; TW-00 verified ledger CAS, while the target-bound external-action preview/token contract must be frozen through TW-04A/TW-05G before effects. The pinned source does not yet implement mutation commands.
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

- **STATUS:** Folder/artifact/enrollment decision draft passed independent review. No production creation, publication, or enrollment code exists. Folder host/storage identity, document allowlist, migration only for a nonempty opaque legacy artifact pointer, strict Run caller attestation, and compatible catalog versioning are implementation gates.
- **GOAL:** Create the ticket coordinator folder/document lifecycle using the existing Orca Run root agent.
- **DEPENDENCIES:** TW-00 published the catalog schema; M0 Run ownership. TW-05 must first freeze coordinator artifact/document, enrollment, and root-authority handoff contracts; the published source has only shallow coordinator and artifact references.
- **OWNERSHIP:** Ticket-domain worker for catalog/artifacts; Orca changes only through an agreed seam.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain coordinator folder, artifact revision/retention, first-run enrollment; Orca `Repo(kind: 'folder')` registration/read-back seam if selected.
- **INPUT CONTRACT:** Validated ticket identity, explicit user choice, and a newly specified strict Orca caller/root attestation seam. Existing `runCreate`/`runUse` can fall back to a request-supplied terminal `from` handle when evidence is absent, then resolve its pane.
- **OUTPUT CONTRACT:** Durable folder/document references and recoverable ticket-to-Run correlation. A complete host-qualified folder identity must be proven; current `folderWorkspace.create` does not always populate a host stamp.
- **CONSTRAINTS:** External ticket process never impersonates a coordinator; enrollment failure after Run creation must preserve and retry safely.
- **DO_NOT_TOUCH:** Orca agent-status or terminal ownership, unrelated workspace focus.
- **ACCEPTANCE CRITERIA:** Freeze the document set, revision/retention, explicit folder ownership, strict server-side caller attestation, host-qualified folder identity, idempotent Run enrollment, and recovery contract before implementation. Resume/rebind and local documents then survive partial failure with no duplicate root Run enrollment.
- **VERIFICATION:** Command-authority fixtures, resume/failure tests, focused E2E on isolated display or CI if UI is involved.
- **PARALLELIZATION SAFETY:** Can proceed beside TW-04A after schema freeze; TW-04B must wait for TW-05G, which depends on this task.
- **POTENTIAL CONFLICTS:** `repo.add` host-unaware path deduplication can return a row from another host; `folderWorkspace.create` has no Repo ID. An opaque nonempty legacy `artifact.revision` blocks publication until migration preserves its sole reference and defines the initial manifest revision. Document choices and retention remain open; folder-only setup must be a separate operation when artifact publication is blocked.

### TW-05G — Enforce the root coordinator gateway for effects

- **GOAL:** Admit ticket effects only from the attested root Run through the existing Orca orchestration authority.
- **DEPENDENCIES:** TW-05 durable ticket-to-Run correlation; freeze the one-use token, server-side root attestation, and durable binding-fence contract before effect-gateway implementation. TW-00 did not supply that protocol.
- **OWNERSHIP:** One gateway worker; Orchestrator freezes the cross-repository token and Run-binding contract first.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain command authority/enrollment, Orca Run attestation and binding fence seam.
- **INPUT CONTRACT:** Proposed one-use, five-minute target-bound plan capability (TTL not ratified), ticket/authority/ledger revision, and newly proven strict server-derived root Run/pane identity.
- **OUTPUT CONTRACT:** Admission proof tied to a durable binding fence, revalidated immediately before each effect, or an explicit unavailable/blocked result.
- **CONSTRAINTS:** Serialize with every Run binding mutation and `orchestration.reset --all`/Run deletion; preserve any durable in-flight exclusion across reset and restart. No external process impersonation, cached root context, or adapter effect on ambiguous authority.
- **DO_NOT_TOUCH:** Parallel coordinator/Run owner, agent-status store, renderer-created authority tokens.
- **ACCEPTANCE CRITERIA:** Changed Run, token reuse/expiry, lost contact, changed ledger or target, and fence failure prevent effects. Reset/delete during an effect cannot erase the exclusion or authorize a replacement root.
- **VERIFICATION:** Command-authority fixtures, concurrency/replay tests, host attestation review.
- **PARALLELIZATION SAFETY:** Serial with TW-05 identity and shared token contract; blocks live TW-04B and TW-08.
- **POTENTIAL CONFLICTS:** Run binding generation and ticket ledger revision may change between preview and effect.

### TW-06P — Produce a bounded ticket navigator snapshot

- **GOAL:** Project one validated, current ticket catalog read into an immutable `TicketNavigatorSnapshotV1` without claiming an Orca owner match.
- **DEPENDENCIES:** TW-00 publishes the canonical catalog/snapshot contracts; freeze the shared producer/transport protocol and catalog-to-snapshot projection rules before implementation.
- **OWNERSHIP:** One ticket-domain worker owns the producer and service-side response in the private ticket repository; no Orca runtime edits.
- **FILES / MODULES LIKELY INVOLVED:** Ticket contracts, catalog reader, navigator projector, and resident service-side protocol tests.
- **INPUT CONTRACT:** A request bound to the configured profile, authority, epoch, and authenticated resident connection; one fresh validated catalog read per request or an independently reviewed source-currentness proof.
- **OUTPUT CONTRACT:** Exact UTF-8 bytes of one strictly validated, digest-checked ticket-owned snapshot, or a typed unavailable result. The snapshot is immutable after publication; Orca owner matches use a separate result tied to `snapshotRevision`.
- **CONSTRAINTS:** The producer never starts a CLI/coordinator for a read, queries Orca owner state, or claims `matched`. SSH refs project as `unsupported` under the canonical validator; other unverified refs remain `unavailable`.
- **DO_NOT_TOUCH:** Orca catalog binding, agent-status store, main/preload IPC, renderer, external effects.
- **ACCEPTANCE CRITERIA:** Mixed local/SSH targets project conservatively; missing/untrusted catalog, revision/digest equivocation, and a valid catalog whose projection exceeds 2 MiB return unavailable with no partial snapshot. Repeated fresh reads, source ordering, and clock/TTL semantics are explicit.
- **VERIFICATION:** Contract corpus, projector and service-side tests, byte-exact artifact checks, typecheck, and independent semantic review.
- **PARALLELIZATION SAFETY:** May run beside TW-06T only after the shared wire/projection contract is frozen; files and owners are separate.
- **POTENTIAL CONFLICTS:** The catalog has no ticket `availability` field; projection and same-revision sequence rules must be decided before implementation.

### TW-06T — Establish the resident no-start ticket transport

- **GOAL:** Establish and own an authenticated resident ticket endpoint/connection lifecycle during explicit setup, then provide a no-start transport from Orca main during snapshot reads.
- **DEPENDENCIES:** TW-00 published the strict navigator snapshot DTO/corpus; M0 host ownership seams. TW-06P and TW-06T share a frozen producer/transport protocol; endpoint technology, authenticated setup owner, and resident lifecycle must be decided before transport implementation.
- **OWNERSHIP:** One Orca main transport worker after cross-repository protocol ownership is fixed.
- **FILES / MODULES LIKELY INVOLVED:** Orca main local integration service and resident client; the ticket-domain producer belongs to TW-06P.
- **INPUT CONTRACT:** Configured coordinator/authority/profile binding, explicit setup authority, and a separately reviewed versioned endpoint protocol; no resident endpoint or production snapshot producer is present in the pinned source.
- **OUTPUT CONTRACT:** Owned resident endpoint/connection lifecycle plus bounded snapshot byte stream with authenticated source/provenance, or unavailable during disconnected reads.
- **CONSTRAINTS:** Snapshot reads never launch WSL, CLI, or coordinator; connection setup requires its separate explicit authority. No path/secret exposure, new state owner, or silent local fallback.
- **DO_NOT_TOUCH:** Main/preload snapshot cache and renderer UI until TW-06 owns that layer.
- **ACCEPTANCE CRITERIA:** Disconnected, wrong authority/profile, oversized, partial, or untrusted endpoint fails closed without starting a process.
- **VERIFICATION:** No-start, auth binding, stream bound, cancellation and reconnect tests; independent transport review.
- **PARALLELIZATION SAFETY:** Serial with TW-06 main handler integration; fixture-only schema work can proceed after TW-00 in disjoint files.
- **POTENTIAL CONFLICTS:** No live resident ticket transport or package-side navigator producer currently exists. The CLI `status` report is a different one-shot DTO and cannot satisfy the no-start snapshot read. Authenticated response correlation alone does not establish a fresh source observation.

### TW-06F — Complete the original M4 fixture snapshot boundary

- **STATUS:** Open; there is no tracked main/preload ticket bridge in Orca.
- **GOAL:** Implement the original M4 read-only fixture service through Orca main/preload and a common fixture/live transport interface, with the same validated presentation contract later used by live transport.
- **DEPENDENCIES:** TW-00C full semantic runtime contract and TW-00F reviewed fixture IPC/corpus delivery; M0 Orca boundary ownership. It does not depend on TW-06P or TW-06T.
- **OWNERSHIP:** One Orca main/preload worker; no renderer ownership.
- **FILES / MODULES LIKELY INVOLVED:** Orca main ticket fixture service, bounded IPC handler, preload bridge and focused contract tests.
- **INPUT CONTRACT:** Source-pinned canonical fixture snapshot, reviewed read-only action descriptor/boundary shape, and strict zero-argument IPC request; full ticket-owned runtime validator for both main and sandboxed preload.
- **OUTPUT CONTRACT:** Bounded, explicitly fixture-provenance read-only renderer snapshot or Tickets-only unavailable result; no live `current` claim or action authority.
- **CONSTRAINTS:** No WSL/CLI/process start on read; no path/token exposure; reuse existing workspace/folder/terminal/orchestration runtime clients and preload bridges rather than wrapping their lifecycles in ticket IPC. Keep fixtures isolated from live cache and authority. A fixture must never become a live snapshot by changing presentation metadata.
- **DO_NOT_TOUCH:** Resident transport, production provider, existing Projects state, renderer tree and mutation paths.
- **ACCEPTANCE CRITERIA:** Original M4 accepts a fixture snapshot safely without affecting Projects and keeps fixture/live sources behind one interface. Main and preload enforce the full semantic corpus, ticket/workspace/string/byte limits, invalid-response isolation, cache partition, fixture provenance, timeout, service restart, integration disable, and late-response discard. The ticket boundary carries only ticket data and a read-only action descriptor contract; no effect-capable descriptor is exposed. Existing Orca lifecycle authority remains untouched.
- **VERIFICATION:** Main/preload fixture and failure corpus tests, timeout/restart/disable/late-response tests, actual Orca preload build/parity, Projects regression, changed-code quality and independent review.
- **PARALLELIZATION SAFETY:** Serial with TW-00C/TW-00F artifact integration; after accepted contract, separate main/preload ownership is possible only with one frozen interface. Can proceed alongside TW-06P/TW-06T in disjoint files after protocol freeze.
- **POTENTIAL CONFLICTS:** The ignored IPC proposal assumes generated Zod validation alone, which misses runtime semantic checks; shared main handler files will later be touched by TW-06 live cutover.

### TW-06 — Cut the validated snapshot boundary over to live ticket state

- **GOAL:** Transport and validate one bounded ticket snapshot across main/preload with no new state owner.
- **DEPENDENCIES:** TW-06F provides the accepted fixture boundary; TW-06P delivers the producer and TW-06T delivers the resident no-start transport. TW-02 owns the exact Orca match result when workspace status is exposed.
- **OWNERSHIP:** One Orca main/preload worker; renderer is read-only consumer in TW-07.
- **FILES / MODULES LIKELY INVOLVED:** Shared Zod schema, main IPC handler/cache, preload bridge, ticket snapshot boundary fixtures.
- **INPUT CONTRACT:** Accepted fixture boundary, authenticated resident transport, immutable canonical ticket snapshot, profile/authority/epoch provenance, and a separate Orca-owned match result tied to `snapshotRevision` when owner status is shown.
- **OUTPUT CONTRACT:** `current`, `last-verified-stale`, or Tickets-only `unavailable` result under 2 MiB UTF-8 cap.
- **CONSTRAINTS:** No distro/CLI startup, no raw path/token exposure, main and preload both validate; stale snapshots disable actions.
- **DO_NOT_TOUCH:** Existing Projects/runtime state, renderer ownership, mutation authority, unnegotiated remote wire opcodes.
- **ACCEPTANCE CRITERIA:** Full ticket-owned runtime semantic validation in main and preload, including duplicate identities and canonical digest; separate bounded Orca match-result validation; fixture parity, invalid response isolation, cache partition, byte bounds, and no focus/state disruption. A generated JSON Schema alone is insufficient.
- **VERIFICATION:** Main/preload contract tests, generated fixture parity, changed-code quality and mixed-version review.
- **PARALLELIZATION SAFETY:** Live main handler integration is serial after TW-06F, TW-06P and TW-06T; no concurrent edits to fixture/main handler files.
- **POTENTIAL CONFLICTS:** The live cutover must preserve fixture-path tests without promoting fixture evidence to live authority.

### TW-07F — Complete the original M5 read-only fixture tree

- **STATUS:** Open; Orca has no tracked Tickets renderer integration.
- **GOAL:** Deliver Projects/Tickets switching, ticket hierarchy and preview from the accepted fixture boundary, with mutation actions hidden and existing Orca navigation/status authorities reused.
- **DEPENDENCIES:** TW-06F fixture renderer DTO and accepted M4 boundary; TW-02 exact ticket-to-Orca owner mapping for workspace activation. No live producer or resident transport prerequisite.
- **OWNERSHIP:** One renderer worker with exclusive sidebar/ticket-view files.
- **FILES / MODULES LIKELY INVOLVED:** Existing sidebar navigator/virtualizer, Tickets tree and preview, renderer snapshot projection and focused UI tests.
- **INPUT CONTRACT:** Preload-validated fixture snapshot or bounded unavailable result, marked with non-live provenance; TW-02 exact revalidated Orca-owned workspace ID for activation; existing Orca agent-status/orchestration projection and Tasks surfaces for real Orca-owned display data.
- **OUTPUT CONTRACT:** Accessible read-only Projects/Tickets switch and hierarchy with loading, unavailable, stale and empty states. No mutation action is displayed or enabled.
- **CONSTRAINTS:** Follow `docs/STYLEGUIDE.md`, tokens/primitives, platform keyboard rules and the single agent-status store; preserve Projects behavior and focus.
- **DO_NOT_TOUCH:** Main/preload transport, ticket ledger, effect/action routing and root authority.
- **ACCEPTANCE CRITERIA:** Original M5 Projects/Tickets selector uses the existing workspaces sidebar body, falls back to Projects on error/disable, and presents ticket-to-coordinator and ticket-to-workspace-to-agent hierarchy through existing virtualizer, row focus, keyboard and scroll behavior. Agent rows use the single agent-status store and orchestration projection; workspace navigation uses `activateAndRevealWorkspace` only after TW-02 exact Orca-owned ID revalidation, otherwise remains unavailable. External issue/MR and linked-work-item views reuse Tasks. Loading, unavailable, stale, empty and integration-error states, narrow widths, long names and accessibility are covered. No mutation action is exposed and Projects behavior remains intact.
- **VERIFICATION:** Focused renderer/navigation/state tests, `pnpm run check:code-quality:changed`, design-system gate and hidden-renderer Playwright CDP screenshots with `ORCA_BACKGROUND_LAUNCH=1`.
- **PARALLELIZATION SAFETY:** Starts after TW-06F DTO freeze; exclusive ownership of sidebar/ticket files, with no concurrent TW-07 live cutover edits.
- **POTENTIAL CONFLICTS:** Sidebar state and style enforcement; live statuses cannot be inferred from fixture data.

### TW-07 — Cut the read-only Tickets tree over to live snapshots

- **GOAL:** Present ticket hierarchy and workspace status from a validated snapshot without owning canonical state.
- **DEPENDENCIES:** TW-07F accepted fixture tree, TW-06 live validated boundary, and TW-02 exact Orca owner mapping before live workspace status is shown.
- **OWNERSHIP:** Renderer worker with exclusive sidebar/ticket-view files.
- **FILES / MODULES LIKELY INVOLVED:** Existing sidebar tree/virtualization, ticket preview components, renderer snapshot projection.
- **INPUT CONTRACT:** Accepted fixture renderer path plus preload-validated live current/stale/unavailable renderer DTO.
- **OUTPUT CONTRACT:** Accessible read-only Tickets tree and preview; existing Projects mode remains available.
- **CONSTRAINTS:** Follow `docs/STYLEGUIDE.md`, existing tokens/primitives, keyboard/platform rules, single agent-status store.
- **DO_NOT_TOUCH:** Main transport/schema, ticket ledger, destructive actions, focus-changing prune behavior.
- **ACCEPTANCE CRITERIA:** Bounded trees, loading/failure states, stable selection/focus, stale actions disabled, Projects regression absent.
- **VERIFICATION:** Renderer tests and hidden-renderer CDP screenshots with `ORCA_BACKGROUND_LAUNCH=1`; design-system gate.
- **PARALLELIZATION SAFETY:** Serial with TW-07F sidebar files; starts after TW-06 live contract freeze.
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
- **POTENTIAL CONFLICTS:** Private ticket submodule access, native toolchains, fork/upstream compatibility.

## Execution checkpoint and next allocation

1. **TW-01 and TW-00 complete:** Fresh Luna workers implemented the internal owner-freshness capture and published the initial 128-file private ticket source. Fresh Sol reviews passed after corrections. The initial source hashes, 314 tests with one skipped, and typecheck passed. The current 148-file source at `ec2dc67` passed 51 contract tests, typecheck/build, clean private packing, and 22-case browser/preload-shape corpus parity; its Git-blob manifest is pinned above. Private contract tarballs remain private and the actual Orca preload integration is open. Orca's TW-01 and initial submodule commits were pushed; PR checks at `e3705c5db` completed with 31 successes, eight skips, and no failures. The previous main Luna session remains historical evidence only.
2. **Contract discovery:** [TW-02 owner boundary](./workspace-owner-boundary.md) and [TW-06P/TW-06T resident contract](./resident-ticket-transport.md) passed fresh Sol re-review after the immutable-snapshot, source-currentness, full-validator, and ownership corrections. [TW-05/TW-05G coordinator/root contract](./coordinator-root-authority.md) passed its correction review after adding strict caller attestation, reset-safe exclusion, and folder host proof. [TW-04A external-resource contract](./external-resource-contract.md) passed correction review after adding a separate universe observation and version/migration gate. These documents are decision drafts; endpoint, clock, adapter identity, artifact, token, and lifecycle choices remain open.
3. **Off-track audit and correction:** Fresh read-only review found no off-plan product implementation or external effect. It found a sequencing drift: the original M4/M5 fixture completion checks had been moved behind live producer/transport. The preceding two worker assignments were interrupted before tracked edits. TW-04A common DTO and TW-05G design remain valid future branches, but they are not prerequisites for original fixture M4/M5.
4. **Critical path to the next independently testable checkpoint:** Reconcile TW-00C's full semantic validator delivery and TW-00F's ignored fixture IPC/corpus provenance, obtain a scoped public-byte decision, then implement/review TW-06F fixture boundary and TW-02 exact owner mapping before TW-07F fixture tree. These are read-only M4/M5 checkpoints, not live integration or action readiness. The same Luna contract/fixture workstream handles TW-00C then TW-00F; public artifact integration is serial. TW-06F and TW-02 can proceed in disjoint main/runtime workstreams after their shared contract is accepted; TW-07F starts after both.
5. **Separate live path:** TW-06P/TW-06T producer/transport contracts may advance in disjoint workstreams after their own gates; TW-06 live cutover waits for TW-06F plus both live endpoints, and TW-07 live cutover waits for TW-07F, TW-06 and TW-02. TW-02 is shared with the fixture M5 navigation checkpoint. TW-03 provider, TW-04A/TW-04B external evidence, TW-05/TW-05G root authority, TW-08 effects, TW-09 integration and TW-10 release retain their existing dependency gates. Public `clear` and all effects remain blocked on live source authority.
6. **Continuing contract/fixture allocation completed:** The user approved resuming the existing Luna contract workstream for TW-00C private candidate review and TW-00F provenance audit, then separately approved TW-00N private implementation after a read-only feasibility review. The same Luna session completed all three bounded tasks. Fresh Sol found and required a correction to the new artifact's SSH metadata; the corrected candidate passed independent review at `ec2dc67`. TW-02 research was not duplicated because its field contract is already decision-ready; implementation waits for TW-00C delivery. No public contract bytes, TW-06F implementation, or live effects were authorized. Keep this Luna session for related follow-on work; fresh Sol review remains independent.
7. **Reviewed next-step proposal, awaiting user approval:** Use the TW-00N narrow private candidate as TW-00C's input, with the historical full-`/v1` candidate as fallback. The next serial contract/fixture packet prepares exact publishable bytes, source pin/digest and ordinary-public-CI-safe replay, then reconciles TW-00F's old corpus/IPC proposal with the 52-case source and executable full semantic validator. This preparation does not copy private bytes into public Orca. Present the exact exposed bytes and rights scope to the user for separate approval before public copying. Actual Orca main/preload and release packaging remain later gates; no fixture grants live current, mutation, or public `clear`.
