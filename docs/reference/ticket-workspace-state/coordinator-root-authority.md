# Coordinator folder, artifacts, enrollment, and root gateway

**Status:** Decision draft for TW-05 and TW-05G. This freezes no endpoint, wire message, token encoding, or implementation. It is not implementation authorization.

**Source baseline:** `ticket-workspace/` at commit `2045808ffdb6baead2e659855cefb02f7b36491c`, tree `50d168f58db92c98b8e70cc32ed1dfbc1c5736a2`.

Labels distinguish confirmed facts, project invariants, candidate recommendations, and decisions still needed. Older ignored work-plan and authority notes are context only; they are not a replacement for the pinned package or the shared state documents.

## Decision boundary

TW-05 defines the ticket-owned coordinator directory and document lifecycle, plus safe enrollment of an already-existing Orca root Run. TW-05G defines how a current root Run may authorize ticket-owned external effects and how Orca Run binding changes are excluded while those effects are in flight. These are separate implementation packets: TW-05 may finish folder, artifact, and enrollment work without implementing the effect gateway; TW-05G depends on TW-05's durable correlation contract.

## Evidence and current limits

### Pinned ticket source

- **FACT:** `TicketCatalogTicketV1Schema` has optional `coordinatorLocation` and `coordinatorRef`. The current `orchestration` correlation has `executionHostId`, optional `runId`, and dispatch/request IDs. The current artifact reference contains `schemaVersion: 1` and an optional opaque `revision`; there is no document set, artifact manifest, folder ownership proof, or enrollment state in this schema. See [`ticket-catalog-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-catalog-v1.ts) and [`ticket-workspace-common-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-workspace-common-v1.ts).
- **FACT:** `WorkspaceRefV1` permits a `folder` reference, but its identity fields differ from the exact five-field `git-worktree` reference. A folder join needs Orca-owned folder identity and host evidence; a path match alone is not proof of the same folder workspace, and today's create response may not provide the host stamp.
- **FACT:** `admitTicketContractV1()` is fixture contract admission. A compatible fixture can yield `mutationAllowed: true`; the helper has no live Orca caller, current Run binding, user confirmation, or durable binding fence. This result cannot authorize a live action. See [`ticket-contract-admission-v1.ts`](../../../ticket-workspace/packages/contracts/src/ticket-contract-admission-v1.ts).
- **FACT:** The pinned [`durable-ledger-and-coordinator.md`](../../../ticket-workspace/docs/durable-ledger-and-coordinator.md) describes CAS-backed, restart-reconcilable ticket resource operations. It explicitly excludes Orca integration and does not define coordinator folder/artifact lifecycle or the root effect gateway.

### Orca Run and folder seams

- **FACT:** `orchestration.runCreate` and `orchestration.runUse` require a stable pane, but their current caller check is compatibility-tolerant rather than strict attestation. `assertCallerHandleMatchesEvidence()` returns when evidence is absent and only rejects a mismatch when verification returns a caller; unresolved/absent evidence is not itself rejected. In those cases the pane can be resolved from the request's `from` handle. A stable pane or Run lookup therefore does not prove an authenticated live caller for ticket authority. See [`runs.ts`](../../../src/main/runtime/rpc/methods/orchestration/runs/runs.ts) and [`run-scope.ts`](../../../src/main/runtime/rpc/methods/orchestration/runs/run-scope.ts).
- **FACT:** `createRun()` creates a Run bound to the supplied server-resolved pane and unbinds other Runs for that pane. `bindRun()` changes the Run binding under a SQLite transaction. `unbindOtherRunsForPane()` clears another binding and increments its generation. Pane lookup uses Orca's pane-key equivalence rules. See [`run-create.ts`](../../../src/main/runtime/orchestration/db/runs/run-create.ts), [`run-binding.ts`](../../../src/main/runtime/orchestration/db/runs/run-binding.ts), and [`run-lookup.ts`](../../../src/main/runtime/orchestration/db/runs/run-lookup.ts).
- **FACT:** `consumer_generation` is stored on the Run row and changes with binding changes. Current Run-delivery code checks it to reject a replaced mailbox consumer. That behavior is useful for detecting a stale consumer; it does not hold a ticket effect open, coordinate with the separate ticket ledger, or prove effect quiescence after a crash. Do not treat the number itself as a durable external-effect fence. See [`run-delivery.ts`](../../../src/main/runtime/orchestration/db/runs/run-delivery.ts).
- **FACT:** Orca exposes `projectHostSetup.setupExistingFolder` and `folderWorkspace.create` runtime seams. However, `FolderWorkspace.executionHostId` is optional, documented as a renderer-owned host stamp, and `createFolderWorkspace()` does not populate it. The create response alone is therefore not a complete host-qualified `WorkspaceRefV1`. Ticket integration must use an existing trusted registration path and add or identify an Orca-owned host-identity proof seam; a caller-supplied/configured host stamp is not that proof. See [`project-runtime-rpc-methods.ts`](../../../src/main/runtime/rpc/methods/project-runtime-rpc-methods.ts), [`folder-workspace.ts`](../../../src/main/runtime/rpc/methods/folder-workspace.ts), [`folder-workspace-types.ts`](../../../src/shared/folder-workspace-types.ts), and [`folder-workspace-operations.ts`](../../../src/main/persistence/restoring-sessions/folder-workspace-operations.ts).
- **FACT:** The Run-binding SQLite transactions cover the Run database updates, then commit before returning to the caller. The inspected code does not keep a transaction or durable lock through a ticket-ledger write or an external adapter effect.
- **FACT:** `orchestration.reset --all` calls `db.resetAll()`, whose transaction deletes all rows from `runs` and then inserts the inspect-only legacy sentinel. The reset method does not currently consult a ticket effect exclusion. See [`reset-methods.ts`](../../../src/main/runtime/rpc/methods/orchestration/runs/reset-methods.ts) and [`orchestration-reset.ts`](../../../src/main/runtime/orchestration/db/reset/orchestration-reset.ts).

## Ownership contract

| Concern                                                                                                            | Authoritative owner                               | Required boundary                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ticket identity, catalog CAS, enrollment correlation, artifact manifest/revisions                                  | Configured ticket-workspace authority             | Ticket key, authority ID, ledger epoch/revision, and operation identity are validated by the ticket owner. No Orca renderer state becomes canonical ticket state. |
| Coordinator directory bytes and ticket documents                                                                   | Ticket-workspace authority                        | Directory identity and artifact bytes are separately verified. A catalog revision is not proof that a file write completed.                                       |
| Folder project/workspace registration, pane and terminal, agent session, Run/Task/Dispatch, Orca mutation receipts | Orca execution host                               | Use existing Orca APIs and trust/confirmation paths. Ticket code records correlation; it does not impersonate a pane or create a second Run owner.                |
| User choice, action preview/confirmation, ticket snapshot presentation                                             | Sellmate integration                              | Read-only views and caller-provided identifiers do not grant authority. Effect authorization is checked again by Orca main and the ticket owner.                  |
| Docker, IIS, dev-server, and test-lease effects                                                                    | Ticket adapter on its configured execution domain | Ticket ownership evidence and partial-effect receipts remain independent from Orca mutation receipts.                                                             |

**INVARIANT:** The ticket coordinator folder and root Run remain separate from repository worker/worktree ownership. Orca owns the root agent session and Run; repository workers and worktrees remain under existing Orca orchestration authority.

**RECOMMENDATION:** Keep the coordinator as a non-Git folder containing only ticket coordination material and approved local artifacts. Do not copy repository checkouts, `node_modules`, credential material, or unrelated customer data into it. This detail appears in older ignored design notes; the pinned source does not define it.

**INVARIANT:** Missing, mismatched, partial, or stale ownership evidence fails closed. A previously created folder, Run, or artifact is preserved on retry unless a separate explicit removal action has been reviewed and confirmed. Default ticket teardown preserves the coordinator folder and its documents.

## TW-05 — folder, artifacts, and enrollment

### Inputs and preconditions

The ticket owner receives a validated ticket identity and current catalog authority/epoch/revision. The user explicitly chooses whether to create the coordinator folder and which root-session action to take. Any folder that already exists must be matched to the intended ticket and execution host before reuse; path coincidence is insufficient.

Run enrollment is blocked until Orca supplies a new strict, server-side caller-attestation seam for this ticket path. Existing `runCreate`/`runUse` calls are not enough: their compatibility check tolerates absent or unresolved caller evidence. The new seam must verify a live authenticated Orca caller independently of request `from`, stable pane lookup, and current Run lookup, then establish that the attested caller is the current coordinator for the Run. The ticket process may send the requested ticket key and expected catalog revision, but any pane, terminal, Run, host, or generation values it sends are claims to compare—not authority. If there is no current root context or strict caller proof, return a request to establish one through Orca; do not create a Run or agent from the external ticket process.

### Outputs

On success, the ticket catalog contains:

1. The ticket-owned coordinator location and an Orca folder-workspace reference whose folder identity and current execution host are proven by an Orca-owned seam. Current `folderWorkspace.create` persistence may return no host stamp, so its response alone cannot populate a complete host-qualified ticket reference.
2. An Orca correlation containing the execution host and current Run ID.
3. A validated artifact schema revision and, once chosen, a manifest revision for the complete published document set.

The catalog must not persist process-incarnation proofs, launch tokens, authentication secrets, or pane/terminal handles as a substitute for live attestation. A recorded Run ID is a correlation value, not proof that the Run still exists or that a caller still owns it.

### Recommended sequence and recovery

1. **Prepare:** Validate ticket/profile/catalog identity and preview the exact directory and Orca registration target. Show any existing folder or project that would be reused. Do not mutate during preview.
2. **Create or verify the directory:** Persist a recoverable ticket operation before creating files. Create only the selected ticket-owned directory. If it exists, reuse it only after verifying its ticket/authority ownership evidence; otherwise stop without adopting or overwriting it.
3. **Register through Orca:** Register the existing folder through the approved Orca project/folder-workspace API. Obtain or derive host identity using an Orca-owned proof seam, then record the exact folder identity and host. If registration or host proof fails after directory creation, preserve the directory and retry that step against the same verified identity.
4. **Establish the root session through Orca:** The user starts or resumes the root agent in the coordinator folder through existing Orca trust and session flows. Orca creates or uses the Run. The ticket integration does not create a second root or infer one from a folder path.
5. **Enroll:** Require the new strict ticket caller-attestation seam, then under the ticket ledger's existing CAS authority confirm that the expected ticket/revision is still current and that the attested current coordinator Run is the Run being enrolled. Commit only the ticket-to-Run correlation and enrollment result; do not chain adapter effects or `up` into this write.
6. **Publish documents:** Write only the decided allowlisted artifact set under the verified coordinator directory. Publish a new artifact revision only after file validation and durable read-back. Expose partial writes as pending/degraded/unverifiable, never as the previous revision or full success.

If Orca has already created or bound a root Run but the enrollment CAS fails or its acknowledgement is lost, preserve that Run and the folder. Retry by rereading ticket and Orca state, then require fresh strict caller attestation before explicitly enrolling the same current Run if it still matches. Stable pane identity and current Run lookup alone are insufficient for retry authority. Do not automatically create a replacement Run. A conflicting or changed existing ticket/run correlation requires an explicit rebind path; ordinary retry must not silently rewrite it.

For artifact updates, the ledger CAS and filesystem writes are separate durability authorities. The contract must not claim one atomic transaction across both. The implementation should record intent before effects, publish each file with the filesystem's supported atomic-replace/read-back guarantees, and commit the new manifest/revision only after the entire selected set verifies. A crash between file publication and catalog acknowledgement is a reconciliation state, not success. Previous artifact revisions should be preserved until an explicit retention/deletion policy exists.

### Open TW-05 decisions

- **OPEN DECISION:** Is the canonical coordinator path derived from the configured WSL coordinator root, selected by the user, or both? Define safe ticket-key path encoding, symlink/reparse handling, and ownership evidence for existing paths.
- **OPEN DECISION:** Which Orca seam owns registration of this folder as a project with a synthetic main workspace? The existing `projectHostSetup.setupExistingFolder` and `folderWorkspace.create` APIs are not interchangeable by name; implementation should select and verify the exact existing path.
- **OPEN DECISION:** Add or identify an Orca-owned folder host-identity proof. `FolderWorkspace.executionHostId` is optional, renderer-owned, and not populated by persistence creation today. Decide how the ticket integration obtains a verified host-qualified `WorkspaceRefV1`; do not fill the field from configuration or caller input alone.
- **OPEN DECISION:** Which initial documents are included, their strict schemas/size limits, and whether a root agent can add new document kinds. The current catalog has no document allowlist or artifact manifest.
- **OPEN DECISION:** Define artifact revision representation, concurrent-writer policy, file-level atomicity, manifest publication order, and retention. Current `artifact.revision` is an opaque optional identifier and does not establish these semantics.
- **OPEN DECISION:** Decide first-enrollment and explicit rebind UX, including how root Run creation/resume is presented and how an operator resolves a folder or enrollment left pending after a crash.
- **OPEN DECISION:** Define the folder reference fields that are sufficient for exact identity across Orca restarts and workspace re-registration. Do not silently promote a path-only reference to a live match.

## TW-05G — root gateway for ticket effects

### Authority inputs

The candidate action is classified by a closed action registry. The gateway receives the ticket identity, current ledger epoch/revision, exact action and target, prepared-plan identity, confirmation result, and configured adapter execution domain. The trusted caller context is derived inside Orca main from the authenticated runtime route and current orchestration database state.

Admission requires a new strict ticket-specific caller-attestation seam in Orca main. The current `runCreate`/`runUse` caller check is insufficient because it can proceed with absent or unresolved compatibility evidence, falling back to the request `from` handle for pane lookup. The new seam must establish an authenticated live caller; neither a stable pane nor a current Run lookup grants that authority by itself. It must then verify that the attested caller is the current coordinator pane for the Run; the ticket's validated catalog correlation names that same Run and execution host; the ticket authority/epoch/revision and exact target/action still match; and the configured profile permits the requested adapter domain. A worker Run, another pane, external CLI, stale snapshot, fixture, or renderer-supplied identity cannot satisfy this check.

Read-only `plan` output never authorizes an effect. A one-use, expiring, target-bound plan capability is the current design direction, but its issuer, lifetime, encoding, transport, and consumption protocol remain open. The shared task graph's five-minute value is a proposal to ratify, not a frozen wire contract. Whatever form is selected must bind to the exact ticket authority/epoch/revision, operation/action, target and plan, reject replay or changed input, and remain separate from Orca's own mutation receipt.

### Effect and Run-binding exclusion

**INVARIANT:** External ticket effects can begin only through an Orca root gateway after strict server-side caller attestation, admission, and a distinct check immediately before the effect. Current Run APIs do not strictly attest every caller, so ticket enrollment and action admission must fail closed until the new attestation seam exists. That check must compare fresh caller proof, current pane-to-Run binding, catalog Run correlation, current ticket revision, exact action/target, confirmation, and execution-domain authorization. Contact loss or unsupported/mismatched host routing is unavailable; it never falls back to a different local host.

**RECOMMENDATION:** Add a durable in-flight effect exclusion to the existing Orca orchestration authority. Its record should identify the ticket operation/request digest, Run, the then-current binding snapshot, and the adapter execution domain. It must be acquired before the pre-effect check and remain held from that check through a durable terminal ticket receipt and positive evidence that effect-producing processes are quiescent. It is an Orca-owned lifecycle exclusion, not a new ticket-side Run/status store.

While this exclusion is held, every operation that could replace, remove, or invalidate the coordinator Run must serialize against it: at minimum `runCreate`, `runUse`/`bindRun`, `unbindOtherRunsForPane`, `orchestration.reset --all`/`resetAll`, and any later path that deletes or replaces a Run or clears exclusion/recovery rows. `resetAll()` currently deletes every Run, so it must either be refused until active effects are terminal and quiescent or safely reconcile them first. The durable exclusion must survive the reset transaction; reset must not clear its row or erase evidence needed for recovery. Other reset scopes must also be proven not to delete active exclusion or recovery state. A competing change may wait or return a typed in-flight result; it must not commit first and leave a ticket effect running under a former root. The guard belongs at a shared Orca authority seam so callers cannot bypass it by invoking a lower-level bind helper or reset API.

This proposed exclusion is **not present in the inspected APIs**. The current Run transaction ends before the ticket coordinator or adapter effect runs. `consumer_generation` may be captured and compared as one part of the expected current Run snapshot, but it is not the exclusion and cannot release one.

### Partial failure, replay, and recovery

| Failure point                                                                             | Required result                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admission mismatch or changed ticket revision                                             | Reject before ticket or adapter effect; report stale/blocked with stable reason.                                                                                                                                                 |
| Ticket operation is admitted but Orca exclusion cannot be durably acquired                | No adapter effect. Return blocked/unavailable and leave the ticket operation recoverable or safely unadmitted.                                                                                                                   |
| Root binding changes before the pre-effect check                                          | Reject before effect. Do not transfer the old admission to a replacement Run.                                                                                                                                                    |
| `orchestration.reset --all` is requested while an exclusion is held or recovery-required  | Block reset or reconcile the exact effect to terminal/quiescent first. Preserve the exclusion and evidence across reset; never delete its durable state with the Run rows.                                                       |
| Another reset or destructive Run lifecycle path clears/replaces identity or recovery rows | Gate it against active exclusions or prove those rows remain durable and reconcilable. Do not release an exclusion as a side effect of reset.                                                                                    |
| Effect completes but ticket acknowledgement is absent or uncertain                        | Keep the Orca exclusion held/recovery-required. Reconcile the exact ticket operation and read-back; do not repeat an ambiguous effect or infer quiescence from contact loss.                                                     |
| Orca, ticket process, or transport restarts during an effect                              | Persist the exclusion across restart. Release only after the exact operation has a durable terminal receipt and positive process/effect-quiescence evidence. Pending, unreachable, or unverifiable evidence keeps the exclusion. |
| Same operation ID and same request is retried                                             | Return/reconcile the existing durable stage result without starting a duplicate effect.                                                                                                                                          |
| Operation ID is reused with a different request/target                                    | Reject as request mismatch before effect.                                                                                                                                                                                        |

Ticket adapter stages, Orca worktree/agent mutations, and external cleanup have separate owners and receipts. A successful Orca receipt does not prove adapter success; an adapter receipt does not prove a worktree mutation. A ticket plan capability is never substituted for an Orca orchestration request ID/receipt.

### Open TW-05G decisions

- **OPEN DECISION:** Where to store the durable exclusion in Orca's orchestration schema and which common lifecycle seam can enforce it for every create/use/bind/unbind and Run deletion/reset path. `reset --all` deletes Run rows; decide how reset is gated or reconciled and how exclusion/recovery state survives the reset transaction and startup recovery.
- **OPEN DECISION:** Define the new strict server-side live-caller attestation seam required for ticket enrollment and effect admission. It must reject missing/unresolved evidence and cannot treat `from`, a stable pane, a current Run, or a caller-declared host as authority.
- **OPEN DECISION:** Define the cross-store ordering between acquiring the Orca exclusion and the ticket ledger's admission CAS. Specify safe outcomes for every crash/ack-loss interleaving; there is no atomic commit across the two stores.
- **OPEN DECISION:** Define the exact terminal-receipt and effect-quiescence evidence required to release after gateway/host restart. A missing process or lost connection is not evidence of quiescence.
- **OPEN DECISION:** Ratify plan-capability issuer, binding fields, TTL, delivery channel, replay storage and one-use consumption semantics. Do not add an endpoint or token format before that decision.
- **OPEN DECISION:** Decide whether gateway recovery uses a future resident no-start transport shared with TW-06T or a separately scoped transport. Snapshot transport must not be assumed to authorize mutations.
- **OPEN DECISION:** Freeze supported root/adapter host-scope mappings for the MVP, including Windows-root-to-WSL-coordinator and Windows-native IIS execution, and the exact fail-closed behavior for unsupported SSH/paired routes.
- **OPEN DECISION:** Define user confirmation ownership and binding to the exact target/plan, and the public failure/recovery reason vocabulary without exposing paths, tokens, or host secrets.

## Contract packets and DAG impact

1. **TW-05 contract packet:** freeze the coordinator directory ownership/identity, initial artifact schema and retention, folder registration/host-proof seam, strict caller-attestation requirement, first enrollment and retry/rebind rules. Then implement only ticket catalog/ledger, directory, artifact and correlation work. Orca continues to own project registration, agent/session, Run creation and Run binding.
2. **TW-05G contract packet:** separately freeze root attestation inputs and implementation seam, action/target-plan binding, confirmation and capability semantics, durable binding exclusion across create/use/bind/unbind/reset/delete, cross-store crash ordering and release evidence. Only after that should the Orca gateway and ticket effect admission be implemented.

The current DAG remains `TW-05 → TW-05G → TW-04B, TW-08`; TW-05G continues to block live external adapter effects and ticket actions. TW-05's artifact/correlation contract remains the prerequisite for M3 coordinator documents. TW-04A fixture work and TW-06T snapshot transport discovery may continue independently. If TW-05G chooses to share a resident transport with TW-06T, the Orchestrator should add that explicit dependency before gateway implementation; snapshot-read completion by itself is not mutation authority.

## References

- Shared sequencing: [`master-plan.md`](./master-plan.md), [`task-graph.md`](./task-graph.md), and active invariants in [`review-findings.md`](./review-findings.md).
- Pinned ticket source: `ticket-workspace/` commit above, especially contract files and `docs/durable-ledger-and-coordinator.md`.
- Orca caller, Run, folder, and reset seams: `src/main/runtime/rpc/methods/orchestration/runs/{runs.ts,run-scope.ts,reset-methods.ts}`, `src/main/runtime/orchestration/db/runs/{run-create.ts,run-binding.ts,run-lookup.ts,run-delivery.ts}`, `src/main/runtime/orchestration/db/reset/orchestration-reset.ts`, `src/shared/folder-workspace-types.ts`, and `src/main/persistence/restoring-sessions/folder-workspace-operations.ts`.
- Historical ignored notes reviewed for context: `docs/ticket-workspace-command-authority.md`, `docs/ticket-workspace-first-run-handoff.md`, and `docs/ticket-workspace-implementation-spec.md`. Their endpoint/token and fence suggestions are not treated here as frozen contracts.
