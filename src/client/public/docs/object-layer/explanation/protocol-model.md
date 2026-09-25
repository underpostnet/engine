# Protocol model

What the protocol names, the words it uses for each part, and how a runtime consumes a
definition once it has one.

## Vocabulary

| Term                                  | Meaning                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `itemId`                              | Semantic label (`hatchet`). Many definitions may carry the same one. Never an identity. |
| `olCid` / `cid`                       | Canonical, immutable identity of one definition: the CID of its canonical bytes.        |
| `contentHash`                         | Hex sha2-256 of the same canonical bytes. The CID carries this digest.                  |
| `tokenId`                             | ERC-1155 token type of a registered definition: `uint256(contentHash)`.                 |
| `(chainId, contractAddress, tokenId)` | Fully qualified on-chain asset identity.                                                |
| ownership                             | Ledger state: which address holds how many units of a token type.                       |
| profile                               | The semantic contract that interprets `data.stats` and `data.item.type`.                |
| Object Layer                          | This protocol and its content.                                                          |
| ItemLedger                            | The registration, indexing, provenance and ownership bridge.                            |
| Cyberia                               | A participating runtime.                                                                |

## Runtime consumption

A runtime references definitions by canonical identity.

Cyberia keeps two things apart:

| concern          | where                                                                 | rule                                            |
| ---------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| alias            | `CyberiaItemCatalog`: one `itemId → objectLayerCid` binding per label | authoring and discovery; rebinding is allowed   |
| pinned reference | `objectLayerCid` beside the label in persisted content                | what the content means; a rebind never moves it |

`src/api/cyberia-item-catalog/item-ref.js` declares every pinned path (quest objectives and
rewards, vendor items and their currency, craft inputs and outputs). A world loads the
definitions its content pins, and the catalog answers only for labels nothing pinned. One label
pinned to two definitions in one world is a content error, reported at boot, never a silent
choice. No "newest definition" rule exists anywhere.

## Render directions

Sprite animations are keyed by eight direction codes (`08`, `18`, `02`, `12`, `04`, `14`, `06`,
`16`). `OBJECT_LAYER_DIRECTIONS` in `ObjectLayerProtocol.js` is the single source of truth for
the codes, their labels and the render keyframes they feed.

## Client tools

`src/client/components/object-layer/` holds the reusable tools:

| Component                    | Role                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ObjectLayerProtocol.js`     | Schema version, profile reference, directions, canonical shape, structural stat check                                                      |
| `ObjectLayerEngine.js`       | Pixel-art frame editor element                                                                                                             |
| `ObjectLayerEngineModal.js`  | Authoring editor. Takes a content `profile` (item types, stat contract)                                                                    |
| `ObjectLayerEngineViewer.js` | Explorer and viewer: content, identity, profile, ItemLedger bindings, holders and provenance. `readOnly` for hosts without an editor route |

The Cyberia portal mounts the editor with `CyberiaObjectLayerProfile`; it is the only profile
implemented, so authoring stays a Cyberia workflow. The objectlayer.org and itemledger.com
portals mount the viewer and the management grid read-only.
