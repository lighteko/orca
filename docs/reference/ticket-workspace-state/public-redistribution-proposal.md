# Ticket Workspace — Exact public-byte proposal

Status: **both exact-byte public-copy scopes approved and delivered**. The seven approved files are copied to the Orca paths below. PR #1 checks on `cde43160f` passed (31 success, eight skipped, zero failures). The private staging tree is `ticket-workspace/packages/contracts/.snapshot-candidate/public-copy-proposal/tree/` in this checkout; it is ignored and is not part of a fresh clone.

The proposed public copy is exactly **seven files / 87,199 bytes** under Orca `config/`. Its private file manifest is 3,382 bytes, SHA-256 `4a8104c9905b4676cc5230cc2ec91ae3cc059f4e2964d3389b9edd73081be6a4`. The reviewed rights packet is 5,866 bytes, SHA-256 `cf15511c1fdff9dd7d0b57dd17777f621ece777c9cbc460424906fa0e15b904e`.

| Proposed Orca path | Bytes | SHA-256 |
| --- | ---: | --- |
| `config/ticket-workspace-contracts-v1/lighteko-ticket-workspace-contracts-1.0.0.tgz` | 18,108 | `521b32fcfce7e464b7f04ca1945b72311311a9ba362902462bca77bbee361183` |
| `config/ticket-workspace-fixture-v1/README.md` | 3,618 | `6af6ad3364b33e632652253276da0e349fc2bd00914c260ef22666c3bcef1c10` |
| `config/ticket-workspace-fixture-v1/boundary-runtime.mjs` | 6,095 | `657c7eeb10a254ac0cab38ae3b5f309d23f0dccb06e8a801b7ddd389fcc37edb` |
| `config/ticket-workspace-fixture-v1/fixture-ipc-corpus-v1.json` | 11,833 | `8306f0181a26365e5c0a7b14018232e95f19a34859c458eceeefb5193ef1638c` |
| `config/ticket-workspace-fixture-v1/historical-orca-ipc-boundary-v1.corpus.json` | 30,632 | `52a68df5b1b76692bcfae3561e3f8b7d58133d924d955a2fd569675fe8b49663` |
| `config/ticket-workspace-fixture-v1/preload-entry.mjs` | 370 | `0809847781245f51c5bfd09c6d60d1224175408821547e4c324327fa475a6da8` |
| `config/ticket-workspace-fixture-v1/replay.mjs` | 16,543 | `3f84e31eaee6eb59ee7f367ef1d690484f35e711b59bab7d398aebd2dc8457b5` |

The archive's contract source pin is private commit `d27fe24e5cead1fae9ba86ac7b57ac5decf067d9`. It derives from the reviewed private archive SHA-256 `d88d083399865def40f2181da0c81e8fe0616f69b82bde62a1f2f5002ace723b`: only `README.md`, `THIRD-PARTY-NOTICES.md`, `package.json` description, and the recalculated internal manifest differ. Its 26 other members, including runtime code, declarations, artifact and 22-case corpus, are byte-identical. The fixture source is separate private commit `31b3768e8043b6aeef66f0fe0fe648439ba80b2b`, tree `150b23c5c7380f255c86d229a04e8f97c3366987`; the private manifest pins each source fixture blob.

The contract archive exposes snapshot schemas, validator and canonical digest rules, SSH presentation restrictions, duplicate-ID rejection, action/status names, ledger revision/epoch field names, bounds, artifact and test corpus. The six fixture files expose the historical 37-row IPC corpus and a fixture-only replay. They do not include the CLI, ledger persistence, resource adapters, live producer/transport or effect implementation. The package remains `private: true` and `UNLICENSED`; third-party notices do not grant rights to ticket-owned bytes.

A fresh Sol reviewer checked the exact seven hashes, all 30 archive members and the four-file derivation, fixture Git blobs, cached offline/frozen tarball-only install with blank npm credentials, TypeScript, and Node/browser VM replay of 22 source cases plus 15 envelope assertions. The Orca copy adds a frozen local `file:` dependency and public PR fixture verification without private credentials; [the public PR checks](https://github.com/lighteko/orca/actions/runs/36565823569) passed at `cde43160f`. Nine live producer/cache rows and three freshness assertions remain deferred to TW-06P/T; M5 action hiding remains TW-07F. Actual Orca main/preload integration and release packaging remain unverified.

**Decision recorded:** the user approved public redistribution of (1) the exact contract archive and (2) the exact six fixture/replay files at the paths and hashes above, then instructed the Orchestrator to proceed with delivery. This authorizes these exact bytes in public Orca. It does not publish the package to a registry, authorize changed bytes, or certify live behavior. Independent review and public PR CI approved the delivery, dependency/lockfile and fixture replay wiring.
