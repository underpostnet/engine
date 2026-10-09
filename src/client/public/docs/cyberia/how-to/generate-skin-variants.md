# Generate skin variants

Update existing skins, or make new ones, review each candidate, finish some in the Object Layer
Studio and promote the approved ones. The model is in
[Procedural Engine](../explanation/procedural-engine.md).

## Before you start

- The host mounts the Procedural Engine APIs. See
  [the reference](../reference/procedural-engine.md#deploy-configuration).
- Your role is moderator or admin. Another role sees the same view with empty grids. A change it
  tries, such as **Generate**, shows _Permission denied. Moderator access required to manage
  procedural generation._

## Choose a mode

Open **Cyberia Studio** and then **Cyberia Procedural Engine**. The first control is **Mode**. Pick
one. The view shows only the controls of that mode.

- **UPDATE / MUTATE EXISTING CYBERIA CONTENT** keeps the item id and the semantic content. It makes
  candidate revisions from the art direction of the content and a Genesis Template.
- **CREATE NEW ITEM FROM TEMPLATE** needs no existing item. It makes new runtime items from a
  Genesis Template and a palette. A new item takes its function from the content baseline.

## Update existing items

1. In **Existing items to update**, tick one or more items. The table shows the item id, the type,
   the art direction, the biome, the colors of its foundation palettes, whether the item has a render, and its
   current cid. Filter and sort the columns, and turn the pages: the server does the work. Your
   ticks stay when you change page.
2. Set **Variants per item**. Each item gets that many candidates.
3. Under **Palette and variation**, each ticked item has its own palette editor. It starts from the
   foundation palettes of the item, where it has them. Pick a palette template or a random one in
   its **Palette** dropdown, and change any slot of any item. See
   [Palette and slot overrides](#palette-and-slot-overrides).
4. Set the **Variation** (0 to 1).
5. Press **Generate**.

The server picks, for each item, the first Genesis Template of its type that fits it. An item with
no render is valid: the engine draws it from that template with the colors of its palette. An item
with a render is mutated.

## Create new items

1. Pick the **Item type** and the **Genesis Template**. Each template shows a thumbnail, its id and
   its size. Under the list, the view draws the base item of the template in each direction it
   has. It also lists its roles, the roles the art direction colors and the regions whose shape a
   generation keeps.
2. Set **Variant count** and **New item ID prefix**. The new items are named `<prefix>-001`,
   `<prefix>-002` and so on. An id that a definition or a live candidate holds is refused.
3. Under **Palette and variation**, the palette editor of the new items starts from the colors of
   the template. Pick a palette template or a random one in its **Palette** dropdown, and change
   any slot. See [Palette and slot overrides](#palette-and-slot-overrides).
4. Set the **Variation** and press **Generate**.

## Palette and slot overrides

Both modes show the same palette editor. An update shows one editor for each ticked item, with the
item id, its template and the names of its foundation palettes. A create shows one editor for the
new items, with the Genesis Template.

Each editor starts from the defaults of its target. An existing item starts from its foundation
palettes: the colors its art brief names, then the palette of each biome it belongs to. These are
the palettes the Object Layer viewer shows under **Foundation context**. They color the roles the
Genesis Template gives to art direction (on the humanoid, **Torso** and **Legs**), the **Outline**
and the **Accent**. The other roles, and every role of an item with no foundation palette or of a
new item, start from the render or the template.

The **Palette** dropdown of an editor sets where its colors come from:

- **Foundation palette** or **Default colors**: the defaults above.
- **Random template for each candidate**: each candidate takes a palette template that fits the
  Genesis Template. The seed of the run chooses it, so the same run gives the same palettes again.
- A palette template: every candidate of the target takes it. The list shows only the palettes
  that fit the Genesis Template, grouped by family: natural, dark, light, warm, cool, biome and
  exotic.

A new choice gives every slot of the editor its default again. A slot is one tone of one role of the
Genesis Template: **Shadow**, **Base** and **Highlight** of **Hair**, **Skin**, **Torso** and
**Legs**, then **Outline** and **Accent**. A card shows the color of its slot and where it comes
from:

- `palette` or `foundation` and a color: a color of the palette template or of the foundation
  palettes. It stays as it is.
- `auto · render` or `auto · template`, striped: where an automatic color starts. The palette
  variation moves it.
- `random`, striped: the palette the seed picks for each candidate sets it.
- A color alone: a color you set. It wins over every other color.

In each editor:

- Click the swatch of a card to set the color of that slot.
- **Random colors** sets every slot with colors the server chooses in one color scheme. Each base
  keeps the lightness of the template. It is a preview to start from: retouch any slot after it.
- The **×** of a card gives its slot its default again. **Reset** does it for every slot.

A tone you leave open derives from the base. The palette of an item stays while the item stays
ticked, also when you change page.

## Seed

Each run gets a new random generation seed. The view has no seed control. The server keeps the seed
in the job, so a candidate can be rebuilt from it.

## Follow a run

The server generates in the background. You can close the browser. Open the view again, pick the
run in **Runs** and read the progress. The page opens a run with `?job=<id>` in its address.

**Runs** shows the run id, the mode, the targets, the generator, the profile, the Genesis Templates,
the variation, the progress, the status and the dates. Filter and sort the
columns as you need.

The view tells you in a notification when the mode changes, a request is not valid, a job is
created, queued, started, completed or cancelled, a candidate is ready, regenerated, saved,
approved, promoted or created, a candidate fails the diversity check or the validation, and when
there is a conflict or you lack the role.

## Review a candidate

**Candidates** lists each candidate when it is ready, while the others still generate. A row shows
its preview, item id, candidate cid, revision, Genesis Template, palette, diversity, validation,
status and date. Click a row to see it larger. An update shows the item id, the current cid, the
candidate cid, the kind of revision and the template. A create shows the proposed item id, the
candidate cid, the template and the variation.

- **approve** accepts the revision you see. It is off while the revision is not valid. An item has
  one approved candidate.
- **reject** drops the revision. **regenerate** then makes a new one from a new seed.
- **edit** opens the candidate in the Object Layer Studio.

Each row grows to show all its buttons. Hold the pointer on a button to read what it does, or why it
is off.

## Finish a candidate

The generator makes the look. You are the final author of the whole Object Layer.

1. Press **edit**. The Object Layer Studio opens on the candidate. A banner shows the review.
2. Change what the item needs: paint, change the colors, change a frame or a direction, write the
   description, change the stats or the activable flag. Keep the item id. A new item starts with an
   empty description and the stats of the content baseline.
3. Press **Save**. The Studio stores a new revision with a new cid. It binds nothing. The page
   returns to the review.
4. The candidate is in `review` again, and its validation ran again. Approve the new revision.

The earlier revisions stay stored. If you edit an approved candidate, the approval ends: approve the
new revision.

## Promote

Press **promote** on an approved candidate, or **Promote approved** for the whole run.

- An update gives the item the approved render. The item keeps its id and gets a new cid. The old
  cid stays in the record of the candidate. If another writer changed the item since the run, you get
  a conflict and nothing changes. Generate again from the current item.
- A create makes the new item. If its id is taken since the run, you get a conflict.

A candidate that fails to promote stays approved.

## Cancel, delete and reset

**Cancel** ends the workflow of the selected run: waiting and running candidates and the ones you
did not decide stop. It asks first. Nothing is deleted, and approved and promoted candidates stay.

**Delete** is always on, in the row of each run and in the toolbar for the selected run. It asks
first. A run that still works stops first: you do not need to cancel it. Delete then removes the
run, all its candidates (approved, edited and rejected ones too), their revisions and its audit
trail, here and at the Object Layer authority, so nothing of the run stays in the Object Layer
lists. An item you promoted keeps the definition it runs. You cannot undo it.

**Reset** is always on. It clears the mode, the form, the selected run and the filters. It does not
touch the server.
