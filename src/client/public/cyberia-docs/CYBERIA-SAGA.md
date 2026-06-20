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

The ecosystem is generated in **five bounded, sequential stages** rather than a
single monolithic request. Each stage emits one layer and feeds canonical
(slugified) references into the next, so no single model call has to produce the
whole cross-referenced graph — this keeps each Gemini request small enough to
complete well within the request timeout.

```
theme  (from --prompt, OR auto-synthesized from CYBERIA-LORE.md)
   │
   ▼
Google Gemini (Generative Language API /v1beta/models/{model}:generateContent)
   │   stage 1  foundation  → saga identity + objectLayers (item ids)
   │   stage 2  maps        → maps             (narrative zones / places)
   │   stage 3  quests      → quests           (consume item ids + map zones)
   │   stage 4  dialogues   → dialogues        (consume quest codes)
   │   stage 5  actions     → actions          (consume quest + dialogue + item codes)
   ▼
normalizeSagaPayload()   ── enforces text-only boundary, slugifies, resolves refs
   │
   ▼
persistSagaPayload()     ── idempotent upserts into MongoDB
```

### Theme source: prompt vs. lore-grounded auto-generation

- **`--prompt` given** → the theme is used verbatim with no lore grounding
  (current behavior).
- **`--prompt` omitted** → a distinct theme is auto-synthesized from the Cyberia
  base lore (`src/client/public/cyberia-docs/CYBERIA-LORE.md`, override with
  `--lore-path`). The whole lore document is read and passed to Gemini, and every
  stage is grounded in it so the saga reads as a chapter of the canon. Variety is
  forced by a random **faction**, an explicit **narrative tone**, a random entropy
  token, and a configurable sampling **temperature** (`--temperature`, default
  `1.3`) — so repeated runs surface very different sagas across the lore.

#### Narrative tone

To stop every auto-generated saga collapsing into the same generic "spaceship
mission", the theme commits hard to one of four broad, well-defined narrative
types — chosen **uniformly (~25% each)** unless forced with `--tone`:

| Tone        | Register                                                        |
| ----------- | -------------------------------------------------------------- |
| `adventure` | noir high-risk missions: covert ops, sabotage, combat, rogue AI, mystery |
| `politics`  | geopolitics: diplomacy, faction warfare, revolutions, treaties |
| `tragic`    | heartbreaking, intimate: family, bonds, loss, grief            |
| `comedy`    | everyday absurdity and silliness, played for humor             |

#### Spatial context (physical vs. hyperspace)

Cyberia has two equally important layers — the **Physical Layer** (fleets,
colonies, logistics, force) and the **Hyperspace Layer** (persistent Instances,
memory-cities, digital ecosystems). Because the lore is titled *The Frontier of
Hyperspace*, an unconstrained model drifts to hyperspace-only premises. So the
auto-theme picks a spatial context **explicitly and uniformly (~33.3% each)**:

| Context      | Premise lives in…                                              |
| ------------ | -------------------------------------------------------------- |
| `physical`   | the material frontier only — no hyperspace                     |
| `mixed`      | the porous interplay where events bleed between both layers    |
| `hyperspace` | inside the Instances only — not the physical frontier          |

Force one with `--space-context <physical\|mixed\|hyperspace>`; an invalid value
warns and falls back to random. This applies to auto-generation only (with
`--prompt`, you control the setting yourself).

> Transient `generateContent` failures (timeouts, 5xx, malformed JSON) are
> retried automatically with backoff (`maxRetries`, default 2) per stage.

Source:

- `src/projects/cyberia/gemini-client.js` — thin Gemini `generateContent` JSON client.
- `src/projects/cyberia/generate-saga.js` — system prompt, normalization, persistence.
- `bin/cyberia.js` — `generate-saga` CLI command wiring.

## Usage

### Lore-based auto-generation (no `--prompt`)

With no `--prompt`, the theme is auto-synthesized from the Cyberia base lore.
Omitting the steering flags lets the generator pick a random faction, tone and
spatial context each run, so the same command keeps producing different sagas:

```bash
# Fully random, lore-grounded saga (faction + tone + spatial context all random)
node bin/cyberia.js generate-saga

# Force a heartbreaking, character-driven story grounded in physical reality
node bin/cyberia.js generate-saga --tone tragic --space-context physical

# A political saga set inside hyperspace Instances
node bin/cyberia.js generate-saga --tone politics --space-context hyperspace

# A light comedy that spans both layers, cranked up for more divergence
node bin/cyberia.js generate-saga --tone comedy --space-context mixed --temperature 1.7

# A noir adventure, kept tightly on-theme with a low temperature
node bin/cyberia.js generate-saga --tone adventure --temperature 0.6

# Steer only the spatial layer; let faction + tone stay random
node bin/cyberia.js generate-saga --space-context physical

# Dry run (no DB writes) and capture the payload to inspect it
node bin/cyberia.js generate-saga --tone tragic --dry-run --out ./engine-private/cyberia-sagas/preview.json
```

Each run logs the chosen facets, e.g. `Theme spatial context: physical | tone: tragic`,
then `Auto-generated theme: "..."`.

### Generate from an explicit theme

```bash
node bin/cyberia.js generate-saga \
  --prompt "A rebel hacker base hidden in the sewers of Santiago"
```

Either way, when `--out` is omitted the payload is written to
`./engine-private/cyberia-sagas/<saga-code>.json`.

Import a previously generated payload (no model call):

```bash
node bin/cyberia.js generate-saga --import ./engine-private/cyberia-sagas/<saga-code>.json
```

`--import` reads the same JSON shape `--out` writes and loads it through the
**same** normalize → persist path as generation. Re-running is safe: documents
are upserted by `code` (dialogues by `code` + `order`), so existing entries are
overwritten and codes are never duplicated.

Options:

| Flag                       | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `--prompt <theme>`         | Theme seed. Omit to auto-generate from the lore.     |
| `--import <file>`          | Load a generated payload file into the DB.           |
| `--lore-path <path>`       | Override the base-lore doc (auto-generate mode).     |
| `--space-context <ctx>`    | Force `physical` \| `mixed` \| `hyperspace` (else random). |
| `--tone <tone>`            | Force `adventure` \| `politics` \| `tragic` \| `comedy` (else random). |
| `--temperature <value>`    | Sampling temperature for every model call (default `1.3`). |
| `--model <id>`             | Gemini model id (default `gemma-4-26b-a4b-it`).      |
| `--timeout <ms>`           | Per-request timeout in ms (default `300000`).        |
| `--thinking-level <level>` | `low` \| `medium` \| `high` (default `high`).        |
| `--out <file>`             | Payload dump path (default `./engine-private/cyberia-sagas/<saga-code>.json`). |
| `--dry-run`                | Normalize only; no database writes.                  |
| `--env-path <path>`        | Env file to load (`GEMINI_API_KEY`, deploy vars).    |
| `--mongo-host <host>`      | Mongo host override.                                 |
| `--dev`                    | Force the development environment.                  |

`GEMINI_API_KEY` must be available in the environment or the `--env-path` file.

## Output schema

A single JSON object with these interrelated sections:

- **saga** — `code`, `name`, `description`, `mapCodes[]`, `itemIds[]`, `questCodes[]`.
- **maps[]** — narrative zones the quest chain visits: `code`, `name`,
  `description` (text only — grid/cells/entities stay at schema defaults). Their
  codes populate `saga.mapCodes`.
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

### `talk` objectives (guaranteed fulfillable)

A `talk` objective completes **only** when the player views the `dialogCode` an
action maps for that quest, on the NPC bot whose skin matches the objective's
`itemId` (the bot skin derives from the action's `default-<skin>` greeting). A
missing link means the objective can never be completed.

So a talk objective requires four aligned pieces: a `skin` item for the NPC, the
`talk` objective referencing that skin id, a talk dialogue group, and an action
with `dialogCode: default-<skin>` plus a `questDialogueCodes` entry
`{ questCode, dialogCode }`. The prompts ask the model to produce all four (the
quests/dialogues/actions stages are told the `talkTargets`), and a deterministic
**repair pass** (`ensureTalkLinkage`) then guarantees it: for every talk
objective it creates any missing skin item, talk dialogue
(`quest-talk-<questCode>`), or NPC action mapping, and rewrites a
`questDialogueCodes` entry that points at a non-existent dialogue. Reruns where
the model already produced valid links are a no-op.

## Persistence

Documents are written sequentially with idempotent upserts (rerunnable):

| Section       | Model                  | Upsert key       |
| ------------- | ---------------------- | ---------------- |
| saga          | `CyberiaSagaModel`     | `code`           |
| maps          | `CyberiaMapModel`      | `code`           |
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
