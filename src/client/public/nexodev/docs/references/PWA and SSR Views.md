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

The documents are not carried in the gateway configuration. Envoy substitutes only an inline body, capped at 4096 bytes for both inline and ConfigMap sources, and it cannot re-dispatch a request to another cluster once the upstream has answered. They are held instead by the `underpost-gateway` Nginx workload — see [Deploy to K8S](<./Deploy to K8S.md>) for the placement commands.

### How a wrong path is answered

The application runtime does nothing. It returns a bare 404 and no more; no runtime renders a status page, redirects to one, or fetches one over HTTP.

The gateway proxies the site path through `underpost-gateway`, whose Nginx has `proxy_intercept_errors on` and an `error_page` per declared status. When the workload answers 404, Nginx swaps in the declared document from disk. Three things hold as a result:

- the client keeps its own URI — `https://www.cyberiaonline.com/no-exist-page` stays in the address bar
- the response keeps the workload's status code — a true `404`, not a `200` carrying an error page
- the document has no size limit, because it is read from disk rather than inlined into the gateway config

`error_page 404 @location` preserves the intercepted status; the `error_page 404 = @location` form would replace it with the status of the page itself, and is deliberately never emitted.

The same interception answers `502`, `503` and `504` from the `maintenance` context, so a workload that is dead or unreachable shows the maintenance page with its true status and no application involvement.

API sub-paths are routed straight to the workload, bypassing the interception entirely — an API's own status and body are its contract, and a client parsing JSON must never receive an HTML page.

If a document is missing from the tree, the request falls through to a shared default page that answers **404** with `Cache-Control: no-store`. That is deliberate: a 200 would let the service worker's navigation cache store the placeholder as the host's own page and keep serving it for hours after the real document landed.

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
