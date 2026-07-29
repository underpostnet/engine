# PWA and SSR Views

How per-deploy SSR views are declared and how they drive the PWA offline lifecycle.

---

## Source of truth

The PWA pipeline has two inputs:

- the deploy `ssr` configuration in `conf.dd-*.js` or `conf.ssr.json`
- the service worker source in `src/client/sw/core.sw.js`

Everything else is generated from those inputs during the client build. Do not hand-edit generated `index.html` files, `sw.js`, or precache output.

---

## SSR config shape

Each deploy's `conf.ssr.json` (or the public `ssr` block in `conf.dd-<conf-id>.js`) declares an app-shell entry per client. A typical entry:

```js
ssr: {
  Default: {
    head: ['Seo', 'Pwa', 'Css', 'DefaultScripts', 'Production'],
    body: ['CacheControl', 'DefaultSplashScreen', '404', '500', 'SwaggerDarkMode'],
    mailer: { userVerifyEmail: 'DefaultVerifyEmail', userRecoverEmail: 'DefaultRecoverEmail' },
    views: [
      {
        path: '/offline',
        title: 'No Network Connection',
        client: 'NoNetworkConnection',
        head: [],
        body: [],
        offlineDefault: true,
      },
      {
        path: '/maintenance',
        title: 'Server Maintenance',
        client: 'Maintenance',
        head: [],
        body: [],
        maintenanceDefault: true,
      },
      { path: '/test', title: 'Test', client: 'Test', head: [], body: [] },
    ],
  },
}
```

### Field reference

| Field    | Type       | Notes                                                                                                             |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `head`   | `string[]` | SSR component basenames under `src/client/ssr/head/<Name>.js`, injected into `<head>` in order. Always evaluated. |
| `body`   | `string[]` | SSR component basenames under `src/client/ssr/body/<Name>.js`, injected at the end of `<body>` in order.          |
| `mailer` | `object`   | Maps a logical mail template name to a component basename under `src/client/ssr/mailer/`.                         |
| `views`  | `object[]` | All SSR-rendered views for this app — pages **and** fallback shells. See below.                                   |

### `views[]` entry

| Field                | Type       | Notes                                                                                                                          |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `path`               | `string`   | URL path (proxy-relative). Built as `${rootClientPath}${path}/index.html`.                                                     |
| `title`              | `string`   | `<title>` text.                                                                                                                |
| `client`             | `string`   | SSR component basename under `src/client/ssr/views/<client>.js`. Single directory — no `offline/` vs `pages/` split.           |
| `head`, `body`       | `string[]` | Per-view head/body overrides. Empty array = inherit the app-level lists.                                                       |
| `offlineDefault`     | `boolean`  | Marks this view as the **offline fallback**. The SW precaches it on install and serves it when `navigator.onLine === false`.   |
| `maintenanceDefault` | `boolean`  | Marks this view as the **maintenance fallback**. Precached and served when the origin returns 5xx or is otherwise unreachable. |

Views with neither flag are SSR-rendered and reachable by URL, but **not** precached. Lazy runtime caching still applies via the SW's navigation strategy.

---

## Edge-served views

Some views carry no request-time logic at all, so the gateway answers them and the application pods never see the request. Which views those are is derived from the same `views[]` array — no path is named a second time:

| Selector                                      | Becomes                       | Placed at                                            |
| --------------------------------------------- | ----------------------------- | ---------------------------------------------------- |
| `path` is a bare status code (`/404`, `/503`) | a status page                 | `<host>/<sub-path>/status-pages/<status>/index.html` |
| `offlineDefault` or `maintenanceDefault`      | an intercepted static context | `<host>/<sub-path>/<context>/index.html`             |

`<sub-path>` is the client's proxy sub-path with `/` written as `root`, so the `CyberiaPortal` `/404` view on `www.cyberiaonline.com` lands at `www.cyberiaonline.com/root/status-pages/404/index.html`.

`deploy --build-manifest` emits one HTTPRoute rule per entry, rewriting the request prefix onto that **directory** — so `/404` resolves the document through `index.html` and `/404/logo.png` resolves the asset beside it, from one rule. `deploy --sync-static` places the documents those rules point at. Both read the same selectors, so a new edge-served view needs nothing beyond its `views[]` entry.

The documents are not carried in the gateway configuration: Envoy rejects a direct-response body over 4096 bytes while translating the route, and the rejection fails the entire route rather than the one rule. They are held instead by the `gateway-static-utility` Nginx workload, which routes reach as an ordinary backend. See [Deploy to K8S](<./Deploy to K8S.md>) for the placement commands.

### How a wrong path is answered

A request to a path the workload does not have gets the workload's own 404, and `ssrMiddlewareFactory` redirects it to the deploy's `/404` view when that view was built — which is the route the gateway intercepts. So `https://www.cyberiaonline.com/no-exist-page` ends on the deploy's own rendered 404 page, served by the edge, with the application pod never rendering a status page.

If the document is missing from the static tier, the request falls through to a shared default page that answers **404** with `Cache-Control: no-store`. That is deliberate: a 200 would let the service worker's navigation cache store the placeholder as the host's own page and keep serving it for hours after the real document landed.

---

## Service worker lifecycle

The SW source lives at `src/client/sw/core.sw.js`. The client build (`src/client-builder/client-build.js`) bundles it via esbuild and prepends a `self.renderPayload` prelude with values resolved from the `views` array:

| Payload field          | Source                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `PRE_CACHED_RESOURCES` | `index.html` URLs for every view with `offlineDefault` or `maintenanceDefault` set. |
| `PROXY_PATH`           | The instance's mount path (`/`, `/foo`, …).                                         |
| `CACHE_PREFIX`         | `engine-core-<scope>` where scope is `root` or the path with `/` → `_`.             |
| `OFFLINE_URL`          | Fully-resolved `index.html` URL of the view flagged `offlineDefault`.               |
| `MAINTENANCE_URL`      | Fully-resolved `index.html` URL of the view flagged `maintenanceDefault`.           |

### Runtime strategies

| Request                                             | Strategy                | Cache                             |
| --------------------------------------------------- | ----------------------- | --------------------------------- |
| Same-origin static assets (script/style/image/font) | `StaleWhileRevalidate`  | `<prefix>-assets`, 30-day TTL     |
| `GET /api/*`                                        | `NetworkFirst` (5 s)    | `<prefix>-api-get`, 5-minute TTL  |
| `!GET /api/*`                                       | `NetworkOnly` + BG sync | replayed via `api-mutation-queue` |
| Navigation                                          | `NetworkFirst` (4 s)    | `<prefix>-pages`, 12-hour TTL     |

### Fallback selection

When a navigation request fails:

- `navigator.onLine === false` → serve `OFFLINE_URL`
- otherwise (server 5xx, DNS, TLS, timeout) → serve `MAINTENANCE_URL`

Falls through to the other if the primary is missing from cache, then `Response.error()`.

---

## Adding a new SSR view

1. Create `src/client/ssr/views/<MyView>.js` exporting an `SrrComponent` function (see `src/client/ssr/views/Test.js` for the minimum shape).
2. Append an entry to the relevant `ssr.<App>.views` array in `conf.ssr.json` / `conf.dd-<conf-id>.js`.
3. Run `npm run build` (or `npm run dev`) — the build emits `<root>/<path>/index.html` for the new view.

To make the new view a fallback target, set `offlineDefault: true` or `maintenanceDefault: true`. Only one view per app should carry each flag — if multiple are set, the last one in `views[]` wins.

---

## Updating the service worker

`core.sw.js` is bundled inline by esbuild and shipped as `sw.js` per host instance. After editing it, rebuild the client; the SW takes effect on the next page load (via `skipWaiting + clientsClaim`).

For manual cache invalidation during development, the Settings panel exposes a **clean-cache** action that calls `Worker.resetAndRestart()` — unregistering the SW, dropping all caches, clearing local/session storage, and re-registering.
