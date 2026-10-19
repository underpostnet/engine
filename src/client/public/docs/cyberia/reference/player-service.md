# Player service reference

The contracts of game sessions: the launch routes, the socket messages, the `CyberiaPlayerService`
RPCs, the settings, the metrics and the operator commands. The model is in
[accounts and persistent players](../explanation/accounts-and-persistence.md).

## Launch routes

| Method and path                                   | Guard                                           | Answers                                                      |
| ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `GET /launch[?world=<code>][&as=account\|guest]`  | None                                            | The launch bridge page, with `no-store` and `no-referrer`    |
| `POST /api/v1/user/guest`                         | None                                            | `data: { token, user }`: a new guest identity                |
| `POST /api/v1/cyberia-game-ticket {instanceCode}` | A portal session of an account, or a live guest | `data: { ticket, expiresAt, path }`, with `no-store` caching |

A request without `instanceCode`, and a bridge without `world`, launch the default world. The ticket
is 43 base64url characters. The engine stores only its SHA-256 hash. `path` is where the world lives
on the game client: empty for the default world, `/<instance>` for any other.

| Status | Ticket route answers when                                                   |
| ------ | --------------------------------------------------------------------------- |
| `401`  | No valid token, or the guest identity expired; the bridge makes a new guest |
| `403`  | The token is not a portal session                                           |
| `404`  | The world does not exist                                                    |
| `409`  | An account asks for a world that belongs to no universe                     |
| `429`  | The account or the guest already holds 5 open tickets                       |
| `503`  | No live server of the world takes new sessions                              |

The moderator reads `GET /api/v1/cyberia-player`, `cyberia-game-session`, `cyberia-social` and `cyberia-social-profile` and
`cyberia-quest-progress`, paginated. No REST route writes player state.

## Socket messages

Every message is a JSON envelope `{type, payload}` on `/ws`.

| Message          | Direction        | Payload                                                                | When                                                        |
| ---------------- | ---------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `auth`           | Client to server | `{ticket}`; `{}` without a ticket                                      | The first message of every connection                       |
| `init_data`      | Server to client | `session` (`account` or `guest`), `maxLevel`, `build`, …               | After the server admits the player                          |
| `resume`         | Server to client | `{ticket}`                                                             | An account session starts, and before it expires            |
| `session_leave`  | Client to server | `{}`, or `{travel}`: the world an in-page travel enters                | The player picks a way, or travels                          |
| `session_end`    | Server to client | `{reason}`; after a saved travel also `travel: {instanceCode, ticket}` | Before the server closes a session                          |
| `friends_list`   | Client to server | `{}`                                                                   | The social panel shows Friends or Requests, then every 10 s |
| `friend_request` | Client to server | `{toId}`: a visible account player                                     | Add friend                                                  |
| `friend_reply`   | Client to server | `{friendshipId, accept}`                                               | Accept, decline or withdraw a request                       |
| `friend_remove`  | Client to server | `{friendshipId}`                                                       | End a friendship                                            |
| `friends`        | Server to client | `{friends: [Friend]}`                                                  | After each change, and when a friend joins                  |
| `friend_ack`     | Server to client | `{ok: false, reason, action}`                                          | A refused friend action                                     |

A `Friend` row holds `id` (the friendship), `name`, `skin` (the item id of the active skin, set
while the friend plays on this server), `status` (`friend`, `incoming` or `outgoing`), `online`, `world`, `mapCode`,
`entityId` and `expiresInMs`. Presence fields come only for an accepted friend. `entityId` is set
while that account plays on this server. No row carries an account id or an email.

The snapshot adds `self.held` (the held stack count), `self.unsaved`, `self.party`,
`self.partyInvites` (the invites to the player) and `self.partyInvitesSent` (the invites of the
player that wait for an answer). A chat line carries `fromAvatar`. A player interaction row sets
`flags` bit 3 when the viewer may invite that player, bit 5 for a member of the viewer's party, bit
6 for a player in another party and bit 7 for a friend.

### Session end reasons

| Reason                | Sent when                                                        | The client offers                       |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| `auth_required`       | Account mode and no ticket                                       | Continue as guest, Sign in              |
| `invalid`             | The first message is not `auth`, or the ticket is malformed      | Sign in, Continue as guest              |
| `unknown`             | No ticket has this hash                                          | Sign in, Continue as guest              |
| `expired`             | The ticket is past its time to live                              | Sign in, Continue as guest              |
| `replayed`            | Another connection consumed the ticket                           | Sign in, Continue as guest              |
| `wrong_instance`      | The ticket names another world                                   | Sign in, Continue as guest              |
| `revoked`             | The account session ended, or the guest identity expired         | Sign in, Continue as guest              |
| `busy`                | A resume whose old session still holds its lease                 | Nothing: the client tries again         |
| `unavailable`         | The engine did not answer                                        | Try again, Cyberia Portal               |
| `signed_in_elsewhere` | A newer launch of the account took over                          | Play here, Cyberia Portal               |
| `invalid_state`       | The engine refused the state of the session as malformed         | Play again, Cyberia Portal              |
| `server_restart`      | The server drains                                                | An account resumes; a guest plays again |
| `left`                | The player left from the settings card; the final state is saved | The way the player picked               |
| `left_saving`         | The same, but the final state is still on its way                | Continue, then that way                 |

### Friend refusals

| Reason         | Meaning                                          |
| -------------- | ------------------------------------------------ |
| `guest`        | Friends need an account on both sides            |
| `unavailable`  | The player is out of view, or the engine is down |
| `rate_limited` | More than 3 actions at once, then one per 2 s    |
| `self`         | The request names the sender                     |
| `exists`       | A friendship or a request already joins the pair |
| `limit`        | 200 friends, or 20 open requests                 |
| `not_found`    | The request or friendship is no longer open      |
| `unknown`      | The account does not exist                       |

## gRPC: `CyberiaPlayerService`

`src/grpc/cyberia/cyberia.proto` defines the service beside `CyberiaDataService`. Every call carries
`x-cyberia-server-api-key`; the engine answers `UNAUTHENTICATED` without it. The engine serves the
service only on the host that holds the player APIs. Regenerate the Go and JS stubs with
`node bin/cyberia stat-contract`.

| RPC                        | Request                                                                    | Answer                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ConsumeGameLaunchTicket`  | `ticket`, `instance_code`, `connection_id`, `server_id`                    | `refusal`, or `principal`; for an account also `account_id` and `display_name`                                |
| `IssueResumeTicket`        | `player_id`, `account_id`, `epoch`, `instance_code`                        | `refusal` (`signed_in_elsewhere`, `revoked`), or `ticket` and `expires_at_ms`                                 |
| `IssueTravelTicket`        | `player_id`, `account_id`, `epoch`, `instance_code`, `target_code`         | `refusal` (`signed_in_elsewhere`, `revoked`, `no_route`, `unavailable`), or `ticket` and `expires_at_ms`      |
| `AcquirePlayerSession`     | `connection_id`, `instance_code`, `server_id`                              | `refusal` (`unknown`, `revoked`, `unavailable`), or `player_id`, `epoch`, `state`, `created`, `lease_seconds` |
| `CommitPlayerState`        | `player_id`, `epoch`, `seq`, `state`, `quests_changed`, `position_changed` | `refusal` (`stale_session`, `unknown`, `invalid`), `duplicate`, `revision`                                    |
| `CheckpointPlayerSessions` | `server_id`, `instance_code`, `sessions[]`                                 | `ended[]`: `player_id` and `reason`                                                                           |
| `ReleasePlayerSession`     | `player_id`, `account_id`, `epoch`                                         | —                                                                                                             |
| `ListFriends`              | `account_id`                                                               | `friends[]`                                                                                                   |
| `UpdateFriendship`         | `account_id`, `action`, `target_account_id`, `friendship_id`               | `refusal`, `friend`                                                                                           |

`PlayerState` holds `coins`, `xp`, `bag`, `storage`, `vaults`, `held`, `position`, `quests` and
`revision`: the universe profile and the part it keeps in the world of the session. `player_id` is
the id of the universe profile, and `created` marks its first session in the universe. The engine
takes the world of `CommitPlayerState` and `CheckpointPlayerSessions` from the lease of the epoch,
and splits the state by [scope](../explanation/accounts-and-persistence.md#one-profile-per-universe).
A stack is `item_id`, `ol_cid`, `quantity`, `slot` and `active`. A retry of
`ConsumeGameLaunchTicket` or `AcquirePlayerSession` with the same `connection_id` answers the first
result. `AcquirePlayerSession` answers `unavailable` for a world that belongs to no universe.

## Settings

| Variable                             | Process          | Default     | Does                                                                           |
| ------------------------------------ | ---------------- | ----------- | ------------------------------------------------------------------------------ |
| `CYBERIA_SESSION_MODE`               | `cyberia-server` | `anonymous` | `account` requires a ticket, admits accounts and guests, and persists accounts |
| `CYBERIA_AUTH_TIMEOUT_SEC`           | `cyberia-server` | `10`        | The wait for the `auth` message                                                |
| `CYBERIA_SERVER_API_KEY`             | Both             | —           | The shared secret; account mode needs it                                       |
| `CYBERIA_CORS_ALLOWED_ORIGINS`       | `cyberia-server` | Dev origins | The exact `Origin` values the socket and the API accept                        |
| `CYBERIA_GAME_TICKET_TTL_SECONDS`    | `engine-cyberia` | `60`        | The life of a launch ticket; at least 5                                        |
| `CYBERIA_RESUME_TICKET_SECONDS`      | `engine-cyberia` | `300`       | The life of a resume ticket; at least 30                                       |
| `CYBERIA_GAME_SESSION_LEASE_SECONDS` | `engine-cyberia` | `60`        | The life of a lease without a checkpoint; at least 15                          |
| `GUEST_SESSION_MINUTES`              | `engine-cyberia` | `60`        | The life of a guest identity and its token after its last use                  |
| `MAX_ACTIVE_SESSIONS`                | `engine-cyberia` | `10`        | Portal sessions per user; the oldest end first                                 |

`instance-build-manifest` writes the origin settings of each world; see
[origins](../explanation/accounts-and-persistence.md#origins).
`src/api/cyberia-social/social-contract.js` defines friend limits and status note rules.
`SharedDefaultsCyberia.js` defines party limits and chat emoji.
The stat contract generator reads both modules and writes the Go and C contracts.

## Metrics

| Source                                         | Fields                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyberia-server` `GET /api/v1/metrics`         | `session_mode`; `persistence`: sessions, `pending_states`, `oldest_pending_sec`, `unsaved_players`, commit, duplicate, retry, stale, invalid and `lost_final_total` counts, `avg_commit_ms`, checkpoint counts and `last_checkpoint_age_sec` |
| `cyberia-server` `GET /api/v1/metrics/runtime` | `auth_outcomes` and `session_ends`, by reason; `travel_outcomes`: `issued`, a refusal or `error`; `content`: saved labels by outcome, resolved, shared and evicted definitions                                                               |
| `engine-cyberia` Prometheus                    | `cyberia_player_rpc_total{method, outcome}`, `cyberia_player_rpc_seconds{method}`, `underpost_guest_sessions_total{event}`: `created`, `renewed`, `expired`, `unavailable`                                                                   |

The logs name the account, the profile and the connection by id. They never carry a ticket, a
token or an email.

## Operator commands

```bash
cyberia player held [--universe <code>] --dev
cyberia player rebind-held <item-id> [--universe <code>] [--apply] --dev
cyberia run-workflow drop-db --include-runtime --confirm <deploy-id> --dev
```

| Command                  | Does                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `held`                   | Lists the held stacks: universe, world (empty for a bag or storage stack), label, definition, reason, counts                      |
| `rebind-held`            | Gives the held stacks of a label the definition the catalog binds now, in the profile and its worlds; skips profiles in a session |
| `drop-db`                | With `--include-runtime`, also drops the player records                                                                           |

`rebind-held` reports without `--apply`. It skips profiles with a live session.
