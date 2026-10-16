# Personal storage and NPC vaults

A player banks items in two kinds of container. Personal storage belongs to the player and opens
from its own profile. An NPC vault belongs to the player at one terminal and opens at that
terminal. Both hold stacks in slots, like the bag, and share the move rules; their owners,
capacity and access differ.

---

## Two containers

|              | Personal storage                                                                                                   | NPC vault                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Opens from   | The own profile, anywhere                                                                                          | The Storage tab of its terminal NPC, while it is in view     |
| Owner        | The `PlayerID`                                                                                                     | The `PlayerID` at the action code of the terminal            |
| Capacity     | `StorageCapacity` by level ([inventory capacity](inventory-capacity.md#capacity-rule)); locked cells show up to 40 | The `storageSlots` of the `CyberiaAction`, fixed, at most 64 |
| Client event | `item_move` with the box `storage`                                                                                 | `item_move` with the box `vault` and its terminal            |
| Snapshot     | `self.storage`                                                                                                     | `self.vaults`                                                |
| Coins        | Refused: the wallet stays with the player                                                                          | Accepted                                                     |
| Lifetime     | The profile in account mode; the session for a guest                                                               | The same, at the action code                                 |

A move of one container never reaches the other: the server keys personal storage by `PlayerID`
alone and every vault by `PlayerID` and action code.

---

## Moves

A slot holds one stack: one item at any quantity. One item can fill several stacks, and each stack
takes a slot. A drag moves units of one stack to one slot, inside the bar or the container, or
between them. `ui/stack_move` decides every drop the same way, and the server applies the same
rules.

| Drop on                  | Inside one box                                                 | Between the bag and the container |
| ------------------------ | -------------------------------------------------------------- | --------------------------------- |
| An empty open slot       | The units go there: all of them move the stack, fewer split it | The units go there                |
| A stack of the same item | The units stack on it                                          | The units stack on it             |
| A stack of another item  | The two whole stacks swap                                      | Refused                           |
| A locked slot, or none   | Refused                                                        | Refused                           |

- When a split is possible, the quantity picker asks how many: Move, Stack, Store or Take. Cancel
  leaves both places as they were. A swap, and a stack of one unit, move at once.
- A refused drop slides back. The cell under the pointer shows green for a landing, amber for a
  stack or a swap, and red for a refusal, before the release.
- A stack stays in its slot until a move changes it. A stack that leaves frees its cell; the other
  stacks stay where they are.
- A stack that lands slides into its slot: a split slides out of its stack, units that stack slide
  into the stack they join, and a swap sends the other stack the opposite way.
- The wallet is bag slot `-1`, the coin slot of the bar. Coins move between the wallet and a vault
  slot. Personal storage refuses coins.
- A new bag stack needs a free slot, for a split or a withdrawal of an item the bag does not hold.
  A slot a running assembly holds for its payout is not free.
- A worn stack keeps its flag when it moves whole inside the bag, and on the part that stays when it
  splits. Banking a whole worn stack takes it off, unless the equipment rules need it worn (the last
  skin).
- A stack in a locked slot can only leave. This happens when a progression reload lowers the
  level, or a content reload lowers the capacity of a vault.
- A bar stack drags onto the container the same way ([moving stacks](inventory-capacity.md#moving-stacks)).

---

## Protocol

Each drop sends one `item_move {from, fromSlot, to, toSlot, qty, entityId}`. `from` and `to` are
`bag`, `storage` or `vault`, and a vault move names its terminal in `entityId`. One move joins the
bag and at most one container.

- The client applies each move at once, and again on top of every snapshot until the server
  consumes its event. The server applies it under the world lock and sends no ack: the next
  snapshot carries the bag (`self.inventory`) and both containers, each stack with its `slot`.
- The server applies each event once: it drops an event at or below the consumed sequence. A
  refused move changes nothing.
- A move takes units from its source only when its destination takes them. No move creates or
  destroys an item.

---

## Stored items

A stored item is not in the inventory layers, so it does nothing. It adds no stat, fires no skill,
cannot be worn, cannot be consumed, and counts for no `collect` objective. The player withdraws it
first.

---

## Persistence

Both containers live in `cyberia-server` while the player plays. `ForgetPlayer` drops them when
the session ends, together with the inventory and the wallet they belong to.

- An account session commits them with the bag and the wallet to its profile, and loads them at
  the next session. A vault is saved by the action code of its terminal, so it survives a map
  reload that gives the terminal a new entity id.
- A guest session saves nothing. The storage hint of a guest says that the storage empties when
  the guest leaves.

A saved stack that no longer fits its container, or whose definition the world no longer runs, is
held, never dropped ([item identity](accounts-and-persistence.md#item-identity)).

---

## Tests

| Test                                            | What it proves                                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cyberia-server/game/content/storage_test.go`   | Splits, stacks and swaps in the bag; moves to and from the storage; closed slots and misplaced coins; a full bag; worn stacks; vault coins; the level opens storage slots; a finished session leaves nothing |
| `cyberia-server/game/net/social_ws_test.go`     | A deposit shows in `self.storage`; a new session starts empty                                                                                                                                                |
| `cyberia-server/game/net/storage_test.go`       | `item_move` is a bounded trust boundary                                                                                                                                                                      |
| `cyberia-server/game/content/durable_test.go`   | The saved containers load back to their slots; a changed or unknown definition, or no room, holds the stack until it can load                                                                                |
| `cyberia-server/game/sim/movement_test.go`      | A resent storage event moves nothing more                                                                                                                                                                    |
| `cyberia-client/tests/player_containers_test.c` | Client moves split, stack and swap under the server rules, cross with the storage and a vault, and replay the same way                                                                                       |
| `cyberia-client/tests/item_slot_grid_test.c`    | A drop from the bar reaches the host over an open cell; a locked cell keeps its stack, and the stack can leave                                                                                               |
| `cyberia-client/tests/inventory_bar_test.c`     | Bar cells are bag slots; the coin slot is the wallet                                                                                                                                                         |
