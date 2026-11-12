# ADR 0016 — The API module contract

## Status

Accepted. [The API module reference](../../nexodev/reference/api-modules.md) states the contract.

## Context

Each `src/api/<api>/<api>.router.js` exported `ApiRouter(options)`. `options` held the Express
application, the database and mailer configuration, the token check and the host identity, and a
module could add fields to it: the user router cached its mail images in `options.png`. Routers
started work outside any lifecycle: the user router seeded the administrator and built its unique
indexes in a fire-and-forget function, with the known password `changethis` as a fallback, and two
routers started background workers when they built their routes. A failed index build only logged.

## Decisions

1. **One module definition.** Each router file exports `ApiModule`: `id`, `services`, optional
   `assets` and `initialize`, and `createRouter`. The runtime checks it before use and refuses any
   other field.
2. **The context is the identity of the module.** `host`, `path` and `apiBasePath` are fields of the
   context, beside `consumes`, `origins`, `services` and `extension`. Services, CLI commands and
   workers address host-scoped state by `{ host, path }`, so the context reaches them as it is; a
   nested `runtime` field would fork that one resolution path.
3. **A module receives the services it declares.** `database`, `auth`, `mailer` and `assets` come
   from the existing providers, scoped to the host path. A declared service that the host path does
   not provide stops the module at start, not at the first request. The user API reads its models,
   mailer and assets through its services; the other services move from the provider singletons
   one API at a time.
4. **A start runs once and a failure unmounts.** The runtime awaits `initialize` once per host path
   before it mounts the router. A failure keeps the router unmounted and latches the runtime status,
   like a database provider that does not load; the other modules of the host mount.
5. **No dispose hook.** The runtime exits on SIGINT and has no graceful shutdown that would call one.
   The hook joins the contract with that shutdown.
6. **One asset provider.** A module declares its static assets; the provider reads each once per
   process, answers only a declared name, and owns the cache and response headers. An asset never
   reflects the request origin.
7. **An extension names its API.** `<api>.extension.js` exports `api`; the loader refuses a module
   that extends another API.
8. **A token answers on its host path only.** The token check reads the session from the database of
   the host path that runs it and refuses a token that names another host or path. The administrator
   seed requires `DEFAULT_ADMIN_PASSWORD` and refuses the template value.

## Consequences

- A module that cannot start is visible at once: the log names the API, the host and the path.
- `test/underpost/audit/api-modules.test.js` refuses a router that keeps a factory, an application,
  an asset cache, a fire-and-forget start or a provider singleton, and an extension without its API.
- A wallet sign-in now signs the session token every login signs; before, its token named no host
  path or role and never passed the token check.
- The service key stays one secret of every domain. `X-Domain-Origin` labels the caller and proves
  nothing; binding it needs one key per domain, which is a change of the key distribution.
