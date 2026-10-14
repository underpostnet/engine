# Player identity and profile

A player in this release is a guest of one connection to one game server. This page states how
`cyberia-server` names the player, which data other players see, and what each profile shows.

---

## Session identity

The server makes three names for each connection. All three end with the connection.

| Name         | Made by                                                       | Used for                                                                                 |
| ------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PlayerID`   | `cyberia-server`: one UUID per connection                     | Ownership: the personal storage, the NPC vaults, the party seat. The id the engine knows |
| `EntityID`   | `cyberia-server`: one number per connection, kept across maps | The wire and the client: snapshots, chat lines, party rows, interaction rows             |
| Display name | `cyberia-server`: `Guest-` and a short code of the `PlayerID` | Every viewer: nameplates, bubbles, chat lines, the party roster                          |

- An owner key is always a `PlayerID`, never an `EntityID` or a connection.
- The `PlayerID` never goes in a snapshot. Only the own client receives it, in `init_data.playerId`,
  for its engine REST calls (quest progress, Instance Map activity).
- No two online players hold the same display name. The server makes the code longer when a short
  one is taken.
- A reconnect is a new session: a new `PlayerID`, `EntityID` and name. The inventory, the coins, the
  quests, the personal storage and the party end with the old session. No asset carries over, so a
  player cannot bank starting assets and reclaim them after a reconnect.

Account-linked sessions are a later phase ([roadmap](roadmap.md#phase-2--alpha-centralized-off-chain-persistent-sessions)).
They change where the `PlayerID` comes from. The owner keys stay the same.

---

## Public and private data

| Data                                       | Own client             | Another client                                  |
| ------------------------------------------ | ---------------------- | ----------------------------------------------- |
| Display name                               | Yes                    | Yes                                             |
| Level, effective stats, stats sum          | Yes                    | Yes, while the player is in view                |
| Worn layers (the appearance)               | Yes                    | Yes, while the player is in view                |
| XP, base, layer and temporary stats, coins | Yes, in the self block | Never                                           |
| Inventory, personal storage, NPC vaults    | Yes, in the self block | Never                                           |
| Party roster and pending invites           | Yes, in the self block | Only the party flags of its own interaction row |

The snapshot carries the name of each player as `name`. The rest travels as described in
[the game server](game-server.md#aoi-replication).

---

## Profile views

The interaction bubble column on the left always shows the own player first. A tap on a bubble
opens `modal_interact`, and the entity decides the view:

| Bubble         | View            | Tabs                                   | Bottom bar   |
| -------------- | --------------- | -------------------------------------- | ------------ |
| The own player | Own profile     | Profile, Storage, Party, Stats         | —            |
| Another player | Public profile  | Profile, Stats, Stack                  | Chat         |
| An NPC         | NPC interaction | Its capability tabs, then Stack, Stats | Dialog, Chat |

The route follows the entity id: the own id opens the own profile, any other player the public
profile. A player view sends no NPC request: no dialogue fetch, no action fetch, no quest event.

**Own profile.** The Profile tab shows the avatar, the name, the level and the XP bar, the coins,
the bag and storage slots with the level of the next slot, the party status and the stats sum. A
note says that the bag, the storage and the party end with the session. The Storage tab is the
[personal storage](player-storage.md). The Party tab is described in [chat and parties](social.md#parties).

**Public profile.** The Profile tab shows the avatar, the name, the level, the stats sum and the
relation to the viewer ("In your party", "Invited you to a party"). Under it is the one party action
the server allows (see [chat and parties](social.md#parties)). When the player leaves the view, the
tab shows "Out of sight" and hides the stats and the equipment. It never shows data the client
cannot read from the current snapshot.

---

## Tests

| Test                                        | What it proves                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `cyberia-server/game/net/social_ws_test.go` | Each join gets an id and a guest name; no snapshot carries the `PlayerID` |
| `cyberia-server/game/social/social_test.go` | Guest names stay unique among online players                              |
