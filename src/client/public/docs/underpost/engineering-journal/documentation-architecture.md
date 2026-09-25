# Documentation architecture

The authored documentation moved from four unrelated directories to one domain tree.

## Before

`cyberia-docs/` held nineteen files in `SCREAMING-CASE`, `object-layer-docs/` three,
`cryptokoyn-docs/` one, and `nexodev/docs/references/` twenty-four in `Title Case With Spaces`.
Two different mechanisms published Markdown to the same public directory: the Nexodev files were
authored inside a host's public directory and copied wholesale, while the others were declared in
client configuration and published by the documentation build. Discovery was flat, so a
subdirectory was invisible to it. Internal links resolved in the generated TypeDoc site, which
rewrites them, and resolved nowhere in the progressive web app, which navigated to a `.md` path
that was not a route.

## After

One tree under `src/client/public/docs`, one directory per domain, and the category as the second
directory: `overview`, `explanation`, `how-to` and `reference` for the product domains, and
`engineering-journal`, `lab-notes` and `adr` for this one. The path is the document's identity:
domain, category and slug all derive from it, so nothing restates them.

Discovery recurses, the build publishes each document under its own public path and writes a
manifest, and navigation is generated from that manifest rather than from links inside the prose.
A validator runs in the test suite and fails the build on a broken internal link, an unknown
category, a duplicate identity or a document the navigation does not reach.

## What this cost

Three documents carried several subjects and were split. Two documents were build inputs rather
than documentation — a package README and a CLI reference generated from the CLI's own help — and
they moved out of the authored tree or kept their generator pointed at the new path. Every code
path that named an old documentation file was updated with the move.
