# Off-chain economy

Coins are an off-chain wallet that `cyberia-server` owns. The instance config sets the rules, the
server applies them, and the client only shows the balance. This page states who makes, moves and
destroys coins, the drop rule, the configuration, the feedback, and what stays planned.

---

## Wallet

- `Session.Coins` of a player and `Brain.Coins` of a bot are the balance, an unsigned 32-bit
  integer. `AddCoins` clamps every change to `[0, 4294967295]`.
- The coin Object Layer stack only shows the balance. `SyncCoinOL` sets its quantity on every change
  and keeps it inactive. Item activation never reaches it, and the bar pins it outside the
  [capacity](inventory-capacity.md#model).
- A wallet is session state. It ends with the session, and a reconnect starts a new one at
  `playerSpawnCoins` ([player identity](player-identity-and-profile.md#session-identity)).

---

## Coin flows

| Event                                   | Coins                                                               | Code                                     |
| --------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| A session starts                        | The wallet is set to `playerSpawnCoins`: new coins                  | `FountainInitPlayer`                     |
| A session ends                          | The wallet is discarded                                             | `detachClient`                           |
| A bot spawns or respawns                | The wallet is set to `botSpawnCoins`; collected coins are discarded | `FountainInitBot`                        |
| A bot dies                              | A coin token of new coins; the wallet stays until the respawn       | `BotCoinDropAmount`, `killEntity`        |
| A player dies with damage contributors  | The drop leaves the wallet into a coin token                        | `PvpCoinDropAmount`, `handlePlayerDeath` |
| A player dies with no contributor       | Nothing drops                                                       | `handlePlayerDeath`                      |
| A contributor collects a coin token     | The player or bot gains its coins                                   | `game/content/loot.go`                   |
| A coin token expires                    | Its coins are destroyed                                             | `ExpiresAt` of the token                 |
| A player dies, `respawnCostPercent > 0` | That share of the wallet is destroyed before the drop               | `SinkRespawnCost`                        |
| A price or a cost in coins              | The coins leave the economy                                         | `ExchangeItems`                          |
| A reward in coins                       | New coins                                                           | `ExchangeItems`                          |
| A vault deposit or withdrawal           | Coins move between the wallet and the vault                         | `game/content/storage.go`                |

- `ExchangeItems` changes everything or nothing. A refused purchase or assembly leaves the wallet as
  it was.
- [Personal storage](player-storage.md#two-containers) refuses coins.
- Nothing caps the total supply. Bot deaths, new sessions and coin rewards add coins. Expired tokens,
  prices, the respawn cost, bot respawns and ended sessions remove them.

---

## Drop rule

A death drops `min(balance, max(floor(balance × rate), coinKillMinAmount))` coins, and nothing when
the balance is 0.

- The type of the victim sets the rate, whoever made the kill: `coinKillPercentVsBot` for a bot,
  `coinKillPercentVsPlayer` for a player. A bot that kills a player uses `coinKillPercentVsPlayer`.
- The balance of a bot is its wallet, but never less than `botSpawnCoins`.
- `coinKillMinAmount` is a minimum inside the balance. A victim with fewer coins drops all it holds.
  A victim with no coins drops none.
- Only damage contributors, players and bots, can collect the token.

With the default rules:

| Victim | Balance | Drop |
| ------ | ------: | ---: |
| Player |       0 |    0 |
| Player |       4 |    4 |
| Player |      50 |   10 |
| Player |     200 |   30 |
| Bot    |       0 |   20 |
| Bot    |      50 |   20 |

---

## Configuration

`economyRules` of the `CyberiaInstanceConf` holds the rules. `ECONOMY_RULES_DEFAULTS` and
`ECONOMY_RULE_LIMITS` in `src/api/cyberia-server-defaults/cyberia-server-defaults.js` define the
defaults and the bounds.

| Field                     | Default | Bounds        | Meaning                                      |
| ------------------------- | ------: | ------------- | -------------------------------------------- |
| `botSpawnCoins`           |      50 | integer, 0–1M | The wallet of a bot at each spawn            |
| `playerSpawnCoins`        |      50 | integer, 0–1M | The wallet of a new session                  |
| `coinKillPercentVsBot`    |     0.4 | 0–1           | The share of its balance a dead bot drops    |
| `coinKillPercentVsPlayer` |    0.15 | 0–1           | The share of its balance a dead player drops |
| `coinKillMinAmount`       |      10 | integer, 0–1M | The least a death drops, inside the balance  |
| `respawnCostPercent`      |       0 | 0–1           | The share a dead player burns; 0 disables it |

**One resolution.** `resolveEconomyRules` fills each unset field from the defaults and refuses a
value out of bounds. The conf model and the conf API use it, and `toInstanceConfig` sends its result
to the game server as the `EconomyRules` message. An explicit 0 stays 0.

**Validation at boot and reload.** `node bin/cyberia stat-contract` generates the same bounds into
the Go server. `ApplyInstanceConfig` validates the progression and economy rules before it takes the
world lock, so an invalid config changes nothing: the rules in force stay, and the reload retries
with the next payload.

**Sinks.** The respawn cost is the one configurable sink, and 0 disables it. No portal fee or
crafting fee exists. The `EconomyRules` message reserves their former fields 7 and 8.

---

## Feedback

- The game link carries one JSON envelope, `{type, payload}`. Combat text is the `combat_text`
  message, `{kind, worldX, worldY, value}`:

  | `kind`   | Shows           | Reaches                        |
  | -------- | --------------- | ------------------------------ |
  | `damage` | Red `-N` life   | Every player whose view has it |
  | `regen`  | Green `+N` life | Every player whose view has it |
  | `xp`     | Gold `+N XP`    | The earner only                |

- No combat text kind exists for coins or items. A balance change plays the quantity effect on the
  coin slot of the bar (`fx_inventory_bar_qty`). A pickup shows in the loot grid. A refused purchase
  shows its reason on the shop card.

---

## CKY bridge: planned

No code converts coins to the CKY token or back. No deposit, withdrawal, conversion rate, mint,
burn, escrow or bridge fee exists. In Phase 1 coins never leave `cyberia-server`. Persistent wallets
are planned for [Phase 2](roadmap.md#phase-2--alpha-centralized-off-chain-persistent-sessions), and
on-chain ownership for [Phase 3](roadmap.md#phase-3--beta-on-chain-ownership).

---

## Tests

| Test                                           | What it proves                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `cyberia-server/game/content/economy_test.go`  | The wallet clamp, the drop rule for both victim types, an explicit 0 rate, the bounds |
| `cyberia-server/game/net/progression_test.go`  | A config with an invalid economy rule changes nothing                                 |
| `cyberia-server/game/content/capacity_test.go` | A refused purchase charges nothing                                                    |
| `test/cyberia/unit/stats.test.js`              | The engine resolution keeps an explicit 0 and refuses values out of bounds            |
