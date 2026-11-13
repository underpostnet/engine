# Path Routes

A path route sends chosen paths of one host to the workload of another host of the same deploy. The
path is preserved: the destination serves the request at the URL the visitor asked for, and the
address bar keeps the host the visitor typed. A [redirect route](#redirect-routes) sends the browser
to the destination host instead. A host declares its path routes in `pathRoutes` of its
`conf.server.json` entry.

## Declaration

```json
{
  "client": "cyberia-public",
  "pathRoutes": [
    {
      "id": "portal-views",
      "match": { "kind": "client-views", "exclude": ["/", "/test"] },
      "destination": { "host": "services.cyberiaonline.com" }
    },
    {
      "id": "portal-api",
      "match": { "kind": "client-apis", "include": ["cyberia-game-ticket"] },
      "destination": { "host": "services.cyberiaonline.com" }
    },
    { "id": "portal-socket", "match": { "kind": "ws" }, "destination": { "host": "services.cyberiaonline.com" } }
  ]
}
```

| Field              | Required | Value                                                                                     |
| ------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `id`               | Yes      | Lowercase letters, digits and hyphens. Unique on the host path.                           |
| `match.kind`       | Yes      | One of the kinds below.                                                                   |
| `match.path`       | Kind     | An absolute path for `Exact` and `PathPrefix`, without a trailing slash or a dot segment. |
| `match.exclude`    | No       | Paths a `client-*` selector must leave out.                                               |
| `match.include`    | No       | API ids a `client-apis` selector adds, such as an API an SSR view calls.                  |
| `destination.host` | Yes      | A host of the same `conf.server.json`.                                                    |
| `destination.path` | No       | The key of the destination entry under that host, `/` by default. Not an HTTP path.       |
| `redirect`         | No       | `true` answers each match with `308` to the destination host. Document matches only.      |

## Match kinds

| Kind            | Matches                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Exact`         | `match.path` only.                                                                                                                                       |
| `PathPrefix`    | `match.path` and every path below it.                                                                                                                    |
| `client-views`  | Every view of the destination client and of its SSR profile, as a prefix. Status pages and edge contexts are left out: each host serves its own.         |
| `client-assets` | The directories the client build writes the destination modules and libraries to: `/components`, `/services`, and the top directory of each dist folder. |
| `client-apis`   | `/api/v1/<api>` for each API the destination client calls (its `services`) that the destination mounts, and each API of `include`.                       |
| `api`           | The whole API path of the destination, `/api/v1`.                                                                                                        |
| `ws`            | The Socket.IO path of the destination, `/socket.io`.                                                                                                     |

The selectors read the configuration of the destination, so a new view, dist or client service
reaches the routes with no second list. `client-apis` exposes only the APIs the routed client calls;
`api` exposes every API of the destination.

## Route plan

Each host path resolves its routes to one route plan: one entry per match, with its route id, its
kind, its destination host path, the port that destination listens on, whether it is a service
match, and its protocol (`websocket` for `ws`, else `http`). The deploy build and the runtime both
route by this plan.

- **Destination.** `destination.host` and `destination.path` name an entry of `conf.server.json`.
  Its workload is the workload of the deploy, and its port is the port the deploy assigns that entry:
  the traffic Service port in a cluster, the local port in a runtime.
- **Precedence.** An exact match first, then the longest prefix. A request takes the first entry
  that matches.
- **Matching.** By path element and case: `/log-in` matches `/log-in` and `/log-in/x`, never
  `/log-inx` or `/LOG-IN`. The query is not part of the match. Dot segments are resolved first.
  Duplicate slashes are not merged.
- **Forwarding.** The method, the path with its trailing slash, the query, the body, the cookies and
  the `Authorization` header pass unchanged. There is no rewrite.

A service match lies under the API or socket path of the destination: the workload answers it with
its own status and body, and no edge document replaces an error.

## Redirect routes

A redirect route answers each of its matches with `308 Permanent Redirect` to the same path and query
on the destination host. The browser then runs the destination on its own origin, with its own
storage, cookies and worker: use it to keep an application and its session on one host.

```json
{
  "id": "portal-views",
  "match": { "kind": "client-views", "exclude": ["/", "/test"] },
  "destination": { "host": "services.cyberiaonline.com" },
  "redirect": true
}
```

```text
GET /log-in/?play=violet HTTP/1.1
Host: www.cyberiaonline.com

HTTP/1.1 308 Permanent Redirect
Location: https://services.cyberiaonline.com/log-in/?play=violet
Cache-Control: no-cache
```

- **Location.** The origin comes from the configuration, never from the request: `https://<host>`, or
  `http://<host>` where the environment terminates no TLS, and `http://localhost:<port>` of the
  destination when a development runtime answers. The path and query are the ones the visitor sent.
- **Method.** A `308` keeps the method and body, and `Cache-Control: no-cache` makes the browser ask
  again at the next visit, so a changed route takes effect at once.
- **Documents only.** A redirect that matches a path under the API or socket path of the destination
  refuses the configuration: an API call, a credential or an OAuth callback never changes origin on
  its way.
- **No public host.** A redirect reaches no workload through the source host, so the destination
  does not list the source in `publicHosts`. The views need no public tree on the source host.

## Where a request is routed

| Environment                                                               | Adapter                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A cluster with the Gateway API provider                                   | Service matches: an HTTPRoute rule to the destination port. Document matches: a location of the host block in `underpost-gateway`, with the error documents of the host the visitor asked for. Redirect matches: a location of that host block that answers `308`, because Gateway API redirects with `301` or `302` only. |
| Any runtime: development, compose, a cluster without the gateway provider | The runtime of the source host forwards each match to the local port of the destination, before any parser reads the body, and answers each redirect match with `308`. It forwards WebSocket upgrades of the `ws` routes.                                                                                                  |

In a cluster, the gateway answers a routed path before the request reaches the runtime, so the
runtime forwarder never sees it. One HTTPRoute rule holds the matches of one route: Gateway API
admits 64 matches in one rule and 16 rules in one route.

The runtime forwarder answers an unreachable destination with `502` or `504`: in JSON for a
service match, in plain text for a document match. Behind `underpost-gateway`, the host's
maintenance document answers it instead.

## Forwarded request

The `Host` header stays the public host. `X-Forwarded-Proto` is the scheme the visitor used: the
ingress sets it on port 80, Envoy sets it where it terminates TLS, and `underpost-gateway` and the
runtime forwarder pass it on. The destination therefore sees the public origin of the request, and a
relative redirect stays on that origin.

The runtime gives each API module the hosts whose routes reach its host path, as `publicHosts` of its
context. A module that builds an absolute URL for a request, such as an OAuth callback, uses the
host of the request when it is one of them.

A session token names the host path of the workload that signed it, so a token signed through a
routed host answers on the destination host too. A host-only cookie and the local storage belong to
the host the visitor asked for: a forwarded view runs on that origin. A redirect route keeps an
application and its session on the origin of the destination.

## Static site

A root host path whose client ships no bundle, and which serves no API, socket, database or peer, is
a static site. `deploy --sync-static` places its whole build in the volume of `underpost-gateway`, at
`<host>/root/site`, and the gateway serves it from disk: HTML with `Cache-Control: no-cache`, a file
named by its content digest (`<name>.<16 hex>.<ext>`) for a year. A path the volume lacks goes to the
workload, so a host whose build is not placed yet keeps working. A traffic switch places the build
of the colour it routes to once that colour serves. The path routes of the host keep their own
locations.

## Diagnostics

The runtime logs the plan of each host path at start:

```text
Path routes www.cyberiaonline.com/ { "portal-views": "client-views → services.cyberiaonline.com/:4004 /account /chat …" }
```

and one line per forwarded request: host, path (never the query), route, kind, destination with
port, status, and the path of a redirect. `deploy --build-manifest` logs the direct and the gateway
matches of each route.

## Checks

The deploy build and the runtime resolve every route before they use it, and stop with every defect
of the host path, one per line:

- A key, kind or option outside the tables above. There is no path rewrite.
- An id that is not valid or repeats.
- A host path that only redirects and declares routes.
- A destination that is no host path of the deploy, is the host path itself, only redirects, runs as
  its own deploy (`singleReplica`), or lacks what the kind needs: a client, an API or a socket.
- A destination with no port in the topology of the environment.
- A `client-views` route on a host whose client does not build the public tree of the destination
  client, such as its `assets/` and icons: `client-assets` routes the build directories only. Set
  the `publicRef` of the host client, or its `publicCopyNonExistingFiles`, to that tree.
- An `exclude` path the selector does not generate, and an `include` API the destination does not
  mount or the client already calls.
- A route that matches a path the host serves itself: its views, edge documents, client directories,
  API or socket. Exclude that path.
- Two routes that declare the same match.
- On a sub-path host path, a route outside that sub-path.

A destination is a workload, never a public host. A routed request never passes through the routes
of its destination again, so path routes cannot form a loop. A destination that only redirects is
refused, because its redirect would send the visitor back.

## Limits

- The service worker of the destination registers only on its own origin, so a routed view runs
  without it. See [PWA and SSR Views](../explanation/pwa-and-ssr-views.md#service-worker-lifecycle).
- A static site is served from the gateway volume at the root host path only.
