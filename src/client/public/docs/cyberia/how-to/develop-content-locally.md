# Cyberia Local Content Development

How a developer creates, imports, edits, validates and tests Cyberia content on one machine.
[Content releases](../explanation/content-releases.md) holds the content model and the production stages. This
guide does not change them. It shows how to use them locally, and how to work without them.

---

## Two modes

| Mode              | Content the runtime serves | When                                   |
| ----------------- | -------------------------- | -------------------------------------- |
| Fast development  | The workspace database     | Every day. No release is active        |
| Release rehearsal | A promoted local release   | Before a production release, on demand |

```
FAST DEVELOPMENT                        RELEASE REHEARSAL

create / edit                           workspace
    ↓                                       ↓
workspace  ◀──┐                         build candidate (--from workspace)
    ↓         │                             ↓
load / test   │                         validate (the build does it)
    ↓         │                             ↓
modify ───────┘                         promote → active local release → test
                                            ↓
                                        rollback, or retire → the workspace serves again
```

The workspace is mutable. A release is immutable after its build. Promotion is the only step that
changes what the runtime serves, and it is always an explicit command.

## What runs

### Local infrastructure

`engine-private/conf/dd-cyberia/.env.development` names the services the engine reaches:

| Service                   | Address                  | Variable                         |
| ------------------------- | ------------------------ | -------------------------------- |
| MongoDB replica set `rs0` | `127.0.0.1:27017`        | `DB_HOST`, `DB_REPLICA_SET`      |
| Valkey                    | `127.0.0.1:6379`         | `VALKEY_HOST`, `VALKEY_PORT`     |
| IPFS API and IPFS Cluster | `127.0.0.1:5001`, `9094` | `IPFS_API_URL`, `IPFS_CLUSTER_…` |

The development cluster provides them at those addresses, with the gateway, TLS and the
`/etc/hosts` entries ([Bringing up the full stack locally](../reference/cyberia-cli.md#bringing-up-the-full-stack-locally)):

```bash
node bin run cluster --deploy-id dd-cyberia --dev
```

The Compose stack of `engine-private/conf/dd-cyberia/docker-compose/cyberia` is the container
alternative. It publishes Valkey on host port `32079`, so set `VALKEY_PORT` to match:

```bash
node bin docker-compose --deploy-id dd-cyberia --docker-compose-id cyberia --up
```

It serves the same domains on the same ports as the development engine below: one engine
container publishes the whole block (`ENGINE_CYBERIA_PORT_RANGE`), so `http://localhost:4017`
is the Object Layer authority there as well. Its nginx also answers each domain by name —
`http://objectlayer.org/` — for the browser and for every container, which is what
`node bin/cyberia run-workflow docker:up` maintains the `/etc/hosts` block for. The Cyberia
data plane (the WASM client's `/api/` and `/assets/`, the game server's `engine-cyberia`) is
answered by `www.cyberiaonline.com`, the host that owns the Cyberia APIs.

The replica set is required: content promotion runs in a transaction.

### Development engine

```bash
npm run dev dd-cyberia
```

The engine builds the clients, then starts one runtime per host of `conf.server.json`. The
`Runtime network` log names the local port of each host:

| Host                    | Local address    | Serves                                               |
| ----------------------- | ---------------- | ---------------------------------------------------- |
| `www.cyberiaonline.com` | `localhost:4008` | Portal, Studio, content and runtime APIs, gRPC 50051 |
| `objectlayer.org`       | `localhost:4017` | The Object Layer authority                           |
| `itemledger.com`        | `localhost:4014` | ItemLedger                                           |
| `cryptokoyn.net`        | `localhost:4011` | CKY finance, wallet UI                               |
| `underpost.net`         | `localhost:4005` | Journal                                              |

A development build addresses every other domain on its local port. The `apiHosts` of a client
(`conf.client.json`) name the owner domain; the build resolves each owner to `localhost:<port>`
through the same port map the proxy routes by. No development request reaches a public origin.
The runtime accepts those local origins, and the same hosts over plain HTTP through the dev proxy
(`npm run dev:proxy dd-cyberia`, with `/etc/hosts` entries).

The engine side resolves the same way: with no `OBJECT_LAYER_API_ORIGIN`, a cross-domain call
goes to the owner host of this deploy on its local port. Every API path is `/api/v1/<api>`.

### Verify the local domain services

```bash
curl http://localhost:4017/api/v1/object-layer?limit=1              # the authority answers
curl http://localhost:4008/api/v1/cyberia-content-release/active    # what the runtime serves
node bin/cyberia content-release status --dev                    # the release ledger
```

`/active` answers `"serving": false` and the workspace database while no release is active. That
is fast development mode.

### Game server and client

```bash
cd cyberia-server && go build -o cyberia-server ./cmd/cyberia-server
CYBERIA_SERVER_API_KEY=<the key of .env.development> \
ENGINE_GRPC_RELOAD_INTERVAL_SEC=10 INSTANCE_CODE=FOREST SERVER_PORT=8081 \
./cyberia-server --data-server-url http://localhost:4008 --data-server-grpc localhost:50051 \
  --game-server-public-url http://localhost:8081
```

The server loads the instance over gRPC from what the engine serves, reports itself to the server
registry, and accepts the engine's hot-reload trigger. `ENGINE_GRPC_RELOAD_INTERVAL_SEC` makes it
poll the Object Layer manifest, so a definition changed in the workspace reaches the running world
without a restart. The WASM client runs with `wasm-driver.py --data-server-url=http://localhost:4008`
([Cyberia client](../explanation/game-client.md)).

## Daily development

1. Start the local infrastructure.
2. Start the engine: `npm run dev dd-cyberia`.
3. Verify the local domain services (above).
4. Import or create the instance:

   ```bash
   node bin/cyberia instance FOREST --import --dev
   ```

   The source is `engine-private/cyberia-instances/FOREST`. The import upserts into the workspace
   and keeps the documents' ids. Each Object Layer of the backup is published at the local
   authority: the canonical definition lands in the `objectlayer` database, the workspace keeps a
   `cache` copy and the `itemId → olCid` binding. Nothing is dropped first. The import is not a
   release and promotes nothing.

5. Create or update Object Layers. Use the Studio at `http://localhost:4008/object-layer-engine`
   (sign in as a moderator), or the CLI: `node bin/cyberia ol <item-id> --from-directory --import --dev`.
   Both write through the same path: draft → the local authority → `olCid` → cache copy. The
   authority is the only writer of published definitions. A Cyberia database never holds an
   authoritative one.

6. Bind `itemId → olCid`. A Studio or CLI write binds the label to the definition it published.
   To bind a label to a definition the authority already holds:

   ```
   POST http://localhost:4008/api/v1/cyberia-item-catalog  { "itemId": "hatchet", "objectLayerCid": "bafkrei…" }
   ```

   The catalog is an alias table. Quests and actions pin the `objectLayerCid` they mean; a rebind
   of the label never moves a pinned reference.

7. Load the instance. The runtime serves the workspace, so a game server started as shown above
   runs the content as it is. With the poll interval set, it follows each change.
8. Validate:

   ```bash
   node bin/cyberia content-release validate --dev
   ```

   With no release named, every check runs on the workspace: catalog bindings, canonical CIDs at
   the authority, pinned references, map labels, atlas renders, instance conf and maps, schemas.
   Each finding names the missing or invalid dependency.

9. Test in the client, the Studio or the server dashboard.
10. Modify and go back to step 5. Nothing has to be built or promoted.

A restart of the engine changes no data. Startup never drops a database, never re-imports an
instance, never reseeds the workspace and never promotes a release.

## Release rehearsal

Run the production content lifecycle against the local runtime when a change must be checked as a
release.

```bash
node bin/cyberia content-release build local-1 --from workspace --dev   # copy, publish, validate
node bin/cyberia content-release promote local-1 --dev                  # serve it
node bin/cyberia content-release status --dev
node bin/cyberia content-release rollback --dev                         # the release before it
node bin/cyberia content-release retire --dev                           # the workspace serves again
node bin/cyberia content-release prune --keep 0 --dev                   # drop retired databases
```

| Command                       | Effect                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build <id> --from workspace` | Copies the workspace into `<DB_NAME_CYBERIA_CONTENT>-<id>`, drafts left out; publishes what is not yet at the authority; validates                |
| `promote <id>`                | One transaction: the active release retires, `<id>` turns active. The running engine follows within 15 s and reloads every registered game server |
| `rollback`                    | Promotes the release that was active before the current one                                                                                       |
| `retire`                      | Retires the active release with no successor. The runtime serves the workspace again; `rollback` re-promotes the release                          |
| `prune --keep <n>`            | Drops the databases of retired releases beyond `n`. The active release and the rollback target always stay                                        |

While a release is active, Studio edits go to the workspace and the game server keeps the release.
That is the point of the rehearsal. To continue daily work, run `retire`.

A release id is lower-case letters, digits and dashes. Production uses `v<version>-<commit>` with
dashes for dots, such as `v3-4-0-8b4d643`. A local id such as `local-1` never collides with it.

## Reset

Each reset is a separate command, needs `--confirm dd-cyberia`, and is never part of startup or of
a deploy.

| Command                                                              | Removes                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `node bin/cyberia instance FOREST --drop --confirm dd-cyberia --dev` | Every workspace document of that instance                              |
| `node bin/cyberia run-workflow drop-db --confirm dd-cyberia --dev`   | Every content collection of the workspace and the files they reference |
| `… drop-db --include-runtime …`                                      | Also player quest progress. Off by default                             |
| `node bin/cyberia ol --drop --confirm dd-cyberia --dev`              | Object Layer documents and their atlas assets                          |
| `node bin/cyberia content-release prune --keep 0 --dev`              | Retired release databases, except the rollback target                  |

Reimport after a reset with the same import command. A canonical definition at the authority is
never removed by a Cyberia reset: the next import finds it there and keeps its `olCid`.

## Cache

Every host keeps what it serves in Valkey through the platform cache; MongoDB stays the source
of truth. Keys start with `cache:<NODE_ENV>:<host><path>:`, so development values never mix
with production values on a shared Valkey, and every host of the deploy has its own.

| Value                                           | Policy                  | Invalidated by                                  |
| ----------------------------------------------- | ----------------------- | ----------------------------------------------- |
| Object Layer lists and definitions by key       | 5 min                   | Publication, lifecycle, delete, catalog binding |
| The render File an item label resolves to       | 5 min                   | The same writes, and every atlas write          |
| Cyberia instance and map lists, one by code     | 30 s                    | Every write to the instance or the map          |
| Client hints by instance code                   | 30 s                    | Expiry                                          |
| Render, metadata, upscaled render, idle preview | For good, by render cid | Never: a cid names one content                  |
| Render File bytes                               | For good, by File id    | Never: a File id names its bytes                |

A write over the API invalidates its namespace at once. A CLI import writes MongoDB directly, so
a value it changed stays in the cache until it expires, or until:

```
node bin/cyberia cache clear --dev
```

It removes every cached value of this host in this environment and touches no database. The
Valkey server runs with `--maxmemory 256mb --maxmemory-policy allkeys-lru` (compose and the
Kubernetes StatefulSet): every key is a cache entry or a TTL-bound session, so eviction is safe.

## Dependency failures

A content dependency that fails never reads as valid empty content.

| Answer                    | Meaning                          | Where it shows                                                                                          |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `200` with `[]`           | Valid, empty                     | An empty grid, an empty manifest                                                                        |
| `404`                     | The definition does not exist    | `resolveObjectLayer` answers `null`; validation: `<cid>: unknown to the Object Layer authority`         |
| `503`, other `5xx`        | The dependency is unavailable    | A write: `Object Layer <cid> is kept as a draft: … answered 503`; validation: `<cid>: … answered 503`   |
| No connection             | Local routing or service failure | The same messages with `fetch failed`; in the browser, a grid overlay and a notification naming the URL |
| Wrong CID for the content | Reference or content defect      | `cacheCanonical` refuses; validation: `<cid>: content hashes to …`                                      |

In the browser, a service answer that is not JSON is reported with its URL and status, and the
management grids show the failure in place of rows.

## Local and production

| Step       | Local                                              | Production (`deploy/dd-cyberia/sync-deploy.sh`)       |
| ---------- | -------------------------------------------------- | ----------------------------------------------------- |
| Source     | Workspace, edited in place                         | Instance backups, or the workspace                    |
| Candidate  | `content-release build local-<n> --from workspace` | `content-release build <version>-<commit>` in the pod |
| Validation | The build, or `content-release validate`           | The build; the deploy stops on a failure              |
| Promotion  | `promote`, by hand                                 | Stage H, after readiness                              |
| Back       | `rollback` or `retire`                             | `deploy/dd-cyberia/content-release.sh rollback`       |

The two never share a database, an authority or a release id.
