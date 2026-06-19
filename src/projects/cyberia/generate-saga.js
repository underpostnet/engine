/**
 * Top-Down Procedural Generation guided by LLMs (Semantic Reverse-Engineering).
 *
 * Takes a single natural-language theme and asks DeepSeek (JSON mode) to infer
 * the complete non-spatial textual backbone of a CyberiaSaga ecosystem: saga
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
import { DeepSeekClient } from './deepseek-client.js';
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
 * Strict system prompt describing the unified JSON ontology DeepSeek must emit.
 * @returns {string}
 */
function buildSagaSystemPrompt() {
  return [
    'You are a senior narrative systems designer for a top-down cyberpunk MMO called Cyberia.',
    'You perform SEMANTIC REVERSE-ENGINEERING: from one high-level theme you infer the entire',
    'non-spatial textual ontology of a self-consistent game saga BEFORE any map or art exists.',
    '',
    'Return ONE JSON object (response_format json_object) with EXACTLY these top-level keys:',
    '"saga", "quests", "dialogues", "actions", "objectLayers".',
    '',
    'HARD RULES:',
    '- TEXT/METADATA ONLY. Never invent spatial or graphic data.',
    '- All spatial fields (sourceMapCode, sourceCellX, sourceCellY, initCellX, initCellY, grid sizes)',
    '  MUST be null. All render/asset fields MUST be null. No CIDs, no textures, no coordinates.',
    '- Every code/id MUST be lowercase kebab-case, unique, and semantically tied to the theme.',
    '- Cross-references MUST resolve: quest objective/reward itemIds, shop itemIds and craft itemIds',
    '  MUST exist in objectLayers[].item.id; action questDialogueCodes[].questCode MUST exist in',
    '  quests[].code; action questDialogueCodes[].dialogCode and action.dialogCode MUST exist in',
    '  dialogues[].code; saga.questCodes/itemIds/mapCodes MUST list every referenced code/id.',
    '',
    'SHAPES:',
    'saga: { code, name, description, mapCodes:[string], itemIds:[string], questCodes:[string] }',
    'quests[]: { code, title, description, prerequisiteCodes:[string], unlocksQuestCodes:[string],',
    '  sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  steps:[ { id:string, description:string, objectives:[ { type:"collect"|"talk"|"kill",',
    '    itemId:string, quantity:number } ] } ], rewards:[ { itemId:string, quantity:number } ] }',
    'dialogues[]: { code, order:number, speaker:string, text:string, mood:string }',
    'actions[]: { code, label, dialogCode, sourceMapCode:null, sourceCellX:null, sourceCellY:null,',
    '  questDialogueCodes:[ { questCode, dialogCode } ], shopItems:[ { itemId, priceItemId, priceQty } ],',
    '  craftRecipes:[ { outputItems:[ { itemId, qty } ], ingredients:[ { itemId, qty } ] } ],',
    '  storageSlots:number }',
    'objectLayers[]: { stats:{ effect, resistance, agility, range, intelligence, utility },',
    '  item:{ id, type, description, activable }, render:null }',
    '  where item.type is one of: skin, breastplate, weapon, skill, coin, floor, obstacle,',
    '  portal, foreground, resource; and every stat is an integer 0..10 balanced to the lore.',
    '',
    'Aim for a coherent, playable vertical slice: 3-6 quests forming a small unlock chain,',
    'one dialogue group per quest plus NPC greetings, 2-4 actions, and 5-10 object-layer items',
    'including at least one "coin" currency item. Output only the JSON object, no prose.',
  ].join('\n');
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
 * Normalize a raw DeepSeek payload into model-ready documents, enforcing the
 * text-only architectural boundary (spatial + render fields nulled).
 *
 * @param {Object} raw - Parsed DeepSeek JSON.
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
 * Persist the normalized payload into MongoDB via the provided Mongoose models.
 * Upserts by natural key so reruns are idempotent.
 *
 * @async
 * @param {Object} params
 * @param {Object} params.payload - Output of {@link normalizeSagaPayload}.
 * @param {Object} params.models - { CyberiaSaga, CyberiaQuest, CyberiaDialogue, CyberiaAction }.
 * @returns {Promise<{ saga: number, quests: number, dialogues: number, actions: number }>}
 */
async function persistSagaPayload({ payload, models }) {
  const { CyberiaSaga, CyberiaQuest, CyberiaDialogue, CyberiaAction } = models;
  const { saga, quests, dialogues, actions } = payload;

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

  return {
    saga: 1,
    quests: quests.length,
    dialogues: dialogues.length,
    actions: actions.length,
  };
}

/**
 * Full Top-Down PCG pipeline: prompt → DeepSeek JSON → normalize → persist.
 *
 * @async
 * @param {Object} params
 * @param {string} params.prompt - High-level natural-language theme seed.
 * @param {Object} params.models - Loaded Mongoose models (see {@link persistSagaPayload}).
 * @param {string} [params.model] - DeepSeek model id override.
 * @param {string} [params.apiKey] - DeepSeek API key override.
 * @param {boolean} [params.dryRun=false] - Skip persistence; only generate + return.
 * @param {string} [params.out] - Optional file path to dump the normalized payload JSON.
 * @returns {Promise<Object>} The normalized payload (with a `summary` when persisted).
 */
async function generateSaga({ prompt, models, model, apiKey, dryRun = false, out }) {
  if (!prompt) throw new Error('A --prompt theme is required.');

  const client = new DeepSeekClient({ apiKey, model });
  logger.info(`Generating saga ontology from theme: "${prompt}"`);

  const raw = await client.chatJson({
    system: buildSagaSystemPrompt(),
    user: `Theme seed: ${prompt}`,
  });

  const payload = normalizeSagaPayload(raw, { theme: prompt });
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
      `${summary.dialogues} dialogues, ${summary.actions} actions`,
  );

  return { ...payload, summary };
}

export { generateSaga, normalizeSagaPayload, persistSagaPayload, buildSagaSystemPrompt, slugify };
