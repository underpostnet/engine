# ADR 0003 — Content releases instead of database drops

## Status

Accepted.

## Context

Cyberia content was replaced by dropping collections and re-importing them. That put the world
in a partial state for the length of the import, mixed authored content with player state in one
database, and made a rollback a second import rather than a switch. A deploy that failed halfway
left content no runtime could serve.

## Decision

Content is built as a versioned release. Authoring happens in a workspace database; a release is
materialised into its own database, validated, and promoted in one transaction. The runtime reads
the active release; a rollback repoints at the previous validated one. Player state lives in a
separate database that no content operation writes.

## Consequences

- A normal deploy never executes a destructive operation against active data.
- Promotion and rollback are atomic and verifiable on a real replica set.
- Retired releases are pruned deliberately, with the active release and the rollback target
  always kept.
- Authoring and serving can disagree safely: a moderator reads the workspace while players read
  the promoted release.
