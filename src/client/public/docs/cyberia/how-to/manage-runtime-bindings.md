# Manage runtime bindings

See which definition each item runs, move an item to another one, and find what stops a world
from loading. The model is in [Runtime binding](../explanation/runtime-binding.md).

## Before you start

- Your role is moderator or admin. Another role reads the catalog and binds nothing.
- The definition to bind is stored and published: a save in the Studio published it, or a
  promotion, an import or `cyberia ol` did.

## Read the catalog

Open **Cyberia Studio**, then **Cyberia Item Catalog**. Each row is one item:

| Column          | Shows                                                                           |
| --------------- | ------------------------------------------------------------------------------- |
| Preview         | The idle frame of the render the active definition names                        |
| Item ID         | The item                                                                        |
| Item Type       | The type its definition declares                                                |
| Active CID      | The definition the runtime runs                                                 |
| Render          | The render CID of that definition, and `(no atlas)` when this host lacks it     |
| Content Release | Where the binding comes from: the release content or snapshot, or a live change |
| Updated         | When the binding last changed                                                   |
| Binding Status  | `bound`, `no render`, `draft`, `archived` or `not stored`                       |

Filter and sort any column; the server does the work, and a new filter or sort shows the first
page. **Binding Status** filters by its values. The URL keeps the page and the page size
(`?page=&limit=`), so a reload, Back and Forward show the same page.

## Bind a runtime version

1. Click a row, or **Change Binding**. The **Item** section lists every definition the item could
   run, newest first, and its binding history.
2. Click **Open** to see a definition in the Studio.
3. Click **Bind as Runtime Version** on the definition to run, and confirm. A draft, an archived
   definition and the active one cannot be bound.
4. Every world that names the item runs the new definition after its next reload. The engine asks
   the game servers to reload.

If another moderator bound the item meanwhile, the bind answers 409 and changes nothing. The view
reads the item again; bind again if you still want the change.

## Add a binding

An item that has a published definition and no binding has no row. A Studio save of a new item
makes such an item.

1. Type a part of the item id in **Add binding**. The list shows only items with no binding.
2. Click the item. The **Item** section says it is not bound and lists its definitions.
3. Click **Bind as Runtime Version** on the definition to run, and confirm. The item gets its row.

The engine asks the game servers to reload. A hot reload from the **Cyberia Instance Engine**, full
or incremental, also loads the binding: the world version changes when a binding of an item the
world names changes.

In the Object Layer Studio, a banner above the editor says whether the revision you edit is the
runtime version. **Bind as Runtime Version** there does the same bind. A save never binds.

## Import a definition from Object Layer

A definition another studio published to the Object Layer authority can run here. The import
stores a copy on this host, so the game never asks the authority for it.

1. Click **Import from Object Layer**, type a part of the item id or a CID, and click **Search**.
   The list shows the canonical definitions the authority holds.
2. Click **Preview**. The view draws the idle frame and shows the item, its CID, where it comes
   from and who stored it there, its profile and its frames. The server checks it first: a
   definition with a problem, for example bytes that do not hash to its CID or an unknown item type,
   shows the problem and does not import.
3. Read the warnings. The Object Layer protocol carries no license or author, so the view asks you
   to confirm the right to use the definition. Check **I confirm**.
4. Choose the item id under **Bind to**, then click **Check item id**. By default it is the item id
   of the definition. When the item runs another definition, the view shows what it runs now and
   asks you to decide: check **Replace the binding** to replace it. The earlier definition stays
   stored, and the history keeps it.
5. Click **Import and bind**, and confirm. Every world that names the item runs it after its next
   reload. The history of the item shows the import and its provenance.

If another moderator bound the item meanwhile, the import answers 409 and binds nothing: check the
item id again. An import of a definition the item runs already changes nothing.

## Read the IPFS state

Click **IPFS** on a definition. One line for each file under `/object-layer/cid/<cid>/` shows its
CID, whether the registry records it, whether the node and the Cluster pin it, and which CID its
MFS path lists. See [IPFS storage](../../object-layer/explanation/ipfs-storage.md).

## See bindings in the entity engine

The **Cyberia Entity Engine** marks each item id of a default: `✓` with the CID it runs, or `⚠`
with the reason it runs none. The marks are read only. **Item Catalog** opens the catalog.

## Check before a game server loads

```bash
node bin/cyberia catalog check --dev                 # every world
node bin/cyberia catalog check --instance FOREST --dev
node bin/cyberia catalog check --ipfs --dev          # also binding, content, MFS and pin
```

An error stops the item from running: `unbound`, `missing`, `draft`, `archived` or `no-atlas`.
`unrendered` is a warning. The command exits with 1 on any error.
