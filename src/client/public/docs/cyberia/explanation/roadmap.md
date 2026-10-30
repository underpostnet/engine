# Cyberia Online — Development Roadmap

**Current version:** 4.0.0 | **Target milestone:** Open Alpha

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
may be rebound to another definition. The `CyberiaItemCatalog` alone binds `itemId → olCid`:
content names items by item id, and an exported instance snapshot freezes the binding of each item
it holds. [Runtime binding](runtime-binding.md) holds the lifecycle.

### Runtime handle

The runtime handle for an Object Layer is the pair **label + resolved `olCid`**. No parallel
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
| Label semantics      | `itemId` is a label; `CyberiaItemCatalog` alone binds it; a snapshot freezes the binding          |
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
bounded retry and a read cache. Cyberia serves content from versioned release databases, apart
from player state; [Content releases](content-releases.md) holds the model, the deploy stages and the
game server drain.

---

## Phase 1 — Pre-Alpha: Anonymous Off-Chain (Ephemeral Sessions)

**Status:** In progress — the core loop, the action and quest systems and portals run; the capacity
queue is pending.

### What works today

- Binary WebSocket AOI protocol (movement, combat, HP, FCT)
- Object Layer equip and unequip (`item_activation`) with equipment rules
- Fountain and Sink coin economy (bot spawn coins, kill transfer, coin collect)
- Skill system: projectile, doppelganger, coin drop and transaction, zero-waste heal
- Bot AI: hostile and passive behavior, A\* pathfinding, aggro, respawn
- FrozenInteractionState entry and exit (`freeze_start` / `freeze_end`)
- Object Layer hot reload over gRPC manifest diff by `cid`
- Go server metrics REST API (`/api/v1/metrics*`)
- Procedural content pipeline: floor, skin and resource generators
- CLI toolchain: `cyberia ol`, `cyberia instance`, `cyberia run-workflow`
- Session player identity: a `PlayerID` and a guest name per connection ([player identity](player-identity-and-profile.md))
- Level-based bag capacity on every grant path, and personal storage beside the NPC vaults
  ([inventory capacity](inventory-capacity.md), [personal storage](player-storage.md))
- World, party and direct chat, and parties of up to 5 players ([chat and parties](social.md))
- NPC actions over gRPC: dialogue, shops and crafting ([action system](action-system.md))
- Quests: talk, collect and kill objectives, with rewards ([quest system](quest-system.md))
- Portal transitions between maps

### Remaining work for the Pre-Alpha checkpoint

| Task                  | Component        | Notes                                                                  |
| --------------------- | ---------------- | ---------------------------------------------------------------------- |
| Player capacity queue | `cyberia-server` | FIFO queue with `/api/v1/queue-status` SSE; refuse connect at capacity |

### Pre-Alpha data contract

```
Player session (in-memory Go state only):
  Session {
    PlayerID:      string              // UUID per connect; owns the containers and the party seat
    DisplayName:   string              // "Guest-" and a short code, unique among online players
    ObjectLayers:  []ObjectLayerState  // the inventory: stacks, worn or not
    Coins:         uint32              // Fountain and Sink coin wallet
    QuestProgress: []QuestProgress     // in memory; a guest's ends with the session
    Storage:       []Stack             // personal storage
    Vaults:        map[action][]Stack  // NPC vaults
    Party:         seat in one party   // up to 5 players
    Frozen:        bool
    MapCode:       string
    Pos:           Vec2
    Life:          float64
  }
```

A guest session has no account and no carry-over between sessions. The containers end with the
inventory and the wallet, so a reconnect cannot bank assets. Account sessions keep the same owner
keys: the `PlayerID` is the profile id ([Phase 2](#phase-2--alpha-centralized-off-chain-persistent-sessions)).

---

## Phase 2 — Alpha: Centralized Off-Chain (Persistent Sessions)

**Status:** In progress — account sessions, persistent player state and friends run in account mode
(`CYBERIA_SESSION_MODE=account`), beside guest sessions. Anonymous mode stays the default.

A player signs in at the portal with a password or Google, or continues as a guest, and the launch
bridge of the portal opens the world with a single-use ticket. The game server stays the authority and commits the durable state of each player
to the engine over gRPC. A wallet stays an optional linked identity: it is never a profile key, and
Phase 2 gameplay never needs it.

### Architecture additions

```
cyberia-portal (browser)
  → /launch?world=… → POST /api/v1/cyberia-game-ticket (account or guest) → client#ticket=…
  → auth {ticket} on /ws
cyberia-server (Go)
  ↕ gRPC CyberiaPlayerService (tickets, resume tickets, sessions, commits, checkpoints, friendships)
engine-cyberia (Node.js)
  ↕ MongoDB replica set (host database, beside users)
    CyberiaPlayer        — one profile per account and world: coins, XP, bag, storage, vaults, held, position
    CyberiaGameSession   — the lease of the one live session of an account: epoch, presence
    CyberiaGameTicket    — launch and resume tickets of accounts and guests, hash only
    CyberiaQuestProgress — quest progress by profile
    CyberiaSocial        — friendships and requests by account
    CyberiaSocialProfile — account status note
```

[Accounts and persistent players](accounts-and-persistence.md) holds the model and the guarantees,
and [the player service reference](../reference/player-service.md) the contracts.

### Milestone goals

"Tested" names automated tests; "browser" names a manual run of the real portal, client and server
in a browser.

| Task                               | Component              | State                                                                                                |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Launch ticket and socket admission | `engine + go + client` | Done, tested, browser: single-use hashed ticket in the fragment, `auth` first                        |
| Guest sessions in account worlds   | `engine + go + client` | Done, tested, browser: a guest identity, guest tickets, no profile reads or writes                   |
| Launch bridge and origins          | `engine + client`      | Done, tested, browser in development: `/launch`, one origin source per deploy                        |
| One session per account, takeover  | `engine + go`          | Done, tested: lease with epoch fencing, `signed_in_elsewhere`, `revoked`                             |
| Persistent player state            | `proto + engine + go`  | Done, tested, browser: coins, XP, bag, storage, vaults, quests, position                             |
| Item identity across releases      | `go + engine`          | Done, tested: each stack keeps its `olCid`; held stacks, operator rebind                             |
| Outage behaviour                   | `go + client`          | Done, tested: retries, unsaved notice, trades wait, coin drop lock                                   |
| Session menu                       | `go + client`          | Done, tested, browser: Cyberia Portal, play as guest, sign out, the final commit first               |
| Reconnect without the portal       | `engine + go + client` | Done, tested, browser: a resume ticket bound to the epoch; dropped link and server restart           |
| Friends, presence, direct chat     | `engine + go + client` | Done, tested, browser: persistent friendships, lease presence, DM across maps, badges                |
| Party invites across maps          | `go + client`          | Done, tested, browser: an accepted friend on any map of one server                                   |
| Identity icons and emoji           | `client`               | Done, tested: the active skin Object Layer icon, `CHAT_EMOJI` tokens                                 |
| Quest progress cleanup             | `engine`               | Done, tested: an operator archive with a report, and a restore                                       |
| Load baseline                      | `go + engine`          | Measured locally: 100 guests; 100 accounts at 50 commits/s. Open: mixed load at capacity             |
| Portal session cookies             | `engine`               | Open: the access token lives in `localStorage`; an HttpOnly cookie model needs a migration plan      |
| Valkey for guest identities        | `engine`               | Open: guest identities share the evicting cache Valkey                                               |
| Wallet account binding             | `engine-cyberia`       | Open: bind `User.wallet.accountId` after a SIWE sign-in                                              |
| Direct chat across worlds          | `go`                   | Open: friends in another world show presence only                                                    |
| Universe profiles                  | `engine + go`          | Done, tested: one profile per universe, with per-world position, vaults and quests |
| Universe graph and travel          | `engine + client`      | Done, tested: authored cells and routes, the UNIVERSE view, TRAVEL through the launch bridge         |
| Server registry                    | `engine + go`          | Done, tested: one report per process, logical endpoints over replicas, ordered reports, TTL          |
| Content across worlds              | `go`                   | Done, tested: labels resolved at placement, held on another definition, unused ones evicted          |
| Hot reload of every replica        | `engine + go`          | Open: a trigger reaches one replica per endpoint; the others follow with their reload loop           |

### Data contract (alpha)

```
CyberiaPlayer (MongoDB), unique {user, universeCode}:
  user: ObjectId → User
  universeCode: string                        // CyberiaUniverse.code
  schemaVersion: 2, epoch, commitSeq, revision
  coins: uint32
  xp: uint64                                  // the level derives from it
  bag, storage: [{ itemId, olCid, quantity, slot, active }]
  held: [{ stack, container: bag|storage, actionCode, reason }]
  worlds: [{
    instanceCode,
    position: { mapCode, x, y, at }, positionSeq,
    vaults: [{ actionCode, stacks: [...] }],
    held: [{ stack, container: vault, actionCode, reason }],
  }]

CyberiaQuestProgress (MongoDB), unique {player, instanceCode, questCode}:
  player: ObjectId → CyberiaPlayer
  instanceCode, questCode, status, stepProgress: [{ stepId, objectiveProgress: [...] }]
```

Every stack carries the `olCid` it was granted with beside its label, so a rebound label never
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
| Quest progress, objectives, steps | Cyberia      | MongoDB (`CyberiaQuestProgress`) | Game server  |
| Coin balance (Fountain and Sink)  | Cyberia      | MongoDB (`CyberiaPlayer`)        | Game server  |
| Equipment activation              | Cyberia      | MongoDB (`CyberiaPlayer`)        | Game server  |
| Item ownership                    | ItemLedger   | ERC-1155 balances                | Chain        |
| CKY balance                       | CryptoKoyn   | ERC-1155 token 0                 | Chain        |
| Definition identity               | Object Layer | Canonical bytes                  | Content hash |

Progress never moves on chain, and ownership never moves into the game database as a source of
truth. A chain outage stops transfers; it does not stop play.

### Milestone goals

| Task                             | Component                           | Notes                                                                 |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| SIWE sign-in in the client       | `cyberia-client`                    | JS bridge calls the wallet provider; no key reaches C                 |
| On-chain ownership read          | `engine-cyberia`                    | `balanceOf` per token type for the player address                     |
| Ownership over gRPC              | `proto + engine + go`               | `AcquirePlayerSession` returns indexed balances as inventory          |
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
