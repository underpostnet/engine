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
import { GeminiClient } from './gemini-client.js';
import { computeSha256 } from './object-layer.js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

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
    'Produce 5-10 object-layer items including at least one "coin" currency item.',
  ].join('\n'),

  quests: [
    'STAGE: quests. Return ONE JSON object: { "quests": [...] }.',
    'quests[]: { code, title, description, prerequisiteCodes:[string], unlocksQuestCodes:[string],',
    '  sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  steps:[ { id:string, description:string, objectives:[ { type:"collect"|"talk"|"kill",',
    '    itemId:string, quantity:number } ] } ], rewards:[ { itemId:string, quantity:number } ] }',
    'Produce 3-6 quests forming a small unlock chain (use prerequisiteCodes / unlocksQuestCodes).',
    'Every objective itemId and reward itemId MUST be one of the provided item ids.',
  ].join('\n'),

  dialogues: [
    'STAGE: dialogues. Return ONE JSON object: { "dialogues": [...] }.',
    'dialogues[]: { code, order:number, speaker:string, text:string, mood:string }',
    'Create one dialogue group (a shared code with incrementing order 0,1,2,...) for each provided',
    'quest, plus one or two NPC greeting groups. Make the text reflect each quest theme.',
  ].join('\n'),

  actions: [
    'STAGE: actions. Return ONE JSON object: { "actions": [...] }.',
    'actions[]: { code, label, dialogCode, sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  questDialogueCodes:[ { questCode, dialogCode } ], shopItems:[ { itemId, priceItemId, priceQty } ],',
    '  craftRecipes:[ { outputItems:[ { itemId, qty } ], ingredients:[ { itemId, qty } ] } ],',
    '  storageSlots:number }',
    'Produce 2-4 actions. Each questDialogueCodes[].questCode MUST be a provided quest code;',
    'dialogCode and questDialogueCodes[].dialogCode MUST be a provided dialogue code; every itemId',
    '(shop and craft) MUST be a provided item id.',
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
 * Build the user message for a stage: the theme plus a compact JSON context of
 * the canonical references produced by previous stages.
 * @param {string} theme
 * @param {Object} [context]
 * @returns {string}
 */
function buildStageUser(theme, context) {
  const lines = [`Theme seed: ${theme}`];
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
 * Normalize a raw model payload into model-ready documents, enforcing the
 * text-only architectural boundary (spatial + render fields nulled).
 *
 * @param {Object} raw - Parsed Gemini JSON.
 * @param {Object} params
 * @param {string} params.theme - Original prompt seed (used to derive a saga code fallback).
 * @returns {{ saga: Object, quests: Object[], dialogues: Object[], actions: Object[], objectLayers: Object[] }}
 */
function normalizeSagaPayload(raw, { theme }) {
  const rawSaga = raw.saga || {};

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

  const itemIds = objectLayers.map((ol) => ol.item.id).filter(Boolean);
  const questCodes = quests.map((q) => q.code).filter(Boolean);

  const saga = {
    code: slugify(rawSaga.code) || slugify(theme) || `cyberia-saga-${Date.now()}`,
    name: rawSaga.name || theme,
    description: rawSaga.description || '',
    mapCodes: asArray(rawSaga.mapCodes).map(slugify).filter(Boolean),
    itemIds: [...new Set([...asArray(rawSaga.itemIds).map(slugify), ...itemIds])].filter(Boolean),
    questCodes: [...new Set([...asArray(rawSaga.questCodes).map(slugify), ...questCodes])].filter(Boolean),
  };

  return { saga, quests, dialogues, actions, objectLayers };
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
 * @param {Object} params.models - { CyberiaSaga, CyberiaQuest, CyberiaDialogue, CyberiaAction, ObjectLayer? }.
 * @returns {Promise<{ saga: number, quests: number, dialogues: number, actions: number, objectLayers: number }>}
 */
async function persistSagaPayload({ payload, models }) {
  const { CyberiaSaga, CyberiaQuest, CyberiaDialogue, CyberiaAction, ObjectLayer } = models;
  const { saga, quests, dialogues, actions, objectLayers } = payload;

  await CyberiaSaga.findOneAndUpdate({ code: saga.code }, { $set: saga }, { upsert: true });

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
    quests: quests.length,
    dialogues: dialogues.length,
    actions: actions.length,
    objectLayers: objectLayerCount,
  };
}

/**
 * Generate the raw five-section ecosystem in four bounded, sequential stages.
 * Each stage produces one layer and feeds canonical (slugified) references into
 * the next, so no single model call has to emit the whole cross-referenced graph.
 *
 * @async
 * @param {GeminiClient} client
 * @param {string} theme
 * @param {string} [thinkingLevel]
 * @returns {Promise<{ saga, quests, dialogues, actions, objectLayers }>}
 */
async function generateRawEcosystem(client, theme, thinkingLevel) {
  // Stage 1 — saga identity + object-layer items (the economic foundation).
  logger.info('Stage 1/4: foundation (saga + object layers)');
  const foundation = await client.chatJson({
    system: buildStagePrompt('foundation'),
    user: buildStageUser(theme),
    thinkingLevel,
  });
  const saga = foundation.saga || {};
  const objectLayers = asArray(foundation.objectLayers);
  const itemIds = objectLayers.map((ol) => slugify(ol.item?.id)).filter(Boolean);

  // Stage 2 — quests referencing the canonical item ids.
  logger.info('Stage 2/4: quests');
  const questsRes = await client.chatJson({
    system: buildStagePrompt('quests'),
    user: buildStageUser(theme, { itemIds }),
    thinkingLevel,
  });
  const quests = asArray(questsRes.quests);
  const questCodes = quests.map((q) => slugify(q.code)).filter(Boolean);

  // Stage 3 — dialogues for each quest.
  logger.info('Stage 3/4: dialogues');
  const dialoguesRes = await client.chatJson({
    system: buildStagePrompt('dialogues'),
    user: buildStageUser(theme, {
      quests: quests.map((q) => ({ code: slugify(q.code), title: q.title || '' })),
    }),
    thinkingLevel,
  });
  const dialogues = asArray(dialoguesRes.dialogues);
  const dialogueCodes = [...new Set(dialogues.map((d) => slugify(d.code)).filter(Boolean))];

  // Stage 4 — actions binding quests, dialogues, and items together.
  logger.info('Stage 4/4: actions');
  const actionsRes = await client.chatJson({
    system: buildStagePrompt('actions'),
    user: buildStageUser(theme, { questCodes, dialogueCodes, itemIds }),
    thinkingLevel,
  });
  const actions = asArray(actionsRes.actions);

  return { saga, quests, dialogues, actions, objectLayers };
}

/**
 * Full Top-Down PCG pipeline: prompt → staged Gemini JSON → normalize → persist.
 *
 * @async
 * @param {Object} params
 * @param {string} params.prompt - High-level natural-language theme seed.
 * @param {Object} params.models - Loaded Mongoose models (see {@link persistSagaPayload}).
 * @param {string} [params.model] - Gemini model id override.
 * @param {string} [params.apiKey] - Gemini API key override.
 * @param {number} [params.timeout] - Per-request timeout in ms.
 * @param {string} [params.thinkingLevel] - Gemini thinking level (default in client).
 * @param {boolean} [params.dryRun=false] - Skip persistence; only generate + return.
 * @param {string} [params.out] - Optional file path to dump the normalized payload JSON.
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function generateSaga({ prompt, models, model, apiKey, timeout, thinkingLevel, dryRun = false, out }) {
  if (!prompt) throw new Error('A --prompt theme is required.');

  const client = new GeminiClient({ apiKey, model, timeout });
  logger.info(`Generating saga ontology from theme: "${prompt}"`);

  const raw = await generateRawEcosystem(client, prompt, thinkingLevel);
  const payload = normalizeSagaPayload(raw, { theme: prompt });

  return finalizeSaga({ payload, models, out, dryRun });
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
    `Normalized: saga=${payload.saga.code} quests=${payload.quests.length} ` +
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
    `Persisted: ${summary.saga} saga, ${summary.quests} quests, ` +
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
  persistSagaPayload,
  persistObjectLayers,
  buildStagePrompt,
  buildStageUser,
  slugify,
};
