/**
 * Saga synchronization: completes the links of a stored saga from the stored maps and dialogues.
 *
 * A quest or an action of a saga takes the map and the cell of its provider: the first entity of
 * the linked map, or else of a saga map, that carries the provider skin. An action takes the
 * default dialogue of its provider and the talk dialogue of each quest that provider gives, when
 * those dialogues are stored. A skill of a saga item is checked: its trigger and each summoned item
 * need a runnable binding. Data that is not stored yet is omitted, never guessed.
 *
 * Quests and actions name items by item id; the catalog says which definition each one runs. A
 * quest or an action that names an item that cannot run (see `catalog-consistency.js`) stays
 * where it is.
 *
 * Each link gets one outcome: `assigned` (set, or set on apply), `kept` (already set), `failed`
 * (a stored reference is broken, an item it names cannot run, or the write failed) or `omitted`
 * (the data it needs is not stored).
 *
 * @module src/projects/cyberia/saga/saga-sync.js
 * @namespace CyberiaSagaSync
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { revisionGuard } from '../../../server/storage/revision.js';
import { collectInstanceItemIds } from '../../../api/cyberia-instance/cyberia-instance-items.js';
import { WORLD_ERRORS, bindingProblems } from '../catalog/catalog-consistency.js';

export const SYNC_OUTCOMES = Object.freeze(['assigned', 'kept', 'failed', 'omitted']);

const defaultDialogue = (skinItemId) => `default-${skinItemId}`;
const questTalkDialogue = (questCode) => `quest-talk-${questCode}`;
const summonedOf = (skill) =>
  skill.skills.map(({ summonedEntityItemId }) => summonedEntityItemId).filter((id) => id && !id.startsWith('$'));

/**
 * The cell of the provider of a link: on the linked map, or else on the first saga map that has it.
 * @returns {{mapCode:string,x:number,y:number,count:number}|{reason:string}}
 */
function providerCell(mapsByCode, saga, { providerSkinItemId, mapCode }) {
  for (const code of mapCode ? [mapCode] : saga.mapCodes) {
    const providers = (mapsByCode.get(code)?.entities ?? []).filter(({ objectLayerItemIds = [] }) =>
      objectLayerItemIds.includes(providerSkinItemId),
    );
    if (providers.length > 0)
      return { mapCode: code, x: providers[0].initCellX, y: providers[0].initCellY, count: providers.length };
  }
  if (!mapCode) return { reason: `no saga map has an entity with ${providerSkinItemId}` };
  if (!mapsByCode.has(mapCode)) return { reason: `map ${mapCode} is not stored` };
  return { reason: `no entity of map ${mapCode} has ${providerSkinItemId}` };
}

/**
 * Synchronizes a stored saga, or previews the synchronization.
 * @param {Object} params
 * @param {import('../../../api/types.js').RouterOptions} params.options
 * @param {string} params.code - The saga code.
 * @param {boolean} [params.apply=false] - Write the assignments. Without it, nothing is written.
 * @returns {Promise<{saga:{code:string,name:string},applied:boolean,counts:Object<string,number>,entries:Array<{kind:string,code:string,outcome:string,detail:string,actionCode?:string}>}>}
 *   `code` is the quest, action or dialogue code, or the trigger item of a skill. A dialogue entry
 *   names the `actionCode` it links to.
 * @throws {Error} 404 when no saga has the code.
 * @memberof CyberiaSagaSync
 */
export async function syncSaga({ options, code, apply = false }) {
  const model = (name) => DataBaseProviderService.getModel(name, options);
  const saga = await model('CyberiaSaga').findOne({ code }).lean();
  if (!saga) throw Object.assign(new Error(`Saga ${code} is not stored`), { status: 404 });
  const questLinks = saga.questCodes;
  const actionLinks = saga.actionCodes;
  const mapCodes = [...new Set([...saga.mapCodes, ...[...questLinks, ...actionLinks].map((link) => link.mapCode)])];
  const [maps, quests, actions, dialogueCodes, skills] = await Promise.all([
    model('CyberiaMap')
      .find({ code: { $in: mapCodes.filter(Boolean) } }, { code: 1, entities: 1 })
      .lean(),
    model('CyberiaQuest')
      .find({ code: { $in: questLinks.map(({ questCode }) => questCode) } })
      .lean(),
    model('CyberiaAction')
      .find({ code: { $in: actionLinks.map(({ actionCode }) => actionCode) } })
      .lean(),
    model('CyberiaDialogue').distinct('code'),
    model('CyberiaSkill')
      .find({ triggerItemId: { $in: saga.itemIds } })
      .lean(),
  ]);
  const mapsByCode = new Map(maps.map((map) => [map.code, map]));
  const dialogues = new Set(dialogueCodes);
  const entries = [];
  const writes = [];
  const record = (kind, entryCode, outcome, detail, extra = {}) => {
    const entry = { kind, code: entryCode, outcome, detail, ...extra };
    entries.push(entry);
    return entry;
  };

  const linked = (kind, documents, links, codeOf) => {
    const byCode = new Map(documents.map((document) => [document.code, document]));
    return links.map((link) => {
      const document = byCode.get(codeOf(link));
      if (!document)
        return {
          kind,
          code: codeOf(link),
          outcome: 'failed',
          detail: `the saga links it, but the ${kind} is not stored`,
        };
      const cell = providerCell(mapsByCode, saga, link);
      if (cell.reason) return { kind, code: document.code, outcome: 'omitted', detail: cell.reason };
      const detail = `${link.providerSkinItemId} at ${cell.mapCode} (${cell.x}, ${cell.y})${cell.count > 1 ? `, first of ${cell.count}` : ''}`;
      return { kind, document, cell, detail };
    });
  };
  const links = [
    ...linked('quest', quests, questLinks, ({ questCode }) => questCode),
    ...linked('action', actions, actionLinks, ({ actionCode }) => actionCode),
  ];
  const itemsOf = ({ kind, document }) => [
    ...collectInstanceItemIds(kind === 'quest' ? { quests: [document] } : { actions: [document] }),
  ];
  const problems = await bindingProblems(
    {
      CyberiaItemCatalog: model('CyberiaItemCatalog'),
      ObjectLayer: model('ObjectLayer'),
      AtlasSpriteSheet: model('AtlasSpriteSheet'),
    },
    new Set([
      ...links.filter(({ cell }) => cell).flatMap(itemsOf),
      ...skills.flatMap((skill) => [skill.triggerItemId, ...summonedOf(skill)]),
    ]),
  );
  /** The items of a list that cannot run, as `itemId (problem)`. */
  const blocked = (itemIds) =>
    itemIds
      .filter((itemId) => WORLD_ERRORS.includes(problems.get(itemId)?.problem))
      .map((itemId) => `${itemId} (${problems.get(itemId).problem})`);
  const Models = { quest: model('CyberiaQuest'), action: model('CyberiaAction') };
  for (const link of links) {
    if (!link.cell) {
      record(link.kind, link.code, link.outcome, link.detail);
      continue;
    }
    const { kind, document, cell, detail } = link;
    const kept =
      document.sourceMapCode === cell.mapCode && document.sourceCellX === cell.x && document.sourceCellY === cell.y;
    const cannotRun = blocked(itemsOf(link));
    if (cannotRun.length > 0) {
      record(
        kind,
        document.code,
        'failed',
        `${kept ? 'placed' : 'not placed'}; items that cannot run: ${cannotRun.join(', ')}`,
      );
      continue;
    }
    if (kept) {
      record(kind, document.code, 'kept', detail);
      continue;
    }
    writes.push({
      entries: [record(kind, document.code, 'assigned', detail)],
      run: () =>
        Models[kind].updateOne(
          { _id: document._id },
          { $set: { sourceMapCode: cell.mapCode, sourceCellX: cell.x, sourceCellY: cell.y } },
        ),
    });
  }

  const actionsByCode = new Map(actions.map((action) => [action.code, action]));
  for (const { actionCode, providerSkinItemId } of actionLinks) {
    const action = actionsByCode.get(actionCode);
    if (!action) continue;
    const set = {};
    const assigned = [];
    const owner = { actionCode: action.code };
    const linkDialogue = ({ dialogCode, linked, role, assign }) => {
      if (!dialogues.has(dialogCode))
        record('dialogue', dialogCode, linked ? 'failed' : 'omitted', `${role}; the dialogue is not stored`, owner);
      else if (linked) record('dialogue', dialogCode, 'kept', role, owner);
      else {
        assigned.push(record('dialogue', dialogCode, 'assigned', role, owner));
        assign();
      }
    };
    linkDialogue({
      dialogCode: action.dialogCode || defaultDialogue(providerSkinItemId),
      linked: Boolean(action.dialogCode),
      role: `default dialogue of action ${action.code}`,
      assign: () => (set.dialogCode = defaultDialogue(providerSkinItemId)),
    });
    const questDialogueCodes = [...action.questDialogueCodes];
    for (const { questCode } of questLinks.filter((link) => link.providerSkinItemId === providerSkinItemId)) {
      const linked = questDialogueCodes.find((entry) => entry.questCode === questCode);
      linkDialogue({
        dialogCode: linked?.dialogCode ?? questTalkDialogue(questCode),
        linked: Boolean(linked),
        role: `talk of quest ${questCode} on action ${action.code}`,
        assign: () => {
          questDialogueCodes.push({ questCode, dialogCode: questTalkDialogue(questCode) });
          set.questDialogueCodes = questDialogueCodes;
        },
      });
    }
    if (assigned.length > 0)
      writes.push({
        entries: assigned,
        run: async () => {
          const { filter, next } = revisionGuard(action);
          const { matchedCount } = await model('CyberiaAction').updateOne(filter, { $set: { ...set, revision: next } });
          if (matchedCount === 0) throw new Error(`action ${action.code} changed during the sync: run it again`);
        },
      });
  }

  for (const skill of skills) {
    const cannotRun = blocked([skill.triggerItemId, ...summonedOf(skill)]);
    if (cannotRun.length > 0)
      record('skill', skill.triggerItemId, 'failed', `items that cannot run: ${cannotRun.join(', ')}`);
    else record('skill', skill.triggerItemId, 'kept', `fires ${skill.logicEventIds.join(', ') || 'no logic event'}`);
  }

  if (apply)
    for (const write of writes)
      await write.run().catch((error) => {
        for (const entry of write.entries) Object.assign(entry, { outcome: 'failed', detail: error.message });
      });
  return {
    saga: { code: saga.code, name: saga.name },
    applied: apply,
    counts: Object.fromEntries(
      SYNC_OUTCOMES.map((outcome) => [outcome, entries.filter((entry) => entry.outcome === outcome).length]),
    ),
    entries,
  };
}
