# Deploy a Cyberia release

The deploy procedure: what a bootstrap does, what a normal deploy does, the stages it runs
through, the game server topology it lands on, and how to verify the result.

## Bootstrap and normal deploys

| Operation                      | Bootstrap (explicit, `--confirm <deploy-id>`)        | Normal deploy                    |
| ------------------------------ | ---------------------------------------------------- | -------------------------------- |
| Create databases, indexes      | yes                                                  | idempotent only                  |
| Seed or import content         | yes                                                  | into a new release database only |
| `cyberia ol --drop`            | yes                                                  | never                            |
| `cyberia run-workflow drop-db` | yes; keeps player records unless `--include-runtime` | never                            |
| `cyberia instance --drop`      | yes                                                  | never                            |
| Touch player or runtime state  | only with `--include-runtime`                        | never                            |

The first deploy on the release layout has no active release: the new pod serves the workspace
until Stage G promotes the first validated release. The content collections a runtime database
held before the layout stay where they are and are no longer read.

## Deploy stages

`deploy/dd-cyberia/sync-deploy.sh` runs these stages in order. A failing stage stops the deploy.
The deploy runs no tests: CI tests the source, and the source carries its coverage reports in `docs/coverage/`.
Nothing before Stage E changes what players see: a candidate that fails stops the deploy before it.

| Stage | Name                   | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Source synchronization | Every product repository from one source channel: the deployment at its branch tip, every other at the revision the deployment lock pins                                                                                                                                                                                                                                                                                                                                                                                                            |
| B     | Immutable artifacts    | Catalog install, release id `v<version>-<commit>-<content revision>`, image `engine-cyberia:v<version>`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| C     | Configuration          | `app load`, `validate-domains`, manifests, client bundle, private conf                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D     | Data                   | A Release Job makes the indexes of the runtime records the ones their models declare; a record that refuses a unique index stops the deploy and names the key. The host prepares the locked revision; a Release Job builds its artifact once, imports the foundation then each instance as durable steps, makes every definition canonical at the Object Layer authority as durable tasks, and validates it, with the data-release Secret alone. A rerun resumes the release. A third Job stops the deploy when the active release has live changes |
| E     | Application rollout    | Loads deployment configuration and starts the new pod; blue/green traffic switches when it is Ready                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| F     | Readiness              | Engine API, Object Layer authority                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| G     | Promotion              | Promote the release, wait until the runtime serves it and the game server is ready, then prune the databases and the release store                                                                                                                                                                                                                                                                                                                                                                                                                  |

Stage B refuses a `:latest` image unless `ALLOW_LATEST_IMAGE=1`.

Set `SKIP_CONTENT_RELEASE=1` to deploy the runtimes only. The content candidate of Stage D and Stage G do not run; the index sync still runs. The new pod serves the release that is already active.

A live change is a change to the active release that its build does not hold
([Live changes](../explanation/content-releases.md#live-changes)). The promotion stops serving it, so
Stage D stops the deploy before the rollout and names the changed content.
[Export the live content](#export-the-live-content) to keep the changes. Set `DISCARD_LIVE_CHANGES=1`
to promote and stop serving them.

`REPLICAS` sets the pod count of each colour (default `1`). Stage E and a switch back render this count.

## Export the live content

`cyberia content-release export-live` turns the content production serves into `cyberia-content`
source. It reads a **production content baseline**: a capture of the active release in the object
store. Git never carries the database.

On the production control host:

1. Capture a baseline. The capture reads the active release database, the File documents its content
   references, the ledger row of the release and the CIDs player stacks hold. It reads no player
   profile, no session and no credential. The member names of the replica set resolve only in the
   cluster, so the capture opens a `kubectl port-forward` to the primary for its run and closes it:

   ```bash
   node bin/cyberia content-baseline capture
   node bin/cyberia content-baseline verify
   ```

On the development host:

2. List the baselines, then restore the one to review. The restore downloads and verifies it, and
   refuses the replica set it was captured from:

   ```bash
   node bin/cyberia content-baseline list --dev
   node bin/cyberia content-baseline restore <baseline-id> --dev --confirm <baseline-id>
   ```

3. Bootstrap the workspace when the host has none, then preview the export and write it:

   ```bash
   node bin/cyberia run-workflow import-content --clean --confirm dd-cyberia --dev
   node bin/cyberia content-release export-live --baseline <baseline-id> --dev
   node bin/cyberia content-release export-live --baseline <baseline-id> --apply --dev
   ```

4. Review `git diff` in `cyberia-content`, run its tests, and commit. Put the `Baseline:` line the
   export prints in the commit message: it records the provenance of the change.
5. Build, lock and publish the source release: `cyberia release build --commit`,
   `cyberia release lock --commit`, `cyberia release publish --private`.
6. Deploy with `DISCARD_LIVE_CHANGES=1`. The live changes are now source, but the guard compares the
   release with its build, so it still names them. The promotion records the discard in the audit
   trail of both releases.

### Consistency of a baseline

The capture reads the `dbHash` of the release database on the primary before and after every
stream. Equal hashes prove that no content write landed in the window; the Files and the owned CIDs
are read inside the same window. A capture that sees a write fails, records the failure, and
captures again (`--attempts`, 3 by default). The manifest records both hashes.

### What the export does

The export restores the release database of the baseline into a scratch release database,
`<content partition>-capture-<baseline-id>`. It then imports the absent content of the content
artifact: the documents a newer schema adds, such as economies and markets. A document production
holds stays as production holds it. Every check of `content-release validate` runs, except the
canonical check, because nothing is published. Each world is exported into a temporary directory.

The scratch copy then takes the global content production must keep: each definition an item
binding or a player stack names that no exported world snapshot and no artifact composition
carries. The CIDs players own come from the baseline. A definition the copy lacks is imported from
the Object Layer authority, with its render from IPFS, by the checks of an import. The export prints
each definition it adds and why, each one it cannot resolve, and how many published definitions
nothing keeps; those stay out.

The change of each world and of `global/` against `cyberia-content` is printed. `--apply` replaces
the instance directories and `src/content/global/`, and refuses while one of them has uncommitted
changes. A second run with no change in production writes the same files. The scratch database and
its map registry rows are removed at the end. Nothing is committed or published automatically.

### Baseline lifecycle

| Command                                   | Where            | What it does                                                           |
| ----------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `content-baseline capture`                | control host     | Captures the active release; `failed` when it cannot prove consistency |
| `content-baseline list`                   | any              | `available`, `failed` or `incomplete`, size, verified                  |
| `content-baseline inspect [id]`           | any              | Release, source revision, consistency, scope, streams, verifications   |
| `content-baseline verify [id]`            | any              | Reads every part, checks the archive inventory, records the result     |
| `content-baseline download [id]`          | development host | Downloads and verifies into `~/.cache/underpost/content-baselines`     |
| `content-baseline restore <id> --confirm` | development host | Restores the release database, its Files and its ledger row            |
| `content-baseline prune [--dry-run]`      | any              | Removes baselines beyond `--keep` (5) and failed captures              |

A baseline is a backup of the `content-baseline` profile: the format, the seal, retention and
verification are those of [DB and Backup Management](../../nexodev/how-to/manage-databases-and-backups.md).
The capture runs its dump in a client pod, never in the `mongod` container.

## Failure and revert

A failure from Stage E until the game server is ready in Stage G restores what served before the
deploy, in this order:

1. The content release this deploy promoted is rolled back: `content-release rollback --from <id>`,
   which does nothing unless that release is the active one.
2. Traffic returns to the colour that served before:
   `underpost run promote <deploy-id> --traffic <colour>`, which only routes to a colour that is
   deployed and Ready.

A rollback brings back a release this deployment served before, even one that was not built from an
exact source revision. A failure after the commit point, in prune, fails the deploy and leaves the
new release serving. The cache follows the served data: each bound release database
has its own cache keys, so a rollback reads the values of the release it restores.

## Source channels

`CYBERIA_SOURCE_CHANNEL` selects the repository every source is fetched from; the stages are the
same on both channels.

| `CYBERIA_SOURCE_CHANNEL` | Engine                | Product repositories |
| ------------------------ | --------------------- | -------------------- |
| `private` (default)      | `engine-test-cyberia` | `<name>-private`     |
| `public`                 | `engine-cyberia`      | `<name>`             |

A release from the private channel serves production like any other. The deploy only reads from
the channel: it never pushes to a repository. To publish to the public repositories, run
[`cyberia release publish`](../reference/cyberia-cli.md#cyberia-release--product-repositories) by hand.

A deploy ships the revisions `underpost.lock.json` of the deployment checkout pins, as it is:
nothing in the deploy writes the lock. To ship a change, run `cyberia release lock --commit` and
publish the deployment. A content release id is the same from either channel, so the same revision
is one release.

The CD workflow `engine-cyberia.cd.yml` takes the channel and `REPLICAS` as inputs and runs in the
`production` environment, one run at a time. Set its protection rules in the repository settings.

## Release commands on the live deployment

`deploy/dd-cyberia/content-release.sh <status | validate <id> | live-changes | promote <id> [--discard-live-changes] | rollback | retire | prune>`
runs one release command in a Release Job, on the image the live colour serves, with the
data-release Secret alone. Kubernetes removes the Job a day after it ends.

## Player commands on the live deployment

`deploy/dd-cyberia/player.sh player <command> [args]` runs a player command in a Release Job.
It uses the live engine image and the data-release Secret.
Use `held` to inspect held stacks and `rebind-held` to update their definition bindings.
The Job log streams to the terminal.

## Game server and client images

`deploy/cyberia-server/deploy.sh` and `deploy/cyberia-client/deploy.sh` release their instance as a
container release, on the same `CYBERIA_SOURCE_CHANNEL`, from the revision the deployment lock pins.
The public channel runs the `latest` image CI pushed; the private channel builds it on the node from
the checkout at that revision. Either way the instance runs the image by digest. `REPLICAS` sets the
pod count of the instance (default `1`), and the CD workflows `cyberia-server.cd.yml` and
`cyberia-client.cd.yml` take it as an input. The game server scales by world, not by replica: see the
topology below.

## Game server topology

`cyberia-server` holds the authoritative world in memory: one Deployment per
[release instance](./run-the-docker-stack-locally.md#release-instances) (`/`, `/test`). Each replica
runs its own copy of the world, and each process reports itself to the
[server registry](../explanation/server-registry.md) under its own id. The registry groups the
replicas of one Deployment into one logical endpoint, so `/` and `/test` show as two worlds.

| Event                   | Behaviour                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start                   | Readiness answers 503 until the world is loaded; the server then reports to the registry                                                                                             |
| Content promotion       | The engine hot-reloads one replica of each logical endpoint; the other replicas follow with their reload loop; players stay connected                                                |
| Replacement (`SIGTERM`) | The server refuses new sessions, reports `draining`, readiness turns 503, connected players get `CYBERIA_DRAIN_TIMEOUT_SEC` (25 s, inside the 30 s grace period), then it shuts down |
| Registry                | A world takes new sessions while one of its replicas is ready; a process that stops reporting expires after 60 s                                                                     |

A guest on a draining server reconnects to a ready replica of the same public URL. An account player gets
`session_end {reason: "server_restart"}`, and the drain commits its final state and releases the
lease. The client then resumes on the new server with its resume ticket, without the portal
([resume](../explanation/accounts-and-persistence.md#resume-after-a-dropped-connection)).
The portal and the engine API are stateless and follow the blue/green rollout of Stage E.

## Verification

| Tier                  | Command                                        | Covers                                                                                                                                                                           |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underpost:audit`     | `npx vitest run --project underpost:audit`     | Runtime dependency closure. It runs alone, and it tells host saturation from an application defect                                                                               |
| `cyberia:unit`        | `npx vitest run --project cyberia:unit`        | Validation checks, publication, pruning, deploy script order                                                                                                                     |
| `ecosystem:contract`  | `npx vitest run --project ecosystem:contract`  | Single writer, API extensions, local domain addresses, module boundaries                                                                                                         |
| `cyberia:integration` | `npx vitest run --project cyberia:integration` | A real MongoDB replica set: the runtime index sync, build, validate, promote, roll back, prune, restart, concurrent promotion, runtime isolation, one data source for every role |

`cyberia:integration` starts `mongod` as a one-member replica set through `test/support/mongod.js`.
It needs MongoDB 5.0 or later: `UNDERPOST_MONGOD_BIN`, or `mongod` on PATH. Without one the project
reports those tests as skipped, never as passed. It needs no container and no credentials: the suite
clears `DB_USER`, `DB_PASSWORD` and `DB_AUTH_SOURCE`.

```bash
UNDERPOST_MONGOD_BIN=/path/to/mongod npx vitest run --project cyberia:integration
```
