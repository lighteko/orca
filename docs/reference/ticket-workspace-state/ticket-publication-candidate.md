# TW-00 ticket source publication candidate

- Audit date: 2026-09-29
- Source: `/home/sellmate/ticket-workspace` on Ubuntu-24.04
- Candidate base: `main` at `cf184eaa588f9155636dec036f624595c3d46532`
- Current state: 7 modified tracked paths and 90 non-ignored untracked paths; no remote is configured.
- Status: the current source tree has an exact staging recipe. Resolve the README wording concern below before publishing; any source edit requires rerunning the inventory and hash check.

## Exact content to publish

Publish the complete current Git tree: all 38 files tracked at the candidate base, including clean baseline files, plus the seven tracked edits and all 90 current non-ignored untracked files. That yields 128 files in the commit tree. Do not cherry-pick only the M1 files: the root workspace files, `.gitignore`, package manifests and lockfile, four package design documents, and both process-fence/restart harness spikes are part of this checkout's build and source context.

The seven modified tracked paths are:

- `README.md`
- `packages/cli/package.json`
- `packages/cli/src/sqlite-process-fence.ts`
- `packages/cli/src/ticket-workspace-repository-plan.ts`
- `packages/cli/test/sqlite-process-fence.test.ts`
- `packages/cli/test/ticket-workspace-repository-plan.test.ts`
- `packages/contracts/package.json`

All 90 untracked paths are under these exact directories: `packages/cli/scripts/`, `packages/cli/src/`, `packages/cli/test/`, `packages/contracts/artifacts/`, `packages/contracts/fixtures/`, `packages/contracts/src/`, and `packages/contracts/test/`. The current `git status --short --untracked-files=all` output is the exact file-level inventory; it reports no additions outside those directories.

Exclude `.git` internals and ignored local/build content. The checked-in `.gitignore` excludes `node_modules/`, `dist/`, `coverage/`, and `*.tsbuildinfo`. There are no generated `dist` or build outputs in the candidate set. Include `packages/contracts/artifacts/ticket-workspace-contract-v1.json`: it is an intentional generated protocol artifact, paired with the generator and fixture corpora, and the README says tests compare it byte-for-byte.

## Safe staging and verification recipe

Run these only in the WSL source checkout, after confirming the initial revision and inventory still match this report:

```sh
cd /home/sellmate/ticket-workspace
test "$(git rev-parse HEAD)" = cf184eaa588f9155636dec036f624595c3d46532
git status --short --untracked-files=all
git add -u
git ls-files --others -z --exclude-standard | xargs -0 -r git add --
git diff --cached --check
git diff --cached --name-status
git status --short
```

The staged name-status must contain exactly 7 `M` entries and 90 `A` entries, with no deletions or other paths. Stop if the pre-stage inventory differs from 7 modified and 90 untracked paths. Commit that reviewed tree on `main`; push only to the requested private remote, without force-pushing. After push, clone the commit into a fresh temporary directory and compare `git rev-parse <published-commit>^{tree}` with `git rev-parse HEAD^{tree}` in the clone. Matching tree IDs prove the fresh clone has the same paths and contents. Recheck the current 127-entry SHA-256 manifest in both source and clone; all entries should match, while `.gitignore` is intentionally outside that manifest's scope.

Run package tests and typecheck from the fresh clone in Linux with Node `>=22.13.0` and pnpm `12.0.0`. The previous audit could not replay them because WSL has no Linux Node runtime, and the package test scripts build into the checkout.

## Read-only checks

- Manifest: 127 entries; zero missing files and zero SHA-256 mismatches.
- All 97 changed/untracked paths are covered by the manifest. Its only omission from the 128-file publish tree is the clean, tracked `.gitignore`.
- Candidate tree: 38 tracked files plus 90 untracked files; no dirty paths outside the manifest or candidate tree.
- Secret/binary/size heuristics: no credential-shaped matches or credential-like filenames; no NUL-detected binary files; no file over 1 MiB. These are pattern checks, not proof that source contains no sensitive information.
- `git diff --check HEAD`: passed.
- No tests ran as part of this read-only publication preparation.
- No `LICENSE`, `COPYING`, or `NOTICE` file is tracked.

## Publication concerns and cross-workstream notes

- The modified README currently says the repository is local-only and that no remote is configured. That will become inaccurate once the selected private Git remote is added. Have the source owner clarify that wording before publication, then repeat the status and hash audit; do not silently publish stale provenance text.
- The root and CLI package manifests are private, but `packages/contracts/package.json` has no `private: true`. A private Git remote does not itself publish packages, but registry publishing should remain disabled until the package owner resolves this and confirms licensing/ownership. No license file was found, so keep the remote private and access-limited pending that decision.
- This source is a separate repository and its README states that Orca consumes released protocol artifacts rather than importing lifecycle implementation. Downstream TW-02/TW-04A/TW-05/TW-06T must pin the published commit/tree and verify their relevant tests and fixtures; base commit `cf184eaa...` or the SHA manifest alone cannot retrieve the current dirty source.
- `packages/contracts/artifacts/ticket-workspace-contract-v1.json`, both contract corpora, and the CLI config fixture are required provenance/fixture inputs. Preserve them with the source and do not substitute Orca copies without contract-owner review.

## Proposed Orca submodule integration

The user's proposed submodule preserves the ticket package as a separate repository while pinning an exact source commit from Orca. The concrete candidate is a new private `lighteko/ticket-workspace` GitHub repository and an Orca gitlink at `ticket-workspace/` with its HTTPS remote in `.gitmodules`. That repository does not exist yet. The Orca fork is public, so the submodule URL and pinned commit ID would be public metadata, while cloning the private source requires separate access.

The root `pnpm-workspace.yaml` lists only two native packages explicitly, so the submodule would not become part of Orca's pnpm workspace by placement alone. Existing Orca GitHub workflows use `actions/checkout` without `submodules: true`; their ordinary Orca checks would not fetch the private source. Any new ticket-package CI job would need a private-repository credential with narrowly scoped read access and a policy for untrusted pull requests. Do not enable authenticated submodule checkout in public PR jobs by default. Verify a clean authorized clone with `git submodule update --init ticket-workspace` and compare the checked-out gitlink with the published ticket commit before assigning downstream tasks.

## Required report fields

- **TASK_ID:** TW-00-PUBLICATION-PREP
- **STATUS:** Candidate inventory and staging recipe complete; source remains unpublished and unchanged.
- **COMPLETED:** Full-tree include/exclude rules, exact dirty-path counts and modified-path list, scan results, staging and fresh-clone verification recipe.
- **FILES_CHANGED:** This candidate report only.
- **VERIFICATION_RESULTS:** Git status matched 7 modified and 90 untracked paths; all 127 manifest hashes matched and all dirty paths were covered; only `.gitignore` was outside manifest scope; no large/binary/credential-pattern hits; `git diff --check HEAD` passed.
- **NEW_FACTS_DISCOVERED:** Candidate commit tree has 128 files; README's no-remote statement will become stale after remote setup; the contracts package is not marked private; repository has no license/notice file.
- **ASSUMPTIONS_INVALIDATED:** None beyond the publication metadata concerns above.
- **OPEN_CONCERNS:** Clarify README publication wording and confirm package/licensing ownership before distribution beyond the private Git audience. Linux test replay still needs Node 22.13+ and pnpm 12.
- **RECOMMENDED_STATE_UPDATE:** Keep TW-00 open until a private remote contains the committed 128-file tree and a fresh clone verifies the published tree identity and test/fixture inputs.
