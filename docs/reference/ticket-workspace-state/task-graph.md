# Ticket Workspace — Recovery-Verified Task DAG

Snapshot: 2026-09-30. This graph refines the [master milestones](./master-plan.md) using the current Orca checkout and the separately published private ticket source. TW-00's source provenance/test gate has passed; task-specific contracts still govern downstream allocation. Task IDs describe deliverables, not automatic authorization to implement them.

## Dependency graph

```text
TW-00 ──> TW-00C + TW-00F; TW-00 ──> TW-00N ──> TW-00C (optional narrow route)
TW-00C + TW-00F ──> TW-06F; TW-06F + TW-02F ──> TW-07F (original M4/M5 fixture checkpoint)
M0 ──> TW-01; TW-00C + TW-01 ──> TW-02F
TW-00 + reviewed logical-v1 protocol and vectors ──> TW-06P injected projector/handler
TW-06P injected tests + approved vector bytes ──> TW-06P-F1 private fixture portability ──> current-pin standalone CLI replay
TW-00 ──> TW-M1P base runtime/profile delivery
reviewed logical-v1 protocol and vectors ──> TW-06T fake-duplex client; TW-M1P + TW-06P service artifact + production host/key/endpoint proofs ──> TW-06T production setup
TW-02F + production TW-06P service/TW-06T authenticated lease + P4/P5 owner eligibility ──> TW-02L (authenticated live owner composition)
TW-06F + production TW-06P service/TW-06T authenticated lease + P3/P6 currentness ──> TW-06
TW-06 snapshot core + TW-02L ──> TW-06 live matched-overlay publication
TW-07F + TW-06 + TW-02L ──> TW-07         (live Tickets and owner-status cutover)
TW-00 ──> TW-04A + TW-05; TW-05 ──> TW-05G
TW-04A + TW-05G ──> TW-04B
TW-02L + TW-04B + other owner-source contracts ──> TW-03
TW-05G + TW-06 + TW-07 ──> TW-08; TW-04B + TW-08 ──> TW-04C
TW-03 + TW-04C + TW-05 + TW-06 + TW-08 ──> TW-09 ──> TW-10
```

TW-01, TW-02F and TW-06F passed independent review; TW-00's private publication, fresh-clone hashes, isolated Linux test replay and Orca submodule integration passed. Orca's reviewed and CI-verified commit `fa4e622f4` pins private source `54477c2`, including the reviewed TW-04A common contract. The user approved the exact seven-file public copy; its delivery and M4 fixture integration passed independent review and PR CI. Original M4 and M5 accept fixture-backed read-only results before live producer/transport. TW-06F completed M4, and TW-07F's M5 fixture UI/navigation, hidden CDP and same-head PR CI passed; TW-06 and TW-07 remain later live cutovers. No fixture snapshot can claim live `current`, enable ticket mutation/effects, or support public `clear`; existing workspace navigation requires TW-02F click-time revalidation. TW-02F does not satisfy TW-02L's production owner-evidence gate. Every new implementation worker allocation requires a reviewed next step and explicit user approval.

## Tasks

### TW-M1P — Deliver a provenance-bound ticket profile and CLI runtime

- **STATUS:** Open. The private CLI and contracts passed isolated offline local-install tests. The detailed [profile/base-runtime delivery proposal](./profile-delivery.md) passed independent review as a contract candidate after bootstrap, host-binding and recovery corrections; production installation, update and rollback remain unimplemented. Product code needs owner decisions and a frozen packet.
- **GOAL:** Make the configured ticket profile and a source-pinned Linux Node 22.13+ CLI/base runtime reproducibly installable, updatable and recoverable for explicit Orca setup. TW-06P separately supplies the future resident service artifact.
- **DEPENDENCIES:** TW-00 published source and profile schema; decide base artifact provenance, execution host, install target, version binding and rollback semantics before implementation. TW-06P/T logical protocol and injected code passed review; TW-06T production setup needs both this verified base runtime/profile and the separately delivered TW-06P service artifact.
- **OWNERSHIP:** One ticket-domain delivery workstream for private package/profile artifacts; Orca setup integration owns only the separately agreed host/authority handoff. Do not have both workstreams edit the private CLI or the same setup seam concurrently.
- **FILES / MODULES LIKELY INVOLVED:** `ticket-workspace/packages/cli/`, profile/config contracts, private packaging/install tests and later Orca explicit setup integration. The seven approved public fixture files are unrelated.
- **INPUT CONTRACT:** Source-pinned private package and strict profile/config schema, explicit install authority, exact WSL machine/distro target, verified Node runtime and artifact identity.
- **OUTPUT CONTRACT:** A versioned installed profile plus Node/CLI base-runtime provenance that TW-06T can attest during explicit setup, with explicit update/rollback and fail-closed unavailable on missing or mismatched provenance. This output does not claim a resident service binary.
- **CONSTRAINTS:** No private source copied into the public Orca package beyond separately approved bytes; no WSL/CLI/process launch from read-only status/snapshot paths; no overwrite or silent migration of existing user state.
- **DO_NOT_TOUCH:** TW-07F fixture IPC/UI, ticket mutation/effects, Orca agent-status/Run ownership, approved public fixture bytes.
- **ACCEPTANCE CRITERIA:** Freeze the install authority, source/artifact hash, profile/authority/host binding, Node version, update and rollback recovery rules; then prove fresh base install, mismatch rejection, update and rollback against isolated WSL/ext4 fixtures. TW-06T production setup admits only this verified base runtime/profile joined to an independently pinned TW-06P service artifact. No installation success is inferred from a contract tarball or a path string.
- **VERIFICATION:** Offline/frozen artifact replay, profile and executable hash checks, before/after filesystem assertions, WSL-host identity and wrong-profile tests, focused independent review.
- **PARALLELIZATION SAFETY:** Contract/evidence research is independent of TW-07F and TW-05/TW-04A audits. Private CLI implementation must serialize with TW-05/06P edits to shared profile/catalog modules; the reviewed TW-06T injected transport cannot activate production setup before the verified runtime delivery.
- **POTENTIAL CONFLICTS:** This machine's WSL shell lacked Linux Node at recovery; the earlier offline package test ran in an isolated Node/ext4 environment. Orca packaging and private-source access do not by themselves deliver an installed ticket service.

### TW-00 — Verify the ticket-domain source and publish its contracts

- **STATUS:** Complete. Initial private commit `2045808ffdb6baead2e659855cefb02f7b36491c` (128 files) was fresh-cloned and hash-verified; isolated Linux tests passed 314 with one skipped, plus typecheck. The later snapshot-delivery commit `31b3768e8043b6aeef66f0fe0fe648439ba80b2b` (tree `150b23c5c7380f255c86d229a04e8f97c3366987`; 157 files) is covered by [the published Git-blob manifest](./ticket-published-source.sha256) and passed 51 contract tests plus source/fixture VM replay. Private pin `54477c2371094f1cbc438845fdfde0ca3584e2aa` added the reviewed TW-04A common contract; its contract package passed 53 tests and typecheck. Private `f0b3181` added reviewed injected producer code; current `f7d66d1` adds its source-local test fixture. The 23 focused CLI tests and typecheck passed in normal and isolated source checkouts, while clean dependency installation and the full current-pin CLI suite remain open. The user-approved Orca submodule gitlink was initially committed at `d1f86d608`, advanced to `f0b3181` in PR code HEAD `a29bc2169`, and is now advancing to `f7d66d1`.
- **GOAL:** Verify the located WSL ticket checkout's M1 contract, ledger/CAS, doctor/status/plan, and fixture claims against its current source and tests, then make their content provenance portable.
- **DEPENDENCIES:** None; historical plan and current Orca checkout are inputs.
- **OWNERSHIP:** Sol Orchestrator for source identification and shared-state update; a fresh Luna worker may perform bounded read-only inventory once the source is identified.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain package/CLI in its own checkout; `docs/ticket-workspace-*` and `docs/contracts/`, `docs/fixtures/` here; these shared-state documents.
- **INPUT CONTRACT:** Historical M1 checklist was a claim. The recovery baseline was `/home/sellmate/ticket-workspace` on Ubuntu-24.04 at `cf184eaa` with 90 untracked source/test files; published commit `2045808` now captures that content with an updated README.
- **OUTPUT CONTRACT:** Bounded content manifest **and** retrievable tracked/archived source plus fixtures, verified versus missing M1 slices, portable contract location, and corrected dependencies in shared state. Until the archive/revision exists, a manifest supports only local audit, not fresh-clone allocation.
- **CONSTRAINTS:** Read-only until ownership and repository boundary are established; preserve user changes and worktree isolation.
- **DO_NOT_TOUCH:** Ticket product code, external resources, Orca runtime/UI, and unrelated repositories during inventory.
- **ACCEPTANCE CRITERIA:** Every M1 completion claim needed by TW-02F/TW-02L/TW-04A/TW-05/TW-06T has content provenance and a current test or is explicitly unresolved; fresh workers can access the required source and contracts without depending on the old Luna session.
- **VERIFICATION:** Fresh clone commit/tree and 128 hashes matched; exact audited source replay passed 32 test files, 314 passed/one skipped, and typecheck under Node 22.23.2/pnpm 12.0.0 in an ext4-backed Linux container. The WSL shell itself lacks Linux Node.
- **PARALLELIZATION SAFETY:** Safe beside TW-01 while read-only; contract publication must finish before dependent work.
- **POTENTIAL CONFLICTS:** The source checkout is now clean, but local ignored documents may diverge from the package. The approved seven public contract/fixture files are tracked in Orca; private submodule access and future ticket CI policy remain separate integration constraints.

### TW-00C — Deliver the ticket-owned semantic contract to Orca

- **STATUS:** Private preparation passed fresh Sol review at `31b3768`. The user approved the exact derived 18,108-byte archive and six fixture files; Orca has their byte-exact copy, local `file:` devDependency and CI fixture replay. Local hash, TypeScript, Node/browser VM, code-quality, independent code/shared-state review and PR #1 CI at `cde43160f` passed. Actual Orca main/preload integration later passed separately in TW-06F. The source pin `d27fe24` also produced an earlier private 17,941-byte archive (SHA-256 `d88d083399865def40f2181da0c81e8fe0616f69b82bde62a1f2f5002ace723b`) that remains historical; the approved bytes are [pinned separately](./public-redistribution-proposal.md).
- **GOAL:** Make the canonical ticket `WorkspaceRefV1` and navigator snapshot types, runtime semantic validator, and corpus reproducibly consumable by Orca main and sandboxed preload without a handwritten second schema owner.
- **DEPENDENCIES:** TW-00 published the pinned private source and corpus. The user approved the exact public distribution scope and local `file:` delivery channel; its public PR CI verification passed.
- **OWNERSHIP:** Ticket-contract worker owns source-derived build/artifact generation; Orca integration worker owns consumption and CI wiring after one reviewed artifact contract. Sol Orchestrator prepares the scoped distribution decision for user approval and owns the resulting cross-repository pin.
- **FILES / MODULES LIKELY INVOLVED:** Private `packages/contracts` exports/generator/tests; Orca contract artifact/verification, package or bundler wiring, main/preload boundary tests, public PR CI configuration.
- **INPUT CONTRACT:** Pinned ticket commit and full semantic rules, including duplicate identities, SSH presentation, canonical UTF-8 cap, and snapshot digest. The current generated JSON Schema alone is insufficient.
- **OUTPUT CONTRACT:** A source-pinned, digest-verified runtime contract consumable by Orca main and sandboxed preload. The representative preload-shaped artifact harness and later TW-06F actual main/preload bundle parity both passed.
- **CONSTRAINTS:** Public Orca PR CI cannot require private submodule credentials. The narrow `/navigator-snapshot-v1` entry avoids Node builtins and excludes the broader `/v1` closure, but the full package root still reaches Node imports. Orca must use the accepted narrow entry and validate its actual preload bundle. Only the seven exact approved public files may be copied under this decision.
- **DO_NOT_TOUCH:** Ticket CLI lifecycle, external effects, renderer UI, or private protocol bytes outside the exact approved scope.
- **ACCEPTANCE CRITERIA:** Reproducible source/digest pin, full corpus parity in a Node/main-shaped harness and representative sandboxed-preload-shaped harness, fail-closed unknown version/digest, and untrusted public PR CI that does not expose private credentials. Document exactly which contract bytes are public. Integrated Orca preload parity subsequently passed in TW-06F.
- **VERIFICATION:** Source-to-artifact reproducibility check, Node and representative preload-shaped bundle/corpus tests, public-CI-safe replay, changed-code quality, and independent privacy/semantic review.
- **PARALLELIZATION SAFETY:** The accepted archive and fixture replay are delivered. TW-02F runtime mapping and TW-06F main/preload fixture presentation may proceed in parallel under the frozen input/output boundary below; neither edits the seven pinned files or the other's modules. Their renderer/navigation join is serial in TW-07F.
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
- **PARALLELIZATION SAFETY:** Serial in the continuing contract/fixture session with TW-00C source/package edits. TW-02F and TW-06F now have the accepted delivery artifact; independent implementation allocations follow their frozen interface and approval gate.
- **POTENTIAL CONFLICTS:** The earlier generic validator/admission/corpus runner imported catalog/resource code. TW-00N extracted snapshot-owned paths and passed focused contract/parity review, but downstream CLI and actual Orca integration have not been fully replayed. Filtering JSON or adding a thin export alone would not have shrunk the closure.

### TW-00F — Recover and deliver the M4/M5 fixture boundary inputs

- **STATUS:** Private fixture reconciliation passed fresh Sol review at `31b3768`; six exact fixture/replay files are now copied under the user's public approval. Local replay, independent code review and PR #1 CI at `cde43160f` passed. The historical 37-case corpus is pinned at SHA-256 `52a68df5b76692bcfae3561e3f8b7d58133d924d955a2fd569675fe8b49663`, and replay checks its exact ordered IDs. The fixture boundary uses the ticket-owned semantic validator, explicit `fixture` provenance and separate `orcaMatch: not-evaluated`; 15 source semantic, two fixture wire and 11 envelope historical claims have executable replacements. Nine live producer/cache rows and three live freshness assertions are deferred to TW-06P/T. M5 action hiding later passed in TW-07F. No fixture asserts live `current`, mutation or public `clear`.
- **GOAL:** Make the original fixture IPC contract and corpus reproducible for a fresh worker and public Orca CI under an approved distribution scope.
- **DEPENDENCIES:** TW-00's pinned ticket source and TW-00C's exact runtime-validation artifact; the approved public copy passed integration and public PR CI verification.
- **OWNERSHIP:** The same Luna contract/fixture workstream that owns TW-00C performs bounded audit and candidate preparation; Sol Orchestrator prepares the public distribution decision for user approval and owns the resulting pin.
- **FILES / MODULES LIKELY INVOLVED:** The three locally ignored M4/M5 inputs above, private ticket contract/corpus source, and the approved Orca artifact/CI location.
- **INPUT CONTRACT:** The original fixture M4/M5 acceptance criteria, pinned private snapshot corpus and semantic validator, and existing ignored IPC proposal as unverified historical evidence.
- **OUTPUT CONTRACT:** Reviewed, source-pinned fixture IPC wire/renderer contract and corpus that a fresh clone and ordinary public PR CI can consume without private credentials; exact public bytes and provenance documented.
- **CONSTRAINTS:** Reconcile the ignored proposal's generated-Zod-only language with the full ticket-owned runtime validator, immutable snapshot digest, and separate Orca match result. Do not copy private protocol bytes outside the user's exact scoped decision.
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
- **VERIFICATION:** Focused timing, concurrent UI/plan, abort/timeout settlement, stale/future/clock-anomaly tests; Node typecheck and changed-code quality; fresh Sol xhigh review. Windows operation-marker native integration remains CI-owned until separately rerun locally; the C++ toolset is now available.
- **PARALLELIZATION SAFETY:** Serial within this seam; safe beside read-only TW-00. Do not assign another worker to its runtime files.
- **POTENTIAL CONFLICTS:** Binding/attestation already use shorter deadlines and single-slot ownership; avoid a second timeout that releases work early.

### TW-02F — Bind fixture ticket `WorkspaceRef` to the exact Orca owner tuple

- **STATUS:** Implemented and approved by separate and integrated Sol review; fixture-only binding does not satisfy TW-02L live evidence.
- **GOAL:** Implement a pure ticket-to-Orca five-field mapping and a separate asynchronous exact local-native owner match for an injected validated fixture snapshot. Live ticket-source admission and Git evidence are later slices.
- **DEPENDENCIES:** TW-00C/F delivered the canonical snapshot contract/fixture; TW-01 and M0 established internal owner evidence and identity rules. TW-06P/T live producer/transport are not prerequisites for fixture mapping.
- **OWNERSHIP:** One continuing Luna owner-mapping workstream, exclusive to new Orca runtime selection/binding modules and focused tests. TW-06F owns the main fixture service, canonical snapshot accessor, shared IPC/preload registration and renderer projection; TW-07F wires their navigation join after both.
- **FILES / MODULES LIKELY INVOLVED:** New `src/main/runtime/` ticket selection/binding modules and tests; read existing `runtime-worktree-catalog-binding.ts`, `worktree-catalog-binding-types.ts`, and the delivered narrow contract exports. Do not modify the ticket source or shared IPC/preload files in this packet.
- **INPUT CONTRACT:** One injected `TicketNavigatorSnapshotV1` accepted by the delivered full semantic validator, selected `ticketKey` and `repositoryId`, and a schema-v1 local `git-worktree` target. Require `repositoryId === target.repoId`; map only `{ repositoryId, worktreeId, executionHostId, instanceId, identityKey }` into the existing Orca binder. Click-time requests contain only `{ snapshotRevision, ticketKey, repositoryId }`; main reloads its own validated fixture snapshot through TW-06F's injected accessor and checks the revision before rebinding. Renderer input never supplies a snapshot, ref or worktree ID.
- **OUTPUT CONTRACT:** Pure mapping attempt or unavailable, then a separate Orca-owned `matched` / `unavailable` result tied to `snapshotRevision`, `ticketKey`, and `repositoryId`. Keep the binding token, target path and registration evidence in main. A click-time main-side rebind may yield only the freshly attested existing Orca worktree ID to the established navigation path; never take that ID directly from ticket input. No live currentness, Git cleanliness or public `clear` verdict.
- **CONSTRAINTS:** Folder, WSL, SSH, paired, duplicate, cross-repository mismatch and legacy-ambiguous refs fail closed for this local-native slice. A stale fixture match means an Orca binding or selected `snapshotRevision` changed; do not compare the historical fixture's `generatedAt`/`staleAfter` to Orca wall time or relabel it live. Ticket authority host never implies the Orca execution host. The existing Orca worktree ID encodes a path, so it may cross only the established Orca navigation seam after fresh owner attestation, not the targetless TW-06F presentation DTO.
- **DO_NOT_TOUCH:** Seven approved public files, ticket schema/source, TW-06F fixture main/IPC/preload/projection, renderer, agent-status store, worktree lifecycle, external adapters, live transport and effect paths.
- **ACCEPTANCE CRITERIA:** Accepted `snapshot.full` renders but fails owner matching because `repositoryId: common-api` differs from `target.repoId: repo-1`; add a separate Orca-owned positive synthetic vector with recomputed canonical digest. Same path with changed `snapshotRevision`, instance, host, store incarnation/revision, route or target cannot inherit a match. Rebind at navigation click; no cached prior match authorizes activation. Owner catalog tokens and TW-01 stamps remain internal.
- **VERIFICATION:** Focused pure mapping, mismatch/positive-vector, ABA/host isolation, selector-only click request and click-time rebind tests; changed-code quality, typecheck and independent semantic review.
- **PARALLELIZATION SAFETY:** Safe beside TW-06F with exclusive runtime file ownership and the frozen canonical input/separate output contract. TW-07F performs the shared renderer/IPC navigation join serially after both results land.
- **POTENTIAL CONFLICTS:** The delivered package supplies the ticket snapshot contract but no validated live ticket-to-owner transport. Do not add a duplicate serialized schema owner or treat fixture matching as live source currentness.

### TW-02L — Compose authenticated live ticket-to-Orca owner evidence

- **STATUS:** Read-only source/currentness design completed; fresh Sol review required a disposition eligibility handoff before implementation. The snapshot exposes an excluded repository role but not catalog `pruning`/`pruned` disposition, so comparing an exact retained ref alone cannot authorize a live match.
- **GOAL:** Reuse TW-02F's exact mapper/binder for an authenticated current ticket source and TW-01 owner capture, with source-currentness checks around asynchronous reads.
- **DEPENDENCIES:** TW-02F accepted; TW-06P producer and TW-06T authenticated resident transport/freshness contracts implemented and independently reviewed. This gate is required by TW-03 production `plan` and live TW-07 owner status; fixture completion does not satisfy it.
- **OWNERSHIP:** The continuing Luna owner-mapping workstream with Sol integration review; coordinate the shared live ingress with the TW-06 transport owner serially after protocol freeze.
- **FILES / MODULES LIKELY INVOLVED:** Orca main runtime owner composition, TW-01 capture integration, resident ticket ingress adapter and focused source-currentness tests.
- **INPUT CONTRACT:** Authenticated current-source callback bound to the same lease/incarnation, full profile, authority, epoch and host on each read; reviewed source-clock/currentness and catalog-derived pruning eligibility, exact selected source tuple/ref, TW-02F five-field mapper/binder and TW-01 owner capture.
- **OUTPUT CONTRACT:** Separate Orca-owned live match and invocation-bound Git evidence with explicit unavailable where source facts, target binding, completeness or freshness fail. No public `clear` until every other owner observation is joined in TW-03.
- **CONSTRAINTS:** No WSL/CLI start on read; no producer `referenceState` promoted to Orca match; no cross-host wall-clock inference; same source facts must survive pre/post attestation and capture. SSH/paired/folder targets stay unavailable until separately proven.
- **DO_NOT_TOUCH:** Ticket canonical ledger/schema, renderer state owner, effect paths and external-resource adapters.
- **ACCEPTANCE CRITERIA:** An outer monotonic deadline and abort begin before the first source read and include binder/capture. Authenticated source-currentness and exact profile/source-facts/selected ticket/ref rechecks bracket asynchronous work under one lease; both live match and click reject catalog-pruning/pruned and excluded targets through the frozen source-bound eligibility signal. A refreshed `generatedAt`/`staleAfter` may change later `snapshotRevision` without changing owner facts, while the match stays tied to the original snapshot revision. Rechecks establish an invocation-bound observation, not atomicity after the final read or action authority. Changed/partial/unreachable source yields unavailable; TW-01 status/marker completeness is checked separately before any downstream `clear`, and callers cannot supply or refresh its observation ID/read-start time.
- **VERIFICATION:** Mixed-version transport/source tests, ABA/host/clock/timeout/partial-failure matrix, TW-01 capture integration, typecheck and independent semantic review.
- **PARALLELIZATION SAFETY:** Serial at the TW-06 live ingress and shared owner composition after protocol freeze; disjoint provider/adapter research may overlap without editing the same interface.
- **POTENTIAL CONFLICTS:** TW-06P/T protocol, source-currentness and cross-process clock handoff remain open. A fixture `matched` result cannot be promoted to live evidence.

### TW-03 — Compose read-only production plan evidence

- **GOAL:** Join exact worktree, agent, test/lease, ownership, and external-resource owner observations into conservative ticket plan projection.
- **DEPENDENCIES:** TW-02L authenticated live owner evidence; TW-04B external-resource inspection/evidence; exact agent host/workspace association and complete host-store read; test-lease ledger/adapter scope and semantics; ticket ownership and host proof; source-owned freshness and validated cross-clock handoff. TW-02F fixture matching alone is insufficient.
- **OWNERSHIP:** Ticket-domain provider worker after owner-source contracts are frozen; Orca owner adapters separately reviewed.
- **FILES / MODULES LIKELY INVOLVED:** Ticket-domain plan evidence provider/CLI; Orca execution-host status store and observation ports.
- **INPUT CONTRACT:** One invocation-bound, source-owned observation per required authority, with target identity, completeness, provenance, and clock handoff.
- **OUTPUT CONTRACT:** Versioned read-only `plan` evidence and blocker projection; incomplete/unverifiable where any required proof is missing.
- **CONSTRAINTS:** Positive blockers may be conservative; empty Git status and marker absence alone never yield `clear`; no WSL/Windows wall-clock equivalence assumption.
- **DO_NOT_TOUCH:** Parallel agent-status store, cached clear result, resource mutations, public `clear` before every source contract is proven.
- **ACCEPTANCE CRITERIA:** All six required observations attest their exact subject and source owner, complete negative coverage, and owner-clock freshness before any public `clear`. Four `clear` rows plus reachable host and matching ownership pass today's structural admission without those proofs, so the provider must not promote them. Missing, partial, stale, or older-peer evidence fails closed as `unverifiable`; current CLI remains `incomplete` without a provider.
- **VERIFICATION:** Cross-source fixture matrix, clock/cancel/partial-failure tests, provider contract and independent integration review.
- **PARALLELIZATION SAFETY:** Owner-source research can be parallel by authority; final composition is serial after contracts stabilize.
- **POTENTIAL CONFLICTS:** Exact agent status, test lease, ownership, external universe, WSL route, and clock handoff remain unresolved.

### TW-04A — Freeze external-resource adapter contracts and fixtures

- **STATUS:** Common versioned universe DTO, validator, generated artifact, and 50-case synthetic corpus implemented in private source `54477c2` and approved by independent Sol review. Docker/IIS production pairs remain gated on owner evidence; no production adapter or effect is implemented.
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

- **STATUS:** The logical-v1 injected-only protocol, P4/P5 projection policy and T1-T12 vectors passed fresh independent Sol review on 2026-09-30. The continuing Luna private projector/handler packet passed 23 focused tests, CLI typecheck, independent source review and cross-peer fake-duplex conformance. It is published at private `f0b3181`; no production service artifact or setup exists. Ticket orchestration host IDs remain opaque; injected policy uses separate exact allowlists while production host mapping remains open.
- **GOAL:** Project one validated, current ticket catalog read into an immutable `TicketNavigatorSnapshotV1` without claiming an Orca owner match.
- **DEPENDENCIES:** TW-00 published the canonical catalog/snapshot contracts; the exact logical-v1 protocol, projection policy, shared golden vectors and injected projector/handler passed independent review. Production service setup additionally needs trusted host-ID mapping and artifact provenance.
- **OWNERSHIP:** One ticket-domain worker owns the producer and service-side response in the private ticket repository; no Orca runtime edits.
- **FILES / MODULES LIKELY INVOLVED:** Ticket contracts, catalog reader, navigator projector, and resident service-side protocol tests.
- **INPUT CONTRACT:** A request bound to the configured profile, authority, epoch, and authenticated resident connection; one fresh validated catalog read per request or an independently reviewed source-currentness proof.
- **OUTPUT CONTRACT:** Exact UTF-8 bytes of one strictly validated, digest-checked ticket-owned snapshot, or a typed unavailable result, from a source-pinned resident service artifact with version and provenance that TW-06T setup can verify. The snapshot is immutable after publication; Orca owner matches use a separate result tied to `snapshotRevision`.
- **CONSTRAINTS:** The producer never starts a CLI/coordinator for a read, queries Orca owner state, or claims `matched`. SSH refs project as `unsupported` under the canonical validator; other unverified refs remain `unavailable`.
- **DO_NOT_TOUCH:** Orca catalog binding, agent-status store, main/preload IPC, renderer, external effects.
- **ACCEPTANCE CRITERIA:** Mixed local/SSH targets project conservatively; missing/untrusted catalog, revision/digest equivocation, and a valid catalog whose projection exceeds 2 MiB return unavailable with no partial snapshot. Repeated fresh reads, source ordering, and clock/TTL semantics are explicit. The resident service artifact is reproducible, source-pinned and independently checked for the negotiated protocol/version; its provenance is a separate output from TW-M1P base Node/CLI/profile delivery.
- **VERIFICATION:** Contract corpus, projector and service-side tests, byte-exact artifact checks, typecheck, and independent semantic review.
- **PARALLELIZATION SAFETY:** The injected projector/handler and TW-06T fake-duplex client ran in parallel under separate repository owners and passed the logical-v1 gate. Production setup stays serial behind runtime, artifact, host and credential proofs.
- **POTENTIAL CONFLICTS:** The catalog has no ticket `availability` field or snapshot disposition counterpart. Freeze pruning/pruned/excluded target suppression, SSH orchestration-only and mixed-host behavior, service producer identity, equal-tuple digest high-water owner, and cross-clock currentness before implementation.

### TW-06P-F1 — Make private resident tests self-contained

- **STATUS:** Complete and independently reviewed on 2026-09-30; published as private `f7d66d1`. The historical `f0b3181` test read the golden vector from its Orca parent. The current test owns its exact fixture and passed 23 focused tests plus CLI typecheck from an isolated source checkout using local dependency junctions; clean fresh-clone installation and full Linux/ext4 CLI replay remain open.
- **GOAL:** Preserve the reviewed golden-vector assertions when the private repository is cloned alone.
- **DEPENDENCIES:** Published private `f0b3181`, the separately approved public golden-vector Git bytes (41,713 bytes, SHA-256 `ce04e7a8602ef59488c774d3971617f25e9230273653b39b089ad9df280dfb36`), and one private test owner.
- **OWNERSHIP:** Continuing Luna ticket producer workstream, restricted to the private server test, fixture, and exact-path fixture LF rule.
- **FILES / MODULES LIKELY INVOLVED:** `ticket-workspace/packages/cli/test/ticket-workspace-resident-server-v1.test.ts`, `ticket-workspace/packages/cli/test/fixtures/resident-ticket-transport-v1-golden-vectors.json`, and `ticket-workspace/.gitattributes`.
- **INPUT CONTRACT:** Exact approved vector bytes; tests must not resolve any path outside the private repository.
- **OUTPUT CONTRACT:** Tracked private fixture with verified hash and a local test path; no change to production protocol, Orca code, or approved public vector bytes.
- **CONSTRAINTS:** Keep all golden handshake/frame assertions and fixture semantics. Do not infer production readiness from focused tests.
- **DO_NOT_TOUCH:** Private `packages/cli/src/`, Orca `src/`, public vectors, main/preload IPC, endpoint/setup/effects.
- **ACCEPTANCE CRITERIA:** A standalone private source checkout contains every byte needed by the resident tests; fixture hash equals the approved public blob; all 23 focused tests and CLI typecheck pass without an enclosing Orca checkout. These criteria passed with local dependency junctions. Clean dependency installation and the current-pin full CLI replay remain separate gates.
- **VERIFICATION:** Exact fixture SHA-256 and staged-blob equality, scoped LF attribute, bounded isolated-source-checkout test replay, focused resident suite and CLI typecheck; fresh Sol approved changed paths and provenance.
- **PARALLELIZATION SAFETY:** Independent of Orca runtime/UI and production contract research; serialize with any private CLI test-fixture or producer-artifact edits.
- **POTENTIAL CONFLICTS:** Nested tests masked the historical missing fixture. The 157-blob manifest covers `31b3768`, not current `f7d66d1`; do not treat isolated-source tests with dependency junctions as a clean-install or full-suite proof.

### TW-06T — Establish the resident no-start ticket transport

- **STATUS:** Orca runtime/WSL survey, exact logical-v1 protocol/crypto vectors and injected fake-duplex client passed independent Sol review on 2026-09-30. The client passed 30 focused tests, changed-code quality, Node typecheck with an 8 GiB heap, and cross-peer conformance. The user approved its public PR publication; code HEAD `a29bc2169` passed PR CI with 31 successes and eight skips. Pinned WSL stdio remains an unselected production endpoint candidate; the WSL hook relay cannot supervise ticket reads.
- **GOAL:** Establish and own an authenticated resident ticket endpoint/connection lifecycle during explicit setup, then provide a no-start transport from Orca main during snapshot reads.
- **DEPENDENCIES:** TW-00 published the strict navigator snapshot DTO/corpus; M0 host ownership seams. TW-06P and TW-06T injected code passed independent review against logical-v1 schemas, projection policy and golden vectors. Real endpoint, credential handoff, ticket-ID host mapping, TW-M1P verified Linux base runtime/profile and a pinned TW-06P service artifact must all precede production setup.
- **OWNERSHIP:** One Orca main transport worker after cross-repository protocol ownership is fixed.
- **FILES / MODULES LIKELY INVOLVED:** Orca main local integration service and resident client; the ticket-domain producer belongs to TW-06P.
- **INPUT CONTRACT:** Configured coordinator/authority/profile binding, explicit setup authority, and a separately reviewed versioned endpoint protocol; no resident endpoint or production snapshot producer is present in the pinned source.
- **OUTPUT CONTRACT:** Owned resident endpoint/connection lifecycle plus bounded snapshot byte stream with authenticated source/provenance, or unavailable during disconnected reads.
- **CONSTRAINTS:** Snapshot reads never launch WSL, CLI, or coordinator; connection setup requires its separate explicit authority. No path/secret exposure, new state owner, or silent local fallback.
- **DO_NOT_TOUCH:** Main/preload snapshot cache and renderer UI until TW-06 owns that layer.
- **ACCEPTANCE CRITERIA:** Disconnected, wrong authority/profile, oversized, partial, or untrusted endpoint fails closed without starting a process. Reads call no WSL command, including a running-distro query; an absent/dead authenticated lease returns unavailable. A candidate stdio client must explicitly pipe/drain streams, own byte limits, timeout/cancellation settlement, child retirement and quit teardown rather than assuming `spawnProcess` supplies them.
- **VERIFICATION:** No-start, auth binding, stream bound, cancellation and reconnect tests; independent transport review.
- **PARALLELIZATION SAFETY:** Serial with TW-06 main handler integration; fixture-only schema work can proceed after TW-00 in disjoint files.
- **POTENTIAL CONFLICTS:** The injected transport and producer are not wired to a production endpoint. The CLI `status` report is a different one-shot DTO and cannot satisfy the no-start snapshot read. Authenticated response correlation alone does not establish a fresh source observation.

### TW-06F — Complete the original M4 fixture snapshot boundary

- **STATUS:** Main/preload fixture bridge and bounded presentation implemented and approved by independent integration review; actual bundled preload semantic corpus passed. TW-07F subsequently completed Projects/Tickets UI fallback and click navigation integration.
- **GOAL:** Implement the original M4 read-only fixture service through Orca main/preload and a reusable Orca presentation boundary. Live resident transport remains a separate later integration.
- **DEPENDENCIES:** TW-00C full semantic runtime contract and TW-00F reviewed fixture IPC/corpus delivery; M0 Orca boundary ownership. It does not depend on TW-06P or TW-06T.
- **OWNERSHIP:** One continuing Luna main/preload workstream, exclusive to new fixture service, IPC/preload registration, Orca presentation projection and focused tests; no TW-02F runtime selector/binder or renderer tree ownership.
- **FILES / MODULES LIKELY INVOLVED:** Orca main ticket fixture service and canonical snapshot accessor, bounded IPC handler, preload bridge, targetless presentation projection and focused contract tests. TW-02F owns separate runtime selection/binding modules.
- **INPUT CONTRACT:** The exact approved source-pinned fixture archive and six files, strict zero-argument IPC request, and delivered full ticket-owned `parseTicketNavigatorSnapshotUtf8V1` / `validateTicketNavigatorSnapshotV1` runtime validator in main and sandboxed preload. The approved fixture-envelope validator returns status/provenance but not the parsed snapshot, so the presentation projection must use the validated canonical payload separately.
- **OUTPUT CONTRACT:** Bounded Orca-owned presentation result `{ status: 'fixture', provenance: { kind: 'fixture', snapshotCaseId, snapshotRevision }, orcaMatch: { status: 'not-evaluated' }, tickets }`, otherwise Tickets-only unavailable. Each ticket row is `{ ticketKey, label, lifecycle, availability, coordinatorTargetDeclared, workspaces }`; each workspace row is `{ repositoryId, label, role, actualState, branch? }`. `coordinatorTargetDeclared` is only a boolean projected from the ticket-declared reference and cannot imply Orca coordinator presence or match; `availability` and `actualState` are ticket-reported display data only. Main also offers an internal accessor that reloads its own canonically validated active fixture by `snapshotRevision` or returns unavailable; TW-02F receives it as an injected callback for selector-only click rebind. No ticket `actions`, `target`, `coordinatorTarget`, producer `referenceState`, raw paths/tokens or copied agent/Run authority enter the renderer result. It makes no live `current` or owner-match claim.
- **CONSTRAINTS:** No WSL/CLI/process start on read; no path/token exposure in the fixture presentation; reuse existing runtime clients and preload bridges rather than wrapping their lifecycles in ticket IPC. Keep fixtures isolated from live cache and authority. A fixture must never become a live snapshot by changing presentation metadata.
- **DO_NOT_TOUCH:** Seven approved public files, TW-02F runtime mapping/binder, resident transport, production provider, existing Projects state, renderer tree and mutation paths.
- **ACCEPTANCE CRITERIA:** Original M4 accepts a fixture snapshot safely without affecting Projects. Main and preload enforce the full semantic corpus, ticket/workspace/string/byte limits, invalid-response isolation, cache partition, fixture provenance, timeout, service restart, integration disable, and late-response discard. The targetless rows above support TW-07F hierarchy while omitting all ticket actions and owner claims; main's accessor rejects an unknown or changed revision and never trusts renderer snapshot/ref/ID bytes. Existing Orca lifecycle authority remains untouched.
- **VERIFICATION:** Main/preload fixture and failure corpus tests, timeout/restart/disable/late-response tests, actual Orca preload build/parity, Projects regression, changed-code quality and independent review.
- **PARALLELIZATION SAFETY:** Safe beside TW-02F in disjoint main/preload/projection versus runtime binding files under the frozen canonical input and injected accessor contract. TW-07F performs the navigation join serially after both; live TW-06P/TW-06T require their own protocol freeze.
- **POTENTIAL CONFLICTS:** The ignored IPC proposal assumes generated Zod validation alone, which misses runtime semantic checks; shared main handler files will later be touched by TW-06 live cutover.

### TW-06 — Cut the validated snapshot boundary over to live ticket state

- **STATUS:** Read-only source survey and independent Sol review confirmed fixture/cache reuse limits and found additional producer-policy, unsupported-result and overlay gates. No live cache, overlay, or handler is implemented.
- **GOAL:** Transport and validate one bounded ticket snapshot across main/preload with no new state owner.
- **DEPENDENCIES:** TW-06F provides the accepted fixture boundary; TW-06P delivers the producer and TW-06T delivers the resident no-start transport. The snapshot core may follow that protocol; publication of any live `matched` Orca overlay additionally waits for TW-02L authenticated exact owner evidence. This edge does not make TW-02L depend on the overlay.
- **OWNERSHIP:** One Orca main/preload worker; renderer is read-only consumer in TW-07.
- **FILES / MODULES LIKELY INVOLVED:** Shared Zod schema, main IPC handler/cache, preload bridge, ticket snapshot boundary fixtures.
- **INPUT CONTRACT:** Accepted fixture boundary, authenticated resident transport, immutable canonical ticket snapshot, profile/authority/epoch provenance, and a separate Orca-owned match result tied to `snapshotRevision` when owner status is shown.
- **OUTPUT CONTRACT:** Proposed `current`, `last-verified-stale`, or Tickets-only `unavailable` result under the 2 MiB UTF-8 cap; decide how whole-snapshot `unsupported` from ticket admission maps to the live IPC before freezing the result union. Any Orca overlay is a separate bounded result tied to the exact snapshot revision and full source tuple.
- **CONSTRAINTS:** No distro/CLI startup, no raw path/token exposure, main and preload both validate; stale snapshots disable actions.
- **DO_NOT_TOUCH:** Existing Projects/runtime state, renderer ownership, mutation authority, unnegotiated remote wire opcodes.
- **ACCEPTANCE CRITERIA:** Full ticket-owned runtime semantic validation in main and preload, including duplicate identities and canonical digest; an additional negotiated initial-producer policy rejects schema-valid producer `matched` or action rows. Separate bounded Orca overlay validation checks exact revision/source tuple and never treats preload shape validation as owner proof. Freeze a cache partition with execution host, full profile, authority and epoch, plus durable high-water/rebind/update rules, source-clock-to-host-monotonic currentness, stale display lifetime and failure quarantine. A stale snapshot never carries a live matched overlay. Fixture parity, invalid response isolation, byte bounds, mixed unsupported policy, older-peer behavior, and no focus/state disruption are covered. A generated JSON Schema alone is insufficient.
- **VERIFICATION:** Main/preload contract tests, generated fixture parity, changed-code quality and mixed-version review.
- **PARALLELIZATION SAFETY:** Live main handler integration is serial after TW-06F, TW-06P and TW-06T; no concurrent edits to fixture/main handler files.
- **POTENTIAL CONFLICTS:** The live cutover must preserve fixture-path tests without promoting fixture evidence to live authority.

### TW-07F — Complete the original M5 read-only fixture tree

- **STATUS:** Complete as the original fixture-backed M5 checkpoint, including same-head PR CI at `fa4e622f4`. The selector-only main/preload bridge and renderer Phase A/B passed separate fresh Sol reviews. Phase A covers full virtualized rows, Projects fallback, accessible panels/focus, mutation entry guards, and supported tinted contrast. Phase B sends only the three selectors, rebinds on click, and activates only the correlated Orca ID with fixed local host; the shipped fixture remains an owner-mismatch negative. Focused tests passed 17/17, `pnpm tc` and changed-quality/design gates passed, and hidden Electron CDP E2E passed 1/1 with a screenshot and no visible window. Live status, actions and public `clear` remain outside this checkpoint.
- **GOAL:** Deliver Projects/Tickets switching, ticket hierarchy and preview from the accepted fixture boundary, with mutation actions hidden and existing Orca navigation/status authorities reused.
- **DEPENDENCIES:** TW-06F fixture renderer DTO and accepted M4 boundary; TW-02F fixture exact Orca owner mapping/rebind for workspace activation. No live producer or resident transport prerequisite.
- **OWNERSHIP:** The continuing main/preload Luna workstream owns the narrow selector-only IPC, runtime registration and preload validation first. One renderer Luna workstream then owns the workspaces-body Projects/Tickets mode, tree/preview and navigation. The same renderer workstream retains related follow-on work; no two workers edit the same sidebar or IPC seam concurrently.
- **FILES / MODULES LIKELY INVOLVED:** `src/main/ipc/`, `src/main/startup/main-process-ipc-bootstrap.ts`, the existing runtime owner-binding seam, `src/preload/api/`, `src/renderer/src/components/sidebar/`, existing activation and agent-status readers, and focused tests. Reuse the current sidebar virtualization/focus patterns; its worktree viewport includes drag/actions and must not receive ticket rows directly.
- **INPUT CONTRACT:** TW-06F's targetless, action-free fixture presentation or bounded unavailable result. Match and click requests contain exactly `{ snapshotRevision, ticketKey, repositoryId }`; main reloads its own validated fixture and uses the existing Orca binder. The preload validates bounded exact-key Orca-owned match and click responses; renderer-provided snapshot, target, path, worktree ID or binder token is rejected. Run data comes only from Orca's orchestration authority, and agent status only from the execution host's single hook-server status store; either requires an exact Orca-owned association.
- **OUTPUT CONTRACT:** A bounded separate `matched` / `unavailable` Orca result keyed by the three selectors; a click returns a path-encoding Orca-attested worktree ID only after fresh main-side rebind and only through the click response. The UI shows a read-only Projects/Tickets submode inside the existing workspaces sidebar body, with historical-fixture, loading, empty and unavailable states. Unavailable, disabled or error results fall back to Projects; a changed revision fails matching/navigation without clock-judging historical fixture timestamps. No mutation action is displayed or enabled.
- **CONSTRAINTS:** Follow `docs/STYLEGUIDE.md`, tokens/primitives, platform keyboard rules and the single agent-status store. The fixture carries `coordinatorTargetDeclared` only; show a declared coordinator placeholder, never a verified Run or agent. Show agent rows only when Orca provides an exact association, otherwise unavailable. The fixture has no issue/MR identifiers, so do not fabricate links. Preserve Projects behavior, focus and reveal actions.
- **DO_NOT_TOUCH:** Resident/live transport, ticket ledger, effect/action routing, root authority and the approved public fixture bytes. The selector-only match/click path is the only shared IPC/preload addition in this packet.
- **ACCEPTANCE CRITERIA:** First freeze the exact separate match/click response shapes and fail-closed IPC boundary. Then register them in main/preload with no renderer authority input beyond the three selectors; preload enforces exact response keys and bounds for both, and a path-encoding ID appears only in the click response after main-side rebind. The shipped `snapshot.full` remains a negative owner-match and navigation case. Positive end-to-end navigation injects both presentation and main accessor through a test-only seam at the same recomputed synthetic revision; it never changes the approved public fixture or production revision pin. Next add the Projects/Tickets submode and read-only ticket/workspace preview using established virtualizer, row focus, keyboard and scroll patterns. Tickets also closes existing Projects mutation entry points: native folder drop, Workspace board trigger/drawer and any already-open board, and the Setup Script prompt; a drop invalidated by entering Tickets cannot later open Add Project after returning to Projects. Projects restores its ordinary controls. A failed or changed binding leaves activation unavailable. On click, main rebinds and the renderer passes only its returned ID plus fixed `executionHostId: 'local'` to `activateAndRevealWorkspace`. Any workspace reveal while Tickets is showing switches to Projects before replaying the reveal, including store-initiated reveal. Disabled/error input also returns to Projects. Narrow widths, long names, accessible labels, empty/unavailable/historical fixture states and Projects regressions are covered. No ticket-provided status becomes Orca `matched`, no mutation action appears, and no issue/MR or agent association is invented.
- **VERIFICATION:** Focused IPC/preload and renderer/navigation/state tests, full typecheck, `pnpm run check:code-quality:changed`, design-system gate, actual bundled-preload parity, Projects/reveal regressions and hidden-renderer Playwright CDP screenshots with `ORCA_BACKGROUND_LAUNCH=1`.
- **PARALLELIZATION SAFETY:** Serial order: interface freeze → continuing main/preload Luna IPC join → renderer Luna tree/preview → same renderer Luna exact navigation/status association → independent Sol M5 review. TW-07 live cutover and other sidebar edits may not overlap. Do not spawn the renderer worker until the IPC output contract is stable and its work is ready.
- **POTENTIAL CONFLICTS:** Sidebar mode/reveal behavior and style enforcement; live statuses cannot be inferred from fixture data. The current shipped fixture cannot demonstrate positive navigation in the app.

### TW-07 — Cut the read-only Tickets tree over to live snapshots

- **GOAL:** Present ticket hierarchy and workspace status from a validated snapshot without owning canonical state.
- **DEPENDENCIES:** TW-07F accepted fixture tree, TW-06 live validated boundary, and TW-02L authenticated Orca owner evidence before live workspace status is shown.
- **OWNERSHIP:** Renderer worker with exclusive sidebar/ticket-view files.
- **FILES / MODULES LIKELY INVOLVED:** Existing sidebar tree/virtualization, ticket preview components, renderer snapshot projection.
- **INPUT CONTRACT:** Accepted fixture renderer path plus preload-validated live current/stale/unavailable renderer DTO.
- **OUTPUT CONTRACT:** Accessible read-only Tickets tree and preview; existing Projects mode remains available.
- **CONSTRAINTS:** Follow `docs/STYLEGUIDE.md`, existing tokens/primitives, keyboard/platform rules, single agent-status store.
- **DO_NOT_TOUCH:** Main transport/schema, ticket ledger, destructive actions, focus-changing prune behavior.
- **ACCEPTANCE CRITERIA:** Bounded trees, loading/failure states, stable selection/focus, stale actions disabled, Projects regression absent. A retained `WorkspaceRef` on a pruning/pruned ticket or excluded repository cannot become a live matched/actionable target merely because Orca's exact local binder finds it; apply the frozen TW-06P/T owner-join disposition policy.
- **VERIFICATION:** Renderer tests and hidden-renderer CDP screenshots with `ORCA_BACKGROUND_LAUNCH=1`; design-system gate.
- **PARALLELIZATION SAFETY:** Serial with TW-07F sidebar files; starts after TW-06 live contract freeze.
- **POTENTIAL CONFLICTS:** Shared sidebar state and snapshot DTO churn.

### TW-08 — Connect existing workspace and agent actions

- **STATUS:** Read-only Orca action/receipt audit and the [action/authority matrix](./action-authority-matrix.md) passed fresh Sol review after corrections. The matrix is a contract survey; no ticket effect gateway or action code is implemented.
- **GOAL:** Expose ticket actions through Orca's existing worktree, agent, Run, and confirmation authorities.
- **DEPENDENCIES:** Completed M3 coordinator foundation, TW-05G strict root gateway, TW-02L exact live owner evidence, TW-06 live current snapshot boundary, and TW-07 live read-only cutover; separately proven per-action preview/authority contracts. The TW-07F fixture tree supplies no action authority.
- **OWNERSHIP:** One integration worker per agreed action seam, with Orchestrator controlling shared contracts.
- **FILES / MODULES LIKELY INVOLVED:** Orca orchestration commands, worktree action routing, ticket action descriptors, renderer confirmation UI.
- **INPUT CONTRACT:** Live current validated ticket snapshot, exact target and execution-host reattestation, root gateway authority, explicit user confirmation for effects.
- **OUTPUT CONTRACT:** Existing Orca mutation receipts and ticket correlation; no copied lifecycle state.
- **CONSTRAINTS:** Preserve branch, folder, artifacts and focus; SSH/folder behavior cannot regress even though Tickets MVP is local. Ticket worktree removal sets `preserveBranchOnDelete: true` on the target host's authoritative metadata before invoking Orca removal. The ordinary boolean confirmation and its skip preference are UX precedents, not ticket authority; a ticket effect needs target-bound one-use confirmation. Require an attested host even where an older RPC permits an omitted host, and do not inherit sidebar deletion's active-worktree focus change.
- **DO_NOT_TOUCH:** Parallel worktree manager, message bus, agent-status store, unowned external resources.
- **ACCEPTANCE CRITERIA:** Existing actions work from ticket context with idempotent replay. Removal verifies same-host exact ref HEAD, registration, and path read-back; archive, Orca removal, and external cleanup have independent blocked/unverifiable retry verdicts.
- **VERIFICATION:** Existing Orca action tests, fault/replay matrix, hidden UI E2E where applicable.
- **PARALLELIZATION SAFETY:** A read-only action/authority matrix can run beside TW-07F and TW-06P/T contract work. TW-05G ratifies root/fence cells, TW-02L ratifies exact host/target cells, and TW-04B ratifies adapter cells. Implementation is serial with the shared action DTO and confirmation UI; distinct actions may split only after contract freeze.
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

## Current execution checkpoint and next allocation

1. **Verified foundation:** TW-01 local-native owner capture, TW-02F fixture owner binding, TW-06F main/preload fixture boundary, TW-07F fixture UI/navigation and private TW-04A common resource-universe contract are implemented and independently reviewed. TW-07F also passed a hidden Electron CDP E2E screenshot locally. Orca commit `fa4e622f4` pins private source `54477c2`; [PR #1](https://github.com/lighteko/orca/pull/1) passed 31 checks with eight skipped and zero failures at that same head.
2. **Next critical path:** The logical-v1 P1–P8 injected protocol and disjoint TW-06P/T code passed independent review and local cross-peer conformance. The shipped owner-mismatch fixture remains negative; the recomputed synthetic fixture proves the positive click through real main/preload handlers. Live TW-06/TW-07 still require production endpoint/key/host/artifact proofs, currentness rules and TW-02L authenticated owner evidence, not fixture promotion.
3. **Next allocation gate:** The injected TW-06P/T wave passed local review, private `f0b3181` published the producer, and private `f7d66d1` closed its test-fixture source-path gap. The approved new-vector public bytes and Orca packet passed PR CI at historical code commit `a29bc2169`; the current parent gitlink advancement requires its own CI result. Production setup waits for verified TW-M1P base runtime/profile, a pinned TW-06P service artifact and production P1–P8 proofs. The completed TW-07F sidebar remains single-owner for any future live cutover.
4. **Still gated:** TW-06P/TW-06T production producer/transport and TW-05/TW-05G coordinator/root authority need their own contract gates. TW-02L authenticated owner evidence waits for live source authority; TW-03 production `plan`, TW-04B/C production adapters/role changes, TW-06/TW-07 live cutovers, TW-08 effects, TW-09 integration and TW-10 release retain their DAG dependencies. A fixture cannot claim live `current`, mutation authority or public `clear`.

## Full parallel frontier at this checkpoint

The accepted fixture M5 is a completed prerequisite. The nine rows below name preparation workstreams that can overlap when their document and source ownership is separate, not simultaneous code authorization. Within each row, its stated gates and serial order still apply.

| Workstream | Current safe work | Implementation gate and ownership boundary |
| --- | --- | --- |
| TW-06P/TW-06T live snapshot | The logical-v1 injected protocol, private producer and Orca fake-duplex client passed independent review and local cross-peer tests. Production endpoint/authentication, identity, target/SSH, high-water and clock proofs remain to settle. | No further injected implementation allocation is needed. Production setup waits for TW-M1P verified base runtime/profile, the pinned TW-06P service artifact and the applicable production proofs. |
| TW-02L live owner design | A dedicated Luna workstream can specify exact source tuple/WorkspaceRef to Orca owner-join, completeness and source-currentness handoff beside the protocol work. | Live owner code waits for authenticated TW-06P/T evidence; fixture TW-02F does not establish currentness. Do not edit TW-07F sidebar or claim public `clear`. |
| TW-08 action authority | The continuing Luna action workstream completed the read-only action matrix and fresh Sol approved its corrected source claims. Owners can now ratify their separate cells beside protocol and other contract work. | No action/DTO/IPC/UI/effect code yet. TW-05G ratifies root/confirmation cells, TW-02L exact owner cells, and TW-04B only adapter-dependent cells; M3 and live TW-06/TW-07 gate implementation. |
| TW-05 coordinator and TW-05G authority | Source audit and decision matrix are complete; owner ratification of folder identity, documents, migration, enrollment, strict Run caller and reset fence can proceed separately. | TW-05 code waits for those decisions. TW-05G effect-gateway code waits for durable TW-05 correlation and a binding-fence/token contract. Private catalog/ledger edits cannot overlap TW-06P or TW-M1P edits without a frozen interface. |
| TW-04A Docker evidence | The Docker owner can supply exact engine endpoint/route, physical identity, owner marker, complete discovery/read-back and clock evidence. The initial source survey found none of that production evidence. | Typed production fixtures/adapter wait for owner-ratified Docker evidence; TW-04B effects additionally wait for TW-05G. No live resource mutation in evidence collection. |
| TW-04A IIS evidence | The IIS owner can independently supply Windows configuration authority/route, site and pool physical identity, owner marker, complete discovery/read-back and clock evidence. | Typed production fixtures/adapter wait for owner-ratified IIS evidence; TW-04B effects additionally wait for TW-05G. No live resource mutation in evidence collection. |
| TW-03 other owner sources | The completed source survey leaves independent owner contracts for exact agent host/workspace association, test-lease scope, ownership/host census and source clock transfer. | The final ticket plan provider waits for TW-02L, TW-04B and every required source contract. No second status store or public `clear`. |
| TW-M1P profile delivery | The reviewed base-runtime/profile proposal is ready for publisher, channel, trust-root, host-binding and target decisions; isolated Node/npm closure replay may run when a disposable Linux harness exists. | Production install/update/rollback code remains gated. TW-06T production setup consumes this verified base together with the separate TW-06P service artifact. |
| TW-06 live cache/overlay contract | The source survey and independent Sol review are complete; the Orchestrator can draft cache partition, high-water/restart, clock/current/stale, mixed unsupported, producer-policy and overlay rules beside other contract work. | Freeze the overlapping rules together with TW-06P/T's source/transport protocol. Live cache/IPC code waits for TW-06P/T; matched-overlay publication additionally waits for TW-02L. Keep the reviewed TW-07F fixture IPC/sidebar boundary intact. TW-09/TW-10 remain downstream. |

These nine rows record the complete audited **production preparation** frontier, not nine code-ready feature workers. TW-07F fixture M5 is accepted and CI-verified, the TW-08 matrix passed review, and the logical-v1 TW-06P/T injected protocol and implementation passed independent review. Production P1–P8 proofs remain open. TW-02L, TW-05, TW-04A, TW-03 and TW-M1P need their named owner evidence or delivery choices before production code. Docker and IIS owner evidence can be collected independently within TW-04A. TW-06P-F1 is complete at private `f7d66d1`; a full private CLI replay should target that current pin in a disposable Linux/ext4 environment. TW-06T production setup remains downstream of the verified base runtime/profile and producer service artifact.

The 2026-09-30 post-publication fresh Sol audit found **zero additional production feature workers** ready; its one bounded code-ready verification fix, TW-06P-F1, is complete. The next production review gate is a setup packet covering TW-M1P target/publisher/receipt, TW-06P service manifest/entrypoint, and TW-06T endpoint/key/host proofs, in parallel with a P3/P6 high-water/currentness/IPC contract and a P4 same-read TW-02L owner-admission contract. Contract and evidence research may overlap across the nine rows; private catalog/profile/ledger edits, Orca main handler integration, fixture sidebar IPC, and action/effect authority remain serialized at their shared ownership seams.
