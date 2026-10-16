# Chat and parties

Players talk on three chat channels, group in parties and keep friends. `cyberia-server` owns chat
and parties: it names every sender, decides who receives a line, and keeps every party. Both end
with the sessions of one game server. Friendships belong to accounts and persist in
`engine-cyberia`. In combat, party members cannot hurt each other and share the XP of a bot kill.

---

## Chat channels

| Channel | Reaches                                                                               | Opens from                                                     |
| ------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| World   | Every player on this game server                                                      | The chat button of the toolbar: the HUD chat panel             |
| Party   | The members of the sender's party                                                     | The same panel, Party tab                                      |
| Direct  | One player on the sender's map, or a friend on any map of this server, and the sender | The same panel, Direct tab; or Chat on a profile or friend row |

One game server process runs one instance, so World is the population of that instance. No line
crosses to another server.

**Server lines only.** The client sends `chat {channel, toId, text}`. The server names the sender
from its session and sends `chat {channel, fromId, fromName, fromSkin, toId, text}` to every
recipient, the sender too. The client draws only lines the server sent, so the history shows what
was delivered.

**Emoji.** A word `:name:` is an emoji token when `name` is in `CHAT_EMOJI` of the stat contract:
`smile`, `laugh`, `wink`, `cool`, `sad`, `angry`, `heart` and `thumbsup`. The line stays plain text
on the wire, so the server cleans and limits it like any other. The client draws each token as the
`emoji-<name>` UI icon in the chat panel and in the chat preview of a bubble. A row of emoji buttons
under the quick replies sends one token.

**Identity icons.** A chat line carries `fromSkin`, the item id of the sender's active skin. A
friend row carries `skin` while the friend plays on this server. The client draws the icon of that
Object Layer, and a default icon without one. See
[player identity](player-identity-and-profile.md#identity-icon).

**Refusals.** A refused line answers with `chat_ack {ok: false, reason, channel, toId}`. The client
writes the reason as a system line in the conversation the player typed in.

**Limits.**

| Limit       | Value                                                         | Source                                       |
| ----------- | ------------------------------------------------------------- | -------------------------------------------- |
| Line length | 160 runes                                                     | `CHAT_TEXT_MAX_RUNES` in the stat contract   |
| Content     | Control and format characters dropped, runs of space made one | `social.CleanText`, at the protocol boundary |
| Rate        | 5 lines at once, then one more every 1.5 s, per player        | `cyberia-server/game/social/chat.go`         |

A throttled player gets `rate_limited`. The server logs one line per throttled run, with the entity
id and the channel and no text. The generic input limiter of the socket still bounds every message.

**History.** The client keeps 60 lines per conversation, for at most 32 conversations, and drops
them at a reconnect. No chat history persists.

**Panel.** The HUD chat panel is the one place chat shows and is written. Its tabs are World, Party
and Direct. Direct lists the conversations, each with the identity icon, the last line and its
unread count, and opens one of them. A conversation stays open when its peer leaves view, and a line
from a friend on another map reaches it the same way. The panel opens no modal: the player keeps
playing beside it. Its text input shows only while no modal covers the world, and keys typed into it
never reach the game.

**Badges.** The chat button of the toolbar counts the unread lines of every conversation, and each
tab counts its own. The panel opens on the shown tab when it holds unread lines, else on the first
tab that does. Reading a conversation clears its count. The social button counts the friend
requests to answer and the party invites; the friend requests load when the session starts. Counts
cover this session only: no line waits for a player who is offline.

`deliver` in `chat.go` is the one place a line reaches a recipient. A future mute or ignore list
filters there.

---

## Parties

A party holds up to 5 players (`PARTY_MAX_MEMBERS` in the stat contract). Its first member leads.

| Event        | Rule                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invite       | The target is in the inviter's view, or an accepted friend on any map of this server, and in no party. The inviter is in no party or leads one that is not full. A repeat renews the invite |
| Pending      | An invite waits 60 s. A player holds at most 5 pending invites to it, and 5 of its own (`PARTY_INVITES_MAX`)                                                                                |
| Accept       | Seats the player. A first accept founds the party, led by the inviter. The seated player's other invites lapse                                                                              |
| Decline      | Drops the invite                                                                                                                                                                            |
| Full         | A full party drops its leader's pending invites                                                                                                                                             |
| Leave        | The member leaves. When the leader leaves, the next member in join order leads                                                                                                              |
| Remove       | The leader removes a member                                                                                                                                                                 |
| Disband      | The leader ends the party; the client asks for a second tap                                                                                                                                 |
| Disconnect   | The same as leave, and every invite to or from the player lapses                                                                                                                            |
| Party of one | Ends                                                                                                                                                                                        |

Membership and invites key by `PlayerID` ([player identity](player-identity-and-profile.md#session-identity)).

**Wire.** The client sends `party_invite {toId}`, `party_reply {fromId, accept}`, `party_leave`,
`party_kick {toId}` and `party_disband`. A refusal answers with `party_ack {ok: false, reason,
action}`, which the client shows as a toast. The state travels in every snapshot:

| Field                              | Holds                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `self.party`                       | `leaderId` and every member: id, name, level, life, map                        |
| `self.partyInvites`                | Each invite that waits for the player's answer: who sent it, and the time left |
| `self.partyInvitesSent`            | Each invite of the player that waits for an answer: to whom, and the time left |
| `self.interaction` rows of players | `flags` bit 3: the viewer may invite now                                       |

**Interface.** An invite never blocks play. The social button and the own bubble count the pending
invites, and the inviter's bubble carries the party mark. The player answers from the own Party tab
or from the inviter's profile. Invite on a profile or a friend row turns into "Invite sent" while
the invite waits. The Party tab lists the members with their level, life and map, marks the leader
with a star, and offers Remove, Leave and Disband to whom they apply.

**Markers.** Each player interaction row tells the viewer what the other player is to it: `flags`
bit 5 marks a member of its party, bit 6 a player in another party, bit 7 a friend. The nameplate
leads with a heart for a friend and the party icon for a member. A player in another party carries
no mark; its profile says "In a party". These bits are all the viewer learns: no party id or roster
of another party reaches it.

---

## Friends

A friendship joins two accounts, so it lasts across sessions and worlds. Guests have no friends.

| Event   | Rule                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| Request | The target is an account player in the sender's view. A crossed request accepts at once                            |
| Pending | A request waits 30 days (`FRIEND_REQUEST_DAYS`). An account holds at most 20 open requests (`FRIEND_REQUESTS_MAX`) |
| Accept  | Both accounts hold fewer than 200 friends (`FRIENDS_MAX`)                                                          |
| Decline | Drops the request. The sender withdraws its own request the same way                                               |
| Remove  | Ends the friendship for both accounts                                                                              |
| Budget  | 3 friend actions at once, then one more every 2 s, per player                                                      |

**Wire.** The client sends `friends_list`, `friend_request {toId}`, `friend_reply {friendshipId,
accept}` and `friend_remove {friendshipId}`. The server runs each action against the engine off the
tick and answers with the whole list, `friends {friends}`, to every online player it concerns. A
refusal answers with `friend_ack {ok: false, reason, action}`. When an account joins, the server
sends a fresh list to each of its friends on this server.

**Presence.** A friend row shows online, world and map for an accepted friend only, from its
session lease. A request shows the name and the days left. No row carries an account id or an
email.

**Interface.** The own Friends tab lists the requests to answer, the friends (online first, with
their world and map) and the requests sent. A friend online on this server offers Chat and, when the
player may invite, Invite; Remove asks for a second tap. A public profile offers Add friend, Accept friend or shows "Friend request sent".
The nameplate of a friend carries a heart.

---

## Party combat

**No friendly fire.** A hit between two members of one party lands nothing: no damage, no damage
ledger entry, no combat text and no thorns. The projectile flies through.

- The rule covers each source of damage: a member's projectiles, the summons of a member, the
  projectiles of those summons, and hits on a member's summons. Damage reaches an entity only
  through a projectile, so `handleSkillCollisions` checks it once, at the hit.
- A projectile or summon records its owner at its spawn (`Agent.OwnerID`): the player behind every
  caster. The rule holds after the caster is gone.
- Membership counts at the moment of the hit. A projectile fired before a party forms spares the
  members; a member who leaves takes hits again.
- A player and its own summons keep their former rule, and hostile bots hit members as before. The
  rule is not stasis: members stay fully in play.

**Shared bot kills.** A party earns a bot kill once. `AwardDefeat` in
`cyberia-server/game/content/progression_runtime.go` resolves it at the death:

1. A member qualifies the party when it dealt at least 10% of the damage and is near the bot.
2. Near means alive, out of stasis, on the map of the bot and with its centre at most
   `PARTY_XP_SHARE_RADIUS` (10) cells from the centre of the bot. The stat contract holds the radius.
3. The kill XP of one player splits among the near members in integer shares, in party order. The
   first members take the remainder, so the shares add up to the kill XP.
4. Each share then passes the [anti-farming rules](stats-and-progression.md#xp-rules) of its earner.
   A cut share stays unpaid.

- Members far away earn nothing, even when they dealt damage. With no near member that qualifies,
  the party earns nothing.
- Membership counts at the death: a member who left earns alone, and a player who joined shares.
- A player kill and a resource keep their rule: each contributor of at least 10% earns the whole
  reward. Loot does not change: every contributor may collect.

---

## Refusal reasons

| Reason         | Meaning                                         |
| -------------- | ----------------------------------------------- |
| `invalid`      | The request names nothing usable                |
| `unavailable`  | The other player is gone or out of reach        |
| `rate_limited` | The sender spent its chat budget                |
| `no_party`     | The player is in no party                       |
| `in_party`     | The invited player is already in a party        |
| `not_leader`   | Only the leader may do this                     |
| `party_full`   | The party holds 5 players                       |
| `busy`         | The invited player holds too many invites       |
| `invites_full` | The inviter holds too many invites              |
| `expired`      | The invite was answered, withdrawn or timed out |
| `not_member`   | The player is not in the leader's party         |

The friend refusals are in [the player service reference](../reference/player-service.md#friend-refusals).

---

## Not in this release

Guilds, raids, matchmaking, parties across servers, chat across servers, offline messages,
persistent chat history and mute or ignore lists do not exist.

---

## Tests

| Test                                                  | What it proves                                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyberia-server/game/social/social_test.go`           | Founding, invites, expiry, decline, the size cap, succession, remove, disband, disconnect, the invite caps of a target and of an inviter; channel membership; the chat budget; text cleaning |
| `cyberia-server/game/net/social_ws_test.go`           | World chat with the server name, the party refusal, and the invite, sent invite, accept, party chat and disconnect flow over real sockets                                                    |
| `cyberia-server/game/net/input_validation_test.go`    | Chat and party events at the protocol boundary                                                                                                                                               |
| `cyberia-server/game/sim/party_combat_test.go`        | No hit between members, direct, in flight, from and on summons; a member who leaves and a hostile bot still hit                                                                              |
| `cyberia-server/game/sim/progression_test.go`         | The kill split and its remainder, the radius, dead and gone members, membership at the death, anti-farming per earner, player kills                                                          |
| `cyberia-client/tests/player_containers_test.c`       | The chat log files lines by conversation and counts unread lines                                                                                                                             |
| `cyberia-server/game/social/social_test.go`           | Account names, direct lines that cross maps only between friends, the friend budget                                                                                                          |
| `test/cyberia/integration/player-persistence.test.js` | Requests, crossed requests, accept, decline, remove, the limits, presence for friends only                                                                                                   |
| `test/cyberia/unit/chat-emoji.test.js`                | Every `CHAT_EMOJI` name has its icon and is one plain word                                                                                                                                   |
