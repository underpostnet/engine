# Underpost Build Manifest

The Underpost Build Manifest is the public build and bootstrap metadata of one client build. One
producer makes one manifest object for each application build, and delivers it in three copies with
the same bytes:

- The inline snapshot in every SSR document of the build.
- The file `underpost.manifest` at the application base path.
- The prelude of the service worker of the application.

## Relation type

The extension relation type `https://underpost.net/rel/build-manifest` (RFC 8288) names the manifest
of the application that serves the document. Three resources take part:

| Resource        | Location                                   | Media type         | Role                                       |
| --------------- | ------------------------------------------ | ------------------ | ------------------------------------------ |
| Relation type   | `https://underpost.net/rel/build-manifest` | `text/html`        | The relation specification, for people     |
| Target resource | `/underpost.manifest`                      | `application/json` | The manifest of the application, for tools |
| Inline snapshot | `<script id="underpost-build-manifest">`   | `application/json` | The bootstrap copy, read with no request   |

The `href` of the link identifies the manifest resource:

```html
<link rel="https://underpost.net/rel/build-manifest" href="/underpost.manifest" type="application/json" />
```

An application under `/test` links `/test/underpost.manifest`. The relation URI is stable and
lowercase. The relation is not `rel="manifest"`: that relation names a Web App Manifest.

The relation URI is also the location of its specification. `underpost.net` answers it with a
static page of the underpost client, `src/client/public/underpost/rel/build-manifest/index.html`,
whose canonical link is the URI. No other application serves that path, and no client fetches the
specification at startup.

## Inline snapshot

Every SSR document inlines the manifest in `<head>`, before any module script, as a JSON data block:

```html
<script id="underpost-build-manifest" type="application/json">
  {"schema":1,"application":"underpost",...}
</script>
```

`JSONweb` of `src/client-builder/client-formatted.js` serializes every copy. It escapes `<`, `>`,
`&`, U+2028 and U+2029, so no value can end the element. The file and the prelude hold the same
serialized bytes as the inline snapshot.

## Schema

`schema` is the version of the manifest format. It is independent of `version`, the version of the
build.

```json
{
  "schema": 1,
  "application": "underpost",
  "version": "v3.4.5",
  "build": { "id": "c9e7430b5dfd1362", "mode": "production" },
  "runtime": { "basePath": "/", "apiBasePath": "api/v1", "siteName": "Underpost" },
  "documentation": {
    "repository": {
      "owner": "underpostnet",
      "organization": "underpost",
      "name": "engine",
      "template": "pwa-microservices-template",
      "packageSuffix": "-ghpkg"
    },
    "coverage": [{ "id": "engine", "label": "Engine" }]
  },
  "serviceWorker": {
    "cachePrefix": "engine-core-root",
    "precache": ["/offline/index.html", "/maintenance/index.html"],
    "offline": "/offline/index.html",
    "maintenance": "/maintenance/index.html"
  }
}
```

| Field                      | Required | Content                                                                  |
| -------------------------- | -------- | ------------------------------------------------------------------------ |
| `schema`                   | yes      | The version of the manifest format: `1`                                  |
| `application`              | yes      | The client id of the build, or the page of a static build                |
| `version`                  | yes      | The Underpost engine version of the build                                |
| `build.id`                 | yes      | A digest of all other fields: builds of the same inputs have the same id |
| `build.mode`               | yes      | `production` or `development`                                            |
| `runtime.basePath`         | yes      | The application base path: `/` or a sub-path such as `/test`             |
| `runtime.apiBasePath`      | yes      | The versioned API contract: `api/v1`                                     |
| `runtime.apiBaseProxyPath` | no       | The proxy path of the API host, when it differs from the application     |
| `runtime.apiBaseHost`      | no       | The API host, when it differs from the application host                  |
| `runtime.apiHosts`         | no       | Endpoint to host, for each service that another domain owns              |
| `runtime.siteName`         | no       | The name that page titles end with                                       |
| `documentation`            | no       | The [documentation section](#documentation-section)                      |
| `serviceWorker`            | no       | The [service worker section](#service-worker)                            |

### Documentation section

The `documentation` section is a documented capability of the documentation UI. An application
build includes it. A static page omits it.

| Field                      | Content                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `documentation.repository` | `owner`, `organization`, `name`, `template`, `packageSuffix` and, for a deploy, `deployPackage`     |
| `documentation.coverage`   | The coverage reports the documentation menu offers: `id` and `label`, each at `/docs/coverage/<id>` |

The repository identity holds public GitHub names only. The client composes its release, Pages and
Coveralls links from them. The client reads repository and coverage data from this section only,
through `buildManifest()`.

### Service worker

The `serviceWorker` section configures the service worker of an application with views. The client
build writes the manifest before the worker bundle, as `self.buildManifest`, and the worker reads
this section and `runtime.basePath`.

| Field                       | Content                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `serviceWorker.cachePrefix` | `engine-core-<scope>`: `root`, or the base path with `/` as `_`                   |
| `serviceWorker.precache`    | The `index.html` URLs of the views flagged `offlineDefault`, `maintenanceDefault` |
| `serviceWorker.offline`     | The page the worker serves when the browser is offline                            |
| `serviceWorker.maintenance` | The page the worker serves when the server fails                                  |

### Evolution rules

- A new optional field or section keeps `schema`.
- A removed or renamed field, a changed type, or a new required field increments `schema`.
- A consumer reads the fields it knows and ignores all other fields.
- The `documentation` section follows the same rules: within one schema, its fields stay.

### Public data only

The manifest holds public data for build identification, runtime initialization and documented
client capabilities. It holds no credential, token, private key, secret environment value, private
source channel or private deployment data. It does not hold page metadata such as the title, Open
Graph or structured data: each SSR document carries those itself.

`src/client-builder/build-manifest.js` is the one producer of the object, its head tags, its file,
its service worker prelude and this relation page. It sets each field on purpose and copies no input
object as a whole. A new field goes there.

## Consumer behavior

`src/client/components/core/BuildManifest.js` resolves the manifest of the document in this order:

1. The inline snapshot. The first load makes no request.
2. The linked `underpost.manifest`, when the document has no inline snapshot.

The client parses the manifest once, checks it, and freezes it. `buildManifest()` then returns the
same object on each call. `PwaWorker.instance()` resolves the manifest before the application
starts. Code that runs before the bootstrap reads `developmentBuild()`, which is false until the
manifest resolves.

A manifest problem stops the bootstrap with an explicit error:

| Condition                                          | Error                                                        |
| -------------------------------------------------- | ------------------------------------------------------------ |
| The document neither inlines nor links one         | `The document neither inlines nor links a build manifest`    |
| The linked file is unreachable or answers an error | `Build manifest <url> is unreachable` or `answered <status>` |
| The inline snapshot is not JSON                    | `Build manifest #underpost-build-manifest is not JSON`       |
| The schema is not the schema the client reads      | `Build manifest <source> has schema <n>`                     |
| A required field is missing                        | `Build manifest <source> lacks <fields>`                     |

## Delivery

The static tier answers `underpost.manifest` with these headers:

- `Content-Type: application/json; charset=utf-8`
- `Cache-Control: no-cache`
- `ETag`, so a request with `If-None-Match` gets `304 Not Modified`

The URL is stable across builds, so a client keeps the representation and revalidates it on each
use. The manifest is never cached as immutable.

## Static output

`node bin static` follows the same contract: every page links its manifest, then inlines it, and
the build writes `underpost.manifest` at the site root.

- `--site-root <dir>` names the directory that the site serves at `--build-path`. It is the output
  directory by default.
- `--application <name>` names the application the manifest describes. It is the page component name
  by default. The pages of one site name one application, so they share one manifest, byte for byte.

The Cyberia status pages and the cyberia-server dashboard name `cyberia-server`: a status page at
`<site root>/<status>/index.html` writes the manifest at its site root.

The `--run-sv` preview server sends the manifest with the delivery headers.
