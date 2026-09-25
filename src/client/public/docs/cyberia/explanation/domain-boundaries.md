# Cyberia domain boundaries

Cyberia runs on content three other domains own. This states which domain owns what, and the
one rule that keeps canonical content single-writer.

## Domain ownership

| Domain                     | Owns                                                                                   | Consumes                                | Main client / instance |
| -------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------- |
| `underpost.net`            | Engineering journal, laboratory                                                        | —                                       | `underpost`            |
| `objectlayer.org`          | `object-layer`, `object-layer-render-frames`, `atlas-sprite-sheet`, `ipfs`             | ItemLedger (read, over HTTP)            | `objectlayer`          |
| `itemledger.com`           | `item-ledger`, `item-ledger-transfer`, `item-ledger-balance`, `item-ledger-checkpoint` | Object Layer (read, over HTTP)          | `itemledger`           |
| `cryptokoyn.net`           | CKY finance views, the wallet UI                                                       | —                                       | `cryptokoyn`           |
| `www.cyberiaonline.com`    | `cyberia-*` world, content and runtime APIs                                            | Object Layer (cache), ItemLedger (HTTP) | `cyberia-portal`       |
| `server.cyberiaonline.com` | Authoritative simulation (Go), world state                                             | Cyberia engine gRPC + REST boot fallback | `mmo-server` instance  |
| `client.cyberiaonline.com` | Runtime client (C/WASM)                                                                | Cyberia engine REST, cyberia-server WS  | `mmo-client` instance  |

`conf.server.json` states the split. A host lists what it mounts in `apis`, and every API another
domain owns in `consumes: { "<api>": "<domain>" }`. `cyberia run-workflow validate-domains` checks
that split and runs as Stage C of every deploy.

| For Cyberia     | Object Layer                                               | ItemLedger                                         |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Source of truth | `objectlayer.org`                                          | `itemledger.com`                                   |
| Local copy      | Drafts and cache in the workspace; cache in releases       | None                                               |
| Reads           | `resolveObjectLayer` → `OBJECT_LAYER_API_ORIGIN`           | `resolveLedgerBindings` → `ITEM_LEDGER_API_ORIGIN` |
| Writes          | `POST /api/v1/object-layer/canonical` with the service key | None in Open Alpha                                 |
| Unreachable     | Release build fails; the live release keeps serving        | Definitions serve as unregistered                  |

A browser client reads another domain's service at its owner: `apiHosts` in `conf.client.json`
maps the endpoint to the owning host, and that host lists the client's origin in `origins`.

No domain opens another domain's database. `test/ecosystem/contract/cross-domain-reads.test.js` scans the
Object Layer and ItemLedger APIs for model reads across that line.

When `OBJECT_LAYER_API_ORIGIN` or `ITEM_LEDGER_API_ORIGIN` is not set, a host reaches the owner host of
its own deploy on its local port, from the same port map the proxy routes by.

## One Object Layer writer

`objectlayer.org` is the only writer of published Object Layers. Cyberia authors drafts and keeps
copies. It never holds an authoritative published definition.

```
draft ──▶ profile check ──▶ canonical bytes ──▶ contentHash ──▶ CID ──▶ authority store ──▶ label binding
```

| Origin      | Where                          | Meaning                                                           |
| ----------- | ------------------------------ | ----------------------------------------------------------------- |
| `draft`     | Cyberia workspace              | Authored, not published. Never bound, never copied into a release |
| `cache`     | Cyberia workspace and releases | A copy of what the authority holds, checked against its CID       |
| `canonical` | `objectlayer.org`              | Published and immutable. The API never deletes it                 |

- The Studio writes through `publishDefinition`. It stores a draft, sends it to
  `POST /api/v1/object-layer/canonical` with the service key, and checks the CID the authority
  returns. Only then does the copy become `cache` and the label bind to it.
- When the authority does not answer, the draft stays and the label keeps its binding. The write
  fails with `Object Layer <cid> is kept as a draft: <reason>`. No second writer takes over.
- A host that consumes Object Layer refuses `POST /canonical`.
- The generic Object Layer APIs import no Cyberia module. The Studio routes come from
  `src/projects/cyberia/object-layer.extension.js` and `atlas-sprite-sheet.extension.js`. The
  Cyberia host declares them in `apiExtensions`. The Cyberia profile is an explicit input.
