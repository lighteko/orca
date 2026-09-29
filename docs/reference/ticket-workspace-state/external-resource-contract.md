# TW-04A External Resource Identity and Evidence Contract

**Status:** Decision draft. It proposes a common DTO and fixture semantics; it does not change schemas, implement adapters, authorize effects, or claim a live Docker/IIS route exists.

**Source pin:** Ticket source commit `0b5ac0fbe34adfc4537be3f10ee0227807c0cccc`, tree `5831ae7ab972284316a5d406fe3a89db4abef440`. The current `/v1` contracts below are read from that pin. The older package-default contract is historical evidence only. A later private commit `59714baa36e7573d910db907e94e21987fbd5fa9` changes package build metadata and a clean script only; the resource-contract observations remain pinned to `0b5ac0fbe34adfc4537be3f10ee0227807c0cccc`.

## Decision

Keep the pinned `/v1` catalog as the current ledger and preserve it unchanged. Its `kind` is a resource category; its generic `intent.adapterId` and `intent.adapterVersion` are strings, not proof that an adapter exists. For any future typed row, use the closed discriminator tuple `(kind, adapterId, adapterVersion)` and require an exact ratified mapping to one typed intent and observation variant. Keep a resource-universe observation as a separate versioned result: one resource row observation does not prove discovery completeness.

Evidence does not establish a production Docker or IIS adapter identity, physical resource decomposition, query route, owner marker, or complete inventory API. Therefore this draft does **not** ratify a production Docker/IIS pair or positive production fixture. Docker and IIS remain unsupported for typed discovery, clean-universe claims, or cleanup until their adapter owners provide the evidence in [Open owner decisions](#open-owner-decisions). The common DTO and synthetic validator fixtures below can be implemented without inventing those adapter details.

## Facts from the current source

- The catalog is `ticket-catalog` schema version 1. Resource kinds are `docker-runtime`, `generated-compose`, `iis-site`, `iis-app-pool`, `dev-server`, `port`, and `test-lease`. The intent envelope has a free-form `adapterId`, `adapterVersion`, scalar locator values, and scalar or string-array create-spec values. The objects are strict. See the pinned [resource schema](../../../ticket-workspace/packages/contracts/src/ticket-workspace-resource-v1.ts#L21) and [catalog schema](../../../ticket-workspace/packages/contracts/src/ticket-catalog-v1.ts#L1).
- A `/v1` per-resource observation binds `resourceId`, `generation`, and `intentDigest` to an attempt/operation and carries `observedAt`, `validUntil`, `presence`, `ownership`, and optional acknowledgement/evidence digests. It has no typed physical identity, actual endpoint, source clock identity, or discovery-completeness fields. `evidenceDigest` is opaque. The validator checks intent digest, owner tuple, generation uniqueness, and ledger consistency; it does not verify that a service-side object has those identities. See the [observation and row schema](../../../ticket-workspace/packages/contracts/src/ticket-workspace-resource-v1.ts#L45) and [semantic validator](../../../ticket-workspace/packages/contracts/src/ticket-contract-validator-v1.ts#L51).
- `/v1` has no resource-universe result. An empty `externalResources` array and an `absent` row observation say nothing about unlisted resources, pagination, filters, permissions, truncation, or host-wide completeness.
- The successful tombstone validator requires an absent, ownership-match observation acknowledged by a successful teardown attempt. Its ordering is `attempt.startedAt <= observation.observedAt <= attempt.completedAt < observation.validUntil`: the absence read occurs during the teardown attempt, before its completion. This is ledger validation, not proof of complete host inventory. See [purge evidence validation](../../../ticket-workspace/packages/contracts/src/ticket-cleanup-evidence-validator-v1.ts#L160) and [timestamp ordering](../../../ticket-workspace/packages/contracts/src/timestamp-order-v1.ts#L1).
- The v1 corpus includes a generic `docker-runtime` row with `adapterId: docker-slot` and project/service/slot-like values. It has no typed IIS row. Those examples exercise generic validation only; they do not identify a real Docker engine object or establish adapter support. See the [v1 corpus](../../../ticket-workspace/packages/contracts/fixtures/ticket-workspace-schema-v1.corpus.json#L150).
- No production Docker or IIS adapter implementation was found in the inspected Orca `src/main`/`src/shared` or ticket CLI scopes: Orca has no `docker-slot` or `iis-site` adapter references, and the ticket CLI references are limited to historical authorization logic and tests. The pinned ticket source explicitly says Docker and IIS adapters remain disabled until non-cooperating-writer proofs pass. See [resource mutation safety](../../../ticket-workspace/docs/resource-mutation-safety.md#L26).
- The older package-default contract proposed a Docker `docker-slot` locator of `{ executionHost, projectName, serviceName, slotName }`; its present observation included `{ executionHost, containerId, projectName, serviceName, slotName, mountSource, owner }`. It proposed an IIS **site** locator of `{ executionHost: Windows machine, siteName }`; its create spec included `appPoolName`, `bindingHost`, `port`, and `physicalPath`; its present observation included `siteId`, site/app-pool/binding/path values, and owner evidence. That model did not define an independent app-pool adapter. These are prior proposals, not canonical `/v1` fields or evidence of real endpoint semantics. See the [older contract](../../../ticket-workspace/packages/contracts/src/ticket-workspace-contract.ts#L126) and [historical authorization checks](../../../ticket-workspace/packages/cli/src/ticket-resource-mutation-authorization.ts#L96).
- The v1 `TicketExecutionHost` type distinguishes Windows machine, Linux/macOS native machine, and WSL machine+distro. A config test example maps `docker` to WSL `Ubuntu-24.04` and `iis` to `windows-native`, but that is only a config fixture. It is not a runtime dispatch result or proof of the service endpoint reached. Orca's execution-host dispatch cited here is for Git/filesystem; it does not route Docker or IIS queries. No path, CLI context, profile, workspace host, or configured adapter domain can stand in for route evidence. See [host schema](../../../ticket-workspace/packages/contracts/src/ticket-workspace-common-v1.ts#L34), [config fixture](../../../ticket-workspace/packages/contracts/test/ticket-workspace-config-v1.test.ts#L90), and [Orca host dispatch](../../../src/main/providers/execution-host-provider-dispatch.ts#L90).
- Orca's source-owned freshness implementation is local-native Git only. The shared findings explicitly leave cross-process clock admission open, and WSL no-start route proof is not delivered for this resource path. Do not generalize the Git capture to external adapters. See [Git capture](../../../src/main/runtime/runtime-git-status-record-capture.ts#L20), [review findings](./review-findings.md#L41), and [task graph](./task-graph.md#L99).

## Identity contract proposed for ratification

### Catalog row identity and discriminator

Keep these identifiers separate:

1. `kind` identifies the resource category from the catalog enum.
2. `(adapterId, adapterVersion)` identifies a particular adapter implementation/version only when an owner ratifies that exact pair for that `kind`.
3. `(resourceId, generation, intent.digest)` identifies the ledger incarnation and intended configuration.
4. `physicalIdentity` identifies the actual object or owner-defined resource group at the external authority. It must be stable for that incarnation and must not be derived only from a human name or path.

The typed catalog contract should use a strict registry keyed by `(kind, adapterId, adapterVersion)`. The registry chooses the intent and observation discriminator; `adapterId` by itself is not globally closed because `/v1` permits generic identifiers and includes unrelated `dev-server`, `port`, and `test-lease` rows. Unknown or unratified rows remain readable opaque data but are `unverifiable` for any operation that would rely on their identity.

Proposed v2 intent envelope:

```text
intent: {
  digestVersion: 2,
  digest,
  adapterId,
  adapterVersion,
  locator: <strict adapter-specific target and intended authority>,
  createSpec: <strict adapter-specific creation/configuration constraints>
}
```

For v2, define `digest` as SHA-256 over canonical JSON of `{ kind, adapterId, adapterVersion, locator, createSpec }`; the strict pair registry selects the corresponding `locator` and `createSpec` variants. All fields that change the target or requested configuration, including intended authority selection, belong in those variants and therefore in the digest. Preserve the existing v1 digest algorithm for v1 rows; do not reinterpret a v1 digest as v2.

For the same ticket row, discovery and read-back must agree on the ledger tuple `(authorityId, ticketKey, repositoryId, ledgerEpoch, ledgerRevision)`, adapter tuple, resource ID, generation, intent digest, and endpoint identity. When both outcomes are `present`, they must also agree on canonical physical identity; reusing a name with a different physical identity is an ABA/mismatch. An `absent` result instead binds the exact queried locator to the same authority, endpoint, and scope, and carries no physical identity. A universe item that has no exact ledger join is an unowned discovery item; never synthesize a ticket resource ID, generation, or intent digest for it.

### Docker candidate facts and unresolved identity

The historical proposal and v1 sample support only these statements: `docker-slot` was previously used as an adapter label, and a sample uses project/service/slot-like locator values. The old proposal additionally considered a container ID and mount source on read-back. None establishes whether the managed unit is one container, a Compose service, a generated Compose project, or a set of child objects; none identifies a Docker engine or context in current `/v1`.

Before a Docker pair can be ratified, its owner must name the exact `(kind, adapterId, adapterVersion)`, define the managed unit and all child objects, specify a stable engine/authority identity plus object identity, and prove the query covers the unit and all colliding foreign or unmarked objects. Until then, no Docker typed present/absent fixture may pass production adapter validation.

### IIS candidate facts and unresolved identity

The current kind enum contains both `iis-site` and `iis-app-pool`, but `/v1` defines no typed relationship between them. The historical proposal covers an IIS site and mentions its app-pool name, binding, physical path, and site ID. It does not authorize a separately managed pool, establish whether a pool is shared, or define a pool identity/read-back contract.

Before any IIS pair can be ratified, its owner must define whether `iis-site`, `iis-app-pool`, or both are supported, exact ownership/dependency behavior for shared pools and bindings, stable site/pool identity, and the Windows configuration authority actually queried. Until then, no IIS typed positive fixture or inferred site-to-pool teardown mapping is allowed.

## Host and ownership evidence

### Actual host route

Keep these values distinct in each future typed observation and universe result:

- `adapterProcessHost`: the host where the process performing the query ran;
- `resourceAuthorityId` and `resourceAuthorityHostId`: the exact Docker engine or IIS configuration authority reached;
- `endpointId`: the owner-defined stable endpoint identity within that authority;
- `routeEvidenceRef`: a versioned, verifiable proof from the route owner binding the process host to that authority and endpoint.

The value in `executionDomain` is a ledger claim, not the route proof. Configured adapter domains, filesystem paths, WSL distro names, Docker CLI context names, machine labels, and successful command exit codes alone do not prove the actual authority queried. A route proof must be produced and verified by the responsible host/provider owner; its typed format and issuer are adapter-owner decisions. A route mismatch, missing provider, unavailable authority, unsupported route, or unverified endpoint is `unverifiable`. Never retry against a default local engine or another machine.

The host fields in this contract are proposed identifiers, not current schema fields. In particular, the ticket host enum does not itself represent all possible remote engine/configuration authorities. Owners must supply stable authority/endpoint IDs and supported route variants; no route is inferred from a WSL coordinator or the repository host. Read-only discovery must not start WSL. Until a no-start route is proven, a WSL-dependent Docker/IIS read is unavailable.

### Owner proof

The current row owner is `{ authorityId, ticketKey, repositoryId }`; current per-resource `ownership: match` is only a claim and opaque evidence digest. A typed observation must return a verifiable owner proof binding that full tuple to `generation` and `intentDigest`, plus the owner-defined physical identity. The proof source must be read from the external object or an authoritative service-side ownership record and must be unique for the ticket incarnation.

Names, paths, ports, Docker project/service labels, IIS site/pool names, or matching configuration do not alone prove ownership. Missing, conflicting, unreadable, legacy-unmarked, or other-ticket markers are never `match`; report `mismatch` or `unknown` as evidence warrants and preserve the object. The exact Docker labels/metadata and IIS owner-marker mechanism are open owner inputs.

## Typed per-resource observation

The current `/v1` envelope stays unchanged. For a future catalog v2 row, the typed observation should keep the ledger binding and add:

```text
adapter: { kind, adapterId, adapterVersion }
route: { adapterProcessHost: { hostKind, hostId }, resourceAuthorityId, resourceAuthorityHostId,
         endpointId, routeEvidenceRef }
capture: { observationId, sourceOwnerId, clockDomainId,
           ownerReadStartedAt, observedAt, validUntil, freshnessPolicyId }
scopeBinding: { scopeId, scopeDigest }
result: one of:
  { presence: "present", ownership: "match" | "mismatch" | "unknown",
    physicalIdentity: <strict adapter-specific identity>,
    physicalIdentityDigest, ownerProof: <strict adapter-specific proof/result> }
  { presence: "absent", queriedLocatorDigest }
  { presence: "unverifiable", queriedLocatorDigest?, reasonCode }
resourceBinding: { resourceId, generation, intentDigest,
                   authorityId, ticketKey, repositoryId,
                   ledgerEpoch, ledgerRevision }
```

This is a field-level proposal, not a patch to `/v1`. A `present` result carries the actual typed `physicalIdentity` and a typed owner-proof result; `match` requires verifiable proof of the full ticket tuple, generation, and intent digest. A digest alone cannot replace the typed claim needed to compare intent and actual object. An `absent` result carries the canonical digest of the exact queried locator plus the route, authority, and scope binding; it does not fabricate a physical identity or claim that an absent object has a readable owner marker. An `unverifiable` result stays distinct from absence and records why the read could not establish either outcome.

The observation source owns `observationId`, `ownerReadStartedAt`, `observedAt`, and `validUntil`. It creates the ID and stamps the start immediately before its first external read; it stamps the completion observation and validity itself. The receiver cannot mint an ID, backdate a start, replace timestamps, or extend validity on receipt. The source clock domain must be explicit. Time ordering, deadline, and wall/monotonic drift are checked by that source owner; this is not established by the current external-resource source.

Freshness and universe completeness are independent. A structurally complete result can be stale. The consumer may use `observedAt`/`validUntil` only in the same verified clock domain or with a separately ratified, authenticated clock handoff that bounds offset and uncertainty. There is no such Docker/IIS or WSL-to-Windows handoff in current source. Without it, cross-domain stale/clear evaluation is `unverifiable`; receipt time cannot refresh the capture. A fixture asserting cross-host freshness must wait for the handoff contract and its verifier.

## Separate versioned universe result

`discover` returns a `ticket-resource-universe-observation` with `schemaVersion: 1`. It is distinct from every per-resource observation and from the catalog. Its result binds the exact ticket/catalog revision and an adapter-declared query scope to a complete or incomplete inventory. The common envelope below is concrete enough for common validator fixtures; adapter-specific scope and item identities stay gated until their owners define them.

Common scalar rules for this proposal: schema versions and catalog revisions are safe integers; counts and page numbers are non-negative safe integers; identifiers are non-empty strings; SHA-256 digests are lowercase 64-character hex; timestamps are UTC RFC 3339 strings. `catalogSchemaVersion` is `1 | 2`. `queriedLocatorDigest` is SHA-256 over canonical JSON of the strict intent locator. `ownerReadStartedAt <= observedAt < validUntil` must hold within the source clock domain. The owner emits `observationId` and all three times; the receiver cannot rewrite them.

```text
{
  schemaId: "ticket-resource-universe-observation",
  schemaVersion: 1,
  universeObservationId,
  source: {
    catalogSchemaVersion, authorityId, ticketKey, repositoryId,
    ledgerEpoch, ledgerRevision
  },
  adapter: { kind, adapterId, adapterVersion },
  route: {
    adapterProcessHost: { hostKind, hostId }, resourceAuthorityId, resourceAuthorityHostId,
    endpointId, routeEvidenceRef
  },
  scope: {
    scopeId, scopeDigest, adapterQuery,
    coverage: "exact-target" | "target-and-collisions" |
              "authority-universe" | "unknown"
  },
  capture: {
    sourceOwnerId, clockDomainId, ownerReadStartedAt, observedAt,
    validUntil, freshnessPolicyId, clockHandoffRef?
  },
  enumeration: {
    state: "complete" | "partial" | "unverifiable",
    completion: "exhausted" | "failed" | "cancelled" | "timed-out" | "unsupported",
    pagesRead, continuation: "exhausted" | "remaining" | "unknown",
    permissions: "sufficient" | "denied" | "unknown",
    truncation: "none" | "detected" | "unknown",
    identityUniqueness: "unique" | "duplicates" | "unknown",
    consistency: "snapshot" | "stable-continuation" | "unstable" | "unknown",
    returnedCount, itemSetDigest
  },
  items: [
    {
      physicalIdentity: <strict adapter-specific identity>,
      physicalIdentityDigest,
      ownership: "match" | "mismatch" | "unknown",
      ownerProof?,
      resourceBinding?: { resourceId, generation, intentDigest }
    }
  ]
}
```

The item array contains the entire result, not a sample. `returnedCount` must equal its length. `physicalIdentityDigest` is SHA-256 over canonical JSON for the strict adapter-specific `physicalIdentity`; `itemSetDigest` is SHA-256 over canonical JSON for the full array sorted by the adapter's canonical physical-identity key. A `match` item must include `ownerProof`; `mismatch` and `unknown` preserve the item but cannot authorize ownership. The `resourceBinding` field is present only for an exact catalog join.

### Universe semantics

- `adapterProcessHost.hostKind` and `hostId`, `resourceAuthorityHostId`, `resourceAuthorityId`, and `endpointId` are non-empty stable owner-defined identifiers, not paths or display names. The route owner defines host-kind values; no current Docker/IIS host variant is implied.
- `adapterQuery` is the exact strict adapter-specific query/selector payload after defaults are resolved. `scopeDigest` is SHA-256 over canonical JSON for `{ kind, adapterId, adapterVersion, route: { adapterProcessHost, resourceAuthorityId, resourceAuthorityHostId, endpointId, routeEvidenceRef }, scopeId, coverage, adapterQuery }`. `scopeId` identifies its ratified meaning. A fixture can validate that the digest covers the query and full normalized route binding, but only the adapter owner can establish that the query and route proof mean what `scopeId` claims.
- `completion` is `exhausted` only when the source returned its terminal page and all query validation finished. A transport/page failure, cancellation, timeout, or unsupported scope uses the matching non-success value and cannot be `complete`.
- `coverage: target-and-collisions` means the query includes all objects that could collide with the ticket's intended locator, whether marked, foreign, or unmarked. Filtering only by an ownership marker is not sufficient. `authority-universe` means the owner proves the query includes every object in that explicitly named engine/configuration authority. `exact-target` can support a locator-specific read but not a clean-universe claim. `unknown` never supports absence or clean.
- `enumeration.state` is `complete` only if the route and declared scope are supported, `completion` and continuation are exhausted, every page is read, permissions are positively sufficient, no server/client limit truncated the result, identities are unique, the source's snapshot/stable-continuation guarantee holds, and `returnedCount === items.length` with a matching canonical `itemSetDigest`. Define `itemSetDigest` as SHA-256 of canonical JSON for items sorted by the adapter's canonical physical-identity key. Unknown, denied, remaining, duplicate, unstable, or truncated states force `partial` or `unverifiable`.
- A page failure or a reached item/byte cap returns the observed items as partial evidence and marks truncation/failure; it does not return a successful empty list. A query that silently hides inaccessible objects cannot claim sufficient permissions.
- `consistency: snapshot` requires a source snapshot token/guarantee that covers the full query. `stable-continuation` requires a source-defined continuation contract that cannot omit or duplicate changing objects across pages. If the owner has neither guarantee nor a validated reconciliation algorithm, consistency is unknown/unstable and completeness cannot be `complete`.
- Every item includes actual typed physical identity, even when foreign or unmarked. Items that join a ledger row include the exact resource ID, generation, and intent digest; a mismatch is an error, not a second interpretation of that row. No item may be dropped because its name, marker, type, or owner is unfamiliar.
- Completeness is scoped. A `complete` exact-target query is not a complete engine/IIS universe. For a cleanup or TW-03 clean claim, the required scope must be owner-ratified and cover every relevant collision/resource family. The consumer must also establish freshness separately.

**Zero-result rule:** `complete` with `returnedCount: 0` means no object matched this exact, fully read, owner-defined query scope at this capture. It means an authority is empty only when `coverage: authority-universe` is ratified and the actual endpoint, permissions, and consistency proof establish that full authority scope. Empty ledger arrays, exact-target absence, marker-only results, partial pages, permission gaps, stale data, and wrong-host results never mean the authority is empty.

`discover` and per-resource `inspect` answer different questions. `inspect` can report the state of a known row. `discover` proves which objects the declared universe query returned. Neither can substitute for the other; a catalog array with zero rows is not discovery evidence.

## Catalog compatibility and migration

Recommend leaving `/v1` byte/schema semantics unchanged and putting typed catalog changes under explicit catalog schema version 2. Keep the universe result as a separate named/versioned DTO because it is a query result, not a durable resource row. This follows evidence: `/v1` schemas are strict, and its semantic validator rejects any catalog schema version other than 1. `adapterVersion` versions adapter behavior; it cannot version a new DTO shape. See [v1 dispatch](../../../ticket-workspace/packages/contracts/src/ticket-contract-validator-v1.ts#L51).

Compatibility rules:

1. A v2-capable reader keeps v1 rows readable as opaque generic rows. Preserve `dev-server`, `port`, `test-lease`, unknown generic adapter IDs, and generic Docker/IIS rows without coercion or loss.
2. A v1 reader must never be sent a v2 catalog or typed payload as if it were a compatible v1 row. Its strict validator rejects schema version 2. The writer/authority must use an explicit capability/version path before publishing v2; never downgrade by stripping typed fields or encode a typed row back into generic scalars.
3. Do not auto-migrate generic rows. Attach typed semantics only after fresh, route-bound read-back proves the exact external endpoint, physical identity, owner tuple, generation, and intent digest at the current catalog revision. Without that proof, preserve the opaque row and return unsupported/unverifiable.
4. A separately versioned sidecar may be considered only if an explicit capability negotiation, authority of record, read/write ordering, and old-reader behavior are specified and tested. It is not the recommendation because the catalog is the current durable ledger and a detached sidecar can disagree with it.

The closed typed registry applies only to owner-ratified `(kind, adapterId, adapterVersion)` triples. Do not globally reject the free-form v1 `adapterId` or unrelated generic kinds.

## Cleanup safety and authority boundary

- Keep intent and generation durable before any effect, record an attempt before execution, reload/revalidate the current ledger revision, inspect the exact target and route, and commit acknowledgements through CAS. On conflict or uncertain completion, reconcile the same generation; do not replay an ambiguous destructive request.
- Immediately before teardown, require fresh route, physical identity, owner proof, generation, and intent-digest matches. Group/child cleanup additionally requires a complete universe result over the owner-approved scope and fresh read-back for each object to remove. Preserve shared, foreign, changed, unmarked, or unenumerated objects. An IIS site does not imply ownership of a pool; a Compose project label does not prove every child is disposable.
- The pinned `/v1` tombstone validator's absent observation is captured during a successful teardown attempt (`startedAt <= observedAt <= completedAt < validUntil`). It validates the ledger receipt only. It does not prove complete post-cleanup inventory. Uncertain contact is not absence; retain residual resource IDs and report failed/unverifiable rather than purging.
- This contract grants no action-preview or mutation authority. An observation or complete universe result is evidence only. Effects remain behind TW-05G's root gateway and the later TW-04B adapter admission/recovery contract.

## Normative fixture plan

Common universe-envelope tests may use an injected, test-only adapter profile so they validate the shared DTO and rules without claiming that a production adapter exists. That profile is not part of the production registry and its IDs must not be copied into the catalog corpus. Do not add positive production Docker/IIS fixtures until their owners ratify the specific pair and query/identity variants.

### Common DTO fixtures that can be implemented now

- Complete one-page inventory with one ledger-linked item and one foreign/unmarked collision item; prove all items remain visible.
- Complete multi-page inventory with exhausted continuation and stable snapshot/continuation evidence; preserve deterministic item ordering/digest.
- Complete zero-result inventory for one exact, ratified synthetic scope; assert only that scope is empty.
- Partial/unverifiable results for page failure, continuation remaining/unknown, denied/unknown permissions, truncation/server limit, duplicate physical identity, count/item mismatch, digest mismatch, unstable pages, and unsupported/unknown scope.
- Reject or mark unavailable on wrong ticket/repository/authority/ledger revision, adapter tuple, process host, resource authority, endpoint, route-proof binding, and physical-identity join.
- Reject marker-only scope when a locator collision can be hidden; prove foreign and unmarked objects are included in a valid collision scope.
- Capture fixtures where the source owns ID/start/observed/valid-until; reject caller receipt-time refresh, stale/future time, invalid ordering, clock rollback/drift, missing source/clock identity, or absent cross-domain handoff. Cross-host stale/clear success remains gated until a real handoff verifier is ratified.
- Same locator/name with a different physical identity, owner tuple, generation, intent digest, endpoint, or catalog revision is an ABA/mismatch; never join it to the old row.
- Exact-target absence and complete-universe zero are separate fixture outcomes. A per-resource absent observation cannot produce a complete universe result.

### Docker/IIS adapter fixtures gated on owner evidence

For each ratified pair, add strict typed intent and present/absent/unverifiable observation fixtures. Docker fixtures must cover actual engine/endpoint identity, managed unit and child inventory, physical container/resource identity, owner marker, query selectors, complete pagination/permissions/consistency, and wrong-context route. IIS fixtures must cover the actual Windows configuration authority, each ratified site/pool resource type, site/pool sharing/dependency, stable physical identity, bindings, ownership markers, full collision scope, and permission/consistency gaps. These details are unknown today; fixtures must not copy the historical model and label it production.

Cleanup fixtures must keep foreign/shared/unmarked/changed/unlisted items residual, reject stale or mismatched host/generation/digest, bind tombstone absence to the successful teardown attempt with the pinned timestamp ordering, and require complete in-scope read-back when removing a group. None may interpret read-only inspection as authorization to mutate.

## Open owner decisions

| Required evidence          | Docker owner                                                                                                   | IIS owner                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Supported pair             | Exact `kind`, `adapterId`, `adapterVersion`; runtime/container vs generated Compose/project decomposition      | Whether `iis-site`, `iis-app-pool`, or both are supported; exact adapter IDs and versions       |
| Physical identity          | Stable engine/authority and exact managed object/child IDs; identity reuse behavior                            | Stable configuration authority, site/pool IDs, whether and how bindings/shared pools join       |
| Route proof                | Process-host to actual Docker engine endpoint mapping, including WSL/Windows and remote modes                  | Exact Windows host and configuration authority reached; supported local/remote management modes |
| Owner proof                | Exact resource metadata/service-side marker binding ticket tuple, generation, and intent digest                | Exact site/pool owner marker and behavior for legacy, shared, or unmarked objects               |
| Discovery scope            | Query families/selectors, collision coverage, child enumeration, zero-result meaning                           | Site/pool/binding/dependency scope, collision coverage, zero-result meaning                     |
| Completeness               | Permissions, pagination/continuations, caps/truncation, duplicate detection, snapshot/reconciliation guarantee | Same, plus IIS configuration snapshot/concurrency guarantee                                     |
| Freshness                  | Source owner/clock domain, validity policy, and verified transfer to ticket authority/consumer                 | Same, including any WSL-to-Windows clock handoff and no-start route proof                       |
| Compatibility and recovery | Confirm catalog v2 reader/writer path and exact-generation recovery/read-back                                  | Same, plus independent site/pool cleanup and concurrent administrator edits                     |

Until the owner supplies this evidence and tests it against non-cooperating writers, the adapter remains unsupported for typed discovery, complete clean-universe claims, and cleanup. An explicitly narrower read can be reported only as exact-scope evidence; it cannot be promoted to a whole-authority result.

## Bounded next implementation packet

TW-04A may implement the common versioned universe DTO, its semantic rules, and the test-only injected-profile fixtures above in the ticket contract package. It may ratify a Docker or IIS typed pair only after its owner provides the corresponding evidence. Keep product effects, Orca runtime/schema changes, and live resource operations outside this packet.

**Acceptance:** strict versioned universe DTO; exact source/ledger/adapter/route/scope/capture binding; independent completeness and freshness outcomes; fail-closed partial/permission/truncation/duplicate/clock behavior; complete-zero semantics; same physical identity across present discovery and read-back; generic v1 preservation and explicit catalog-v2 compatibility path; synthetic common fixture matrix passes. No positive production Docker/IIS identity fixture until an owner-ratified pair and query contract exist. If that input is missing, both adapters are explicitly unavailable for typed discovery/cleanup.

**DAG:** Keep TW-00 -> TW-04A; TW-04A + TW-05G -> TW-04B; TW-04B -> TW-03/TW-04C. TW-03 requires complete external universe coverage for each required scope in addition to per-resource evidence; missing or partial coverage stays unavailable/incomplete. No new cross-task edge is needed while the universe DTO remains in TW-04A. Adapter-owner evidence, actual route proof, clock handoff, and compatibility are TW-04A internal gates; a gated adapter cannot be admitted into TW-04B.
