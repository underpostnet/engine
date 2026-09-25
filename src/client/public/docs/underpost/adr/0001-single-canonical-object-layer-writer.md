# ADR 0001 — One canonical Object Layer writer

## Status

Accepted.

## Context

Several deployments hold Object Layer definitions: the authority at `objectlayer.org`, the
Cyberia host that authors content through its Studio, and any consumer that caches a definition
to serve it. A definition is identified by the hash of its canonical bytes, so two hosts that
each write their own copy can disagree about what a given identity contains only by producing
different bytes — but they can, and did, disagree about which copy is authoritative, which one
is pinned to IPFS, and which one a binding points at.

## Decision

`objectlayer.org` is the only writer of canonical content. Every other host keeps a `draft` of
its own authoring work or a `cache` copy of the authority's bytes, and publishes through the
authority's API. A copy's `origin` only moves up — `draft` → `cache` → `canonical` — so
publication never reverts. When the authority does not answer, the draft stays a draft and the
caller gets a publication error instead of a second canonical copy.

## Consequences

- A definition has one authoritative copy, and its identity resolves the same everywhere.
- A consumer cannot publish while the authority is unreachable; authoring degrades instead of
  forking.
- Consumers hold no canonical pin records: the MFS path of canonical bytes belongs to the
  authority alone.
- The rule is enforced in code, not convention: a test asserts that only the publication module
  writes a definition.
