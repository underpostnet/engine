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
├── cyberia-deployment   deployment state and content-lock.json
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
| `cyberia-deployment`       | Deployment conf, manifests and `content-lock.json`                      |
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

`cyberia instance --publish-build` writes `content-lock.json` into the deployment checkout: the
repository, version, source revision and digest of the artifact. The image build checks out that
source revision of `cyberia-content`, packs it, and runs `cyberia content status --lock` against
the lock before anything reads content.

`src/projects/cyberia/content-artifact.js` opens the artifact once per process. It fails, and
never falls back, when:

- the artifact or its manifest is missing, or the manifest is invalid;
- the manifest names no content version;
- the file list does not match the content digest, or a file does not match its digest;
- the schema is one this engine does not read;
- a lock names another artifact.

Every file is verified when it is read. The runtime data is frozen: one process shares it.

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

The import never overwrites what Studio authored:

- An Object Layer definition keeps its render. A rebind publishes new content as a new immutable
  definition and moves the label; a stored definition never changes in place.
- A quest or an action keeps its source map and cell.
- A map keeps its entities. A compiled map holds none: Studio places them.

`--saga <code>` imports one compiled saga the same way, then its `CyberiaSaga` record and its
instance. The instance conf references the entity-type defaults of every entity the saga places.
Only an insert writes the instance portal graph.

`cyberia instance <code> --import` restores an instance backup of the artifact.
`cyberia run-workflow import-content` imports every saga, every instance, then the foundation.
`cyberia content-release build` imports the artifact instances into a candidate release and records
the artifact identity in the ledger.

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
3. `cyberia instance --publish-build` records the new `content-lock.json` in the deployment
   checkout. Push both repositories: the image build reads the locked revision.

## Studio authoring

The foundation and the sagas leave two jobs to Cyberia Studio:

1. **Paint**: an artist draws each Object Layer item in the editor from its art brief.
2. **Place**: an author places the entities each map composes, sets the quest and action sources,
   and connects maps into an instance.

The map editor tracks each composition: an entry is met once the map holds an entity of its type
and item ids.
[Paint and place in the Studio](../how-to/paint-and-place-in-studio.md) describes both editors.
