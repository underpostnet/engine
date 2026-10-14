# Chat and parties

Players talk on three chat channels and group in parties. `cyberia-server` owns both: it names
every sender, decides who receives a line, and keeps every party. Both live with the sessions of one
game server, and nothing persists. In combat, party members cannot hurt each other and share the
XP of a bot kill.

---

## Chat channels

| Channel | Reaches                                        | Opens from                                         |
| ------- | ---------------------------------------------- | -------------------------------------------------- |
| World   | Every player on this game server               | The chat button of the toolbar: the HUD chat panel |
| Party   | The members of the sender's party              | The same panel, Party tab                          |
| Direct  | One player on the sender's map, and the sender | The Chat button of that player's profile           |

One game server process runs one instance, so World is the population of that instance. No line
crosses to another server.

**Server lines only.** The client sends `chat {channel, toId, text}`. The server names the sender
from its session and sends `chat {channel, fromId, fromName, toId, text}` to every recipient, the
sender too. The client draws only lines the server sent, so the history shows what was delivered.

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

**Input.** The HUD chat panel opens no modal: the player keeps playing beside it. Its text input
shows only while no modal covers the world, and keys typed into it never reach the game.

`deliver` in `chat.go` is the one place a line reaches a recipient. A future mute or ignore list
filters there.

---

## Parties

A party holds up to 5 players (`PARTY_MAX_MEMBERS` in the stat contract). Its first member leads.

| Event        | Rule                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Invite       | The target is in the inviter's view and in no party. The inviter is in no party or leads one that is not full. A repeat renews the invite |
| Pending      | An invite waits 60 s. A player holds at most 5 pending invites (`PARTY_INVITES_MAX`)                                                      |
| Accept       | Seats the player. A first accept founds the party, led by the inviter. The seated player's other invites lapse                            |
| Decline      | Drops the invite                                                                                                                          |
| Full         | A full party drops its leader's pending invites                                                                                           |
| Leave        | The member leaves. When the leader leaves, the next member in join order leads                                                            |
| Remove       | The leader removes a member                                                                                                               |
| Disband      | The leader ends the party; the client asks for a second tap                                                                               |
| Disconnect   | The same as leave, and every invite to or from the player lapses                                                                          |
| Party of one | Ends                                                                                                                                      |

Membership and invites key by `PlayerID` ([player identity](player-identity-and-profile.md#session-identity)).

**Wire.** The client sends `party_invite {toId}`, `party_reply {fromId, accept}`, `party_leave`,
`party_kick {toId}` and `party_disband`. A refusal answers with `party_ack {ok: false, reason,
action}`, which the client shows as a toast. The state travels in every snapshot:

| Field                              | Holds                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `self.party`                       | `leaderId` and every member: id, name, level, life, map                    |
| `self.partyInvites`                | Each invite that waits for an answer: who sent it, and the time left       |
| `self.interaction` rows of players | `flags` bit 3: the viewer may invite now; bit 4: the viewer's invite waits |

**Interface.** An invite never blocks play. The own bubble counts the pending invites, and the
inviter's bubble carries the party mark. The player answers from the own Party tab or from the
inviter's profile. The Party tab lists the members with their level, life and map, marks the leader
with a star, and offers Remove, Leave and Disband to whom they apply.

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
| `expired`      | The invite was answered, withdrawn or timed out |
| `not_member`   | The player is not in the leader's party         |

---

## Not in this release

Friends, guilds, raids, matchmaking, parties across servers, chat across servers, persistent chat
history and mute or ignore lists do not exist.

---

## Tests

| Test                                               | What it proves                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyberia-server/game/social/social_test.go`        | Founding, invites, expiry, decline, the size cap, succession, remove, disband, disconnect, the invite cap; channel membership; the chat budget; text cleaning |
| `cyberia-server/game/net/social_ws_test.go`        | World chat with the server name, the party refusal, and the invite, accept, party chat and disconnect flow over real sockets                                  |
| `cyberia-server/game/net/input_validation_test.go` | Chat and party events at the protocol boundary                                                                                                                |
| `cyberia-server/game/sim/party_combat_test.go`     | No hit between members, direct, in flight, from and on summons; a member who leaves and a hostile bot still hit                                               |
| `cyberia-server/game/sim/progression_test.go`      | The kill split and its remainder, the radius, dead and gone members, membership at the death, anti-farming per earner, player kills                           |
| `cyberia-client/tests/player_containers_test.c`    | The chat log files lines by conversation and counts unread lines                                                                                              |
