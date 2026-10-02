# ADR 0004 — Source channels and release profiles

## Status

Accepted. Builds on [ADR 0003](0003-content-releases-over-database-drops.md).

## Context

The content release ran inside the pod that serves players, through `kubectl exec`, and only the
content and deployment checkouts followed the private repositories; the server, the client and
audio always came from the public ones. A first correction gave every repository one generic
release lifecycle and treated a private source as a validation lane that stopped short of
production. Neither matched what the repositories need: a private source is the same product
before publication, and most repositories have no release state at all.

## Decision

A source channel — `public` or `private` — selects only the repository an exact revision is
fetched from. It is provenance, never a lifecycle, an environment or a target. Every deploy
resolves every repository through the same channel to an exact revision.

The deployment repository pins that revision for every other repository in one source lock,
`underpost.lock.json`, with the version and digest of each built artifact. A repository never pins
itself, so the deployment is the one source a deploy takes at its branch tip.

Each repository has one release profile:

| Profile               | Repositories                          | Execution                        | Artifact            |
| --------------------- | ------------------------------------- | -------------------------------- | ------------------- |
| `application-release` | the engine                            | the existing deploy flow         | runtime image       |
| `data-release`        | `cyberia-content`                     | ReleaseWorkspace and Release Job | content in MongoDB  |
| `container-release`   | `cyberia-server`, `cyberia-client`    | CI image, or a build on the host | OCI image digest    |
| `source-sync`         | `cyberia-audio`, `cyberia-deployment` | an exact checkout on the node    | filesystem snapshot |

Only the data release keeps a lifecycle ledger and a Release Job, because only it fills a
candidate database that is validated before it serves. The Job runs the deployed image, reads one
Secret projected from the `data-release` configuration scope, and builds the content with the
repository's own commands.

A release from the private channel is a production release. Once it serves, the host mirrors its
exact revisions to the public repositories, fast-forward only. A failed mirror is reported; the
release stays as it is.

## Consequences

- A serving pod runs no release stage.
- Private and public releases run the same workflow; the channel is recorded, never branched on.
- One release id names one source: the same revision from either channel is the same release.
- A deploy ships the revisions the deployment lock pins; a change ships once it is locked.
- One data release executes at a time per deployment, whatever its channel.
- A container release deploys an image by digest; the private channel builds it on the node.
- A repository declares only its profile; its build stays in its own scripts and Dockerfile.
- The Release Job holds no GitHub credential; Git credentials stay on the host.
