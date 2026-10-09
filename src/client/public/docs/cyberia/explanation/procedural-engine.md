# Procedural Engine

The Procedural Engine makes item candidates in the Cyberia Studio. The server makes the candidates:
it automates the visual work. A human finishes each candidate in the Object Layer Studio, then
approves and promotes it. The first generator makes skins.

```text
Automation creates a candidate.
Human authoring creates the final revision.
A CID identifies that exact revision.
The catalog decides which revision the runtime uses.
```

## Two modes

A request names one of two modes. They differ in what a candidate becomes. The first control of the
view is the mode, so you know the effect before you set anything else.

| Mode                                    | Starts from                                    | A candidate becomes                           |
| --------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `update-existing` (update or mutate)    | Existing Cyberia items, by item id             | A new revision of the same item id            |
| `create-new` (create new from template) | An item type, a Genesis Template and a palette | A new runtime item with a new, unique item id |

**Update** keeps the item id and the semantic content: the type, the stats and the description. It
reads each target item, its render if it has one, and its art direction. It adds candidate
revisions for it. A candidate never gets a new item id. A job may make many candidates for one item.
A human approves one, and only that one becomes the active definition of the item.

**Create** has no source. The request must not carry one. The candidates start from a Genesis
Template, take their function from the baseline item of the type, and each proposes a new item id.
Promotion makes the new runtime item. No existing item changes.

The server checks the pair of mode and source in one place, the spec validator in
`src/projects/cyberia/procedural/spec.js`. A client only shows the controls of the mode it has.

## Boundaries

| Part                   | Owns                                                                | Does not own                 |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------- |
| `cyberia-content`      | The semantic foundation, Genesis Templates, Palette Templates       | Any render or binding        |
| Procedural profile     | How a generator transforms a template: rules, protection and bounds | Region maps, colors, stats   |
| Generator registry     | Each generator: its item type, modes, default profile and code      | Jobs                         |
| Procedural core        | Analysis, morphology, operators, palettes, diversity                | Storage and HTTP             |
| Background worker      | Running the candidates of a job on the server                       | Review decisions             |
| Procedural Engine      | Specs, jobs, candidates, review, promotion and the audit trail      | Pixels                       |
| Procedural Engine view | Configuring, monitoring, reviewing and deciding                     | Any generation or validation |
| Object Layer Studio    | Complete human authoring of a candidate: render and valid metadata  | Jobs                         |
| Object Layer           | The content of every candidate and every revision                   | Workflow state               |
| `CyberiaItemCatalog`   | The active `itemId → objectLayerCid` binding                        | Candidates                   |

The browser computes nothing. It sends a request and shows the answer. The core lives in
`src/projects/cyberia/procedural/` and no client file imports it. No template or palette is a client
file: the view reads the modes, the generators, the Genesis Templates and the palette catalog from
the server. The engine never writes to `cyberia-content`. ItemLedger stays outside, and the
simulation stays in `cyberia-server`.

## Genesis Templates

A Genesis Template is a reusable visual start of a generation. It is not an item, an item id, a CID,
a binding or a semantic definition. `cyberia-content` owns the templates
(`procedural/genesis-templates/<itemType>.<slug>.json`), and the engine reads them from the content
artifact through `src/projects/cyberia/procedural/templates.js`, which verifies each one.

A template holds a canvas, a region map for each direction, a legend from letters to region ids, the
palette role of each region with its shadow, base and highlight tones, an outline color and a frame
duration. A role with `artDirection` takes the colors of the foundation palettes of an item. One
item type can have many templates, for example `skin.humanoid` and `skin.humanoid-heavy`.

A template must fit the profile of its generator: the profile ranks each of its regions, and the
template draws each direction the profile requires. The configuration lists, for each template, what
stops it from fitting. A create names its template; an update takes, for each item, the first
template of its item type that fits the profile and the canvas and directions of its render.

## Existing content

For each target, the engine resolves the item id, its type, the CID it runs on, whether it has a
render, its definition, its art direction and its Genesis Template. The art direction is the visual
part of the foundation context of the item, the one the Object Layer viewer shows: its art brief and
its foundation palettes. The foundation palettes are, in order, the colors its art brief names and
the palette of each biome it belongs to.

A target with no render is valid. The engine then draws the base item from its template, with the
colors of its palette. A target with a render is mutated: its frames are recolored and changed
inside the bounds of the profile. This lets a run complete the renderless items of the content.

## New items

A new item takes its function from content: `baseline.items` of the foundation names, for each item
type, the item whose `activable` flag and stats a new item starts from. Its description starts
empty. The generator never invents gameplay values. A human writes the description and changes the
stats in the Object Layer Studio before approval.

## Palettes

`cyberia-content` owns the Palette Templates (`procedural/palettes/<itemType>.<slug>.json`). A
Palette Template has an `id`, an `itemType`, a `name`, a `family`, `biomeTags`, `roles` and
`constraints`. A role is a role of a Genesis Template, the `outline` or the `accent`. Its value is a
base color. The constraint `minContrast` keeps the `contrastRoles` apart from the outline; the
engine checks it in OKLab when it reads the catalog
(`src/projects/cyberia/procedural/palettes/catalog.js`). A palette fits a template when the template
has each of its roles.

The families are natural, dark, light, warm, cool, biome and exotic. Each family goes from the
darkest to the lightest of its first contrast role.

A color slot is one tone of one role: `<role>.shadow`, `<role>.base` and `<role>.highlight` for each
role of the template, then `outline` and `accent`. The humanoid template has `hair`, `skin` (head and
skin), `torso` and `legs` (both legs).

A palette choice says where the colors of a target come from. A target is one item of an update,
or the run of a create. Both modes take the same choice:

| `paletteId`        | Each candidate takes                                                |
| ------------------ | ------------------------------------------------------------------- |
| None               | The defaults of the target                                          |
| A Palette Template | That palette, when it fits the template of the target               |
| `random`           | A palette that fits the template, which the seed picks for each one |

The slots the choice sets win over each of them. The resolution order is:

```text
defaults (foundation palettes of an item, else its render or template)  →  Palette Template  →  slots
```

The only difference of the modes is the defaults: an existing item starts from its foundation
palettes where it has them; a new item has none, so it starts from its template.

The foundation palettes of an item color the roles its template marks with `artDirection`
(`foundationRoles` in `src/projects/cyberia/procedural/palettes/resolver.js`). Each base color of
the palettes, in their order, colors the next of these roles, with the shadow and the highlight of
its palette nearest in hue (the OKLab distance in the chroma plane). The first outline of the
palettes colors the outline, and the first accent, else the first special color, colors the accent.
These colors stay as they are. A slot nothing sets is automatic: its base starts from the source
render or the template and moves with the palette variation, and its shadow and highlight derive
from the base.

A Palette Template colors the roles it names, over the foundation palettes; these colors also stay
as they are.

`GET /api/v1/cyberia-procedural-job/sources/:itemId/palette` answers the palette an update starts
from for one item, and `GET /api/v1/cyberia-procedural-profile/templates/:id/palette` the palette a
create starts from with a template. Each answers the template, the foundation palettes and the
default of each slot with its origin, `palette`, `foundation`, `render` or `template`, under the
Palette Template `?paletteId=` names. The view shows these defaults, and the moderator sets any slot
over them.

A random palette is deterministic: the root seed, the item id and the variant choose it. The job
stores the palette of each candidate.

`GET /api/v1/cyberia-procedural-profile/templates/:id/random-slots` gives random colors for the
slots of a template: one OKLCH hue harmony that keeps the lightness of the template. It is a preview
for the editor. A run never draws from it.

## The context

One function, `resolveProceduralContext`, in `src/projects/cyberia/procedural/context.js`, joins
Cyberia content and generation. It reads a source, a template, a profile and an art direction, and
answers one frozen context. `candidatePalette`
(`src/projects/cyberia/procedural/palettes/resolver.js`) gives the palette of each candidate. A
generator reads the context and the palette and nothing else.

A create has no item. Its source is `baselineSource`: no definition, no render, and the function of
the baseline item.

## The profile

A procedural profile says how a generator transforms a Genesis Template. It names its generator and
item type, ranks the regions, gives each direction its rules (where it faces, whether its face shows
from the front, the side or the back, and how much hair it carries), and holds the constraints: the
required directions, the regions whose shape is protected, the bounds of the variation, how far a
shape may grow, the least diversity and the regions that may deform each other. It holds no region
map, color, item semantics, binding or CID.

A profile is known by its id. The shipped profiles are source data
(`src/projects/cyberia/procedural/profiles/registry.js`): each start of the worker writes them over
the stored copy. The shipped `skin-default` profile protects the shape of the torso and the legs, so
armor layers fit.

## The generator registry

`src/projects/cyberia/procedural/generator-registry.js` lists each generator: its id, the item type
it makes, the modes it supports, its default profile and its implementation (`parameters`,
`prepare`, `generate`). A new item type is a new entry; the jobs, the worker and the review flow do
not change. The first entry is `skin-variant`.

## The pipeline

The server analyzes each source once for a job: the silhouette, the outline, the interior, the
enclosed cells and a distance to the outline for each frame. The outline is the occupied cells next
to the exterior, found by a flood fill from the canvas edge. Morphology (erosion, dilation, opening
and closing) works on these masks. A direction the template does not map takes the interior of its
silhouette as one region.

Each frame then goes through the operators, in this order.

| Operator            | Does                                                                                              | Seed inputs                                  |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `regionFill`        | With no render: fills the interior of each region, with highlight, shadow and base by the outline | None                                         |
| `paletteMap`        | With a render: recolors the interior of each region by lightness, and keeps its details           | None                                         |
| `featurePass`       | Clears the face features, then draws the ones the direction rules show                            | Variant seed, direction                      |
| `growHair`          | Grows hair from the hair region by a styled, constrained walk                                     | Variant seed, direction                      |
| `regionDeformation` | Moves the border of two regions near the contour, less with depth                                 | Variant seed, direction, frame index         |
| `mutateFrameShape`  | Moves boundary cells by a bounded contour mutation                                                | Variant seed, direction, frame index         |
| `detailPass`        | Scatters tone and accent cells over the regions that may change                                   | Variant seed, direction, frame index, region |

No operator paints a cell of the outline. The contour mutation keeps its topology guards: the
components, the holes, the bounding box and the centroid. It is the micro variation, not the whole
generator.

A front face gets two eyes, and by chance a nose and brows. A side face gets one eye on the facing
side and an ear. A back face gets none, so a back-facing skin never keeps front features.

Hair is not a contour mutation. A strand starts on the outline next to the hair and takes steps
outward. A style pulls it: gravity, a side bias, a length and a chance to branch. The styles are
`short`, `medium`, `long`, `left-heavy`, `right-heavy`, `messy` and `layered`. A step takes only a
free cell near the head, outside the protected shape and not in a hole. A strand that closes a hole
or splits the shape is dropped.

## Variation

A request sets one `variation` level. The server turns it into five budgets: silhouette, region,
hair, detail and palette. The job stores the five values it used. A request may set each one in
`parameters`. A higher variation does not make candidates different by itself: the diversity check
does. A slot or a palette fixes a color, so the palette budget moves only the colors that nothing
fixes.

Colors move in OKLCH. The palette variation changes the lightness, the chroma and the hue of a base
color, and the tones of a role step in lightness. Every result is a `#rrggbb` color again.

## Diversity

A candidate must differ from the source and from the siblings accepted before it. Each variant keeps a
compact signature, never its frames: a grid of its silhouette and of its lightness, how the tones
of its palette spread over each region, and the base colors of its palette in OKLab. Four distances,
each from 0 to 1, give the score: silhouette, frame, region pattern and palette. The score of a
candidate is its distance to the nearest reference. The number of mutations is no measure of
diversity.

A candidate below the minimum is rejected. The server generates again from the next seed of the
try, up to five tries. A frame whose shape leaves the bounds of the profile, or whose protected cell
changes, is rejected the same way. A batch that finds no candidate fails the item, and the
moderator can regenerate it.

The candidates of one job run in order. A candidate waits while the one before it waits or runs, so
each sees its siblings. In an update the siblings are the candidates of the same item. In a create
they are every candidate of the job. Jobs run side by side.

## Determinism

The spec of a job holds in full what it runs: the profile, every Genesis Template, every palette, the
baseline of a create, the sources, the candidates and the seed. A job reads no later content, so a
content release does not change a job that exists. The run id comes from the fingerprint: a SHA-256
of the canonical spec. Two equal specs give one job.

The seed of a candidate derives from the root seed, the source CID, the target item id, its position
in the job, the run id, the generator and the profile. The seed of each operator step adds the
inputs in the table above. Nothing reads the clock, the host, the worker or the database order. A
request with `seed.mode` `auto` takes a random seed once, at creation. The Studio view always sends
`auto`. A fixed seed is an API setting only.

A revision records the seed of the try that made it. That seed and the spec rebuild its content
alone: no sibling is needed. A regeneration takes a new seed from the old one.

## Identity

| Name              | Meaning                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `targetItemId`    | The item the candidate becomes: an existing item id, or the id a create proposes |
| `revision`        | The content revision of one candidate. 0 is the first generated result           |
| `generatedCid`    | The CID of the latest generated revision                                         |
| `candidateCid`    | The CID of the current revision: generated, or a human revision after a save     |
| `sourceCid`       | The CID the target item ran on when the job was created. Empty in a create       |
| `generationRunId` | The run that made the candidate                                                  |
| `templateId`      | The Genesis Template the candidate starts from                                   |
| `paletteId`       | The Palette Template of the candidate. Empty when its choice names none          |

The item id is `data.item.id` of every revision. The CID changes with any change of the content,
semantic fields among them. A candidate keeps one target item id through every revision, edit and
regeneration. Workflow data never enters the canonical content.

## The worker

The request that creates a job stores the job and returns it. A worker in the engine process
polls the queue. It claims a candidate with one atomic update that gives a lease. A worker that stops
loses the candidate when the lease ends, and the candidate runs again, up to three times. A worker
that lost its lease cannot write a result.

A result is stored as a draft Object Layer by the one persistence path of the Studio: a complete
definition with its render, never a fragment. A draft binds nothing, so the target keeps its
definition until a promotion.

## Review and human finalization

```text
queued → running → generated → review ⇄ editing → approved → promoted
                 ↘ failed          ↘ rejected → queued (regenerate)
```

- A generated candidate gets a technical validation: the content hash, the item id, the stats, the
  render and the render frames against its template and profile. It then goes to `review`, or to
  `failed`.
- **Edit** opens the candidate in the Object Layer Studio, the one granular editor. The human may
  change the render, the frames, the directions, the colors, the description, the stats and the
  activable flag. A save stores a new revision under a new CID; the earlier revision stays. The
  candidate records it, is validated again and returns to `review`. A save never binds.
- **Approve** names the exact CID. A later revision ends the approval. A target item has one
  approved candidate: a second approval answers 409.
- **Reject** keeps the revision. **Regenerate** queues the candidate under a new seed.
- **Promote** makes the approved revision the active definition of its target item.

Approval and promotion are two decisions: approval says this exact revision is right, promotion
makes it the runtime definition. Technical validation is an automatic decision about integrity;
approval is a human decision about quality.

**Cancel** ends the workflow of a job: waiting, running, review and edit candidates become
cancelled. Nothing is deleted. A result that a worker stores after its candidate is cancelled is
purged at once.

**Delete** removes a job in any status and everything it left: its candidates, its audit trail, and
every revision no item runs or ran, with its render frames, atlas and pin records. Approved, edited
and rejected candidates go with it. A revision this host published, for example by a promotion whose
bind failed, goes from the Object Layer authority too: the authority lets the domain that published a
definition purge it. A job that still works stops first, as a cancel stops it, so the worker makes
nothing more for it. A revision an item runs or ran stays, with the binding history that records it.
So does a revision that a candidate of another job names, or that ItemLedger registers. If the
authority does not answer, the delete fails and removes nothing here, so you can run it again.

**Reset** is in the view only: it clears the mode, the form, the selected job and the filters.

The Object Layer Studio opens a candidate under review by its exact CID. Elsewhere the Studio opens
the definition an item runs on.

## Promotion

Generation, review and edits never bind an item; a promotion is the bind
(`src/projects/cyberia/procedural/jobs/promotion.js`). It publishes the approved revision through the
one Object Layer publication path, then one transaction binds the item in the catalog, moves the
candidate to `promoted` and records the audit entry. See [Runtime binding](runtime-binding.md).

- **Update.** The bind holds only while the target item still runs `sourceCid`. If another writer
  bound it meanwhile, the promotion answers 409 and changes nothing. If not, the approved revision
  becomes the definition of the same item id. The replaced definition stays stored.
- **Create.** The bind holds only while the proposed item id is still unbound. If a definition took
  it, the promotion answers 409. If not, the approved revision becomes a new item and its binding.

After a promotion, the engine asks the game servers to reload their object layers. The engine never
edits `cyberia-content`.

## Audit

Every decision that shapes an asset is a record in `CyberiaProceduralAudit`: the action, the actor,
the job, the candidate, the revisions and CIDs before and after, and the reason. A promotion is
`item.promoted` for an update and `item.created` for a create.

## Code layout

```text
src/projects/cyberia/procedural/
├── engine.js              models, job lifecycle, cancel, delete
├── generator-registry.js  the generators
├── templates.js           Genesis Templates from content, and their geometry
├── context.js             the frozen context of a generator
├── spec.js                request checks, the spec, the configuration
├── source.js              existing items, and the baseline of a new item
├── core/                  frame analysis and mutation, morphology, diversity, OKLab, seeds
├── generators/skin/       the skin generator, its operators and hair growth
├── jobs/                  job creation, the worker, review and promotion
├── profiles/registry.js   profile validation and the shipped profiles
└── palettes/              the palette catalog from content, and palette resolution
```

## Where the data lives

| Data                       | Collection                           | Database             |
| -------------------------- | ------------------------------------ | -------------------- |
| Candidates and revisions   | `ObjectLayer`, render frames         | The content database |
| Profiles, jobs, candidates | `CyberiaProceduralProfile` and so on | The runtime database |
| Audit trail                | `CyberiaProceduralAudit`             | The runtime database |

Genesis Templates and Palette Templates are content, not collections. A job stores the ones it uses.

A content release builds a new content database and does not carry drafts. Finish or promote the
approved candidates of a job before you promote a release.
