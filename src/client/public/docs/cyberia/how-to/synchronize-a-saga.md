# Synchronize a saga

A stored saga links each of its quests and actions to the NPC skin that provides it and to a map.
A synchronization places each quest and action at the cell of its provider entity. It also links
the stored dialogues to each action. It uses only what the maps and the dialogues hold now, and
it never guesses data that is not stored.

## Before you start

- The saga is stored. An import stores it ([Content artifact](../explanation/content-artifact.md#import)).
- The maps of the saga hold their entities. Place them in the map editor
  ([Paint and place in the Studio](paint-and-place-in-studio.md#place-a-map)).
- Anyone can check a saga. A synchronization needs a moderator.

## Steps

1. Open **Cyberia Studio**, then the action editor, then the **Saga integration** tab.
2. Pick a saga in **Saga**. The summary counts its maps, items, quests and actions, and the editor
   checks the saga. A check stores nothing.
3. Read the report. **Check** reads the saga again after you change a map or a dialogue.
4. Click **Synchronize** and confirm. The report shows what is stored, and the lists of the other
   tabs load again.
5. Click a row of the report to open its quest, action, dialogue or skill in its tab. Correct what
   failed or was omitted, then synchronize again. A second run keeps what the first run assigned.

## What a synchronization does

| link                          | rule                                                                                                                                                        | fields it writes                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| quest or action               | The provider is the first entity of the linked map that carries the provider skin. A link without a map uses the first map of the saga that has a provider. | `sourceMapCode`, `sourceCellX`, `sourceCellY` |
| default dialogue of an action | An action without a `dialogCode` takes `default-<provider skin>` when that dialogue is stored.                                                              | `dialogCode`                                  |
| talk dialogue of a quest      | Each quest of the same provider gets a `questDialogueCodes` entry, `quest-talk-<quest code>`, when that dialogue is stored.                                 | `questDialogueCodes`                          |
| skill of a saga item          | Its trigger item and each item it summons must run. A `$` placeholder is not checked.                                                                       | none                                          |

A synchronization writes only these fields. It never changes a map, a saga or a dialogue. When a
map holds more than one provider, the first one wins, and the report gives the count.

## Items that run

A quest or an action names items by item id; the item catalog binds each one to the definition the
runtime runs. A synchronization places a quest or an action only when every item it names can run:
bound to a definition this host stores, published, offered and with its atlas. If one cannot, the
link fails, names each item and its problem, and the document stays where it is. A quest or an
action already in place fails the same way. Bind the item, then synchronize again
([Manage runtime bindings](manage-runtime-bindings.md)).

A skill of a saga item fails the same way when its trigger or an item it summons cannot run.

Each link gets one outcome:

| outcome         | meaning                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assigned**    | Stored by this run. A check shows it as **To assign**.                                                                                                                                                            |
| **Already set** | Nothing to change: the stored value is the one the synchronization finds, or the skill is complete.                                                                                                               |
| **Failed**      | A stored reference is broken: the saga links a quest or an action that is not stored, an action links a dialogue that is not stored, an item a quest, an action or a skill names cannot run, or the write failed. |
| **Omitted**     | The data the link needs is not stored yet: the map, a provider entity on it, or the dialogue to link.                                                                                                             |

## Routes

| route                           | answers                                            | guard     |
| ------------------------------- | -------------------------------------------------- | --------- |
| `GET /cyberia-saga/sync/:code`  | The report of a check. It writes nothing.          | none      |
| `POST /cyberia-saga/sync/:code` | The report of a synchronization, after its writes. | moderator |

A report is `{ saga: { code, name }, applied, counts, entries }`. An entry is
`{ kind, code, outcome, detail }`. `code` is the quest, action or dialogue code, or the trigger item
of a skill. `detail` gives the provider and the cell found, or the reason. An unknown saga answers 404. `src/projects/cyberia/saga/saga-sync.js` does the work.
