# Ticket navigator snapshot fixture replay

Contract package source commit: `d27fe24e5cead1fae9ba86ac7b57ac5decf067d9`  
Fixture source commit: `31b3768e8043b6aeef66f0fe0fe648439ba80b2b`  
Fixture source tree: `150b23c5c7380f255c86d229a04e8f97c3366987`  
Contract archive SHA-256: `521b32fcfce7e464b7f04ca1945b72311311a9ba362902462bca77bbee361183`

The fixture inputs derive from the separate pinned source commit and tree above. The replay input records those values, and the replay checks them separately from the contract package source pin.

## Companion Orca layout

- `config/ticket-workspace-contracts-v1/lighteko-ticket-workspace-contracts-1.0.0.tgz`: the 30-file contract package archive.
- `config/ticket-workspace-fixture-v1/boundary-runtime.mjs`
- `config/ticket-workspace-fixture-v1/preload-entry.mjs`
- `config/ticket-workspace-fixture-v1/replay.mjs`
- `config/ticket-workspace-fixture-v1/fixture-ipc-corpus-v1.json`
- `config/ticket-workspace-fixture-v1/historical-orca-ipc-boundary-v1.corpus.json`
- `config/ticket-workspace-fixture-v1/README.md`

The replay imports only the installed package exports. It verifies that the installed package metadata carries the same source pin as the replay fixture input, checks the package artifact and corpus digests, binds accepted fixture IDs to expected canonical revisions, and runs the 22-case semantic corpus plus 15 fixture-envelope assertions through Node and a browser-like VM. Historical corpus bytes remain unchanged and are checked by SHA-256 and ordered ID list.

Results use fixture provenance and `orcaMatch: not-evaluated`. They do not claim live currentness, producer or transport authority, owner matching, cache behavior, mutation, or action authority. Live producer/cache/freshness assertions remain deferred to TW-06P/T; M5 action hiding remains deferred to TW-07F.

## Future root wiring and CI command

After the rights holder grants written authorization for the exact package bytes, the root package can add this local dependency (then regenerate the root pnpm lockfile):

```json
"@lighteko/ticket-workspace-contracts": "file:config/ticket-workspace-contracts-v1/lighteko-ticket-workspace-contracts-1.0.0.tgz"
```

With root dependencies installed from the public npm registry or a normal preseeded store, a public PR job can run from the repository root. `pnpm exec esbuild` uses Orca's pinned root tool; the isolated local-file consumer used for verification does not install its own esbuild:

```sh
pnpm exec esbuild config/ticket-workspace-fixture-v1/preload-entry.mjs --bundle --platform=browser --format=iife --global-name=OrcaTicketFixturePreload --outfile=tmp/ticket-workspace-fixture-preload.js --metafile=tmp/ticket-workspace-fixture-preload.meta.json
node config/ticket-workspace-fixture-v1/replay.mjs --contract-source-commit=d27fe24e5cead1fae9ba86ac7b57ac5decf067d9 --preload-bundle=tmp/ticket-workspace-fixture-preload.js
```

The consumer needs public npm packages only; it must not initialize the private ticket-workspace submodule or receive private repository credentials. The package declares Zod and `@noble/hashes`; the root lockfile would pin those public dependencies. This replay bundle is representative of a browser-target preload bundle; it does not prove actual Electron-vite preload packaging or Orca main-process wiring.

The archive is marked `private: true` and `UNLICENSED`. This archive, its metadata, and third-party notices grant no rights to ticket-owned schema, validator, artifact, or corpus bytes. Any use, copying, or redistribution requires separate written authorization from the rights holder.
