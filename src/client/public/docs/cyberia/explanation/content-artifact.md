# Content artifact

Cyberia content lives in its own repository, `cyberia-content`. It creates the content: the
foundation, the instances, the sagas, the semantic generator and the validation rules. It compiles
all of it into one versioned artifact of data. The engine consumes that artifact: it imports,
releases and deploys it. It holds no content of its own.

Content defines what exists and how it functions. Cyberia Studio adds how it looks (render) and
where it is (placement). Nothing else is left to a human.

```
workspace (engine root)
├── cyberia-content      authored content ──build──► dist/ (the content artifact)
├── cyberia-deployment   deployment state and underpost.lock.json
└── engine               content-artifact.js
                             │
                             ├── cyberia instance --import / --export
                             ├── cyberia content import
                             └── cyberia content-release build (content-release.js)
                                          │
                                          ▼
                             MongoDB and the Object Layer
```

## Ownership

One owner for each concept. No module holds a second answer.

| Owner                      | Owns                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `cyberia-content`          | Foundation, instances, sagas, generator, compiler, validation, artifact |
| `cyberia-deployment`       | Deployment conf, runtime images, manifests and `underpost.lock.json`    |
| Object Layer               | Canonical, content-addressed item definitions                           |
| `CyberiaItemCatalog`       | The binding of a Cyberia item label to an Object Layer CID              |
| `CyberiaEntity`            | An entity of a map: item stack, runtime properties and cell             |
| `CyberiaMap`               | A map and its entities                                                  |
| `CyberiaInstance`          | The map topology: portal graph and player spawn                         |
| `CyberiaEntityTypeDefault` | The entity wiring one instance authors over the baseline                |
| `CyberiaSkill`             | The runtime skill of a trigger item                                     |
| `CyberiaInstanceConf`      | Simulation configuration and tuning                                     |

Runtime vocabularies that the server, the client and the editor share (item types, entity types,
skill LogicIds, the stat contract) stay in `SharedDefaultsCyberia.js`. `cyberia stat-contract`
generates the part content needs into `cyberia-content/src/schema/runtime-contract.json`, the same
way it generates the Go and C contracts. Content validates and generates against that file and
imports no engine code.

## Application assets

The engine owns application assets in `src/client/public`, including Cyberia and Underpost PWA files.
Image builds read these files from the engine source. Deployment publication does not copy them.

Private File Storage keeps large assets for authoring. Its manifests exclude application files tracked by the engine.
The deployment contains no public asset tree. Public source directories have no deployment volume mounts.

## The artifact

The artifact is `dist/`: the compiled document families of the foundation and of each saga, the
instance backups and a manifest. It holds no code; the engine reads and verifies it.

| Path                         | Holds                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `context.json`               | The context index: every definition and its references |
| `foundation/<family>.json`   | The compiled foundation, one file per document family  |
| `foundation/baseline.json`   | The entity-type defaults every world resolves against  |
| `sagas/<code>/<family>.json` | Each compiled saga, one file per document family       |
| `sagas/<code>/saga.json`     | Its `CyberiaSaga` record                               |
| `sagas/<code>/instance.json` | The shell of its instance                              |
| `instances/<code>/`          | Each instance backup                                   |

The manifest names:

| Field            | Holds                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `repository`     | `underpostnet/cyberia-content`                                       |
| `contentVersion` | The `cyberia-content` package version                                |
| `sourceRevision` | The commit the artifact was built from                               |
| `schemaVersion`  | The artifact layout; the engine reads `CONTENT_SCHEMA_VERSION`       |
| `contentDigest`  | The sha256 over the digest of every file                             |
| `build`          | The definition schema version and the digest of the runtime contract |
| `instances`      | The instance codes it carries                                        |
| `sagas`          | The saga codes it carries                                            |

The same commit always builds the same bytes. A build refuses uncommitted content.

## Acquisition

The engine resolves two checkouts only when an operation needs them. Every other operation runs
without them.

| Root                | Variable                  | Default                            |
| ------------------- | ------------------------- | ---------------------------------- |
| Content artifact    | `CYBERIA_CONTENT_ROOT`    | `cyberia-content` in the engine    |
| Deployment checkout | `CYBERIA_DEPLOYMENT_ROOT` | `cyberia-deployment` in the engine |

In development, the content root is the `cyberia-content` checkout: run
`node bin/cyberia-content.js build` there after a commit. The content root can also be a packed
artifact: `cyberia-content pack` writes the same `dist/` into a tarball, and its extracted copy
has the same layout. A registry, an OCI image or a release asset can carry that tarball later; the
engine reads it the same way.

A source checkout takes writes: `cyberia instance --export` writes into its instance sources by
default, and `cyberia stat-contract` writes its runtime contract. A packed artifact has no sources,
so nothing writes into it.

## Verification

`cyberia release lock` pins the content in `underpost.lock.json` of the deployment checkout: the
repository, the source revision, and the version and digest of the artifact. Nothing else writes
it, so a deploy consumes the lock as it is. The lock names no source channel: a deploy fetches the
pinned revision from the channel it runs on, and the image build from the public repository. The
image build checks out that revision, packs it, and runs `cyberia release verify` before anything
reads content.

`src/projects/cyberia/content-artifact.js` opens the artifact once per process. It fails, and
never falls back, when:

- the artifact or its manifest is missing, or the manifest is invalid;
- the manifest names no content version;
- the file list does not match the content digest, or a file does not match its digest;
- the schema is one this engine does not read;
- a lock names another artifact.

Every file is verified when it is read. The runtime data is frozen: one process shares it.

## The release copy

A release database holds a copy of the files a running engine reads: the manifest, the context
index, the foundation and the sagas. It holds no instance backup: only an import reads them.

A running engine reads the artifact of the content it serves:

- While a release is active, it reads the copy that release holds. A promotion and a rollback
  change the copy with the database.
- While the workspace serves, it reads the artifact on disk.

The copy is verified as the artifact on disk is. Its content digest must be the one the release
records. A release whose copy does not load fails every read of the artifact, and
`GET /api/v1/cyberia-content-release/active` reports it as not serving. The engine loads the copy
again on the next watch.

## Document families

The compiler of `cyberia-content` turns every definition into runtime documents. The engine lists
the families in `CONTENT_FAMILIES`, in import order: a family names only what an earlier one holds.

| Family                 | Model                         | Holds                                                   |
| ---------------------- | ----------------------------- | ------------------------------------------------------- |
| `object-layers`        | Object Layer and item catalog | One item per labeled definition, without render         |
| `entity-type-defaults` | `CyberiaEntityTypeDefault`    | Live, dead, drop and inventory items, and the behavior  |
| `skills`               | `CyberiaSkill`                | The skill of each item whose ability names a handler    |
| `maps`                 | `CyberiaMap`                  | Each map: name, description and biome tags; no entities |
| `quests`               | `CyberiaQuest`                | Steps, objectives and rewards, with no source           |
| `dialogues`            | `CyberiaDialogue`             | Item flavor text, character greetings and quest talk    |
| `actions`              | `CyberiaAction`               | Shop, recipes, storage and quest talk, with no source   |

The engine also reads two foundation families without a database. The baseline completes the
entity-type defaults of every world. The skills and dialogues answer for a world that stores none.

A saga compiles to the same families. Its entity-type defaults also cover each foundation entity
its maps place.

The context index, `context.json`, is derived at build time. It holds every definition of the
foundation and the sagas, where each one comes from, the item label and the map entity it answers
to, and every reference in both directions with the field that makes it. The Studio editors read
it through `src/projects/cyberia/foundation-context.js`: one definition in full, the rest as
summaries.

## Import

`cyberia content import` writes the foundation families into the operational models, in order.
Each document has a natural key: a label, an entity type and its live items, a trigger item, a
code, or a dialogue code with all of its lines. A document that is absent is inserted. A document
that holds the same content is in sync. A document that differs is kept and reported; `--rebind`
moves it to the artifact. `--dry-run` prints the plan and writes nothing. Every run is idempotent.
`--release <id>` writes into that content release database instead of the workspace.

An Object Layer definition is identified by its cid, never by its item id: an item id is a label,
and several definitions can carry it. The catalog binds each label to one cid. The import plans
each artifact item against the definition its label is bound to:

- **absent**: the label has no binding. The import writes the definition and binds the label.
- **in sync**: the bound definition holds the same content.
- **differs**: the bound definition holds other content. It is kept and reported; `--rebind`
  publishes the artifact content as a new definition and moves the label. The earlier definition
  stays.

Studio's work stays: a written definition keeps the render of the bound one, a quest or an action
keeps its source map and cell, and a map keeps its entities. A compiled map holds none: Studio
places them.

`--saga <code>` imports one compiled saga the same way, then its `CyberiaSaga` record and its
instance. The instance conf references the entity-type defaults of every entity the saga places.
Only an insert writes the instance portal graph.

`cyberia instance <code> --import` restores an instance backup of the artifact, and it needs the
foundation in the store:

- An Object Layer item of the backup is published under its cid, and the label binds to it. No
  other definition of the label is removed: a quest or an action of another instance that pins
  another cid keeps it.
- A map, quest, action, skill, dialogue, saga, audio asset, instance and instance conf of the
  backup replaces the stored document of its key.
- An entity-type default of the backup replaces each stored default of the same entity type and
  live items that no other instance conf references. Another world keeps its own default.

## Release content

`src/projects/cyberia/release-content.js` declares what a release carries: the foundation, the
release sagas and the release instances, each instance with the public path that serves it.

```json
{
  "foundation": true,
  "sagas": ["amethyst-strata-expansion"],
  "instances": [
    { "path": "/", "instanceCode": "amethyst-strata-expansion" },
    { "path": "/test", "instanceCode": "test" }
  ]
}
```

Every content initialization imports this set, in one order:

1. The foundation.
2. The release sagas, with `--rebind`: each one moves what it holds to the artifact.
3. The release instances: each one restores what it holds.

The import takes only the declared sagas and instances. It fails before it writes when the
artifact lacks one of them, and it never imports another saga or instance that the artifact holds.
An import starts only once the one before it succeeded, so a failed foundation import stops the
instances. `src/projects/cyberia/content-release.js` holds that order, and every path runs it:

| Path                                  | Store                       | Imports                                                                        |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `cyberia content-release build`       | An empty candidate database | The release copy, the foundation, the release sagas, then the served instances |
| `cyberia run-workflow import-content` | The workspace               | The foundation, the release sagas, then the release instances                  |
| The content job of the Docker stack   | The workspace               | As `import-content`                                                            |

A release build always starts from an empty candidate database, so the release is a function of
the source revision, the release content and the release configuration alone. The workspace is a
mutable development store: there an import upserts, and the plan statuses decide what it writes.

`cyberia content-release` builds the artifact from the locked revision in a release workspace and
records its source and the artifact in the ledger. See [Content releases](content-releases.md).

## Audit

`cyberia content audit` reads an instance backup or the live database and classifies every item
label it names or stores:

- **foundation**: the artifact owns it, planned against the stored definition: `in-sync`,
  `differs` (with the fields), or `absent`.
- **generated**: a saga owns it.
- **unresolved**: nothing owns it yet. Define it in `cyberia-content`.

## Changing content

1. Author in the portal, then `cyberia instance <code> --export`. The export lands in the
   `cyberia-content` checkout as source content.
2. In `cyberia-content`: validate, commit, increment the version, build.
3. `cyberia release lock --commit` pins the new revision in the deployment lock, and
   `cyberia release publish` pushes the checkouts, the deployment last. A deploy from the private
   channel mirrors the pinned revision to the public repository once the release serves.

## Studio authoring

The foundation and the sagas leave two jobs to Cyberia Studio:

1. **Paint**: an artist draws each Object Layer item in the editor from its art brief.
2. **Place**: an author places the entities each map composes, sets the quest and action sources,
   and connects maps into an instance.

The map editor tracks each composition: an entry is met once the map holds an entity of its type
and item ids.
[Paint and place in the Studio](../how-to/paint-and-place-in-studio.md) describes both editors.
