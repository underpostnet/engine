# Cyberia public website and services

Cyberia has two web hosts. `www.cyberiaonline.com` is the public website. `services.cyberiaonline.com`
holds accounts, the portal, Studio and every Cyberia API. This page states what each host does, how a
visitor gets from one to the other, and how the edge serves both.

## Hosts

| Host                         | Client           | Serves                                                                | APIs              |
| ---------------------------- | ---------------- | --------------------------------------------------------------------- | ----------------- |
| `www.cyberiaonline.com`      | `cyberia-public` | The landing page, a static build the edge serves. The portal, routed. | The portal's only |
| `services.cyberiaonline.com` | `cyberia-portal` | Log-in, portal, Studio, `/launch`, `/docs`, the API                   | All               |
| `cyberiaonline.com`          | —                | A permanent redirect (`301`) to `https://www.cyberiaonline.com`       | None              |
| `client.cyberiaonline.com`   | `mmo-client`     | The game client (C/WASM)                                              | None              |
| `server.cyberiaonline.com`   | `mmo-server`     | The game server (Go), one path per world                              | Own               |

`conf.server.json` of `dd-cyberia` is the one source of these hosts. Every origin follows from it:

- `gameOrigins` (`src/projects/cyberia/runtime/game-origins.js`) takes the services origin from the host
  that mounts `cyberia-game-ticket`. The game envs, the launch links and the deploy readiness probes
  read it from there.
- `validate-domains` (`src/projects/cyberia/stack/domain-ownership.js`) refuses a public host that
  mounts an API, a database, a mailer or a socket, and a public client that carries portal or Studio
  components.

## The public website

The build renders the landing page once, from the `CyberiaPublic` profile of `conf.ssr.json`:

- head: `Seo`, `Microdata`, `CyberiaPublicCss`
- body: `CyberiaPublicLanding`
- views: `/404` and `/maintenance`, the documents the gateway serves on a failure

The view of `cyberia-public` has no `src/client/CyberiaPublic.index.js`, so the page loads no portal
code, starts no session and calls no service. Its `sw.js` only removes the portal worker that `www`
installed before the split.

The page has a hero, the world list, Cyberia Studio, the universe and a footer. The art is the
game's own: the thumbnails of the published worlds, the logo and the pixel icons of the portal.

Each world card has one image height for every card. The thumbnail covers it, centered, and zooms
on hover or keyboard focus; reduced motion stops the zoom. The Play link covers the whole card, so a
click anywhere on the card opens the world through one link. The hero shows the thumbnail of the
first listed world.

### Theme

The header holds a theme control: Auto, Light and Dark. Auto follows the color scheme of the
visitor. A choice is stored in the local storage of `www` (`cyberia-color-scheme`). A small inline
script in the head applies the stored choice before the first paint, so no wrong theme shows, then
shows the control. Without script the control stays hidden and the page follows the color scheme.

### World data and publication

`ssrData` of `src/projects/cyberia/instance-data.js` gives the build the data of the page, and the
files it writes beside it:

1. It opens the content artifact. A missing or altered artifact stops the build. A deploy builds
   the artifact the lock pins before the client bundle
   ([Client bundle](../how-to/deploy-a-release.md#client-bundle)).
2. It checks the artifact against the deployment lock (`underpost.lock.json` of
   `cyberia-deployment`). A production build of an artifact the lock does not pin stops; a
   development build logs a warning.
3. It reads the instance record of each released world, `RELEASE_CONTENT` of
   `src/projects/cyberia/content/release-content.js`. A released world the artifact lacks stops the
   build.
4. It lists the worlds with the status `published`. Each listed world needs a valid code and a name.
5. It writes the thumbnail of each listed world, the File its record names as `thumbnail` (a PNG,
   JPEG or WebP image), as `worlds/<code>.<digest>.<width>.<ext>` at its own width and at 480
   pixels, for the `srcset` of the image. Set the thumbnail of a world in the Instance Engine of
   Studio.

The `Public worlds` line of the build log states the artifact (repository, version, revision, digest,
schema, lock state), the released worlds, the listed worlds, the excluded worlds by status, and the
thumbnail files. A valid artifact with no published world gives the empty state.

The landing page reads the content release, never the Studio database. To list a world:

1. Set its status to `published` in Studio.
2. Export the world into the content source:
   `cyberia instance snapshot <code> --export --conf --dev`.
3. Commit `cyberia-content`, build its artifact, and lock and release it.
4. Build the public website.

A world that is published in Studio but not exported and released does not show. The build log
names the status the artifact holds.

## Portal paths on the public website

`www.cyberiaonline.com` serves the public website only. Its `conf.server.json` entry sends the portal
paths to `services.cyberiaonline.com` with
[redirect path routes](../../nexodev/reference/path-routes.md#redirect-routes):

| Route             | Paths                                 | Answer                                         |
| ----------------- | ------------------------------------- | ---------------------------------------------- |
| `portal-views`    | Every portal view but `/` and `/test` | `308` to the same path and query on `services` |
| `portal-api-docs` | `/api-docs`                           | `308` to the same path and query on `services` |

`www.cyberiaonline.com/log-in/?play=violet` answers `308` with
`Location: https://services.cyberiaonline.com/log-in/?play=violet`. The browser loads the portal on
`services` before any portal script runs. The paths come from the configuration of the portal, so a
new view needs no second entry. `www` routes no API, socket or portal asset, and `/` and
`/index.html` stay the landing page. In development the runtime of `www` redirects to the local port
of the portal.

The `assets/` tree and the icons come from `www` itself: its client copies the `cyberia` public tree
of the portal (`publicCopyNonExistingFiles`).

## Sessions and origins

The portal, its session and its worker live on `services.cyberiaonline.com` alone
([ADR 0018](../../underpost/adr/0018-one-application-origin.md)):

- The access token is in the local storage of `services`, and the refresh cookie is a host-only
  cookie of `services`. No cookie names the parent domain, and no session crosses hosts.
- The links of the landing page go to `services`, where the game client returns too. "Open portal"
  opens the portal home, which shows the session the browser holds there.
- Google sign-in starts and ends on `services`.
- The portal worker registers only on `services`. A browser that installed a portal worker on `www`
  before the split gets the retiring worker of the public website: it deletes the old caches,
  unregisters and reloads the page it controlled, which then reaches the redirect.
- A session started on `www` before the redirect stays there: the visitor signs in once on
  `services`.

The portal reads the status of each world from the metrics of its game server. The game servers
accept the browser origins of `services` and the game client. A server that answers without metrics
shows Offline; a read that gets no answer, from the network, the origin policy or a timeout, shows
Unknown and leaves the world playable: the launch decides.

The log-in and sign-up views are guest views. A visitor with an account session who opens one, for
example from the landing page, goes to the portal home with the notice "You are already signed in".
The router replaces the history entry, so Back returns to the page before, never to a view that
closes itself.

## World entry and log-in

Each world links to `https://services.cyberiaonline.com/launch?world=<code>`, the launch bridge. It
issues a single-use game ticket for the current session, or offers a guest session. When the world
needs an account, the bridge opens the portal log-in at `/log-in?play=<code>`. After log-in the
portal launches that world. The bridge never sends a visitor to `/`, which on `www` is the landing
page.

The return target is always a world code that the engine resolves. It is never a URL, so no request
can redirect a visitor off the Cyberia hosts. No session token travels in a query string: the ticket
goes in the URL fragment, which the browser never sends to a server.

Google sign-in uses the callback of the host the flow starts on:
`https://services.cyberiaonline.com/api/v1/google-auth/callback`, and
`https://www.cyberiaonline.com/api/v1/google-auth/callback` for a flow on `www`. The OAuth client
must list both. See [Configure Google sign-in](../how-to/configure-google-sign-in.md).

## Search

| Host                         | Indexed                                      | Sitemap  |
| ---------------------------- | -------------------------------------------- | -------- |
| `www.cyberiaonline.com`      | The landing page, with its own canonical URL | `/`      |
| `services.cyberiaonline.com` | `/docs`, and the Object Layer pages          | `/docs/` |

Every other portal view carries `"noindex": true` in `conf.client.json`: its document has a robots
`noindex` tag and stays out of the sitemap. `/object-layer` is the shell of every
`/object-layer/<cid>` page, so it stays indexable; its own path opens the item list, so it carries
`"sitemap": false`. `/launch` and `/test` send `X-Robots-Tag: noindex`. A portal view routed through
`www` keeps its `services` canonical URL, so search engines do not index it twice. Each host has its
own `robots.txt`, which disallows `/api/v1/` and names its sitemap.

## Edge, TLS and failures

| Step | Component                   | Does                                                                                                                  |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1    | `underpost-ingress` (nginx) | Holds the node ports 80 and 443. Routes TCP 443 by SNI and passes the TLS bytes through                               |
| 2    | Envoy Gateway (`eg`)        | Terminates TLS with the cert-manager certificates. Selects the `HTTPRoute` of the host                                |
| 3    | `underpost-gateway` (nginx) | Serves the static build of `www` from its volume. Proxies the site paths. Serves the status and maintenance documents |
| 4    | The engine traffic Service  | Answers the API and socket paths directly, so an API error keeps its JSON body and status                             |

Only the ingress holds the public ports. TLS ends once, at Envoy. The ingress never decrypts.

`deploy --sync-static` places the build of `www` in the gateway volume, and every traffic switch
places it again from the colour it routes to: a deploy publishes the landing of the bundle it
rolls out. The gateway serves its HTML with `Cache-Control: no-cache` and its digest-named
thumbnails for a year. A file the volume lacks comes from the engine pod, so `www` keeps working
before the first sync.

On a site path the gateway intercepts errors and keeps the upstream status:

| Upstream answer     | The visitor gets                             |
| ------------------- | -------------------------------------------- |
| `404`               | The `/404` document, status `404`            |
| `502`, `503`, `504` | The `/maintenance` document, the same status |
| Anything else       | The upstream answer                          |

UDP 443 is a separate path. QUIC hides the SNI, so the ingress forwards every datagram to Envoy, and
each route sends `Alt-Svc: h3`. A client that gets no QUIC answer uses TCP.

## Verification

`test/cyberia/e2e/public-host-routing.test.js` checks a running stack through both hosts: the static
landing page, the portal documents and modules, the API the portal calls and one it does not, the
socket, and a log-in deep link in a browser. Run it on a development sandbox:

```bash
node bin sandbox up --ipfs
npm run dev dd-cyberia
CYBERIA_E2E_PUBLIC_ORIGIN=http://localhost:4006 CYBERIA_E2E_SERVICES_ORIGIN=http://localhost:4004 \
  npx vitest run test/cyberia/e2e/public-host-routing.test.js
```

The runtime log shows the route plan of `www` at start (`Path routes`) and each forwarded request
(`Path route`), with its route, destination port, status and redirect path.

## Limits

- The public website and the services host run in the same engine pod. A pod failure shows the
  maintenance document on the portal paths of both hosts; the landing page stays up once synced.
- The HTTP/3 path is configured but has no end-to-end check in this repository.
- No world has a page of its own, so the sitemap of `www` holds the landing page only.
