# ADR 0017 — Path routes between hosts of a deploy

## Status

Accepted. [The path routes reference](../../nexodev/reference/path-routes.md) states the contract.
Amended by [ADR 0018](0018-one-application-origin.md): a route can redirect, and the portal session
no longer starts on `www`.

## Context

Cyberia split one host into two: `www.cyberiaonline.com` serves a static landing page, and
`services.cyberiaonline.com` serves the portal, Studio and the APIs. The portal paths that `www`
served before, such as `/log-in` and `/cyberia-studio`, answered `404` on `www`. The two hosts run in
one deploy, so the portal workload was already reachable from the routes of `www`. Underpost had no
declaration for that: `proxy` lists the ports a host listens on, and `redirect` sends a whole host
away. The landing page was static, but the engine pod served it.

## Decisions

1. **A declaration of its own.** `pathRoutes` of a `conf.server.json` entry sends chosen paths to
   another host path of the same deploy. `proxy` and `redirect` keep their meaning.
2. **Selectors read the destination.** `client-views`, `client-assets`, `client-apis`, `api` and
   `ws` derive their paths from the client, SSR and server configuration of the destination. No list
   of application paths is written twice. `client-apis` exposes the APIs the routed client calls,
   not every API of the destination.
3. **The path is preserved.** There is no rewrite option. The destination serves each request at
   the URL the visitor asked for, so the documents, assets and relative redirects of the
   destination work unchanged.
4. **A destination is a workload.** A route resolves to the port of the destination workload, never
   to its public host. Routes cannot chain or form a loop, and no request leaves the deploy to come
   back.
5. **One route plan, two adapters.** The routes of a host path resolve to one plan: each match with
   its destination port and precedence. The deploy build compiles the plan into HTTPRoute rules and
   `underpost-gateway` locations. The runtime of the source host forwards by the same plan, so a
   route works in development, in a compose stack and behind any ingress provider. In a cluster with
   the gateway, the gateway answers first.
6. **Errors follow the visitor's host.** Behind the gateway, a document match gets the error
   documents of the host the visitor asked for. A match under the API or socket path of the
   destination goes straight to its port and keeps its own status and body.
7. **A defect stops the build and the start.** An unknown key, a destination outside the deploy or
   that only redirects, a route that captures a path the host serves itself, and two routes with the
   same match refuse the configuration.
8. **The scheme of the visitor reaches the workload.** `underpost-gateway` forwards
   `X-Forwarded-Proto` from Envoy instead of writing its own plain `http`.
9. **Client bundles carry no origin.** The client build writes root-relative module imports in
   every build mode, so a bundle runs on any host that routes it.
10. **A static site is served at the edge.** The gateway serves the build of a static root host path
    from its volume, and asks the workload only for a file the volume lacks.

## Consequences

- `www.cyberiaonline.com/log-in` serves the portal log-in view, and `www.cyberiaonline.com/` is a
  static document the gateway serves without the engine pod.
- A routed view runs on the origin of the visitor's host: its local storage and its host-only
  cookies belong to that host. A session that starts on `www` is a different browser session from
  one that starts on `services`, although its token answers on both.
- An API module learns the hosts that route to it (`publicHosts` of its context), so an OAuth flow
  that starts on a routed host ends on that host.
- The worker of a progressive web application registers only on the origin its build names, so a
  routed view runs without one. A static build ships a worker that removes the worker an earlier
  build of its origin installed.
- Behind `underpost-gateway`, a production request reads as secure, so the refresh cookie gets
  `Secure` and `SameSite=None` as its contract states.
