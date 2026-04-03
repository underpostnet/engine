# Off-Chain Economy — Fountain & Sink Architecture

> **Status:** Alpha (sinks disabled; all values reset on reconnect).  
> **On-chain bridge:** Planned — CKY ERC-1155 token (token ID 0) on Hyperledger Besu.  
> See `hardhat/WHITE-PAPER.md §7 Tokenomics` for the bridge protocol.

---

## 1. Model Overview

This game uses the **Fountain & Sink** economy model — the industry standard for
sustainable in-game economies, pioneered by _Ultima Online_ and perfected in
_EVE Online_ and _World of Warcraft_.

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
          │   KILL TRANSFER         │  zero-sum: no new coins created
          │   (redistribution)      │  loser → winner
          │                         │
          │  PvE: coinKillPercentVsBot    │
          │  PvP: coinKillPercentVsPlayer │
          │  floor: coinKillMinAmount     │
          └────────────┬────────────┘
                       │
                ┌──────▼──────────────────────┐
                │           SINKS             │
                │   (destroy coins, alpha=0)  │
                │                             │
                │  respawnCostPercent         │
                │  portalFee                  │
                │  craftingFeePercent         │
                └─────────────────────────────┘
```

### Core rules

| Rule                         | Description                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Bots are infinite mint**   | Every bot respawn resets its wallet to `botSpawnCoins`. The supply is only bounded by player activity (kill rate).        |
| **Players are zero-sum**     | Killing a player transfers coins but does not create new ones. PvP is redistribution only.                                |
| **Kill floor**               | `coinKillMinAmount` guarantees every successful kill pays out, even against a near-empty wallet.                          |
| **Sinks scale with economy** | Portal fees and respawn costs burn a fraction — more activity = more burn. Keeps the economy from inflating indefinitely. |

---

## 2. Configuration Structure

Economy parameters live in a dedicated `economyRules` sub-document inside
`CyberiaInstanceConf`, exactly mirroring the `skillRules` pattern.

### 2.1 JavaScript defaults (`cyberia-instance-conf.defaults.js`)

```js
economyRules: {
  // ── Fountains ──────────────────────────────────────────────────────
  botSpawnCoins: 50,       // coins on bot spawn / respawn (infinite mint)
  playerSpawnCoins: 50,    // guest starting wallet (resets on reconnect)

  // ── Kill Transfer ───────────────────────────────────────────────────
  coinKillPercentVsBot: 0.4,     // 40 % of bot wallet → killer on PvE kill
  coinKillPercentVsPlayer: 0.15, // 15 % of player wallet → killer on PvP kill
  coinKillMinAmount: 10,         // minimum coins per kill (hard floor)

  // ── Sinks (alpha: all 0 = disabled) ────────────────────────────────
  respawnCostPercent: 0.0,  // fraction burned on player death
  portalFee: 0,             // flat coins burned per portal use
  craftingFeePercent: 0.0,  // fraction burned per crafting action
},
```

### 2.2 Mongoose schema (`cyberia-instance-conf.model.js`)

```js
// EconomyRulesSchema — mirrors defaults above
economyRules: {
  type: EconomyRulesSchema;
}
```

The schema validates each field against the default value so a freshly created
document is immediately playable without any explicit configuration.

### 2.3 Protobuf message (`proto/cyberia.proto`)

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

// Used in InstanceConfig:
EconomyRules economy_rules = 62;
```

### 2.4 Go server (`src/server.go` → `ApplyInstanceConfig`)

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

## 3. Runtime Economy API (`src/economy.go`)

All economy logic is encapsulated in a single file to enforce the single-source
principle. Callers (`handlers.go`, `collision.go`, `skill.go`) call named methods
and never manipulate coin wallets directly.

### Method reference

| Method                                | Caller                             | Description                                                 |
| ------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `FountainInitPlayer(player)`          | `handlers.go` on WebSocket connect | Credits `playerSpawnCoins` to new player                    |
| `FountainInitBot(bot)`                | `collision.go` on bot respawn      | Resets bot wallet to `botSpawnCoins` (infinite mint)        |
| `ExecuteKillTransfer(caster, victim)` | `skill.go HandleOnKillSkills`      | Transfers coins based on kill scenario (all 4 combinations) |
| `SinkRespawnCost(player)`             | `collision.go handlePlayerDeath`   | Burns `respawnCostPercent`% of player coins (0 = no-op)     |
| `SinkPortalFee(player)`               | Portal handler _(future)_          | Burns flat `portalFee` coins on portal use (0 = no-op)      |

### Kill transfer scenarios

```
ExecuteKillTransfer(caster, victim):

  if caster=Player, victim=Bot    → PvE rate (coinKillPercentVsBot)
  if caster=Player, victim=Player → PvP rate (coinKillPercentVsPlayer)
  if caster=Bot,    victim=Player → PvP rate (bot kills player)
  if caster=Bot,    victim=Bot    → PvE rate (bot kills bot, e.g. friendly fire)

  transfer = max(floor(victim.coins * rate), coinKillMinAmount)
  transfer = min(transfer, victim.coins)   -- can't take more than available
  victim.coins  -= transfer
  caster.coins  += transfer               -- bots ignore received coins
  sendFCT(caster, FCTTypeCoinGain, ...)
  sendFCT(victim, FCTTypeCoinLoss, ...)
```

---

## 4. Floating Combat Text (FCT) Wire Protocol

Economy events trigger client-side visual feedback via the binary AOI protocol.

```
MsgTypeFCT = 0x04   (14 bytes, little-endian)

Offset  Size  Field
──────  ────  ──────────────────────────────────────
  0      u8   message type (0x04)
  1      u8   fct_type  (see table below)
  2      f32  world_x   (entity position)
  6      f32  world_y
 10      u32  value     (always positive; sign implied by type)
```

| `fct_type` | Constant          | Color  | Display        |
| ---------- | ----------------- | ------ | -------------- |
| `0x00`     | `FCTTypeDamage`   | Red    | `-N` HP lost   |
| `0x01`     | `FCTTypeRegen`    | Green  | `+N` HP gained |
| `0x02`     | `FCTTypeCoinGain` | Yellow | `+N` coins     |
| `0x03`     | `FCTTypeCoinLoss` | Yellow | `-N` coins     |

---

## 5. MongoDB Document Example

A complete `CyberiaInstanceConf` document with economy configured:

```json
{
  "instanceCode": "alpha-01",
  "cellSize": 45,
  "fps": 60,
  "economyRules": {
    "botSpawnCoins": 50,
    "playerSpawnCoins": 50,
    "coinKillPercentVsBot": 0.4,
    "coinKillPercentVsPlayer": 0.15,
    "coinKillMinAmount": 10,
    "respawnCostPercent": 0.0,
    "portalFee": 0,
    "craftingFeePercent": 0.0
  },
  "skillRules": {
    "projectileSpawnChance": 0.5,
    "projectileLifetimeMs": 2000,
    "projectileWidth": 1,
    "projectileHeight": 1,
    "projectileSpeedMultiplier": 3,
    "doppelgangerSpawnChance": 0.5,
    "doppelgangerLifetimeMs": 5000,
    "doppelgangerSpawnRadius": 3,
    "doppelgangerInitialLifeFraction": 1.0
  }
}
```

---

## 6. gRPC / Config Builder

The `toInstanceConfig()` function in `grpc-server.js` resolves `economyRules`
with a simple two-tier fallback:

```
priority:  gc.economyRules.field   (instance document in MongoDB)
         → fb.economyRules.field   (CYBERIA_INSTANCE_CONF_DEFAULTS — always set)
```

All economy state lives exclusively in `economyRules`. There is no flat-field
fallback chain. A document without an `economyRules` sub-document receives
the canonical defaults automatically.

---

## 7. Enabling Sinks (Graduation from Alpha)

When you want to activate the economy pressure levers, update `economyRules` in
the DB document for the target instance:

```json
{
  "economyRules": {
    "respawnCostPercent": 0.1,
    "portalFee": 5,
    "craftingFeePercent": 0.05
  }
}
```

The Go server picks up changes on the next `LoadAll` / hot-reload via gRPC.
No binary redeployment is needed.

Recommended progression:

1. **Alpha** — all sinks at 0; fountains generous (50 coins/spawn).
2. **Beta** — `respawnCostPercent: 0.05`, bots at 30 coins.
3. **Live** — tune all three sinks; enable on-chain bridge.

---

## 8. On-Chain Bridge (Future)

```
Off-chain wallet (in-memory)
        │  on authenticate (secp256k1 sig)
        ▼
ERC-1155 CKY token (token ID 0)   ← ObjectLayerToken contract
        │  on session end / explicit withdraw
        ▼
Player's Hyperledger Besu wallet
```

Until the bridge is live every economy event is ephemeral:

- Wallets reset to `playerSpawnCoins` on every reconnect.
- Bot wallets reset to `botSpawnCoins` on every respawn.
- No cross-session coin persistence.

This is intentional — the off-chain fallback lets the economy be tuned and
battle-tested before committing values to an immutable ledger.

---

## 9. Field Reference

| Field                                  | Type          | Default | Scope         |
| -------------------------------------- | ------------- | ------- | ------------- |
| `economyRules.botSpawnCoins`           | `int`         | `50`    | Fountain      |
| `economyRules.playerSpawnCoins`        | `int`         | `50`    | Fountain      |
| `economyRules.coinKillPercentVsBot`    | `float` [0,1] | `0.4`   | Kill Transfer |
| `economyRules.coinKillPercentVsPlayer` | `float` [0,1] | `0.15`  | Kill Transfer |
| `economyRules.coinKillMinAmount`       | `int`         | `10`    | Kill Transfer |
| `economyRules.respawnCostPercent`      | `float` [0,1] | `0.0`   | Sink          |
| `economyRules.portalFee`               | `int`         | `0`     | Sink          |
| `economyRules.craftingFeePercent`      | `float` [0,1] | `0.0`   | Sink          |
