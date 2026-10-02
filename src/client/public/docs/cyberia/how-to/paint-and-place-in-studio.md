# Paint and place in the Studio

The foundation defines what exists and how it functions. The Studio does the two jobs left:
paint each item, and place each entity. The editors show the foundation context, so no one
searches the content repository.

## Layout

The editors sit under **Cyberia Studio** in the portal menu, each with its own icon. The
**Cyberia Studio** button opens a landing with one card for each editor. The Object
Layer, map, action and entity editors share one layout. The stage stays in view: the
canvas with its coordinates, or the entity defaults table. The tools and the sections scroll to
the right of the stage when the screen has room, and under it when it does not. The eye button
hides and shows the stage. Ids, labels and definitions show in a case-sensitive face.

One foundation context panel shows in three places: **Context** in the Object Layer editor,
**Paint** in the map editor, and above the **Metadata JSON** card of the Object Layer viewer
(`/object-layer/<cid>`). The viewer shows it only for an item the foundation defines. A click on
a palette color copies it as `#RRGGBBAA`, the form the hex field of the Object Layer editor takes.

An item or a map that belongs to a saga carries a badge for each saga, in a color the saga code
fixes: in the foundation context panel, and in the **Sagas** column of the Object Layer tables
and the map table. A map belongs to the saga that defines it and to every stored saga that
lists it. An item belongs to the saga that defines it, to the saga of every map whose entities
carry it, to the sagas of the maps of every instance whose entity-type defaults wire it (live,
dead, drop and inventory items), and to every saga of an item whose skill summons it. An item you place on a saga map
joins that saga, and so does the projectile its skill summons. The **Sagas** filter takes
comma-separated saga codes; each matches the codes that contain it.

## Document bar

Each editor starts its tools with the same bar: the map, instance, action, entity and Object
Layer editors. The bar names the document the form holds, or shows **New** and the subject. It
stays in view while the tools scroll. In the action editor, the bar acts on the document of the
open tab.

| button     | action                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------- |
| **New**    | Clears the form for a new document.                                                           |
| **Save**   | Stores the form: it updates the loaded document, or creates a new one.                        |
| **Clone**  | Stores the form as a new document. A map, quest or action copy takes the code `<code>-clone`. |
| **Reset**  | Discards the unsaved changes: the form shows the stored document again.                       |
| **Delete** | Removes the loaded document.                                                                  |

New, Reset and Delete ask first. Clone, Reset and Delete need a loaded document. Save, Clone and
Delete need a moderator. An editor shows only the buttons it has: the instance editor has no
Clone and no Delete, dialogue lines and skills have no Clone, and the Object Layer editor has no
Delete (the viewer removes an item).

## Tabs

Under the bar, the Object Layer, map, instance and action editors sort their tools into tabs. The
tab list pins under the bar while the tools scroll, and a tab keeps its fields when another one
is open.

| editor       | tabs                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| Object Layer | **Paint**, **Frames**, **Item**, **Context** (with the studio only)      |
| map          | **Map**, **Paint**, **Transform**, **Entities**, **Media**, **Library**  |
| instance     | **Instance**, **Maps**, **World**, **Runtime** (moderators), **Library** |
| action       | **Quests**, **Actions**, **Dialogues**, **Skills**                       |

The drawing tools of the Object Layer editor stay above its tabs.

## Paint an item

1. Open the Object Layer editor on an item: `?cid=<cid, document id or item label>`. An item the
   foundation defines opens with its context before anyone paints it.
2. Read the **Foundation context** panel in **Context**: the definition with its item type and the entity types
   that carry it, the visual guide (silhouette, detail, distinctive features, palette direction,
   required variants), the palettes, the biome, the region, the maps that place it, related
   content, and every reference. **Raw JSON** holds the definition.
3. Pick a palette in **Palettes**, in **Paint**. The biome palette and the foundation palette come from the
   context; the custom palette and recent colors stay in this browser.
   - Click a swatch to paint with it. Shift+click locks a color. Alt+click marks it.
   - **Apply** moves the selection to the nearest colors in use. **Swap** exchanges the two marked
     colors. **Replace** turns the brush color into the marked one. **Scatter** paints a share of
     the selection with the marked colors, the same way for the same seed. **Ramp** adds the
     colors between two marked ones to the custom palette.
4. To start from another item's animation, pick it under **Frames of object layer** in
   **Frames** and click **Import frames**: the frames of every direction and the frame duration are replaced; the item
   data and the stats stay. The frames take the palette in use in **Palettes**, or the first
   palette of the context: the darkest color takes the outline, the lightest the highlight, a rare
   saturated color the accent, and transparency stays. An item without a context palette imports
   nothing. With **Mutate** on, a **Random factor** above 0 moves a share of each frame's outer
   contour by one cell, each frame with a seed of its own. A move that splits the shape, fills or
   opens a hole, or shifts its box or center by more than one cell is rejected. The message counts
   the frames and the moves accepted and rejected.
5. Pick a template in **Paint**. Templates that suit the item type come first (★). A template paints in the
   palette in use, sets its mirror, and becomes the stamp.
6. Paint. The tools: pencil, eraser, fill, eyedropper, line, rectangle and ellipse (Shift fills),
   pattern brush (paints the clipboard as a tile), stamp, and the color wand (Shift selects every
   cell of the color). The mirror button cycles left-right, top-bottom and four-way painting.
   **Outline** paints around the shape. The tile button shows the frame 3 × 3. The **shade** bar
   mixes black (left) or white (right) into the brush color, step by step. Under **Replace global
   color**, lock the brush color as the source and then as the target: **Global Replace** paints
   every cell of the source color, all four channels equal, in the target color.
7. In select mode, **cells** selects by coordinates or shape: `1,2 3,4`, `rect 0 0 7 7`,
   `circle 8 8 4` or `poly 0,0 8,0 0,8`. Fill, delete, copy and move act on that selection.
8. Set the item id, type, description and stats in **Item**, and add each painted frame to its
   direction in **Frames**.
9. Save. A save made from a definition another save or an import replaced answers 409: reload,
   and the editor opens the definition the item runs now. Unsaved work is kept per item.

## Place a map

1. Open the map editor on a map: `?mapCode=<code>`. A map from `cyberia-content` arrives without
   entities. **Paint** shows the context panel of the map: its definition and entity types, the
   biome, the region, the palettes and the portals that reach it. A map the foundation does not
   define shows its description, its sagas and its portals. The **composition** tracker follows
   the panel.
2. The tracker lists each composed entity: its entity type, its item ids with the item type of
   each, and how many the map holds. An entry is met (✓) once the map holds one entity of that type
   and those item ids.
3. Click an entry to load its entity type and item ids into the entity form.
4. Set the size, level and color, then click the canvas to add the entity at a cell. The entity
   buttons edit many entities at once: fill the map, flip, generate a variation, swap or replace
   around preserved types, rename an item id, delete the entities the filters select, delete all.
5. Save. A save names the map revision it loaded; another save first answers 409.

## Drafts

Both editors keep unsaved work in this browser. On open, a draft newer than the stored item or
map is offered back. Save, New, Reset and Delete drop the draft. The server stays the source of
truth.

## Context routes

| route                            | answers                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `GET /object-layer/context/:id`  | The foundation context of the item a cid, id or label names |
| `GET /cyberia-map/context/:code` | The map context against its stored entities and portals     |
| `GET /cyberia-saga/sources`      | The sagas each item label and map code belongs to           |

All are read-only. `src/projects/cyberia/foundation-context.js` builds them from the context index
of the content artifact ([Content artifact](../explanation/content-artifact.md#document-families)).
