# Deploy a Cyberia release

The deploy procedure: what a bootstrap does, what a normal deploy does, the stages it runs
through, the game server topology it lands on, and how to verify the result.

## Bootstrap and normal deploys

| Operation                      | Bootstrap (explicit, `--confirm <deploy-id>`)        | Normal deploy                    |
| ------------------------------ | ---------------------------------------------------- | -------------------------------- |
| Create databases, indexes      | yes                                                  | idempotent only                  |
| Seed or import content         | yes                                                  | into a new release database only |
| `cyberia ol --drop`            | yes                                                  | never                            |
| `cyberia run-workflow drop-db` | yes; keeps quest progress unless `--include-runtime` | never                            |
| `cyberia instance --drop`      | yes                                                  | never                            |
| Touch player or runtime state  | only with `--include-runtime`                        | never                            |

The first deploy on the release layout has no active release: the new pod serves the workspace
until Stage G promotes the first validated release. The content collections a runtime database
held before the layout stay where they are and are no longer read.

## Deploy stages

`deploy/dd-cyberia/sync-deploy.sh` runs these stages in order. A failing stage stops the deploy.
The deploy runs no tests: CI tests the source, and the source carries its coverage reports in `docs/coverage/`.
Nothing before Stage E changes what players see: a candidate that fails stops the deploy before it.

| Stage | Name                   | Content                                                                                                                                  |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Source synchronization | Every product repository from one source channel: the deployment at its branch tip, every other at the revision the deployment lock pins |
| B     | Immutable artifacts    | Catalog install, release id `v<version>-<commit>-<content revision>`, image `engine-cyberia:v<version>`                                  |
| C     | Configuration          | `app load`, `validate-domains`, manifests, client bundle, private conf                                                                   |
| D     | Content candidate      | The host prepares the locked revision; a Release Job builds it, imports the foundation then each instance, and validates it, with the data-release Secret alone |
| E     | Application rollout    | Idempotent migrations in the new pod; blue/green: the new colour takes traffic once Ready and serves the release already active          |
| F     | Readiness              | Engine API, Object Layer authority                                                                                                       |
| G     | Promotion              | Promote the release, wait until the runtime serves it and the game server is ready, then prune the databases and the release store       |
| H     | Mirror                 | Private channel only: the revision of each data-release and source-sync checkout, fast-forward to the public repositories                |

Stage B refuses a `:latest` image unless `ALLOW_LATEST_IMAGE=1`.

## Failure and revert

A failure from Stage E until the game server is ready in Stage G restores what served before the
deploy, in this order:

1. The content release this deploy promoted is rolled back: `content-release rollback --from <id>`,
   which does nothing unless that release is the active one.
2. Traffic returns to the colour that served before:
   `underpost run promote <deploy-id> --traffic <colour>`, which only routes to a colour that is
   deployed and Ready.

A rollback brings back a release this deployment served before, even one that was not built from an
exact source revision. A failure after the commit point, in prune or in the mirror, fails the deploy
and leaves the new release serving. The cache follows the served data: each bound release database
has its own cache keys, so a rollback reads the values of the release it restores.

## Source channels

`CYBERIA_SOURCE_CHANNEL` selects the repository every source is fetched from; the stages are the
same on both channels.

| `CYBERIA_SOURCE_CHANNEL` | Engine                | Product repositories |
| ------------------------ | --------------------- | -------------------- |
| `private` (default)      | `engine-test-cyberia` | `<name>-private`     |
| `public`                 | `engine-cyberia`      | `<name>`             |

A release from the private channel serves production like any other. Once it serves, Stage H
publishes its exact revisions to the public repositories: the public branch only moves forward,
and nothing is rebuilt. A failed mirror fails the deploy and leaves the release serving.

A deploy ships the revisions `underpost.lock.json` of the deployment checkout pins, as it is:
nothing in the deploy writes the lock. To ship a change, run `cyberia release lock --commit` and
publish the deployment. A content release id is the same from either channel, so the same revision
is one release.

The CD workflow `engine-cyberia.cd.yml` takes the channel as an input and runs in the `production`
environment, one run at a time. Set its protection rules in the repository settings.

## Release commands on the live deployment

`deploy/dd-cyberia/content-release.sh <status | validate <id> | promote <id> | rollback | retire | prune>`
runs one release command in a Release Job, on the image the live colour serves, with the
data-release Secret alone. Kubernetes removes the Job a day after it ends.

## Game server and client images

`deploy/cyberia-server/deploy.sh` and `deploy/cyberia-client/deploy.sh` release their instance as a
container release, on the same `CYBERIA_SOURCE_CHANNEL`, from the revision the deployment lock pins.
The public channel runs the image CI built for that revision (`sha-<revision>`); the private channel
builds it on the node from the checkout at that revision. Either way the instance runs the image by digest, and a private release
then mirrors its revision to the public repository.

## Game server topology

`cyberia-server` holds the authoritative world in memory, so it scales by world, not by replica:
one Deployment per [release instance](./run-the-docker-stack-locally.md#release-instances)
(`/`, `/test`), each reporting itself to the `cyberia-server-registry`.

| Event                   | Behaviour                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start                   | Readiness answers 503 until the world is loaded; the server then reports to the registry                                                                                             |
| Content promotion       | The engine hot-reloads every registered server; players stay connected                                                                                                               |
| Replacement (`SIGTERM`) | The server refuses new sessions, reports `draining`, readiness turns 503, connected players get `CYBERIA_DRAIN_TIMEOUT_SEC` (25 s, inside the 30 s grace period), then it shuts down |
| Registry                | Offers only servers that report and do not drain; a silent server expires after 180 s                                                                                                |

A player on a draining server reconnects through the registry to the new one. The portal and the
engine API are stateless and follow the blue/green rollout of Stage E.

## Verification

| Tier            | Command                                  | Covers                                                                                                                                                                        |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underpost:audit`     | `npx vitest run --project underpost:audit`     | Runtime dependency closure. It runs alone, and it tells host saturation from an application defect                                                                            |
| `cyberia:unit`        | `npx vitest run --project cyberia:unit`        | Validation checks, publication, pruning, deploy script order                                                                                                                  |
| `ecosystem:contract`  | `npx vitest run --project ecosystem:contract`  | Single writer, API extensions, local domain addresses, module boundaries                                                                                                      |
| `cyberia:integration` | `npx vitest run --project cyberia:integration` | A real MongoDB replica set: indexes, migrations, build, validate, promote, roll back, prune, restart, concurrent promotion, runtime isolation, one data source for every role |

`cyberia:integration` starts `mongod` as a one-member replica set through `test/support/mongod.js`.
It needs MongoDB 5.0 or later: `UNDERPOST_MONGOD_BIN`, or `mongod` on PATH. Without one the project
reports those tests as skipped, never as passed. It needs no container and no credentials: the suite
clears `DB_USER`, `DB_PASSWORD` and `DB_AUTH_SOURCE`.

```bash
UNDERPOST_MONGOD_BIN=/path/to/mongod npx vitest run --project cyberia:integration
```
