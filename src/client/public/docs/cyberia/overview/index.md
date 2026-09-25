---
title: Cyberia
domain: Cyberia
identity: Runtime, Game Studio, Cyberia Engine and Cyberia CLI
maturity: Open Alpha
order: 3
---

# Cyberia

Cyberia is a real-time tap-based sandbox MMORPG and the tooling that produces it. It is one
product on the platform: it consumes canonical content from Object Layer and settles economic
questions with ItemLedger and CryptoKoyn, and it owns everything that makes the game a game.

## Purpose

Cyberia turns canonical definitions into a world: maps, entities, quests, actions and the
runtime that simulates them for connected players.

## Responsibilities

| Cyberia owns                                                  | Cyberia does not own                           |
| ------------------------------------------------------------- | ---------------------------------------------- |
| The game runtime: simulation, presentation and the data layer | Canonical definitions, which Object Layer owns |
| The Game Studio and the authoring workflow                    | Content identity, which Object Layer computes  |
| The Cyberia Engine and the Cyberia CLI                        | On-chain registration, which ItemLedger owns   |
| World content, item label bindings and content releases       | CKY and balances, which CryptoKoyn owns        |
| Player progress: inventory, quests, coin balance              | Item ownership, which is chain state           |

## Boundaries

Cyberia authors Object Layer content through the Studio, but the canonical copy is always
written at the Object Layer authority; Cyberia keeps a draft or a cache copy and binds a label
to it. Progress never moves on chain, and ownership never becomes a Cyberia source of truth.

## Current maturity

Open Alpha. The three processes run, content is authored and released, and the economy is
off-chain. On-chain ownership belongs to a later phase.

## Main components

| Component        | Language | Role                                                          |
| ---------------- | -------- | ------------------------------------------------------------- |
| `engine-cyberia` | Node.js  | Content authority, persistence, gRPC data service, REST API   |
| `cyberia-server` | Go       | Authoritative real-time simulation over binary WebSocket      |
| `cyberia-client` | C / WASM | Browser game client and presentation                          |
| Cyberia CLI      | Node.js  | Content pipeline, instances, releases and the chain toolchain |

## Documentation map

| Category    | What it holds                                                                      |
| ----------- | ---------------------------------------------------------------------------------- |
| Explanation | Architecture, the two runtimes, content releases, the game systems and the roadmap |
| How-to      | Local content development and deploying a release                                  |
| Reference   | The Cyberia CLI                                                                    |
