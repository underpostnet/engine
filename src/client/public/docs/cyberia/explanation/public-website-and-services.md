# Cyberia public website and services

Cyberia has two web hosts. `www.cyberiaonline.com` is the public website. `services.cyberiaonline.com`
holds accounts, the portal, Studio and every Cyberia API. This page states what each host does, how a
visitor gets from one to the other, and how the edge serves both.

## Hosts

| Host                         | Client           | Serves                                              | APIs |
| ---------------------------- | ---------------- | --------------------------------------------------- | ---- |
| `www.cyberiaonline.com`      | `cyberia-public` | The landing page, built as static HTML. No script.  | None |
| `services.cyberiaonline.com` | `cyberia-portal` | Log-in, portal, Studio, `/launch`, `/docs`, the API | All  |
| `cyberiaonline.com`          | —                | A redirect to `https://www.cyberiaonline.com`       | None |
| `client.cyberiaonline.com`   | `mmo-client`     | The game client (C/WASM)                            | None |
| `server.cyberiaonline.com`   | `mmo-server`     | The game server (Go), one path per world            | Own  |

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

The view of `cyberia-public` has no `src/client/CyberiaPublic.index.js`. A view without its bundle is a
static document: the build writes no script and no service worker for it. The page loads no portal
code, starts no session and calls no service.

The deploy project gives the components their data at build time. `ssrData` of
`src/projects/cyberia/instance-data.js` returns the services links and the listed worlds:

1. The released worlds, `RELEASE_CONTENT` of `src/projects/cyberia/content/release-content.js`.
2. Of those, the worlds whose instance record in the content artifact has the status `published`.

To list a world, set its status to `published` in Studio and release the content. The page keeps
the worlds of its last build. It does not change when the services host is down.

The SSR profile of a client is the capitalized client id. So the portal profile stays
`CyberiaPortal`: the mailer, the status pages and the edge routes find it by that name.

## World entry and log-in

Each world links to `https://services.cyberiaonline.com/launch?world=<code>`, the launch bridge. It
issues a single-use game ticket for the current session, or offers a guest session. When the world
needs an account, the bridge sends the visitor to the portal with `?play=<code>`. After log-in the
portal launches that world.

The return target is always a world code that the engine resolves. It is never a URL, so no request
can redirect a visitor off the Cyberia hosts. No session token travels in a query string: the ticket
goes in the URL fragment, which the browser never sends to a server.

Google sign-in uses the callback of the host that mounts `google-auth`:
`https://services.cyberiaonline.com/api/v1/google-auth/callback`. See
[Configure Google sign-in](../how-to/configure-google-sign-in.md).

## Sessions, origins and requests across sites

- The refresh cookie is host-only: it has no `Domain` attribute, so `www` and `client` never receive
  it. It is `HttpOnly`, and `Secure` with `SameSite=None` on a secure request. Log-out clears it
  with the same attributes.
- `origins` of the services host allows `https://client.cyberiaonline.com` and
  `https://server.cyberiaonline.com`. The public website calls no API, so it has no origin there.
  The list is exact: there is no wildcard with credentials.
- Session refresh and log-out read the cookie. They refuse with `403` a request whose `Origin` is
  neither the host itself nor an allowed origin. Both also need a CORS preflight (`Authorization`
  header, `DELETE`), which a foreign origin fails. Every other write needs the bearer token.

## Edge, TLS and failures

| Step | Component                   | Does                                                                                    |
| ---- | --------------------------- | --------------------------------------------------------------------------------------- |
| 1    | `underpost-ingress` (nginx) | Holds the node ports 80 and 443. Routes TCP 443 by SNI and passes the TLS bytes through |
| 2    | Envoy Gateway (`eg`)        | Terminates TLS with the cert-manager certificates. Selects the `HTTPRoute` of the host  |
| 3    | `underpost-gateway` (nginx) | Proxies the site paths. Serves the status and maintenance documents from its volume     |
| 4    | The engine traffic Service  | Answers `/api/v1` directly, so an API error keeps its JSON body and status              |

Only the ingress holds the public ports. TLS ends once, at Envoy. The ingress never decrypts.

On a site path the gateway intercepts errors and keeps the upstream status:

| Upstream answer     | The visitor gets                             |
| ------------------- | -------------------------------------------- |
| `404`               | The `/404` document, status `404`            |
| `502`, `503`, `504` | The `/maintenance` document, the same status |
| Anything else       | The upstream answer                          |

The landing page is never a fallback document. The gateway serves it only when the engine answers
with it.

UDP 443 is a separate path. QUIC hides the SNI, so the ingress forwards every datagram to Envoy, and
each route sends `Alt-Svc: h3`. A client that gets no QUIC answer uses TCP.

## Limits

- The public website and the services host run in the same engine pod. A pod failure shows the
  maintenance document on both until the pod is back.
- The HTTP/3 path is configured but has no end-to-end check in this repository.
- The public website lists no world until a released world has the status `published`.
