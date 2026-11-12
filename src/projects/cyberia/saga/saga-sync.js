/**
 * Saga synchronization: completes the links of a saga from the stored maps and dialogues.
 *
 * A quest or an action of a saga takes the cell of its provider: an entity that carries the provider
 * skin, on the linked map, or else on any stored map. One candidate cell is proposed; several wait for
 * a moderator choice, and a choice names the map revision it saw. The document keeps a placement that
 * is still a candidate. A quest or an action that several sagas link has one provider: a saga that
 * links it to another skin or map conflicts, and a conflict refuses the synchronization.
 *
 * An action takes the default dialogue of its provider and the talk dialogue of each quest that
 * provider gives, when those dialogues are stored. A skill of a saga item is checked: its trigger and
 * each summoned item need a runnable binding. Data that is not stored yet is omitted, never guessed.
 * Quests and actions name items by item id; a quest or an action that names an item that cannot run
 * (see `catalog-consistency.js`) stays where it is.
 *
 * All the fields one document takes are one write, guarded by the revision the plan read. An apply
 * names the revisions its moderator reviewed: a document or a map that changed since refuses the apply
 * with 409. A synchronization of an unchanged state writes nothing.
 *
 * Each link gets one outcome: `assigned` (set, or set on apply), `kept` (already set), `choose`
 * (several providers match), `conflict` (another saga links the document to another provider),
 * `failed` (a stored reference is broken, an item it names cannot run, or the write failed) or
 * `omitted` (the data it needs is not stored).
 *
 * @module src/projects/cyberia/saga/saga-sync.js
 * @namespace CyberiaSagaSync
 */
import { DataBaseProviderService } from '../../../db/database-provider.js';
import { revisionGuard } from '../../../server/storage/revision.js';
import { collectInstanceItemIds } from '../../../api/cyberia-instance/cyberia-instance-items.js';
import {
  ITEM_DIALOGUE_PREFIX,
  questTalkDialogueCode,
} from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { WORLD_ERRORS, bindingProblems } from '../catalog/catalog-consistency.js';

export const SYNC_OUTCOMES = Object.freeze(['assigned', 'kept', 'choose', 'conflict', 'failed', 'omitted']);

const httpError = (status, message) => Object.assign(new Error(message), { status, expected: true });
const summonedOf = (skill) =>
  skill.skills.map(({ summonedEntityItemId }) => summonedEntityItemId).filter((id) => id && !id.startsWith('$'));
const sameCell = (a, b) => a?.mapCode === b?.mapCode && a?.cellX === b?.cellX && a?.cellY === b?.cellY;
const cellText = ({ mapCode, cellX, cellY }) => `${mapCode} (${cellX}, ${cellY})`;

/**
 * The models a synchronization reads and writes.
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @returns {Object<string,import('mongoose').Model>}
 * @memberof CyberiaSagaSync
 */
export const syncModels = (options) =>
  Object.fromEntries(
    [
      'CyberiaSaga',
      'CyberiaMap',
      'CyberiaQuest',
      'CyberiaAction',
      'CyberiaDialogue',
      'CyberiaSkill',
      'CyberiaItemCatalog',
      'ObjectLayer',
      'AtlasSpriteSheet',
    ].map((name) => [name, DataBaseProviderService.getModel(name, options)]),
  );

/**
 * The quest and action links of a saga, one shape for both.
 * @param {Object} saga - A saga record.
 * @returns {Array<{kind:'quest'|'action', code:string, skin:string, mapCode:string}>}
 * @memberof CyberiaSagaSync
 */
export const linksOf = (saga) => [
  ...(saga.questCodes ?? []).map(({ questCode, providerSkinItemId, mapCode = '' }) => ({
    kind: 'quest',
    code: questCode,
    skin: providerSkinItemId,
    mapCode,
  })),
  ...(saga.actionCodes ?? []).map(({ actionCode, providerSkinItemId, mapCode = '' }) => ({
    kind: 'action',
    code: actionCode,
    skin: providerSkinItemId,
    mapCode,
  })),
];

/**
 * The cells a link may take: each distinct cell of an entity that carries the provider skin, on the
 * linked map, or else on any stored map, the saga maps first.
 * @returns {{candidates:Array<{mapCode:string,cellX:number,cellY:number,mapRevision:number}>, reason:string}}
 */
function candidatesOf(link, maps, sagaMaps) {
  const holding = (map) =>
    (map.entities ?? []).filter(({ objectLayerItemIds = [] }) => objectLayerItemIds.includes(link.skin));
  const searched = link.mapCode
    ? maps.filter(({ code }) => code === link.mapCode)
    : maps
        .filter((map) => holding(map).length > 0)
        .sort((a, b) => Number(!sagaMaps.has(a.code)) - Number(!sagaMaps.has(b.code)) || a.code.localeCompare(b.code));
  const candidates = [];
  for (const map of searched)
    for (const { initCellX: cellX, initCellY: cellY } of holding(map)) {
      const cell = { mapCode: map.code, cellX, cellY, mapRevision: map.revision ?? 1 };
      if (!candidates.some((other) => sameCell(other, cell))) candidates.push(cell);
    }
  const reason =
    candidates.length > 0
      ? ''
      : !link.mapCode
        ? `no stored map has an entity with ${link.skin}`
        : searched.length === 0
          ? `map ${link.mapCode} is not stored`
          : `no entity of map ${link.mapCode} has ${link.skin}`;
  return { candidates, reason };
}

/** The other sagas that link the same document to another provider skin or map. */
function conflictsOf(link, others, mapCode) {
  const conflicts = [];
  for (const other of others)
    for (const theirs of linksOf(other).filter(({ kind, code }) => kind === link.kind && code === link.code)) {
      const map = mapCode || link.mapCode;
      if (theirs.skin !== link.skin || (theirs.mapCode && map && theirs.mapCode !== map))
        conflicts.push({ saga: other.code, providerSkinItemId: theirs.skin, mapCode: theirs.mapCode });
    }
  return conflicts;
}

/**
 * Plans the synchronization of a saga record: one outcome per link, and the writes an apply makes.
 * @param {Object} params
 * @param {Object<string,import('mongoose').Model>} params.models - {@link syncModels}.
 * @param {Object} params.saga - A saga record: `code`, `name`, `mapCodes`, `itemIds`, `questCodes`, `actionCodes`.
 * @param {Array<{kind:string,code:string,mapCode:string,cellX:number,cellY:number,mapRevision:number}>} [params.selections]
 *   The provider cells a moderator chose.
 * @returns {Promise<{entries:Object[], writes:Object[], reviewed:Object<string,number>}>} `reviewed` holds the
 *   revision of each document and map the plan read, by `<kind>:<code>`.
 * @memberof CyberiaSagaSync
 */
export async function planSync({ models, saga, selections = [] }) {
  const links = linksOf(saga);
  const skins = [...new Set(links.map(({ skin }) => skin))];
  const linkedMaps = [...new Set(links.map(({ mapCode }) => mapCode).filter(Boolean))];
  const codesOf = (kind) => links.filter((link) => link.kind === kind).map(({ code }) => code);
  const [maps, quests, actions, skills, others] = await Promise.all([
    models.CyberiaMap.find(
      { $or: [{ code: { $in: linkedMaps } }, { 'entities.objectLayerItemIds': { $in: skins } }] },
      { code: 1, revision: 1, 'entities.objectLayerItemIds': 1, 'entities.initCellX': 1, 'entities.initCellY': 1 },
    ).lean(),
    models.CyberiaQuest.find({ code: { $in: codesOf('quest') } }).lean(),
    models.CyberiaAction.find({ code: { $in: codesOf('action') } }).lean(),
    models.CyberiaSkill.find({ triggerItemId: { $in: saga.itemIds ?? [] } }).lean(),
    models.CyberiaSaga.find(
      {
        code: { $ne: saga.code },
        $or: [
          { 'questCodes.questCode': { $in: codesOf('quest') } },
          { 'actionCodes.actionCode': { $in: codesOf('action') } },
        ],
      },
      { code: 1, questCodes: 1, actionCodes: 1 },
    ).lean(),
  ]);
  const documents = {
    quest: new Map(quests.map((doc) => [doc.code, doc])),
    action: new Map(actions.map((doc) => [doc.code, doc])),
  };
  const dialogueCodes = new Set(
    await models.CyberiaDialogue.distinct('code', {
      code: {
        $in: [
          ...links.filter(({ kind }) => kind === 'action').map(({ skin }) => `${ITEM_DIALOGUE_PREFIX}${skin}`),
          ...codesOf('quest').map(questTalkDialogueCode),
          ...actions.flatMap(({ dialogCode, questDialogueCodes = [] }) => [
            dialogCode,
            ...questDialogueCodes.map((entry) => entry.dialogCode),
          ]),
        ].filter(Boolean),
      },
    }),
  );
  const sagaMaps = new Set(saga.mapCodes ?? []);
  const reviewed = Object.fromEntries([
    ...maps.map(({ code, revision = 1 }) => [`map:${code}`, revision]),
    ...quests.map(({ code, revision = 1 }) => [`quest:${code}`, revision]),
    ...actions.map(({ code, revision = 1 }) => [`action:${code}`, revision]),
  ]);
  const entries = [];
  const writes = new Map();
  const record = (entry) => (entries.push(entry), entry);
  const writeOf = (kind, document) => {
    const key = `${kind}:${document.code}`;
    if (!writes.has(key)) writes.set(key, { key, kind, document, set: {}, entries: [], maps: [] });
    return writes.get(key);
  };

  const resolved = links.map((link) => {
    const document = documents[link.kind].get(link.code);
    if (!document) return { link, outcome: 'failed', detail: `the saga links it, but the ${link.kind} is not stored` };
    const { candidates, reason } = candidatesOf(link, maps, sagaMaps);
    const selection = selections.find(({ kind, code }) => kind === link.kind && code === link.code);
    const placed = { mapCode: document.sourceMapCode, cellX: document.sourceCellX, cellY: document.sourceCellY };
    const view = { link, document, candidates };
    if (selection) {
      const match = candidates.find((cell) => sameCell(cell, selection));
      if (!match || (selection.mapRevision !== undefined && selection.mapRevision !== match.mapRevision))
        return {
          ...view,
          outcome: 'choose',
          stale: true,
          detail: `the chosen cell ${cellText(selection)} changed: choose again`,
        };
      return { ...view, chosen: match };
    }
    if (candidates.length === 0) return { ...view, outcome: 'omitted', detail: reason };
    const kept = candidates.find((cell) => sameCell(cell, placed));
    if (kept) return { ...view, chosen: kept };
    if (candidates.length === 1) return { ...view, chosen: candidates[0] };
    return {
      ...view,
      outcome: 'choose',
      detail: `${candidates.length} entities carry ${link.skin}: choose the provider`,
    };
  });

  const itemsOf = ({ link, document }) => [
    ...collectInstanceItemIds(link.kind === 'quest' ? { quests: [document] } : { actions: [document] }),
  ];
  const problems = await bindingProblems(
    models,
    new Set([
      ...resolved.filter(({ chosen }) => chosen).flatMap(itemsOf),
      ...skills.flatMap((skill) => [skill.triggerItemId, ...summonedOf(skill)]),
    ]),
  );
  /** The items of a list that cannot run, as `itemId (problem)`. */
  const blocked = (itemIds) =>
    itemIds
      .filter((itemId) => WORLD_ERRORS.includes(problems.get(itemId)?.problem))
      .map((itemId) => `${itemId} (${problems.get(itemId).problem})`);

  for (const entry of resolved) {
    const { link, document, candidates, chosen } = entry;
    const base = { kind: link.kind, code: link.code, ...(document && { revision: document.revision ?? 1 }) };
    const conflicts = document ? conflictsOf(link, others, chosen?.mapCode) : [];
    if (conflicts.length > 0) {
      record({
        ...base,
        outcome: 'conflict',
        detail: `another saga links it to another provider: ${conflicts.map(({ saga: code, providerSkinItemId, mapCode }) => `${code} (${providerSkinItemId}${mapCode ? ` on ${mapCode}` : ''})`).join(', ')}`,
        conflicts,
        candidates: candidates ?? [],
      });
      continue;
    }
    if (!chosen) {
      record({
        ...base,
        outcome: entry.outcome,
        detail: entry.detail,
        candidates: candidates ?? [],
        stale: !!entry.stale,
      });
      continue;
    }
    const kept =
      document.sourceMapCode === chosen.mapCode &&
      document.sourceCellX === chosen.cellX &&
      document.sourceCellY === chosen.cellY;
    const cannotRun = blocked(itemsOf(entry));
    if (cannotRun.length > 0) {
      record({
        ...base,
        outcome: 'failed',
        detail: `${kept ? 'placed' : 'not placed'}; items that cannot run: ${cannotRun.join(', ')}`,
        candidates,
        chosen,
      });
      continue;
    }
    const detail = `${link.skin} at ${cellText(chosen)}`;
    if (kept) {
      record({ ...base, outcome: 'kept', detail, candidates, chosen });
      continue;
    }
    const write = writeOf(link.kind, document);
    Object.assign(write.set, { sourceMapCode: chosen.mapCode, sourceCellX: chosen.cellX, sourceCellY: chosen.cellY });
    write.maps.push(`map:${chosen.mapCode}`);
    write.entries.push(record({ ...base, outcome: 'assigned', detail, candidates, chosen }));
  }

  for (const { kind, code, skin } of links.filter((link) => link.kind === 'action')) {
    const action = documents.action.get(code);
    if (!action) continue;
    const owner = { actionCode: action.code };
    const questDialogueCodes = [...(action.questDialogueCodes ?? [])];
    const linkDialogue = ({ dialogCode, linked, role, assign }) => {
      if (!dialogueCodes.has(dialogCode))
        record({
          kind: 'dialogue',
          code: dialogCode,
          outcome: linked ? 'failed' : 'omitted',
          detail: `${role}; the dialogue is not stored`,
          ...owner,
        });
      else if (linked) record({ kind: 'dialogue', code: dialogCode, outcome: 'kept', detail: role, ...owner });
      else {
        const write = writeOf(kind, action);
        write.entries.push(record({ kind: 'dialogue', code: dialogCode, outcome: 'assigned', detail: role, ...owner }));
        assign(write.set);
      }
    };
    linkDialogue({
      dialogCode: action.dialogCode || `${ITEM_DIALOGUE_PREFIX}${skin}`,
      linked: Boolean(action.dialogCode),
      role: `default dialogue of action ${action.code}`,
      assign: (set) => (set.dialogCode = `${ITEM_DIALOGUE_PREFIX}${skin}`),
    });
    for (const quest of links.filter((link) => link.kind === 'quest' && link.skin === skin)) {
      const linked = questDialogueCodes.find((entry) => entry.questCode === quest.code);
      linkDialogue({
        dialogCode: linked?.dialogCode ?? questTalkDialogueCode(quest.code),
        linked: Boolean(linked),
        role: `talk of quest ${quest.code} on action ${action.code}`,
        assign: (set) => {
          questDialogueCodes.push({ questCode: quest.code, dialogCode: questTalkDialogueCode(quest.code) });
          set.questDialogueCodes = questDialogueCodes;
        },
      });
    }
  }

  for (const skill of skills) {
    const cannotRun = blocked([skill.triggerItemId, ...summonedOf(skill)]);
    if (cannotRun.length > 0)
      record({
        kind: 'skill',
        code: skill.triggerItemId,
        outcome: 'failed',
        detail: `items that cannot run: ${cannotRun.join(', ')}`,
      });
    else
      record({
        kind: 'skill',
        code: skill.triggerItemId,
        outcome: 'kept',
        detail: `fires ${skill.logicEventIds.join(', ') || 'no logic event'}`,
      });
  }
  return { entries, writes: [...writes.values()], reviewed };
}

/**
 * Applies the writes of a plan: one revision-guarded update per document. A document that changed
 * since the plan read it fails its entries instead.
 */
async function applyWrites(models, writes) {
  const Models = { quest: models.CyberiaQuest, action: models.CyberiaAction };
  for (const { kind, document, set, entries } of writes) {
    const { filter, next } = revisionGuard(document);
    const { matchedCount } = await Models[kind].updateOne(filter, { $set: { ...set, revision: next } });
    if (matchedCount === 0)
      for (const entry of entries)
        Object.assign(entry, {
          outcome: 'failed',
          detail: `${kind} ${document.code} changed during the sync: check it again`,
        });
  }
}

/**
 * Synchronizes a stored saga, or previews the synchronization.
 * @param {Object} params
 * @param {import('../../../api/types.js').ApiRouterContext} params.options
 * @param {string} params.code - The saga code.
 * @param {boolean} [params.apply=false] - Write the assignments. Without it, nothing is written.
 * @param {Object[]} [params.selections] - The provider cells a moderator chose: {@link planSync}.
 * @param {Object<string,number>|null} [params.reviewed] - The revisions of the preview the moderator
 *   reviewed, by `<kind>:<code>`.
 * @returns {Promise<{saga:{code:string,name:string},applied:boolean,counts:Object<string,number>,entries:Object[],reviewed:Object<string,number>}>}
 *   `code` is the quest, action or dialogue code, or the trigger item of a skill. A dialogue entry
 *   names the `actionCode` it links to; a quest or action entry names its `candidates`, the `chosen`
 *   cell and any `conflicts`.
 * @throws {Error} 404 when no saga has the code; 409 on apply when a link conflicts, a choice is
 *   stale, or a reviewed document or map changed.
 * @memberof CyberiaSagaSync
 */
export async function syncSaga({ options, code, apply = false, selections = [], reviewed = null }) {
  const models = syncModels(options);
  const saga = await models.CyberiaSaga.findOne({ code }).lean();
  if (!saga) throw httpError(404, `Saga ${code} is not stored`);
  const plan = await planSync({ models, saga, selections });
  if (apply) {
    const conflicts = plan.entries.filter(({ outcome }) => outcome === 'conflict');
    if (conflicts.length > 0)
      throw httpError(
        409,
        `Resolve the provider conflicts first: ${conflicts.map((entry) => `${entry.kind} ${entry.code}`).join(', ')}`,
      );
    const stale = plan.entries.filter((entry) => entry.stale);
    if (stale.length > 0)
      throw httpError(
        409,
        `A chosen provider changed: ${stale.map((entry) => `${entry.kind} ${entry.code}`).join(', ')}. Check again`,
      );
    const changed = reviewed
      ? plan.writes
          .flatMap((write) => [write.key, ...write.maps])
          .filter((key) => reviewed[key] !== undefined && reviewed[key] !== plan.reviewed[key])
      : [];
    if (changed.length > 0)
      throw httpError(
        409,
        `Changed since the check: ${[...new Set(changed)].join(', ')}. Check again before you synchronize`,
      );
    await applyWrites(models, plan.writes);
  }
  return {
    saga: { code: saga.code, name: saga.name },
    applied: apply,
    counts: Object.fromEntries(
      SYNC_OUTCOMES.map((outcome) => [outcome, plan.entries.filter((entry) => entry.outcome === outcome).length]),
    ),
    entries: plan.entries,
    reviewed: plan.reviewed,
  };
}
