# Saga Engine

The Saga Engine is the Cyberia Studio view that takes a saga from a narrative idea to a validated,
release-ready package. It decides and tracks what a saga needs. The domain engines do the work they
own:

| Owner                  | Owns                                                                                                   | Never owns                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Saga Engine            | The narrative context, the generations, the candidate packages, the completeness report, the workflow  | Pixels, item candidates, map populations, quest rules        |
| `cyberia-content`      | The canonical saga packages, the generator and its prompts, the content rules, the compiler, the build | Runtime candidates, CID bindings, workflow state             |
| Procedural Engine      | Item candidates, their review and promotion, map populations and their publication                     | Narrative definitions, quest progression, dialogue authoring |
| Action Engine          | The detail of quests, actions, dialogues and skills                                                    | Saga-wide orchestration                                      |
| `cyberia-saga` backend | The saga records, the memberships, the synchronization and the completeness report                     | Procedural implementation                                    |
| `cyberia-server`       | Gameplay and simulation                                                                                | Content generation and Studio workflow state                 |

The Saga Engine works only through the contracts of these owners. It never writes an Object Layer
definition, a catalog binding or a map: it opens the owner editor, or asks the owner API.

## A saga is not a world

A saga is a narrative layer over shared content. It is not an instance, a map or a namespace that
owns content:

- A world can host maps of several sagas.
- Several sagas can use one map, one item, one NPC skin and one environment item.
- A saga uses a definition of the foundation or of another saga by its id. It never defines it again.
- A saga never claims an item or a map it names, and editing or regenerating one saga never deletes
  or overwrites what another uses.

Membership is derived, never listed twice (`src/projects/cyberia/saga/saga-associations.js`). A map
belongs to the saga that defines it, to every stored saga that lists it as its map or its place, and
to every saga whose quests and actions stand on it. An item belongs to the saga that defines it, to every stored saga
that names it, and to the sagas of the maps and worlds that carry it. The report shows these
memberships on each row, with the worlds that hold each map.

A quest or an action holds one source map and cell. Several sagas share it only when they agree on
its provider skin and map; otherwise the synchronization refuses it
([Synchronize a saga](../how-to/synchronize-a-saga.md#one-provider-for-each-quest-and-action)).

## Places

A saga may play on a map that another saga or the foundation defines. Its package names that map in
`places`, by its definition id. The compiler gives the saga record `placeCodes` beside `mapCodes`, the
maps the saga defines:

- The source that defines a place stays its owner. The saga compiles no document of it, and an
  import never copies or replaces it.
- The saga gains a membership of the map, not its ownership. Several sagas can name one place.
- A quest or an action whose provider stands on a place takes that map as its source map.
- A place joins no world. Which world holds a map stays a decision of the Instance Studio.
- Removing a place from a package removes only that membership.

## Import into a world

`content import --saga <code>` adds a saga to a world and never replaces one. The default world is
the authoring world named after the saga: a convenience, not a world the saga owns. `--instance`
adds the saga to another world, such as a shared one. The import keeps every stored setting, map,
portal and reference, and adds only what is missing. A map that another world owns stays there,
because a map has one owner world. The import report names each world, conf and map operation
([CLI reference](../reference/cyberia-cli.md#import-a-saga)).

## The catalog

The first view of the Saga Engine is the catalog of the sagas a host holds. It reads each source on
its own and never merges them into one status:

| Source         | Tells                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Content source | The package exists in the `cyberia-content` checkout and can be edited               |
| Artifact       | The served artifact holds the compiled saga                                          |
| Workspace      | The `CyberiaSaga` record: imported as built, different from the build, or not stored |
| Release        | A selected content release holds the saga                                            |
| Workflow       | The stage of the newest Saga Engine workflow of the saga                             |

A row also shows the counts, the maps and items the saga shares, the worlds that hold its maps, and
how many of its maps are stored and its quests and actions placed. A stored saga opens without a
workflow: its report, its relationship graphs and its synchronization. A host with a packed artifact
and no content source shows the catalog and opens each saga, but it cannot edit a package or
generate.

## Relationship graphs

The report holds two graphs of the saga, each derived from validated content and stored documents:

- **Narrative**: the quests the saga starts with, who offers each quest and action, the quests each
  one unlocks, what each objective asks for, the rewards, and who speaks.
- **Content and worlds**: the maps the saga owns and its places, what each map composes, the items
  each entity carries, the other sagas that share a map, and the worlds that hold each map.

The graphs never draw the portal graph of a world: that is the Instance Studio's. A table of the same
relationships is the accessible alternative to each graph.

## The lifecycle

```text
Saga draft → semantic generation → JSON review and check → dependency analysis
  → item and asset readiness → map population and placement → providers and dialogues
  → gameplay and narrative audit → human corrections → content source check → release-ready
  → the content release pipeline
```

Each stage reports its own state, and a workflow resumes at any stage. A saga is complete when its
references, assets, maps, providers, dialogues, gameplay capabilities and release dependencies pass
their checks, not when the generator answers valid JSON.

## Workflows

A workflow (`cyberia-saga-workflow`) is workflow data. The canonical package stays in
`cyberia-content/src/content/sagas/<code>.json`.

- A workflow opens the package the content source holds for a saga, or starts empty.
- Each candidate is a revision of the package: the content file, a generation, or a moderator save.
  A candidate never changes; a new one is a new revision.
- A check runs the content rules on one revision and stores its findings, each with its JSON path.
- An apply writes a checked revision to the content file in canonical form. It refuses while the file
  holds content this workflow did not write.
- The history records each operation, its actor and its time. A cancel or a new generation deletes
  none of it.

## Generations

The generator of `cyberia-content` composes a saga in steps: the theme, six stages (composition,
maps, quests, dialogues, actions, abilities), then the package. A generation is a durable job:

- The request and its provenance (content version, artifact and checkout revisions, model) freeze
  when it is queued.
- A worker of the host claims it with a lease and runs one step at a time through
  `cyberia-content saga step`. It stores the state after a step only while it holds the lease.
- A worker that dies loses its lease when it expires. The next claim resumes at the first step not
  done: a completed stage never runs again.
- A step that fails runs again up to three times. A request the generator refuses fails at once.
- A cancel stops the running step and every later one.
- The package of a completed generation is the next candidate. It never replaces a candidate a
  moderator edited.

The Gemini key stays in the environment of the server. The browser never calls the generator.

## The completeness report

The report is deterministic: it reads the package as `cyberia-content saga check` compiles it, and
what the host stores. It gives one row per dependency with its status, what resolves it, and the
editor that owns it:

| Gate      | Checks                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Semantic  | The content rules: schema, references, duplicates, the quest graph, interactions                     |
| Narrative | Quest gates that exist, talk objectives answered by the quest talk dialogue, dialogue lines          |
| Gameplay  | Stored quests and actions, objective targets the runtime can advance, skills on runtime handlers     |
| Visual    | Bound, published, rendered items with their atlas; the entities each map composes, placed            |
| Spatial   | Each provider resolved without ambiguity or conflict; maps stored and in a world                     |
| Economy   | Market profiles stored; each buyback, burn and listing allowed by the economy of each world          |
| Release   | Applied, committed, built, imported, carried by the release with the sagas it uses and the item CIDs |

A row that a moderator leaves out on purpose keeps the reason and stops blocking its gate.

A talk objective needs its quest talk dialogue on the action of the talked NPC. Without it, the game
server completes the objective on any dialogue with that NPC, so the report blocks it.

## State boundaries

| State                | Means                                                   | Changes                        |
| -------------------- | ------------------------------------------------------- | ------------------------------ |
| Editor content       | Unsaved edits in the browser                            | Nothing on the server          |
| Workflow             | The narrative context, generations, candidates, history | Nothing outside the workflow   |
| Candidate            | A generated or edited package                           | Nothing until it is applied    |
| Content source       | The applied file in `cyberia-content`                   | The source of the next build   |
| Item candidate       | A revision under review in the Procedural Engine        | Never the active binding       |
| Approved item        | An exact CID a human approved                           | Not yet the binding            |
| Promoted item        | The active item-to-CID binding                          | The item the runtime runs      |
| Map population draft | Proposed items, defaults and placements                 | Never the live map             |
| Published population | The map, items and defaults its publication committed   | The runtime content of the map |
| Content release      | An immutable artifact, imported and promoted            | The content production serves  |

The Saga Engine never approves, promotes, publishes, commits, builds, imports, releases or deploys
on its own. Each of these is an explicit operation of its owner. A runtime CID binding is not proof
that a release carries an item: the release gate checks that a release instance or the global
content holds the bound CID.
