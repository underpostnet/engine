# ADR 0002 — One versioned API contract

## Status

Accepted. Supersedes the configurable `BASE_API` path.

## Context

The API path was configuration. A deployment could set `BASE_API`, and separately an unversioned
`/api/<api>` route was mounted beside the versioned one. Three runtimes — the Node engine, the Go
game server and the C client — each carried their own idea of where an API lived, and a mismatch
between them produced a 404 that read as a missing feature rather than a wiring error.

## Decision

Every first-party API lives at `/api/v1/<api>`. `DOMAIN_API_VERSION` in the API contract module
is the only authority for the version, `API_BASE_PATH` derives from it, and the unversioned route
does not exist. No configuration key sets the path. The Go and C runtimes carry the same constant,
and a test asserts all three agree.

## Consequences

- One path, in one place: a version change is a single edit with a failing test until every
  runtime follows.
- No compatibility aliases, redirects or dual mounting; a caller on an old path fails loudly.
- Cross-domain clients build their URL from the contract rather than from configuration.
