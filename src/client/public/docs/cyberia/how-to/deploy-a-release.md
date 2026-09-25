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

The first deploy on the release layout has no active release: `content-release build --bootstrap`
promotes the first validated release so the new pod never serves an empty world. The content
collections a runtime database held before the layout stay where they are and are no longer read.

## Deploy stages

`deploy/dd-cyberia/sync-deploy.sh` runs these stages in order. A failing stage stops the deploy.
The deploy runs no tests: CI tests the source, and the source carries its coverage reports in `docs/coverage/`.
Nothing before Stage H changes what players see, except on a first deploy: there `--bootstrap`
promotes in Stage G, because no release serves yet.

| Stage | Name                   | Content                                                                                                                                                    |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Source synchronization | Engine, `cyberia-server`, `cyberia-client`, public asset repositories                                                                                      |
| B     | Immutable artifacts    | Catalog install, release id `v<version>-<commit>`, image `engine-cyberia:v<version>`; a `:latest` image is refused unless `ALLOW_LATEST_IMAGE=1`           |
| C     | Configuration          | `app load`, `validate-domains`, manifests, client bundle, private conf                                                                                     |
| D     | Migrations             | Idempotent only (`db --migrate-stable-slugs`), in the new pod before the application starts                                                                |
| E     | Application rollout    | Blue/green: the new colour takes traffic only once Ready and serves the release already active; the live colour keeps serving until then                   |
| F     | Readiness              | Engine API, Object Layer authority                                                                                                                         |
| G     | Content candidate      | `content-release build --bootstrap` through the new pod: the version that will serve the release validates it, against an authority that runs this version |
| H     | Promotion              | Promote the release, wait until the runtime serves it and the game server is ready, prune                                                                  |

`deploy/dd-cyberia/content-release.sh <status | validate <id> | promote <id> | rollback | prune>`
runs the same release commands against the live pod.
A serving pod holds no private conf. Each release command clones it, runs, and removes it on exit,
whatever the result.

## Game server topology

`cyberia-server` holds the authoritative world in memory, so it scales by world, not by replica:
one Deployment per instance variant in `conf.instances.json` (`/`, `/FOREST`, `/TEST`), each
reporting itself to the `cyberia-server-registry`.

| Event                   | Behaviour                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start                   | Readiness answers 503 until the world is loaded; the server then reports to the registry                                                                                             |
| Content promotion       | The engine hot-reloads every registered server; players stay connected                                                                                                               |
| Replacement (`SIGTERM`) | The server refuses new sessions, reports `draining`, readiness turns 503, connected players get `CYBERIA_DRAIN_TIMEOUT_SEC` (25 s, inside the 30 s grace period), then it shuts down |
| Registry                | Offers only servers that report and do not drain; a silent server expires after 180 s                                                                                                |

A player on a draining server reconnects through the registry to the new one. The portal and the
engine API are stateless and follow the blue/green rollout of Stage E.

## Verification

| Tier            | Command                                  | Covers                                                                                                                                        |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `underpost:audit`     | `npx vitest run --project underpost:audit`     | Runtime dependency closure. It runs alone, and it tells host saturation from an application defect                                            |
| `cyberia:unit`        | `npx vitest run --project cyberia:unit`        | Validation checks, publication, pruning, deploy script order                                                                                  |
| `ecosystem:contract`  | `npx vitest run --project ecosystem:contract`  | Single writer, content views, API extensions, local domain addresses, module boundaries                                                       |
| `cyberia:integration` | `npx vitest run --project cyberia:integration` | A real MongoDB replica set: indexes, migrations, build, validate, promote, roll back, prune, restart, concurrent promotion, runtime isolation |

`cyberia:integration` starts `mongod` as a one-member replica set through `test/support/mongod.js`.
It needs MongoDB 5.0 or later: `UNDERPOST_MONGOD_BIN`, or `mongod` on PATH. Without one the project
reports those tests as skipped, never as passed. It needs no container and no credentials: the suite
clears `DB_USER`, `DB_PASSWORD` and `DB_AUTH_SOURCE`.

```bash
UNDERPOST_MONGOD_BIN=/path/to/mongod npx vitest run --project cyberia:integration
```
