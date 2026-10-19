# Social and spatial implementation audit

Audit date: 2026-10-18. Scope: the engine, Go server, C client, portal, and deployment inputs.

## Current owners

| Capability          | Owner and source                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Relationships       | `src/api/cyberia-social/`; `CyberiaSocial`, collection `cyberiasocials`                                                                       |
| Account notes       | `src/api/cyberia-social-profile/`; `CyberiaSocialProfile`, collection `cyberiasocialprofiles`                                                 |
| Note validation     | `src/api/cyberia-social/social-contract.js`; 80 Unicode scalar values, ten-second update interval                                             |
| Identity projection | `src/projects/cyberia/player/identity.js`; bounded reads with owner or accepted-friend authorization                                          |
| Presence            | `src/projects/cyberia/player/player-session.js`; runtime session leases                                                                       |
| Protocol            | `src/grpc/cyberia/cyberia.proto`; generated Go bindings through `node bin/cyberia stat-contract`                                              |
| Runtime broker      | `cyberia-server/game/net/friends.go`; engine calls run outside the simulation tick                                                            |
| Game social UI      | `cyberia-client/src/ui/social_panel.c` (entry: the toolbar social button), `player_panel.c`, `chat_panel.c`, `hud_panel.c`, `identity_icon.c` |
| Right-hand column   | `cyberia-client/src/ui/hud_side_stack.c`; the chat or the social panel takes the whole column                                                 |
| Minimap             | `cyberia-client/src/ui/hud_minimap_overlay.c`; the current map preview, live markers and exits                                                |
| Studio universe     | `src/client/components/cyberia/UniverseEngineCyberia.js`, registered through the portal shell and Studio menu                                 |
| Spatial layout      | `SharedDefaultsCyberia.js`, `GraphLayoutCyberia.js`, `cyberia-client/src/data/instance_map_data.c`, `cyberia-client/src/ui/graph_layout.c`    |
| Runtime discovery   | `src/api/cyberia-server-registry/`; unique process IDs, sequence guards, leases, and grouped public routes                                    |
| Deployment inputs   | `cyberia-deployment/conf/dd-cyberia/conf.server.json` and `conf.client.json`                                                                  |

The portal is inside the engine repository. There is no separate portal checkout in this workspace.
Content and deployment checkouts are present. Content remains outside the Social domain.
Social records remain outside content-release databases. Universe topology remains runtime-owned.

## Implemented checks and behavior

Notes use MongoDB time for atomic throttling across replicas.
Owners and accepted friends receive notes. Other accounts receive no note or friend-only presence.
Go forwards notes without truncation. JavaScript, Go, and C tests cover Unicode behavior.
Network avatars are identity preview references: the ordered CIDs of the worn visual layers.
The engine draws, caches and serves each preview; the C client reads the server's avatar fields.

Studio supplies description, thumbnail, maps, routes, and replica context for the selected world.
Graph controls support keyboard movement, pointer movement, read-only panning, and mobile resizing.
Late reads cannot replace newer selections. Editor removal releases listeners and observers.
The minimap shows the current map only, with its preview, live markers and exits tagged with the maps they lead to.
Its texture toggle hides the preview only.
The in-game graph views and the read-only Studio graph drop empty layout rows and columns; authored cells never change.
The in-game views keep the arrangement of the editor: they never turn it or join its rows or columns.
Maps with world origins join only along whole shared edges.
The selected-world panel shows the author thumbnail; the graph node shows the world preview.
Stale universe availability disables travel while preserving topology.
Registry lists contain at most 1,000 rows.

## Verification

`node bin test --changed` passed 19 batches: 3,751 tests, 20 skipped. The skipped suites need a
live load server, a blockchain or a built public client.

| Check                                               | Result                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `node bin test --changed`                           | Passed, 19 batches                                                        |
| Social unit and integration suites                  | Passed: model rules, pair order, expiry, concurrency, presence |
| Studio browser suite                                | Passed, 7 checks                                                          |
| All Go packages                                     | Passed                                                                    |
| Native C runner (`cyberia-client/tests/run.sh`)     | Passed, with the column layout and exit direction tests                   |
| WebAssembly client build                            | Passed; the same warnings as `HEAD`                                       |
| Documentation architecture gate                     | Passed                                                                    |
| Live client, before and after, 1280x800 and 844x390 | Captured and reviewed on the amethyst content with two account players    |
| Social actions in the live client                   | Accept, Chat hand-off, wheel scroll and Escape verified                   |

The browser fixture uses Playwright and `UNDERPOST_BROWSER_BIN`.
`CYBERIA_BROWSER_DRIVER` can select its module path.
MongoDB suites require `UNDERPOST_MONGOD_BIN` or `mongod` on PATH.

## Operational limits

Production database counts and indexes were not queried. No production data changed and no deployment ran.
Live in-game PVP/PVE interaction remains unverified. Studio browser checks use local fixtures.
