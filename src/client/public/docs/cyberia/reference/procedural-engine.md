# Procedural Engine reference

The API, the records and the settings of the Procedural Engine. The model is in
[Procedural Engine](../explanation/procedural-engine.md).

## API

Every route needs a moderator, except the reads of the profile API and its configuration. The base
is `/api/v1/<api>`.

| Method and path                         | API                           | Does                                                                                        |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /config`                           | `cyberia-procedural-profile`  | Answers the modes, generators, templates, palettes and limits.                              |
| `GET /templates/:id/palette`            | `cyberia-procedural-profile`  | Answers the palette a create starts from with a Genesis Template.                           |
| `GET /templates/:id/random-slots`       | `cyberia-procedural-profile`  | Answers random colors for the slots of a Genesis Template.                                  |
| `GET /`, `GET /:profileId`, `POST /`    | `cyberia-procedural-profile`  | Reads profiles. A moderator stores a profile over its stored copy.                          |
| `POST /`                                | `cyberia-procedural-job`      | Stores a job for a request. An equal spec answers the same job.                             |
| `GET /sources`                          | `cyberia-procedural-job`      | Lists the existing items an update can target. Paginated.                                   |
| `GET /sources/:itemId/palette`          | `cyberia-procedural-job`      | Answers the palette an update starts from for one item.                                     |
| `GET /`                                 | `cyberia-procedural-job`      | Lists jobs, newest first. Paginated.                                                        |
| `GET /:jobId`                           | `cyberia-procedural-job`      | Answers the job and its persisted counts.                                                   |
| `GET /:jobId/items`                     | `cyberia-procedural-job`      | Lists the candidates. Paginated.                                                            |
| `GET /:jobId/items/:itemId`             | `cyberia-procedural-job`      | Answers the candidate, its job and its audit trail.                                         |
| `POST /:jobId/cancel`                   | `cyberia-procedural-job`      | Cancels the workflow of the job.                                                            |
| `DELETE /:jobId`                        | `cyberia-procedural-job`      | Deletes a job with its audit. Answers `{ stopped, candidates, drafts, audit }`.             |
| `POST /:jobId/items/:itemId/regenerate` | `cyberia-procedural-job`      | Queues the candidate again under a new seed.                                                |
| `POST /:jobId/items/:itemId/approve`    | `cyberia-procedural-job`      | Approves the revision `{ cid }` names.                                                      |
| `POST /:jobId/items/:itemId/reject`     | `cyberia-procedural-job`      | Rejects the current revision.                                                               |
| `POST /:jobId/items/:itemId/edit`       | `cyberia-procedural-job`      | Opens the candidate for edit. Answers the review context.                                   |
| `POST /:jobId/items/:itemId/promote`    | `cyberia-procedural-job`      | Promotes the approved candidate to its target item.                                         |
| `POST /:jobId/promote`                  | `cyberia-procedural-job`      | Promotes every approved candidate. Answers `{ promoted, failed }`.                          |
| `GET /`, `GET /:id`                     | `cyberia-procedural-job-item` | Reads candidates. `?jobId=`, `?targetItemId=`, `?status=` filter.                           |
| `GET /`                                 | `cyberia-procedural-audit`    | Reads the trail. `?jobId=`, `?jobItemId=`, `?populationId=`, `?itemId=`, `?action=` filter. |

The map population API is `cyberia-procedural-population`:

| Method and path                                    | Does                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /maps`                                        | Lists map summaries. Paginated.                                                               |
| `GET /maps/:code`                                  | Answers the map context a population reads now. Stores nothing.                               |
| `POST /`                                           | Creates a population of `{ mapCode, seed? }`. Equal inputs answer one population.             |
| `GET /`, `GET /:id`                                | Reads populations with each item, the item groups and the state of each step.                 |
| `GET /:id/impact`                                  | Answers where each item runs now besides the map, and its impact.                             |
| `POST /:id/targets`                                | Adds `{ itemId, stage?, itemType?, cid? }`, or restores a removed item with its results.      |
| `PATCH /:id/targets/:itemId`                       | Sets `{ resolution?, templateId?, palette?, variation? }` of an item, at any time.            |
| `DELETE /:id/targets/:itemId`                      | Removes an item from the population, from any source: `{ reason? }`. Its runs stop.           |
| `DELETE /:id/removed/:itemId`                      | Forgets a removed item permanently: only its entry in the removed list goes.                  |
| `POST /:id/targets/:itemId/reset`                  | Resets the workflow of an item to a clean start, and reports what went and what stayed.       |
| `GET /:id/targets/:itemId/results`                 | Lists the results of an item with the actions each takes, and how many it keeps of the limit. |
| `POST /:id/targets/:itemId/results/delete`         | Deletes the results `{ ids }`, and reports what went, what stayed and what failed.            |
| `GET /:id/targets/:itemId/definitions`             | Lists the stored definitions a draft of the item can continue from, newest first. Paginated.  |
| `POST /:id/targets/:itemId/generate`               | Stores `{ count? }` runs, 1 to 4, from the configuration as it is.                            |
| `POST /:id/targets/:itemId/select`                 | Uses the generated result `{ entryId, cid }`; the result selected before returns to ready.    |
| `POST /:id/targets/:itemId/entries/:entryId/retry` | Runs a failed result again under its own seed.                                                |
| `POST /:id/palette/preview`                        | Answers what `{ itemIds, source, paletteId?, overrides }` gives each item.                    |
| `POST /:id/palette`                                | Applies that change, exactly as its preview answers.                                          |
| `GET /:id/draft`, `PUT /:id/draft`                 | Reads or saves the map draft: grid and placements. The live map does not change.              |
| `DELETE /:id/draft`                                | Discards the draft. The composition starts again from the live map.                           |
| `POST /:id/draft/rebase`                           | Moves the draft onto `{ mapRevision }` the moderator reviewed.                                |
| `GET /:id/defaults`                                | Answers the defaults workspace: the stored defaults that name the staged items.               |
| `POST /:id/defaults`                               | Adds the stored default `{ rowId }` to the workspace. The default does not change.            |
| `DELETE /:id/defaults/:rowId`                      | Removes a default from the workspace. The default does not change.                            |
| `POST /:id/validate`                               | Answers what a publication would do now, or why it would stop. Stores nothing.                |
| `POST /:id/publish`                                | Starts the publication of the reviewed revision: `{ revision, acknowledged? }`.               |
| `POST /:id/publication/retry`                      | Resumes the phase of the publication that failed.                                             |
| `POST /:id/publication/cancel`                     | Cancels the publication before its commit.                                                    |
| `POST /:id/cancel`                                 | Stops the active work of the job of each target. Deletes nothing.                             |
| `DELETE /:id`                                      | Deletes the population and the jobs of its targets. A publication keeps what it wrote.        |

The lists of jobs, sources and candidates filter and sort on the server. `filterModel` and
`sortModel` are the AG Grid models, and `page` and `limit` page the answer. A column names its
field: `spec.mode`, `spec.variation.level`, `status`, `targetItemId`, `diversity.score` and so on.
`GET /sources` filters and sorts `itemId`, `itemType`, `hasRender`, `currentCid` and `updatedAt`.
Each row also has `artDirection`, `biome` and `palette` from the content foundation: `palette` lists
the base colors of the foundation palettes of the item.

`GET /sources/:itemId/palette` (a moderator) and `GET /templates/:id/palette` of
`cyberia-procedural-profile` (everyone) answer `{ templateId, palettes, slots }` for an existing item
or for a Genesis Template. `?paletteId=` names a palette of the library; an id the library does not
hold, and `random`, which has no default, answer 400. `templateId` is the Genesis Template the target takes. `palettes`
lists the foundation palettes of an item, each `{ id, name, group }`: `foundation` for the colors its
art brief names, `biome` for the palette of a biome it belongs to; a template has none. `slots` gives
each slot its default `{ color, origin }`. Origin `palette` or `foundation` is a color of the palette
or of the foundation palettes, which stays as it is. Origin `render` or `template` is where
an automatic color starts; the palette variation moves it. `?fromTemplate=true` answers the palette of
an item that starts from its template, not from its render, and `?templateId=` names the template it
takes. An item that is not a Cyberia item here answers 404.

`GET /` of `cyberia-procedural-job` lists item generations only. The job of a target of a map
population answers 409 to `promote`, `POST /:jobId/promote` and `DELETE`: its population owns them.

`approve` takes `{ cid, reason? }`. A cid that is not the current revision answers 409, and so
does a revision that failed technical validation, and a second approved candidate of one target
item. `promote` answers 409 when the target item changed since the run (an update), when the
proposed item id is taken (a create), when the approval does not cover the current revision, or when
the authority answers another definition than the approved revision.
`cancel` answers 409 when the job has no active work. `DELETE` takes a job in any status. It stops
the active candidates of the job first (`stopped` counts them), then removes the candidates and
every revision no item runs or ran with every record the Object Layer purge removes (`drafts` lists
their CIDs), and the audit trail of the job (`audit` counts it). A revision this host published goes from the Object Layer
authority too, through `DELETE /api/v1/object-layer/purge/:cid` with the service key. A revision
another job names, or that ItemLedger registers, stays.

`GET /config` answers:

| Field        | Holds                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generators` | `id`, `itemType`, `modes` and `profile`: `profileId`, `regionOrder` and `protectedRegions`                                                               |
| `templates`  | Each Genesis Template: `id`, `name`, `description`, `itemType`, `canvas`, `roles`, `slots`, `slotColors`, `frames`, `baseline`, `problems` and `preview` |
| `palettes`   | `families`, in order, and every palette of the library, verified and ordered                                                                             |
| `limits`     | `maxCandidates`                                                                                                                                          |
| `content`    | `sourceRevision` of the served artifact, `checkoutRevision` of the content checkout, and `stale` when the checkout holds a newer commit                  |

`roles` gives each role its `regions`, the palette role it takes (`palette`) and `artDirection`.
`slots` lists the color slots of a template, each `{ id, role, tone }`. `slotColors` gives the color
of each slot in the template, as `#rrggbb`. Every palette fits every template. `problems` lists what stops it from serving the profile of its generator; a template with a
problem cannot run. `frames` counts the frames of each direction code; `baseline` is the frame
baseline of its item type. A template content holds in a broken form shows only its identity and the reason.
`preview` is the base item a create draws from it, as wire render frames, every frame of every
direction. A profile id has one stored copy: storing a profile removes any other copy of its id.

`content` tells a missing template apart from content the engine does not serve yet. On a host with
a `cyberia-content` checkout, a commit the served artifact does not hold makes it `stale`: build
`cyberia-content` and release it.

`GET /templates/:id/random-slots` answers `{ slots }`: a color for each slot of the Genesis Template,
in one OKLCH hue harmony. Each base keeps the lightness of its template color, and its shadow and
highlight derive from it. Roles with the same template color get the same color, and the outline
stays dark. Each call gives new colors. It is a preview: a run never draws from it.

A manual edit is not a Procedural Engine route. The Object Layer Studio saves with
`PUT /api/v1/object-layer/:id` and a `review` field in the body that holds the id of the candidate.
The server stores the save as a draft revision of that candidate and promotes nothing.

Every Studio save checks its stats (`checkStats` in `src/projects/cyberia/object-layer.extension.js`).
A body with `statBounds` declares custom bounds: each stat `[min, max]`, whole numbers inside the stat
contract, -100 to 100, the minimum not above the maximum (`customStatBounds`). The stats must lie
inside them. A body without it holds them inside the bounds of the item type (`statBoundsForType`).
A stat outside, or a custom range that is not valid, answers 400 and names the stat.

The editor import is `POST /api/v1/object-layer/import-frames`. The body is
`{ id, palette, mutate, mutationFactor, seed, target }`: `target` is the item the frames go to.
Without `mutate`, the server answers the frames of `id` as stored. With `mutate`, it remaps them to
the palette of the import and mutates their contour with the seed. The palette has one color for
each import slot, the roles of a palette of the library: `primary`, `secondary`, `detail`,
`feature`, `outline` and `accent`. `palette` is `{ paletteId?, slots? }`: the palette of the
library `paletteId` names, else the foundation palettes of `target`, else the first palette of the
library, under the colors `slots` sets (`importRoles` in `src/projects/cyberia/procedural/spec.js`).
The remap takes the outline, the four palette roles as one lightness ramp, and the accent. An
unknown palette id, slot or color answers 400. The server stores nothing, and the source definition
never changes.

`GET /api/v1/cyberia-procedural-profile/import-palette?itemId=&paletteId=` answers what the Studio
shows of that palette: `{ templateId: '', palettes, slots }`, `palettes` the foundation palettes of
the item and each slot `{ color, origin }` with `origin` `foundation` or `palette`.

## Generation request

A request has a `mode`. The fields of each mode, and no others, are valid. The server answers 400
for any other field, and for a source in a create.

Update:

```json
{
  "mode": "update-existing",
  "source": { "itemIds": ["worker", "violet"] },
  "output": { "variantsPerItem": 3 },
  "palette": {
    "items": [
      { "itemId": "worker", "paletteId": "exotic-teal", "slots": { "hair.base": "#5a3a22" } },
      { "itemId": "violet", "paletteId": "random" }
    ]
  },
  "variation": { "level": 0.65 },
  "seed": { "mode": "auto" }
}
```

Create:

```json
{
  "mode": "create-new",
  "itemType": "skin",
  "template": { "id": "skin.humanoid" },
  "palette": { "paletteId": "exotic-teal", "slots": { "torso.highlight": "#5a7fb8" } },
  "output": { "variants": 10, "itemIdPrefix": "skin-generated" },
  "variation": { "level": 0.65 },
  "seed": { "mode": "auto" }
}
```

| Field                 | Meaning                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `source.itemIds`      | Update only. At least one existing item, each once. They share one item type.                                  |
| `source.fromTemplate` | Update only. Optional. Items of `source.itemIds` that start from the template: their render is replaced.       |
| `itemType`            | Create only. The item type to make.                                                                            |
| `template`            | Optional. The Genesis Template to start from. Default: the first usable one of the type that fits.             |
| `generator`           | Optional `{ id }`. Default: the generator of the item type.                                                    |
| `palette`             | Optional. A create takes one palette choice for the run: `{ paletteId, slots }`.                               |
| `palette.items`       | Update only. Optional. `{ itemId, paletteId, slots }` for items of `source.itemIds`, each once.                |
| `paletteId`           | Optional. A palette of the library, or `random`. None keeps the defaults.                                      |
| `slots`               | Optional. Slot id → `#rrggbb`. A slot left out takes its default.                                              |
| `output`              | Update: `variantsPerItem`. Create: `variants` and `itemIdPrefix`, or `itemIds`. At most 200 candidates in all. |
| `variation.level`     | 0 to 1, inside the bounds of the profile. Default 0.5.                                                         |
| `seed`                | `{ "mode": "auto" }`, or `{ "mode": "fixed", "value": n }` with n from 0 to 2^32 - 1.                          |
| `parameters`          | Optional operator settings of the generator. `variation` is not one: use `variation.level`.                    |

The new items of a create are named `<itemIdPrefix>-001`, `-002` and so on. `output.itemIds` names
each new item instead, one candidate each.

The stored spec resolves everything the request left out, and holds in full what the job runs. It
has `mode`, `itemType`, `generator`, `profile` (the whole profile), `templates` (each Genesis
Template the job uses), `palette`, `palettes` (each palette the job uses), `baseline` (a
create only: the item id, `activable` flag and stats a new item starts from), `sources`,
`candidates`, `output`, `variation`, `seed` and `parameters`. `sources` lists each target item with
its CID, whether it has a render, its art direction (`brief`, `requiredVariants`, `palettes` and
`references`), its template id and its `origin`: `render` when the candidate starts from the render
of the item, `template` when it starts from the template. The `palette` of an update keeps the `items` that make a choice,
in the order of `source.itemIds`. `candidates` lists each candidate with its position, its target
item id, its source CID, its template id and its palette id: the palette its choice names or the
seed picked, else empty. The spec never changes after creation.

`skin-variant` parameters:

| Parameter                                                                                        | Meaning                                                                                |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `silhouetteVariation`, `regionVariation`, `hairVariation`, `detailVariation`, `paletteVariation` | The budget of each operator. Each defaults to `variation.level`.                       |
| `hairStyle`                                                                                      | `auto`, or `short`, `medium`, `long`, `left-heavy`, `right-heavy`, `messy`, `layered`. |
| `minDiversity`                                                                                   | The least distance from the source and the siblings. Default: the profile.             |

A creation answers 400 for a request the engine cannot run, and 404 for an item that is not a Cyberia
item here. A create answers 409 for an item id that a definition or a live candidate already holds.

## Genesis Template

`cyberia-content` holds each one at `procedural/genesis-templates/<itemType>.<slug>.json`.

| Field             | Meaning                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `<itemType>.<slug>`, the id a create names                                                                                                          |
| `name`            | The label of the template                                                                                                                           |
| `description`     | What the template draws                                                                                                                             |
| `itemType`        | The item type it draws                                                                                                                              |
| `canvas`          | `{ width, height }` of the frames the template draws                                                                                                |
| `frameDurationMs` | The frame duration of a render that starts from the template                                                                                        |
| `outline`         | The outline color as `#rrggbb`                                                                                                                      |
| `legend`          | Letter → region id. `.` marks no region.                                                                                                            |
| `roles`           | Role → `{ regions, palette, tones: { shadow, base, highlight }, artDirection }`. Each region is in one role; `palette` is the palette role it takes |
| `directions`      | Direction code → its frames in play order; a frame is one string per row, one letter or `.` a cell                                                  |

The engine verifies a template when it reads it (`src/projects/cyberia/procedural/templates.js`):
its item type, and a rank in the profile for each of its regions. Content validation checks the
structure of each direction: a direction code, at least one frame, and rows that fit the canvas and
the legend. Neither checks the frame count.

`RENDER_FRAME_CONTRACT` of the shared vocabulary is the frame baseline of each item type. The shipped
templates start from it, and `templates` of the configuration answers it as `baseline` next to the
`frames` of each template. It is a suggestion, never a rule.

| Item type  | Idle frames                         | Walking frames                      |
| ---------- | ----------------------------------- | ----------------------------------- |
| `skin`     | 1 each in `08`, `02`, `04` and `06` | 2 each in `18`, `12`, `14` and `16` |
| `floor`    | 1 in `08`                           | none                                |
| `portal`   | 3 in `08`                           | none                                |
| `obstacle` | 3 in `08`                           | none                                |

The first digit of a code is the animation (`0` idle, `1` walking), the second the facing (`8` down,
`2` up, `4` left, `6` right): `OBJECT_LAYER_DIRECTIONS` of the Object Layer protocol.

## Palette

`cyberia-content` holds each palette of the global library at `procedural/palettes/<slug>.json`. A
palette belongs to no item type.

| Field         | Meaning                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `id`          | A slug, the id a request names                                                                      |
| `name`        | The label of the palette, unique in the library                                                     |
| `family`      | `natural`, `dark`, `light`, `warm`, `cool`, `biome` or `exotic`                                     |
| `biomeTags`   | The foundation biomes the palette suits, by slug                                                    |
| `roles`       | `primary` and `outline`, and any of `secondary`, `detail`, `feature` and `accent`, as `#rrggbb`     |
| `constraints` | `minContrast` and `contrastRoles`: the least OKLab distance of those palette roles from the outline |

Each role of a Genesis Template names in `palette` the palette role it takes, so every palette colors
every template (`paletteRoles` in `src/projects/cyberia/procedural/palettes/resolver.js`). A role
whose palette role the palette does not give keeps its default: the foundation palettes, the render
or the template. A `contrastRoles` entry must be a palette role the palette gives. The engine
verifies each palette, the contrast among the checks, when it reads the catalog
(`src/projects/cyberia/procedural/palettes/catalog.js`).

## Profile

| Field                          | Meaning                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `profileId`                    | Identity. One stored profile for each id.                                                |
| `generatorId`                  | The generator the profile drives.                                                        |
| `itemType`                     | The item type the profile makes.                                                         |
| `regionOrder`                  | Region ids, in the order the generator ranks them. A template uses only these regions.   |
| `directionRules`               | Facing (`down`, `up`, `left`, `right`) → `face` (`front`, `side`, `back`) and `hairMass` |
| `constraints.protectedRegions` | Regions whose shape a generator keeps.                                                   |
| `constraints.variationBounds`  | `{ min, max }`. Default 0 to 1.                                                          |
| `constraints.shape`            | `{ maxBoxGrowth, maxCentroidDrift }`. Default 3 and 2.                                   |
| `constraints.diversity`        | `{ threshold }`. Default 0.05.                                                           |
| `constraints.deformablePairs`  | Pairs of regions that may deform each other.                                             |

The frames a template draws are its own, not a field of the profile.
The idle and the walking codes of one facing share its rules. `hairMass` goes from 0.25 to 2.

The shipped profiles are the source module `src/projects/cyberia/procedural/profiles/registry.js`.
The worker writes them over the stored copies each time it starts.

- `skin-default` gives a front face down, a back face up and a side face left and right, and
  protects the torso and both legs.
- `floor-default` has no facing rules. It ranks `ground` then `patch`, protects no region, and lets
  `ground` and `patch` trade cells. Its diversity threshold is 0.02.
- `portal-default` has no facing rules. It ranks `ring`, `swirl`, `depth` and `core`, protects the
  core, and lets the swirl trade cells with the ring and the depth. Its diversity threshold is 0.04.

## Generator

| Field            | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `id`             | The id a request may name, for example `skin-variant`              |
| `itemType`       | The item type it makes                                             |
| `modes`          | The modes it runs                                                  |
| `defaultProfile` | The profile a run takes                                            |
| `parameters`     | Checks the parameters of a run against the profile                 |
| `prepare`        | Analyzes a source once for a batch                                 |
| `generate`       | Makes one variant from the batch, a seed, the palette and siblings |
| `renderProblems` | Optional. Checks every revision of the item type, an edit too      |

The registry is `src/projects/cyberia/procedural/generator-registry.js`. It holds `skin-variant`,
`portal-variant`, `obstacle-variant` and `floor-tile`.

`skin-variant`, `portal-variant` and `obstacle-variant` run the sprite generator
(`generators/sprite/`). It gives each
frame the region map of the template frame of its direction and index. On a render, the regions
move onto the interior of the frame, bottom on bottom and centre on centre, so a render of any
canvas fits. Every operator draws from the seed of the facing, and the outline of the protected
regions stays, so the frames of a facing change alike. Face features and hair grow only where the
profile gives facing rules: a skin has them, a portal and an obstacle have none.

`obstacle-variant` takes the profile `obstacle-default`: the regions `dust`, `chunk`, `seam` and
`loose`, with `chunk` protected. It draws every direction and frame of its template.

`floor-tile` takes `variation`, and `layoutVariation`, `regionVariation`, `detailVariation`,
`paletteVariation` and `minDiversity`. Each granular variation defaults to `variation`:

| Parameter          | Moves                                                      |
| ------------------ | ---------------------------------------------------------- |
| `layoutVariation`  | How far the pattern shifts on the tile                     |
| `regionVariation`  | How many border cells `ground` and `patch` trade           |
| `detailVariation`  | How much texture the tones show, and how many accent cells |
| `paletteVariation` | How far the colors no palette, biome or slot fixes move    |

A floor tile from the template is opaque in every cell, and its edges join the opposite edges. A
region keeps its share of the template within 0.1, and no cell stands alone in its region. A floor
from its render keeps its canvas, frames and frame duration: each cell takes the nearest tone of the
plan. A revision with a cell that is not opaque fails validation.

## Map population

A population request is `{ mapCode, seed? }`. The population freezes the map context and holds one
item (a target) for each item its foundation composition and its placements name.

| Field         | Holds                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| `version`     | The version of the record, 7. A record of another version is read-only                      |
| `revision`    | Writes of the targets, the removals, the defaults workspace and the draft                   |
| `nextRun`     | The run index the next run of any item takes: no two runs of a population share a seed      |
| `mapCode`     | The map the population reads and publishes onto                                             |
| `mapRevision` | The revision of the map the population read                                                 |
| `fingerprint` | SHA-256 of the version, the map and its revision, the content digest and the root seed      |
| `rootSeed`    | The seed each run seed derives from                                                         |
| `context`     | The frozen map context: map, instances, foundation, biome, palettes and findings            |
| `targets`     | Each item id with its sources, decision, configuration and the drafts it stored             |
| `removed`     | Each item removed from the population: `{ target, by, at, reason }`                         |
| `draft`       | The map to publish: `{ grid, entities, baseRevision, revision, savedAt, savedBy }`, or null |
| `defaults`    | The workspace membership: `{ added, removed }`, each a list of default ids                  |
| `publication` | The publication that runs or ran, or null                                                   |
| `migration`   | What the migration from version 2 or 3 kept, or null                                        |
| `cancelledAt` | When a moderator cancelled it                                                               |

An item has these fields:

| Field                                  | Holds                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `itemId`, `itemType`, `stage`          | The item, its canonical type and its group: `floor`, `npc-skin`, `portal`, `obstacle` or `other` |
| `sources`                              | `foundation`, `placement`, `manual`                                                              |
| `foundation`, `expected`, `placements` | The composition entries that name it, the count they expect, the times it is placed              |
| `cid`, `hasRender`                     | The definition it ran when the population read it, and whether it has a render                   |
| `resolution`                           | `keep`, `render`, `template` or `author`                                                         |
| `templateId`                           | The Genesis Template it takes                                                                    |
| `palette`, `variation`                 | Its own palette choice `{ paletteId?, slots }`, and its variation or null                        |
| `definitionCid`                        | The definition authored by hand that it uses under `author`; it stays under any other resolution |
| `observed`                             | For `keep`: the binding kept, `{ cid, bindingRevision }`; else null                              |
| `drafts`                               | The draft definitions its Studio saves created: the drafts the workflow owns                     |

The runs of an item are the jobs whose `populationId` and `populationItemId` name the population and
the item; nothing else lists them.

A read of a population adds to each item `binding` (`{ cid, revision, hasRender }` it runs now, or
null; `hasRender` tells whether that definition has stored render frames), `artwork` (`{ cid, source }`,
the artwork every view shows), `resolutions` and `templates` (the Genesis Templates of its type the
generator of its group serves now). `source` is `kept` (the binding of a kept item), `authored`,
`selected` or `published` (its entry), `draft` (its newest stored entry, not selected), `bound` (the
binding it runs now), `unrendered` (it runs a binding with no render: `cid` empty) or `missing`
(`cid` empty). An artwork `cid` always has a render, so no view asks for a render that does not
exist. The groups carry `itemTypes` and `generates`.

`resolutions` lists the resolutions the item type offers, each `{ id, available, reason }`, from one
function (`resolutionsOf` in `src/projects/cyberia/procedural/population/resolution.js`). Nothing
stores them. `keep` and `author` are always listed; `render` is listed when a generator makes
variants of the type, and `template` when a Genesis Template of the type or a generator exists:

| Resolution | The entries                                                                         | Available when                                                                         |
| ---------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `keep`     | None: the item keeps the binding observed                                           | The item runs a definition now                                                         |
| `render`   | Start from the current render of the item                                           | A generator makes variants of its type, a template serves it, the artwork has a render |
| `template` | Start from a Genesis Template; a new item with this exact id when it has no artwork | A Genesis Template of its type exists, and a generator builds from it                  |
| `author`   | None: a definition authored by hand becomes the item                                | Always                                                                                 |

`reason` names the first condition that fails: no artwork to keep, no generator that makes variants
or builds the type, no Genesis Template of the type, no template the generator serves, no current
artwork, or no render frames. The `other` stage takes every item type of `ITEM_TYPES` no generator
stage takes, on the entity types that place them; a player type stays out. A new item of `other`
names its `itemType`; an unknown item type answers 400. The recommendation is an authored
definition, else `keep` while the item has a render or no template rebuilds it, else `template`,
else `author`.

`PATCH` takes `resolution`; one the item does not take now answers 400 with its reason. `keep`
reads the binding of that moment, and keeping again after a rebind records the new one. The binding
revision is how many bindings the catalog history of the item holds. A change of resolution takes
the approval back from the selected entry (audit `item.approval_withdrawn`); the results, the
authored definition, the binding and the audit stay. A save of the Object Layer Studio under an
authoring key, and `POST /:id/targets` with a `cid`, set `author` with that definition. A placed item
no definition binds is a `template` item of the group its entity type gives; an item the moderator
adds without a binding needs its group. A placed item id can have any form; a new item id is
lowercase words joined by hyphens.

`GET /:id/targets/:itemId/results` answers `{ results, retained, limit }`
(`src/projects/cyberia/procedural/population/results.js`). `results` lists each generated result,
newest first, then each draft the item stored and the definition it uses, newest first. `retained`
counts the generated results and the drafts it stored; `limit` is 16. A result has these fields:

| Field                                     | Holds                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `id`                                      | The run id of a generated result, the CID of a definition: the id `delete` takes       |
| `entryId`, `jobId`                        | The candidate and the run of a generated result; empty for a definition                |
| `source`                                  | `render`, `template`, `author` (a draft the item stored) or `stored` (another one)     |
| `state`                                   | See the states below                                                                   |
| `cid`, `hasRender`                        | The revision it shows, and whether it has stored render frames                         |
| `revision`, `revisions`                   | The number of the current revision of a generated result, and how many it stores       |
| `templateId`, `paletteId`                 | The template and palette of a generated result                                         |
| `valid`, `problems`, `error`, `retryable` | Its validation, the error of a failure, and whether a run under the same seed can pass |
| `origin`, `createdBy`                     | The origin of a definition and who stored it                                           |
| `keptBy`                                  | What keeps it from a delete besides the item, empty when nothing does                  |
| `createdAt`, `updatedAt`                  | When it was stored and changed                                                         |
| `actions`                                 | `use`, `edit`, `delete` and, for a failure, `retry`: each `{ id, available, reason }`  |

The state of a generated result comes from its candidate: `generating` (queued, running or
generated), `ready` (in review), `editing`, `selected` (approved: the exact revision the item
publishes), `published`, `discarded` (a review rejected it), `failed`, `cancelled`, or
`missing` (its run holds no candidate record). A definition is `selected` (the item, authored by
hand, uses it), `superseded` (saved before the definition the item uses) or `saved`. A definition the
item keeps under another resolution is `saved`; `delete` refuses it and `use` authors the item with
it again. A closed population answers every action unavailable, with the reason.

`POST /:id/targets/:itemId/results/delete` takes `{ ids }`. A run id deletes that generated result
through `DELETE /:jobId` of the job: its active work stops first, then its candidate, every revision
nothing else keeps and the audit trail of the job go; the population audit records
`target.entry_deleted`. A CID deletes a draft the item stored (`drafts`) that it does not use and
nothing keeps, with its render frames and atlas; the population audit records `target.draft_deleted`.
The selected result, a published result, a definition the item did not store as a draft, and a
draft something keeps stay, each with its reason. It answers the population
with `deleted` `{ removed, retained, failures, purged }`: what went, what stayed and why (a 409), what
failed (an unknown id, or the authority does not answer), and the CIDs that left storage. Each id is
its own; deleting again is safe.

What keeps a definition: the catalog binds or bound it, a generated entry names it, a map population
uses it, a removed item of a map population uses it, or a publication plan names it
(`revisionKeepers` in `src/projects/cyberia/procedural/engine.js`). `GET /:id/targets/:itemId/definitions`
lists the definitions of the item id a hand-authored draft can continue from: its drafts, the
definition it uses, and those of any other workflow or run. The revisions of the runs of the item are
left out, and so is the definition the item runs now, which the view shows first from
`target.binding`. Each row has `cid`, `itemId`, `itemType`, `status` (`archived`, `draft` or
`published`), `hasRender`, `keptBy`, `createdBy` and `updatedAt`. A row with no render
still opens in the Studio. An item takes a definition only when it has a render; a second request for
the definition it uses changes nothing.

`POST /:id/targets/:itemId/reset` takes an item back to a clean start: every run of the item goes as
a delete takes it, the selected one too; the item no longer uses its definition; each draft it stored
goes when it is still a draft and nothing keeps it; and the item takes the recommendation now with
no palette choice and no variation. Published definitions, bindings, placements, defaults, a
definition another workflow stored and the population audit stay. It answers the population with `reset`
`{ removed, retained, failures, purged, remaining: { runs, drafts } }`: `remaining` counts what the
workflow still owns after it. A reset of a clean item changes nothing, and the reset runs again
safely. The audit records `target.reset` with the population, the item, the actor and the report.

A population delete also purges each draft its items stored that is still a draft and that nothing
else keeps.

A write over a population another write changed answers 409; the view reads the population again,
and the moderator decides again on what is stored now.

`DELETE /:id/targets/:itemId` means removal only. It cancels the active work of the runs of the item
and keeps their jobs, results and audit, and moves the item to `removed`. No catalog entry,
definition, binding or placement changes. `POST /:id/targets` with the item id of a removed item
restores it as it was. `DELETE /:id/removed/:itemId` forgets a removed item permanently: it deletes
that entry of `removed` and nothing else, and raises the population revision. An item id `removed`
does not hold changes nothing. A later read or add of the item makes a new item, and its earlier runs
are its results again.

The configuration of an item changes at any time. `POST /:id/targets/:itemId/generate` stores
`count` runs (1 to 4) from the configuration as it is. Each run takes the next run index `n` of the
population (`nextRun`) and runs under the seed `deriveSeed(rootSeed, fingerprint, itemId, n)`, so no
run, after a delete, a reset or a forgotten item, gives back an earlier result. It answers 409 when
the item would keep more than 16 results; so does a save of the Studio under an authoring key.

Select uses a generated result: it approves the exact revision, then takes the approval back from
the result selected before. A result of another start switches the resolution of the item to that
start first (`render` or `template`), when the item takes it now. A result with no render frames
answers 409. A save in the Studio returns a selected result to `ready`. Retry queues a failed result
again under its own seed when its `error.retryable` is true: the worker sets it for a lost lease and a
failing store, not for a refusal of the generator or an invalid result; the audit records
`item.retried`. The new item ids of one population belong to its runs, so a new item generates more
than once.

An item is `kept` (it runs the binding observed), `conflict` (it was bound again after the keep),
`authored` (under `author`, with its definition), `author` (under `author`, before a moderator
authors it), else from its results: `published`, `selected`, `generating`,
`choose` (a result waits for a choice), `failed` (its newest result failed) or `new`. An item is ready
to publish when it is `selected`, `published`, `kept` or `authored`. A population is `open`,
`publishing` (a publication runs before its commit), `published`, `cancelled`, or, in a list,
`outdated` (another version).

`steps` gives the state of each step from what is stored: `items`, `defaults`, `map` and `publish`,
each `{ state, detail }`. A state is `not-started`, `in-progress`, `attention`, `ready` or
`published`.

| Step       | Is `ready` when                                                                                                                       | Needs `attention` when                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `items`    | every item is ready to publish                                                                                                        | an item failed, waits for authoring, or a kept binding moved          |
| `defaults` | always; `detail` names each staged item no default names                                                                              | never: a missing default is a warning                                 |
| `map`      | the draft is at the live map revision and draws every item it places; `published` once a publication wrote the revision the map is at | the live map moved, an item has no artwork, or a placement cannot run |
| `publish`  | `published` once the publication completed                                                                                            | a phase failed, or the refresh of the runtime waits                   |

`POST /:id/palette/preview` and `POST /:id/palette` take `{ itemIds, source, paletteId?, overrides }`.
`source` is `palette` (the palette `paletteId` of the library, for any item type) or `biome` (the biome colors of the map; an
NPC or a portal starts from another color of the biome). `overrides` is `keep` (the slots an item
sets stay over the source) or `replace`. Both answer `changes`, each with `before`, `after` and the
slots that change or stay, and `skipped`, each with the reason. Apply stores what the preview
answers; each item keeps its own palette.

`GET /:id/draft` answers `{ mapId, mapCode, mapRevision, media, preview, thumbnail, baseRevision,
revision, savedAt, grid, entities, previewKeys, missing, items }`. `media`, `preview` and
`thumbnail` are those of the live map. With no draft, the grid and the entities are those of the
live map. `previewKeys` maps each placed item and each item of the population to the CID of its
artwork: the `artwork` of an item of the population, else the binding when it has a render.
`missing` lists the item ids no CID draws, with the reason: no artwork yet, a binding with no
render, or no binding. `PUT /:id/draft` takes `{ grid: { gridX, gridY, cellWidth, cellHeight },
entities, revision, baseRevision }`: each grid value is a positive integer and each entity starts
inside the grid; the first save needs `baseRevision` equal to the map revision, a later save needs
`revision` equal to the draft revision; else 409. `POST /:id/draft/rebase` takes `{ mapRevision,
revision }`: the current map revision the moderator reviewed and the draft revision read.

`GET /:id/defaults` answers the workspace. It needs no map, placement, universe or instance.

| Field     | Holds                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| `rows`    | Each stored default whose live, dead or drop items name a staged item, and each one added, less each one removed |
| `items`   | Each live, dead and drop item id of the rows → `{ itemType, cid, source }`, its artwork as `artwork` gives it    |
| `missing` | Each staged item no row names: `{ itemId, entityType }`, the entity type a new default of it takes               |
| `removed` | Each default removed from the workspace: `{ rowId, entityType, liveItemIds }`                                    |

A row holds `rowId`, `updatedAt`, the stored fields (`entityType`, `liveItemIds`, `deadItemIds`,
`dropItemIds`, `inventoryItemsIds`, `overrideItemsIdsState`, `behavior`), `itemIds` (the staged items
its live, dead or drop items name), `added` (true when it names no staged item: a moderator added
it), `instances` (the instances whose conf names it; none for a global default) and
`shadowedBy`. `shadowedBy` lists each world that runs another default for the exact build of the row:
`{ instanceCode, rowId }`, with `instanceCode` null for every world with no default of its own, and
`rowId` empty for the content baseline. The order and the resolver are those of the runtime: see
the [Procedural Engine](../explanation/procedural-engine.md#map-population).

`POST /:id/defaults` and `DELETE /:id/defaults/:rowId` change only the workspace; a stored default
they do not find answers 404. The Entity Studio edits a default: `PUT
/api/v1/cyberia-entity-type-default/:id` takes the `updatedAt` it read, and answers 409 when the
stored default changed since. A publication never changes a default.

Impact: `local` runs on this map only; `shared` also runs on maps of the same biome; `global` also
runs on a map of another biome or with no biome, or a player entity-type default carries it.

## Map media

A map save answers with the media of its new revision `pending` and draws its preview after the
answer; the media then turns `ready` or `failed`. The routes of `/api/v1/cyberia-map`:

| Method and path       | Does                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /:id/media`      | Answers `{ media, preview }` of the revision the map is at. Stores nothing.                                          |
| `POST /:id/media`     | Draws the preview of that revision again, and answers `{ media, preview }`.                                          |
| `GET /:code/preview`  | The stored preview (PNG). A map with none is drawn once for its revision, as its preview; 204 when it draws nothing. |
| `POST /draft-preview` | Draws `{ gridX, gridY, entities }` an editor holds, saved or not, and stores nothing; 204 when it draws nothing.     |

`GET /:code/preview` is the `previewUrl` of a map with no stored preview in the instance map payload.

## Publication

`POST /:id/publish` takes `{ revision, acknowledged? }`: `revision` is the population revision the
review showed. A request with no revision answers 400; a population at another revision answers 409,
and the moderator reviews it again. It starts a publication and answers at once; a request repeated
while it runs answers the same publication. The worker runs its phases under a lease:

| Status               | Does                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `queued`             | Waits for the worker                                                                            |
| `preflight`          | Checks every revision, and freezes the plan as a manifest                                       |
| `publishing_objects` | Publishes each approved or selected revision exactly, one by one, to the Object Layer authority |
| `committing_runtime` | One transaction: checks, bindings, the map with its media, the record                           |
| `refreshing_runtime` | Map cache, the media of the map revision, map previews, then the reload of the game servers     |
| `completed`          | Every phase is done                                                                             |

`POST /:id/validate` runs the same preflight with the acknowledgements it is given, and stores
nothing: `{ ready, problems, plan }`.

The preflight needs every item ready to publish, each kept item at the binding observed, the map at
the revision the draft starts from, each selection on the exact current revision, each binding at
the CID its target read, a draft that places only items that run, and each global change in
`acknowledged`. It reads every revision before it publishes one: each revision is stored, has
stored render frames, and publishes to its own CID, which holds its stats inside the stat contract.
The save checked the stats against their bounds. The commit checks the population revision, every kept binding and every
asset binding revision again in its transaction.

The plan is the manifest of the publication: `manifestHash` is the SHA-256 of its canonical JSON
without the result of each asset. A retry runs the same manifest. Each asset publishes the stored
revision exactly, without a merge over the definition it replaces: the authority answers the
revision CID, else the asset fails with an integrity error. An asset that is `published` does not
publish again.

A worker holds the publication by its lease. Each write names the holder, so a worker that lost its
lease writes nothing and stops. Before each asset the worker reads the publication again: it stops
when another holder took it, and it cancels when a cancel waits.

A failure stops in `preflight_failed`, `objects_publish_failed` or `runtime_commit_failed`, with
`error` `{ phase, message, retryable, at }`: `problems` for a preflight, `itemId` and `revisionCid`
for a revision. `retryable` is false for an integrity failure: a revision that is not stored, has no
render frames or publishes to another CID, and a commit that met a change. A publication with a
missed reload or a failed map preview is committed and waits in `published_reload_pending`: the
worker tries again up to 5 times, after 30 seconds doubled each try.

`POST /:id/publication/retry` resumes the failed phase on the same manifest: the preflight from the
start, the assets not published, the commit with its checks, or the refresh. It answers 409 for a
failure that is not `retryable`: cancel, repair, review and publish again.
`POST /:id/publication/cancel` stops a publication before its commit. While a worker holds the
lease, it stores `cancelRequestedAt` and the worker cancels at its next check; otherwise it cancels
at once. Both end in `cancelled_before_commit`. After a failed preflight or a cancel, the population
takes changes again and publishes again.

`publication` holds `id`, `status`, `requestedAt`, `requestedBy`, `acknowledged`, `lease`,
`cancelRequestedAt`, `reloadTries`, `nextAttemptAt`, `history` (each status with its time), `plan`
(`manifestHash`, `populationRevision`, `mapRevision`, `draftRevision`, `grid`, `placements`, `kept`
with `{ itemId, cid, bindingRevision }`, `assets`, `media` `{ mapCode, revision }` or null),
`commit` (`at`, `kept`, `assets` with `previousCid`, `revisionCid` and `definitionCid`, `map`
`{ code, from, to, grid, placements }` or null), `refresh` (`cache`, `media`
`{ mapCode, revision, status, preview, error }` with `status` `ready`, `failed` or `superseded` and
`preview` the File id of the drawn preview, `previews`, `servers` with each reload result) and
`error`.

| Plan asset field | Holds                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `kind`           | `definition` for an authored definition; `create` or `update` for a selected entry with no source or one |
| `revisionCid`    | The approved revision the asset publishes                                                                |
| `previousCid`    | The definition the item runs now; empty for a new item                                                   |
| `status`         | `pending`, `published` or `failed`                                                                       |
| `definitionCid`  | The definition the authority answered; empty until `published`                                           |
| `attempts`       | How many times the worker tried to publish it                                                            |
| `error`          | `{ message, retryable, at }` of the last failure, or null                                                |

## Migration

`node bin/cyberia population migrate` prints, as JSON, what moving every version 2 to 6
population to version 7 would do, and writes nothing: `migrated` and `outdated` (each record of
another version, with its recovery). Each `migrated` entry has `nextRun`: the jobs the population
stored, the run index its next run takes. Each version 2 to 4 entry has `resolutions`
(`{ itemId, from, to }` for each strategy that changes its name) and `palettes`
(`{ itemId, from, to, resolved }` for each palette reference that takes its global id; `resolved` is
false when the library does not hold it); a version 2 or 3 entry also has `kept`, `removed`,
`legacyDefaults` and `publication`. A version 5 entry has `manifest`: whether its publication holds
a plan. `--apply` writes it. It reads the palette library of the served content artifact. No deploy
runs it.

| Earlier record                           | Version 7                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| strategy `create`, `definition`, none    | resolution `template`, `author`, `author`; `keep`, `render` and `template` stay     |
| `strategies`, `recommended`, `templates` | Removed: a read derives them                                                        |
| palette `<itemType>.<slug>`              | The global palette `<slug>`, with the same colors                                   |
| v2 target with `kept` and a CID          | `keep` at the CID it read, at the binding revision that bound that CID              |
| v2 target with `excluded`                | A removed target, with who removed it, when and why. Its runs stop                  |
| v2 or v3 entity-default change           | Kept in full in `migration.legacyDefaults`; a stored default it names joins `added` |
| v2 or v3 publication before commit       | `cancelled_before_commit`: the moderator publishes again                            |
| publication asset `cid`, `published`     | `revisionCid`, `status`, `definitionCid`, `attempts`; the plan takes `manifestHash` |
| publication `error` with `conflict`      | `retryable` false; any other error `retryable` true                                 |
| target `runs`                            | Removed: each job takes `populationItemId`, the item of the target that listed it,  |
|                                          | else of its candidate; the population takes `nextRun`, the count of its jobs        |
| no list of stored drafts                 | `drafts` empty: an earlier draft shows among the stored definitions of its item     |

A version 4 to 6 record keeps its revision, defaults, publication and `migration`. An asset that
failed before version 6 retries: the exact publication can serve it now. The migration changes
no binding, CID, default or placement. A kept item whose binding moved shows a conflict until the
moderator keeps it again.

The report also has `jobs`: the specs jobs stored before the global palettes
(`src/projects/cyberia/procedural/jobs/migration.js`). `jobs.migrated` lists each moved job with
`palettes` (`{ from, to }`), `jobs.generating` each job whose items are still `queued`, `running` or
`generated`, and `jobs.unresolved` each spec the content cannot map, with its `problems`.

| Earlier job spec                    | Current spec                                               |
| ----------------------------------- | ---------------------------------------------------------- |
| template role with no `palette`     | The palette role the content template of the same id takes |
| palette `<itemType>.<slug>`         | `<slug>`, colors by palette role, no `itemType`            |
| palette ids of the choice and items | The global ids                                             |

The fingerprint, the run, the seeds and the candidates stay. The items change before the spec, and
the spec shows a job as moved, so a run that stops halfway is safe to run again. The command exits 1
while a record stays outdated or a job waits or cannot be mapped. Running it again changes nothing.

## Candidate states

`queued`, `running`, `generated`, `review`, `editing`, `approved`, `promoted`, `rejected`,
`cancelled`, `failed`. The table of moves is `ITEM_TRANSITIONS` in the job item model. Every move
is one atomic update that names the states it leaves.

A job is `queued`, `running`, `completed` or `cancelled`. A candidate keeps `diversity` (score,
nearest reference and the four distances) and, apart, the `signature` the next siblings compare
with. When it is promoted, `promotion` holds the cid it runs on and the cid it replaced.

## Audit actions

`job.created`, `job.started`, `job.completed`, `job.cancelled`, `item.generated`,
`item.validation_failed`, `item.regenerated`, `item.opened_for_edit`, `item.revision_created`,
`item.approved`, `item.approval_withdrawn`, `item.rejected`, `item.promoted` and `item.created`.

## Worker settings

| Setting      | Value                                                          |
| ------------ | -------------------------------------------------------------- |
| Concurrency  | 1 candidate at a time. `startProceduralWorker` takes a number. |
| Poll         | 2 seconds                                                      |
| Lease        | 5 minutes                                                      |
| Attempts     | 3 for each generation; 5 diversity tries for each attempt      |
| Source cache | The analysis of the last 4 target items                        |
| Publications | One at a time, each phase under a 2-minute lease               |

## Deploy configuration

The Cyberia host in `conf.server.json` mounts these APIs, next to the item definition APIs:
`cyberia-procedural-profile`, `cyberia-procedural-job`, `cyberia-procedural-job-item`,
`cyberia-procedural-audit` and `cyberia-procedural-population`. A map population also reads
`cyberia-map`, `cyberia-instance`, `cyberia-instance-conf` and `cyberia-entity-type-default`. The
procedural APIs are runtime APIs: keep them out of the `content` partition. The population view opens
the Map Studio (`/cyberia-map-engine`) and the Entity Studio (`/cyberia-entity-engine`) on its drafts.
The Map Studio draws each item from `atlas-sprite-sheet` (`layout/:cid` and `render/:cid`) and
resolves the items of a live map with `GET /cyberia-item-catalog/resolve?ids=`: each item id answers
`{ cid, hasRender }`, or null when nothing binds it. An item with no render shows its reason and
asks for no atlas. The atlas answers 404 for a definition that names no render; the server logs it
as a warning, one line, with no stack.

The Cyberia portal in `conf.client.json` carries the `cyberia` components `ProceduralEngineCyberia`,
`ProceduralGridCyberia`, `ProceduralPaletteCyberia`, `ProceduralPopulationCyberia` and
`ProceduralReviewCyberia`, the services `cyberia-procedural-job`, `cyberia-procedural-job-item`,
`cyberia-procedural-profile` and `cyberia-procedural-population`, and the view
`/cyberia-procedural-engine`. No procedural algorithm, template or palette is a client component.

The content artifact carries the Genesis Templates (`skin.humanoid`, `floor.terrain`,
`portal.vortex`, `obstacle.rock-pile`, `obstacle.rubble-pile`), the global palette library and
`baseline.items` (skin, floor, portal and obstacle); its schema is 10. Build `cyberia-content` after a change to them, then release it; see
[Content artifact](../explanation/content-artifact.md).
