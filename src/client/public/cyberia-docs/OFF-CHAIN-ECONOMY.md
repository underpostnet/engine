# Off-Chain Economy: Fountain & Sink Architecture

**Module:** `cyberia-server/src/economy.go` · `src/api/cyberia-instance-conf`

> **Status:** Alpha (sinks disabled by default; all values reset on reconnect).
> **On-chain bridge:** CKY ERC-1155 token (ID 0) on Hyperledger Besu.
> See [WHITE-PAPER.md](WHITE-PAPER.md) §7 for the bridge protocol.

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
          │   KILL TRANSFER         │  zero-sum redistribution
          │   loser → winner        │
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
| **Players are zero-sum**      | Killing a player transfers coins but creates no new ones. PvP is redistribution only.           |
| **Kill floor**                | `coinKillMinAmount` guarantees every successful kill pays out even against a near-empty wallet. |
| **Sinks scale with activity** | Fees burn a fraction — more activity = more burn, preventing indefinite inflation.              |

---

## 2. Configuration Structure

Economy parameters live in `CyberiaInstanceConf.economyRules`. A document without an `economyRules` sub-document receives canonical defaults automatically.

### 2.1 JavaScript Defaults (`cyberia-instance-conf.defaults.js`)

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
| `ExecuteKillTransfer(caster, victim)` | `skill.go HandleOnKillSkills`      | Transfers coins based on kill scenario               |
| `SinkRespawnCost(player)`             | `collision.go handlePlayerDeath`   | Burns `respawnCostPercent`% of player coins          |
| `SinkPortalFee(player)`               | Portal handler                     | Burns flat `portalFee` coins on portal use           |
| `SinkCraftingFee(player, item)`       | Craft handler                      | Burns `craftingFeePercent`% on crafting              |

### Kill Transfer Logic

```
ExecuteKillTransfer(caster, victim):

  if caster=Player, victim=Bot    → rate = coinKillPercentVsBot     (PvE farming)
  if caster=Player, victim=Player → rate = coinKillPercentVsPlayer  (PvP)
  if caster=Bot,    victim=Player → rate = coinKillPercentVsPlayer  (bot kills player)
  if caster=Bot,    victim=Bot    → rate = coinKillPercentVsBot     (bot-on-bot)

  transfer = max(floor(victim.coins × rate), coinKillMinAmount)
  transfer = min(transfer, victim.coins)    // can't take more than available

  victim.coins  -= transfer
  caster.coins  += transfer                 // bots ignore received coins
  → sendFCT(caster, FCTTypeCoinGain, worldX, worldY, transfer)
  → sendFCT(victim, FCTTypeCoinLoss,  worldX, worldY, transfer)
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

| `fct_type` | Constant          | Color  | Display        |
| ---------- | ----------------- | ------ | -------------- |
| `0x00`     | `FCTTypeDamage`   | Red    | `-N` HP lost   |
| `0x01`     | `FCTTypeRegen`    | Green  | `+N` HP gained |
| `0x02`     | `FCTTypeCoinGain` | Yellow | `+N` coins     |
| `0x03`     | `FCTTypeCoinLoss` | Yellow | `-N` coins     |
| `0x04`     | `FCTTypeItemGain` | Cyan   | `+N ItemID`    |
| `0x05`     | `FCTTypeItemLoss` | Purple | `-N ItemID`    |

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
