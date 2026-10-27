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

The moderator reads `cyberia-game-session`, `cyberia-social`, `cyberia-social-profile`,
`cyberia-quest-progress`, `cyberia-economy-operation`, `cyberia-world-drop`,
`cyberia-market-listing` and `cyberia-market-claim`, paginated. Only the operator routes below write
player state, and a change of the stacks only while no live session plays the profile.

The player manager ([recover a session](../how-to/recover-a-player-session.md),
[moderate players](../how-to/moderate-players.md)) reads and acts through these routes:

| Route                                                          | Role      | Answers                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/cyberia-player?q&universeCode&status&after&limit` | Moderator | `{data, next}`: at most 50 profiles, last played first. `q` is an account id or the start of a name; `status` is `online` or `closing`. Each row holds the profile counters and the session its lease names, with the reported health; never the goods |
| `GET /api/v1/cyberia-player/:id`                               | Moderator | The row, the account `role` and its `restriction` while it holds, the counts of the bag, storage and held stacks, each world with its vaults and quests, and whether the shape is current                                                              |
| `GET /api/v1/cyberia-player/:id/stacks`                        | Moderator | Each bag and storage stack with the type of its definition and the definition its item runs now, the open slots of each at the level, the coins, `live`, `wearable` and `maxActiveLayers`                                                              |
| `GET /api/v1/cyberia-player-audit?player&after`                | Moderator | `{data, next}`: 20 operator records, newest first                                                                                                                                                                                                      |
| `POST /api/v1/cyberia-player/:id/session/end`                  | Admin     | `{operationId, outcome, refusal, epoch, after}` for `{operationId, reason, epoch}`; `refusal` is `changed` or `no_session`                                                                                                                             |
| `POST /api/v1/cyberia-player/:id/stacks`                       | Admin     | The answer for `{operationId, reason, epoch, change}`; `change` is `{op, container, itemId, slot?, quantity?}`, `op` one of `add`, `remove`, `quantity`, `activate`, `deactivate`                                                                      |
| `POST /api/v1/cyberia-player/:id/account`                      | Moderator | The answer for `{operationId, reason, op, until?}`; `op` is `lock` (ends within 90 days), `ban` (an admin; `until` or none) or `lift` (a ban: an admin)                                                                                                |
| `POST /api/v1/cyberia-player/batch`                            | Moderator | `{batchId, preview, results}` for `{batchId, targets: [{playerId, epoch}], operation, reason, preview}`; 1 to 50 profiles; each operation needs the role its single route needs                                                                        |

Each operator route takes 120 requests per 15 minutes from one address. A repeated `operationId`
answers the recorded outcome; a batch runs each profile as `<batchId>-<profile id>`. A refusal is one
of:

| Refusal           | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `changed`         | The profile has another epoch than the one the operator saw         |
| `no_session`      | No live session plays the profile                                   |
| `online`          | A live session plays the profile: end it first                      |
| `unknown_item`    | The catalog binds no definition to the item id                      |
| `coin`            | Coins stay in the wallet, never in a slot                           |
| `no_room`         | The container has no open slot                                      |
| `locked_slot`     | The slot is past the open slots of the level                        |
| `slot_taken`      | Another stack holds the slot                                        |
| `no_stack`        | No stack of the item is in that place                               |
| `stored`          | A stored item is never worn                                         |
| `not_wearable`    | The item type is not in `activeItemTypes`                           |
| `too_many_layers` | The player would wear more than `maxActiveLayers`                   |
| `skin_required`   | The last worn skin stays on                                         |
| `no_account`      | The account of the profile is gone                                  |
| `self`            | An operator never restricts the account it signs in with            |
| `protected`       | No operator restricts an admin; only an admin restricts a moderator |
| `not_restricted`  | The account has no restriction to lift                              |
| `forbidden`       | Only an admin lifts a ban                                           |

## Socket messages

Every message is a JSON envelope `{type, payload}` on `/ws`.

| Message          | Direction        | Payload                                                          | When                                                        |
| ---------------- | ---------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `auth`           | Client to server | `{ticket}`; `{}` without a ticket                                | The first message of every connection                       |
| `init_data`      | Server to client | `session` (`account` or `guest`), `maxLevel`, `build`, …         | After the server admits the player                          |
| `resume`         | Server to client | `{ticket}`                                                       | An account session starts, and before it expires            |
| `session_leave`  | Client to server | `{}`, or `{travel}`: the world an in-page travel enters          | The player picks a way, or travels                          |
| `session_end`    | Server to client | `{reason}`; after a travel also `travel: {instanceCode, ticket}` | Before the server closes a session                          |
| `input_resend`   | Server to client | `{from}`: the first event sequence the server did not queue      | A batch arrived past a gap; the client sends again from it  |
| `friends_list`   | Client to server | `{}`                                                             | The social panel shows Friends or Requests, then every 10 s |
| `friend_request` | Client to server | `{toId}`: a visible account player                               | Add friend                                                  |
| `friend_reply`   | Client to server | `{friendshipId, accept}`                                         | Accept, decline or withdraw a request                       |
| `friend_remove`  | Client to server | `{friendshipId}`                                                 | End a friendship                                            |
| `friends`        | Server to client | `{friends: [Friend]}`                                            | After each change, and when a friend joins                  |
| `friend_ack`     | Server to client | `{ok: false, reason, action}`                                    | A refused friend action                                     |

A `Friend` row holds `id` (the friendship), `name`, `skin` (the item id of the active skin, set
while the friend plays on this server), `status` (`friend`, `incoming` or `outgoing`), `online`, `world`, `mapCode`,
`entityId` and `expiresInMs`. Presence fields come only for an accepted friend. `entityId` is set
while that account plays on this server. No row carries an account id or an email.

The snapshot adds `self.held` (the held stack count), `self.durability` and `self.unsavedMs`
while the state is not saved ([save health](../explanation/accounts-and-persistence.md#save-health)),
`self.party`,
`self.partyInvites` (the invites to the player) and `self.partyInvitesSent` (the invites of the
player that wait for an answer). A chat line carries `fromAvatar`. A player interaction row sets
`flags` bit 3 when the viewer may invite that player, bit 5 for a member of the viewer's party, bit
6 for a player in another party and bit 7 for a friend.

### Session end reasons

| Reason                | Sent when                                                        | The client offers                                         |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| `auth_required`       | Account mode and no ticket                                       | Continue as guest, Sign in                                |
| `invalid`             | The first message is not `auth`, or the ticket is malformed      | Sign in, Continue as guest                                |
| `unknown`             | No ticket has this hash                                          | Sign in, Continue as guest                                |
| `expired`             | The ticket is past its time to live                              | Sign in, Continue as guest                                |
| `replayed`            | Another connection consumed the ticket                           | Sign in, Continue as guest                                |
| `wrong_instance`      | The ticket names another world                                   | Sign in, Continue as guest                                |
| `revoked`             | The account session ended, or the guest identity expired         | Sign in, Continue as guest                                |
| `busy`                | A resume whose old session may still write on another server     | Nothing: the client tries again                           |
| `saving`              | The session the account left still saves on another server       | Try again, Cyberia Portal                                 |
| `unavailable`         | The engine did not answer                                        | Try again, Cyberia Portal                                 |
| `ended`               | An operator ended the session                                    | Play again, Cyberia Portal                                |
| `signed_in_elsewhere` | A newer launch of the account took over                          | Play here, Cyberia Portal                                 |
| `invalid_state`       | The engine refused the state of the session as malformed         | Play again, Cyberia Portal                                |
| `server_restart`      | The server drains                                                | An account resumes; a guest plays again                   |
| `left`                | The player left from the settings card; the final state is saved | The way the player picked                                 |
| `left_saving`         | The same, but the final state is still on its way                | Continue, then that way; a travel goes on with its ticket |

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
service only on the host that holds the player APIs, and builds no index: the deploy syncs the
indexes of the player records with `node bin/cyberia runtime-indexes --apply` before the rollout
([`runtime-indexes`](cyberia-cli.md#cyberia-runtime-indexes--runtime-record-indexes)). Every 30 s the service settles the market
listings that ended ([settlement](../explanation/off-chain-economy.md#settlement)). Regenerate the
Go and JS stubs with `node bin/cyberia stat-contract`.

| RPC                        | Request                                                                    | Answer                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ConsumeGameLaunchTicket`  | `ticket`, `instance_code`, `connection_id`, `server_id`                    | `refusal`, or `principal`; for an account also `account_id` and `display_name`                                          |
| `IssueResumeTicket`        | `player_id`, `account_id`, `epoch`, `instance_code`                        | `refusal` (`signed_in_elsewhere`, `revoked`, `ended`), or `ticket` and `expires_at_ms`                                  |
| `IssueTravelTicket`        | `player_id`, `account_id`, `epoch`, `instance_code`, `target_code`         | `refusal` (`signed_in_elsewhere`, `revoked`, `ended`, `no_route`, `unavailable`), or `ticket` and `expires_at_ms`       |
| `AcquirePlayerSession`     | `connection_id`, `instance_code`, `server_id`                              | `refusal` (`unknown`, `revoked`, `unavailable`, `saving`), or `player_id`, `epoch`, `state`, `created`, `lease_seconds` |
| `CommitPlayerState`        | `player_id`, `epoch`, `seq`, `state`, `quests_changed`, `position_changed` | `refusal` (`stale_session`, `unknown`, `invalid`, `integrity`), `duplicate`, `revision`                                 |
| `CommitPlayerStates`       | `operation_id`, `kind`, `commits[]`; `drop`, `claim_drop_id` or `market`   | `refusal` (also `drop_gone`) and the `player_id` it names, or `duplicate`; all or nothing                               |
| `ListWorldDrops`           | `instance_code`                                                            | `drops[]`: the public world drops of the world that have not expired                                                    |
| `ListMarket`               | `instance_code`, `market_code`, `player_id`, `item_id`, `mode`, `after`    | `listings[]`, `next`, `mine[]`, `claims[]`, `scope_key`, `revision`; listings that ended settle first                   |
| `CheckpointPlayerSessions` | `server_id`, `instance_code`, `sessions[]`, each with its `health`         | `ended[]`: `player_id` and `reason` (`signed_in_elsewhere`, `revoked`, `ended`)                                         |
| `ReleasePlayerSession`     | `player_id`, `account_id`, `epoch`                                         | —                                                                                                                       |
| `ListFriends`              | `account_id`                                                               | `friends[]`                                                                                                             |
| `UpdateFriendship`         | `account_id`, `action`, `target_account_id`, `friendship_id`               | `refusal`, `friend`                                                                                                     |

`PlayerState` holds `coins`, `xp`, `bag`, `storage`, `vaults`, `held`, `position`, `quests` and
`revision`: the universe profile and the part it keeps in the world of the session. `player_id` is
the id of the universe profile, and `created` marks its first session in the universe. The engine
takes the world of `CommitPlayerState` and `CheckpointPlayerSessions` from the lease of the epoch,
and splits the state by [scope](../explanation/accounts-and-persistence.md#one-profile-per-universe).
A stack is `item_id`, `ol_cid`, `quantity`, `slot` and `active`. A retry of
`ConsumeGameLaunchTicket` or `AcquirePlayerSession` with the same `connection_id` answers the first
result. `AcquirePlayerSession` answers `unavailable` for a world that belongs to no universe.

**Failures.** A write the database refuses as it stands (duplicate key, document validation,
document too large) answers `integrity` and logs the database error on the engine; the game server
retries it every 30 s and never ends the session for it. Any other MongoDB failure answers
`UNAVAILABLE`, and the server retries it at once with backoff. Any other exception answers
`INTERNAL`. `UNAUTHENTICATED`, `PERMISSION_DENIED`, `UNIMPLEMENTED`, `INVALID_ARGUMENT` and
`FAILED_PRECONDITION` are `rejected` calls: the server retries them every 30 s.

**Health.** `SessionHealth` is `durability` (`saved`, `saving`, `degraded`, `recovery`), `closing`,
`seq` (the newest captured state), `durable_seq` (the newest applied one), `unsaved_ms` and
`failure` (`transport`, `integrity`, `rejected`). The engine stores it on the lease. A server sends
a checkpoint at once when a session closes with an unsaved state, so the engine knows to hold a new
acquisition back.

`CommitPlayerStates` joins distinct players by `kind`: `trade` two or more and no effect, `drop` one
and the `drop` it puts on the ground, `pickup` one and the `claim_drop_id` it takes, `market_list`,
`market_cancel`, `market_buy`, `market_bid` and `market_collect` one and its `market` operation. A
`WorldDrop` is `map_code`, `x`, `y`, `item_id`, `ol_cid`, `quantity` and, in a commit,
`lifetime_ms`; a listed one adds `drop_id` (the id of its drop operation), `owner_player_id` and
`expires_at_ms`.
`drop_gone` refuses a pickup whose drop is claimed, expired, of another world or unknown.

A `MarketOp` names the `market_code` of the profile; the engine resolves its scope from the profile
and the world of the lease. A list carries the `listing_fee` and the `sale_fee` the seller saw. A
market operation answers `listing_gone`, `listing_changed`, `bid_low`, `market_full`, `claim_gone`,
`market_closed`, `market_changed` or `terms_refused`. An operation refusal writes nothing and ends
no session. `ListMarket` reads the profile by `market_code`; `scope_key` and `revision` name the
market it read. `GetFullInstance` of `CyberiaDataService` carries the `markets` the terminals of
the world open, each with its terms and its defect.

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

| Source                                         | Fields                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyberia-server` `GET /api/v1/metrics`         | `session_mode`; `persistence`: sessions, `pending_states`, `oldest_pending_sec`, `unsaved_players` (degraded or in recovery), `recovery_players`, commit, duplicate, retry, `integrity_total`, `rejected_total`, stale, invalid, `lost_final_total`, `adopted_total` and `superseded_total` counts, `avg_commit_ms`, checkpoint counts and `last_checkpoint_age_sec` |
| `cyberia-server` `GET /api/v1/metrics/runtime` | `auth_outcomes` and `session_ends`, by reason; `travel_outcomes`: `issued`, a refusal or `error`; `content`: saved labels by outcome, resolved, shared and evicted definitions; `economy_outcomes`: `op:outcome`; `ws_rate_limited_total` and `input_resend_total`                                                                                                   |
| `engine-cyberia` Prometheus                    | `cyberia_player_rpc_total{method, outcome}` (outcome also `unavailable`), `cyberia_player_rpc_seconds{method}`, `underpost_guest_sessions_total{event}`: `created`, `renewed`, `expired`, `unavailable`                                                                                                                                                              |

The logs name the account, the profile and the connection by id. They never carry a ticket, a
token or an email.

## Operator commands

```bash
cyberia runtime-indexes [--apply] --dev
cyberia player held [--universe <code>] --dev
cyberia player rebind-held <item-id> [--universe <code>] [--apply] --dev
cyberia run-workflow drop-db --include-runtime --confirm <deploy-id> --dev
```

| Command           | Does                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-indexes` | Deletes the runtime records without a required field of a unique key, then makes the indexes the ones their models declare; reports without `--apply`; exits 1 while one differs or a build fails |
| `held`            | Lists the held stacks: universe, world (empty for a bag or storage stack), label, definition, reason, counts                                                                                      |
| `rebind-held`     | Gives the held stacks of a label the definition the catalog binds now, in the profile and its worlds; skips profiles in a session                                                                 |
| `drop-db`         | With `--include-runtime`, also drops the player records                                                                                                                                           |

`rebind-held` reports without `--apply`. It skips profiles with a live session.
