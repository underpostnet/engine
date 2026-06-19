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

```
theme prompt
   │
   ▼
DeepSeek (JSON mode, OpenAI-compatible /v1/chat/completions)
   │  one unified payload
   ▼
normalizeSagaPayload()   ── enforces text-only boundary, slugifies, resolves refs
   │
   ▼
persistSagaPayload()     ── idempotent upserts into MongoDB
```

Source:

- `src/server/deepseek-client.js` — thin OpenAI-compatible JSON-mode client.
- `src/projects/cyberia/generate-saga.js` — system prompt, normalization, persistence.
- `bin/cyberia.js` — `generate-saga` CLI command wiring.

## Usage

```bash
node bin/cyberia.js generate-saga \
  --prompt "A rebel hacker base hidden in the sewers of Santiago"
```

Options:

| Flag                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| `--prompt <theme>`    | **Required.** High-level natural-language seed.     |
| `--model <id>`        | DeepSeek model id (default `deepseek-chat`).        |
| `--out <file>`        | Dump the normalized payload JSON to a file.         |
| `--dry-run`           | Generate + normalize only; no database writes.      |
| `--env-path <path>`   | Env file to load (`DEEPSEEK_API_KEY`, deploy vars). |
| `--mongo-host <host>` | Mongo host override.                                |
| `--dev`               | Force the development environment.                  |

`DEEPSEEK_API_KEY` must be available in the environment or the `--env-path` file.

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

| Section   | Model                  | Upsert key       |
| --------- | ---------------------- | ---------------- |
| saga      | `CyberiaSagaModel`     | `code`           |
| quests    | `CyberiaQuestModel`    | `code`           |
| dialogues | `CyberiaDialogueModel` | `code` + `order` |
| actions   | `CyberiaActionModel`   | `code`           |

Object-layer items are part of the generated payload and their ids are recorded
in `saga.itemIds`. Their renders are deliberately `null` — turning a textual
item definition into a real `ObjectLayer` (atlas, CIDs, ledger) belongs to the
downstream spatial/economic synthesis stage, not this text-only layer. Use
`--out` to capture the full payload (including `objectLayers`) for that stage.
