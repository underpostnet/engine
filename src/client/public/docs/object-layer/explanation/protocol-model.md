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

Cyberia keeps three things apart:

| concern   | where                                                                | rule                                                  |
| --------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| binding   | `CyberiaItemCatalog`: one `itemId → objectLayerCid` binding per item | the one runtime authority; a bind names what it moves |
| reference | the item id in quests, actions, entity defaults, sagas and maps      | names the item, never a definition                    |
| snapshot  | `object-layers/<itemId>.json` of an exported instance                | the frozen binding a restore applies                  |

A world loads the definition the catalog binds for each item id it names, so one world never runs
two definitions of one item. No "newest definition" rule exists anywhere.
[Runtime binding](../../cyberia/explanation/runtime-binding.md) holds the Cyberia lifecycle.

## Render directions

Sprite animations are keyed by eight direction codes (`08`, `18`, `02`, `12`, `04`, `14`, `06`,
`16`). `OBJECT_LAYER_DIRECTIONS` in `ObjectLayerProtocol.js` is the single source of truth for
the codes, their labels and the render keyframes they feed.

## Client tools

`src/client/components/objectlayer-studio/` holds the reusable tools:

| Component                    | Role                                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ObjectLayerProtocol.js`     | Schema version, CID form, profile reference, directions, canonical shape, structural stat check                                                                                                                                                                 |
| `ObjectLayerEngine.js`       | Pixel-art frame editor element                                                                                                                                                                                                                                  |
| `ObjectLayerEngineModal.js`  | Authoring editor. Takes a content `profile` (item types, stat contract)                                                                                                                                                                                         |
| `ObjectLayerEngineViewer.js` | Explorer: the list of definitions, and one view per definition at `/object-layer/:cid` with content, identity, profile, ItemLedger bindings, holders and provenance. The host binds it once at boot (`configure`), `readOnly` for hosts without an editor route |

The Cyberia portal mounts the editor with `CyberiaObjectLayerProfile`; it is the only profile
implemented, so authoring stays a Cyberia workflow. The objectlayer.org and itemledger.com
portals mount the viewer and the management grid read-only.
