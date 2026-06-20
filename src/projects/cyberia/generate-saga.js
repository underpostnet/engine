/**
 * Top-Down Procedural Generation guided by LLMs (Semantic Reverse-Engineering).
 *
 * Takes a single natural-language theme and asks Google Gemini to infer the
 * complete non-spatial textual backbone of a CyberiaSaga ecosystem: saga
 * metadata, quests, dialogues, actions, and object-layer item definitions.
 *
 * Architectural boundary: this stage owns TEXT and LOGICAL METADATA only. Every
 * spatial / rendering field (initCellX/Y, map grid sizes, asset CIDs, render
 * frames) is forced to null / empty / default here. Spatial + graphic synthesis
 * is a separate downstream stage.
 *
 * @module src/projects/cyberia/generate-saga.js
 * @namespace CyberiaSagaGenerator
 */

import fs from 'fs-extra';
import nodePath from 'path';
import crypto from 'crypto';
import { GeminiClient } from './gemini-client.js';
import { computeSha256 } from './object-layer.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

/** Canonical Cyberia base-lore document, passed to the model when auto-generating a theme. */
const DEFAULT_LORE_PATH = 'src/client/public/cyberia-docs/CYBERIA-LORE.md';

/** Default directory for generated saga payload dumps when `--out` is not given. */
const DEFAULT_SAGA_OUT_DIR = './engine-private/cyberia-sagas';

/**
 * The confederations / power blocs a saga can revolve around. Unlike {@link TONES}
 * and {@link SPACE_CONTEXTS}, this dimension is NOT customizable: a unique random
 * non-empty subset is chosen each run (one, several, or all — never repeated),
 * giving the saga a distinct alliance/rivalry footprint every time.
 * @type {string[]}
 */
const FACTIONS = [
  'the Zenith Empire (Red)',
  'the Atlas Confederation (Yellow)',
  'the Nova Republic (Blue)',
  'the contested Frontier between confederations',
  'an unaligned independent enclave',
];

/**
 * The four broad, well-defined narrative types. One is chosen uniformly
 * (≈25% each) unless overridden by `--tone`, and its full description is fed to
 * the model so the saga commits hard to that register (avoids every saga
 * collapsing into the same generic "spaceship mission").
 * @type {Object<string, string>}
 */
const TONES = {
  adventure:
    'ADVENTURE — a noir, high-risk mission: covert operations, sabotage, infiltration, open warfare and ' +
    'combat, dangerous experimental technology, rogue AI and mystery. The driving plot is danger and intrigue.',
  politics:
    "POLITICS — Cyberia's geopolitics: diplomatic maneuvering, large-scale faction warfare, revolutions, " +
    'treaties and major power agreements between the confederations, The driving plot is influence, ' +
    'allegiance and statecraft, philosophical and ideological conflicts between entities or factions.',
  tragic:
    'TRAGIC — a genuinely heartbreaking, or intimate story: emotional and sentimental themes centered on ' +
    'family, bonds, loss and the death of loved ones inside small personal micro-realities. The driving ' +
    'plot is grief and what it costs — not spectacle.',
  comedy:
    'COMEDY — everyday absurdity, silliness and stupidity on the frontier. Played for humor: low stakes, ' +
    'ridiculous situations and flawed, funny characters. Take it lightly.',
};

/**
 * The two equally important layers of Cyberia (plus their interplay). The base
 * lore is titled "The Frontier of Hyperspace", which biases an unconstrained
 * model toward hyperspace-only premises — so the spatial context is chosen
 * explicitly and uniformly (≈33.3% each) unless overridden by `--space-context`.
 * @type {Object<string, string>}
 */
const SPACE_CONTEXTS = {
  physical:
    'PHYSICAL LAYER ONLY — the harsh, resource-driven material reality of fleets, colonies, orbital ' +
    'fortresses, infrastructure, territory, logistics and direct force. Do NOT involve hyperspace, ' +
    'Instances, digital realms or memory-cities.',
  mixed:
    'MIXED LAYERS — the porous interplay between physical reality and hyperspace, where relics, neural ' +
    'links, breaches and megastructures let events bleed between the two layers so each reshapes the other.',
  hyperspace:
    'HYPERSPACE LAYER ONLY — inside the persistent Instances: living archives, simulated empires, ' +
    'memory-cities and evolving digital ecosystems where time, geography and identity are fluid. ' +
    'Keep the premise within hyperspace, not the physical frontier.',
};

/**
 * @param {Array} arr
 * @returns {*} A uniformly random element.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick a unique random non-empty subset of `arr` (no repeats). Subset size is
 * uniform in 1..arr.length, members are chosen via a Fisher-Yates shuffle.
 * @param {Array} arr
 * @returns {Array} A new array with 1..arr.length distinct elements.
 */
function pickRandomSubset(arr) {
  const pool = [...arr];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = 1 + Math.floor(Math.random() * pool.length);
  return pool.slice(0, count);
}

/**
 * Resolve the spatial context for theme synthesis. An explicit, valid override
 * wins; otherwise one of the three contexts is chosen uniformly at random.
 * @param {string} [override] - 'physical' | 'mixed' | 'hyperspace'.
 * @returns {string} A valid context key.
 */
function resolveSpaceContext(override) {
  if (override) {
    const key = String(override).toLowerCase();
    if (SPACE_CONTEXTS[key]) return key;
    logger.warn(
      `Unknown --space-context "${override}"; choosing at random. Valid: ${Object.keys(SPACE_CONTEXTS).join(', ')}`,
    );
  }
  return pickRandom(Object.keys(SPACE_CONTEXTS));
}

/**
 * Resolve the narrative tone for theme synthesis. An explicit, valid override
 * wins; otherwise one of the four tones is chosen uniformly at random.
 * @param {string} [override] - 'adventure' | 'politics' | 'tragic' | 'comedy'.
 * @returns {string} A valid tone key.
 */
function resolveTone(override) {
  if (override) {
    const key = String(override).toLowerCase();
    if (TONES[key]) return key;
    logger.warn(`Unknown --tone "${override}"; choosing at random. Valid: ${Object.keys(TONES).join(', ')}`);
  }
  return pickRandom(Object.keys(TONES));
}

/**
 * Read the Cyberia base-lore document. Missing file is non-fatal (returns '').
 * @async
 * @param {string} [lorePath]
 * @returns {Promise<string>}
 */
async function loadLoreContext(lorePath = DEFAULT_LORE_PATH) {
  const resolved = nodePath.resolve(lorePath);
  if (!fs.existsSync(resolved)) {
    logger.warn(`Lore file not found at ${resolved}; proceeding without base lore context.`);
    return '';
  }
  return fs.readFile(resolved, 'utf8');
}

/** Default sampling temperature for theme synthesis (creativity / divergence). */
const DEFAULT_THEME_TEMPERATURE = 1.3;

/**
 * Invent a distinct, lore-grounded saga theme. Variety is forced by a random
 * faction, an explicit narrative tone, an entropy token and a high sampling
 * temperature, so repeated runs surface very different premises and tones.
 *
 * @async
 * @param {GeminiClient} client
 * @param {string} lore - Base lore document text.
 * @param {Object} [options]
 * @param {string} [options.thinkingLevel]
 * @param {string} [options.spaceContext] - Force 'physical' | 'mixed' | 'hyperspace' (default random).
 * @param {string} [options.tone] - Force 'adventure' | 'politics' | 'tragic' | 'comedy' (default random).
 * @param {number} [options.temperature] - Sampling temperature (default 1.3).
 * @returns {Promise<{ theme: string, spaceContext: string, tone: string, factions: string[] }>} The theme and chosen facets.
 */
async function synthesizeTheme(client, lore, { thinkingLevel, spaceContext, tone, temperature } = {}) {
  const contextKey = resolveSpaceContext(spaceContext);
  const toneKey = resolveTone(tone);
  const factions = pickRandomSubset(FACTIONS);
  const nonce = crypto.randomBytes(4).toString('hex');

  const system = [
    'You are the lore-master of Cyberia. Using the BASE LORE below, invent ONE distinct, specific',
    'saga premise that lives inside this world. Make it novel and unexpected — never a generic or',
    'repeated setup, and do NOT default to a "spaceship mission".',
    'Return ONLY JSON: { "theme": string } where theme is 1-2 concrete, evocative sentences.',
    '',
    'CRITICAL — the premise MUST be set in this spatial context:',
    SPACE_CONTEXTS[contextKey],
    '',
    'CRITICAL — the premise MUST commit fully to this narrative type / tone:',
    TONES[toneKey],
    '',
    'CRITICAL — the premise MUST revolve around this confederation set (use all of them):',
    factions.join(', '),
    '',
    'BASE LORE:',
    lore || '(no lore provided)',
  ].join('\n');

  const user = [
    'Invent a fresh saga premise now.',
    `Creative entropy token: ${nonce}.`,
    'Honor the required spatial context, narrative tone and confederation set above exactly, and',
    'choose an unexpected corner of the lore consistent with them.',
  ].join('\n');

  logger.info(`Theme spatial context: ${contextKey} | tone: ${toneKey} | factions: ${factions.join(', ')}`);
  const res = await client.chatJson({
    system,
    user,
    thinkingLevel,
    temperature: typeof temperature === 'number' ? temperature : DEFAULT_THEME_TEMPERATURE,
  });
  const theme = String(res.theme || '').trim();
  if (!theme) throw new Error('Theme synthesis returned an empty theme.');
  return { theme, spaceContext: contextKey, tone: toneKey, factions };
}

/**
 * Slugify a free-text string into a stable kebab-case code.
 * @param {string} input
 * @returns {string}
 */
function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

/**
 * Shared role + hard-rules preamble prepended to every stage prompt.
 * The full ecosystem is generated in small sequential stages (see {@link generateSaga})
 * rather than one monolithic request, which keeps each model call bounded.
 * @type {string}
 */
const ROLE_PREAMBLE = [
  'You are a senior narrative systems designer for a top-down cyberpunk MMO called Cyberia.',
  'You perform SEMANTIC REVERSE-ENGINEERING: from a high-level theme you infer a self-consistent',
  'non-spatial textual game ontology BEFORE any map or art exists.',
  '',
  'HARD RULES:',
  '- TEXT/METADATA ONLY. Never invent spatial or graphic data. All spatial fields (sourceMapCode,',
  '  sourceCellX, sourceCellY, initCellX, initCellY, grid sizes) and all render/asset fields MUST be',
  '  null. No CIDs, no textures, no coordinates.',
  '- Every code/id MUST be lowercase kebab-case, unique, and semantically tied to the theme.',
  '- Output ONLY a single valid JSON object. No markdown fences, no prose.',
].join('\n');

/**
 * Per-stage system prompt fragments. Each stage emits exactly one top-level key
 * and references canonical codes/ids handed in from previous stages.
 * @type {Object<string, string>}
 */
const STAGE_PROMPTS = {
  foundation: [
    'STAGE: foundation. Return ONE JSON object: { "saga": {...}, "objectLayers": [...] }.',
    'saga: { code, name, description, mapCodes:[] }  (leave mapCodes an empty array).',
    'objectLayers[]: { stats:{ effect, resistance, agility, range, intelligence, utility },',
    '  item:{ id, type, description, activable }, render:null }',
    '  item.type is one of: skin, breastplate, weapon, skill, coin, floor, obstacle, portal,',
    '  foreground, resource; every stat is an integer 0..10 balanced to the lore.',
    'Produce 5-10 object-layer items including at least one "coin" currency item AND at least two',
    '"skin" items that represent NAMED NPC characters players can speak to (these back "talk" quests).',
  ].join('\n'),

  maps: [
    'STAGE: maps. Return ONE JSON object: { "maps": [...] }.',
    'maps[]: { code, name, description }  (TEXT ONLY — no grid, cells, entities, coordinates or assets).',
    'Maps are the zones / places where the saga unfolds: the distinct locations the quest chain visits',
    'so the story makes sense (e.g. a hub settlement, a contested site, a hidden base, a final',
    'confrontation). Produce 3-6 maps; codes are lowercase kebab-case and unique.',
  ].join('\n'),

  quests: [
    'STAGE: quests. Return ONE JSON object: { "quests": [...] }.',
    'quests[]: { code, title, description, prerequisiteCodes:[string], unlocksQuestCodes:[string],',
    '  sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  steps:[ { id:string, description:string, objectives:[ { type:"collect"|"talk"|"kill",',
    '    itemId:string, quantity:number } ] } ], rewards:[ { itemId:string, quantity:number } ] }',
    'Objective itemId semantics: collect -> a collectible item id; kill -> the target enemy SKIN id;',
    '  talk -> the SKIN id of the NPC the player must speak to.',
    'Produce 3-6 quests forming a small unlock chain (use prerequisiteCodes / unlocksQuestCodes).',
    'REQUIRED: at least one quest MUST contain a "talk" objective whose itemId is one of the provided',
    'NPC skin item ids. Every objective itemId and reward itemId MUST be one of the provided item ids.',
  ].join('\n'),

  dialogues: [
    'STAGE: dialogues. Return ONE JSON object: { "dialogues": [...] }.',
    'dialogues[]: { code, order:number, speaker:string, text:string, mood:string }',
    'Create one dialogue group (a shared code with incrementing order 0,1,2,...) for each provided',
    'quest, plus one or two NPC greeting groups. Make the text reflect each quest theme.',
    'For EACH provided talk target, also create a dedicated talk dialogue group with code',
    '"quest-talk-<questCode>" spoken by that NPC — this is the conversation that completes the talk',
    'objective. Use the speaker name matching the NPC skin.',
  ].join('\n'),

  actions: [
    'STAGE: actions. Return ONE JSON object: { "actions": [...] }.',
    'actions[]: { code, label, dialogCode, sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  questDialogueCodes:[ { questCode, dialogCode } ], shopItems:[ { itemId, priceItemId, priceQty } ],',
    '  craftRecipes:[ { outputItems:[ { itemId, qty } ], ingredients:[ { itemId, qty } ] } ],',
    '  storageSlots:number }',
    'A "talk" objective is fulfilled ONLY when the player views the dialogCode that an action maps for',
    'that quest. So for EVERY provided talk target { questCode, skin } you MUST output an action that',
    'represents that NPC: set dialogCode to "default-<skin>" (the NPC greeting) and include a',
    "questDialogueCodes entry { questCode, dialogCode } whose dialogCode is that quest's talk dialogue",
    '(prefer "quest-talk-<questCode>"). Without this entry the talk objective can NEVER be completed.',
    'Produce 2-4 actions. Each questDialogueCodes[].questCode MUST be a provided quest code; every',
    'questDialogueCodes[].dialogCode MUST be a provided dialogue code; every shop/craft itemId MUST be',
    'a provided item id.',
  ].join('\n'),
};

/**
 * Compose a stage system prompt from the shared preamble and a stage fragment.
 * @param {keyof typeof STAGE_PROMPTS} stage
 * @returns {string}
 */
function buildStagePrompt(stage) {
  return `${ROLE_PREAMBLE}\n\n${STAGE_PROMPTS[stage]}`;
}

/**
 * Build the user message for a stage: optional base lore for grounding, the
 * theme, and a compact JSON context of canonical references from prior stages.
 * @param {string} theme
 * @param {Object} [context]
 * @param {string} [lore] - Base lore text to ground the stage (omitted when empty).
 * @returns {string}
 */
function buildStageUser(theme, context, lore) {
  const lines = [];
  if (lore) lines.push('BASE LORE CONTEXT (ground the saga in this world):', lore, '');
  lines.push(`Theme seed: ${theme}`);
  if (context && Object.keys(context).length > 0) {
    lines.push('', 'Use ONLY these canonical references where required:', JSON.stringify(context));
  }
  return lines.join('\n');
}

/**
 * Coerce any value to a plain array.
 * @param {*} value
 * @returns {Array}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Extract the distinct (questCode, skin) targets implied by every `talk`
 * objective. The objective's itemId is the SKIN id of the NPC to speak to.
 * Tolerant of raw (un-normalized) or normalized quests.
 * @param {Object[]} quests
 * @returns {{ questCode: string, skin: string }[]}
 */
function collectTalkTargets(quests) {
  const seen = new Set();
  const targets = [];
  for (const q of asArray(quests)) {
    const questCode = slugify(q.code);
    if (!questCode) continue;
    for (const step of asArray(q.steps)) {
      for (const o of asArray(step.objectives)) {
        if (o?.type === 'talk' && o.itemId) {
          const skin = slugify(o.itemId);
          const key = `${questCode}::${skin}`;
          if (skin && !seen.has(key)) {
            seen.add(key);
            targets.push({ questCode, skin });
          }
        }
      }
    }
  }
  return targets;
}

/**
 * Build a minimal, schema-valid NPC skin object-layer item.
 * @param {string} id
 * @returns {Object}
 */
function makeSkinItem(id) {
  return {
    stats: { effect: 1, resistance: 1, agility: 1, range: 1, intelligence: 1, utility: 1 },
    item: { id, type: 'skin', description: `NPC ${id}`, activable: false },
    render: null,
  };
}

/**
 * Guarantee every `talk` objective is fulfillable. A talk objective completes
 * only when the player views the dialogCode an action maps for that quest, on
 * the NPC bot whose skin matches the objective's itemId. This repair makes the
 * data self-consistent even when the model omits a piece: for each talk target
 * it ensures (1) the NPC skin item exists, (2) a talk dialogue exists, and
 * (3) the action for `default-<skin>` maps questCode -> that dialogue.
 *
 * Mutates the provided arrays in place.
 * @param {{ quests: Object[], dialogues: Object[], actions: Object[], objectLayers: Object[] }} payload
 */
function ensureTalkLinkage({ quests, dialogues, actions, objectLayers }) {
  const itemIndex = new Map(objectLayers.map((ol) => [ol.item.id, ol]));
  const dialogueCodes = new Set(dialogues.map((d) => d.code));

  for (const { questCode, skin } of collectTalkTargets(quests)) {
    // 1. The talk objective's itemId must resolve to a real skin item.
    const existing = itemIndex.get(skin);
    if (!existing) {
      const item = makeSkinItem(skin);
      objectLayers.push(item);
      itemIndex.set(skin, item);
    } else if (existing.item.type !== 'skin') {
      existing.item.type = 'skin';
    }

    // 2. The talk dialogue the player must view to complete the objective.
    const talkDialogCode = slugify(`quest-talk-${questCode}`);
    if (!dialogueCodes.has(talkDialogCode)) {
      dialogues.push({ code: talkDialogCode, order: 0, speaker: skin, text: `(${skin} speaks.)`, mood: 'neutral' });
      dialogueCodes.add(talkDialogCode);
    }

    // 3. The NPC action (skin = default-<skin>) must map this quest -> a dialogue.
    const greetCode = `default-${skin}`;
    let action = actions.find((a) => a.dialogCode === greetCode);
    if (!action) {
      action = {
        code: slugify(`loc-${questCode}-${skin}`),
        label: skin,
        dialogCode: greetCode,
        sourceMapCode: null,
        sourceCellX: null,
        sourceCellY: null,
        questDialogueCodes: [],
        shopItems: [],
        craftRecipes: [],
        storageSlots: 0,
      };
      actions.push(action);
    }
    if (!action.dialogCode) action.dialogCode = greetCode;

    const entry = action.questDialogueCodes.find((qd) => qd.questCode === questCode);
    if (entry) {
      // Keep a model-provided mapping only if its dialogue actually exists.
      if (!dialogueCodes.has(entry.dialogCode)) entry.dialogCode = talkDialogCode;
    } else {
      action.questDialogueCodes.push({ questCode, dialogCode: talkDialogCode });
    }
  }
}

/**
 * Normalize a raw model payload into model-ready documents, enforcing the
 * text-only architectural boundary (spatial + render fields nulled).
 *
 * @param {Object} raw - Parsed Gemini JSON.
 * @param {Object} params
 * @param {string} params.theme - Original prompt seed (used to derive a saga code fallback).
 * @returns {{ saga: Object, maps: Object[], quests: Object[], dialogues: Object[], actions: Object[], objectLayers: Object[] }}
 */
function normalizeSagaPayload(raw, { theme }) {
  const rawSaga = raw.saga || {};

  // Maps are narrative zones — text only (code, name, description); spatial /
  // grid / entity fields stay at their schema defaults.
  const maps = asArray(raw.maps)
    .map((m) => ({
      code: slugify(m.code),
      name: m.name || m.code || '',
      description: m.description || '',
    }))
    .filter((m) => m.code);

  const quests = asArray(raw.quests).map((q) => ({
    code: slugify(q.code),
    title: q.title || q.code,
    description: q.description || '',
    prerequisiteCodes: asArray(q.prerequisiteCodes).map(slugify),
    unlocksQuestCodes: asArray(q.unlocksQuestCodes).map(slugify),
    // Spatial binding is out of scope for this stage.
    sourceMapCode: null,
    sourceCellX: null,
    sourceCellY: null,
    steps: asArray(q.steps).map((s, i) => ({
      id: s.id || `step-${i + 1}`,
      description: s.description || '',
      objectives: asArray(s.objectives).map((o) => ({
        type: o.type,
        itemId: slugify(o.itemId),
        quantity: Number(o.quantity) > 0 ? Number(o.quantity) : 1,
      })),
    })),
    rewards: asArray(q.rewards).map((r) => ({
      itemId: slugify(r.itemId),
      quantity: Number(r.quantity) > 0 ? Number(r.quantity) : 1,
    })),
  }));

  const dialogues = asArray(raw.dialogues).map((d, i) => ({
    code: slugify(d.code),
    order: Number.isFinite(Number(d.order)) ? Number(d.order) : i,
    speaker: d.speaker || '',
    text: d.text || '',
    mood: d.mood || 'neutral',
  }));

  const actions = asArray(raw.actions).map((a) => ({
    code: slugify(a.code),
    label: a.label || '',
    dialogCode: a.dialogCode ? slugify(a.dialogCode) : '',
    sourceMapCode: null,
    sourceCellX: null,
    sourceCellY: null,
    questDialogueCodes: asArray(a.questDialogueCodes).map((qd) => ({
      questCode: slugify(qd.questCode),
      dialogCode: slugify(qd.dialogCode),
    })),
    shopItems: asArray(a.shopItems).map((s) => ({
      itemId: slugify(s.itemId),
      priceItemId: slugify(s.priceItemId) || 'coin',
      priceQty: Number(s.priceQty) >= 0 ? Number(s.priceQty) : 1,
    })),
    craftRecipes: asArray(a.craftRecipes).map((c) => ({
      outputItems: asArray(c.outputItems).map((o) => ({
        itemId: slugify(o.itemId),
        qty: Number(o.qty) > 0 ? Number(o.qty) : 1,
      })),
      ingredients: asArray(c.ingredients).map((o) => ({
        itemId: slugify(o.itemId),
        qty: Number(o.qty) > 0 ? Number(o.qty) : 1,
      })),
    })),
    storageSlots: Number(a.storageSlots) > 0 ? Number(a.storageSlots) : 0,
  }));

  const objectLayers = asArray(raw.objectLayers).map((ol) => {
    const stats = ol.stats || {};
    return {
      stats: {
        effect: Number(stats.effect) || 0,
        resistance: Number(stats.resistance) || 0,
        agility: Number(stats.agility) || 0,
        range: Number(stats.range) || 0,
        intelligence: Number(stats.intelligence) || 0,
        utility: Number(stats.utility) || 0,
      },
      item: {
        id: slugify(ol.item?.id),
        type: ol.item?.type || 'skin',
        description: ol.item?.description || '',
        activable: Boolean(ol.item?.activable),
      },
      // Graphic synthesis is a downstream stage.
      render: null,
    };
  });

  // Guarantee every talk objective has a backing NPC skin, dialogue, and action
  // mapping (may append skin items / dialogues / actions) before reconciling ids.
  ensureTalkLinkage({ quests, dialogues, actions, objectLayers });

  const itemIds = objectLayers.map((ol) => ol.item.id).filter(Boolean);
  const questCodes = quests.map((q) => q.code).filter(Boolean);
  const mapCodes = maps.map((m) => m.code).filter(Boolean);

  const saga = {
    code: slugify(rawSaga.code) || slugify(theme) || `cyberia-saga-${Date.now()}`,
    name: rawSaga.name || theme,
    description: rawSaga.description || '',
    mapCodes: [...new Set([...asArray(rawSaga.mapCodes).map(slugify), ...mapCodes])].filter(Boolean),
    itemIds: [...new Set([...asArray(rawSaga.itemIds).map(slugify), ...itemIds])].filter(Boolean),
    questCodes: [...new Set([...asArray(rawSaga.questCodes).map(slugify), ...questCodes])].filter(Boolean),
  };

  return { saga, maps, quests, dialogues, actions, objectLayers };
}

/**
 * Persist normalized object-layer items into the ObjectLayer collection so they
 * are editable in the viewer. Items are created with an empty (`null`) render
 * and an `OFF_CHAIN` ledger; a render/ledger can be set later from
 * `src/client/components/cyberia/ObjectLayerEngineViewer.js`.
 *
 * Upserts by `data.item.id`. An existing item's render and ledger are PRESERVED
 * (never clobbered back to null) — only the textual stats/item fields are
 * refreshed. `sha256` is recomputed over the resulting data.
 *
 * @async
 * @param {Object} params
 * @param {Object[]} params.objectLayers - Normalized object-layer items ({ stats, item, render }).
 * @param {import('mongoose').Model} params.ObjectLayer - The ObjectLayer model.
 * @returns {Promise<number>} Count of items created or updated.
 */
async function persistObjectLayers({ objectLayers, ObjectLayer }) {
  let count = 0;
  for (const ol of objectLayers) {
    const itemId = ol.item?.id;
    if (!itemId) continue;

    const existing = await ObjectLayer.findOne({ 'data.item.id': itemId });

    // Preserve any render already set via the viewer; default to empty render.
    const hasRender = existing?.data?.render?.cid || existing?.data?.render?.metadataCid;
    const render = hasRender ? existing.data.render : { cid: null, metadataCid: null };
    const ledger = existing?.data?.ledger?.type ? existing.data.ledger : { type: 'OFF_CHAIN', tokenId: '' };

    const data = { stats: ol.stats, item: ol.item, ledger, render };
    const sha256 = computeSha256(data);

    if (existing) {
      existing.data = data;
      existing.sha256 = sha256;
      await existing.save();
    } else {
      await ObjectLayer.create({ data, sha256, cid: null });
    }
    count++;
  }
  return count;
}

/**
 * Persist the normalized payload into MongoDB via the provided Mongoose models.
 * Upserts by natural key so reruns are idempotent.
 *
 * @async
 * @param {Object} params
 * @param {Object} params.payload - Output of {@link normalizeSagaPayload}.
 * @param {Object} params.models - { CyberiaSaga, CyberiaMap?, CyberiaQuest, CyberiaDialogue, CyberiaAction, ObjectLayer? }.
 * @returns {Promise<{ saga, maps, quests, dialogues, actions, objectLayers: number }>}
 */
async function persistSagaPayload({ payload, models }) {
  const { CyberiaSaga, CyberiaMap, CyberiaQuest, CyberiaDialogue, CyberiaAction, ObjectLayer } = models;
  const { saga, maps, quests, dialogues, actions, objectLayers } = payload;

  await CyberiaSaga.findOneAndUpdate({ code: saga.code }, { $set: saga }, { upsert: true });

  let mapCount = 0;
  if (CyberiaMap) {
    for (const map of asArray(maps)) {
      await CyberiaMap.findOneAndUpdate({ code: map.code }, { $set: map }, { upsert: true });
      mapCount++;
    }
  }
  for (const quest of quests) {
    await CyberiaQuest.findOneAndUpdate({ code: quest.code }, { $set: quest }, { upsert: true });
  }
  for (const dialogue of dialogues) {
    await CyberiaDialogue.findOneAndUpdate(
      { code: dialogue.code, order: dialogue.order },
      { $set: dialogue },
      { upsert: true },
    );
  }
  for (const action of actions) {
    await CyberiaAction.findOneAndUpdate({ code: action.code }, { $set: action }, { upsert: true });
  }

  const objectLayerCount = ObjectLayer ? await persistObjectLayers({ objectLayers, ObjectLayer }) : 0;

  return {
    saga: 1,
    maps: mapCount,
    quests: quests.length,
    dialogues: dialogues.length,
    actions: actions.length,
    objectLayers: objectLayerCount,
  };
}

/**
 * Generate the raw six-section ecosystem in five bounded, sequential stages.
 * Each stage produces one layer and feeds canonical (slugified) references into
 * the next, so no single model call has to emit the whole cross-referenced graph.
 *
 * @async
 * @param {GeminiClient} client
 * @param {string} theme
 * @param {string} [thinkingLevel]
 * @param {string} [lore] - Base lore text to ground every stage (empty = ungrounded).
 * @param {number} [temperature] - Sampling temperature applied to every stage (model default if omitted).
 * @returns {Promise<{ saga, maps, quests, dialogues, actions, objectLayers }>}
 */
async function generateRawEcosystem(client, theme, thinkingLevel, lore = '', temperature) {
  // Stage 1 — saga identity + object-layer items (the economic foundation).
  logger.info('Stage 1/5: foundation (saga + object layers)');
  const foundation = await client.chatJson({
    system: buildStagePrompt('foundation'),
    user: buildStageUser(theme, undefined, lore),
    thinkingLevel,
    temperature,
  });
  const saga = foundation.saga || {};
  const objectLayers = asArray(foundation.objectLayers);
  const itemIds = objectLayers.map((ol) => slugify(ol.item?.id)).filter(Boolean);

  // Stage 2 — maps: the narrative zones the quest chain visits.
  logger.info('Stage 2/5: maps');
  const mapsRes = await client.chatJson({
    system: buildStagePrompt('maps'),
    user: buildStageUser(theme, undefined, lore),
    thinkingLevel,
    temperature,
  });
  const maps = asArray(mapsRes.maps);
  const mapCodes = maps.map((m) => slugify(m.code)).filter(Boolean);

  // Stage 3 — quests referencing the canonical item ids, grounded in the zones.
  logger.info('Stage 3/5: quests');
  const questsRes = await client.chatJson({
    system: buildStagePrompt('quests'),
    user: buildStageUser(
      theme,
      { itemIds, maps: maps.map((m) => ({ code: slugify(m.code), name: m.name || '' })) },
      lore,
    ),
    thinkingLevel,
    temperature,
  });
  const quests = asArray(questsRes.quests);
  const questCodes = quests.map((q) => slugify(q.code)).filter(Boolean);
  // NPCs that must be talked to (questCode + skin) drive the dialogue + action linkage.
  const talkTargets = collectTalkTargets(quests);

  // Stage 4 — dialogues for each quest (and a talk dialogue per talk target).
  logger.info('Stage 4/5: dialogues');
  const dialoguesRes = await client.chatJson({
    system: buildStagePrompt('dialogues'),
    user: buildStageUser(
      theme,
      { quests: quests.map((q) => ({ code: slugify(q.code), title: q.title || '' })), talkTargets },
      lore,
    ),
    thinkingLevel,
    temperature,
  });
  const dialogues = asArray(dialoguesRes.dialogues);
  const dialogueCodes = [...new Set(dialogues.map((d) => slugify(d.code)).filter(Boolean))];

  // Stage 5 — actions binding quests, dialogues, and items together.
  logger.info('Stage 5/5: actions');
  const actionsRes = await client.chatJson({
    system: buildStagePrompt('actions'),
    user: buildStageUser(theme, { questCodes, dialogueCodes, itemIds, talkTargets }, lore),
    thinkingLevel,
    temperature,
  });
  const actions = asArray(actionsRes.actions);

  return { saga, maps, quests, dialogues, actions, objectLayers };
}

/**
 * Full Top-Down PCG pipeline: prompt → staged Gemini JSON → normalize → persist.
 *
 * @async
 * When `prompt` is omitted, a distinct theme is auto-synthesized from the Cyberia
 * base lore (and every stage is grounded in that lore). When `prompt` is given,
 * it is used as-is with no lore grounding. When `out` is omitted, the payload is
 * written to `./engine-private/cyberia-sagas/<saga-code>.json`.
 *
 * @param {Object} params
 * @param {string} [params.prompt] - Theme seed; if omitted, auto-generated from lore.
 * @param {Object} params.models - Loaded Mongoose models (see {@link persistSagaPayload}).
 * @param {string} [params.model] - Gemini model id override.
 * @param {string} [params.apiKey] - Gemini API key override.
 * @param {number} [params.timeout] - Per-request timeout in ms.
 * @param {string} [params.thinkingLevel] - Gemini thinking level (default in client).
 * @param {string} [params.lorePath] - Override path to the base-lore document.
 * @param {string} [params.spaceContext] - Force 'physical' | 'mixed' | 'hyperspace' (auto mode only).
 * @param {string} [params.tone] - Force 'adventure' | 'politics' | 'tragic' | 'comedy' (auto mode only).
 * @param {number} [params.temperature] - Sampling temperature applied to every model call.
 * @param {boolean} [params.dryRun=false] - Skip persistence; only generate + return.
 * @param {string} [params.out] - File path to dump the payload (defaults to the saga dir).
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function generateSaga({
  prompt,
  models,
  model,
  apiKey,
  timeout,
  thinkingLevel,
  lorePath,
  spaceContext,
  tone,
  temperature,
  dryRun = false,
  out,
}) {
  const client = new GeminiClient({ apiKey, model, timeout });

  let theme = prompt;
  let lore = '';
  if (!theme) {
    lore = await loadLoreContext(lorePath);
    logger.info('No --prompt provided; auto-generating a distinct lore-grounded theme...');
    ({ theme } = await synthesizeTheme(client, lore, { thinkingLevel, spaceContext, tone, temperature }));
    logger.info(`Auto-generated theme: "${theme}"`);
  } else {
    logger.info(`Generating saga ontology from theme: "${theme}"`);
  }

  const raw = await generateRawEcosystem(client, theme, thinkingLevel, lore, temperature);
  const payload = normalizeSagaPayload(raw, { theme });

  const outPath = out || nodePath.join(DEFAULT_SAGA_OUT_DIR, `${payload.saga.code}.json`);
  return finalizeSaga({ payload, models, out: outPath, dryRun });
}

/**
 * Import a previously generated payload file (the shape `--out` writes) and load
 * it into the database. Runs through the same normalize → persist path as
 * {@link generateSaga}, so codes are slugified and upserted (overwrite, never
 * duplicated). No model call is made.
 *
 * @async
 * @param {Object} params
 * @param {string} params.file - Path to the JSON payload file.
 * @param {Object} params.models - Loaded Mongoose models (see {@link persistSagaPayload}).
 * @param {boolean} [params.dryRun=false] - Normalize only; skip persistence.
 * @param {string} [params.out] - Optional path to re-dump the normalized payload.
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function importSaga({ file, models, dryRun = false, out }) {
  if (!file) throw new Error('An --import file path is required.');

  const filePath = nodePath.resolve(file);
  if (!fs.existsSync(filePath)) throw new Error(`Import file not found: ${filePath}`);

  logger.info(`Importing saga payload from ${filePath}`);
  const raw = await fs.readJson(filePath);
  const payload = normalizeSagaPayload(raw, {
    theme: raw?.saga?.name || raw?.saga?.code || 'imported-saga',
  });

  return finalizeSaga({ payload, models, out, dryRun });
}

/**
 * Shared tail for generate/import: log the normalized shape, optionally dump it
 * to disk, then upsert into MongoDB (unless `dryRun`).
 *
 * @async
 * @param {Object} params
 * @param {Object} params.payload - Output of {@link normalizeSagaPayload}.
 * @param {Object} [params.models] - Loaded Mongoose models (required unless `dryRun`).
 * @param {string} [params.out] - Optional path to dump the normalized payload JSON.
 * @param {boolean} [params.dryRun=false] - Skip persistence; only normalize + dump.
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function finalizeSaga({ payload, models, out, dryRun = false }) {
  logger.info(
    `Normalized: saga=${payload.saga.code} maps=${payload.maps.length} quests=${payload.quests.length} ` +
      `dialogues=${payload.dialogues.length} actions=${payload.actions.length} ` +
      `objectLayers=${payload.objectLayers.length}`,
  );

  if (out) {
    const outPath = nodePath.resolve(out);
    await fs.ensureDir(nodePath.dirname(outPath));
    await fs.writeJson(outPath, payload, { spaces: 2 });
    logger.info(`Payload written to ${outPath}`);
  }

  if (dryRun) {
    logger.info('Dry run: skipping database persistence.');
    return payload;
  }

  const summary = await persistSagaPayload({ payload, models });
  logger.info(
    `Persisted: ${summary.saga} saga, ${summary.maps} maps, ${summary.quests} quests, ` +
      `${summary.dialogues} dialogues, ${summary.actions} actions, ${summary.objectLayers} object layers`,
  );

  return { ...payload, summary };
}

export {
  generateSaga,
  importSaga,
  finalizeSaga,
  generateRawEcosystem,
  normalizeSagaPayload,
  ensureTalkLinkage,
  collectTalkTargets,
  persistSagaPayload,
  persistObjectLayers,
  loadLoreContext,
  synthesizeTheme,
  buildStagePrompt,
  buildStageUser,
  slugify,
};
