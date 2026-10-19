# Server registry

The server registry is the list of the live game server processes and the worlds they serve. Each
process reports itself; discovery groups the replicas of one deployment into one logical endpoint.
The registry names what serves a world now. It owns no world, no universe, no profile and no
content.

---

## Reports

Each game server process reports to `POST /api/v1/cyberia-server-registry` at startup and every 20
seconds:

| Field          | Source                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| `serverId`     | The process: the host name and a random suffix. A restart is a new process |
| `url`          | `CYBERIA_PUBLIC_URL`: the public origin and the base path of the world     |
| `instanceCode` | `INSTANCE_CODE`                                                            |
| `name`         | The name of the loaded instance                                            |
| `state`        | `ready`, or `draining` once the process stops taking sessions              |
| `seq`          | The number of the report in this process; it only rises                    |
| `build`        | A digest of the binary of the process: replicas of one build share it      |
| `releaseId`    | The content release its world was last built from; empty for the workspace |

The engine upserts the document of `serverId` only above its stored `seq`. A report that arrives late
answers `stale` and changes nothing, so a ready report still in flight never undoes a draining one.
A document expires 60 seconds after its last report (a TTL index on `lastSeen`); every read also
skips a document past that age.

`instance-build-manifest` writes `CYBERIA_PUBLIC_URL` to the server env from the deploy conf:
`https://server.cyberiaonline.com` for `/` and `https://server.cyberiaonline.com/test` for `/test` in
production. A process without it, or without `CYBERIA_SERVER_API_KEY`, stays off the registry.

### Validation and security

- The route guard checks `CYBERIA_SERVER_API_KEY` in constant time and fails closed. A client never
  holds the key.
- `url` is an https origin with an optional one-segment base path. The engine refuses credentials, a
  query, a fragment, a nested path, an IP literal, a single-label name and a cluster name
  (`.svc`, `.cluster.local`, `.local`, `.internal`). Outside production a loopback http origin
  passes, for the local stack.
- The engine dials registry endpoints only for a hot reload, and only these validated public URLs.
  Studio has no free-text server URL.
- Field lengths are capped, and the platform rate limit covers the route.

---

## Replicas and logical endpoints

Replicas of one deployment report one `url` and keep one document each. Discovery groups the live
processes by world and `url`:

| Live processes behind the endpoint | Status      | Takes new sessions |
| ---------------------------------- | ----------- | ------------------ |
| At least one `ready`               | `available` | Yes                |
| Only `draining`                    | `draining`  | No                 |
| None                               | absent      | No                 |

An endpoint also names its `build` when every live process behind it runs one, else `''`, and lists
the `releases` its processes serve. One release in that list means the replicas converged on it;
several mean a promotion still spreads (see [content releases](content-releases.md#serving-a-release)).

So `/` and `/test` show as two logical worlds whatever the replica count. A replica that restarts or
drains changes only its own document; the deployment stays available while another replica is
ready. The ticket endpoint issues a launch only for a world with an `available` endpoint
(`503` otherwise), so a draining endpoint is never offered for a new session.

---

## Reads

| Endpoint                                      | Access    | Answer                                                                          |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `GET /api/v1/cyberia-server-registry`         | Public    | Logical endpoints: `instanceCode`, `url`, `name`, `status`, `ready`, `draining` |
| `GET /api/v1/cyberia-server-registry/servers` | Moderator | Every live process with its `serverId`, `state`, `seq` and times                |
| `GET /api/v1/cyberia-universe/instance/:code` | Public    | The universe of a world, with the best endpoint of each member                  |

The public reads hold no process name and no internal address.

---

## Hot reload

`reloadContentServers` triggers one hot reload per logical endpoint, at its public URL. The trigger
reaches one replica of the endpoint; the other replicas follow with their reload loop
(`ENGINE_GRPC_RELOAD_INTERVAL_SEC`). The instance editor triggers the endpoints of its instance and
shows the outcome of each one.

---

## Tests

| Test                                                 | What it proves                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `test/cyberia/unit/server-registry.test.js`          | The public endpoint validation                                                               |
| `test/cyberia/integration/universe-registry.test.js` | Idempotent reports, late reports, replicas, drain, expiry, the guarded route                 |
| `cyberia-server/engine_client/registry_test.go`      | Ready then draining reports with rising sequence numbers, and no report without a URL or key |
