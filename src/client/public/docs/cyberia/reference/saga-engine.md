# Saga Engine reference

The API, the records, the report and the contract coverage of the Saga Engine. The model is in
[Saga Engine](../explanation/saga-engine.md).

## API

The base is `/api/v1/<api>`. Every route of `cyberia-saga-workflow` needs a moderator.

| Method and path                         | API                     | Does                                                                                          |
| --------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `GET /`                                 | `cyberia-saga-workflow` | Lists workflow summaries, newest change first. Paginated.                                     |
| `POST /`                                | `cyberia-saga-workflow` | Opens the saga `{ sagaCode }` of the content source, or starts `{ context }`.                 |
| `GET /:id`                              | `cyberia-saga-workflow` | Reads a workflow: context, candidates, newest package, generations, check, application.       |
| `PUT /:id/context`                      | `cyberia-saga-workflow` | Sets fields of the narrative context.                                                         |
| `POST /:id/generations`                 | `cyberia-saga-workflow` | Queues the next generation. 409 while one runs.                                               |
| `GET /:id/generations/:attempt`         | `cyberia-saga-workflow` | Reads a generation with its frozen request and its stage results.                             |
| `POST /:id/generations/:attempt/cancel` | `cyberia-saga-workflow` | Cancels a generation that waits, or stops the one that runs.                                  |
| `POST /:id/generations/:attempt/retry`  | `cyberia-saga-workflow` | Resumes a failed or cancelled generation. 409 when the generator refused its request.         |
| `GET /:id/candidates/:revision`         | `cyberia-saga-workflow` | Reads a candidate with its package.                                                           |
| `POST /:id/candidates`                  | `cyberia-saga-workflow` | Saves `{ package, parent }` as the next revision.                                             |
| `POST /:id/diff`                        | `cyberia-saga-workflow` | Lists the changes of `{ package }` from the candidate `{ revision }`.                         |
| `POST /:id/validate`                    | `cyberia-saga-workflow` | Checks the candidate `{ revision }` with the content rules.                                   |
| `POST /:id/apply`                       | `cyberia-saga-workflow` | Writes the checked candidate `{ revision }` to the content source.                            |
| `PUT /:id/exclusions`                   | `cyberia-saga-workflow` | Leaves the report row `{ key }` out with a `{ reason }`; an empty reason takes it back.       |
| `GET /:id/report?revision=`             | `cyberia-saga-workflow` | The completeness report of a candidate, the newest by default.                                |
| `GET /catalog`                          | `cyberia-saga`          | A page of the saga catalog of the host. Moderator. See [Catalog](#catalog).                   |
| `GET /sources`                          | `cyberia-saga`          | The sagas of each item, map, quest, action and dialogue code.                                 |
| `GET /sync/:code`, `POST /sync/:code`   | `cyberia-saga`          | Checks or synchronizes a stored saga ([Synchronize a saga](../how-to/synchronize-a-saga.md)). |
| `GET /report/:code`                     | `cyberia-saga`          | The completeness report of a saga of the served artifact. Moderator.                          |

A request that conflicts with the stored state answers 409; an unknown workflow, candidate or
generation answers 404. A host without a `cyberia-content` source checkout answers 409 to a
generation, a check, an apply and an open of a content saga.

## Deploy configuration

The host mounts `cyberia-saga-workflow` beside `cyberia-saga`, outside the content partition: its
records are Studio workflow, never content. Building its router starts the generation worker of the
host. The portal lists the `SagaEngineCyberia`, `SagaGraphCyberia`, `SagaPackageCyberia` and
`SagaReportCyberia` components, the `cyberia-saga-workflow` service and the `/cyberia-saga-engine`
route.

## Catalog

`GET /api/v1/cyberia-saga/catalog` lists every saga of the content source checkout, the served
artifact, the workspace database and the workflows, one row per saga code, the most recently changed
first. `cyberia content saga list` and `inspect` print the same rows.

| Query       | Takes                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| `q`         | Text the saga code or name contains                                          |
| `source`    | `present` or `absent` in the content checkout                                |
| `artifact`  | `present` or `absent` in the artifact                                        |
| `workspace` | `in-sync`, `differs`, `stored` (no build to compare) or `absent`             |
| `release`   | A release id: only the sagas that release database stores                    |
| `instance`  | A world code: only the sagas whose maps or places it holds, or its own world |
| `workflow`  | `none`, or the stage of the newest workflow                                  |
| `page`      | The page, from 1                                                             |
| `limit`     | Rows per page, 1 to 50; 10 by default                                        |

The answer is `{ data, total, page, limit, drafts, releases, capabilities }`. A row is:

| Field       | Holds                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| `source`    | `present` and the file time                                                            |
| `artifact`  | `present`                                                                              |
| `workspace` | The `status` of the record against the artifact and its `updatedAt`                    |
| `release`   | With a `release` query: `releaseId` and `present`                                      |
| `workflow`  | The newest workflow: `_id`, `stage`, `generation`, `updatedAt`                         |
| `counts`    | `maps`, `places`, `items`, `quests`, `actions`, `dialogues`; null where no build tells |
| `shared`    | The map codes another saga lists, and the count of its items another saga lists        |
| `instances` | The worlds that hold one of its maps or places, and its authoring world                |
| `placement` | `maps` stored, `quests` and `actions` placed, each as `{ done, total }`                |
| `updatedAt` | The newest change of its record, its workflow or its source file                       |

`drafts` are the workflows that name no saga yet. `releases` are the newest 20 releases of the
ledger. `capabilities` says whether the host has a content source and an artifact.

## Workflow record

| Field         | Holds                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `sagaCode`    | The code of the saga the newest candidate composes                                                    |
| `context`     | The narrative context of the next generation                                                          |
| `base`        | What the content file held when the workflow opened it: `source`, `digest`, `checkoutRevision`        |
| `generations` | Each generation: `attempt`, `status`, `request`, `provenance`, `state`, `steps`, `lease`, `error`     |
| `candidates`  | Each revision: `kind` (`content`, `generated`, `edited`), `package`, `digest`, `generation`, `parent` |
| `validation`  | The last check: `revision`, `digest`, `ok`, `findings` with their `path`, `checkedAt`                 |
| `applied`     | The revision the content source holds from this workflow: `digest`, `file`, `checkoutRevision`, `at`  |
| `exclusions`  | The report rows left out: `key`, `reason`, `actor`, `at`                                              |
| `history`     | Each operation: `action`, `actor`, `at`, `detail`                                                     |

A digest is the sha256 of the canonical JSON of a package: the bytes its content file holds. A
workflow keeps its newest 24 candidates; it never drops the applied one or the newest generated one.

## Generation

| Status      | Means                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| `queued`    | Waits for a worker, or for its next try after a failed step                         |
| `running`   | A worker holds its lease and runs a step                                            |
| `completed` | Its package is the candidate `candidate`                                            |
| `failed`    | A step failed three times (`error.retryable`), or the generator refused the request |
| `cancelled` | A moderator cancelled it                                                            |

The steps are `theme`, `composition`, `maps`, `quests`, `dialogues`, `actions`, `abilities` and
`package`. A lease lasts two minutes and a running step renews it every 30 seconds. One step runs at
most 20 minutes.

## Content commands

The engine runs these `cyberia-content` commands in the source checkout, in a child process:

| Command                              | Does                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `saga step --state <file>`           | Runs the next step of a generation state and writes the state back. Exit 2: refused request.        |
| `saga check --file <file> [--write]` | Prints `{ findings, compiled, context, file }`; `--write` writes a valid package in canonical form. |

## Report

A report is `{ saga, source, statuses, generatedAt, gates, counts, rows, graphs, sync }`. A row is
`{ key, category, gate, subject, status, level, remedy, message, link }`, with `field`, `source`,
`sagas`, `instances`, `place`, `candidates`, `conflicts` or `exclusion` where they apply. A map row
of a place has `place: true` and the source that owns it.

`graphs` holds `narrative` and `composition`, each `{ nodes, edges }`. A node is
`{ id, kind, label, status, source, link }`: a definition id, `saga:<code>`, `dialogue:<code>` or
`instance:<code>`. An edge is `{ from, to, type }`, with `count` on a `composes` edge.

| Graph         | Edge types                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `narrative`   | `starts`, `offers`, `provides`, `unlocks`, `collect`, `kill`, `talk`, `reward`, `greets`           |
| `composition` | `owns`, `place`, `composes`, `shares`, `in world`, and the reference field of an entity to an item |

| Level      | Means                                |
| ---------- | ------------------------------------ |
| `error`    | Blocks its gate                      |
| `warning`  | Needs attention; blocks nothing      |
| `excluded` | Left out on purpose, with the reason |
| `ok`       | Ready, or a dependency that exists   |

| Status                 | Means                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| `foundation`           | The foundation defines it                                           |
| `defined`              | This saga defines it                                                |
| `shared`               | Another saga defines it, or shares it                               |
| `missing-definition`   | A semantic definition or a stored document is missing               |
| `missing-binding`      | The item has no runnable catalog binding                            |
| `missing-object-layer` | The binding names a definition that is missing, a draft or archived |
| `missing-render`       | The definition has no render, or its render has no atlas            |
| `missing-map`          | The map is not stored                                               |
| `missing-placement`    | A composed entity or a provider stands on no map                    |
| `missing-provider`     | A quest or an action has no chosen provider                         |
| `missing-dialogue`     | A dialogue group or a quest talk mapping is missing                 |
| `missing-relationship` | An objective, a talk or a provider has nothing behind it            |
| `invalid-capability`   | The runtime cannot run a capability: a handler, a market, a policy  |
| `invalid`              | Content that breaks a rule, or a stored document that differs       |
| `pending`              | A release step has not run                                          |
| `ready`                | Ready                                                               |
| `published`            | Published by its map population                                     |

| Remedy     | Means                                     |
| ---------- | ----------------------------------------- |
| `generate` | A generation or a map population makes it |
| `decide`   | A moderator chooses                       |
| `broken`   | A reference names nothing                 |
| `import`   | Build and import the content              |
| `apply`    | Apply the candidate                       |
| `sync`     | Synchronize the saga                      |
| `excluded` | Left out on purpose                       |

## Contract coverage

Each Quest and Action field of the runtime model, through the content pipeline:

| Field                                                                  | Schema (`cyberia-content`)      | Generator stage                  | Compiler                              | Runtime model   | Editor                         |
| ---------------------------------------------------------------------- | ------------------------------- | -------------------------------- | ------------------------------------- | --------------- | ------------------------------ |
| Quest `code`, `title`, `description`                                   | `id`, `name`, `description`     | quests                           | slug, name, description               | `CyberiaQuest`  | Action Engine                  |
| Quest `prerequisiteCodes`, `unlocksQuestCodes`                         | `prerequisites`, `unlocks`      | quests                           | slugs                                 | `CyberiaQuest`  | Action Engine                  |
| Quest `steps[].id`, `description`                                      | `steps[]`                       | quests                           | as is                                 | `CyberiaQuest`  | Action Engine                  |
| Quest objective `type`, `itemId`, `quantity`                           | `type`, `target`, `quantity`    | quests                           | a character target becomes its skin   | `CyberiaQuest`  | Action Engine                  |
| Quest `rewards[]`                                                      | `rewards[]`                     | quests                           | item slugs                            | `CyberiaQuest`  | Action Engine                  |
| Quest source map and cell                                              | forbidden                       | forbidden                        | null                                  | `CyberiaQuest`  | Synchronization                |
| Quest `revision`                                                       | —                               | —                                | —                                     | `CyberiaQuest`  | Each save                      |
| Action `code`, `label`                                                 | `id`, `name`                    | actions                          | slug, name                            | `CyberiaAction` | Action Engine                  |
| Action `dialogCode`, `questDialogueCodes`                              | `provider`, quest `talk`        | dialogues                        | `default-<skin>`, `quest-talk-<code>` | `CyberiaAction` | Action Engine, synchronization |
| Action `shopItems[]`                                                   | `shop[]`                        | actions                          | item, price, quantity                 | `CyberiaAction` | Action Engine                  |
| Action `craftRecipes[]` with `fee`                                     | `recipes[]`                     | actions                          | outputs, ingredients, time, fee       | `CyberiaAction` | Action Engine                  |
| Action `storageSlots`                                                  | `storageSlots`                  | actions                          | as is                                 | `CyberiaAction` | Action Engine                  |
| Action `buybackItems`, `burnItems`                                     | `buyback`, `burn`               | actions, with the economy policy | slugs                                 | `CyberiaAction` | Action Engine                  |
| Action `market` (`marketCode`, `selection`, `itemIds`, `listingModes`) | `market` of a foundation market | actions, with the markets        | slugs                                 | `CyberiaAction` | Action Engine                  |
| Action source map and cell                                             | forbidden                       | forbidden                        | null                                  | `CyberiaAction` | Synchronization                |
| Saga `mapCodes`                                                        | map definitions                 | maps                             | slugs                                 | `CyberiaSaga`   | Package                        |
| Saga `placeCodes`                                                      | `places`                        | —                                | slugs                                 | `CyberiaSaga`   | Package                        |

The objective types come from the runtime contract: `collect`, `talk` and `kill`. The content rules
also check the quest graph: an unlock is a prerequisite of the quest it unlocks, a prerequisite of
the same saga unlocks the quest it gates, no chain of prerequisites loops, and a kill targets a
character that spawns as a bot. The dialogue moods come from the runtime contract too.
