# Off-chain economy

Coins are an off-chain wallet that `cyberia-server` owns. `engine-cyberia` holds the economy as
content: one profile per economy and one policy row per item. The server applies the policy, and
the client shows each amount the server charges or pays. This page states the model, how a world
gets its economy, each coin and item flow, the operations between players, the feedback and the
tests.

---

## Wallet

- `Session.Coins` of a player and `Brain.Coins` of a bot are the balance, an unsigned 32-bit
  integer. The profile sets the wallet maximum, `currency.maxBalance`, at most 4294967295.
- An operation that would credit a player past the maximum is refused with `wallet_full`. Nothing
  clamps a player credit. A coin token that a full wallet cannot take stays on the ground.
- The coin Object Layer stack only shows the balance. `SyncCoinOL` sets its quantity on every change
  and keeps it inactive. It is no stack: no trade line, drop, sale or burn names it. A trade moves
  coins in its own field, and the bar pins the coin slot outside the
  [capacity](inventory-capacity.md#model).
- An account keeps one wallet per universe in its profile. A guest wallet ends with its session
  ([player identity](player-identity-and-profile.md#session-identity)).

---

## Economy profile

A `CyberiaEconomy` holds rules that worlds can share. A `CyberiaInstanceConf` names the profile its
world runs by `economyCode`; a conf without a code runs `standard`. Each world chooses its own
profile, and several worlds may name the same one.

| Field          | Holds                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| `code`         | The unique key                                                             |
| `status`       | `active`, or `retired`: a retired profile keeps its rows, no conf names it |
| `revision`     | Rises with each write of the profile or of one of its item rows            |
| `currency`     | `code` (`coin`) and `maxBalance`                                           |
| `rules`        | The coin model: spawn wallets, death drops, respawn cost                   |
| `fees`         | `portal` and `craft`: coins one operation that succeeds charges once       |
| `itemDefaults` | The policy of an item without a row                                        |

A `CyberiaEconomicItemPolicy` row sets what one item may do. Its key is `{economyCode, itemId}`,
unique. A field the row leaves out inherits `itemDefaults`.

| Field            | Default | Bounds          | Meaning                                        |
| ---------------- | ------: | --------------- | ---------------------------------------------- |
| `trade`          |  `true` | —               | A player may offer it in a trade               |
| `worldDrop`      |  `true` | —               | A player may drop it on the ground             |
| `buyback`        | `false` | —               | A merchant may buy it                          |
| `buybackPayout`  |       0 | integer, 0–1M   | Coins a merchant pays per unit                 |
| `burn`           | `false` | —               | A terminal may burn it                         |
| `burnCoinFee`    |       0 | integer, 0–1M   | Coins a burn charges per unit                  |
| `craftSurcharge` |       0 | integer, 0–1M   | Coins an assembly charges per produced unit    |
| `market`         | `false` | —               | A market may list it; trade grants no market   |
| `portalFee`      |   unset | integer, 0–1M   | Coins a portal charges for each active item    |
| `salvage`        |    none | 8 lines, 1–1000 | What one burned unit grants: `[{itemId, qty}]` |

`portalFee` exists only on a row: the profile defaults never set it, and unset is not 0.

A salvage line never names its own item or coins, and a row with salvage cannot refuse `burn`.
`resolveEconomyProfile` and `itemPolicyDefect` in
`src/api/cyberia-server-defaults/cyberia-server-defaults.js` hold the defaults and the bounds. The
models, the APIs and the import use them, and `node bin/cyberia stat-contract` writes the same
bounds into the Go server.

`cyberia-content` defines each economy in its foundation, as kind `economy`. An import writes the
profile and replaces its rows in one transaction. A world export carries the economy its conf names
in `cyberia-economy.json`.

### Policy and definition

`itemId` is the logical identity; the [catalog](runtime-binding.md) binds it to one definition,
`olCid`. The snapshot stamps each row with the `olCid` its item is bound to when the world loads. A
row of an item with no binding stays out of the snapshot, with a warning.

The server checks the stack, not only the label. `ItemPolicyOf` refuses a stack whose `olCid` is not
the one the world binds, or not the one its row was stamped with (`incompatible`). A rebind of an
item therefore stops every economic operation on stacks of the old definition. They stay safe in the
inventory, and the [held stack](accounts-and-persistence.md#item-identity) rules apply to them.

### Snapshot and reload

`compileEconomySnapshot` turns the profile and its rows into the `EconomyRules` message of the
instance config. Both boot transports carry it: gRPC and the REST fallback. The world version folds
in the code and the revision of the profile and the binding of each row, so a policy change or a
rebind reaches the servers through their [hot reload](game-server.md). `ApplyInstanceConfig`
validates the snapshot before it takes the world lock: an invalid snapshot changes nothing.

### Shared wallets

An account carries one wallet and one bag between the worlds of a [universe](universe.md). The
members of a universe therefore keep one wallet contract: the same `currency.code` and the same
`currency.maxBalance`. Everything else may differ between them: the coin model, the fees, the item
policies and the merchants. A world can charge a portal fee or refuse a buyback that its neighbor
allows.

| Write                                         | Refused (`409`) when                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| A universe adds or keeps members              | Two members hold different wallets                         |
| A conf names another economy                  | Its wallet differs from the other members of its universe  |
| A profile changes its currency                | A universe of a world that names it would hold two wallets |
| A content release validates (`economy` check) | A universe of the host would hold two wallets over it      |

A new profile starts with the `playerSpawnCoins` of the first world it enters. The stored balance
never changes meaning between worlds: no world reads it with another maximum.

### Qualified references

An economy code is local to the deployment that serves it. Two independent deployments can both run
a `standard` that shares nothing. The snapshot names a profile with its authority:
`authorityId/code@revision`, for example `dd-cyberia/standard@3`. `authorityId` is the deploy id
(`DEPLOY_ID`), which does not change with a public URL. The server logs every operation with this
reference. A revision names the configuration a world saw; it proves no trust and no compatibility
([federation boundary](economy-federation.md)).

## Coin flows

| Event                                   | Coins                                                               | Code                                     |
| --------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| A session starts                        | The wallet is set to `playerSpawnCoins`: new coins                  | `FountainInitPlayer`                     |
| A bot spawns or respawns                | The wallet is set to `botSpawnCoins`; collected coins are discarded | `FountainInitBot`                        |
| A bot dies                              | A coin token of new coins; the wallet stays until the respawn       | `BotCoinDropAmount`, `killEntity`        |
| A player dies with damage contributors  | The drop leaves the wallet into a coin token                        | `PvpCoinDropAmount`, `handlePlayerDeath` |
| A contributor collects a coin token     | The player or bot gains its coins                                   | `game/content/loot.go`                   |
| A coin token expires                    | Its coins are destroyed                                             | `ExpiresAt` of the token                 |
| A player dies, `respawnCostPercent > 0` | That share of the wallet is destroyed                               | `SinkRespawnCost`                        |
| A shop price or a craft fee             | The coins leave the economy                                         | `ExchangeItems`, `CraftFee`              |
| A portal transit                        | `fees.portal` leaves the economy                                    | `ChargePortalFee`                        |
| A reward in coins                       | New coins                                                           | `ExchangeItems`                          |
| A buyback                               | `buybackPayout` per unit: new coins                                 | `HandleItemSell`                         |
| A burn                                  | `burnCoinFee` per unit leaves the economy                           | `HandleItemBurn`                         |
| A trade                                 | Coins move between two wallets                                      | `game/content/trade.go`                  |
| A vault deposit or withdrawal           | Coins move between the wallet and the vault                         | `game/content/storage.go`                |

- Each operation changes everything or nothing. A refused purchase, assembly, sale, burn or trade
  leaves the wallet and the bag as they were.
- A merchant is an authorized coin source. Content creates it on purpose: an action lists the item,
  and the policy of the item allows the buyback. Nothing caps the total supply.
- [Personal storage](player-storage.md#two-containers) refuses coins.

### Drop rule

A death drops `min(balance, max(floor(balance × rate), coinKillMinAmount))` coins, and nothing when
the balance is 0. The type of the victim sets the rate: `coinKillPercentVsBot` for a bot,
`coinKillPercentVsPlayer` for a player. The balance of a bot is never less than `botSpawnCoins`. Only
damage contributors, players and bots, can collect the token.

| Field                     | Default | Bounds        | Meaning                                      |
| ------------------------- | ------: | ------------- | -------------------------------------------- |
| `botSpawnCoins`           |      50 | integer, 0–1M | The wallet of a bot at each spawn            |
| `playerSpawnCoins`        |      50 | integer, 0–1M | The wallet of a new session or profile       |
| `coinKillPercentVsBot`    |     0.4 | 0–1           | The share of its balance a dead bot drops    |
| `coinKillPercentVsPlayer` |    0.15 | 0–1           | The share of its balance a dead player drops |
| `coinKillMinAmount`       |      10 | integer, 0–1M | The least a death drops, inside the balance  |
| `respawnCostPercent`      |       0 | 0–1           | The share a dead player burns; 0 disables it |

---

## Operation fees

### Portal fee

The server sets the fee of a transit from the portal itself:

1. It reads the active items of the portal. A decoration item that is not active adds nothing.
2. It resolves each item by its bound definition. A row compiled against another definition adds
   nothing.
3. Each item whose row sets `portalFee` adds that fee. The sum stops at 1,000,000 coins.
4. When no active item sets one, the transit charges `fees.portal` of the profile.

The profile fee never joins an item total, so nothing is charged twice. An explicit `portalFee: 0`
makes the portal free, even when `fees.portal` is set.

| Portal items (active)                     | `fees.portal` | Charged |
| ----------------------------------------- | ------------: | ------: |
| none with a fee                           |             4 |       4 |
| `gate-stone` 3                            |             4 |       3 |
| `gate-stone` 3, `gate-rune` 5             |             4 |       8 |
| `gate-stone` 0                            |             4 |       0 |
| `gate-moss` 9, inactive                   |             4 |       4 |
| `gate-stone` 3, row of another definition |             4 |       4 |

The hold on a portal is the quote. When the hold starts, the server records the fee and the economy
revision, and the transport bar of the player shows the fee. When the fee or the revision changes
during the hold, the hold starts again at the new fee, so a stale fee never charges. When the hold
completes, a player who cannot pay stays and hears why; the server charges the quoted fee once, and
only when the transit happens.

### Craft fee

One rule sets the coins of one assembly. The first rule that applies wins; the rules never add up.

1. The `fee` of the recipe, when the recipe names one. 0 is a fee: the assembly is free.
2. Else the `craftSurcharge` of each produced item, times the units the recipe produces.
3. Else `fees.craft` of the profile.
4. Else nothing.

No ingredient charges a fee. Example: a recipe takes 2 logs and 1 alloy and makes 3 planks, with no
`fee`. The plank row sets `craftSurcharge: 2`, so one assembly costs 3 × 2 = 6 coins; the logs and
the alloy add nothing. Without that row the assembly costs `fees.craft`.

The client shows the fee on the recipe card and sends it as the `quote` of `craft_item`. The server
refuses a different amount (`quote_changed`), so a reload never charges an amount the player did not
see. A cancel returns the fee with the ingredients.

---

## Buyback and burn

A `CyberiaAction` lists `buybackItems` (its merchant buys them) and `burnItems` (its terminal burns
them). Both the list and the item policy must allow the operation: a list never grants what the
policy refuses. The interact modal of such a bot shows a Buyback tab and a Salvage tab with the
payout or the fee of each item, the salvage, and how many the player holds.

- A sale takes the units and credits `buybackPayout × quantity`.
- A burn takes the units, charges `burnCoinFee × quantity` and grants the salvage of each unit, as
  one change. A bag without room for the salvage refuses it.
- A dead player, a player in a trade and a terminal out of view refuse the operation.

### Quotes

A sale and a burn run on a quote the server makes. Sell or Burn sends `item_quote`; the server
prices the stack at that terminal under the active economy revision and answers with a quote id,
the price per unit and the largest quantity the stack and the wallet allow. The quantity prompt
shows that price and its total. The confirm names the quote id and the quantity.

- A player holds one quote. A new quote replaces it.
- A quote runs once. A used quote, an expired quote (one minute) and a quote of the other kind
  refuse the confirm with `quote_gone`.
- The confirm checks the quote again: the same item and definition in the same place, a terminal
  that still lists it, the same price and the same economy revision. A changed stack refuses it
  with `no_stack`; a changed price or revision refuses it with `quote_changed` and the current
  price.

---

## Trades

Two players of one world process trade bag stacks and coins. The server holds the state machine; the
client shows it from the snapshot and sends intents.

| State        | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `requested`  | The initiator asked; the partner accepts or declines within 30 s    |
| `open`       | Each side offers up to 8 stacks and coins, then confirms            |
| `committing` | Both confirmed; the offers left both bags and the joint commit runs |

- Every offer change raises the revision and clears both confirmations. A confirmation names the
  revision it saw, so a player never confirms an offer it did not see.
- While a player trades, no explicit input moves its goods: drops, sales, burns, crafts and
  container moves are refused (`trading`).
- At confirmation the server checks each offered stack again: slot, item, definition and units, the
  policy of the item, both wallets and the room of both bags. A stack keeps its `olCid` when it
  changes hands.
- A guest never trades with an account (`guest_account`): goods never cross from a session into a
  profile.
- An open trade without a change for 3 minutes, a player who leaves, and a cancel close it. Nothing
  moved, so nothing returns.

**Guests.** Both sides apply at once in memory.

**Accounts.** The offers wait in escrow while the engine commits both profiles in one transaction
(`CommitPlayerStates`). No other state of either player commits alone in that window. Applied, each
side receives the escrow of the other; refused, each side gets its own back. A retry after a
transport error repeats the same operation id, and the engine applies it once. See
[accounts and persistent players](accounts-and-persistence.md#operations-between-players).

---

## World drops

A player drops units of a bag or personal storage stack on the ground for anyone to take: by drag
from the inventory bar onto the world, from the personal storage onto its drop zone, or with the
Drop button of the item card. The client asks how many first.

- The policy must allow `worldDrop`. Coins, Fragmentation items, a dead player and a player in a
  trade cannot drop.
- The token keeps the item, its `olCid` and the units. It lands on the walkable cell nearest the
  target, within 4 cells of the player; without a target it lands at the feet.
- A public token expires after 45 s. The first player that touches it takes it; a bot never does.
  The owner takes it back only after it stepped off the token once.
- A pickup grants the same `olCid`. A token whose item the world binds to another definition now
  becomes a held stack. A bag without room leaves the token on the ground.
- A guest takes only guest drops, and an account player only account drops: goods never cross
  between a guest session and a profile.

### Durable drops

An account drop is a `CyberiaWorldDrop` record. It survives a restart of the server and a reload of
the world.

| Step    | What commits                                                        | The token                                      |
| ------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| Drop    | The state without the stack, and the new record, in one transaction | Locked until it is saved; then public          |
| Pickup  | The state with the stack, and the claim of the record               | Locked while the claim waits                   |
| Restart | Nothing: the server lists the public records of its world at boot   | Back on its map, public until its expiry       |
| Expiry  | Nothing: a record is public only until its `expiresAt`              | Leaves the map; the record leaves 7 days later |

- A drop that can never be saved removes the token, and the saved stack stays with its owner. A
  drop while an earlier operation of the player waits is refused with `saving`.
- A claim is single-use: the engine claims only a public record of the same world that has not
  expired. Two servers or two players can never claim one record twice.
- A claimed record that is gone (`drop_gone`) removes the token. Any other refusal opens the token
  again with its expiry.
- The lifetime starts when the drop is saved. A drop of a map the world no longer has stays in the
  database until it expires.
- A restored token keeps the owner hold: its owner takes it back only after it stepped off it once.
- A guest drop stays in memory and ends with the server.

---

## Market

A market has two parts. The **market profile** is the shared contract: one record that every
terminal of the market reads. The **terminal** is the `market` capability of one action: its local
rules for what a seller lists there.

### Market profile

A `CyberiaMarket` holds the rules every terminal of one market shares. The Studio edits it in the
Market editor; `cyberia-content` defines it in its foundation as kind `market`.

| Field          | Holds                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| `code`         | The unique key. It never changes                                                     |
| `status`       | `active`, or `retired`: a retired market takes no new listing                        |
| `revision`     | Rises with each write. A save names the revision it read; another one answers `409`  |
| `scope`        | `instance`: one market in each world. `universe`: one market in each universe        |
| `currencyCode` | The currency of the worlds that open it (`coin`)                                     |
| `modes`        | `fixed`, `auction`, or both                                                          |
| `hours`        | The durations a seller picks from: 1, 6, 12, 24, 48, 72 or 168                       |
| `auction`      | `raisePercent` (5) and `minRaise` (1): the lowest raise of a bid                     |
| `fees`         | `listing`: coins one listing charges once. `sale`: coins a sale keeps from the price |
| `limits`       | `priceMin` (1), `priceMax` (1,000,000,000), `listingsPerPlayer` (20)                 |

`resolveMarketProfile` in `src/api/cyberia-server-defaults/cyberia-server-defaults.js` holds the
defaults and the bounds. `node bin/cyberia stat-contract` writes them to the server and the client.
A profile refuses a sale fee above `priceMin`, so a sale never pays the seller less than nothing.

- A write keeps the scope and the currency while a listing is open or a claim is pending under the
  code: the goods stay in the market they entered.
- A profile goes only when no terminal names it and no listing or claim holds goods under it.
- A clone copies the rules into a new code with no listing.
- A retired market shows its listings until they end, settles them and pays its claims.

A world export carries each profile its terminals name in `cyberia-markets/<code>.json`. An import
writes the profiles before the actions, so each terminal finds its profile.

### Market identity

One profile opens one market per scope key. The scope key is the instance code of the terminal
world (`instance`) or the universe code of that world (`universe`). The reference of a market is
`authorityId/scope:scopeKey/code`, for example `dd-cyberia/universe:cyberia/wods`.

- Terminals that name one profile in the worlds of one universe open one universe market, also
  when different server processes run those worlds.
- The same code in a world of another universe opens another market. The listings stay apart.
- A universe market in a world of no universe opens nothing.
- A code never reaches another deployment ([federation boundary](economy-federation.md)).

### Terminal

The `market` capability of a `CyberiaAction` names a profile and the local rules of the terminal.

| Field          | Meaning                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| `marketCode`   | The profile. Empty opens no market                                                         |
| `selection`    | `policy`: every item whose policy allows `market`. `items`: only the `itemIds`             |
| `itemIds`      | The items of `selection: items`. A `policy` terminal names none                            |
| `listingModes` | The modes a seller lists in here. A seller lists in the modes of both terminal and profile |

The local rules restrict listing only. Every terminal of a market shows all its listings, takes
bids on its auctions and pays its claims. A fixed-only terminal therefore shows an auction that
another terminal listed, and takes a bid on it. A terminal with no listing mode is a terminal to
browse, buy, bid and collect.

Example: terminal `interact-thon-zheng` (`policy`, fixed and auction) and terminal `test` (`items`
`wood-drop-1`, `wood-drop-2`, fixed only) both name the universe market `wods`, whose profile has
both modes. `interact-thon-zheng` lists in both modes, `test` lists only its two items at a fixed
price, and both show and take bids on every listing of `wods`.

### Listing rules

A seller lists units of a bag or storage stack. The steps run in this sequence; the first step that
fails gives the refusal.

| Step | Check                                                                      | Refusal                                            |
| ---: | -------------------------------------------------------------------------- | -------------------------------------------------- |
|    1 | The player has an account, is alive, out of a trade, and sees the terminal | `guest_account`, `dead`, `trading`, `out_of_range` |
|    2 | The terminal names a profile                                               | `not_offered`                                      |
|    3 | The profile is known and fits the world                                    | `market_closed`                                    |
|    4 | The player holds the stack and the units                                   | `no_stack`                                         |
|    5 | The profile is active                                                      | `market_closed`                                    |
|    6 | The terminal offers the mode and, with `selection: items`, the item        | `not_offered`                                      |
|    7 | `hours` holds the duration; the price is in `priceMin`–`priceMax`          | `terms_refused`                                    |
|    8 | The stack runs the definition of the world, and its policy allows `market` | `incompatible`, `policy_refused`                   |
|    9 | The engine finds the same fees as the seller saw                           | `market_changed`                                   |
|   10 | The player holds fewer than `listingsPerPlayer` open listings here         | `market_full`                                      |

The server checks steps 1 to 8 and the engine checks 9 and 10 again, in the transaction of the
listing.

A profile fits a world when the world has a scope key for it and pays in its currency. An item
with no policy row takes `itemDefaults`, and `market` defaults to `false`: a new item lists nowhere
until its economy allows it.

### Terms of a listing

A listing records the terms of the profile revision it was listed under: `marketRevision`,
`listingFee`, `saleFee`, `raisePercent`, `minRaise` and `priceMax`. Each later bid, buy and
settlement uses the recorded terms, so a change of the profile never changes a listing in progress.
The engine checks only a new listing against the current profile:

- Other fees than the seller saw answer `market_changed`.
- A mode, a duration or a price outside the profile answers `terms_refused`.
- An unknown or retired profile answers `market_closed`.

The seller reads the terms again and lists again. All amounts are integers: a price fits an unsigned
32-bit integer, and a sale that would pay less than zero stops the settlement.

### Operations

| Mode      | What happens                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------- |
| `fixed`   | The first buyer pays the price and receives the stack at once                                   |
| `auction` | Each bid raises the highest one by `raisePercent`, `minRaise` at least; the highest bid wins it |

Each operation is one joint commit of the player with the change of the market
([accounts and persistence](accounts-and-persistence.md#operations-between-players)):

| Operation | What leaves the player at once | Applied                               | Refused           |
| --------- | ------------------------------ | ------------------------------------- | ----------------- |
| List      | The units and the listing fee  | The listing opens                     | Both return       |
| Cancel    | —                              | The units return; only without bids   | Nothing changes   |
| Buy       | The price                      | The stack arrives; the seller is owed | The price returns |
| Bid       | The bid                        | The previous bidder is owed its bid   | The bid returns   |
| Collect   | —                              | Every pending claim arrives           | Nothing changes   |

- A market never writes the profile of another player, who may play elsewhere. It owes a claim: the
  price less the sale fee to a seller, the stack to an auction winner, the bid to an outbid bidder,
  the stack back to a seller whose listing ended unsold. The owner collects claims at any terminal
  of the market.
- A claim id derives from its listing and its reason, so one event owes one claim. An operation id
  that runs again answers `duplicate` and changes nothing.
- Each operation names the listing and its revision from the view the player saw. A listing that
  changed answers `listing_changed`; one sold, taken back or ended answers `listing_gone`. Two
  buyers of one listing: one buys it, the other gets `listing_gone`. A refusal ends no session.
- A guest uses no market.
- The view is a copy of one moment. The terminal reads it again after each page switch and each
  answered operation.

### Settlement

A listing that ends settles once, in its own transaction: its goods become claims.

- The player service runs one settlement round every 30 s: at most 5 pages of 20 ended listings,
  soonest end first. A listing settles also when nobody opens its market.
- A view and an operation of a seller or a bidder settle what they read first.
- Every process can run a round at the same time. A listing settles under its revision, so only one
  settlement applies.
- A listing stays `open` until it settles. Only a final listing (`sold`, `cancelled`, `expired`) and
  a collected claim get `purgeAt`; the TTL index deletes them 30 days later. An open listing and a
  pending claim never get one, so the TTL never deletes goods that a player is owed.

### Diagnostics

`GET /api/v1/cyberia-action/:id/diagnostics` tells what the economy capabilities of a terminal do in
each world of its map: the economy and its revision, the market reference, its scope key, the
listing modes and the defect, and for each buyback, burn and market item the permission of the
action, the effective policy, the catalog binding, the amount and the reason it is blocked. The
action editor shows it as **Effective Capabilities**. The server writes one `[MARKET] list` line for
each listing attempt, with the market reference, the item, its `olCid`, the selection, the listing
modes, the effective `market` flag and the refusal.

---

## Game link

| Message                          | Direction        | Payload                                                                           |
| -------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `item_drop`                      | Client to server | `box`, `slot`, `quantity`, target cell `x`, `y` (negative: feet)                  |
| `item_drop_ack`                  | Server to client | `status` `pending` or `public`, or `reason`                                       |
| `item_quote`                     | Client to server | `kind` `sell` or `burn`, `entityId`, `box`, `slot`                                |
| `item_quote_ack`                 | Server to client | `ok`, `reason`, `kind`, `itemId`, `quoteId`, `unit`, `maxQuantity`, `expiresInMs` |
| `item_sell`, `item_burn`         | Client to server | `quoteId`, `quantity`                                                             |
| `item_sell_ack`, `item_burn_ack` | Server to client | `ok`, `reason`, `itemId`, `quantity`, `unit`, `coins`                             |
| `trade_request`                  | Client to server | `toId`                                                                            |
| `trade_reply`                    | Client to server | `fromId`, `accept`                                                                |
| `trade_offer`                    | Client to server | `items [{box, slot, quantity}]`, `coins`: the whole offer                         |
| `trade_confirm`                  | Client to server | `revision`                                                                        |
| `trade_cancel`                   | Client to server | `{}`                                                                              |
| `trade_ack`                      | Server to client | `action`, `ok`, `reason`                                                          |
| `market_open`                    | Client to server | `entityId`, `itemId`, `mode`, `after`: the cursor of the page                     |
| `market`                         | Server to client | The profile terms, the terminal rules, `listings`, `next`, `mine`, `claims`       |
| `market_list`                    | Client to server | `entityId`, `box`, `slot`, `quantity`, `mode`, `price`, `hours`                   |
| `market_cancel`, `market_buy`    | Client to server | `entityId`, `listingId`                                                           |
| `market_bid`                     | Client to server | `entityId`, `listingId`, `price`                                                  |
| `market_collect`                 | Client to server | `entityId`                                                                        |
| `market_ack`                     | Server to client | `action`, `ok`, `reason`                                                          |

The snapshot carries `self.trade`, absent when the player trades with nobody. The `economy` object
of the metadata carries the fees, the wallet maximum, the coin item and each item policy.

| Refusal              | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `not_allowed`        | A guest, or an offer past its limits                              |
| `not_offered`        | The terminal does not offer the item or the mode                  |
| `policy_refused`     | The item policy of the economy refuses the operation              |
| `incompatible`       | The stack runs another definition than the world or the policy    |
| `no_stack`           | No such stack, or fewer units than asked                          |
| `equipped`           | The equipment rules keep the worn stack on                        |
| `insufficient_funds` | The wallet lacks the coins                                        |
| `wallet_full`        | The credit passes the wallet maximum                              |
| `inventory_full`     | The bag has no room for what the operation grants                 |
| `quote_changed`      | The coins differ from the amount the player confirmed             |
| `quote_gone`         | The quote is used, expired or of another kind                     |
| `out_of_range`       | The partner or the terminal is out of view, or the target too far |
| `trading`            | A trade holds the goods of the player                             |
| `saving`             | An earlier operation of the player still waits for its commit     |
| `listing_gone`       | The listing is sold, taken back or ended                          |
| `listing_changed`    | The listing changed since the view the player saw                 |
| `bid_low`            | The bid is under the lowest bid the auction takes now             |
| `market_full`        | The player holds the most open listings of the market             |
| `market_closed`      | The market is unknown, does not fit the world, or is retired      |
| `terms_refused`      | A duration, price or bid outside the terms of the market          |
| `market_changed`     | The market fees changed since the view the player saw             |
| `guest_account`      | A guest has no profile for a market                               |
| `claim_gone`         | The claims are collected already                                  |
| `dead`               | The player waits to respawn                                       |

---

## Feedback

- A balance or bag change plays the quantity effect on its slot of the inventory bar. A stack or the
  coins in an open offer show the trade icon in the bar.
- A sale, a burn, a drop and the end of a trade write one line to the world chat log. A refusal
  shows its reason in a notification card. A trade request asks with a card whose bar shows the time
  left to answer.
- No combat text kind exists for coins or items.

**Observability.** Each operation logs one `[ECONOMY]` line with the player id, the item, its
`olCid`, the units, the coins and the economy `code@revision`. `GET /api/v1/metrics/runtime` counts
each operation by outcome in `economy_outcomes` (`op:outcome`, for example `trade:done` or
`drop:not_allowed`). The engine keeps one `CyberiaEconomyOperation` record per
joint commit for 7 days; moderators read them at `GET /api/v1/cyberia-economy-operation`.

---

## CKY bridge: planned

No code converts coins to the CKY token or back. No deposit, withdrawal, conversion rate, mint,
on-chain burn, escrow or bridge fee exists. On-chain ownership is planned for
[Phase 3](roadmap.md#phase-3--beta-on-chain-ownership).

---

## Tests

| Test                                                     | What it proves                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `test/cyberia/unit/economy-policy.test.js`               | Profile bounds, row defects, the snapshot binding, the universe rule                               |
| `test/cyberia/unit/market-profile.test.js`               | Profile bounds, the lowest bid, the listing modes of a terminal, the market reference              |
| `test/cyberia/integration/player-persistence.test.js`    | The joint commit writes both profiles or none, once; durable drops                                 |
| `test/cyberia/integration/market.test.js`                | Terms, refusals, sharing, races, settlement rounds, the Studio API, terminal diagnostics           |
| `test/cyberia/integration/market-studio-browser.test.js` | The Market editor: terms, the scope lock, problems before a save, revision conflicts, mobile width |
| `test/cyberia/integration/universe-registry.test.js`     | The economy editor: references, item rows with their binding, clone                                |
| `cyberia-server/game/content/economy_ops_test.go`        | Sales, burns, fees, the wallet maximum, drops, definition checks, invalid snapshots                |
| `cyberia-server/game/content/trade_test.go`              | The trade state machine, revisions, escrow and refusals                                            |
| `cyberia-server/game/persist/link_test.go`               | Linked records hold their own commits until the joint commit answers                               |
| `cyberia-server/game/sim/drop_test.go`                   | One claim of a public drop, and the owner hold                                                     |
| `cyberia-server/game/content/world_drop_test.go`         | Durable drops: the commit, the claim, the restore with its owner hold                              |
| `cyberia-server/game/content/market_test.go`             | Market refusals, escrow, refunds and the settled answer of each operation                          |
| `cyberia-client/tests/economy_test.c`                    | The client reads the economy and shows the craft fee and the wallet room the server uses           |
