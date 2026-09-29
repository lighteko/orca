# Ticket Workspace — Active Review Findings

Snapshot date: 2026-09-29. This is a concise carry-forward of valid reviewer conclusions, not a reasoning transcript. See [project-state.md](./project-state.md) for current code/test evidence.

## Active invariants

1. **Exact identity, not path coincidence.** Bind evidence to a non-reused catalog/store incarnation and revision plus exact repository, execution host, workspace instance, canonical identity, kind, path, and actual route. Re-resolve and compare after asynchronous work. Missing, duplicate, stale, truncated, legacy-ambiguous, or ABA identity is unavailable.
2. **Route ownership is observed, not inferred.** A configured distro or `cwd` does not prove the actual Git route. WSL UNC precedence, Windows-authored WSL worktrees using host Git, and the operation-marker filesystem route must be treated separately. Never fall back to local Git when the requested host is unavailable.
3. **Native evidence is source-owned.** The Orca execution host creates the observation ID and immutable start timestamp. Callers/adapters cannot mint, refresh, or substitute the owner timestamp. Cross-process or cross-machine clocks require a validated handoff; wall clocks are not assumed synchronized.
4. **One fresh read per invocation.** Do not join ordinary UI `statusReadLeaseOwner` work or an older plan read. No stale clear-result cache. A single underlying child/marker probe slot remains owned until timed-out or cancelled work has actually settled.
5. **Completeness before clean.** Porcelain-v2 records must be completely parsed/accounted, including untracked files, submodules, unresolved gitlinks, limits, UTF-8 tail/stream errors, and any filtered shared-link records. `entries: []`, missing operation marker, or `didHitLimit !== true` alone is not completeness.
6. **Marker absence is positive evidence only after a successful bound read.** Present, confirmed absent, and unavailable are distinct. I/O error, unsupported path, route mismatch, stopped/unavailable distro, reparse, or unknown probe never means “none.”
7. **No public `clear` today.** Current internal capture is not a production evidence envelope. Keep plan incomplete/unavailable until target binding, complete status records, operation state, owner freshness, ticket mapping, and provider aggregation are all proven.
8. **Reuse Orca authorities.** Orca owns worktree/agent/terminal/orchestration lifecycle, status store, and Orca mutation receipts. Ticket code owns ticket catalog and external-resource lifecycle. Do not create parallel owners or conflate cleanup evidence.
9. **Preserve user state.** Branches, coordinator folders, and documents are preserved by default; ticket `Prune` must not change active workspace/editor/terminal focus.
10. **Compatibility.** Retain Git 2.25-compatible core operations and mixed-version wire rules. Any new wire field must be optional/negotiated as required by its channel; do not add an unnegotiated stream opcode.
11. **Effects need coordinator authority.** A read-only `plan` observation cannot authorize mutations. Live external effects require a one-use, target-bound plan token, attested root Run, admission and pre-effect revalidation, and a durable binding fence serial with Run use/create/bind/unbind. Orca actions retain their own receipts and read-back.
12. **Ticket actions require live current state.** Fixture-backed UI and stale snapshots cannot activate actions. Reattest the execution host and exact target before effect. Before worktree removal, set `preserveBranchOnDelete: true` on the target host's authoritative metadata and verify same-host ref HEAD, registration, and path afterward; archive, Orca removal, and external cleanup remain separate verdicts.

## Resolved concerns; retain as regression risks

- **Windows WSL auto-start risk:** ordinary drive-path `lstat` could start a mapped distro. The operation-marker reader now proves direct local-volume routes with `QueryDosDeviceW`, pins via GLOBALROOT, rejects reparse ancestors, and uses a no-follow marker leaf. CI built/loaded the addon and passed the real linked-worktree marker test. This proof does not cover earlier binding/status calls.
- **Windows slash normalization:** both `C:\...` and `C:/...` are supported by the bounded native-path evidence path; keep both variants covered.
- **Abort/deadline cleanup:** process termination must remain a tree-wide barrier. Do not release the one in-flight slot just because the caller timed out while the child is still alive.
- **Optional Windows addon import:** it is lazy-loaded only by the Windows reader; packaging tests enforce platform gating.
- **Windows test manifest omission:** the native path evidence integration was explicitly added to the Windows test manifest and passed on the current PR head.
- **Cross-version tags:** upstream is `stablyai/orca`, not the fork. The workflow fetches exact advertised stable refs with `blob:none`, checks every local stable tag's upstream provenance/object identity, requires `v1.4.184` and `v1.4.190`, and verifies fetched refs resolve to commits. Do not force, synthesize, skip, or freeze the dynamic latest baseline.
- **Tag-list shell failure:** process substitution does not propagate a failed producer through `set -e`. The workflow captures `git tag --list` in a checked assignment before the here-string loop.
- **Git archive partial clone:** the second promisor remote supplies omitted blobs lazily. Disposable WSL execution imported 401 tags and extracted latest `v1.4.216` in 14.1 seconds against 45 seconds; remote cross-version job also passed.
- **TW-01 overall deadline:** the first implementation started its 30-second timer after pre-attestation. The reviewed correction starts the overall timer before scheduling that attestation, stamps the owner read separately immediately before status I/O, and rejects late results. Focused tests, Node typecheck, and changed-code quality passed; retain the pre-attestation stall test.

## Unresolved / deferred findings

- The internal local-native source now owns the observation ID, immutable `ownerReadStartedAt`, and 30-second deadline. Ticket mapping, cross-process clock admission, production composition, and public verdicts remain open; never use adapter receipt time to make old evidence fresh.
- The ticket `WorkspaceRef` → exact Orca catalog tuple mapping and production composition port remain unimplemented in this checkout.
- The ticket-domain source exists in an unregistered WSL checkout, but most current M1 files/tests are untracked. A bounded SHA-256 manifest is recorded in [ticket-source-files.sha256](./ticket-source-files.sha256); its HEAD is still not portable provenance. Publish a retrievable tracked/archived revision before downstream allocation.
- Exact-workspace agent status, production test/lease/ownership sources, external-resource universe/host binding, and their complete-read semantics remain unresolved. Local owner survey exists only in ignored notes.
- WSL no-start route proof for status and cross-process clock admission are not delivered. SSH/paired remote targets are outside the first evidence slice.
- A concurrent hostile filesystem replacement after identity preflight cannot currently be excluded atomically. Read evidence is not transactional authorization for a later mutation.
- Windows native addon was not compiled locally (MSVC unavailable); current CI provides the build/load evidence. Local reproduction still requires a Windows C++ toolchain.
- Four POSIX process-group/detached assertions in the broad `runner-command-exec.test.ts` were reported failing on a Windows host; focused stream tests passed. Re-check only if changing that generic runner.
