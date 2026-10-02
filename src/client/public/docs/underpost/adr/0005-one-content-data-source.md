# ADR 0005 — One content data source for every role

## Status

Accepted. Supersedes the authoring consequence of
[ADR 0003](0003-content-releases-over-database-drops.md).

## Context

A request with a moderator or admin token read the workspace database, and every other request
read the active release. Production builds releases only from `cyberia-content`, so its workspace
holds nothing a release serves. A moderator saw empty lists while players saw the release, and a
Studio change landed where no player and no game server could read it.

## Decision

Every reader of a runtime reads the database its content partition serves: the active release, or
the workspace while no release is active. Authentication selects permissions, never data. Guests
read, and moderators and admins change the active release through the existing APIs and guards.
The game servers rebuild from the same data through the existing hot reload.

A release is authoritative for the production baseline, not a read-only dataset. The next release
replaces the baseline from `cyberia-content` and keeps no live change. A live change becomes source
only through an explicit export and commit; nothing writes Git on its own.

## Consequences

- Equal reads from a guest, a user, a moderator and an admin return the same records.
- A live change is visible to every reader at once, and a cache write invalidates its namespace.
- A promotion discards the live changes of the release it retires; a rollback restores them.
- The workspace is the CLI's: it authors there, and `--from workspace` builds serve development
  only.
