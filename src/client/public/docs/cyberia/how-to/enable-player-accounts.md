# Enable player accounts

Switch a world from guest sessions to account sessions: players who sign in at the portal keep their
possessions and progress, and guests still play without them. The model is in
[accounts and persistent players](../explanation/accounts-and-persistence.md); the settings and
messages are in [the player service reference](../reference/player-service.md).

## Before you start

- MongoDB runs as a replica set. Every profile commit is a transaction.
- `engine-cyberia` and every game server share one `CYBERIA_SERVER_API_KEY`.
- The client and the game server come from the same release. Both modes start a connection with
  `auth`, and a server refuses a client that does not send it.

## 1. Deploy the engine

1. Add the player APIs to the host that holds `users` (`www.cyberiaonline.com/`) in the deploy
   `conf.server.json`, after `cyberia-quest-progress`: `cyberia-player`, `cyberia-game-session`,
   `cyberia-game-ticket` and `cyberia-friendship`. The engine serves `CyberiaPlayerService` only on
   that host.
2. Give the `cyberia-portal` client the launch bridge. In `conf.ssr.json`, add the view
   `{"path": "/launch", "client": "CyberiaLaunch", "headers": {"Cache-Control": "no-store",
"Referrer-Policy": "no-referrer"}}`. In `conf.client.json`, add the `GameLaunchCyberia` component.
3. Deploy.
4. Read the quest progress no profile owns, then archive it when the report is what you expect:

   ```bash
   node bin/cyberia player prune-quest-progress --dev           # report: counts and sample ids
   node bin/cyberia player prune-quest-progress --apply --dev   # archive, then sync the indexes
   ```

   No deploy stage runs it. The records move to `cyberiaquestprogressarchives`;
   `restore-quest-progress` returns the ones whose profile exists again.

Refresh tokens are stored as hashes from this release on. Every portal user signs in once more after
the first engine deploy that carries it.

## 2. Switch the game server

Set `CYBERIA_SESSION_MODE=account` in the canonical env file of the world template, then build the
instances:

```bash
node bin run instance-build-manifest --deploy-id dd-cyberia --instance-id mmo-server
node bin run instance-build-manifest --deploy-id dd-cyberia --instance-id mmo-client
```

The build copies the setting to every world of the family and writes the origins of each
environment ([origins](../explanation/accounts-and-persistence.md#origins)). In production the
server gets
`CYBERIA_CORS_ALLOWED_ORIGINS=https://www.cyberiaonline.com,https://client.cyberiaonline.com`: exact
origins. The socket refuses an upgrade from any other `Origin`. A server in account mode without
`CYBERIA_SERVER_API_KEY` does not start.

Deploy the game server and the client together. A world you leave in `anonymous` mode keeps guest
sessions and writes nothing.

## 3. Verify

1. `GET /api/v1/metrics` of the game server answers `session_mode: "account"`.
2. Sign in at the portal and press Play. The bridge opens the world, and the address bar shows no
   `#ticket`.
3. Move an item, wait a second and read `persistence.commits_total`: it rises.
4. Open the menu and pick World select, then Play again. The item stays where you put it.
5. Open the world in a second tab. The first one shows "Your account is playing in another window."
6. In a private window, open the client directly and pick Continue as guest. The guest plays, and
   `cyberiaplayers` gains no document.
7. Read `cyberia player held --dev`. A stack listed there waits for an operator: see
   [held stacks](#held-stacks).

## Held stacks

A saved stack whose definition the world no longer runs is held. It never loads and is never lost.

```bash
node bin/cyberia player held --instance FOREST --dev
node bin/cyberia player rebind-held lamp --instance FOREST --dev          # plan
node bin/cyberia player rebind-held lamp --instance FOREST --apply --dev  # write
```

`rebind-held` gives the held stacks of a label the definition the catalog binds now. They load at
the next session of each profile. It skips every profile in a live session; run it again later for
those.

## Roll back

- To stop persisting a world, set `CYBERIA_SESSION_MODE=anonymous` and redeploy its game server. The
  profiles stay untouched and load again when you switch back.
- To roll back the engine below this release, first switch every game server to `anonymous`. An
  account server refuses every launch with `unavailable` when the engine has no player service.
