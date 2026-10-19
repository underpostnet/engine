# Accounts and persistent players

A game server runs in one of two session modes. In **account mode** a signed-in player keeps its
possessions and progress between sessions, and a guest can play the same world without them. In
**anonymous mode** every player is a guest and nothing persists. Every player enters through the
launch bridge of the portal with a single-use launch ticket. This page states the identities, the
launch flow, what persists and the guarantees of each write. The wire contract is in
[the player service reference](../reference/player-service.md), and the switch to account mode in
[enable player accounts](../how-to/enable-player-accounts.md).

---

## Identities

| Identity         | Key                                                | Owner                                               | Lives                                                  | Used for                                                                                   |
| ---------------- | -------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Account          | `User._id`                                         | `engine-cyberia`                                    | Always                                                 | Sign-in, friendships, the one gameplay session                                             |
| Guest identity   | `guest<ObjectId>`, Valkey key `guest:<id>`         | `engine-cyberia`                                    | `GUEST_SESSION_MINUTES` after its last use, default 60 | A guest launch from the portal                                                             |
| Player profile   | `CyberiaPlayer._id`, unique `{user, universeCode}` | `engine-cyberia`                                    | Always                                                 | The bag, coins, XP and storage in one universe; per world, the position, vaults and quests |
| Gameplay session | `CyberiaGameSession`, unique `user`; an `epoch`    | `engine-cyberia` lease, `cyberia-server` live state | While connected, then the lease                        | The single writer of a profile, presence, routing                                          |
| `PlayerID`       | The profile id; a UUID for a guest                 | `cyberia-server`                                    | One session                                            | The in-memory owner key of the containers and the party seat                               |
| `EntityID`       | A number per session                               | `cyberia-server`                                    | One session                                            | The wire: snapshots, chat lines, party rows                                                |

- The server takes every identity from the engine. It never reads a user id, player id, principal,
  role, level or wallet from a client.
- A guest never loads or writes a profile, and a guest session never merges into an account.
  Friendships need an account on both sides.
- A wallet address is not a key. An account plays without a wallet, and a linked wallet never merges
  two accounts.
- The display name of an account is its `username`. It is unique, so no two online players share a
  name. The game server names a guest `Guest-` and a code that is unique among online players.

### One profile per universe

`instanceCode` names a world. Each world has its own maps, quests, items, progression rules and
economy rules (`CyberiaInstanceConf`), and its game servers run it. A
[universe](universe.md) groups worlds, and a profile belongs to one account in one universe. The
engine resolves the universe of the world each session plays; the client never names it.

The profile holds what the player carries from world to world. Each world keeps its own part of the
profile under `worlds`, so a world never sees the position, the vaults or the quests of another:

| State                             | Scope        | Why                                                          |
| --------------------------------- | ------------ | ------------------------------------------------------------ |
| Coins, total XP                   | The universe | What the player owns and has learned. A world caps the level |
| Bag and personal storage          | The universe | The player carries them                                      |
| Held bag and storage stacks       | The universe | They wait for a world that runs their definition             |
| Position                          | The world    | A cell of a map of that world                                |
| NPC vaults, and their held stacks | The world    | A vault belongs to an NPC action of that world               |
| Quest progress                    | The world    | A quest is content of that world                             |

A world the profile never played starts empty: no position (spawn rules apply), no vault, no quest.
The game server sends and receives the state of one world; the engine splits each commit by this
table. An account cannot play a world that belongs to no universe: the ticket endpoint answers
`409` and the session acquisition `unavailable`. A guest plays any world.

### Guest identities

The portal makes a guest identity with `POST /api/v1/user/guest`. Its token lives as long as the
identity, and each use renews both. The identity holds no email, no password and no game state.

Valkey keeps the guest identities beside the read cache, with `--maxmemory-policy allkeys-lru`.
Memory pressure can therefore remove an identity before it expires. That has the effect of an
expiry: a game session that started goes on, and the next launch from the bridge makes a new
guest. Launch tickets, profiles, leases and friendships live in MongoDB, never in Valkey.

---

## Session modes

The game server reads `CYBERIA_SESSION_MODE` once at boot. Every connection sends `auth` first: `{ticket}`
with a launch ticket, `{}` without one.

| Mode        | Default | Admits                                       | State                                                                          |
| ----------- | ------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `anonymous` | Yes     | Every connection as a guest; tickets ignored | In memory; ends with the connection                                            |
| `account`   | No      | A launch ticket of an account or of a guest  | An account loads its profile and commits every change; a guest stays in memory |

An anonymous server never consumes a ticket and never writes player state. An account server refuses
a connection without a ticket (`auth_required`). The engine names the principal of a ticket:
`account` or `guest`. `init_data.session` tells the client which one it plays.

---

## Launch flow

1. Play in the portal opens the launch bridge `/launch?world=<code>`; without `world` it opens the
   default world. The bridge launches the signed-in account. Without a sign-in it offers **Continue
   as guest** and **Sign in**. `&as=guest` and `&as=account` make the choice at once.
2. A guest launch uses the guest identity of this browser, or makes a new one.
3. The bridge sends `POST /api/v1/cyberia-game-ticket {instanceCode}` with the portal token of the
   account or of the guest. The engine issues a ticket only for a world with a live server that
   takes sessions in the [server registry](server-registry.md) (`503` otherwise), and an account
   ticket only for a world of a universe (`409` otherwise).
4. The engine makes 32 random bytes and stores only their SHA-256 hash, with the principal (the
   account and its portal session, or the guest), the world and an expiry
   (`CYBERIA_GAME_TICKET_TTL_SECONDS`, default 60 s). It returns the ticket once, with the path of
   the world. An account or a guest holds at most 5 open tickets; a sixth request gets `429`.
5. The bridge replaces itself with the game client of the build manifest:
   `<client origin><world path>#ticket=<ticket>`. A fragment never reaches a server log or a
   `Referer` header. The bridge page answers with `Cache-Control: no-store` and
   `Referrer-Policy: no-referrer`, and it stores no ticket.
6. The client page reads the fragment, removes it from the address bar and the history with
   `history.replaceState`, and keeps the ticket in memory only.
7. The client opens `wss://…/ws` and sends `auth {ticket}` as its first message.
8. The game server calls `ConsumeGameLaunchTicket`. The engine consumes the ticket in one atomic
   update and answers with the principal, or with a refusal. A guest ticket is valid only while its
   guest identity lives.
9. For an account, the game server ends any older session of the account on this server, then calls
   `AcquirePlayerSession`. The engine raises the `epoch` of the universe profile, writes the lease
   with the world, and returns the saved state of that world. The game server resolves the labels
   of that state its world does not hold (see [the game server](game-server.md#content-a-player-brings)).
   A guest gets a new `PlayerID` and a guest name, and nothing loads.
10. The game server places the player and sends `init_data`. Only now does it read gameplay input.

| Refusal               | Cause                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| `auth_required`       | Account mode and no ticket                                                |
| `invalid`             | The first message is not `auth`, or the ticket is malformed               |
| `unknown`             | No ticket has this hash                                                   |
| `expired`             | The ticket is older than its time to live                                 |
| `replayed`            | Another connection consumed the ticket                                    |
| `wrong_instance`      | The ticket names another world                                            |
| `revoked`             | The account session that asked for the ticket ended, or the guest expired |
| `signed_in_elsewhere` | A newer launch of the account took over the session a resume continues    |
| `busy`                | A resume whose old session still holds its lease; the client tries again  |
| `unavailable`         | The engine did not answer; the client may launch again                    |

**Retries.** A retry of `ConsumeGameLaunchTicket` or `AcquirePlayerSession` carries the same
connection id. The engine answers a retry with the first result, so a lost response never opens a
second session. A different connection can never consume the same ticket.

**Socket rules.** The server checks the `Origin` header against `CYBERIA_CORS_ALLOWED_ORIGINS`
before the upgrade. Until the player is admitted, it reads one message of at most 2 KiB and waits
at most `CYBERIA_AUTH_TIMEOUT_SEC` (default 10 s). A refused connection gets
`session_end {reason}` and a close, and it leaves no entity, container or lease behind.

**Direct visits and refusals.** A client without a ticket on an account server shows **Continue as
guest** and **Sign in**. A refused ticket shows the cause and the same two ways. Each way opens the
launch bridge of the same world: `as=guest` launches a guest, and `as=account` launches the signed-in
account or opens the portal sign-in at `/?play=<world>`, which launches once the sign-in completes.
No page redirects by itself, so a refusal never loops.

The game never receives a password, a Google token, a refresh token or a portal token.

### Origins

The portal, the bridge, the client and the server take each other's origins from one source: the
`conf.server.json` and `conf.instances.json` of the deploy. The build manifest carries
`runtime.instanceOrigins` (runtime → origin) to the portal and the bridge. `instance-build-manifest`
writes `CYBERIA_DATA_SERVER_URL` and `CYBERIA_WS_ORIGIN` to the client env, and
`CYBERIA_DATA_SERVER_URL` and `CYBERIA_CORS_ALLOWED_ORIGINS` to the server env.

| Process                | Development                                  | Production                         |
| ---------------------- | -------------------------------------------- | ---------------------------------- |
| Portal                 | `http://localhost:4008`                      | `https://www.cyberiaonline.com`    |
| Game client            | `http://localhost:8082`                      | `https://client.cyberiaonline.com` |
| Game server            | `http://localhost:8083`                      | `https://server.cyberiaonline.com` |
| Engine, for the server | The traffic Service of the deploy, port 4008 | `https://www.cyberiaonline.com`    |

A world other than the default one lives under its code on the client and the server
(`/<instance>`). A build with no origin for a runtime stops the launch with a message; it never
falls back to production. In development, only the world of the local game server answers.

---

## Session ownership

One account has one gameplay session at a time, in any world.

- A new launch takes over. A session on the same server ends at once with `session_end
{reason: "signed_in_elsewhere"}`, after its final commit. A session on another server ends at that
  server's next checkpoint.
- Every profile write carries the session `epoch`. A takeover raises the epoch, so the engine refuses
  every later write of the old session (`stale_session`). Two connections never write one profile.
- The lease expires `CYBERIA_GAME_SESSION_LEASE_SECONDS` (default 60 s) after its last checkpoint.
  A crashed server therefore stops showing its players online after at most one lease.
- Logging out of the portal, a password recovery or any other revocation of the account session that
  asked for the ticket ends the gameplay session at the next checkpoint (`reason: "revoked"`), and
  its resume ticket stops working.

### Resume after a dropped connection

A live account session holds a **resume ticket**: a launch ticket of its own world, bound to its
account session and its profile epoch. It lives `CYBERIA_RESUME_TICKET_SECONDS` (default 300 s). The
server asks for it with `IssueResumeTicket` when the session starts, sends it as `resume {ticket}`,
and renews it 2 minutes before it expires. The client keeps it in memory only.

When the connection drops, the client reconnects with the resume ticket: after 1 s, then with a
wait that doubles up to 15 s, for at most 240 s. The old session commits its final state and
releases its lease first. Until then the engine answers `busy` and keeps the ticket unconsumed. The
new connection then acquires the profile with a new epoch, so two connections never write one
profile. A newer launch of the account (`signed_in_elsewhere`) or the end of its portal session
(`revoked`) voids the ticket. A server restart resumes the same way. A guest reconnects as a new
guest.

### Leaving

The settings button of the toolbar opens the settings card. A way out of an account session sends
`session_leave`; the server commits the final state, releases the lease and answers
`session_end {reason: "left"}`. Then the client opens the portal.

### Travel in the page

A travel from the Universe view stays in the page when the servers of the target world run the
build of the server the client plays on: the universe view names the `build` of each world, and
`init_data` names the build of this server. The same binary speaks one protocol, so the running
client speaks it to the target too. Else the travel takes the launch bridge.

1. The client sends `session_leave {travel: <target>}` and shows the save.
2. While the lease still holds, the server asks the engine for `IssueTravelTicket`. The engine
   checks the lease and its epoch, the portal session, a route of the universe from this world to
   the target, and a server of the target that takes sessions. It issues a launch ticket of the
   account for the target world: single-use, short-lived, scoped to that world.
3. The server commits the final state and releases the lease. Only then, and only when the save
   succeeded, `session_end {reason: "left", travel: {instanceCode, ticket}}` carries the ticket.
4. The client clears the state of the world it left, sets the address bar to the path of the
   target (`history.replaceState`), opens the socket of the target and authenticates with the
   ticket. The card shows "Entering <world>..." until `init_data` arrives.
5. The target acquires the profile with a new epoch, so a late write of the world left is refused.

A refusal, a lost connection or a save still on its way (`left_saving`) never fakes an arrival: the
client opens the launch bridge of the target, which asks for a ticket of its own.

| Way                      | Session | Then                                                                                 |
| ------------------------ | ------- | ------------------------------------------------------------------------------------ |
| Travel                   | Both    | Another world of the universe, in the page or through its launch bridge (above)      |
| Cyberia Portal           | Both    | The portal world selection; the portal stays signed in                               |
| Play as guest            | Account | A new guest session from the bridge; it starts empty, and the profile stays as saved |
| Sign out                 | Account | The portal at `/?signout`, which ends the portal session                             |
| Sign in to keep progress | Guest   | The bridge as the account: the signed-in account, or the sign-in                     |

When the final commit does not land within 5 s, the server answers `left_saving`. The client says
that the last changes are still on their way and goes on when the player confirms. The server keeps
that state and retries it as for a disconnect. A guest leaves at once, and its state ends.

---

## What persists

| State                        | Persists     | Notes                                                                       |
| ---------------------------- | ------------ | --------------------------------------------------------------------------- |
| Coins                        | Per universe | The wallet balance                                                          |
| Bag stacks                   | Per universe | `itemId`, `olCid`, quantity, slot and `active`                              |
| Personal storage             | Per universe | Same stack shape                                                            |
| NPC vaults                   | Per world    | By action code, the stable identity of the vault, never by `EntityID`       |
| Total XP                     | Per universe | The level is derived from it by the progression rules of the world          |
| Quest progress               | Per world    | `CyberiaQuestProgress`, unique `{player, instanceCode, questCode}`          |
| Last valid position          | Per world    | `mapCode`, cell, checkpoint time                                            |
| Held stacks                  | By container | Owned stacks the world cannot load now; see [item identity](#item-identity) |
| Life, effects, running craft | No           | A session starts alive; a running craft is refunded when the session ends   |
| Party, invites, chat lines   | No           | They end with the session                                                   |

A guest session persists none of them.

### Item identity

`itemId` is a label and `olCid` is the definition. Each stack keeps the `olCid` it was granted
with, and stacks merge only when both match. At load the server compares each saved stack with the
binding of the world:

- Same `olCid`: the stack loads where it was.
- Another `olCid`, or a label the world cannot run: the stack becomes a **held** stack. It stays
  in the profile untouched and never loads into the world. The own profile shows each held stack
  with its own picture, its count and why it waits; none of it can be used in that world. The
  reasons are `rebound` (another definition), `unknown` (the world cannot get its content),
  `no_room`, `unsupported` (the server runs no handler of its skill) and `incompatible` (its content
  comes from another release than the world's) ([content a player brings](game-server.md#content-a-player-brings)).
- A held stack whose `olCid` matches the world again loads into its container at the next session,
  when the container has a free slot.

Worlds of one universe can run different releases. A stack from another world loads only when this
world binds its label to the same `olCid`; else it stays held, and loads again in a world that runs
its definition. A label is never replaced by a same-named item of another release.

A release never rebinds a held stack. An operator does it on purpose with `cyberia player
rebind-held`, which skips every profile in a live session.

### Load rules

- XP loads as saved. The level is the level of that XP, capped at the world `maxLevel`; a rule change
  never resets XP.
- A stack with a slot outside the container moves to a free slot. A stack with no free slot is held.
- A saved position loads only when its map exists and the cell is walkable; otherwise the player
  spawns by the instance spawn rules.
- A new profile starts with the default player stack and the spawn coins of the world, and commits
  them at once.

---

## Write guarantees

The game server stays the authority. It applies a change in memory, and a background pipeline
commits the whole durable state of the player. The engine stores what the server sends and never
computes a reward, a price or a level.

| Write        | When                                                             | Carries                                                                                       |
| ------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| State commit | At most every 200 ms while the state changed, and at session end | Coins, XP, bag, storage, vaults, held stacks, changed quests, the position after a map change |
| Checkpoint   | Every third of the lease (20 s by default), one batch per server | Lease renewal, presence map, dirty positions                                                  |
| Release      | After the final commit                                           | Ends the lease                                                                                |

**Ordering and idempotency.** Each session numbers its commits. The engine applies a commit only
when its `epoch` is the profile epoch and its number is above the last applied one, in one
transaction with the changed quest records. A repeated commit answers `duplicate` and changes
nothing. A commit is the whole state, so a newer one supersedes a failed older one. One commit per
player is in flight at a time.

**Positions.** A checkpoint writes only the position of the world of its lease, guarded by the
sequence of that world. A late checkpoint never overwrites coins, items, XP or quests.

**Worlds.** The engine takes the world of a commit from the lease of its epoch, never from the
request. A world change raises the epoch, so a late commit or checkpoint of the world a player left
answers `stale_session`: no value exists in two worlds.

**Consistent prefix.** The saved profile is always one complete state the server held. A crash loses
the changes after the last commit, all of them together, never a part of one. In normal operation
that window is one commit round trip.

**Coins that leave a player.** Coins a player drops on death stay locked on the ground until the
commit that took them from the player is saved. No crash can leave the same coins with two players.

**Session end.** A disconnect keeps the final state in memory, commits it, then releases the lease.
A final state that cannot commit within 10 minutes is dropped and counted in `lost_final_total`, and
its lease expires. A new launch of the same account on this server waits up to 10 s for that
commit. A drain ends every session and gives the final commits 5 s of the drain budget.

### Unsaved players

A failing commit retries with backoff (200 ms to 5 s) and stays the one pending state of its player,
so the queue never grows past one entry per player. After 15 s of failures the player is
**unsaved**, and the toolbar says "Progress is not being saved. Trades wait; new gains can be lost."

| Action while unsaved                                           | Rule                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| Shop purchase, craft, container move                           | Refused: their result must be saved before it counts      |
| Movement, combat, pickups, kill XP, quest progress and rewards | Applied to the pending state                              |
| Coins dropped on death                                         | Dropped, and locked on the ground until the loss is saved |

The policy is a bounded rollback, not zero loss. A pending gain exists only in the live session, so
no action duplicates value. When the engine answers again, the pending state commits and the notice
goes away. When the server crashes first, the player returns to the last saved state, with all
pending gains lost together.

---

## Social persistence

| Data                           | Persists                  | Owner            |
| ------------------------------ | ------------------------- | ---------------- |
| Accepted friendships           | Yes, by account           | `engine-cyberia` |
| Friend requests                | Yes, expire after 30 days | `engine-cyberia` |
| Presence: online, world, map   | No, ends with the lease   | Lease            |
| Party, party chat, invites     | No                        | `cyberia-server` |
| Chat history, offline messages | Not stored                | —                |

Presence and the map of a player are visible to its accepted friends only. See
[chat and parties](social.md) for friends, direct chat and party markers.

---

## Trust boundaries

**Portal tokens.** The portal keeps its access token in `localStorage` and its refresh token in an
HttpOnly cookie. The game receives neither: the launch bridge turns a portal session into a
single-use ticket. [ADR 0006](../../underpost/adr/0006-portal-sessions-in-httponly-cookies.md)
proposes HttpOnly cookies for both tokens.

**Revocation.** A logout, a password recovery or the end of an account session for any other cause
ends the gameplay session at the next checkpoint (`revoked`), and its resume ticket stops working. A
guest identity that expires ends no session in play; the next launch makes a new guest.

**Server key.** `CYBERIA_SERVER_API_KEY` authenticates each side of the engine–server link:

| Use                    | Direction        | Check                                  |
| ---------------------- | ---------------- | -------------------------------------- |
| `CyberiaPlayerService` | Server to engine | Every RPC, in constant time            |
| Server registry report | Server to engine | The route guard                        |
| Hot-reload trigger     | Engine to server | The gRPC control and the REST fallback |

The engine trusts the `server_id` and `instance_code` a request names, so a holder of the key can act
for any world of the deploy: consume its tickets and write its profiles. The key never reaches a
log, a metric, a client build or a response. Each environment has its own key of at least 32 random
bytes. To rotate a key:

1. Write the new key to the deploy env file of the environment and to the canonical env file of the
   server template.
2. Run `instance-build-manifest` for the server family.
3. Deploy the engine and the game servers together. While the two keys differ, launches answer
   `unavailable` and commits wait.

The next step is one key per world, bound by the engine to the `instance_code` of that world.

---

## Data model

| Collection                     | Unique key                          | Other indexes                                          | Notes                                                                 |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `cyberiauniverses`             | `code`, `instances.instanceCode`    | —                                                      | Members, cells, links, `revision`; see [universes](universe.md)       |
| `cyberiaplayers`               | `{user, universeCode}`              | —                                                      | `schemaVersion` 2, `epoch`, `revision`; per world under `worlds`      |
| `cyberiagamesessions`          | `user`                              | —                                                      | Lease and presence, with the world it plays; never on `users`         |
| `cyberiagametickets`           | `tokenHash`                         | `user`, `connection` once set, TTL `expiresAt` + 5 min | Hash only; `principal`, `user` or `guest`; `epoch` on a resume ticket |
| `cyberiaquestprogresses`       | `{player, instanceCode, questCode}` | —                                                      | `player` is the profile id                                            |
| `cyberiasocials`           | `{low, high}`                       | `{low, status}`, `{high, status}`, TTL `expiresAt`     | One document per pair; accepting removes `expiresAt`                  |

`cyberiasocialprofiles` has one record per account, with a unique `user` index.
It stores the note and its last accepted update time.

A lease stays as a document after it expires: presence counts it only while `expiresAt` is in the
future, and the next session of the account replaces it. No TTL index deletes a lease or an account
session.

All of them live in the host database of `www.cyberiaonline.com`, beside `users`. A content release
or rollback never touches them, so a backup of the host database holds every player independently
of the content.
