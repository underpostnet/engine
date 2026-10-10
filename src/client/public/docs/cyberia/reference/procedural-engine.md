# Procedural Engine reference

The API, the records and the settings of the Procedural Engine. The model is in
[Procedural Engine](../explanation/procedural-engine.md).

## API

Every route needs a moderator, except the reads of the profile API and its configuration. The base
is `/api/v1/<api>`.

| Method and path                         | API                           | Does                                                               |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `GET /config`                           | `cyberia-procedural-profile`  | Answers the modes, generators, templates, palettes and limits.     |
| `GET /templates/:id/palette`            | `cyberia-procedural-profile`  | Answers the palette a create starts from with a Genesis Template.  |
| `GET /templates/:id/random-slots`       | `cyberia-procedural-profile`  | Answers random colors for the slots of a Genesis Template.         |
| `GET /`, `GET /:profileId`, `POST /`    | `cyberia-procedural-profile`  | Reads profiles. A moderator stores a profile over its stored copy. |
| `POST /`                                | `cyberia-procedural-job`      | Stores a job for a request. An equal spec answers the same job.    |
| `GET /sources`                          | `cyberia-procedural-job`      | Lists the existing items an update can target. Paginated.          |
| `GET /sources/:itemId/palette`          | `cyberia-procedural-job`      | Answers the palette an update starts from for one item.            |
| `GET /`                                 | `cyberia-procedural-job`      | Lists jobs, newest first. Paginated.                               |
| `GET /:jobId`                           | `cyberia-procedural-job`      | Answers the job and its persisted counts.                          |
| `GET /:jobId/items`                     | `cyberia-procedural-job`      | Lists the candidates. Paginated.                                   |
| `GET /:jobId/items/:itemId`             | `cyberia-procedural-job`      | Answers the candidate, its job and its audit trail.                |
| `POST /:jobId/cancel`                   | `cyberia-procedural-job`      | Cancels the workflow of the job.                                   |
| `DELETE /:jobId`                        | `cyberia-procedural-job`      | Deletes a job. Answers `{ stopped, candidates, drafts, audit }`.   |
| `POST /:jobId/items/:itemId/regenerate` | `cyberia-procedural-job`      | Queues the candidate again under a new seed.                       |
| `POST /:jobId/items/:itemId/approve`    | `cyberia-procedural-job`      | Approves the revision `{ cid }` names.                             |
| `POST /:jobId/items/:itemId/reject`     | `cyberia-procedural-job`      | Rejects the current revision.                                      |
| `POST /:jobId/items/:itemId/edit`       | `cyberia-procedural-job`      | Opens the candidate for edit. Answers the review context.          |
| `POST /:jobId/items/:itemId/promote`    | `cyberia-procedural-job`      | Promotes the approved candidate to its target item.                |
| `POST /:jobId/promote`                  | `cyberia-procedural-job`      | Promotes every approved candidate. Answers `{ promoted, failed }`. |
| `GET /`, `GET /:id`                     | `cyberia-procedural-job-item` | Reads candidates. `?jobId=`, `?targetItemId=`, `?status=` filter.  |
| `GET /`                                 | `cyberia-procedural-audit`    | Reads the trail. `?jobId=`, `?jobItemId=`, `?action=` filter.      |

The lists of jobs, sources and candidates filter and sort on the server. `filterModel` and
`sortModel` are the AG Grid models, and `page` and `limit` page the answer. A column names its
field: `spec.mode`, `spec.variation.level`, `status`, `targetItemId`, `diversity.score` and so on.
`GET /sources` filters and sorts `itemId`, `itemType`, `hasRender`, `currentCid` and `updatedAt`.
Each row also has `artDirection`, `biome` and `palette` from the content foundation: `palette` lists
the base colors of the foundation palettes of the item.

`GET /sources/:itemId/palette` (a moderator) and `GET /templates/:id/palette` of
`cyberia-procedural-profile` (everyone) answer `{ templateId, palettes, slots }` for an existing item
or for a Genesis Template. `?paletteId=` names a Palette Template that fits the template; `random`
has no default and answers 400. `templateId` is the Genesis Template the target takes. `palettes`
lists the foundation palettes of an item, each `{ id, name, group }`: `foundation` for the colors its
art brief names, `biome` for the palette of a biome it belongs to; a template has none. `slots` gives
each slot its default `{ color, origin }`. Origin `palette` or `foundation` is a color of the Palette
Template or of the foundation palettes, which stays as it is. Origin `render` or `template` is where
an automatic color starts; the palette variation moves it. An item that is not a Cyberia item here
answers 404.

`approve` takes `{ cid, reason? }`. A cid that is not the current revision answers 409, and so
does a revision that failed technical validation, and a second approved candidate of one target
item. `promote` answers 409 when the target item changed since the run (an update), when the
proposed item id is taken (a create), or when the approval does not cover the current revision.
`cancel` answers 409 when the job has no active work. `DELETE` takes a job in any status. It stops
the active candidates of the job first (`stopped` counts them), then removes the candidates, the
audit trail of the job, and every revision no item runs or ran with every record the Object Layer
purge removes (`drafts` counts them). A revision this host published goes from the Object Layer
authority too, through `DELETE /api/v1/object-layer/purge/:cid` with the service key. A revision
another job names, or that ItemLedger registers, stays.

`GET /config` answers:

| Field        | Holds                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `generators` | `id`, `itemType`, `modes` and `profile`: `profileId`, `regionOrder` and `protectedRegions`                                                     |
| `templates`  | Each Genesis Template: `id`, `name`, `description`, `itemType`, `canvas`, `roles`, `slots`, `slotColors`, `palettes`, `problems` and `preview` |
| `palettes`   | `families`, in order, and every Palette Template, verified and ordered                                                                         |
| `limits`     | `maxCandidates`                                                                                                                                |

`slots` lists the color slots of a template, each `{ id, role, tone }`. `slotColors` gives the color
of each slot in the template, as `#rrggbb`. `palettes` lists the ids of the Palette Templates that fit
it. `problems` lists what stops it from serving the profile of its generator; a template with a
problem cannot run. `preview` is the base item a create draws from it, as wire render frames, one
frame for each direction. A profile id has one stored copy: storing a profile removes any other copy
of its id.

`GET /templates/:id/random-slots` answers `{ slots }`: a color for each slot of the Genesis Template,
in one OKLCH hue harmony. Each base keeps the lightness of its template color, and its shadow and
highlight derive from it. Roles with the same template color get the same color, and the outline
stays dark. Each call gives new colors. It is a preview: a run never draws from it.

A manual edit is not a Procedural Engine route. The Object Layer Studio saves with
`PUT /api/v1/object-layer/:id` and a `review` field in the body that holds the id of the candidate.
The server stores the save as a draft revision of that candidate and promotes nothing.

The editor import is `POST /api/v1/object-layer/import-frames`. The body is
`{ id, roles, mutate, mutationFactor, seed, target }`. Without `mutate`, the server answers the
frames of `id` as stored. With `mutate`, it remaps them to the palette `roles` and mutates their
contour. It stores nothing.

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
      { "itemId": "worker", "paletteId": "skin.exotic-teal", "slots": { "hair.base": "#5a3a22" } },
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
  "palette": { "paletteId": "skin.exotic-teal", "slots": { "torso.highlight": "#5a7fb8" } },
  "output": { "variants": 10, "itemIdPrefix": "skin-generated" },
  "variation": { "level": 0.65 },
  "seed": { "mode": "auto" }
}
```

| Field             | Meaning                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `source.itemIds`  | Update only. At least one existing item, each once. They share one item type.                    |
| `itemType`        | Create only. The item type to make.                                                              |
| `template`        | Create only. The Genesis Template to start from. Optional: the first usable one of the type.     |
| `generator`       | Optional `{ id }`. Default: the generator of the item type.                                      |
| `palette`         | Optional. A create takes one palette choice for the run: `{ paletteId, slots }`.                 |
| `palette.items`   | Update only. Optional. `{ itemId, paletteId, slots }` for items of `source.itemIds`, each once.  |
| `paletteId`       | Optional. A Palette Template that fits the template, or `random`. None keeps the defaults.       |
| `slots`           | Optional. Slot id → `#rrggbb`. A slot left out takes its default.                                |
| `output`          | Update: `variantsPerItem`. Create: `variants` and `itemIdPrefix`. At most 200 candidates in all. |
| `variation.level` | 0 to 1, inside the bounds of the profile. Default 0.5.                                           |
| `seed`            | `{ "mode": "auto" }`, or `{ "mode": "fixed", "value": n }` with n from 0 to 2^32 - 1.            |
| `parameters`      | Optional operator settings of the generator. `variation` is not one: use `variation.level`.      |

The new items of a create are named `<itemIdPrefix>-001`, `-002` and so on.

The stored spec resolves everything the request left out, and holds in full what the job runs. It
has `mode`, `itemType`, `generator`, `profile` (the whole profile), `templates` (each Genesis
Template the job uses), `palette`, `palettes` (each Palette Template the job uses), `baseline` (a
create only: the item id, `activable` flag and stats a new item starts from), `sources`,
`candidates`, `output`, `variation`, `seed` and `parameters`. `sources` lists each target item with
its CID, whether it has a render, its art direction (`brief`, `requiredVariants`, `palettes` and
`references`) and its template id. The `palette` of an update keeps the `items` that make a choice,
in the order of `source.itemIds`. `candidates` lists each candidate with its position, its target
item id, its source CID, its template id and its palette id: the Palette Template its choice names
or the seed picked, else empty. The spec never changes after creation.

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

| Field             | Meaning                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `id`              | `<itemType>.<slug>`, the id a create names                                                         |
| `name`            | The label of the template                                                                          |
| `description`     | What the template draws                                                                            |
| `itemType`        | The item type it draws                                                                             |
| `canvas`          | `{ width, height }`. A source with a render needs this canvas.                                     |
| `frameDurationMs` | The frame duration of a render that starts from the template                                       |
| `outline`         | The outline color as `#rrggbb`                                                                     |
| `legend`          | Letter → region id. `.` marks no region.                                                           |
| `roles`           | Role → `{ regions, tones: { shadow, base, highlight }, artDirection }`. Each region is in one role |
| `directions`      | Direction code → one string per canvas row, one legend letter or `.` per cell                      |

The engine verifies a template when it reads it (`src/projects/cyberia/procedural/templates.js`).

## Palette Template

`cyberia-content` holds each one at `procedural/palettes/<itemType>.<slug>.json`.

| Field         | Meaning                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `id`          | `<itemType>.<slug>`, the id a request names                                                 |
| `itemType`    | The item type the palette colors                                                            |
| `name`        | The label of the palette                                                                    |
| `family`      | `natural`, `dark`, `light`, `warm`, `cool`, `biome` or `exotic`                             |
| `biomeTags`   | The foundation biomes the palette suits, by slug                                            |
| `roles`       | Role → base color as `#rrggbb`. A role is a template role, `outline` or `accent`            |
| `constraints` | `minContrast` and `contrastRoles`: the least OKLab distance of those roles from the outline |

The engine verifies each palette, the contrast among the checks, when it reads the catalog
(`src/projects/cyberia/procedural/palettes/catalog.js`).

## Profile

| Field                            | Meaning                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `profileId`                      | Identity. One stored profile for each id.                                                                            |
| `generatorId`                    | The generator the profile drives.                                                                                    |
| `itemType`                       | The item type the profile makes.                                                                                     |
| `regionOrder`                    | Region ids, in the order the generator ranks them. A template uses only these regions.                               |
| `directionRules`                 | Direction code → `facing` (`down`, `up`, `left`, `right`), `face` (`front`, `side`, `back`), `hairMass` (0.25 to 2). |
| `constraints.requiredDirections` | Directions a template must draw and a source render must have. Each has rules.                                       |
| `constraints.protectedRegions`   | Regions whose shape a generator keeps.                                                                               |
| `constraints.variationBounds`    | `{ min, max }`. Default 0 to 1.                                                                                      |
| `constraints.shape`              | `{ maxBoxGrowth, maxCentroidDrift }`. Default 3 and 2.                                                               |
| `constraints.diversity`          | `{ threshold }`. Default 0.05.                                                                                       |
| `constraints.deformablePairs`    | Pairs of regions that may deform each other.                                                                         |

The shipped `skin-default` profile is the source module `src/projects/cyberia/procedural/profiles/registry.js`.
The worker writes it over the stored copy each time it starts. It requires directions `06` and `08`.
A source with a render keeps its other directions: they take the interior of their silhouette as one
region.

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

The registry is `src/projects/cyberia/procedural/generator-registry.js`.

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
`item.approved`, `item.rejected`, `item.promoted` and `item.created`.

## Worker settings

| Setting      | Value                                                          |
| ------------ | -------------------------------------------------------------- |
| Concurrency  | 1 candidate at a time. `startProceduralWorker` takes a number. |
| Poll         | 2 seconds                                                      |
| Lease        | 5 minutes                                                      |
| Attempts     | 3 for each generation; 5 diversity tries for each attempt      |
| Source cache | The analysis of the last 4 target items                        |

## Deploy configuration

The Cyberia host in `conf.server.json` mounts these APIs, next to the item definition APIs:
`cyberia-procedural-profile`, `cyberia-procedural-job`, `cyberia-procedural-job-item` and
`cyberia-procedural-audit`. They are runtime APIs: keep them out of the `content` partition.

The Cyberia portal in `conf.client.json` carries the `cyberia` components `ProceduralEngineCyberia`,
`ProceduralGridCyberia` and `ProceduralPaletteCyberia`, the services `cyberia-procedural-job`,
`cyberia-procedural-job-item` and `cyberia-procedural-profile`, and the view
`/cyberia-procedural-engine`. No procedural algorithm, template or palette is a client component.

The content artifact carries the Genesis Templates, the Palette Templates and `baseline.items`. Build
`cyberia-content` after a change to them; see [Content artifact](../explanation/content-artifact.md).
