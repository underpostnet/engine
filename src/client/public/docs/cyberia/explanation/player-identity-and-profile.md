# Player identity and profile

A player is a guest of one connection, or the signed-in owner of a persistent profile. The launch
ticket names which, within what the [session mode](accounts-and-persistence.md#session-modes) of the
game server admits. This
page states how `cyberia-server` names the player, which data other players see, and what each
profile shows.

---

## Session identity

The server gives each session three names.

| Name         | Guest session                               | Account session                   | Used for                                                                     |
| ------------ | ------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `PlayerID`   | One UUID per connection                     | The profile id the engine returns | Ownership: the bag, the personal storage, the NPC vaults, the party seat     |
| `EntityID`   | One number per connection, kept across maps | The same                          | The wire and the client: snapshots, chat lines, party rows, interaction rows |
| Display name | `Guest-` and a short code of the `PlayerID` | The account `username`            | Every viewer: nameplates, bubbles, chat lines, the party roster              |

- An owner key is always a `PlayerID`, never an `EntityID` or a connection.
- No id of a player leaves the server except its `EntityID`. Snapshots, chat lines and friend rows
  never carry a `PlayerID` or an account id; `init_data.session` only tells the client whether it
  plays an account or a guest.
- No two online players hold the same display name. A guest code grows when a short one is taken;
  a `username` is unique.
- A guest reconnect is a new session: a new `PlayerID`, `EntityID` and name, and nothing carries
  over, so a guest cannot bank starting assets. An account session loads its profile again, with a
  new `EntityID`.

The account, the profile and the session lease are described in
[accounts and persistent players](accounts-and-persistence.md#identities).

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

| Bubble         | View            | Tabs                                    | Bottom bar |
| -------------- | --------------- | --------------------------------------- | ---------- |
| The own player | Own profile     | Profile, Storage, Party, Friends, Stats | —          |
| Another player | Public profile  | Profile, Stats, Stack                   | Chat       |
| An NPC         | NPC interaction | Its capability tabs, then Stack, Stats  | Dialog     |

The route follows the entity id: the own id opens the own profile, any other player the public
profile. A player view sends no NPC request: no dialogue fetch, no action fetch, no quest event.

**Own profile.** The Profile tab shows the portrait, the name, the level and the XP bar, the coins,
the bag and storage slots with the level of the next slot, the party status and the stats sum. An
account player also sees its held item count and, while the engine is out of reach, that its
progress is not being saved. A last note states what persists: everything listed in
[what persists](accounts-and-persistence.md#what-persists) for an account, nothing for a guest. The
Storage tab is the [personal storage](player-storage.md). The Party and Friends tabs are described
in [chat and parties](social.md).

**Public profile.** The Profile tab shows the portrait, the name, the level, the stats sum and the
relation to the viewer ("In your party", "In a party", "Your friend", "Your invite waits for an
answer"). Under it are the one party
action the server allows and, between two account players, the friend action (see
[chat and parties](social.md)). When the player leaves the view, the tab shows "Out of sight" and
hides the stats and the equipment. It never shows data the client cannot read from the current
snapshot. Chat in the bottom bar closes the profile and opens the direct conversation with that
player in the [chat panel](social.md#chat-channels).

**Portrait.** The portrait is the player as it looks in the world: the icon of its worn layers.

### Identity icon

Social views draw a player by the icon of its active skin: the Object Layer that defines its look.
Chat lines carry it as `fromSkin` and friend rows as `skin`; both are item ids, which the client
resolves through the same Object Layer cache as the world. A guest, a friend on another server, or
a skin that is not loaded yet shows the default icon. The portal profile image never reaches the
game: the game draws game state only.

---

## Tests

| Test                                                  | What it proves                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `cyberia-server/game/net/social_ws_test.go`           | Each join gets an id and a guest name; no snapshot carries the `PlayerID`                   |
| `cyberia-server/game/social/social_test.go`           | Guest names stay unique among online players                                                |
| `cyberia-server/game/net/accounts_ws_test.go`         | An account session takes the profile id and the account name; refusals leave nothing behind |
| `test/cyberia/integration/player-persistence.test.js` | Tickets, sessions, commits, leases and friendships against a MongoDB replica set            |
