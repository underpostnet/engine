# Cyberia Online — Development Roadmap

**Current version:** 3.0.3 | **Target milestone:** Open Alpha

---

## Project Context

Cyberia Online is a real-time tap-based sandbox MMORPG built on three layers:

- **cyberia-client** (C/WASM) — browser-based game client
- **cyberia-server** (Go) — authoritative real-time game server (binary WebSocket AOI)
- **engine-cyberia** (Node.js) — data persistence, gRPC data service, REST API, content pipeline

The **Cyberia CLI** (`cyberia`) is an extension of the **Underpost CLI** specifically for this ecosystem. Underpost is the end-to-end bare-metal infrastructure platform; `cyberia` adds the game's content pipeline, economy toolchain, and MMO engine management. Unrecognized commands pass through to `underpost` for general infrastructure operations.

---

## Core Design Principle: Item ID as the Universal Identity

The central data-transmission primitive is the **item ID (`data.item.id`)** — a human-readable string slug (e.g. `hatchet`, `skin-dark-001`, `floor-desert`) that identifies an Object Layer entity.

**Why item IDs, not ObjectIds or hashes:**

- The Go server and C client never transmit full ObjectLayer documents over the game wire.
- The binary AOI protocol sends only item ID strings per entity in the AOI update packets.
- The C client uses these item IDs to independently request visual data and atlas metadata from the Engine REST API (`GET /api/object-layer/{itemId}`, `GET /api/atlas-sprite-sheet/{cid}`).
- This creates a clean separation: the **Go server** manages authoritative game state (positions, HP, coin balances, equipment activation); the **Engine REST API** manages and serves asset/metadata resolution; the **C client** handles all rendering and compositing.

```
Go Server (binary AOI)
  → sends entity itemId stack per AOI tick
    → C client decodes itemIds
      → C client independently fetches ObjectLayer metadata from Engine REST API
        → C client fetches atlas CID blobs from Engine REST API
          → C client composites layers + renders
```

**gRPC is used only at startup** for world reconstruction (maps, entities, instance config, ObjectLayer cache warm-up). At runtime, the Go server holds all game state in memory and communicates with clients exclusively over binary WebSocket.

---

## Server Types (Production Topology)

Three server modes are planned, addressing different user needs and scaling properties:

| Mode                      | Session Persistence                         | Auth                             | Inventory                           | Economy                           |
| ------------------------- | ------------------------------------------- | -------------------------------- | ----------------------------------- | --------------------------------- |
| **Anonymous Off-Chain**   | Ephemeral (in-memory, resets on disconnect) | None                             | itemId-based in-memory              | Off-chain only                    |
| **Centralized Off-Chain** | Persistent (MongoDB via gRPC)               | Username / password (User model) | Server-authoritative MongoDB        | Off-chain only                    |
| **On-Chain**              | Decentralized (Hyperledger Besu + IPFS)     | secp256k1 ETH keys (EIP-712)     | ObjectLayerToken ERC-1155 ownership | On-chain: CKY + NFT/semi-fungible |

---

## Release Policy

All release versions have **publicly available features** with no paywalled content. If a server's player capacity is reached, a **queue system** is implemented rather than hard-blocking users.

**Queue system standard:** Token-bucket or FIFO queue with estimated wait time displayed to the user, following the pattern used by major MMOs (World of Warcraft realm queues, FFXIV login queues). The queue is server-side; clients poll a lightweight `/api/v1/queue-status` endpoint. A server-sent event (SSE) or WebSocket notification fires when the slot is granted.

---

## Phase 1 — Pre-Alpha: Anonymous Off-Chain (Ephemeral Sessions)

**Status:** In progress — core game loop functional; action/quest systems pending.

### What works today

- Binary WebSocket AOI protocol (entity movement, combat, HP, FCT)
- Object Layer item equip/unequip (`item_activation`) with equipment rules enforced
- Fountain & Sink coin economy (bot spawn coins, kill transfer, coin collect)
- Skill system: projectile, doppelganger, coin drop/transaction
- Bot AI: hostile/passive behavior, A\* pathfinding, aggro, respawn
- FrozenInteractionState entry/exit (`freeze_start`/`freeze_end`)
- ObjectLayer hot-reload via gRPC manifest diff (incremental update without restart)
- Go server metrics REST API (`/api/v1/metrics*`)
- Procedural content pipeline: floor, skin, resource semantic generators
- CLI toolchain: `cyberia ol`, `cyberia instance`, `cyberia run-workflow`

### Remaining work for Pre-Alpha checkpoint

All items below target selected-user testing with **ephemeral, in-memory sessions** (state resets on disconnect):

| Task                            | Component                           | Notes                                                                                      |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| NPC action routing in Go server | `cyberia-server`                    | Tap NPC entity → look up `CyberiaAction` from gRPC-loaded data; dispatch to action handler |
| Dialogue system integration     | `cyberia-server` + `cyberia-client` | `freeze_start` → client shows dialogue modal; server validates talk objectives             |
| Shop transaction handler        | `cyberia-server`                    | Deduct coin balance, grant item to inventory (in-memory only)                              |
| Craft transaction handler       | `cyberia-server`                    | Consume ingredients from in-memory inventory, grant output items                           |
| Quest tracking (in-memory)      | `cyberia-server`                    | `CyberiaQuestProgress` lives only in player session struct; no persistence                 |
| Quest objective evaluation      | `cyberia-server`                    | Intercept kill/collect/talk events; update in-memory progress                              |
| Quest reward delivery           | `cyberia-server`                    | On step/quest completion: grant items + coins via FCT                                      |
| Action/quest data via gRPC      | `proto + engine + go`               | Extend `GetFullInstanceResponse` with `CyberiaAction[]` and `CyberiaQuest[]`               |
| Portal transitions              | `cyberia-server`                    | Implement inter-map portal traversal (`portal` entity type collision)                      |
| Player capacity queue           | `cyberia-server`                    | FIFO queue with `/api/v1/queue-status` SSE; deny connect when at capacity                  |

### Pre-Alpha data contract

```
Player session (in-memory Go struct only):
  PlayerState {
    ID:           string         // ephemeral UUID per connect
    ObjectLayers: []ObjectLayerState  // equipped item IDs + active flags
    CoinBalance:  uint32         // Fountain/Sink coin wallet
    QuestProgress: []QuestProgress  // ephemeral quest state (no persistence)
    Frozen:       bool
    MapCode:      string
    Pos:          Vec2
    Life:         float64
  }
```

No account, no persistent identity, no cross-session carry-over.

---

## Phase 2 — Alpha: Centralized Off-Chain (Persistent Sessions)

**Target:** Persistent player identity, inventory, and progress stored in MongoDB via gRPC.

### Architecture additions

```
cyberia-server (Go)
  ↕ gRPC (new RPCs: GetPlayerState, SavePlayerState, CreateSession, etc.)
engine-cyberia (Node.js)
  ↕ MongoDB
    User (src/api/user)     — account: email, username, password, sessions
    PlayerState (new model) — per-player: inventory, coin balance, quest progress
```

### Milestone goals

| Task                       | Component        | Notes                                                                |
| -------------------------- | ---------------- | -------------------------------------------------------------------- |
| `GetPlayerState` gRPC RPC  | `proto + engine` | Returns saved inventory + coin balance + quest progress for a userId |
| `SavePlayerState` gRPC RPC | `proto + engine` | Persists player state on clean disconnect or periodic checkpoint     |
| User model integration     | `engine-cyberia` | Existing `src/api/user` (email/username/password + session tokens)   |
| Player state model         | `engine-cyberia` | New `src/api/player-state` Mongoose model linked to User             |
| Go server session auth     | `cyberia-server` | On connect: verify session token with Engine, load persistent state  |
| Go server state checkpoint | `cyberia-server` | Periodic or on-disconnect `SavePlayerState` gRPC call                |
| Alpha gRPC contract        | `proto`          | New service or new RPCs within `CyberiaDataService`                  |

### Data contract (alpha)

```
User (MongoDB):
  email, username, passwordHash, role, activeSessions[]

PlayerState (MongoDB):
  userId: ObjectId → User
  instanceCode: string
  coinBalance: uint32
  inventory: [{ itemId: string, active: bool, quantity: int }]
  questProgress: [{ questCode: string, stepId: string, objectives: [...] }]
```

---

## Phase 3 — Beta: On-Chain (Decentralized, ETH-Key Sessions)

**Target:** Frictionless, zero-gas transactions directly with Ethereum secp256k1 keys on Hyperledger Besu. Full Object Layer ownership, interoperability, and decentralized player progress sync.

### Architecture additions

```
cyberia-client (C/WASM)
  → EIP-712 sign-on: sign { domain, address, timestamp } with ETH private key
    → session token = EIP-712 signature (no password)
      → Engine verifies signature against ObjectLayerToken deployer / public address
        → Go server loads on-chain inventory from ERC-1155 balances

Hyperledger Besu (IBFT2/QBFT, chainId 777771, gasPrice 0)
  ObjectLayerToken (ERC-1155)
    Token 0:       CKY fungible (10M initial supply, 18 decimals)
    Token IDs ≥ 1: Object Layer items (NFT supply=1, semi-fungible supply>1)
```

### Key properties

- **Zero-gas transactions** — Besu permissioned network, `gasPrice: 0` for all players.
- **secp256k1 key = player identity** — same key pair authenticates across all three domains (`cryptokoyn.net`, `itemledger.com`, `cyberiaonline.com`).
- **Inventory = ERC-1155 balances** — `balanceOf(playerAddress, tokenId)` is the authoritative inventory.
- **No server-side wallet custody** — player holds their own key; the server validates on-chain state.
- **Interoperability** — items owned on-chain can be used in any Cyberia instance that queries `ObjectLayerToken`.
- **Decentralized progress sync** — quest progress and equipment state checkpointed to Besu events.

### EIP-712 domain

```json
{
  "name": "CyberiaObjectLayer",
  "version": "1",
  "chainId": 777771,
  "verifyingContract": "<ObjectLayerToken address>"
}
```

### Milestone goals

| Task                             | Component             | Notes                                                                                          |
| -------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| EIP-712 sign-on in C client      | `cyberia-client`      | JS bridge calls `ethers.signTypedData` (MetaMask or injected key)                              |
| Signature verification in Engine | `engine-cyberia`      | REST endpoint verifies EIP-712 sig; returns session token                                      |
| On-chain inventory read          | `engine-cyberia`      | `balanceOf` query on ObjectLayerToken per item type for player address                         |
| On-chain inventory → gRPC        | `proto + engine + go` | `GetPlayerState` returns on-chain balances as inventory                                        |
| CKY transfer via Go server       | `cyberia-server`      | Kill transfer calls Engine which calls `ObjectLayerToken.safeTransferFrom` via gasless relayer |
| Gasless relayer                  | `engine-cyberia`      | Engine holds the coinbase key; signs and submits Besu transactions on behalf of players        |
| Item registration pipeline       | `cyberia chain` CLI   | `cyberia chain register` / `batch-register` to publish ObjectLayer items on-chain              |
| ItemFCT on-chain binding         | `cyberia-server`      | ItemGain/Loss FCT events trigger Engine relayer to mint/burn on Besu                           |

---

## Domain Architecture

| Domain              | Role                       | Smart Contract                 |
| ------------------- | -------------------------- | ------------------------------ |
| `cryptokoyn.net`    | CKY fungible token hub     | ObjectLayerToken Token ID 0    |
| `itemledger.com`    | Object Layer item registry | ObjectLayerToken Token IDs ≥ 1 |
| `cyberiaonline.com` | Game runtime               | Uses both token domains        |

---

## Technology Stack Summary

| Layer            | Technology                       | Purpose                     |
| ---------------- | -------------------------------- | --------------------------- |
| Game client      | C / WASM / Emscripten / Raylib   | In-browser rendering        |
| Game server      | Go / chi / gorilla WS            | Real-time AOI               |
| Engine           | Node.js / Express / Mongoose     | Data persistence + gRPC     |
| Database         | MongoDB (StatefulSet)            | Game world data             |
| Cache            | Valkey                           | Session cache               |
| Asset storage    | IPFS + Kubo + IPFS Cluster       | Content-addressed assets    |
| Inter-service    | gRPC + Protobuf                  | Go ↔ Node.js data pipeline  |
| Blockchain       | Hyperledger Besu (IBFT2/QBFT)    | Permissioned EVM            |
| Smart contracts  | Solidity 0.8.27 / OpenZeppelin 5 | ERC-1155 ObjectLayerToken   |
| Contract tooling | Hardhat 3.x + Ethers v6          | Compile, test, deploy       |
| Infrastructure   | Kubernetes (kubeadm / kind)      | Container orchestration     |
| Infra CLI        | Underpost CLI                    | Bare-metal automation       |
| Game CLI         | Cyberia CLI (extends Underpost)  | Content + economy toolchain |
