# Public Routes

A public route is a URL with a path parameter that names one resource, such as `/entry/<stableSlug>`
or `/object-layer/<cid>`. The resource has no file on disk. The server answers with the built shell
of the route namespace, and the client router reads the parameter.

## Routes

The client defines the routes in `PublicRoutes`. The server renders resource metadata for two of them.

| Route         | Path                  | Rendered from                                 |
| ------------- | --------------------- | --------------------------------------------- |
| `entry`       | `/entry/<stableSlug>` | The document API of the host                  |
| `objectLayer` | `/object-layer/<cid>` | The Object Layer authority, local or consumed |

A route with a renderer serves its shell with the title, description and social image of the
resource in the head. A route with no renderer serves the plain shell.

## Declaration

A host declares the routes it renders in `publicRoutes` of its `conf.server.json` entry:

```json
{
  "apis": ["core", "user", "file", "document"],
  "publicRoutes": ["entry"]
}
```

A host that omits `publicRoutes` renders no route. The server loads only the renderers a host
declares. A host that does not declare `objectLayer` never loads the Object Layer protocol.

## Checks

The server checks the declaration when it starts the host, and stops with the host name and the reason:

- A route name must be one of the table above, and must not repeat.
- `entry` needs a database, the `document` API in `apis`, and no `apiBaseHost`.
- `objectLayer` needs nothing from the host.
