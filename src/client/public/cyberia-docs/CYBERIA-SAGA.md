# Cyberia Saga — Top-Down Procedural Generation guided by LLMs

> Semantic Reverse-Engineering of a complete saga ecosystem from a single theme.

## Concept

Classic procedural content generation is **bottom-up**: you draw maps, place
cells and entities, then layer text and logic on top of that spatial substrate.
Cyberia inverts the pipeline.

**Top-Down PCG (Semantic Reverse-Engineering)** uses an LLM to infer the entire
**semantic ontology and narrative backbone first**, from one high-level natural
language theme. We generate the lightweight, easy-to-align textual layer —
slugs, titles, descriptions, dialogues, objective requirements, item stats —
_before_ a single coordinate or texture exists. Spatial layout and graphic
synthesis become a separate, later stage that fills in a backbone that is
already internally consistent.

This is a specialized form of AI-Generated Content (AIGC). The win is
**consistency**: by resolving names, references, and progression as pure text,
the world is logically coherent before we pay the cost of spatial and visual
synthesis.

## Architectural boundary (hard rule)

This stage owns **text and logical metadata only**.

| Owned here (textual)             | Out of scope (forced to `null` / default)     |
| -------------------------------- | --------------------------------------------- |
| codes, titles, descriptions      | `sourceMapCode`, `sourceCellX`, `sourceCellY` |
| dialogue text, speakers, mood    | `initCellX`, `initCellY`, map grid sizes      |
| quest steps, objectives, rewards | asset CIDs, textures, `render` frames         |
| item stats balance, item types   | atlas / sprite-sheet generation               |

The generator normalizes every spatial and render field to `null` regardless of
what the model returns. Downstream spatial + graphic synthesis is responsible
for binding quests/actions to cells and producing object-layer renders.

## Pipeline

The ecosystem is generated in **four bounded, sequential stages** rather than a
single monolithic request. Each stage emits one layer and feeds canonical
(slugified) references into the next, so no single model call has to produce the
whole cross-referenced graph — this keeps each Gemini request small enough to
complete well within the request timeout.

```
theme prompt
   │
   ▼
Google Gemini (Generative Language API /v1beta/models/{model}:generateContent)
   │   stage 1  foundation  → saga identity + objectLayers (item ids)
   │   stage 2  quests      → quests           (consume item ids)
   │   stage 3  dialogues   → dialogues        (consume quest codes)
   │   stage 4  actions     → actions          (consume quest + dialogue + item codes)
   ▼
normalizeSagaPayload()   ── enforces text-only boundary, slugifies, resolves refs
   │
   ▼
persistSagaPayload()     ── idempotent upserts into MongoDB
```

Source:

- `src/projects/cyberia/gemini-client.js` — thin Gemini `generateContent` JSON client.
- `src/projects/cyberia/generate-saga.js` — system prompt, normalization, persistence.
- `bin/cyberia.js` — `generate-saga` CLI command wiring.

## Usage

Generate from a theme (optionally capturing the payload with `--out`):

```bash
node bin/cyberia.js generate-saga \
  --prompt "A rebel hacker base hidden in the sewers of Santiago" \
  --out ./saga.json
```

Import a previously generated payload (no model call):

```bash
node bin/cyberia.js generate-saga --import ./saga.json
```

`--import` reads the same JSON shape `--out` writes and loads it through the
**same** normalize → persist path as generation. Re-running is safe: documents
are upserted by `code` (dialogues by `code` + `order`), so existing entries are
overwritten and codes are never duplicated. Exactly one of `--prompt` or
`--import` is required.

Options:

| Flag                       | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `--prompt <theme>`         | High-level natural-language seed (generate mode).    |
| `--import <file>`          | Load a generated payload file into the DB.           |
| `--model <id>`             | Gemini model id (default `gemma-4-26b-a4b-it`).      |
| `--timeout <ms>`           | Per-request timeout in ms (default `300000`).        |
| `--thinking-level <level>` | `low` \| `medium` \| `high` (default `high`).        |
| `--out <file>`             | Dump the normalized payload JSON to a file.          |
| `--dry-run`                | Normalize only; no database writes.                  |
| `--env-path <path>`        | Env file to load (`GEMINI_API_KEY`, deploy vars).    |
| `--mongo-host <host>`      | Mongo host override.                                 |
| `--dev`                    | Force the development environment.                  |

`GEMINI_API_KEY` must be available in the environment or the `--env-path` file.

## Output schema

A single JSON object with five interrelated sections:

- **saga** — `code`, `name`, `description`, `mapCodes[]`, `itemIds[]`, `questCodes[]`.
- **quests[]** — textual objectives, titles, linear `steps[]` with
  `collect | talk | kill` objectives and `rewards[]`. Spatial fields `null`.
- **dialogues[]** — narrative nodes: `code`, `order`, `speaker`, `text`, `mood`.
- **actions[]** — interaction nodes: `dialogCode`, `questDialogueCodes[]`,
  `shopItems[]` pricing, and `craftRecipes[]`. Spatial fields `null`.
- **objectLayers[]** — item data with balanced `stats`, an `item`
  (`id`, `type`, `description`, `activable`), and `render: null`.

Object-layer item shape:

```json
{
  "stats": { "effect": 4, "resistance": 4, "agility": 3, "range": 10, "intelligence": 5, "utility": 10 },
  "item": { "id": "generated-id", "type": "skin", "description": "Lore-matching description", "activable": true },
  "render": null
}
```

## Referential integrity

The system prompt requires the model to keep cross-references resolvable, and
normalization slugifies every code/id so they line up:

- quest objective/reward `itemId`, shop `itemId`, and craft `itemId` resolve to
  an `objectLayers[].item.id`;
- action `questDialogueCodes[].questCode` resolves to a `quests[].code`;
- action `dialogCode` / `questDialogueCodes[].dialogCode` resolve to a
  `dialogues[].code`;
- `saga.questCodes` / `saga.itemIds` are reconciled to include every generated
  quest and item.

## Persistence

Documents are written sequentially with idempotent upserts (rerunnable):

| Section       | Model                  | Upsert key       |
| ------------- | ---------------------- | ---------------- |
| saga          | `CyberiaSagaModel`     | `code`           |
| quests        | `CyberiaQuestModel`    | `code`           |
| dialogues     | `CyberiaDialogueModel` | `code` + `order` |
| actions       | `CyberiaActionModel`   | `code`           |
| object layers | `ObjectLayerModel`     | `data.item.id`   |

Both `generate` and `import` go through the same persistence path. Object-layer
items are written as real `ObjectLayer` documents so they are immediately
editable in `src/client/components/cyberia/ObjectLayerEngineViewer.js`:

- `data.render` is empty (`cid: null`, `metadataCid: null`) and the top-level
  `cid` is `null` — there is no atlas yet;
- `data.ledger.type` is `OFF_CHAIN` (no on-chain token minted);
- `sha256` is computed over `data` with the canonical `computeSha256` helper.

The render and ledger are the **graphic/economic synthesis** stage and are set
later from the viewer. Re-running generate/import refreshes the textual
stats/item fields but **preserves any render or ledger already set** — it never
clobbers a populated render back to `null`. `saga.itemIds` records every item id.
