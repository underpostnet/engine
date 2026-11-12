# Synchronize a saga

A stored saga links each of its quests and actions to the NPC skin that provides it and to a map.
A synchronization places each quest and action at the cell of its provider entity. It also links
the stored dialogues to each action. It uses only what the maps and the dialogues hold now, and
it never guesses data that is not stored.

## Before you start

- The saga is stored. An import stores it ([Content artifact](../explanation/content-artifact.md#import)).
- The maps of the saga hold their entities. Place them in the map editor
  ([Paint and place in the Studio](paint-and-place-in-studio.md#place-a-map)), or publish a map
  population of the Procedural Engine.
- Anyone can check a saga. A synchronization needs a moderator.

## Steps

1. Open **Cyberia Studio**. Open the **Providers and sync** tab of the Saga Engine on the saga, or
   the **Saga integration** tab of the action editor and pick the saga in **Saga**. The panel
   checks the saga. A check stores nothing.
2. Read the report. **Choose a provider** lists each quest or action that several entities could
   provide. Pick one cell for each. **Conflicts** lists each quest or action another saga links to
   another provider: edit the saga package that disagrees, then check again.
3. Click **Synchronize** and confirm. The report shows what is stored.
4. Click a code of the report to open its quest, action or dialogue. Correct what failed or was
   omitted, then synchronize again. A second run keeps what the first run assigned and writes
   nothing new.

## What a synchronization does

| link                          | rule                                                                                                                                                                           | fields it writes                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| quest or action               | The candidates are the cells of the entities that carry the provider skin, on the linked map, or else on any stored map. One candidate is proposed; several wait for a choice. | `sourceMapCode`, `sourceCellX`, `sourceCellY` |
| default dialogue of an action | An action without a `dialogCode` takes `default-<provider skin>` when that dialogue is stored.                                                                                 | `dialogCode`                                  |
| talk dialogue of a quest      | Each quest of the same provider gets a `questDialogueCodes` entry, `quest-talk-<quest code>`, when that dialogue is stored.                                                    | `questDialogueCodes`                          |
| skill of a saga item          | Its trigger item and each item it summons must run. A `$` placeholder is not checked.                                                                                          | none                                          |

A synchronization writes only these fields. It never changes a map, a saga or a dialogue. A quest
or an action that stands on one of its candidates keeps that cell.

All the fields one document takes are one write, guarded by the revision the plan read. A quest or
an action that another editor saved meanwhile is not overwritten: its entries fail, and you check
again.

## One provider for each quest and action

A quest or an action holds one source map and cell. Several sagas may link it only when they agree
on its provider skin and map. When a saga links it to another skin or map, the check shows a
**Conflict** with the other saga, and a synchronization is refused with 409 until the packages
agree. When two sagas need the same quest at two places, give each saga its own quest.

## Items that run

A quest or an action names items by item id; the item catalog binds each one to the definition the
runtime runs. A synchronization places a quest or an action only when every item it names can run:
bound to a definition this host stores, published, offered and with its atlas. If one cannot, the
link fails, names each item and its problem, and the document stays where it is. A quest or an
action already in place fails the same way. Bind the item, then synchronize again
([Manage runtime bindings](manage-runtime-bindings.md)).

A skill of a saga item fails the same way when its trigger or an item it summons cannot run.

Each link gets one outcome:

| outcome               | meaning                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assigned**          | Stored by this run. A check shows it as **To assign**.                                                                                                                                                            |
| **Already set**       | Nothing to change: the stored value is the one the synchronization finds, or the skill is complete.                                                                                                               |
| **Choose a provider** | Several entities carry the provider skin. Nothing is written until a moderator chooses one, or a chosen cell changed since the check.                                                                             |
| **Conflict**          | Another saga links the quest or the action to another provider skin or map. The synchronization is refused.                                                                                                       |
| **Failed**            | A stored reference is broken: the saga links a quest or an action that is not stored, an action links a dialogue that is not stored, an item a quest, an action or a skill names cannot run, or the write failed. |
| **Omitted**           | The data the link needs is not stored yet: the map, a provider entity on it, or the dialogue to link.                                                                                                             |

## Routes

| route                           | answers                                            | guard     |
| ------------------------------- | -------------------------------------------------- | --------- |
| `GET /cyberia-saga/sync/:code`  | The report of a check. It writes nothing.          | none      |
| `POST /cyberia-saga/sync/:code` | The report of a synchronization, after its writes. | moderator |

The body of a synchronization is `{ selections, reviewed }`. A selection is
`{ kind, code, mapCode, cellX, cellY, mapRevision }`: the cell the moderator chose for a quest or an
action, with the revision of the map it saw. `reviewed` is the `reviewed` object of the check the
moderator read. A synchronization answers 409 when a link conflicts, a chosen cell changed, or a
document or a map changed since that check.

A report is `{ saga: { code, name }, applied, counts, entries, reviewed }`. An entry is
`{ kind, code, outcome, detail }`; a quest or an action entry adds `candidates`, the `chosen` cell
and any `conflicts`. `code` is the quest, action or dialogue code, or the trigger item of a skill.
`reviewed` holds the revision of each document and map the plan read, by `<kind>:<code>`. An unknown
saga answers 404. `src/projects/cyberia/saga/saga-sync.js` does the work.
