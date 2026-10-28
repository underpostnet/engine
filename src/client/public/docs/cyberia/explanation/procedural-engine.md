# Procedural Engine

The Procedural Engine makes item candidates in the Cyberia Studio. The server makes the candidates:
it automates the visual work. A human finishes each candidate in the Object Layer Studio, then
approves and promotes it. Its generators make skins, floors and portals.

The view has two workflows. **Map Population** prepares the floors, the NPC skins and the portals of
one map, records the entity-type defaults they need, composes the map in a draft, and publishes all
of it onto the same map in the background. **Item Generation** works on items one run at a time, in the
two modes below. A map population orchestrates item generation runs; it adds no second candidate
lifecycle.

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
| `cyberia-content`      | The semantic foundation, Genesis Templates, the palette library     | Any render or binding        |
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

A template holds a canvas, a list of frames for each direction code, a legend from letters to region
ids, the palette role of each region with its shadow, base and highlight tones, an outline color and
a frame duration. Each frame is a region map. A role with `artDirection` takes the colors of the
foundation palettes of an item. One item type can have many templates, for example `skin.humanoid`
and `skin.humanoid-heavy`.

Each item type has a frame baseline, `RENDER_FRAME_CONTRACT` in `SharedDefaultsCyberia.js`. The
shipped templates start from it, and the view shows it next to the frames of each template. It is a
suggestion, never a rule: a template holds the direction codes and the frame count its author
chooses. The client reads the same codes: a walking code it does not find falls back to the idle
code of its facing.

| Item type  | Idle codes, frames each | Walking codes, frames each |
| ---------- | ----------------------- | -------------------------- |
| `skin`     | `08` `02` `04` `06`, 1  | `18` `12` `14` `16`, 2     |
| `floor`    | `08`, 1                 | None                       |
| `portal`   | `08`, 3                 | None                       |
| `obstacle` | `08`, 3                 | None                       |

The first digit is the action, 0 idle and 1 walking. The second digit is the facing: 8 down, 2 up, 4
left, 6 right. The walking frames of a skin lift one foot, then the other. The three idle frames of
a portal turn its arms by a third of their period each, so the third frame leads back to the first.
The three idle frames of an obstacle shift its loose pieces. The back view of a skin has no face.
The left view is the right view mirrored, and the template holds it in full. `cyberia-content`
checks only the structure of each direction: a direction code, at least one frame, and frame rows
that fit the canvas and the legend.

A template must also fit the profile of its generator: the profile ranks each of its regions. The
configuration lists, for each template, what stops it from fitting. A create names its template. An
update takes the template the request names for an item, else the first usable template of its
item type.

A template is a start, not a dependency. It fits any render of its item type that has a frame,
whatever its canvas. A render stays valid: the item keeps it, a run revises it, or a moderator
rebuilds the item from a template on request.

The engine reads the templates from the content artifact it serves, never from the source files. A
template that is in the content checkout but not in the artifact does not exist for the engine. The
configuration therefore reports `content`: the commit the artifact is built from, the commit of the
checkout, and `stale` when they differ. The view then tells the moderator to build and release
`cyberia-content`.

## Existing content

For each target, the engine resolves the item id, its type, the CID it runs on, whether it has a
render, its definition, its art direction and its Genesis Template. The art direction is the visual
part of the foundation context of the item, the one the Object Layer viewer shows: its art brief and
its foundation palettes. The foundation palettes are, in order, the colors its art brief names and
the palette of each biome it belongs to.

A target with no render is valid. The engine then draws the base item from its template, with the
colors of its palette. A target with a render starts from it: its frames are recolored and changed
inside the bounds of the profile. The region map of the template frame moves onto each frame of the
render, bottom on bottom and centre on centre, so a 26×26 skin takes the regions of a 25×25
template. This lets a run complete the renderless items of the content.

An update names in `source.fromTemplate` the items that start from their template instead. Their
candidate replaces the render. The engine never replaces a render that the request did not name.

## New items

A new item takes its function from content: `baseline.items` of the foundation names, for each item
type, the item whose `activable` flag and stats a new item starts from. Its description starts
empty. The generator never invents gameplay values. A human writes the description and changes the
stats in the Object Layer Studio before approval.

## Palettes

`cyberia-content` owns one global palette library (`procedural/palettes/<slug>.json`). A palette is
a theme. It belongs to no item type. It has an `id` (a slug), a unique `name`, a `family`,
`biomeTags`, `roles` and `constraints`. Its `roles` give a base color to `primary` and `outline`,
and to any of `secondary`, `detail`, `feature` and `accent` the theme needs. A palette with fewer
colors stays as it is: a template role whose palette role the palette does not give keeps its
default, from the foundation palettes, the render or the template.

| Palette role | Takes                      | Skin  | Floor  | Portal | Obstacle |
| ------------ | -------------------------- | ----- | ------ | ------ | -------- |
| `primary`    | The main mass              | torso | ground | swirl  | chunk    |
| `secondary`  | The second mass            | legs  | patch  | rim    | loose    |
| `detail`     | Small dark parts and lines | hair  |        | depth  | seam     |
| `feature`    | The distinct part          | skin  |        | core   | dust     |

Each role of a Genesis Template names the palette role it takes (`palette`). The mapping belongs to
the template, not to the palette, so every palette colors every template: a skin theme colors a
floor, a portal or an obstacle too. The constraint `minContrast` keeps the `contrastRoles` apart
from the outline; the engine checks it in OKLab when it reads the catalog
(`src/projects/cyberia/procedural/palettes/catalog.js`). A palette id the library does not hold is
refused.

The families are natural, dark, light, warm, cool, biome and exotic. Each family goes from the
darkest to the lightest of its first contrast role.

A color slot is one tone of one role: `<role>.shadow`, `<role>.base` and `<role>.highlight` for each
role of the template, then `outline` and `accent`. The humanoid template has `hair`, `skin` (head and
skin), `torso` and `legs` (both legs).

A palette choice says where the colors of a target come from. A target is one item of an update,
or the run of a create. Both modes take the same choice:

| `paletteId` | Each candidate takes                                        |
| ----------- | ----------------------------------------------------------- |
| None        | The defaults of the target                                  |
| A palette   | That palette of the library                                 |
| `random`    | A palette of the library, which the seed picks for each one |

The slots the choice sets win over each of them. The resolution order is:

```text
defaults (foundation palettes of an item, else its render or template)  →  palette  →  slots
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

A palette colors every role of the template, over the foundation palettes; these colors also stay
as they are.

`GET /api/v1/cyberia-procedural-job/sources/:itemId/palette` answers the palette an update starts
from for one item, and `GET /api/v1/cyberia-procedural-profile/templates/:id/palette` the palette a
create starts from with a template. Each answers the template, the foundation palettes and the
default of each slot with its origin, `palette`, `foundation`, `render` or `template`, under the
palette `?paletteId=` names. The view shows these defaults, and the moderator sets any slot
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
item type, ranks the regions, gives each facing its rules (whether its face shows from the front, the
side or the back, and how much hair it carries), and holds the constraints: the regions whose shape
is protected, the bounds of the variation, how far a shape may grow, the least diversity and the
regions that may deform each other. An idle and a walking direction of one facing take the same
rules. It holds no region map, frame, color, item semantics, binding or CID.

A profile is known by its id. The shipped profiles are source data
(`src/projects/cyberia/procedural/profiles/registry.js`): each start of the worker writes them over
the stored copy. The shipped `skin-default` profile protects the shape of the torso and the legs, so
armor layers fit. `portal-default` protects the core, so every frame of a vortex turns around the
same center.

## The generator registry

`src/projects/cyberia/procedural/generator-registry.js` lists each generator: its id, the item type
it makes, the modes it supports, its default profile and its implementation (`parameters`,
`prepare`, `generate`). A new item type is a new entry; the jobs, the worker and the review flow do
not change. It holds `skin-variant`, `portal-variant`, `obstacle-variant` and `floor-tile`. The skin,
the portal and the obstacle generators are one implementation, the sprite generator; each has its
own profile, and face features and hair grow only where a profile gives facing rules. A generator
may also check every revision of its item type, an edit in the Studio too: `floor-tile` refuses a
cell that is not opaque, and `obstacle-variant` refuses a render that breaks the exact obstacle
contract.

A portal generator draws art only. Where a portal leads is the portal connection of its instance,
which the Instance Studio edits; artwork and connection never change each other.

## Obstacles

An obstacle blocks movement. `cyberia-content` holds two obstacle Genesis Templates: a pile of rocks
in brown tones (`obstacle.rock-pile`) and a pile of concrete rubble with bent rebar in gray tones
(`obstacle.rubble-pile`). Both share the regions `chunk`, `seam`, `loose` and `dust`, so one profile
(`obstacle-default`) fits both. The chunks keep their shape; the
three idle frames shift only the seams, the loose pieces and the dust. A new obstacle takes its
function from `baseline.items.obstacle`. Item Generation updates or creates obstacles, and a map
population generates the obstacles its map names in the Obstacles group.

## The floor generator

`floor-tile` has two paths (`src/projects/cyberia/procedural/generators/floor/`).

A floor that starts from its render keeps its canvas, its frames and its frame duration. Each cell
takes the nearest tone of the plan by lightness: the mean lightness of the render goes to the base of
the ground, and its spread goes to the span from the shadow to the highlight. Alpha stays.

A floor that starts from the template gets a seamless tile from the region map of the floor Genesis
Template. The tile is a torus: each operator reads its
neighbors across the edges, so the right edge joins the left edge, the bottom edge joins the top
edge, and a tile joins its copies.

1. **Shift.** The pattern moves on the tile. The layout variation sets how far.
2. **Trade.** `ground` and `patch` trade cells at their border. Each region keeps its share within
   0.1, and no trade makes a line one cell wide.
3. **Tones.** Smooth noise on the torus picks the shadow, base or highlight tone of each cell. The
   detail variation sets how many cells leave the base.
4. **Relief.** A patch lights its top edge, takes the outline color on its bottom edge, and casts
   the shadow tone of the ground under it.
5. **Accents.** Single accent cells lie on the ground, away from the outline and from each other.

A tile that leaves its bounds, or stands too close to its source or its siblings, is drawn again from
the next seed of the try. Every cell is opaque.

## Map population

A map population prepares the items of one map, their entity type defaults and the map itself, then
publishes them onto that map (`src/projects/cyberia/procedural/population/`). Each item keeps its own
identity, configuration and entries. The map orchestrates the items, the moderator owns the
composition, and the publication applies the selected content in a fixed order. The view follows the
work in five steps:

1. **Items.** Each item the map needs, grouped as floors, NPC skins, portals, obstacles and other.
   An item has an editor: its resolution, template, palette and variation, Generate, and its gallery
   of entries; an item no generator draws has the way to the Object Layer Studio instead.
2. **Entity type defaults.** The stored entity-type defaults that name the staged items.
3. **Map.** The Map Studio composes the draft: the grid and the placements.
4. **Runtime context.** Optional. Where the map runs now: each instance that lists it, with its
   universe and live servers, and each universe of those instances, read from the canonical records
   each time. It edits nothing: each action opens the Instance Studio or the Universe Studio on this
   population, and their save returns here.
5. **Publish.** The review of everything the publication applies, then the publication in the
   background.

Each step shows a state the server derives from what is stored: not started, optional, in progress,
needs attention, ready or published. Opening a step, a default template or a run is not progress.

**Three states.** The asset source is the definition an item has: from the foundation, an Object
Layer revision, or a definition a human made. The population item is what one population does with
the item. The runtime binding is the CID `CyberiaItemCatalog` selects. A decision of a population
changes no definition, no binding and no placement. Only its publication does.

**Items.** An item comes from the foundation composition of the map, from its placed entities, or
from the moderator. The item type and the entity type decide its group, by
`ENTITY_TYPE_TO_ITEM_TYPES` of the shared vocabulary. A generator stage takes the item type its
generator draws; the **Other** group takes every canonical item type no generator draws, for example
a weapon, a static or a resource. A new generator takes its item type out of Other, with no
migration. A player stays out. One item id is one item, however often the map places it. An item id
the map places can have any form, for example `atlas_pistol_mk2`; a new item id is lowercase words
joined by hyphens, and a new item of Other also names its item type. Other is a group, never an
item type: each item keeps its own type.

A placed item that is not a Cyberia item here is a finding, not a failure.

**Resolutions.** Every item, of any item type, has one Resolution selector of exclusive choices:

| Resolution                    | Does                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Keep current artwork          | Generates, publishes and binds nothing                                               |
| Generate from current artwork | Generates variants of the render it runs now, on its own canvas                      |
| Rebuild from template         | Draws new artwork from a Genesis Template; an item with no artwork is a new item     |
| Authored by hand              | Uses a definition a moderator authors in the Object Layer Studio, or one that exists |

One function decides what each item allows (`resolutionsOf` in
`src/projects/cyberia/procedural/population/resolution.js`); the view and every write read it, and
the client keeps no list of its own. It reads what the item type supports and what the item has:

| Resolution | Available when                                                                                     | Else the reason names        |
| ---------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| keep       | the item runs a definition now                                                                     | no artwork to keep           |
| render     | a generator makes variants of the type, a template serves it, and the current artwork has a render | the first that fails         |
| template   | a Genesis Template of the type exists and a generator builds from it                               | no template, or no generator |
| author     | always                                                                                             | —                            |

A choice the item type cannot offer at all is left out: an item no generator draws and no Genesis
Template serves offers Keep current artwork and Authored by hand. A choice the type offers but the
item does not take now shows disabled, with its reason. The view recommends an authored
definition, else the current artwork while it has a render, else a template, else authoring by
hand. Generation is optional: an item with valid artwork starts kept. No resolution replaces artwork
that the moderator did not select.

**One editor.** Every item has the same editor, in two parts. First the resolution: the selector,
the settings of the chosen resolution, and one primary action in the same place for all four:

| Resolution                    | Settings                                      | Primary action           |
| ----------------------------- | --------------------------------------------- | ------------------------ |
| Keep current artwork          | The CID it runs and its binding revision      | Keep current artwork     |
| Generate from current artwork | Template, palette, variation, results to make | Generate variants        |
| Rebuild from template         | Template, palette, variation, results to make | Rebuild from template    |
| Authored by hand              | Start from empty canvas, or existing artwork  | Open Object Layer Studio |

A choice of resolution or setting stores nothing; the primary action stores it. Keep current artwork
records the binding of this moment, and the item is ready at once. Generate variants and Rebuild
from template store the settings, then generate. Open Object Layer Studio opens the start the editor
names. There is no Save button. Second, the results of the item, in one gallery.

**Ready.** An item is ready when its resolution has its artwork: it keeps its binding, it uses a
result, or it uses an authored definition. Ready is not published: the population publishes and
binds the artwork with the map, and only then the item shows Published.

**Authored by hand.** It works for every canonical item type, a type a generator draws too. The
draft starts from one of two choices. **Start from empty canvas** opens the Object Layer Studio under
the label "Procedural Engine" on a blank draft with the item id, the item type and one empty down
idle frame: never template pixels and never a generation. **Continue from existing artwork** opens
the exact definition the moderator chooses: the definition the item runs now (**Current binding**),
then every stored definition of the item id, newest first: its drafts, the definition it uses, and
those any other workflow stored, published or not, with or without a render. The revisions of the
runs of the item are left out, since each result continues its own. A save stores a new draft
definition through the Studio persistence and selects it; the definition it started from stays, and
the same content saved again is the same draft. A draft a save creates is a result of the item: the
target lists it in `drafts`, which is how the workflow knows the drafts it owns. No CID or binding
changes before the population publishes and binds it with the map. Back returns to the same item of
the same population, and the view reads it again. An item set to Authored by hand with no
definition yet needs attention and blocks the publication, as an undecided item does.

**Results.** The Results card of an item shows every artifact its workflow made and keeps, in one
gallery: each run of the item, labelled **Generated** (from its current artwork) or **Genesis
Template**; each **Hand-authored** draft its Studio saves stored; and the **Stored definition** it
uses when another workflow stored it. A **Runs now** label marks a result whose CID the item runs
now. Each result shows its artwork, its state and its actions:

| State              | Meaning                                                     |
| ------------------ | ----------------------------------------------------------- |
| Generating         | The worker runs it                                          |
| Ready              | Generated and valid; it waits for a choice                  |
| Open in the Studio | A moderator edits it                                        |
| Selected           | The item publishes it                                       |
| Published          | A publication bound it                                      |
| Saved              | A draft saved after the selected one, or with none selected |
| Superseded         | A draft saved before the selected one                       |
| Discarded          | A review rejected it; it can only be deleted                |
| Failed             | The generation failed; its error shows                      |
| Cancelled          | Its run stopped before it finished                          |
| Record missing     | Its run holds no candidate record                           |

A **No render** badge marks a result whose definition has no render frames. The server derives each
action and its availability; an action that does not apply names its reason on the card:

| Action           | What it does                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Use this result  | Makes its exact revision the artwork the item publishes, in one write: the item is ready |
| Continue editing | Opens it in the Object Layer Studio; a save makes a new revision or draft to use         |
| Retry            | Runs a failed result again under its own seed: the same result, never a new one          |
| Delete           | Removes it with its frames, atlas and render files                                       |

**Use this result** checks that the result belongs to the item, has its render, and is the
revision the moderator saw; it never picks another revision. A generated result of another start
switches the resolution in the same write. Using the selected result again changes nothing. The
selection is stored, so it stays after a reload, and nothing else is saved after it. **Retry** is there only for a
failure a second run can pass: a lost lease or a failing store. A generator that refuses its input,
or a result that fails validation, fails the same way under the same seed; Generate makes a new
result instead. **Delete** stops a run that still works first, so the worker makes nothing more for
it, and a result the worker stores after the delete is purged at once. A generated result goes with
its run, candidate and audit trail; a draft goes only when the item stored it. It refuses the
selected result (use another result or reset the item first), published content and a definition
something else keeps, and names the reason. **View
details** shows the source, state, revision CID, run, template, palette, validation, times and what
keeps it; for a generated result it reads the audit trail. **Delete unselected** deletes every
result that is not selected and that nothing keeps. A delete asks first in a short confirmation that
names each result; what stays is behind a disclosure, and the buttons stay in view on a small
screen. Each delete is its own: one that fails leaves the others done, and deleting again is safe.

**Retention.** An item keeps at most 16 results: four full Generate requests. One skin result stores
about 240 KB (render frames, atlas and its renders), so an item holds under 4 MB, and its results
fill a tenth of the 256 sprites the view caches. Generate and a Studio save refuse beyond the limit
and say how many results the item keeps; the card shows the count. Nothing is deleted on its own:
the moderator deletes unselected results to make room. A delete or a reset drops the sprites of the
removed definitions from the page cache.

**Reset item.** A workflow can end in a state nobody wants to repair by hand. **Reset item** returns
the item to a clean start after a confirmation; what goes and what stays is behind a disclosure.
Every generated
result goes with its run and the revisions nothing else keeps, the selected one too; each draft the
item stored goes when nothing else keeps it; the item no longer uses its definition and takes the
recommendation now with no palette choice and no variation. Published definitions, bindings,
placements, defaults, a definition another workflow stored and the population audit stay. The reset reports
what it removed, what stayed and why, what failed, and what the workflow still owns; a reset of a
clean item changes nothing, and running it again retries what failed. The next Generate gives new
results: each run of a population takes a run index no other run took, and its seed derives from
it. **Remove from population** is another action: it takes the item out of the population.

**A change of resolution.** A switch deletes nothing: the results, the authored definition, the
binding and the audit stay. It takes the approval back from the selected result, which stays ready
for a later choice; the audit names the change. Keep records the binding of that moment again. The
definition the item authored stays kept while it has another resolution: it shows as Saved, and
Use this result authors the item with it again.

**Keep.** A keep records the CID the item runs and its binding revision: how many bindings its
catalog history holds. It needs no run and no revision. When the item is bound again, the item shows
a conflict until the moderator runs Keep current artwork again or chooses new artwork, and the
publication checks the binding again in its transaction.

**Remove from population.** One operation takes an item out, whatever its source: the foundation,
a placement or the moderator. It cancels the active work of its runs and keeps its jobs, results and
audit. The catalog, the definitions, the bindings, the placements and the Map Studio catalog stay as
they are. A removed item stays in the Removed list, with who removed it, when and why. From there a
moderator restores it, with its results, or forgets it permanently.

**Forget permanently.** It deletes only the entry of that item in the Removed list of this
population, after a confirmation that names the item and that scope. The definitions, the CIDs, the
bindings, the placements, the defaults, the other items, the jobs and the audit stay. Forgetting an
item the list does not hold changes nothing, and the list changes only when the server confirms.
A later read of the map, or a moderator, may add the item again; its earlier runs show again as its
results, since each job names the population and the item it generates.

**Settings.** The settings of an item are stored on the server by its primary action and change at
any time; the view asks before it drops settings no Generate stored. Generate stores runs from the
settings as they are; each run has its own seed, so a new run gives new artwork and an earlier
result stays. Continue editing opens a generated result in the Object
Layer Studio, and a save there makes a new revision to use; the Studio then returns to the same item
of the same population. Each result shows as the game client draws it: its idle frames, animated.

**Artwork of an item.** One function on the server resolves the artwork every view shows, from the
working state: a kept item shows its binding; else the definition it uses, its selected entry, its
newest stored result not selected yet, else the binding it runs now. An item none of these draws is
missing. Each picture names its source (Kept, Authored, Selected result, Newest result not
selected, Runs now, No artwork), so a draft never passes for published content. A CID names immutable content:
a new revision has a new CID, so a picture never shows a stale revision.

**Palettes for several items.** The moderator checks items and chooses one source, a Palette
Template or the biome colors of the map, and one policy for the colors each item sets: keep them or
replace them. The preview shows every slot that changes or stays, and what is skipped and why. Apply
stores exactly what the preview showed; each item keeps its own palette and is linked to no other.
With the biome colors, each NPC and each portal starts from another color of the biome, so they
differ.

**Map draft.** The Map Studio opens the draft of the population, never the live map. The draft holds
the grid (cells across and down, and the pixels of a cell, as the runtime receives them) and the
placements, from the map revision it read. Each save names the draft revision it read, so no save
overwrites a newer one; a reload, another browser or another moderator opens the saved draft. When
the live map moves to a new revision, the draft keeps its base revision and the publication refuses
it; after a review, a rebase moves the draft onto the new revision.

**Map preview.** The Studio, the map step and the gallery draw every item as the game client does:
from the atlas of its CID (`layout/:cid` and `render/:cid`), the idle frames facing down, at the
frame duration of the atlas, without smoothing. In a draft the CID is the artwork of the item; on a
live map it is the binding. The Studio reads these CIDs again each time it comes back to the draft,
so a selection made in the population shows at once. An item no CID draws is hatched with a dashed
border, and the draft lists it with the reason.

**Runtime order of the defaults.** The game server gives an entity its behavior and drops from the
entity-type default row it matches. A row no instance conf references is a global row: every world
runs it, with no instance association. A row a conf references is an instance row of that world.
A world runs its instance rows in conf order, then the content baseline of the entity types they
leave out, with a global row of the same build in place of its baseline row, then the other global
rows, oldest first. Among the rows of the entity type whose `liveItemIds` the entity carries, the
largest set wins, and the earlier row wins a tie: an instance row wins over a global row of the same
size. With no match, the first row of the type answers. The view and the runtime build that order
with one function, `runtimeEntityDefaults`.

**Entity type defaults.** The defaults step is a workspace of stored defaults, built from the staged
items. It needs no map, placement, universe or instance. A default joins it when its live, dead or
drop items name a staged item. The moderator adds any other stored default, and removes a default
from the workspace; neither changes the default. Each default shows its entity type; its live, dead
and drop items, each as a tile with its idle 08 artwork, its item type and the source of the
artwork; its behavior; and where the game runs it: every world for a global default, else the
instances whose conf names it. The workspace reads the confs from the working graph, so it shows
where each default runs once the population publishes. A staged item shows its artwork from the
working state, so a new entry shows before any publication. The step also names each world that runs
another default in its place, for example an instance default over a global one. A staged item that
no default names is a warning, never a blocker; Create default opens a new default for it.

| Label                           | Meaning                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| Global · every world            | no instance conf references the default                      |
| Instance · `code`               | one instance references it                                   |
| Shared · N instances            | several instances reference it: an edit changes each of them |
| Pending association · `code`    | the draft of the instance starts to reference it             |
| Leaves `code`                   | the draft of the instance stops referencing it               |
| Overridden in `code`            | a variant of that instance runs in its place                 |
| Variant of …`id`                | a copy one instance runs, saved to the Procedural Draft      |
| Edit saved to Procedural Draft  | the population holds an edit of the stored default           |
| New · Saved to Procedural Draft | a new default the publication creates                        |

**One editor.** The Entity Studio is the one editor of a default and of the instances that run it.
Edit and Create default in the defaults step open it under the label "Procedural Engine · Entity Type
Default"; the defaults step has no form of its own. The Studio reads the default from the working
graph (`GET /:id/default-drafts/:ref`, where `ref` is a row id, a draft key or `new`): the row, the
instances that run it now and as stored, and the population revision. Its banner names the state
(Persisted, Saved to Procedural Draft, New, Unsaved changes) and the scope (Instance, Shared, Global).
A new default starts linked to the instance it comes from, else to the one instance that lists the
map; with none, the moderator links one or chooses Global. One instance references many defaults, and
many instances reference one.

**One save.** "Save to Procedural Draft" (`POST /:id/default-drafts`) writes the row and its
references in one write of the population, at the population revision and the draft revision the
Studio read: the default draft, and the reference in the conf of each instance draft. A new row is
referenced as `draft:<key>` until the publication creates it. The stored default and the stored confs
do not change. A save that brings the row and its links back to the stored state drops the draft, and
an instance draft left equal to its base goes with it. Discard (`DELETE /:id/default-drafts/:ref`)
removes the default draft and each `draft:` reference to it. A default that no instance runs any more
would run in every world: the save needs the explicit Global choice, the Studio confirms it, and
without it the checks refuse the publication. A shared default stays shared: an edit changes each
instance that runs it, and only Make variant gives one instance its own copy. Back reopens the
defaults step; with unsaved changes it asks first. Reopened, the Studio shows what the draft holds.

**Variants.** To change a default for one instance, Make variant copies a shared or a global default
into the draft of that instance (`POST /:id/instances/:code/variants`). For a shared default the copy
takes the place of its reference in that conf; for a global default the conf gains a reference to the
copy. Every other instance keeps the default. A default that one instance runs alone takes no
variant: its edit changes that instance only. Edit variant opens the copy in the Entity Studio
(`?population=&instance=&variant=`), whose save writes the draft (`PUT .../variants/:key`); Drop
variant gives the instance the default back. The publication creates each variant with its reference
in one transaction, so a copy never runs as a global default.

One draft edits one stored default, at the `updatedAt` the Studio read: a stored default that changed
since refuses the save (409), and one that changed after the draft stops the publication until the
moderator discards the edit. The publication writes each edit at that `updatedAt`, creates each new
default and puts its id in place of each `draft:` reference, all in the commit transaction.

**Map media.** The preview of a map is the picture `map-preview-generator.js` draws from its placed
entities, by the first idle frame of each item, as the node background of the Instance Map. Every
write of a map revision, a live save of the Map Studio or a publication, stores its media `pending`
with that revision. After the commit the server draws the preview of that revision and stores the
media `ready`, or `failed` with the error. A live save answers at once and draws after its answer;
a publication completes only once the preview is drawn. A draw of an older revision stores nothing
once a newer write moved the map on, and a draw that its stored picture already holds writes no new
File, so a retry is safe. The Map Studio and the map step show the state and draw again on a failed
or pending preview. The thumbnail of a map is the custom image its author uploads; without one, the
preview is the thumbnail. No step copies the preview into the thumbnail.

**Draft pictures.** The same renderer draws a map an editor holds, saved or not, and stores nothing.
The Map Studio shows that draft picture for a new map and while the stored preview of a save is
pending, then the stored preview once it is ready; a map that draws nothing shows as empty. An older
draw never replaces a newer one. The Instance Studio shows a map it adds at once, from the stored
map: its stored preview, else its picture drawn for the revision it is at, else "Empty map". The
cards change only once the new ones arrive.

**Impact.** The catalog binds an item id for every map. Before a publication the view shows where
each item runs: on this map only, also on maps of the same biome, or globally (on another biome, or
on a player). A global change needs the explicit acceptance of the moderator.

**Review.** Before a publication, the publish step shows everything it applies: each item with the
artwork it shows, its state and what publishing does to it (kept, publish a definition, publish the
selected entry, or not ready); the entity type defaults; the map draft drawn by the artwork of its
items, with the live preview and the custom thumbnail; and the plan: the instances, universes and
variants it writes, the defaults it writes and the worlds it reloads. Each item, the defaults, the map and the runtime context
open their step or their Studio. Errors stop the publication; warnings, such as a missing default or an
item no artwork draws, stop nothing. Nothing in the review publishes or stores anything. Publish
names the population revision the review showed: a population that changed since asks for a new
review (409).

**Publication.** The publish step runs the check first and lists what would stop the publication.
The publication runs in the worker, not in the request; a moderator can close the browser, and a
restart of the server does not lose it, because each phase runs under a lease and records its result.

```text
queued → preflight → publishing_objects → committing_runtime → refreshing_runtime → completed
```

1. **Preflight** checks every condition again and freezes the plan: the population revision, the
   kept items with their observed CIDs and binding revisions, the assets with their CIDs and the
   binding revision each replaces, the map revision,
   the draft revision and its grid, the map revision whose media the refresh draws, each instance and
   universe draft with the stored revision it starts from, each variant, and the worlds the commit
   changes. The plan holds only what changes: a kept item publishes and binds nothing. Each drafted
   world names an Economy (`economyCode`, `standard` when empty): the check reads it from the content
   database the server serves, as the runtime does, and a missing or retired Economy stops the
   publication. A conf that names no stored Economy is never repaired by a new one.
2. **Objects.** Each selected revision goes to the Object Layer authority, one at a time. The
   authority must answer the selected CID. Each published revision is recorded, so a retry skips it.
3. **Commit.** One MongoDB transaction checks the population and every binding of the plan, binds
   each item at the CID its item read, writes the draft
   grid and placements onto the same map document at the revision of the plan with its media
   pending, writes each default edit and new default, variant, conf, instance and universe of the plan at the revision it starts
   from, reconciles the map registry, and records the commit. The map keeps its id, code and
   metadata; its revision grows by one. If one check or write fails, nothing applies. The
   transaction holds no network call.
4. **Refresh.** After the commit, the engine clears the map cache, draws the preview of the map
   revision it wrote, refreshes the previews of the maps the assets reach, and reloads the game
   servers. Each world the commit changed reloads in full: a drafted instance, an instance that
   lists the map draft before or after, and each world where a placed entity resolves to another
   default, or that runs a changed default of a type the runtime spawns (player, skill, coin, loot).
   A world whose entities resolve as before does not reload. Every
   world reloads its object layers after a binding. A map no instance lists reloads no world, and a
   universe change reloads none: tickets and sessions read universes when they need them. The
   publication completes once the media is
   ready and every server reloaded. The publish step then shows the preview.

A failed phase stops the publication with its error, and Retry resumes that phase. Cancel stops a
publication before its commit; after a cancel or a failed check the population takes changes again.
A revision that the authority published stays published and unbound. A reload that a game server
misses, or a preview that fails to draw, leaves the commit in place, and the step says the refresh
waits: the worker tries it again with a longer wait each time. A second publish request while one
runs answers the same publication.

**Records of an earlier version.** A population keeps its version. A record of another version shows
as outdated and read-only. `cyberia population migrate` reports what a move of each version 2 to 6
record would do, and writes nothing; `--apply` writes it. No deploy runs it. Every record: its
targets drop their run lists, each job names the item of the target that listed it (or of its
candidate when none did), and the population counts its jobs as its next run index; no draft is
claimed, so an earlier draft is a stored definition to continue from, and a reset leaves it. Each
earlier strategy takes its resolution (`create` is `template`, `definition` and none are `author`),
the frozen lists of what a target allowed go, and each palette reference takes its global id
(`skin.exotic-teal` is `exotic-teal`, with the same colors). Of a version 2 or 3 record, a kept item
keeps the CID it read, at the binding revision that bound it; when the item runs another CID now, it
shows a conflict. An excluded item is removed and its runs stop. Every entity-default change stays
in full in the record for review, and the default it names joins the workspace. A publication before
its commit is cancelled. A version 4 record keeps its revision, defaults, publication and earlier
migration report. No binding, CID, default or placement changes. The population shows what the
migration kept. A record of any other version stays outdated, and a delete removes it with every job
it stored.

The same command then moves every job spec stored before the global palettes
(`src/projects/cyberia/procedural/jobs/migration.js`). Each frozen template role takes the palette
role its content template takes, each frozen palette takes its global id with its colors by palette
role, and the spec, its candidates and its items name the new ids. The fingerprint, the run, the
seeds and the candidates stay, so a retry, a regeneration or a Studio edit of an earlier item gives
what it gave before. A job whose items still generate waits, a spec the content cannot map stays as
it is, and the command reports both and exits 1 until they settle.

## Instance maps and portals

The Instance Studio takes maps in one step: all the maps of the Foundation, or the maps of one saga.
It first lists each map as in the instance already, added, or not stored on this host (its content
needs an import first), and adds only the maps that are new; a second import adds nothing. A map
keeps its code and its document; the instance only references it.

The portals of an instance connect the portal entities its maps place: the Portal Connector rings
the maps, then gives each other portal entity its mode. The topology check reads the same portal
records and the portal entities of the maps, and lists the maps a player cannot reach from the first
map, the portals with no portal entity at their source cell, the portals to a map outside the
instance, and the portal entities no portal starts from. It keeps no graph of its own.

## The pipeline

The server analyzes each source once for a job: the silhouette, the outline, the interior, the
enclosed cells and a distance to the outline for each frame. The outline is the occupied cells next
to the exterior, found by a flood fill from the canvas edge. Morphology (erosion, dilation, opening
and closing) works on these masks. Each frame takes the region map of the template frame of its
direction and index.

Each frame then goes through the operators, in this order.

| Operator            | Does                                                                                              | Seed inputs                  |
| ------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| `regionFill`        | With no render: fills the interior of each region, with highlight, shadow and base by the outline | None                         |
| `paletteMap`        | With a render: recolors the interior of each region by lightness, and keeps its details           | None                         |
| `featurePass`       | Clears the face features, then draws the ones the facing rules show                               | Variant seed, facing         |
| `growHair`          | Grows hair from the hair region by a styled, constrained walk                                     | Variant seed, facing         |
| `regionDeformation` | Moves the border of two regions near the contour, less with depth                                 | Variant seed, facing         |
| `mutateFrameShape`  | Moves boundary cells by a bounded contour mutation                                                | Variant seed, facing         |
| `detailPass`        | Scatters tone and accent cells over the regions that may change                                   | Variant seed, facing, region |

No operator paints a cell of the outline. The contour mutation keeps its topology guards: the
components, the holes, the bounding box and the centroid. It also keeps the outline next to the
protected regions. It is the micro variation, not the whole generator.

The idle and walking frames of one facing take the same seeds, so a variant keeps one head, one face
and one hair style while it walks. Only the legs of the template move.

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
| `paletteId`       | The palette of the candidate. Empty when its choice names none                   |

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

## Working graph

A population changes its map, and the instances and universes around the map, before anything
runs. Each document is in one of four states:

| State                     | Where it lives                                                               | Written by                                 |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| Persisted                 | the stored map, instance, conf, universe and default records                 | a Studio outside a population; publication |
| Saved to Procedural Draft | the population: `draft`, `instanceDrafts`, `universeDrafts`, `defaultDrafts` | a Studio save opened from the population   |
| Unsaved changes           | the form of the editor                                                       | nothing, until a save                      |
| Published                 | the stored records, after the commit of the publication                      | the publication                            |

`workingGraph` (`population/working-graph.js`) reads the stored documents and puts the drafts of the
population over them. Each document carries its state: `persisted`, `draft` (a draft of a stored
document) or `new` (a draft with no stored document). Every reader takes the graph from this one
function: the runtime context, the draft views of the Studios, the previews, the portal topology,
the defaults workspace, the checks, the preflight and the commit. A stored record changes only at
the commit.

An instance draft holds the fields the Instance Studio edits and its conf fields (`aoiRadius`,
`economyCode`, `entityDefaults`); a universe draft holds name, description, members and links. Each
draft records the revision of the stored document it starts from and a copy of that document. When
the stored document moves on, the draft is stale and the publication refuses it. **Rebase** moves the
draft onto the stored revision: a field only one side changed takes that change; a field both changed
stops the rebase (409) until the moderator keeps the draft values (`prefer: 'draft'`) or discards the
draft. **Discard** removes the draft, and the graph shows the stored document again. A thumbnail
that only a draft shows goes with the draft.

**Typed drafts.** Each draft is a typed subdocument of the population model, copied from the fields of
its canonical schema (`draftContract`): an instance draft from `CyberiaInstance` and
`CyberiaInstanceConf`, a universe draft from `CyberiaUniverse`, a variant and a default draft from
`CyberiaEntityTypeDefault`, the map draft from `CyberiaMap`. A copy keeps the types, defaults and
validators of the canonical paths, adds no index to the population, and refuses a field the canonical
document does not have at any depth (400). Every write of a draft goes through `writeDraft`: it checks
the entry against its contract, names the draft revision the editor read, keeps one draft per code
(and one default draft per stored default) in the same update, and lands only while the population
takes changes. Each write is one population revision more, and the publication commits only the
population revision its review read.

| Field                                                        | Contract                              | Why                                                                |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------ |
| `draft`, `instanceDrafts`, `universeDrafts`, `defaultDrafts` | typed copies of the canonical schemas | working documents the Studios write and the commit reads           |
| `context`                                                    | flexible, frozen                      | the map context the population read, under `version`               |
| `migration`                                                  | flexible, frozen                      | the report of a migration, kept for review                         |
| `publication`                                                | flexible, written by status           | the worker moves it under its lease; its plan names `manifestHash` |

`graphProblems` checks the graph as the stored records are checked. An error stops the publication:

- a draft whose stored document was created, deleted or moved after the draft started;
- a map that two instances list, or that two worlds overlap with, as the map registry refuses it;
- a portal of a changed world to a map outside its instance or to a deleted map;
- a reference to an entity-type default that does not exist;
- a stored default that loses its last instance reference, because it would run in every world;
- an edit of a stored default that changed or was deleted after the draft;
- an instance in two universes, a universe member that neither exists nor is drafted, an invalid
  universe, or a universe whose worlds use different wallets.

A warning stops nothing: a portal with no portal entity at its source cell, or a global default that
an instance draft starts to reference.

## Runtime context

A map reaches players only through an instance, and an instance joins a universe; a map has no
universe of its own. The runtime context step shows these relationships as the publication leaves
them. `GET /cyberia-procedural-population/:id/runtime-context` reads the working graph each time
(`runtimeContextOf`): each instance that lists the map now or before, and each drafted instance,
with its state, its association with the map, its universe, its preview, its live servers and its
defaults; each universe of those instances and each drafted universe, with the members it gains and
loses; and the checks of the graph.

| Label                     | Meaning                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| Persisted                 | the stored document, unchanged by the population                     |
| Saved to Procedural Draft | the population holds a draft of it                                   |
| Stale                     | the stored document moved after the draft started: rebase or discard |
| Runs this map             | it lists the map, stored and in the graph                            |
| Pending association       | the graph adds the map, or the member, at the publication            |
| Leaves this map           | the graph removes the map at the publication                         |
| Draft preview             | the preview draws the graph, not the stored world                    |

| Action                            | Opens                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Create instance with this map     | Instance Studio: a new instance with the map selected              |
| Add map to existing instance      | Instance Studio: the named instance with the map added to its maps |
| Open Instance Studio              | Instance Studio: the instance as the graph holds it                |
| Create universe for this instance | Universe Studio: a new universe with the instance as a member      |
| Add instance to existing universe | Universe Studio: the named universe with the instance added        |
| Open Universe Studio              | Universe Studio: the universe as the graph holds it                |
| Rebase on revision N              | Moves a stale draft onto the stored revision                       |
| Discard draft                     | Removes the draft of the instance or universe                      |

The Studio opens with `?population=<id>` and a banner, "Procedural Engine · Instance" or
"Procedural Engine · Universe", with the state of the document and a stale draft's Rebase. It
loads the document from the graph (`GET /:id/instances/:code`, `GET /:id/universes/:code`). Its save
action is "Save to Procedural Draft": it writes the draft (`PUT`) and returns to this step; the
stored record does not change. The Portal Connector of the Instance Studio proposes its ring from the
maps of the graph (`POST /:id/portal-connect`), so a portal entity the map draft adds takes a portal
before it is published, and a portal may join a stored map and a drafted one either way, or two cells
of the drafted map. The portals land in the form, and Save to Procedural Draft keeps them. The
Instance Studio checks the portals against the graph (`POST /:id/topology`). Its Runtime tab offers
no hot reload and no default sync: the publication reloads every world it changes, and the defaults
step sets the references; the tab opens both steps. "Back without saving" asks first when the form
holds unsaved changes. A map no
instance lists shows "This map is not assigned to an instance or universe." and publishes as well:
the step is optional, and nothing is created to make the map look assigned.

**Previews.** Every preview of the population comes from the same graph, through the same route, so
the runtime context, the Instance Studio and the Universe Studio show the same picture: the map draft
(`GET /:id/map-preview?revision=<draft revision>`) and the world of each instance, drafted or persisted
(`GET /:id/world-preview/:code?revision=<population revision>`). A picture is drawn for the revision
it names; a request for another revision answers 409, so an older picture never stands for a newer
draft. The routes answer a moderator only, and an image tag sends no session token: the client
service fetches each picture with the session headers and shows it as an object URL. It keeps at most
48 pictures, revokes the URL of each one it drops, drops every older revision of a picture once a
newer one arrives, and discards an answer older than the newest asked. Each preview names its state:

| Label               | Meaning                                                       |
| ------------------- | ------------------------------------------------------------- |
| Loading preview…    | the picture is on its way                                     |
| Draft preview       | it draws the graph, with a change of the population           |
| Persisted preview   | it draws the stored documents: the population changes nothing |
| Preview pending     | the population moved on: the next read draws the new revision |
| Preview unavailable | the draw failed, with its reason                              |

A stored map node in the Instance Studio shows its stored preview, "Preview pending" while its media
draws, and "Empty map" when it draws nothing.

## Working copies after publication

A population that published holds its publication record: the reviewed plan and what the commit
wrote. The stored maps, instances, universes and defaults hold what it published, and a new
population of the map starts from them. Its map draft and its instance, universe and default drafts
are then copies, and a population that publishes or is cancelled takes no write again.

| State    | The population                                                            |
| -------- | ------------------------------------------------------------------------- |
| Retained | closed for less than the retention window (14 days): its copies stay      |
| Eligible | closed for longer                                                         |
| Cleaned  | `draftsPrunedAt` is set: the copies are gone, the record and targets stay |

`cyberia population prune` clears the copies of every eligible population and reports what it
clears: the bytes each record held, its drafts, and the files it deletes and keeps; and what the
window keeps. `--retention-days` sets the window. It writes nothing without `--apply`, and the dry
run reports the same as the apply. It never touches an open population, a publication that runs or
waits for its reload, or one a live worker lease holds; the write checks each condition again. A
thumbnail of a draft, or of the stored document a draft started from, goes only when no instance or
map of the base, declared, served or ledger release databases and no draft of any population
references it. A second run finds nothing to clear. A draft revision of an Object Layer stays under
the existing references (`revisionKeepers`): a job, the catalog, a population target or a publication
plan keeps it.

**Rollback to an older engine.** An engine that predates the new default references (`draft:<key>`)
and the Global choice (`global`) refuses each write over them, and its commit of such a draft fails
in its transaction, so it loses or corrupts nothing. It cannot open a population that references a
new default. Before a rollback, publish or cancel those populations, or discard their new defaults; on
the older engine, discard the default draft, then the instance draft that references it.

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

**Delete** removes a job in any status and everything it left: its candidates, every revision no
item runs or ran, with its render frames, atlas and pin records, and its audit trail. Approved, edited
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

A map population promotes through its publication, in the same transaction as the map. The job API
refuses to promote or delete a job that a population owns. A publication of a revision that answers
another CID than the approved one fails, and binds nothing.

After a promotion, the engine asks the game servers to reload their object layers. The engine never
edits `cyberia-content`.

## Audit

Every decision that shapes an asset is a record in `CyberiaProceduralAudit`: the action, the actor,
the job, the candidate, the revisions and CIDs before and after, and the reason. A promotion is
`item.promoted` for an update and `item.created` for a create. A job delete is a total cleanup: the
audit trail of the job goes with it, so a permanent record never keeps heavy artwork alive. The
population keeps its own record of each delete and reset (`target.entry_deleted`,
`target.draft_deleted`, `target.reset`) with the actor, the item, the run and the CID; these stay
after the job, the result and the population are gone.

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
├── generators/sprite/     the sprite generator of skins and portals, its operators and hair growth
├── generators/floor/      the floor generator and its torus operators
├── jobs/                  job creation, the worker, review and promotion
├── population/            map context, targets, results, draft, theme, entity defaults, publication
├── profiles/registry.js   profile validation and the shipped profiles
└── palettes/              the palette catalog from content, and palette resolution
```

## Where the data lives

| Data                       | Collection                           | Database             |
| -------------------------- | ------------------------------------ | -------------------- |
| Candidates and revisions   | `ObjectLayer`, render frames         | The content database |
| Profiles, jobs, candidates | `CyberiaProceduralProfile` and so on | The runtime database |
| Map populations and drafts | `CyberiaProceduralPopulation`        | The runtime database |
| Audit trail                | `CyberiaProceduralAudit`             | The runtime database |

Genesis Templates and palettes are content, not collections. A job stores the ones it uses, as they
were. A job stored before the global palettes runs again only after `cyberia population migrate
--apply` moves its spec; until then a retry, a regeneration or a Studio edit of one of its items
fails with the reason. Its candidates and their artwork stay.

A content release builds a new content database and does not carry drafts. Finish or promote the
approved candidates of a job before you promote a release.
