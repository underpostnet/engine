# API Modules

An API module is the folder `src/api/<api>/`. It owns the routes and the business logic of one API.
The Express runtime (`src/runtime/express/express.js`) owns the application: its middleware,
security, static files, SSR, servers and metrics. A module never receives the application.

## Files

| File                  | Responsibility                                                    |
| --------------------- | ----------------------------------------------------------------- |
| `<api>.router.js`     | The module definition `ApiModule`: identity, lifecycle and routes |
| `<api>.controller.js` | HTTP request and response translation, status codes               |
| `<api>.service.js`    | Business logic and use cases                                      |
| `<api>.model.js`      | Mongoose schema, model, DTO and data constraints                  |

`src/api/types.js` is the one source of the shared types: `ApiModuleDefinition`, `ApiRouterContext`,
`ApiServices`, `ApiRequest`, `ApiAuthPrincipal`, `ApiAsset` and `ApiExtension`.

## Module definition

```js
/** @type {import('../types.js').ApiModuleDefinition} */
export const ApiModule = {
  id: 'document',
  services: ['database', 'auth'],
  createRouter(context) {
    const { auth } = context.services;
    const router = express.Router();
    router.patch(`/:id/toggle-public`, auth.authenticate, (req, res) => DocumentController.patch(req, res, context));
    return registerCrudRoutes(router, DocumentController, context);
  },
};
```

| Field          | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| `id`           | The API name: the folder name                                               |
| `services`     | The shared services the module uses: `database`, `auth`, `mailer`, `assets` |
| `assets`       | The static assets of the module, by name; needs the `assets` service        |
| `initialize`   | Optional. Runs once per host path before the router mounts                  |
| `createRouter` | Declares the routes and returns an Express router. Starts no work           |

`underpost new api <api-id>` copies the `default` module (or the `--from` module), so a new API
starts from this contract with its own `id`.

## Lifecycle

For each host path and each API in its `apis`, the runtime:

1. Loads `src/api/<api>/<api>.router.js` and checks its `ApiModule`.
2. Builds the services the module declares. A service the host path does not provide stops the module.
3. Loads the extension the host declares in `apiExtensions`.
4. Builds the context and freezes it.
5. Starts the module once per host path: it reads the declared assets, then awaits `initialize`.
6. Calls `createRouter` and mounts the router at `<path>/api/v1/<api>`.
7. Adds the own and the extension routes to the OpenAPI document of the host.

A module that fails a step is not mounted. The runtime logs the API, host and path with the cause, and
latches the runtime status as failed. The other modules of the host still mount. A failed start is
forgotten, so the next start tries again.

`initialize` holds the work that must end before the first request: required indexes, a seed, a
background worker. The user API builds its unique email and username indexes there; a duplicate
account stops the start and names the duplicate value. The Procedural Engine and the Saga Engine
start their workers there.

There is no `dispose` hook: the runtime has no shutdown lifecycle that would call it.

## Context

| Field         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `host`        | The host, such as `www.nexodev.org`                                 |
| `path`        | The host path, such as `/`                                          |
| `apiBasePath` | The path of the API contract below the host path, such as `/api/v1` |
| `consumes`    | Each API the host serves for another domain, with that domain       |
| `origins`     | The origins the host allows                                         |
| `services`    | The declared services only                                          |
| `extension`   | The extension of the host, when it declares one                     |

The identity fields are fields of the context: every service, CLI command and worker addresses
host-scoped state by `{ host, path }`. A controller passes the context to its service; a service passes
it to a helper that takes a host path.

## Services

| Service    | Gives                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------- |
| `database` | `getModel(name)`, `getConnection()` and `configuration()` of the host path, from its provider |
| `auth`     | `authenticate`, `requireUser`, `requireModerator` and `requireAdmin` from `auth.js`           |
| `mailer`   | `send(message)`, `template(name)` and `translation(name)` of the host path                    |
| `assets`   | `get(name)`: a declared asset of the module                                                   |

Each `require*` chain authenticates first, then checks the role. `registerCrudRoutes` takes its
default guards from the `auth` service. The `database` service reads the provider connection of
the host path; no module opens a second connection.

## Static assets

A module declares small immutable files, such as the images a mail link answers:

```js
assets: {
  check: { file: new URL('../../client/public/default/assets/mailer/api-user-check.png', import.meta.url), contentType: 'image/png' },
},
```

`src/server/domain/api-assets.js` reads each asset once per process, at module start, never on a
request. A request names an asset by its declared name only; another name answers 404 and never
reaches the file system. A handler that returns an asset answers it with its `Content-Type`,
`Cache-Control: public, max-age=86400, must-revalidate`, its `ETag` (304 when the client holds it) and
`Cross-Origin-Resource-Policy: cross-origin`. The CORS headers stay those of the host allowlist.

A static asset is not a File document. A File document is data a user stored in the database.

## Extensions

A host adds routes or hooks to an API with `apiExtensions: { "<api>": "<project>" }`. The module
`src/projects/<project>/<api>.extension.js` exports:

| Export         | Meaning                                            |
| -------------- | -------------------------------------------------- |
| `api`          | The API it extends; another value stops the module |
| `mount`        | `mount(router, context)` adds its routes           |
| `resolveKey`   | Optional. Resolves a key the API does not know     |
| `listParams`   | Optional. Rewrites the query of a list             |
| `beforeDelete` | Optional. Runs before the API deletes a document   |

The API calls `context.extension?.mount(router, context)` at its own extension point, so the order of
its routes does not change. The extension receives the context of its API, frozen. The OpenAPI
document lists the extension routes; for a consumed API it lists only those.

## Security

- **A token answers on its host path only.** The token check reads the session from the database of
  the host path that runs it, and refuses a token whose host or path differs. A recovery or
  verification token names no host path, so it is never an access token.
- **The service key is one secret of every domain.** A request with `DOMAIN_API_SERVICE_KEY` acts as
  a moderator named `service:<origin>`, and the caller declares the origin in `X-Domain-Origin`. The
  origin is a label, not a proof: each key holder can name any origin. One key per domain binds it.
- **No known administrator password.** The user API creates the first administrator only from
  `DEFAULT_ADMIN_PASSWORD`. Without it, or with the template value `changethis`, the bootstrap stays
  pending and the log says so. Two instances that start at once create one administrator.

## Tests

`test/support/api-module.js` builds a module through this contract: `testApiContext` gives the
declared services and lets a suite replace one, or the token check alone; `startTestApi` also starts
the module. `test/underpost/audit/api-modules.test.js` reads every router and extension source, and
`test/underpost/unit/api-module.test.js` builds every router with its declared services only.
