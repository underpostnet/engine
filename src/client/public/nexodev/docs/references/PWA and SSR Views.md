# PWA and SSR Views

This document covers the PWA workflow only: how SSR views are declared, how fallback shells are generated, and how the service worker behaves at runtime.

Keep this page scoped to authored PWA inputs and generated PWA outputs.

---

## Source of truth

The PWA pipeline has two inputs:

- the deploy `ssr` configuration in `conf.dd-*.js` or `conf.ssr.json`
- the service worker source in `src/client/sw/core.sw.js`

Everything else is generated from those inputs during the client build.

Do not hand-edit generated `index.html` files, `sw.js`, or precache output.

```text
conf.dd-*.js / conf.ssr.json    +    src/client/sw/core.sw.js
			   │
			   └──── underpost client / build ────▶ generated HTML shells + sw.js + precache list
```

---

## Build flow

1. Define SSR views for a deploy.
2. Mark the offline and maintenance fallback views.
3. Build the client.
4. Emit static pages plus a generated service worker payload for that deploy.

The important rule is that view configuration drives both server-rendered output and offline behavior. There should be one source of truth for routes, titles, fallback shells, host/path resolution, and precache targets.

The normal entrypoint is `underpost client`; repo-local wrappers may call the same pipeline, but the authored inputs do not change.

---

## View model

Each deploy defines a view list with:

- route path
- title
- SSR client component
- optional per-view head/body overrides
- `offlineDefault`
- `maintenanceDefault`

Only fallback-marked views are guaranteed to be precached. Normal views are built and routable, but they are not the fallback contract.

---

## Service worker behavior

At build time, the service worker receives:

- the deploy proxy path
- the cache namespace
- the offline fallback URL
- the maintenance fallback URL
- the precache list derived from the SSR view set

At runtime, the default behavior is:

- static assets: stale-while-revalidate
- API `GET`: network-first with short cache fallback
- API mutations: network-only with background replay
- navigation: network-first with fallback shells

Fallback selection is simple:

- offline network state uses the offline fallback
- origin failure or server failure uses the maintenance fallback

---

## Cyberia note

The Cyberia client is delivered through this PWA pipeline, but PWA readiness is not the same as MMO readiness.

- A built client can load while the game is still unavailable.
- Cyberia gameplay is ready only when `engine-cyberia`, `cyberia-server`, and `cyberia-client` are healthy at the same time.
- If one of those services fails, the game should move to standby until all three recover.

---

## Operational rules

- Prefer one source of truth for deploy IDs, route declarations, runtime selection, and generated artifacts.
- Reuse the existing SSR and service-worker helpers instead of introducing parallel pipelines.
- Do not duplicate path normalization or env resolution logic across build steps.
- Treat generated PWA artifacts as outputs only.
- Keep any host-level orchestration change idempotent, reversible, and safe to rerun.
