---
title: ItemLedger
domain: ItemLedger
identity: On-chain Object Layer registry, ownership and provenance projections
maturity: Pre-Alpha
order: 2
---

# ItemLedger

ItemLedger is the bridge between canonical Object Layers and their economic representation.
It answers: which Object Layers are registered as assets, how are they represented on-chain,
and what is their supply, provenance and ownership state.

ItemLedger integrates with Cyberia. It is not a Cyberia item database: Cyberia is the first
participating runtime, not the definition of the ledger. The chain is the source of truth;
the ItemLedger collections are its indexed projection.

## Purpose

ItemLedger answers which Object Layers are registered as on-chain assets, how each one is
represented, and what its supply, provenance and ownership state are.

## Responsibilities

| ItemLedger owns                                               | ItemLedger does not own                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| On-chain registration of a canonical Object Layer             | The canonical definition itself, which Object Layer owns |
| The binding `objectLayerCid` ↔ `chainId + contract + tokenId` | Item labels and game content, which Cyberia owns         |
| Ownership, balance and provenance projections                 | CKY, token id 0, which CryptoKoyn owns                   |
| Future profile integrations for registered assets             | Anything a definition means to a runtime                 |

## Boundaries

An Object Layer exists whether or not ItemLedger registers it. Registration is a separate,
later act: in Open Alpha no asset is registered, and an empty registry is a valid state.
ItemLedger is never a mirror of the Object Layer database.

## Current maturity

Pre-Alpha. The registration path, the projections and the contract are written and tested; no
public network holds a deployment, so every on-chain read is unavailable until one does.

## Registry

The ItemLedger registry is the set of on-chain registered assets: one binding per token type
(`ItemLedger` collection). It is not an Object Layer registry and is never filled from the Object
Layer database. In Open Alpha no asset is registered on chain, and an empty registry is a valid
state; the client tells an empty registry, a failed dependency and a load in progress apart. The
ItemLedger client shows an Object Layer definition only from a registered asset, read-only, by
its cid at the Object Layer authority; no Object Layer write exists from ItemLedger.

## Main components

| Component              | What it is                                     |
| ---------------------- | ---------------------------------------------- |
| `ItemLedger`           | One record per registered token type           |
| `ItemLedgerBalance`    | Holder balances, projected from chain events   |
| `ItemLedgerTransfer`   | Provenance: every transfer leg of a token type |
| `ItemLedgerCheckpoint` | How far the projection has indexed             |
| `ObjectLayerToken`     | The ERC-1155 contract the registry binds to    |

## Cyberia integration

- Cyberia inventory → ItemLedger asset and token resolution.
- Cyberia ownership UI → ItemLedger ownership and provenance projections.
- Cyberia trade → ItemLedger and blockchain transfer.
- Cyberia item definition → Object Layer CID through the Cyberia item catalog.
- Cyberia boot wire → each definition carries its identity and its ItemLedger binding.

ItemLedger computes no Cyberia combat behavior. The Object Layer store knows no Cyberia
inventory state. Cyberia redefines no asset identity.
