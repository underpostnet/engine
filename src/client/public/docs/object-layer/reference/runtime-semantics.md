# Runtime semantics matrix

Three runtimes carry Object Layer data: the Node engine (engine-cyberia), the Go simulation
(cyberia-server) and the C/WASM client (cyberia-client). This is what each field means in all
three. A field means the same thing everywhere or it is a defect.

The wire carries one identity, the `cid`: `contentHash` is the digest the CID already holds, and
every definition a Cyberia runtime reads is under the Cyberia profile, which the content release
checks. Neither travels.

## Fields

| field            | Node                                       | Go                                         | C                                     | meaning                                                      | lifecycle                                              | mutability                                  |
| ---------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| `itemId`         | `data.item.id`                             | `Data.Item.ID`, OL cache key               | `data.item.id`, layer key             | Semantic label. Never unique, never identity.                | Authored; a label may be rebound to another definition | Free                                        |
| `olCid`          | `cid`                                      | `ObjectLayer.Cid`                          | `ObjectLayer.cid`                     | Canonical identity of one immutable definition               | Computed before publication; never changes             | Immutable                                   |
| `contentHash`    | `contentHash`                              | not sent                                   | not sent                              | sha2-256 of the canonical bytes; the digest the CID carries  | With `olCid`                                           | Immutable                                   |
| `profile`        | `profile {id,version}`                     | not sent                                   | not sent                              | Contract that interprets `stats` and `item.type`             | Part of the canonical content                          | Immutable                                   |
| `render`         | `data.render {cid,metadataCid}`            | `Data.Render`                              | `data.render`                         | Canonical render CID and canonical metadata CID              | Part of the canonical content                          | Immutable: a new render is a new definition |
| render metadata  | `AtlasSpriteSheet.metadata`                | not read                                   | `AtlasSpriteSheetData`                | Layout of the primary render: sizes and frame boxes in cells | With the render                                        | Immutable                                   |
| `ledger`         | ItemLedger binding projected onto the wire | `Data.Ledger` (`nil` when unregistered)    | `data.ledger` (`LEDGER_UNREGISTERED`) | Registration projection: standard, chain, contract, token id | Follows chain state                                    | Mutable, outside the content                |
| `tokenId`        | `objectLayerTokenId(cid)`                  | `Ledger.TokenID`                           | `ledger.token_id`                     | `uint256(contentHash)`                                       | With the definition                                    | Immutable                                   |
| `published`      | `published`                                | not sent                                   | not sent                              | Whether a node serves the canonical bytes                    | Follows pinning                                        | Mutable, outside the content                |
| `origin`         | `origin`: `draft`, `cache`, `canonical`    | not sent                                   | not sent                              | Where a stored copy stands in publication                    | Moves only up                                          | Mutable, outside the content                |
| pinned reference | `objectLayerCid` beside a label in content | `ObjectLayerCid` on quest and action items | not read                              | The definition persisted content means                       | Written when the content is authored or migrated       | Changes only with the content               |

## Absence

| value                                                             | meaning                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ledger.standard` empty / `Ledger == nil` / `LEDGER_UNREGISTERED` | The definition is not registered on any chain. Never "off-chain state".  |
| `render.cid` empty                                                | No render yet. The definition is still valid and has an identity.        |
| `objectLayerCid` empty on a content reference                     | The reference is not pinned yet; the migration pins it from the catalog. |
| `published: false`                                                | The bytes are not served under the CID. The identity is unchanged.       |

## Identity flow

```
engine: content pins olCid ─┐
                            ├─ boot payload (gRPC/REST): definitions keyed by label,
catalog: itemId → olCid ────┘                            each carrying its cid
                                     │
                       Go: OL cache keyed by label, Cid kept; hot reload diffs by cid
                                     │
                       C: layer cache keyed by label, cid kept
```

The label is the key of one world load; the CID is what the label resolved to. The Go hot
reload diffs the manifest by `cid`, so a label rebound to another definition reloads.

## Runtime handle

The handle a runtime holds for an Object Layer is the pair **label + resolved `olCid`**: in
persisted content the pinned `{itemId, objectLayerCid}` fields, and at runtime the manifest entry
the label resolves to. The pair carries both a readable name and an exact definition, so no
separate reference type exists. New content declares its pinned paths in
`src/api/cyberia-item-catalog/item-ref.js`; it does not invent another handle.

## Rules

1. No runtime treats `itemId` as identity.
2. No runtime derives identity from anything but the canonical content.
3. Only the Object Layer authority (`objectlayer.org`) writes canonical content. A consumer keeps
   drafts and cached copies, and binds a label only to a published definition. Go and C only read.
4. Ledger state never reaches the canonical content in any runtime.
5. A field renamed on the wire keeps its old protobuf number reserved
   (`cyberia-server/gen/proto/compat_test.go`).
