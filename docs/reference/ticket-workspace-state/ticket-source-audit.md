# TW-00 ticket source audit

- Audit date: 2026-09-29
- Scope: read-only audit of the WSL ticket checkout; no ticket checkout files were changed.
- Status: the bounded audit is complete. TW-00 remains open because no retrievable tracked or archived source revision exists.

## Source and revision provenance

**FACT:** WSL was checked before direct access. Read-only `wsl.exe --distribution Ubuntu-24.04 --exec` reads of the checkout succeeded.

**FACT:** `/home/sellmate/ticket-workspace` is on branch `main` at HEAD `cf184eaa588f9155636dec036f624595c3d46532`.

**FACT:** The current worktree has seven modified tracked paths and 90 untracked paths:

- Modified tracked: `README.md`; `packages/cli/package.json`; `packages/cli/src/sqlite-process-fence.ts`; `packages/cli/src/ticket-workspace-repository-plan.ts`; `packages/cli/test/sqlite-process-fence.test.ts`; `packages/cli/test/ticket-workspace-repository-plan.test.ts`; `packages/contracts/package.json`.
- The 90 untracked paths include the current contracts implementation, most CLI implementation and tests, both contract corpora, the generated contract artifact, a CLI config fixture, and a CLI script.

A clean clone of the HEAD above does not contain those 90 untracked files or the seven tracked-file edits. The HEAD therefore identifies a base revision, not the M1 source currently being audited. No files in the ticket checkout were staged, changed, or committed.

## Bounded content manifest

[ticket-source-files.sha256](./ticket-source-files.sha256) records SHA-256 hashes for the in-scope source, tests, fixtures, artifact, relevant package/workspace/lock configuration, process-fence spikes, and four tracked package design documents. It excludes Git metadata, node_modules, generated dist/build output, caches, temporary data, and paths outside its listed scope.

**Limit:** The manifest records current bytes but cannot reconstruct untracked files or establish an available revision for a fresh clone. The locally ignored Orca work-plan/spec files are design references, not source publication.

## M1 source presence versus verification

The checkout contains 65 TypeScript source files under the two packages, 32 `*.test.ts` files, and four fixture/artifact JSON files. This is a file-presence inventory, not a review that every behavior matches its claim.

| M1 slice                                                                                 | Current source/test evidence found                                                                                                                                                                             | Audit result                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: contract/schema                                                                       | Contract package sources for catalog, navigator snapshot, canonical JSON, validation and artifact generation; contract tests; workspace-schema corpus, repository-plan-evidence corpus and generated artifact. | Source, tests and fixtures are present. Test behavior is unverified here.                                                                                                                                                                                   |
| B: profile/config                                                                        | Config schema, precedence, loader and resolution modules; config tests and CLI config fixture.                                                                                                                 | Source, tests and fixture are present. Test behavior is unverified here.                                                                                                                                                                                    |
| C-E: ledger read, initialization and CAS                                                 | Ledger store, initialization/update capabilities, trusted WSL ledger files/CAS/fence modules and SQLite process-fence source; corresponding tests.                                                             | Source and tests are present, including locally modified fence code/tests. Test behavior is unverified here.                                                                                                                                                |
| F-H: read-only preflight/settings preview, authority identity and state-root preparation | Preflight, diagnostics, settings preview, authority identity/lifecycle and state-root preparation modules; corresponding tests.                                                                                | Source and tests are present. Test behavior is unverified here.                                                                                                                                                                                             |
| I-J: catalog init and doctor diagnostics                                                 | Catalog initialization, backup-only diagnostics and CLI composition modules; corresponding tests.                                                                                                              | Source and tests are present. Test behavior is unverified here.                                                                                                                                                                                             |
| K: read-only status                                                                      | Status projection and CLI modules with CLI tests.                                                                                                                                                              | Source and tests are present. Test behavior is unverified here.                                                                                                                                                                                             |
| L-M: plan evidence and role/blocker projection                                           | Contract admission/schema, plan projection, repository-plan source and tests; repository-plan corpus. The tracked repository-plan source/test are modified.                                                    | Contract and projection source/tests/fixture are present. The CLI calls the plan projection without an observation port; the source returns an incomplete result when observations are unavailable. Live owner evidence is not present in this composition. |

**CLAIM:** The local Orca work plan marks bounded M1 slices complete and records prior passing test counts, including 32 test files, 314 passed and one skipped for M1-M. This audit did not reproduce those runs; those counts remain historical claims here.

**FACT:** The source itself leaves M1 incomplete. The plan CLI does not wire the optional observation port, and the projection code handles unavailable observations as incomplete. The ignored plan also leaves profile install/update/rollback, production owner providers, adapter compatibility/effects/reconciliation, and Orca receipt correlation open. In particular, M1 does not establish six trusted live observations or a public `clear` result.

## Test feasibility and limit

The declared root command is `pnpm test`; the root script delegates through `corepack pnpm`, builds contracts, then runs package tests. The CLI package test script also builds before Vitest, so running it in this checkout would write build output.

No package test command ran in this audit. WSL reports `node: not found`; `corepack --version` fails with `corepack: not found`; direct `pnpm --version` fails with `exec: node: not found`. The WSL PATH resolves Windows-side POSIX wrapper files under `/mnt/c`; `node.exe` exists at `/mnt/c/nvm4w/nodejs/node.exe`, but no Linux `node` executable is available to those wrappers. A Vitest shim exists under node_modules, but it also needs Node.

The package declares pnpm 12.0.0 and the CLI requires Node >=22.13.0. A safe replay needs a disposable extracted/published source revision with Linux Node >=22.13.0 and the pinned package manager available. This audit did not install packages, run a build, or create a disposable copy.

## Publication prerequisite for dependent tasks

Before TW-02, TW-04A, TW-05 or TW-06T consumes this M1 source, its owner must publish one immutable, retrievable source revision or archive containing the full current checkout content: the seven tracked edits, all 90 untracked paths, package manifests, lock/workspace configuration, tests, fixtures and generated contract artifact. A published Git commit reachable to workers is preferred; an immutable archive is also acceptable if it preserves the complete source tree and its base/revision identity.

The published content must be checked from a fresh clone or extraction against a manifest and must not omit untracked files. A hash manifest by itself is insufficient. Downstream workers should record the retrieved revision/archive identity and verify the relevant fixture/test suites in the Linux Node/pnpm environment before treating prior completion claims as reproduced.

## Required report fields

- **TASK_ID:** TW-00-AUDIT
- **STATUS:** Bounded read-only audit complete; TW-00 remains open pending retrievable source publication.
- **COMPLETED:** Revision/dirty inventory; file-level M1 inventory; fixture inventory; bounded SHA-256 manifest; test-feasibility assessment.
- **FILES_CHANGED:** TW-00 wrote only this audit and `ticket-source-files.sha256`. Final shared-worktree status also showed edits to `src/main/runtime/runtime-git-status-record-capture.ts` and its test during parallel TW-01 work; this audit did not touch them.
- **VERIFICATION_RESULTS:** Git status/ls-files, targeted source/test/fixture inventory and SHA-256 collection completed. No tests ran.
- **NEW_FACTS_DISCOVERED:** Corepack/pnpm wrappers are present on WSL's Windows-mounted PATH but cannot launch because Linux Node is absent; Windows `node.exe` exists separately.
- **NEW_DEPENDENCIES:** None.
- **ASSUMPTIONS_INVALIDATED:** "Corepack is simply absent" is imprecise; a wrapper is discoverable, but unusable in WSL. The prior test-pass records were not independently reproduced.
- **DEVIATIONS_FROM_PLAN:** No isolated test run was attempted because the Linux Node runtime is unavailable and the package test scripts build into the checkout.
- **TEMPORARY_SOLUTIONS:** The hash manifest is a bounded identity aid only; it is not a source archive.
- **OPEN_CONCERNS:** Source is mostly untracked/dirty; M1 live observations/providers and other listed open slices remain incomplete; tests are not reproduced.
- **CROSS_WORKSTREAM_IMPACT:** TW-02, TW-04A, TW-05 and TW-06T must consume a published full source revision/archive. No downstream task should treat the base HEAD or historical pass counts as the current reproducible source.
- **RECOMMENDED_STATE_UPDATE:** Keep TW-00 open until the source owner publishes the complete tree and a fresh retrieval verifies its contents.

## Publication follow-up

The audited content was committed with a README provenance update as `2045808ffdb6baead2e659855cefb02f7b36491c` (tree `50d168f58db92c98b8e70cc32ed1dfbc1c5736a2`) and pushed to private `lighteko/ticket-workspace`. A fresh clone matched the commit, tree, all 128 paths, and file hashes. The initial 128-file manifest is preserved in Orca commit `d1f86d608`; [the current manifest](./ticket-published-source.sha256) covers the later 157-file private revision at `31b3768`. The earlier manifest above remains the prepublication audit record. The source checkout was clean at publication.

An isolated Linux replay of the audited source passed with Node 22.23.2 and pnpm 12.0.0: 32 test files, 314 tests passed, one skipped, and `pnpm typecheck` passed. The container needed a WSL ext4-backed `TMPDIR` and `WSL_DISTRO_NAME=Ubuntu-24.04`; its initial overlay/distro-unset failures were environment setup failures. Only the README changed after the tested copy was made. This verifies the bounded M1 source/test baseline, while live owner-provider and public verdict work remain open.
