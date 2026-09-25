---
title: Object Layer
domain: Object Layer
identity: Canonical global Object Layer registry and protocol
maturity: Open Alpha
order: 1
---

# Object Layer

The Object Layer is a content-addressed, immutable object definition. This document is the
protocol: the canonical shape, the identity model and the domain boundaries. It depends on no
runtime. Cyberia Online is the first runtime that consumes it.

## Purpose

The protocol gives one definition one identity, derived from its content, so any runtime can
resolve what a piece of content is without trusting the name it was filed under.

## Responsibilities

| Object Layer owns                                 | Object Layer does not own                         |
| ------------------------------------------------- | ------------------------------------------------- |
| The canonical payload and its schema              | On-chain registration, which ItemLedger owns      |
| Content identity: `olCid` and `contentHash`       | Item labels and world content, which Cyberia owns |
| The definition lifecycle: publish, archive, purge | Currency and balances, which CryptoKoyn owns      |
| Canonical storage and its render references       | What a definition means inside a game runtime     |

## Boundaries

`objectlayer.org` is the only writer of canonical content. Every other domain keeps a cache
copy or a draft and publishes through the authority. The protocol needs no blockchain: on-chain
registration is a separate, later act that belongs to ItemLedger.

## Current maturity

Open Alpha. Authoring, publication, content identity, the render pipeline and the purge path
are implemented and in use.

## Domains

| Domain                | Question it answers                                               | Owns                                                                                                  |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **objectlayer.org**   | What is this Object Layer?                                        | Protocol, canonical schema, canonicalization, validation, content identity (CID), profiles, explorer  |
| **itemledger.com**    | Which Object Layers are registered as assets, and who holds them? | CID → ERC-1155 token binding, supply, ownership and provenance projections                            |
| **cryptokoyn.net**    | CKY finance                                                       | CKY balances, transfers, staking, governance                                                          |
| **cyberiaonline.com** | How does Cyberia use these Object Layers?                         | Runtime, worlds, maps, instances, entities, actions, quests, item catalog, Cyberia profile, authoring |
| **underpost.net**     | Engineering journal                                               | Development logs and articles                                                                         |

The flow is one way:

```
objectlayer.org  →  canonical Object Layer  →  contentHash / olCid
      →  itemledger.com  →  token type (chainId + contractAddress + tokenId = uint256(contentHash))
      →  cyberiaonline.com  →  item catalog binding (label → olCid)  →  runtime usage
```

ItemLedger talks to Cyberia. The separation is semantic, not isolation.

## Main components

| Component                 | What it is                                              |
| ------------------------- | ------------------------------------------------------- |
| `ObjectLayer`             | One immutable definition, keyed by its content identity |
| `ObjectLayerRenderFrames` | The editor source of a definition, by its cid           |
| `AtlasSpriteSheet`        | The local materialization of a definition's render      |
| `Ipfs`                    | The pin registry of canonical bytes and render content  |
