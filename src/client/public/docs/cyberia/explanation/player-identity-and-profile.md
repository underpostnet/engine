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

| Bubble         | View            | Tabs                                   | Bottom bar |
| -------------- | --------------- | -------------------------------------- | ---------- |
| The own player | Own profile     | Profile, Storage, Stats                | —          |
| Another player | Public profile  | Profile, Stats, Stack                  | Chat       |
| An NPC         | NPC interaction | Its capability tabs, then Stack, Stats | Dialog     |

The route follows the entity id: the own id opens the own profile, any other player the public
profile. A player view sends no NPC request: no dialogue fetch, no action fetch, no quest event.

**Own profile.** The Profile tab shows the portrait, the name, the level and the XP bar, the coins,
the bag and storage slots with the level of the next slot, the party status and the stats sum. An
account player also sees its held item count and, while the engine is out of reach, that its
progress is not being saved. A last note states what persists: everything listed in
[what persists](accounts-and-persistence.md#what-persists) for an account, nothing for a guest. The
Storage tab is the [personal storage](player-storage.md). Friends, requests, the party and the
own note live in the [social panel](social.md#social-panel).

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

Social views draw a player by its identity preview: one static PNG of every visual layer it wears,
in its idle frame. Chat lines carry it as `fromAvatar` and friend rows as `avatar`. Both are
references: `/api/v1/cyberia-player/appearance/v1/<cids>`, the Object Layer CIDs of the active
layers in layer order, each on the definition the world binds its label to. A layer whose
definition names no render is not in the reference. A ghost keeps the reference of its own loadout.

| Source of the reference | Who builds it                                                             |
| ----------------------- | ------------------------------------------------------------------------- |
| A chat line             | The game server, from the live layers of the sender                       |
| A friend here           | The game server, from the live layers of the friend                       |
| A friend elsewhere      | The engine, from the bag of the last played profile, bound by the catalog |
| A profile in view       | The client, from the layers it sees, when it opens a direct conversation  |

The engine composes a preview from what each host already stores: the idle preview of each
layer, `AtlasSpriteSheet.idlePreviewFileId`, the first frame of `down_idle` (else `none_idle`, else
`default_idle`) on a 300 px square. It overlays them, centred, in draw order: `VISUAL_LAYER_PRIORITY`,
skin, weapon, then the other types, layers of one priority in their order. The client, the server
and the engine read the route and the priorities from the stat contract. A layer whose atlas holds
no idle preview on this host is left out, so the image is the closest one the host can draw.

**Fingerprint.** The ordered File ids of the idle previews it overlays. A File id derives from its
bytes, so a change of stats, labels, position, life or presence draws nothing new, and two
references that draw the same pixels share one image.

**Generation and memory.** A request draws a missing preview on demand. The render cache keeps it
in Valkey under its fingerprint, and Valkey drops the least recently used values first
(`allkeys-lru`), so the cache holds the previews in use and never grows past its memory limit. A
dropped preview is drawn again on the next request. Concurrent requests of one fingerprint share one
drawing. A process draws at most two previews at a time and keeps at most 32 waiting; past that it
answers 503. A failed drawing is never cached. The game never waits for a preview: chat, friend rows
and the world draw at once.

**Delivery.** A preview answers with `Cache-Control: public, max-age=31536000, immutable` and its
fingerprint as the ETag, because a reference never names other pixels. An error answers with
`no-store`. The client fetches each reference once, keeps the last image that drew for each player
name, and draws it while a newer reference loads. A player without one, or a reference that fails,
shows the default icon, and the client retries after five seconds. The client decodes a preview at
half size, 150 px, and keeps at most 128 players in its table.

**External use.** `GET /api/v1/cyberia-player/identity/:name` answers a `302` to the current
reference of an account, with `no-cache`, so a page outside the game always shows what the account
wears now. It names no database ID, and a guest has none. The portal profile image never reaches
the game: the game draws game state only.

---

## Tests

| Test                                                  | What it proves                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `cyberia-server/game/net/social_ws_test.go`           | Each join gets an id and a guest name; no snapshot carries the `PlayerID`                   |
| `cyberia-server/game/social/social_test.go`           | Guest names stay unique among online players                                                |
| `cyberia-server/game/net/accounts_ws_test.go`         | An account session takes the profile id and the account name; refusals leave nothing behind |
| `test/cyberia/integration/player-persistence.test.js` | Tickets, sessions, commits, leases and friendships against a MongoDB replica set            |
| `test/cyberia/unit/appearance-preview.test.js`        | Idle previews overlaid in draw order, the fingerprint, one drawing per fingerprint, bounds  |
| `cyberia-server/game/content/durable_test.go`         | The avatar names the bound definition of each worn visual layer; a ghost keeps its own      |
