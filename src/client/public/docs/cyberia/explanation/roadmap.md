# Cyberia Online — Development Roadmap

**Current version:** 3.4.5 | **Target milestone:** Open Alpha

---

## Project Context

Cyberia Online is a real-time tap-based sandbox MMORPG built on three processes:

- **cyberia-client** (C/WASM) — browser game client
- **cyberia-server** (Go) — authoritative real-time simulation (binary WebSocket AOI)
- **engine-cyberia** (Node.js) — content authority, persistence, gRPC data service, REST API

The **Cyberia CLI** (`cyberia`) extends the **Underpost CLI** for this ecosystem. Underpost is the
bare-metal infrastructure platform; `cyberia` adds the content pipeline, the economy toolchain and
MMO engine management. Unknown commands pass through to `underpost`.

---

## Core Design Principle: Content Identity and Wallet Identity

Two identities exist. They never mix.

| identity           | what it names                         | how it is computed                          | where it lives                            |
| ------------------ | ------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| **`olCid`**        | one immutable Object Layer definition | CIDv1 raw sha2-256 of the canonical payload | Object Layer protocol (`objectlayer.org`) |
| **wallet address** | one player                            | secp256k1 key pair held by the player       | wallet, never the server                  |

Two derived values follow from them:

- `tokenId = uint256(contentHash)` — the on-chain type of a definition (`itemledger.com`).
- `accountId = CAIP-10` (`eip155:<chainId>:<address>`) — the portable name of a player account.

**`itemId` is a label, never an identity.** `data.item.id` (`hatchet`, `skin-dark-001`,
`floor-desert`) is a human-readable slug for authoring and display. It is not unique, and a label
may be rebound to another definition. The `CyberiaItemCatalog` binds `itemId → olCid`, and every
persisted reference pins the `objectLayerCid` it means. Rebinding a label never changes what
pinned content means.

### Runtime handle

The runtime handle for an Object Layer is the pair **label + pinned `olCid`**. No parallel
reference type exists:

```
Go Server (binary AOI)
  → sends the entity label stack per AOI tick
    → C client decodes labels
      → C client resolves each label against the metadata message (label → cid + content)
        → C client fetches the render metadata and primary render of each label from the Engine REST API
          → C client composites layers and renders
```

The label is the key of one world load. The CID is what the label resolved to. Hot reload diffs
the manifest by `cid`, so a rebound label reloads. [the runtime semantics matrix](../../object-layer/reference/runtime-semantics.md)
holds the field-by-field matrix.

**gRPC is used only at startup** for world reconstruction (maps, entities, instance config, Object
Layer manifest). At runtime the Go server holds game state in memory and talks to clients over
binary WebSocket only.

---

## Server Types (Production Topology)

| Mode                      | Session persistence                         | Authentication               | Inventory                    | Economy                             |
| ------------------------- | ------------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------------- |
| **Anonymous Off-Chain**   | Ephemeral (in-memory, resets on disconnect) | None                         | In-memory, keyed by label    | Off-chain only                      |
| **Centralized Off-Chain** | Persistent (MongoDB via gRPC)               | Username / password, or SIWE | Server-authoritative MongoDB | Off-chain only                      |
| **On-Chain**              | Persistent progress + on-chain ownership    | SIWE (ERC-4361)              | ERC-1155 balances            | On-chain: CKY + semi-fungible / NFT |

Progress and ownership are separate in every mode. See
[Progress state versus chain state](#progress-state-versus-chain-state).

---

## Release Policy

Every release has **public features** with no paywalled content. When a server reaches capacity, a
**queue** admits players instead of refusing them.

**Queue standard:** FIFO or token bucket with an estimated wait time. The queue is server-side;
clients poll `/api/v1/queue-status` and receive an SSE or WebSocket notification when the slot
opens.

---

## Phase 0 — Foundation / Architecture Lock

**Status:** Complete. This stage locks the contracts that later phases build on. It has **no
blockchain dependency**: no node, no deployed contract and no chain call is needed to run it.

### What this stage locks

| Lock                 | Contract                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Content identity     | `olCid` = CIDv1 raw sha2-256 of the canonical payload; one canonical serializer in Node, Go and C |
| Label semantics      | `itemId` is a label; `CyberiaItemCatalog` binds it; persisted content pins `objectLayerCid`       |
| Token identity       | `tokenId = uint256(contentHash)`; a qualified asset is `chainId + contractAddress + tokenId`      |
| Account identity     | CAIP-10 `accountId`; the address is the account, the session token is not                         |
| Authentication       | SIWE (ERC-4361): challenge, nonce, single use, server-issued session token                        |
| Action authorization | EIP-712 typed data per action, with a deadline; ERC-1271 for contract accounts                    |
| Key custody          | Signing keys stay client-side; no domain database holds secret material                           |
| Domain data          | One MongoDB per domain; domains talk over versioned HTTP only                                     |
| Wire evolution       | Removed protobuf field numbers stay reserved; a compatibility test enforces it                    |
| Object Layer writer  | `objectlayer.org` alone writes canonical content; Cyberia keeps drafts and caches only            |
| Content releases     | Content is built, validated and promoted as a versioned release; a deploy never drops a database  |
| Release lifecycle    | Transactional promotion and rollback, verified on a real replica set (`cyberia:mongo`)            |

### Wallet stack

| Layer                | Standard                                      | Component                                           |
| -------------------- | --------------------------------------------- | --------------------------------------------------- |
| Provider abstraction | domain-neutral capabilities                   | `src/client/components/wallet/WalletProvider.js`    |
| External wallets     | EIP-1193 + EIP-6963 discovery                 | `discoverExternalWallets`, `externalWalletProvider` |
| Embedded wallet      | BIP-39 / BIP-32 / BIP-44 (`m/44'/60'/0'/0/x`) | `src/client/components/wallet/EmbeddedWallet.js`    |
| Vault                | Web3 Secret Storage keystore in IndexedDB     | `EmbeddedWallet.save` / `unlock` / `exportKeystore` |
| Sign-in              | ERC-4361                                      | `src/server/security/siwe.js`                       |
| Action signing       | EIP-712                                       | `src/server/security/typed-data.js`                 |
| Account record       | CAIP-10 public metadata                       | `src/api/wallet-account/`                           |
| View                 | Sign-in and vault UI                          | `src/client/components/wallet/WalletView.js`        |

A wallet is external or embedded. Both expose the same capabilities, so no game or domain code
knows which one signs.

### Key custody rules

1. The private key, mnemonic, seed and keystore passphrase never leave the browser.
2. No domain database stores `privateKey`, `mnemonic`, `seed`, `keystore`, `jwk` or a recovery
   phrase. The `WalletAccount` model rejects those fields on write.
3. The embedded vault holds the keystore encrypted at rest. Decrypted key material lives in memory
   only while the wallet is unlocked.
4. Signing needs an explicit unlock. Locking clears the in-memory signer.
5. Browser encryption is **not** hardware-wallet security. A compromised device or a stolen
   passphrase compromises the vault. Players who hold value should use an external wallet.
6. Keystore export and import give the player a recovery path the server cannot provide.

### Operational key separation

| Key                      | Holder         | Purpose                           | Migration target                |
| ------------------------ | -------------- | --------------------------------- | ------------------------------- |
| Player key               | Player browser | Sign-in and action signatures     | Stays with the player           |
| Relayer key              | Engine service | Pay gas and submit player intents | Kubernetes Secret → Vault / KMS |
| Validator / deployer key | Chain operator | Validate blocks, deploy contracts | HSM or offline signer           |

The three sets never share a key. No player key ever reaches a server process.

### Per-domain data foundation

| Domain              | Owns                                       | Reads from other domains                      |
| ------------------- | ------------------------------------------ | --------------------------------------------- |
| `objectlayer.org`   | Object Layer definitions, canonical bytes  | `itemledger.com` over HTTP                    |
| `itemledger.com`    | Bindings, transfers, balances, checkpoints | `objectlayer.org` over HTTP                   |
| `cryptokoyn.net`    | CKY finance, the wallet UI                 | —                                             |
| `cyberiaonline.com` | World content (per release), runtime state | `objectlayer.org`, `itemledger.com` over HTTP |

No domain opens another domain's MongoDB. Cross-domain reads go through `/api/v1/` with a timeout, a
bounded retry and a read cache. Cyberia authors content in a workspace database and serves it from
versioned release databases, both apart from player state; [Content releases](content-releases.md) holds the model, the deploy stages and the
game server drain.

---

## Phase 1 — Pre-Alpha: Anonymous Off-Chain (Ephemeral Sessions)

**Status:** In progress — the core loop runs; action and quest systems are pending.

### What works today

- Binary WebSocket AOI protocol (movement, combat, HP, FCT)
- Object Layer equip and unequip (`item_activation`) with equipment rules
- Fountain and Sink coin economy (bot spawn coins, kill transfer, coin collect)
- Skill system: projectile, doppelganger, coin drop and transaction
- Bot AI: hostile and passive behavior, A\* pathfinding, aggro, respawn
- FrozenInteractionState entry and exit (`freeze_start` / `freeze_end`)
- Object Layer hot reload over gRPC manifest diff by `cid`
- Go server metrics REST API (`/api/v1/metrics*`)
- Procedural content pipeline: floor, skin and resource generators
- CLI toolchain: `cyberia ol`, `cyberia instance`, `cyberia run-workflow`

### Remaining work for the Pre-Alpha checkpoint

Every task below targets selected-user testing with **ephemeral, in-memory sessions**. State resets
on disconnect.

| Task                                | Component                           | Notes                                                                             |
| ----------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| NPC action routing in the Go server | `cyberia-server`                    | Tap an NPC → look up the `CyberiaAction` from gRPC data → dispatch to the handler |
| Dialogue system integration         | `cyberia-server` + `cyberia-client` | `freeze_start` opens the dialogue modal; the server validates talk objectives     |
| Shop transaction handler            | `cyberia-server`                    | Deduct the coin balance, grant the item to the in-memory inventory                |
| Craft transaction handler           | `cyberia-server`                    | Consume ingredients from the in-memory inventory, grant the outputs               |
| Quest tracking (in-memory)          | `cyberia-server`                    | `CyberiaQuestProgress` lives in the session struct; no persistence                |
| Quest objective evaluation          | `cyberia-server`                    | Intercept kill, collect and talk events; update in-memory progress                |
| Quest reward delivery               | `cyberia-server`                    | On step or quest completion, grant items and coins through FCT                    |
| Action and quest data over gRPC     | `proto + engine + go`               | Extend `GetFullInstanceResponse` with `CyberiaAction[]` and `CyberiaQuest[]`      |
| Portal transitions                  | `cyberia-server`                    | Inter-map traversal on `portal` entity collision                                  |
| Player capacity queue               | `cyberia-server`                    | FIFO queue with `/api/v1/queue-status` SSE; refuse connect at capacity            |

### Pre-Alpha data contract

```
Player session (in-memory Go struct only):
  PlayerState {
    ID:            string              // ephemeral UUID per connect
    ObjectLayers:  []ObjectLayerState  // equipped labels + resolved cid + active flags
    CoinBalance:   uint32              // Fountain and Sink coin wallet
    QuestProgress: []QuestProgress     // ephemeral; no persistence
    Frozen:        bool
    MapCode:       string
    Pos:           Vec2
    Life:          float64
  }
```

No account, no persistent identity, no carry-over between sessions.

---

## Phase 2 — Alpha: Centralized Off-Chain (Persistent Sessions)

**Target:** persistent account, inventory and progress in MongoDB, reached over gRPC.

A player signs in with a password or with SIWE. Both paths produce the same server-issued session
token, and both bind to the same `PlayerState`. Wallet sign-in in this phase proves the address; it
reads no chain state.

### Architecture additions

```
cyberia-server (Go)
  ↕ gRPC (GetPlayerState, SavePlayerState, CreateSession)
engine-cyberia (Node.js)
  ↕ MongoDB
    User          (src/api/user)           — account, sessions, wallet.accountId
    WalletAccount (src/api/wallet-account) — CAIP-10 public account metadata
    PlayerState   (new model)              — inventory, coin balance, quest progress
```

### Milestone goals

| Task                       | Component        | Notes                                                               |
| -------------------------- | ---------------- | ------------------------------------------------------------------- |
| `GetPlayerState` gRPC RPC  | `proto + engine` | Return inventory, coin balance and quest progress for a userId      |
| `SavePlayerState` gRPC RPC | `proto + engine` | Persist state on clean disconnect or on a periodic checkpoint       |
| Player state model         | `engine-cyberia` | New `src/api/player-state` model linked to `User`                   |
| Wallet account binding     | `engine-cyberia` | Bind `User.wallet.accountId` after a SIWE sign-in                   |
| Go server session auth     | `cyberia-server` | On connect, verify the session token with the engine and load state |
| Go server checkpoint       | `cyberia-server` | Periodic and on-disconnect `SavePlayerState`                        |
| Alpha gRPC contract        | `proto`          | New RPCs inside `CyberiaDataService`, with reserved numbers kept    |

### Data contract (alpha)

```
User (MongoDB):
  email, username, passwordHash, role, activeSessions[],
  wallet: { accountId, address }        // CAIP-10 binding; no secret material

WalletAccount (MongoDB):
  accountId, address, chainNamespace, chainId,
  walletType, providerType, derivationPath, userId, lastSeenAt

PlayerState (MongoDB):
  userId: ObjectId → User
  instanceCode: string
  coinBalance: uint32
  inventory:     [{ itemId, objectLayerCid, active, quantity }]
  questProgress: [{ questCode, stepId, objectives: [...] }]
```

Inventory entries carry the pinned `objectLayerCid` beside the label, so a rebound label never
changes what a saved item is.

---

## Phase 3 — Beta: On-Chain Ownership

**Target:** Object Layer ownership on Hyperledger Besu, with zero-gas player transactions. Identity,
authentication and action signing are unchanged from Phase 0 — this phase adds ownership, not a new
identity model.

### Architecture additions

```
wallet (external or embedded)
  → SIWE sign-in: signs the ERC-4361 message for a single-use nonce
    → engine verifies the signature and issues a session token
      → player acts: the wallet signs an EIP-712 typed action with a deadline
        → engine verifies the action, then the relayer submits it on chain
          → Go server reads ownership from ERC-1155 balances

Hyperledger Besu (IBFT2 / QBFT, chainId 777771, gasPrice 0)
  ObjectLayerToken (ERC-1155)
    Token 0:         CKY fungible (10M initial supply, 18 decimals)
    Other token IDs: registered Object Layers, id = uint256(contentHash)
```

### Key properties

- **Zero-gas play** — the permissioned network runs at `gasPrice: 0`; the relayer submits.
- **Session token, not signature** — a SIWE signature authenticates once. The server issues a
  session token, and no request replays a signature as credentials.
- **One signature per action** — an EIP-712 payload names the action, its parameters and a
  deadline. A signature for one action never authorizes another.
- **Contract accounts** — ERC-1271 verification accepts smart-contract wallets through the same
  path.
- **Ownership is chain state** — `balanceOf(address, tokenId)` is authoritative. The database is a
  projection built by the ItemLedger indexer, and the indexer is idempotent and checkpointed.
- **No server key custody** — the engine never holds a player key. The relayer key pays gas and
  signs nothing on the player's behalf without a player signature.
- **Interoperability** — items owned on chain work in any instance that reads `ObjectLayerToken`.

### Progress state versus chain state

| State                             | Owner        | Store                            | Authority    |
| --------------------------------- | ------------ | -------------------------------- | ------------ |
| Quest progress, objectives, steps | Cyberia      | MongoDB (`PlayerState`)          | Game server  |
| Coin balance (Fountain and Sink)  | Cyberia      | MongoDB (`PlayerState`)          | Game server  |
| Equipment activation              | Cyberia      | Session, checkpointed to MongoDB | Game server  |
| Item ownership                    | ItemLedger   | ERC-1155 balances                | Chain        |
| CKY balance                       | ItemLedger   | ERC-1155 token 0                 | Chain        |
| Definition identity               | Object Layer | Canonical bytes                  | Content hash |

Progress never moves on chain, and ownership never moves into the game database as a source of
truth. A chain outage stops transfers; it does not stop play.

### Milestone goals

| Task                             | Component                           | Notes                                                                 |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| SIWE sign-in in the client       | `cyberia-client`                    | JS bridge calls the wallet provider; no key reaches C                 |
| On-chain ownership read          | `engine-cyberia`                    | `balanceOf` per token type for the player address                     |
| Ownership over gRPC              | `proto + engine + go`               | `GetPlayerState` returns indexed balances as inventory                |
| CKY transfer through the relayer | `cyberia-server` + `engine-cyberia` | A kill transfer submits `safeTransferFrom` after EIP-712 verification |
| Relayer key management           | `engine-cyberia`                    | Kubernetes Secret first, then Vault or KMS; never in the repo         |
| Item registration pipeline       | `cyberia chain` CLI                 | `cyberia chain register` and `batch-register` publish definitions     |
| ItemFCT chain binding            | `cyberia-server`                    | ItemGain and ItemLoss events queue relayer mint or burn               |
| Indexer production hardening     | `engine-cyberia`                    | Reorg-safe checkpoints, `reconcile()`, restart safety                 |

---

## Domain Architecture

| Domain              | Role                                              | Contract                                             | Database |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------- | -------- |
| `underpost.net`     | Platform, CLI and infrastructure documentation    | None                                                 | Own      |
| `objectlayer.org`   | Object Layer protocol, content identity, explorer | None: content is addressed by CID                    | Own      |
| `itemledger.com`    | Registry, ownership and provenance bridge         | `ObjectLayerToken`, `tokenId = uint256(contentHash)` | Own      |
| `cryptokoyn.net`    | CKY fungible token hub                            | `ObjectLayerToken` token id 0                        | Own      |
| `cyberiaonline.com` | Game runtime and accounts                         | Consumes ItemLedger                                  | Own      |

One wallet address works across every domain. Each domain keeps its own account record; none reads
another domain's database.

---

## Technology Stack Summary

| Layer            | Technology                                   | Purpose                           |
| ---------------- | -------------------------------------------- | --------------------------------- |
| Game client      | C / WASM / Emscripten / Raylib               | In-browser rendering              |
| Game server      | Go / chi / gorilla WS                        | Real-time AOI                     |
| Engine           | Node.js / Express / Mongoose                 | Persistence and gRPC              |
| Database         | MongoDB (StatefulSet)                        | One per domain                    |
| Cache            | Valkey                                       | Sessions and SIWE challenges      |
| Asset storage    | IPFS + Kubo + IPFS Cluster                   | Content-addressed assets          |
| Inter-service    | gRPC + Protobuf                              | Go ↔ Node.js pipeline             |
| Cross-domain     | Versioned `/api/v1/` HTTP                    | Domain-to-domain reads            |
| Wallet           | EIP-1193, EIP-6963, BIP-39/32/44             | External and embedded accounts    |
| Identity         | CAIP-2, CAIP-10, ERC-4361, EIP-712, ERC-1271 | Accounts, sign-in, action signing |
| Blockchain       | Hyperledger Besu (IBFT2 / QBFT)              | Permissioned EVM                  |
| Smart contracts  | Solidity 0.8.27 / OpenZeppelin 5             | ERC-1155 `ObjectLayerToken`       |
| Contract tooling | Hardhat 3.x + Ethers v6                      | Compile, test, deploy             |
| Infrastructure   | Kubernetes (kubeadm / kind)                  | Orchestration                     |
| Infra CLI        | Underpost CLI                                | Bare-metal automation             |
| Game CLI         | Cyberia CLI (extends Underpost)              | Content and economy toolchain     |
