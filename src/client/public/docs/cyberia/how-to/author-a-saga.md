# Author a saga

Start from a narrative idea, generate a saga, review its package, resolve what it still needs and
make it release-ready. The model is in [Saga Engine](../explanation/saga-engine.md); the routes and
records are in [the reference](../reference/saga-engine.md).

## Before you start

- Your role is moderator or admin.
- The host has a `cyberia-content` source checkout: `./cyberia-content`, or the path
  `CYBERIA_CONTENT_ROOT` names, with its `src/` and its `node_modules`. A host with a packed artifact
  only shows the report of a stored saga.
- `GEMINI_API_KEY` is in the environment of the server.

## Steps

1. Open **Cyberia Studio**, then **Cyberia Saga Engine**.
2. In **Sagas**, find the saga in the catalog: each card shows its source, its build, its import, its
   world and its workflow. **Open** shows a built saga without a workflow; **Edit package** opens the
   package of the content source in a new workflow; **Workflow** opens the one it has. To start a saga, fill **New saga** with a code, a name
   and a premise.
3. In **Narrative and generation**, set the context: space, tone, factions, naming pools, the lore,
   the definitions to reuse and the related sagas whose definitions it may use. Click **Generate a
   new candidate**. The generation runs in the background, also with the page closed. Each step shows
   its state and its log. **Cancel** stops it; **Resume** runs a failed or cancelled generation again
   from the first step it did not finish.
4. In **Semantic package**, review the candidate in the JSON editor. The definitions list groups them
   by kind with what each one names; click a name to show it. **Compare** lists the changes against
   another revision, the generated one by default. **Save draft** keeps your edits as a new revision.
5. Click **Validate**. Each finding opens at its JSON path. Correct the package, save, and validate
   again until it passes.
6. Click **Apply to content source**. The package is written to
   `cyberia-content/src/content/sagas/<code>.json`. Nothing else changes.
7. In `cyberia-content`, commit the file, then build the artifact
   ([Develop content locally](develop-content-locally.md)). Import the saga into the host with
   `node bin/cyberia content import --saga <code>`; add `--dry-run` first to read the plan. A saga
   that was imported before and changed needs `--rebind`. `--instance <code>` adds it to another
   world than its authoring world ([Import a saga](../reference/cyberia-cli.md#import-a-saga)).
8. In **Completeness**, read the report. Work through the blocking rows; each one opens the editor
   that owns it:
   - a missing render opens the map population or the item generation job of the Procedural Engine,
     or starts one for the exact item id;
   - a missing placement opens or starts the map population of the map;
   - a quest, an action or a dialogue opens in the Action Engine;
   - a market or an item policy opens in the market or the economy editor;
   - a map in no world opens the Instance Studio.

   Leave a row out on purpose with **Exclude…** and a reason.

   **Relationships** shows the narrative graph and the content and world graph of the saga. Select a
   node to see what it leads to and comes from, and open its editor. **Table** lists the same
   relationships.

9. In **Providers and sync**, choose each provider that several entities could be, and click
   **Synchronize** ([Synchronize a saga](synchronize-a-saga.md)).
10. In **Final audit**, read the release rows. Each names the step and its command. The content
    release process takes the saga to production
    ([Deploy a release](deploy-a-release.md)); the Saga Engine never does.

## Shared content

To play on a map of another saga, name it in `places` of the package (`"places": ["map.<code>"]`),
then validate and apply. The saga gains the map as a place; the other saga stays its owner, and no
world takes the map until the Instance Studio adds it.

The report shows the sagas and the worlds that share each map, item, quest, action and dialogue. A
change to a shared map or item reaches each of them: read the row before you change it in the
Procedural Engine or the Map Studio. Never duplicate a shared item or map to make a saga look
complete.
