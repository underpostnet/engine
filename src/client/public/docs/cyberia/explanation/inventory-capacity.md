# Inventory capacity

The inventory holds stacks, and a level-based rule sets how many. `cyberia-server` applies the rule
on every path that adds an item; `cyberia-client` draws it. This page states the model, the rule,
the locked slots, and what each grant path does when the bag is full.

---

## Model

- A stack is one item id at a quantity: an `ObjectLayerState` `{itemId, active, quantity}` with its
  bag `slot`. A grant of a held item joins its first stack; a new item takes the lowest free slot.
- A slot holds one stack at any quantity. Stack size and slot count are separate. One item can
  fill several stacks: a split makes a second stack, and each stack takes a slot.
- A stack keeps its slot until a [move](player-storage.md#moves) changes it, so a stack that leaves
  frees its cell and the others stay.
- Every carried stack takes a slot, worn items too. The coin and the dead visual take none.
- One stack of an item is worn at most. Equip names the stack by its slot.
- Coins are the flat wallet `Session.Coins`. Their display slot stays pinned right of the bar,
  outside the capacity.
- A running assembly holds the slots of its ingredients and of its outputs until it ends, so its
  payout and its refund always fit.
- While a player waits to respawn, its inventory is the loadout the respawn restores. A grant in
  that window, such as a late quest reward, survives the respawn.

---

## Capacity rule

The rule is defined once, as `CONTAINER_CAPACITY` in
`src/client/components/cyberia/SharedDefaultsCyberia.js`. `node bin/cyberia stat-contract` generates
it into the Go server (`InventoryCapacity.Slots(level)`), the C client (`cyberia_capacity_slots`,
`cyberia_capacity_unlock_level`) and the content contract (`inventoryCapacity`). No instance setting
changes it.

| Container                             | Open slots at a level                      | Level 1 | Next slot      | All open       |
| ------------------------------------- | ------------------------------------------ | ------- | -------------- | -------------- |
| Inventory (the bag)                   | `min(24, 8 + floor((level - 1) / 3))`      | 8       | one at level 4 | 24 at level 49 |
| [Personal storage](player-storage.md) | `min(40, 16 + 2 * floor((level - 1) / 5))` | 16      | two at level 6 | 40 at level 61 |

- The server reads the level from its own progression. A client never sends a capacity or a level.
- The client draws the same generated rule from the level of the own snapshot.
- `init_data.maxLevel` is the level cap of the instance. A slot that opens past it never opens, and
  the client shows its lock without a level.

---

## Locked slots

Each bar cell is a bag slot, left to right up to 24, and the coin slot stays pinned at the right
edge. A stack shows in the cell of its slot.

| Cell        | Looks                                 | Takes a drop               | A tap                                  |
| ----------- | ------------------------------------- | -------------------------- | -------------------------------------- |
| Stack       | Sprite and quantity badge             | The same item stacks on it | Opens the item                         |
| Open slot   | An empty well                         | Yes                        | Nothing                                |
| Locked slot | Dark well, the `lock` icon and `Lv N` | No                         | Says "This bag slot opens at level N." |

Only the level opens a slot. No unlock is for sale. A lock is presentation: the server applies the
rule on every grant.

---

## Moving stacks

The bar tells a tap from a drag, as the storage grids do.

- A tap on a stack opens it. A press that travels lifts the stack, and the release drops it on the
  cell under it under the [move rules](player-storage.md#moves): an empty open slot takes it or a
  split of it, the same item stacks it, another stack swaps with it. A locked slot and the space
  off the strip refuse it, and the stack stays.
- With a personal storage or a vault open, a lifted stack also drops onto a cell of the container.
  A drag from the coin slot moves coins into a vault.
- The target cell shows green or red before the release, and the stack slides into its cell.
- A drag from an empty or locked cell, or the wheel over the bar, scrolls the strip. A lifted stack
  held at an edge of the strip scrolls it too.
- A move is an `item_move` inside the bag, so the server keeps the slots.

---

## Fit rule

`ExchangeItems(player, takes, gives)` in `cyberia-server/game/content/capacity.go` is the one path
that adds items to a player. It changes everything or nothing:

1. It refuses when the player lacks a take.
2. It removes the takes one stack at a time: the stacks not worn first, each in slot order. A
   take that empties a stack frees its slot.
3. It accepts the gives when every new item finds an open slot. More of a held item joins its
   first stack, and coins always fit.
4. A player over capacity may trade stacks but never add one, and loses none. This happens when a
   progression reload lowers the level of a player. The bar then shows every stack.

---

## Grant paths

Every path that adds items uses the fit rule. A refusal never charges, consumes or destroys anything.

| Path                                    | Check                                       | Without room                                                                                                                                           |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| World loot and death loot               | `LootFits` before collection                | The token stays on its cell for another eligible collector, and its particles turn grey for this player                                                |
| A consuming loot token, at missing life | None: nothing enters the bag                | —                                                                                                                                                      |
| A coin token                            | None: coins take no slot                    | —                                                                                                                                                      |
| Shop purchase                           | `ExchangeItems(price, item)`                | `shop_ack` `inventory_full`; nothing is charged; the card shows "Bag full"                                                                             |
| Assembly start                          | Room for the outputs beside the ingredients | Nothing starts and nothing is consumed; the card shows "Bag full"                                                                                      |
| Assembly payout and cancel              | Slots held since the start                  | Always fits                                                                                                                                            |
| Quest rewards                           | `ExchangeItems(rewards)` at completion      | The quest stays active with every step done (`rewardsHeld`), and completes on the first tick with room. A toast and a journal line ask for a free slot |
| Withdrawal from a vault or the storage  | `ExchangeItems(stack)` for each op          | The stack stays in the container; the client refuses the drop first                                                                                    |
| Spawn kit                               | Content validation in `cyberia-content`     | A `player` character whose loadout and carried items, the wallet aside, exceed the level-1 bag fails validation                                        |

Bots carry no capacity.

---

## Tests

| Test                                            | What it proves                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyberia-server/game/content/capacity_test.go`  | The formulas level for level; stacks, coins and takes; grants join the first stack or take the lowest free slot; takes drain unworn stacks first; the all-or-nothing exchange; the dead loadout; the assembly hold; the shop refusal; held quest rewards; loot room |
| `cyberia-server/game/sim/movement_test.go`      | Equip wears the stack in its slot                                                                                                                                                                                                                                   |
| `cyberia-server/game/sim/consumable_test.go`    | A held skill runs once per item across its stacks                                                                                                                                                                                                                   |
| `cyberia-client/tests/player_containers_test.c` | The client rule, the unlock levels with a level cap, and the bag room check                                                                                                                                                                                         |
| `cyberia-client/tests/inventory_bar_test.c`     | Bar cells are bag slots; a tap opens a stack, a drag drops it on a cell of the bar or of the open container, the coin slot drags coins; a drag from an empty cell and the wheel scroll                                                                              |
| `cyberia-content/test/foundation.test.js`       | The spawn kit fits the level-1 bag                                                                                                                                                                                                                                  |
| `node bin/cyberia stat-contract --check`        | The generated Go, C and content contracts match the source                                                                                                                                                                                                          |
