# Off-Chain Economy: Fountain & Sink Architecture

**Module:** `cyberia-server/src/economy.go` · `src/api/cyberia-instance-conf`

> **Status:** Alpha (sinks disabled by default; all values reset on reconnect).
> **On-chain bridge:** CKY ERC-1155 token (ID 0) on Hyperledger Besu.
> The bridge protocol stays aligned with the project's CKY tokenomics model.

---

## 1. Model Overview

Cyberia Online uses the **Fountain & Sink** economy — the industry standard for sustainable in-game economies, pioneered by _Ultima Online_ and refined in _EVE Online_ and _World of Warcraft_.

```
                ┌─────────────────────────────┐
                │         FOUNTAINS           │
                │  (inject coins into economy) │
                │                             │
                │  botSpawnCoins  ──► Bot      │
                │  playerSpawnCoins ► Player   │
                └──────────────┬──────────────┘
                               │ new coins
                               ▼
                ┌──────────────────────────────┐
                │      CIRCULATING SUPPLY      │
                │   (player & bot wallets)     │
                └──────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          │   KILL LOOT             │  zero-sum drop race
          │   victim stake → grid drop    │
          │   contributors race to collect│
          │                         │
          │  PvE: coinKillPercentVsBot    │
          │  PvP: coinKillPercentVsPlayer │
          │  floor: coinKillMinAmount     │
          └────────────┬────────────┘
                       │
                ┌──────▼──────────────────────┐
                │           SINKS             │
                │   (destroy coins — alpha=0) │
                │                             │
                │  respawnCostPercent         │
                │  portalFee                  │
                │  craftingFeePercent         │
                └─────────────────────────────┘
```

### Core Rules

| Rule                          | Description                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| **Bots are infinite mint**    | Every bot respawn resets wallet to `botSpawnCoins`. Supply bounded by player kill rate.         |
| **Players are zero-sum**      | A PvP kill scatters the victim's coins as a grid drop but creates no new ones — redistribution only. |
| **Loot is a contributor race**| Every kill drops a coin token only damage contributors may collect; the first eligible collider wins. Damage amount is irrelevant — only contribution counts. Bot-only kills drop nothing. |
| **Kill floor**                | `coinKillMinAmount` guarantees every successful kill pays out even against a near-empty wallet. |
| **Sinks scale with activity** | Fees burn a fraction — more activity = more burn, preventing indefinite inflation.              |

---

## 2. Configuration Structure

Economy parameters live in `CyberiaInstanceConf.economyRules`. A document without an `economyRules` sub-document receives canonical defaults automatically.

### 2.1 JavaScript Defaults (`cyberia-server-defaults.js`)

```javascript
economyRules: {
  // ── Fountains ──────────────────────────────────────────
  botSpawnCoins:    50,   // coins on bot spawn/respawn (infinite mint)
  playerSpawnCoins: 50,   // guest starting wallet (resets on reconnect)

  // ── Kill Transfer ───────────────────────────────────────
  coinKillPercentVsBot:    0.40, // 40% of bot wallet → killer on PvE kill
  coinKillPercentVsPlayer: 0.15, // 15% of player wallet → killer on PvP kill
  coinKillMinAmount:       10,   // minimum coins per kill (hard floor)

  // ── Sinks (alpha: all 0 = disabled) ────────────────────
  respawnCostPercent:  0.0,  // fraction burned on player death
  portalFee:           0,    // flat coins burned per portal use
  craftingFeePercent:  0.0,  // fraction burned per crafting action
}
```

### 2.2 Protobuf Message (`proto/cyberia.proto`)

```proto
message EconomyRules {
  int32  bot_spawn_coins             = 1;
  int32  player_spawn_coins          = 2;
  double coin_kill_percent_vs_bot    = 3;
  double coin_kill_percent_vs_player = 4;
  int32  coin_kill_min_amount        = 5;
  double respawn_cost_percent        = 6;
  int32  portal_fee                  = 7;
  double crafting_fee_percent        = 8;
}
```

### 2.3 Go Server (`server.go → ApplyInstanceConfig`)

```go
er := cfg.GetEconomyRules()
if er == nil { er = &pb.EconomyRules{} }

s.botSpawnCoins           = int(er.GetBotSpawnCoins())
s.playerSpawnCoins        = int(er.GetPlayerSpawnCoins())
s.coinKillPercentVsBot    = er.GetCoinKillPercentVsBot()
s.coinKillPercentVsPlayer = er.GetCoinKillPercentVsPlayer()
s.coinKillMinAmount       = int(er.GetCoinKillMinAmount())
s.respawnCostPercent      = er.GetRespawnCostPercent()
s.portalFee               = int(er.GetPortalFee())
s.craftingFeePercent      = er.GetCraftingFeePercent()
```

---

## 3. Runtime Economy API (`economy.go`)

All economy logic is encapsulated in a single file enforcing the single-source principle. Callers (`handlers.go`, `collision.go`, `skill.go`) call named methods and never manipulate coin wallets directly.

### Method Reference

| Method                                | Caller                             | Description                                          |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `FountainInitPlayer(player)`          | `handlers.go` on WebSocket connect | Credits `playerSpawnCoins` to new player             |
| `FountainInitBot(bot)`                | `collision.go` on bot respawn      | Resets bot wallet to `botSpawnCoins` (infinite mint) |
| `botCoinDropAmount(bot)`              | `collision.go handleBotDeath`      | Coin stake a dead bot scatters as a grid drop        |
| `pvpCoinDropAmount(player)`           | `collision.go handlePlayerDeath`   | Coin stake a dead player scatters as a grid drop     |
| `SinkRespawnCost(player)`             | `collision.go handlePlayerDeath`   | Burns `respawnCostPercent`% of player coins          |
| `SinkPortalFee(player)`               | Portal handler                     | Burns flat `portalFee` coins on portal use           |
| `SinkCraftingFee(player, item)`       | Craft handler                      | Burns `craftingFeePercent`% on crafting              |

### Kill Loot Logic

Every kill scatters the victim's coin stake as a grid drop token (`spawnDrops`,
`loot.go`). Only damage contributors may collect it — the amount of damage does
not matter, only that the player contributed — and collection is a race: the
first eligible player to collide with the settled token wins it. The same model
covers PvE and PvP; a kill with no player contributor drops nothing.

```
OnDeath(victim):
  contributors = players in victim.DamageLedger    // bot-only kills drop nothing
  if empty(contributors): return

  rate = coinKillPercentVsBot     if victim is bot     (PvE)
         coinKillPercentVsPlayer  if victim is player  (PvP)

  amount = max(floor(victim.coins × rate), coinKillMinAmount)
  amount = min(amount, victim.coins)         // can't drop more than available
                                             // (bots mint up to botSpawnCoins)

  victim.coins -= amount                     // bots re-mint on respawn
  spawnDropToken(coin × amount, contributors)
  // No coin FCT — the victim's balance change surfaces in the inventory-bar
  // quantity FX, and the gain side in the collector's loot grid.
```

---

## 4. Coin Balance Architecture

Coins use a **flat + display split** design:

| Field                         | Type                                                  | Role                                                              |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| `entity.Coins`                | `uint32`                                              | **Single source of truth** — O(1) read/write for all economy math |
| `coinItemId` ObjectLayer slot | `ObjectLayerState { Active: false, Quantity: Coins }` | **Display only** — synced by `syncCoinOL()` on every mutation     |

**Why split:**

- Economy math uses `Coins` directly (O(1)); no OL iteration.
- Coin slot is always `Active: false` — the inventory UI automatically renders it with a lock indicator (non-activable).
- No risk of coin OL being activated by the `item_activation` handler.

---

## 5. Floating Combat Text (FCT) Wire Protocol

Economy events trigger client-side visual feedback via the binary AOI protocol.

**Coin FCT (14 bytes, fixed):**

```
MsgTypeFCT = 0x04

Offset  Size  Field
──────  ────  ─────────────────────────────
  0      u8   message type (0x04)
  1      u8   fct_type (see table)
  2      f32  world_x (entity position)
  6      f32  world_y
 10      u32  value (always positive; sign implied by type)
```

**Item FCT (variable length):**

```
MsgTypeItemFCT = 0x05

Offset  Size  Field
──────  ────  ─────────────────────────────
  0      u8   message type (0x05)
  1      u8   fct_type (FCTTypeItemGain or FCTTypeItemLoss)
  2      f32  world_x
  6      f32  world_y
 10      u32  quantity
 14      u8   itemId length
 15      str  itemId bytes
```

| `fct_type` | Constant            | Color  | Display        | Status |
| ---------- | ------------------- | ------ | -------------- | ------ |
| `0x00`     | `FCTTypeDamage`     | Red    | `-N` HP lost   | active |
| `0x01`     | `FCTTypeRegen`      | Green  | `+N` HP gained | active |
| `0x02`     | `FCTTypeCoinGain`   | Yellow | `+N` coins     | retired |
| `0x03`     | `FCTTypeCoinLoss`   | Yellow | `-N` coins     | retired |
| `0x04`     | `FCTTypeItemGain`   | Cyan   | `+N ItemID`    | retired |
| `0x05`     | `FCTTypeItemLoss`   | Purple | `-N ItemID`    | retired |

One uniform visibility rule: **every combat FCT (damage and regen, on any
entity — player, bot, or resource) is broadcast with its exact amount to every
player whose AOI covers the event. All viewers see the identical message.**

Coin and item quantity changes emit no FCT: gains surface in the loot grid and
balance changes in the inventory-bar quantity FX (`fx_inventory_bar_qty`),
which plays a `+N`/`-N` popup on the affected slot. The retired wire values
are never reused.

---

## 6. MongoDB Document Example

```json
{
  "instanceCode": "alpha-01",
  "economyRules": {
    "botSpawnCoins": 50,
    "playerSpawnCoins": 50,
    "coinKillPercentVsBot": 0.4,
    "coinKillPercentVsPlayer": 0.15,
    "coinKillMinAmount": 10,
    "respawnCostPercent": 0.0,
    "portalFee": 0,
    "craftingFeePercent": 0.0
  }
}
```

---

## 7. gRPC Config Builder

The `toInstanceConfig()` function in `grpc-server.js` resolves `economyRules` with a two-tier fallback:

```
priority:  gc.economyRules.field    (instance document in MongoDB)
         → fb.economyRules.field    (CYBERIA_INSTANCE_CONF_DEFAULTS — always set)
```

---

## 8. On-Chain Bridge

The off-chain `coin` balance maps to the on-chain **CKY token (ERC-1155 Token ID 0)** on Hyperledger Besu:

```
Off-chain Coins (uint32)
    ↕  conversion (via cryptokoyn.net withdrawal protocol)
On-chain CKY (ERC-1155, Token ID 0, 18-decimal precision)
```

**Bridge mechanics:**

- **Withdrawal:** Player requests conversion of off-chain coins to on-chain CKY via cryptokoyn.net.
- **Deposit:** Player deposits on-chain CKY to top up off-chain balance.
- **CKY Minting Fee:** Converting off-chain items to ERC-1155 tokens requires a CKY fee — the primary on-chain sink mechanism.

---

## 9. Enabling Sinks (Alpha → Beta)

To activate economy pressure:

```javascript
// Update CyberiaInstanceConf in MongoDB for the target instance
{
  "economyRules": {
    "respawnCostPercent":  0.05,  // 5% burned on death
    "portalFee":           5,     // 5 coins burned per portal use
    "craftingFeePercent":  0.03   // 3% burned on each crafting action
  }
}
```

The Go server picks up updated config via gRPC hot-reload (`GetFullInstance` polling at `ENGINE_GRPC_RELOAD_INTERVAL_SEC`).
