# Universes and the spatial graph

Cyberia places its content on three levels: a **universe** holds worlds, a **world** (an instance)
holds maps, and a **map** holds entities. One account plays one profile in a universe, and keeps
part of it in each world. This page states the owner of each level, the layout contract of the
two graph views, the routes between worlds and how a player travels them.

---

## Ownership

| What                         | Owner                                      | Stored in                     | Changes by                            |
| ---------------------------- | ------------------------------------------ | ----------------------------- | ------------------------------------- |
| Entity cells on a map        | The map (`CyberiaMap.entities`)            | The content release database  | The map editor, a content release     |
| Portals between maps         | The instance (`CyberiaInstance.portals`)   | The content release database  | The instance editor                   |
| Map cells of the world graph | The instance (`CyberiaInstance.mapLayout`) | The content release database  | The Layout tab of the instance editor |
| Members of a universe        | The universe (`CyberiaUniverse.instances`) | The host database             | The universe editor                   |
| World cells of the universe  | The universe (`CyberiaUniverse.instances`) | The host database             | The universe editor                   |
| Routes between worlds        | The universe (`CyberiaUniverse.links`)     | The host database             | The universe editor                   |
| Live servers of a world      | The [server registry](server-registry.md)  | The host database, with a TTL | Each game server process              |

Each position has one owner. A map cell of the world graph is never an entity cell, and a world cell
of the universe is never a map cell. A content release, a promotion or a rollback swaps the content
release database: it never changes a universe, its routes or a player profile.

An instance belongs to one universe at most. A universe names its members by code and holds none of
their content, so a member stays in its universe while a release lacks it or its servers are
offline. Deleting an instance in Studio removes it from its universe with its routes. The code of an
instance never changes, because profiles, quest progress and leases name it.

---

## Graph layout contract

Both graph views, the maps of a world and the worlds of a universe, use one contract from
`SharedDefaultsCyberia.js`:

| Rule         | Value                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Unit         | One integer cell per node. A cell is view data, not a map size or a world coordinate                    |
| Axes         | `x` grows right, `y` grows down; the origin is free                                                     |
| Bounds       | `-LAYOUT_CELL_LIMIT` to `LAYOUT_CELL_LIMIT` (64) on each axis                                           |
| One node     | One cell per node; two nodes never share a cell                                                         |
| Default cell | A node without a saved cell takes the first free cell of a square grid of ⌈√n⌉ columns, in code order   |
| Validation   | A save fails on a cell of an unknown node, a node with two cells, a cell out of bounds or a shared cell |

`resolveGraphLayout` gives the cells, and `graphLayoutDefect` names the first defect. The engine,
the instance map payload and both Studio editors call them, so a layout reads the same everywhere. A
default cell is not saved: it stays the default until an author moves the node. **Arrange** in
Studio puts every node back on its default cell; it changes only the draft until Save.

Moving a node changes its cell and nothing else. A portal keeps its source and target cells on the
maps, and its mode; an entity keeps its cell. The game server never reads a layout: the world
version it compares at hot reload covers the instance message it receives, so a layout edit never
rebuilds a world.

---

## Saves and conflicts

A universe and an instance each carry a `revision`. A save names the revision it read, and the
engine applies it only to that revision, then raises it. A save from an older read answers `409`
and changes nothing; the editor keeps the draft and Reset loads the newer one. A universe or an
instance changes only by its creator or an admin.

---

## Routes and travel

A link is a route between two members: one way (`source → target`) or both ways
(`bidirectional`). A pair of members has one link at most. A route is authored topology. It never
proves that a server is up: the registry says that.

A player in the Universe view of the in-game map can travel to a world when all of these hold:

1. A route leads there from the current world: a link from it, or a bidirectional link.
2. The served content holds the target world.
3. The registry has a live server of the target world that takes new sessions.

**TRAVEL** leaves through the leave flow of the settings card: the session ends with its final commit and releases
its lease, then the target world opens with the same principal. When the servers of the target run
the build of the server the client plays on, the account enters the target in the page with the
ticket the end of its session carries ([travel in the page](accounts-and-persistence.md#travel-in-the-page)).
Otherwise, and whenever that fails, the client opens the launch bridge of the target world: the
bridge asks for a ticket, and the engine issues one only while a server of that world takes
sessions. Either way the target server acquires the same universe profile with a new epoch and
loads the state of the target world.

A transition never doubles value. The epoch fences every write of the profile in every world: once
the target world acquires it, the engine refuses each later commit and position of the world the
player left (`stale_session`). One account holds one lease, so two servers never write one
profile. A transition that fails leaves the last saved state, and the player launches again.

---

## Content across worlds

Each world warms the content it names at boot. A player brings items from another world of the
universe; at placement the game server resolves each label its world does not hold through the
engine data service. See [the game server](game-server.md#content-a-player-brings).

The universe view of the client reads the universe of its world in one small request, and reads it
again every 20 seconds while the view is open. It loads the picture of a world only when its card
shows, and never loads the content of another world.

### World pictures

There are three pictures, one per level:

| Picture       | Shows                                                                  | Source                                                                             |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Map preview   | One map: the stills of its entities on its grid                        | `CyberiaMap.preview`, drawn by `map-preview-generator.js` after each map write     |
| World preview | One world: its maps at their places or layout cells, and their portals | `CyberiaInstance.preview`, drawn by `world-preview.js`                             |
| Universe view | The worlds of a universe, their routes and their state                 | The client and Studio draw it, each world by its world preview                     |

Each member of the universe view carries `previewUrl`, its world preview:
`GET /api/v1/cyberia-instance/instance-map/:instanceCode/world-preview`. A member whose author set a
thumbnail in the Studio instance editor also carries `thumbnailUrl`. The thumbnail is the picture of
the world card in the portal world list and of the selected-world panel, in game and in Studio; the
graph node shows the preview. A world with no thumbnail shows no picture in its panel, never the
preview twice.

The world preview and the client share the geometry of `src/projects/cyberia/instance/instance-map-layout.js`.
It works in map cells. Each map keeps the size of its grid.
A map with a world origin takes its place in the world. The other maps keep the arrangement of their layout cells, right of the placed maps.
A column starts where the maps of the column before it end, and a row starts where the maps above it end.
So maps on neighbour cells touch, whatever their sizes.
A run of empty columns or rows between two maps leaves one gap: as wide as the narrowest map, or as tall as the shortest.
Two maps join when they share an edge of positive length. A corner or an overlap is not a shared edge.
The static payload sends each map centre (`position`) and size (`w`, `h`) in layout units: the longest map side of the world is 1.
Matching images fill their maps. Images with other proportions stay centred within their maps.
The preview draws missing pictures first and stores them. Empty maps show a plain frame.
One outline goes around maps that touch. A shared edge has no border.
Portals between maps that do not touch draw cell-to-cell lines.
A random portal end uses the map centre. A portal inside one map has its own colour.
A preview takes at most 8 pixels per map cell, the scale of a map preview, and its longest side stays within 768 pixels.

The world stores the preview as a File (`preview`) with `previewKey`: a hash of the generator
version, the world code, every map with its grid, world origin, picture and cell, and every portal. A request
serves the stored File while its key is the key of the world now, with that key as `ETag`; else it
draws the world once, stores it, and the File it replaced goes once nothing names it. A changed map
set, grid, picture, cell or portal, or a new generator, so draws a new preview, and a stale one is
never served. `cyberia ol --sync` and every other `ol` write draw the map previews of the written
labels, then bring the world previews of those maps in line. `instance --export` carries the
preview as `files/preview-instance-<code>.json`, and a drop takes it with the world. A world with
no map answers `404`. The in-game map, the Studio instance and universe editors show the same
picture, contained in its card; while it loads, or when there is none, the in-game map draws a
dotted tile with the initials of the world.

---

## Tests

| Test                                                  | What it proves                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `test/cyberia/unit/graph-layout.test.js`              | Default cells, validation, and a layout that never moves a portal                          |
| `test/cyberia/unit/instance-map-layout.test.js`       | Maps of any size join on neighbour cells; gaps, corners, overlaps, islands; the authored `test` and `amethyst-strata-expansion` layouts; shared preview positions |
| `test/cyberia/unit/world-preview.test.js`             | Real map proportions, one outline around maps that touch, card sizes, the stored preview and its key, 404s |
| `test/cyberia/unit/universe-topology.test.js`         | Member codes, cells and links of a universe                                                |
| `test/cyberia/integration/universe-registry.test.js`  | Revision guard, membership, the view with availability, instance cells                     |
| `test/cyberia/integration/player-persistence.test.js` | One profile across worlds, per-world state, refused late writes                            |
| `cyberia-client/tests/universe_map_data_test.c`       | The universe view data, its preview and thumbnail, and the travel rules                    |
| `cyberia-client/tests/graph_layout_test.c`            | Packed rows and columns keep the cell order and never overlap; a run of empty lines leaves one gap |
| `cyberia-client/tests/instance_map_geometry_test.c`   | Shared edges of any size within the tolerance, corners, gaps and overlaps; the `test` and `amethyst-strata-expansion` payloads; the minimap fit, exit directions, labels |
| `cyberia-client/tests/modal_instance_map_test.c`      | No seam and separate click areas at any zoom, pan and panel size; links across a shared edge; image fitting; centred name plates |

## Selection and freshness

Studio shows the selected world description, thumbnail, map codes, routes, and registered endpoints.
Content availability and runtime availability are separate facts.
A failed refresh keeps the draft and marks runtime availability as unknown.
Late responses cannot replace a newer universe selection. Closing the editor releases its graph and query listeners.

The in-game universe keeps selection by world code when a response changes node order.
It refreshes availability every 20 seconds. A failed refresh disables travel until a successful response.
Data older than two refresh intervals also disables travel.
The server still validates each travel request.

The in-game WORLD view shows the maps at the geometry of the world preview: maps on neighbour cells
form one surface, and a run of empty columns or rows stays as one gap. The UNIVERSE view packs the
world cards: a column is as wide as its widest card and a row as tall as its tallest, in the order of
the cells, with room for the routes. A run of empty columns or rows leaves the room of the smallest
card. The read-only Studio graph drops empty rows and columns. The authored cells never change.

The in-game views show the arrangement of the editor: they never turn it and never merge its rows or
columns. The camera fits the whole graph on the screen. A world card has the proportions of its
world preview, so a wide world takes a short row. The universe layout gives cells, not sizes: each
card fits one cell, so the cards do not compare the sizes of their worlds.

The minimap shows the current map only: its map preview fitted to the minimap, with live markers
over it. At zoom 1 the whole map fits; a closer zoom follows the player and stops at the map edges.
Each portal of the map shows where it stands, as a gate. An exit points to the map it leads to and
carries a tag with its name; a link inside the map has a ring. A toggle above the zoom controls
hides the map preview; the markers stay. No other map, and no marker of another map, is drawn.

Layout coordinates never define traversal. Authored graph edges remain authoritative.
Default placement uses code order, so a response order change cannot move unchanged nodes.

Registry list responses contain at most 1,000 rows. Universe member queries filter by their instance codes.
Expired leases count as unavailable, even before TTL cleanup removes their records.
