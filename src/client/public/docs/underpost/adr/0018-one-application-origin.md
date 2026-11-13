# ADR 0018 — One application origin, and redirect path routes

## Status

Accepted. Amends [ADR 0017](0017-path-routes-between-hosts.md): adds the redirect route, and supersedes
its consequence that a portal session can start on `www`.

## Context

ADR 0017 let `www.cyberiaonline.com` serve the portal views by forwarding them to the portal workload.
A forwarded view runs on the `www` origin. The portal keeps its token in the local storage of its
origin and its refresh cookie on its exact host, so one browser held two sessions, one per host. The
landing page links to `services.cyberiaonline.com`, and the game client returns there: a visitor who
signed in on `www` reached a signed-out portal. The game servers accept the browser origins of the
portal and the game client, so a world read from a view on `www` had no CORS answer and showed
Offline. The portal worker registers only on `services`, so a view on `www` ran without it.

## Decisions

1. **One origin holds the application.** The portal views, their session and their worker live on
   `services.cyberiaonline.com`. `www` serves the public website.
2. **A path route can redirect.** `"redirect": true` answers each match with `308` to the same path and
   query on the destination host. The host comes from the configuration, never from the request. The
   answer carries `Cache-Control: no-cache`, so a changed route takes effect at the next visit.
3. **A redirect takes documents only.** A match under the API or socket path of the destination
   refuses the configuration: an API call, a credential or an OAuth callback never changes origin on
   its way.
4. **The gateway answers the redirect.** Gateway API redirects with `301` or `302` only, and a browser
   turns those into a `GET`. `underpost-gateway` answers the `308` before any workload. Where no gateway
   routes first, the runtime of the host answers it: `https://<host>` in production, the local port of
   the destination in development.
5. **No session crosses origins.** No cookie names the parent domain, no token is copied and no
   session is synchronized. The origin policy of the game servers stays as it is.
6. **A retiring worker hands its pages to the network.** It reloads each page it controlled, so a
   portal page an old `www` worker served from its cache reaches the redirect.

## Consequences

- `www.cyberiaonline.com/log-in` answers `308` to `https://services.cyberiaonline.com/log-in`. Every
  signed-in page shows the `services` host.
- `www` routes no API, socket or portal asset. Its route table holds two redirects: `portal-views` and
  `portal-api-docs`.
- A session started on `www` before this change stays there: the visitor signs in once on `services`.
- Google sign-in starts and ends on `services`. `publicHosts` lists only the hosts that forward.
- The landing page opens the portal with "Open portal": the portal shows the session the browser
  holds there.
