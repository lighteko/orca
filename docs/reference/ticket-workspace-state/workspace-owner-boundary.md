# TW-02F / TW-02L — Ticket `WorkspaceRef` to Orca owner boundary

Status: fixture TW-02F owner binding and TW-06F main/preload consumption are implemented and reviewed. TW-02L-I injected owner composition passed fresh Sol 6.1 code review and 47 focused tests; actual owner/source integration is in progress. Production registration still requires the separately gated authenticated service, durable currentness and host/setup evidence.
Scope: one exact local-native Git worktree identity match from a validated fixture; TW-01 Git status capture is a later live composition. This contract does not expose a public `clear` verdict.

## Confirmed facts

- **FACT — Ticket owns the source contract.** The pinned ticket source is a separate private workspace. Its contracts package exports the strict catalog, navigator snapshot, `WorkspaceRefV1`, fixture corpus, and generated JSON Schema artifact. Its README says Orca consumes released protocol artifacts and must not import ticket lifecycle implementation. See [`ticket-workspace-common-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-workspace-common-v1.ts#L106), [`ticket-navigator-snapshot-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-navigator-snapshot-v1.ts#L76), [`ticket-contract-artifact-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-contract-artifact-v1.ts#L15), [`packages/contracts/package.json`](../../../ticket-workspace/packages/contracts/package.json#L10), and [`ticket-workspace/README.md`](../../../ticket-workspace/README.md#L5).
- **FACT — Existing snapshot has the required ticket-side fields.** `TicketNavigatorSnapshotV1.source` contains `authorityId`, `ledgerEpoch`, `ledgerRevision`, `projectionSequence`, and `catalogDigest`; each ticket has `ticketKey`; each workspace has `repositoryId` and optional `target: WorkspaceRefV1`. The snapshot is strict, digest-validated, and capped at 2 MiB UTF-8 by the ticket validator. See [`ticket-navigator-snapshot-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-navigator-snapshot-v1.ts#L47) and [`ticket-contract-validator-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-contract-validator-v1.ts#L207).
- **FACT — `git-worktree` maps exactly to Orca's five request fields.** Ticket `WorkspaceRefV1` has `executionHostId`, `identityKey`, `instanceId`, `worktreeId`, and `repoId`; Orca's `WorktreeCatalogBindingRequest` has `executionHostId`, `identityKey`, `instanceId`, `worktreeId`, and `repositoryId`. `repoId` must equal the ticket repository record's `repositoryId` before mapping. Ticket validation enforces unique ticket and repository IDs, but does not enforce that cross-field equality. See [`ticket-workspace-common-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-workspace-common-v1.ts#L106), [`ticket-contract-validator-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-contract-validator-v1.ts#L143), and [`worktree-catalog-binding-types.ts`](../../../src/main/persistence/loading-store/worktree-catalog-binding-types.ts#L5).
- **FACT — Orca already owns exact runtime binding and freshness.** Its binder admits only the local execution host, resolves the current repo/worktree catalog row, checks instance and identity, reads the native Git registration before and after, and revalidates the catalog incarnation/revision. It returns an internal binding token and target. The status capture then re-attests the binding and subject, creates `observationId` and `ownerReadStartedAt` inside the Orca owner, and checks again after status and marker reads. See [`runtime-worktree-catalog-binding.ts`](../../../src/main/runtime/runtime-worktree-catalog-binding.ts#L58), [`worktree-catalog-binding-types.ts`](../../../src/main/persistence/loading-store/worktree-catalog-binding-types.ts#L13), and [`runtime-git-status-record-capture.ts`](../../../src/main/runtime/runtime-git-status-record-capture.ts#L158).
- **FACT — Live cross-repository ingress is not implemented.** Orca consumes the approved narrow snapshot contract through a local `file:` devDependency; TW-02F fixture binding and TW-06F main/preload consumption are implemented. The injected TW-06P/T producer and client do not provide a production service artifact, authenticated resident endpoint, or live owner composition. See [`project-state.md`](./project-state.md) and [`task-graph.md`](./task-graph.md).

## Boundary contract

| Data                                                                                                                                 | Owner                                | Required rule                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket provenance: `authorityId`, `ledgerEpoch`, `ledgerRevision`, `catalogDigest` / `snapshotRevision`, `ticketKey`, `repositoryId` | Ticket contract and ticket authority | Take these from one strictly validated snapshot. Fixture tests use explicit fixture provenance; production live admission additionally requires an authenticated current source. Select exactly one ticket and repository row, and preserve the tuple around any observation.                             |
| `WorkspaceRefV1`                                                                                                                     | Ticket contract                      | Require a present schema-version-1 `git-worktree` ref and `repositoryId === workspaceRef.repoId`. Do not require producer `referenceState: 'matched'`; it is ticket-owned presentation state, not an Orca attestation. Reject folder refs, missing refs, and non-local execution-host IDs for this slice. |
| Ticket authority host                                                                                                                | Ticket source/transport              | Bind the snapshot to the configured ticket authority/profile. The ticket authority's WSL execution host and the workspace's Orca `executionHostId` are separately represented. They may denote the same host, but neither value proves or determines the other.                                           |
| Orca binding request                                                                                                                 | Orca main/runtime                    | The pure mapper constructs only `{ repositoryId, worktreeId, executionHostId, instanceId, identityKey }` from the selected ticket row/ref. No path lookup, path-derived key, or ticket-provided Orca token. The async Orca owner then resolves it through the exact catalog binder.                       |
| Orca workspace match result                                                                                                          | Orca main/runtime                    | Produce a separate Orca-owned `matched` / `unavailable` result only after exact target attestation. Tie it to the immutable input `snapshotRevision`, `ticketKey`, and `repositoryId`. Do not write it into or reinterpret ticket `referenceState`; do not include the internal binding token.            |
| Orca binding token, Git route, registration identity, effective subject                                                              | Orca main/runtime                    | Keep owner-internal. Re-resolve the exact current binding and perform the existing pre/post subject and registration checks for every admitted read. Do not serialize the binding token or accept a caller-supplied token.                                                                                |
| Observation identity and read-start time                                                                                             | Orca capture owner                   | Create once inside the admitted Orca capture. The caller cannot supply, refresh, or replace them. Carry them only as immutable owner provenance if a separately reviewed consumer DTO needs them; they do not authorize a mutation.                                                                       |

### Pure selection and five-field mapping

This synchronous projection is independently testable with an injected snapshot that has already passed the full ticket-owned validator. It does not authenticate the source, attest an Orca workspace, perform I/O, or authorize live evidence. TW-02F adds a separate asynchronous exact-binding step after this projection.

1. Select exactly one ticket and repository row by `ticketKey` and `repositoryId`; require a present `target` with `kind: 'git-worktree'` and schema version 1.
2. Require `repositoryId === target.repoId`, the exact Orca local execution-host ID, and all five mapping values. Do not require `referenceState: 'matched'`: that value belongs to the ticket producer and is not an Orca claim. A ticket producer may report `unavailable` for a local reference claim or `unsupported` for SSH; Orca produces its own result after it attests the supplied target. Folder, missing, ambiguous, or non-local refs map to unavailable.
3. Return an immutable mapping attempt containing the source `snapshotRevision`, ticket provenance tuple, selected ticket/repository/ref, and the five-field `WorktreeCatalogBindingRequest`. Do not include a path, Orca binding token, observation ID, or owner timestamp.

### Fixture exact binding and navigation

The bounded TW-02F allocation accepts only an injected fixture snapshot that main has parsed with `parseTicketNavigatorSnapshotUtf8V1` or validated with `validateTicketNavigatorSnapshotV1`. It runs the pure mapper, then `RuntimeWorktreeCatalogBindingCommands.resolveExactLocalNativeGitTarget` and produces a separate `matched` / `unavailable` result tied to the input `snapshotRevision`, `ticketKey`, and `repositoryId`. A match proves only the Orca catalog/native target at that read. Keep catalog tokens, registration evidence and ticket target data in main; expose no path or ticket-provided target through TW-06F's renderer presentation DTO. For navigation, the renderer sends only `{ snapshotRevision, ticketKey, repositoryId }`; TW-06F's main-owned accessor reloads its own canonically validated active fixture and checks the revision before TW-02F rebinds. The request never accepts a renderer snapshot, ref or worktree ID. Only then may main return the freshly attested existing Orca-owned worktree ID to the established `activateAndRevealWorkspace` path. That ID encodes a path under Orca's current ID scheme, so it is never taken directly from ticket input. TW-07F wires the final click request serially after both workstreams. A changed Orca binding or revision is stale for this fixture match; historical fixture `generatedAt`/`staleAfter` values are not compared to Orca wall time or promoted to live currentness.

The approved `snapshot.full` fixture is a positive presentation case but a negative owner-match case: its workspace `repositoryId` is `common-api` while `target.repoId` is `repo-1`. TW-02F rejects that relation and supplies a separate Orca-owned positive integration vector with a recomputed canonical digest. The seven approved public files remain byte-exact.

## TW-02L same-read eligibility and currentness contract

**Decision:** Use target presence in a TW-06-admitted `TicketNavigatorSnapshotV1` as same-read eligibility evidence. Add no eligibility DTO, ticket schema field, or protocol capability. The target is projected from the exact validated catalog read; another eligibility object would duplicate that source fact.

The v1 snapshot omits catalog `disposition` and repository `transition`. The pinned P4 projector keeps display rows but omits all targets for non-open, tearing-down, or removed tickets; otherwise it omits a repository target for excluded, absent, removing, or transition-to-excluded rows. Other transitions retain the current `workspaceRef`. P5 classifies opaque host IDs before suppression, and any unsupported ticket makes the whole snapshot unsupported. See [catalog contract](../../../ticket-workspace/packages/contracts/src/ticket-workspace-catalog-v1.ts), [snapshot contract](../../../ticket-workspace/packages/contracts/src/ticket-navigator-snapshot-v1.ts), [resident projector](../../../ticket-workspace/packages/cli/src/ticket-workspace-resident-projection-v1.ts), [projector tests](../../../ticket-workspace/packages/cli/test/ticket-workspace-resident-projection-v1.test.ts), and [P4/P5 freeze](./resident-ticket-transport.md#reviewed-logical-v1-freeze-for-injected-components).

A target is eligible only after TW-06 has authenticated the expected producer and admitted its frozen P4/P5 policy. For each read, require: current TW-06 admission; no unsupported ticket anywhere in the snapshot; exactly one selected ticket and repository; ticket `availability === 'available'`; ticket lifecycle not tearing-down/removed; a present schema-v1 `git-worktree` target with local execution host and `target.repoId === workspace.repositoryId`; workspace role not excluded; and state not absent/removing. Missing refs, folders, wrong hosts, duplicates, mismatch, or suppressed targets are unavailable. Ignore producer `referenceState` (P4 intentionally leaves eligible local refs `unavailable`); do not require `matched` or blanket-reject a pending non-excluded transition with a preserved current ref. The pinned snapshot enum is `absent | provisioning | ready | removing | degraded | dirty`; pending transitions have no separate `transitioning` value or exposed `transition.targetRole`.

### Frozen injected port and deadlines

TW-02L consumes one already connected resident client through the shared main-only port in [`ticket-workspace-resident-source-port.ts`](../../../src/main/ticket-workspace/ticket-workspace-resident-source-port.ts). The port contract is:

```ts
declare const ticketWorkspaceCurrentnessTokenBrand: unique symbol
export type TicketWorkspaceCurrentnessToken = Readonly<{
  readonly [ticketWorkspaceCurrentnessTokenBrand]: true
}>
export type CurrentTicketOwnerRead = Readonly<{
  snapshot: TicketNavigatorSnapshotV1
  evidence: Readonly<{
    binding: TicketResidentBinding
    ledgerEpoch: string
    connectionIncarnation: string
    readStartedAtMonotonicMs: number
    source: TicketNavigatorSnapshotV1['source']
    currentnessToken: TicketWorkspaceCurrentnessToken
  }>
}>
export type TicketWorkspaceOwnerSourcePort = Readonly<{
  readCurrentSnapshot(
    signal: AbortSignal,
    deadlineBudgetMs: number
  ): Promise<CurrentTicketOwnerRead | null>
  isCurrent(read: CurrentTicketOwnerRead): boolean
  getDisplayedBaseline(snapshotRevision: string): TicketNavigatorSnapshotV1 | null
}>
```

For a selected row, the owner module derives this private source-bound evidence shape; it is not serialized:

```ts
type TicketWorkspaceOwnerEligibilityEvidence = Readonly<{
  status: 'eligible'
  snapshotRevision: string
  source: TicketNavigatorSnapshotV1['source']
  ticketKey: string
  repositoryId: string
  workspaceRef: WorkspaceRefV1
  connectionIncarnation: string
  currentnessToken: TicketWorkspaceCurrentnessToken
}>
```

The port returns a read only after canonical-byte equality, full ticket semantic validation, initial-producer restrictions, P4/P5 policy, and P3/P6 current admission; `evidence.source` must equal `snapshot.source`. The eligibility evidence is derived from that exact read after the predicate above, and its source/ref/lease/token must match on every reread. `isCurrent` delegates to TW-06's same high-water/currentness owner; the token is opaque, in-memory, and never renderer-visible. `getDisplayedBaseline` is a main-owned revision lookup and returns `null` for stale, unsupported, or retired views. Every read must retain identical full profile/authority/epoch/coordinator-host/service binding and connection incarnation; workspace execution host remains a separate exact local-ref check.

Start one 30-second Orca monotonic deadline before the operation's first source read. Share the resident client's injected monotonic clock with the owner; before every read pass `floor(min(10_000, deadline - now))` plus the same abort signal. B1 preserves `readSnapshot(signal?)` and adds an optional second `deadlineBudgetMs` argument (integer 1..10,000); its existing `snapshot.read` field carries only remaining time, with no wire/schema change. Reuse one lease throughout. Ambiguous cancellation retires it; timeout, non-current token, or lease retirement returns unavailable. Source `generatedAt`/`staleAfter`, whether future or expired relative to Orca wall time, are metadata and cannot change this result.

### Owner join and click rules

1. **Match:** resolve the requested display revision from TW-06's main-owned admitted snapshot accessor; renderer input stays `{snapshotRevision, ticketKey, repositoryId}`. Fresh-read on the bound lease, apply the eligibility gate, map through the existing five-field selector, bind with `resolveExactLocalNativeGitTarget`, then fresh-read again. Match only if both reads remain current and agree on full binding, source tuple, selected ticket/repository, eligibility, and exact `WorkspaceRef`; then run `isExactLocalNativeGitBindingCurrent` and recheck currentness, abort, and deadline after that await.
2. **Status evidence:** fresh-read before bind, fresh-read after bind, run `RuntimeGitStatusRecordCaptureCommands` with the same abort signal, then fresh-read after capture. Compare all three reads; run `isExactLocalNativeGitBindingCurrent` after the third read too, then recheck currentness, abort, and deadline. This final owner revalidation catches replacement during the third source read; no fourth source read is added. Keep the `observationId` and `ownerReadStartedAt` created by TW-01. Evidence is complete only for native routes, `status.complete`, zero unsupported status records, represented count equal to raw count, complete operation markers, and no `unavailable` marker. Partial capture is incomplete/unavailable; no empty capture or marker absence produces public `clear`.
3. **Click-time rebind:** every click starts a new deadline and source reads on the authenticated lease, checks the displayed baseline against the fresh source facts/ref, resolves and rebinds the target again, then calls the existing `isExactLocalNativeGitBindingCurrent` revalidator before returning the existing Orca worktree ID. After that await, recheck abort, outer deadline, and TW-06 currentness. Owner catalog/instance/registration changes during the post-bind read fail closed. Never accept caller refs, paths, worktree IDs, prior matches, or binding tokens. Any source change, prune/suppression, stale baseline, lease change, worktree ABA/revision change, or race fails closed; no third source read or transaction lock is implied.

Compare full profile and source tuple `(authorityId, ledgerEpoch, ledgerRevision, projectionSequence, catalogDigest)`, selected ticket/repository and exact ref; exclude `generatedAt`, `staleAfter`, and `snapshotRevision`, which can change on a fresh unchanged read. Owner results stay correlated to the displayed `snapshotRevision`. P3 rejects source-order regression and equal-order/different-digest equivocation; epoch change requires explicit rebind. A final read is an observation, not a lock or mutation authority.

**Currentness owner:** the ticket producer owns fresh catalog reads and source-clock timestamps; TW-06-I checks the v1 timestamp shape and exact 60-second interval but never compares source times with Orca wall time. Arbitrary source-clock offsets do not change host-owned freshness. TW-06 main/cache owns host/profile/authority/epoch-scoped durable P3 high-water, atomic adoption, digest/regression handling and P6 host-monotonic currentness. The private currentness token expires 30 seconds after read start and is invalidated on suspend/resume, clock anomaly, lease/partition retirement, restart, or lost/corrupt high-water. Stale display cannot carry a live owner result. TW-02L owns no cache, clock conversion, or second status store.

### Minimal implementation packet

| Packet                    | Owner / files                                                                                | Acceptance                                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1 caller budget**      | TW-06T: `ticket-workspace-resident-client.ts` and focused client tests                       | Backward-compatible `readSnapshot(signal?, deadlineBudgetMs?)`; integer budget 1..10,000, one client-monotonic deadline bounds frame budget, cancellation settlement and retirement. No wire/schema change.                                                                 |
| **TW-06-I admitted read** | TW-06 main admission boundary only                                                           | Produce the port above after canonical/full validation and P3/P6 admission; expose an opaque currentness check. No renderer token or new state store.                                                                                                                       |
| **TW-02L-I composition**  | New `src/main/runtime/ticket-workspace-live-owner-composition*.ts` modules and focused tests | Reuse TW-02F selector/binder and TW-01 capture; implement P4/P5 eligibility, two-read match/click and three-read evidence, one 30-second deadline, exact source/ref comparisons, complete-read gate, and separate unavailable results. No fixture IPC/UI or schema changes. |

TW-02L-I is implementable with fake duplex, injected expected binding/key/clocks/currentness gate, and existing binder/capture; it does not wait for production endpoint, publisher, or secret setup. Tests cover pruning/pruned and suppression, preserved non-excluded pending transition, unavailable/wrong-host/folder/mismatch refs, unsupported ticket anywhere, valid 60-second source timestamp intervals at arbitrary wall-clock offsets, monotonic expiry/restart/lease change, profile/epoch change, digest equivocation/regression, timestamp-only revision regeneration, source/owner ABA, owner replacement during the final source read, deferred binding revalidator and post-await timeout/abort, outer cancellation, and partial versus complete TW-01 capture. Fixture tests remain unchanged and fixture binder success is never positive live evidence.

**Separate production gate:** no positive production owner result until P1-P8 endpoint/key/artifact/host evidence, P5 physical allowlist provenance, and TW-06 durable P3/P6 restart/suspend/currentness behavior are proven. Injected tests validate composition only; they do not activate live admission, public `clear`, or live navigation.

## DAG impact

TW-00C/F delivery, TW-02F fixture binding, TW-06F fixture boundary, and TW-07F fixture navigation are complete. TW-02L-I may proceed after B1 and the TW-06-I admitted-read interface are frozen; genuine production admission retains the separate evidence gate above.
