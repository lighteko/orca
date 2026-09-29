# TW-M1P — Ticket profile and base runtime delivery

Status: **proposal for independent review**, 2026-09-30. This packet refines [TW-M1P in the Task DAG](./task-graph.md); it does not authorize installation or select a publisher. The TW-06P resident service artifact is a separate output. TW-06T production setup needs both artifacts.

## Verified source boundary

- The private CLI at pin `54477c2371094f1cbc438845fdfde0ca3584e2aa` requires Node `>=22.13.0`, has a Node shebang, and imports `node:sqlite`. Its package version is currently `0.0.0`. See `ticket-workspace/packages/cli/package.json`, `src/ticket-workspace-cli.ts`, and `src/sqlite-process-fence.ts` in the submodule.
- The recorded offline tarball test used an already available Node 22 runtime and an isolated ext4 prefix. It proved local package execution, not Node delivery, profile onboarding, update, or rollback. See `ticket-workspace/README.md`.
- Profile and machine config validation checks declared IDs and versions. Catalog validation checks profile, authority, machine, distro, and state-root fields. None of those string checks prove the installed executable or physical host identity. Authority issue/adopt are separate explicit operations; install must not invoke them implicitly.
- Orca has `buildWslExecArgs` and shared `runProcess`/`spawnProcess` boundaries. WSL commands require explicit distro/user selection and `--exec`; see [WSL command execution](../wsl-command-execution.md). No production ticket installer or resident service exists at this pin.
- Official Node release material offers versioned Linux archives and signed checksums. Node `22.23.3` with bundled npm `10.9.9` is a **candidate exact pin**, not a tested project release. Its archive and verification instructions are at [Node v22.23.3](https://nodejs.org/en/download/archive/v22.23.3) and [Node binary verification](https://github.com/nodejs/node#verifying-binaries). [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) document explicit distro/user selection and WSL version inspection, but do not document a stable registration identity suitable for ticket authority. npm 10 documents [local tarball installation](https://docs.npmjs.com/cli/v10/commands/npm-install/), [locked project installation](https://docs.npmjs.com/cli/v10/commands/npm-ci/), and [offline/ignore-scripts settings](https://docs.npmjs.com/cli/v10/using-npm/config/); `--offline` alone does not prove a complete locked tarball closure.

## Proposed v1 contract

**Target.** Begin with one explicitly selected WSL2 Linux distro, one architecture/libc tuple, one effective Linux UID, and one profile artifact. Ubuntu 24.04 x64/glibc is a candidate, subject to an actual target probe and owner selection. Reject unsupported tuples; never choose the default distro implicitly. Do not rely on a system Node install.

**Publisher manifest.** A trusted publisher emits an immutable canonical manifest and detached signature. The manifest binds:

- manifest schema, delivery ID, source repository/commit/tree, lockfile, build workflow/image and target OS/distro/WSL/architecture/libc compatibility;
- exact Node version, upstream archive URL, filename, size, digest, and publisher-recorded verification of Node's signed checksum material;
- complete CLI/contracts/runtime package tarball closure with package identity, size, and digest;
- profile source/path, schema ID/version, profile ID/version, size, and digest;
- relative executable/profile entry points, compatibility versions, signing key ID and algorithm.

Orca verifies a trusted publisher signature and every artifact digest before transfer; the selected WSL target hashes received bytes again before extraction. The signature trust anchor must come from outside this manifest. Source commit/tree/lock/build fields and the publisher's upstream-checksum result are signed **publisher claims**, not an independently proven reproducible build. The current `0.0.0` package version is insufficient as release identity. Publisher keys, channel, revocation, and the profile artifact owner are **unselected**.

**Binding and enrollment.** Phase 1 installs a verified host/profile-bound **unbound base release** without an authority ID. It is usable only by a separately authorized, explicit authority issue/adopt flow; it cannot start a ticket service or claim production setup. Phase 2 explicitly binds a selected release to the existing authority ID and machine config after that flow succeeds, writing a new binding receipt without mutating the immutable release bytes. The receipts record manifest/artifact digests, profile schema/ID/version, machine ID, authority ID when bound, observed Windows host and selected WSL distro name/version, effective Linux UID, architecture and libc. Windows host and WSL registration identity remain **unproven**; observed names and IDs are an enrollment scope, not physical authentication. The owner must select stable evidence, threat limits and rebind behavior before wrong-host/registration claims become acceptance criteria. Orca rechecks the selected scope during explicit binding. TW-06T later rehashes installed Node/CLI/profile bytes before service launch or attach and authenticates the service hello against the bound tuple; a receipt alone is insufficient.

**Install and activation.** Only an explicit Orca setup action can preview and confirm the target/profile/release and owned file effects. A single writer fence scoped to the enrolled runtime root serializes install, authority binding, update, rollback and recovery; the fence's ownership and crash semantics need an implementation proof. Confirmation expires on target, manifest, profile, config, authority, or active-release change; recheck under that fence before writing. Stage verified artifacts under a product-owned ext4 runtime root separate from user config and ticket state. Use the exact bundled Node/npm 10 with a clean cache and locked local tarball closure; run offline with scripts disabled. Packed distributions must already contain verified executable `dist`/bin output because scripts will not build it. Verify executable versions and strict profile/config compatibility. One ext4 active-release record is authoritative; Windows keeps only an observation, never a second activation pointer. Write and sync candidate files and receipt, atomically replace the active record on the same ext4 filesystem, then sync its parent directory. This gives an ordered recovery protocol; rename alone does not prove durable cross-host transaction completion. Preserve the previous release. Do not edit `PATH`, shell startup files, user config, authority, catalog or ledger, and do not start a resident service in this task.

**Update and rollback.** Stage new immutable releases; never update an active global npm prefix in place. A profile/config mismatch leaves the candidate inactive. Rollback has a separate preview/confirmation bound to the current receipt and retained release, with host/profile/authority rechecks under the same single writer fence. Interrupted staging preserves the previous active release. On an ambiguous active-record write or sync result, retain both releases and report `unverifiable`; reread the sole ext4 active record and receipts during explicit reconciliation before any further activation. Windows observations never override that record; disagreement between its observation and the ext4 record is `unverifiable` until explicitly reconciled. Startup and snapshot reads do not repair or switch versions. A security-revoked release must not be a rollback target, subject to an owner policy still to be chosen. The atomic-visibility claim relies on same-filesystem rename semantics, while durability needs the explicit sync sequence; see [Linux rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html).

**Read boundary.** Orca UI snapshot/status reads with missing or stale setup return unavailable without invoking WSL, Node, CLI, shell, service start, attach, or reconnect. This does not prohibit an explicitly invoked private CLI `status` command from running Node. TW-M1P delivers Node/CLI/profile provenance only. TW-06P separately delivers a pinned resident service artifact; TW-06T production setup joins and authenticates both. WSL-only delivery remains behind runtime platform checks; macOS, native Linux and SSH targets are explicitly unsupported in v1.

## Owner decisions before an implementation packet

1. Name the profile artifact owner, exact source, ID/version, and config reconciliation owner.
2. Choose a private artifact publication/access channel and publisher; avoid personal credentials in production setup.
3. Choose signing algorithm, trust anchor, key custody, revocation, and rotation.
4. Select the initial WSL distro/version/architecture/libc tuple after probing the intended target.
5. Ratify the host-binding threat model, enrollment/rebind semantics, and approved Windows/WSL identity evidence. Orca's existing managed-hook `MachineGuid` use is not approval for general ticket identity; WSL distro name/version is not a durable registration identity.
6. Define explicit authority issue/adopt ownership, retained-release duration, and rollback restrictions for revoked releases.
7. Select an exact Node build and replay install/update/rollback acceptance on it; the earlier offline test used Node `22.23.2`, not candidate `22.23.3`.

## Acceptance before production setup

| Case | Required result |
| --- | --- |
| Fresh supported WSL2 target without Linux Node | Explicit offline phase-1 install verifies trust and hashes, writes only product-owned runtime files, leaves config/authority/ledger untouched, and remains unbound. |
| Explicit authority issue/adopt then bind | Separately authorized authority flow precedes a phase-2 binding; unbound releases cannot launch or attach a service. |
| Wrong host/enrollment scope, WSL1, selected distro release, UID, architecture or libc | Reject binding/activation against the owner-approved identity evidence and threat model; no current registration-ID proof is claimed. |
| Unknown signer, invalid signature, source mismatch or corrupt artifact | Reject without fallback download or partial activation. |
| Wrong profile/config/authority | Remain unbound/unavailable; do not rewrite user state. |
| Update or fault during transfer/install/receipt/switch | One ext4 active record remains authoritative; sync/rename/recovery order preserves prior release or reports `unverifiable`, with explicit reconciliation and both releases retained. |
| Rollback | Activate only a retained, verified, compatible and permitted release after separate confirmation. |
| Orca UI read without valid setup | Return unavailable with zero WSL/Node/CLI/service launch attempts. |
| TW-06T production setup | Rehash installed base bytes, join the bound receipt to a separately pinned TW-06P service artifact, and authenticate the same tuple in hello. |

Contract research can run beside TW-07F. Once publisher, target and binding decisions are frozen, private artifact work and Orca setup work may be separated by file ownership. Private CLI/profile/catalog changes must serialize with TW-05 and TW-06P edits to those modules. The smallest next test is an isolated Node `22.23.3`/npm `10.9.9` offline locked-tarball-closure replay without WSL launch or product installation. No product installer is implemented by this proposal.
