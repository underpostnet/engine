/**
 * Consistency of the runtime binding. Ordinary content names items by item id, and the catalog
 * alone binds each item to the definition the runtime runs (`object-layer-catalog.js`).
 *
 * {@link checkWorldBindings} reads each world as the game server receives it and reports every
 * item it names that cannot run, before a server loads it. {@link checkCatalogStorage} reports how
 * every bound definition is stored on IPFS. {@link findLegacyPins} finds the CIDs that documents
 * stored before the catalog was the one authority still pin, and {@link repairLegacyPins} reports
 * them and, on request, removes them.
 *
 * @module src/projects/cyberia/catalog/catalog-consistency.js
 * @namespace CyberiaCatalogConsistency
 */
import { objectLayerIpfsState } from '../../../api/object-layer/object-layer.ipfs.js';
import { loadWorld } from '../instance-data.js';

/** Where documents stored before the catalog was the one authority pin a definition. */
const LEGACY_PINS = Object.freeze({
  CyberiaQuest: Object.freeze([
    { path: 'steps[].objectives[]', itemId: 'itemId', cid: 'objectLayerCid' },
    { path: 'rewards[]', itemId: 'itemId', cid: 'objectLayerCid' },
  ]),
  CyberiaAction: Object.freeze([
    { path: 'shopItems[]', itemId: 'itemId', cid: 'objectLayerCid' },
    { path: 'shopItems[]', itemId: 'priceItemId', cid: 'priceObjectLayerCid' },
    { path: 'craftRecipes[].outputItems[]', itemId: 'itemId', cid: 'objectLayerCid' },
    { path: 'craftRecipes[].ingredients[]', itemId: 'itemId', cid: 'objectLayerCid' },
  ]),
});

/**
 * Problems that stop an item from running: unbound, bound to a definition this host does not
 * store, to a draft, to an archived definition, to a render this host holds no atlas of, or
 * pinned by a legacy document. `unrendered` is a warning: the item runs without a render until
 * the Studio paints it.
 * @memberof CyberiaCatalogConsistency
 */
export const WORLD_ERRORS = Object.freeze(['unbound', 'missing', 'draft', 'archived', 'no-atlas', 'legacy-pin']);

/** Every node a path such as `steps[].objectives[]` selects, with its dotted MongoDB path. */
const select = (document, path) => {
  let nodes = [{ node: document, at: '' }];
  for (const segment of path.split('.')) {
    const key = segment.replace('[]', '');
    const next = [];
    for (const { node, at } of nodes) {
      const value = node?.[key];
      const base = at ? `${at}.${key}` : key;
      if (Array.isArray(value)) value.forEach((entry, index) => next.push({ node: entry, at: `${base}.${index}` }));
      else if (value) next.push({ node: value, at: base });
    }
    nodes = next;
  }
  return nodes;
};

/**
 * The legacy pin fields a raw document holds: `fields` every one, empty or not, and `pins` those
 * that name a definition.
 * @param {string} collection
 * @param {Object} document - A raw document.
 * @returns {{fields:string[],pins:Array<{itemId:string,cid:string}>}}
 */
const legacyPinsOf = (collection, document) => {
  const fields = [];
  const pins = [];
  for (const { path, itemId, cid } of LEGACY_PINS[collection])
    for (const { node, at } of select(document, path)) {
      if (!node || !Object.hasOwn(node, cid)) continue;
      fields.push(`${at}.${cid}`);
      if (node[itemId] && node[cid]) pins.push({ itemId: node[itemId], cid: node[cid] });
    }
  return { fields, pins };
};

/**
 * The legacy pins stored documents still hold, and the items they make ambiguous: an item pinned
 * to several definitions, or to another definition than the catalog binds. Reads the raw
 * collections, since the schemas no longer declare the pins.
 * @param {Object} models - Served models: `CyberiaQuest`, `CyberiaAction`, `CyberiaItemCatalog`.
 * @returns {Promise<{documents:Array<{collection:string,code:string,_id:*,fields:string[],pins:Array}>,conflicts:Array<{itemId:string,activeCid:string,cids:Array<{cid:string,documents:string[]}>}>}>}
 * @memberof CyberiaCatalogConsistency
 */
export async function findLegacyPins(models) {
  const documents = [];
  const pinned = new Map();
  for (const [collection, references] of Object.entries(LEGACY_PINS)) {
    const Model = models[collection];
    if (!Model) continue;
    const filter = {
      $or: references.map(({ path, cid }) => ({ [`${path.replaceAll('[]', '')}.${cid}`]: { $exists: true } })),
    };
    for (const document of await Model.collection.find(filter).toArray()) {
      const { fields, pins } = legacyPinsOf(collection, document);
      if (fields.length === 0) continue;
      documents.push({ collection, code: document.code, _id: document._id, fields, pins });
      for (const { itemId, cid } of pins) {
        if (!pinned.has(itemId)) pinned.set(itemId, new Map());
        if (!pinned.get(itemId).has(cid)) pinned.get(itemId).set(cid, new Set());
        pinned.get(itemId).get(cid).add(`${collection} ${document.code}`);
      }
    }
  }
  const active = await models.CyberiaItemCatalog.resolve([...pinned.keys()]);
  const conflicts = [...pinned]
    .filter(([itemId, cids]) => cids.size > 1 || !cids.has(active.get(itemId)))
    .map(([itemId, cids]) => ({
      itemId,
      activeCid: active.get(itemId) ?? '',
      cids: [...cids].map(([cid, where]) => ({ cid, documents: [...where].sort() })),
    }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));
  return { documents, conflicts };
}

/**
 * Reports the legacy pins and, with `apply`, removes every one, so each item resolves through the
 * catalog alone. The report is the audit result of the run. Idempotent.
 * @param {Object} models - Served models: `CyberiaQuest`, `CyberiaAction`, `CyberiaItemCatalog`.
 * @param {{apply?:boolean}} [params]
 * @returns {Promise<{checkedAt:Date,applied:boolean,documents:Array,conflicts:Array,repaired:number}>}
 * @memberof CyberiaCatalogConsistency
 */
export async function repairLegacyPins(models, { apply = false } = {}) {
  const { documents, conflicts } = await findLegacyPins(models);
  let repaired = 0;
  if (apply)
    for (const { collection, _id, fields } of documents) {
      await models[collection].collection.updateOne(
        { _id },
        { $unset: Object.fromEntries(fields.map((f) => [f, ''])) },
      );
      repaired++;
    }
  return {
    checkedAt: new Date(),
    applied: apply,
    documents: documents.map(({ collection, code, pins }) => ({ collection, code, pins })),
    conflicts,
    repaired,
  };
}

/**
 * What stops each of some items from running, by the catalog: one of {@link WORLD_ERRORS} but
 * `legacy-pin`, or `unrendered`. An item with no problem is absent.
 * @param {Object} models - Served models: `CyberiaItemCatalog`, `ObjectLayer`, `AtlasSpriteSheet`.
 * @param {Iterable<string>} itemIds
 * @returns {Promise<Map<string,{cid:string,problem:string}>>}
 * @memberof CyberiaCatalogConsistency
 */
export async function bindingProblems(models, itemIds) {
  const bindings = await models.CyberiaItemCatalog.resolve([...itemIds]);
  const cids = [...bindings.values()];
  const definitions = new Map(
    (
      await models.ObjectLayer.find(
        { cid: { $in: cids } },
        { cid: 1, origin: 1, archivedAt: 1, 'data.render.cid': 1 },
      ).lean()
    ).map((definition) => [definition.cid, definition]),
  );
  const atlases = new Set(await models.AtlasSpriteSheet.distinct('objectLayerCid', { objectLayerCid: { $in: cids } }));
  const problems = new Map();
  for (const itemId of itemIds) {
    const cid = bindings.get(itemId) ?? '';
    const definition = definitions.get(cid);
    const problem = !cid
      ? 'unbound'
      : !definition
        ? 'missing'
        : definition.origin === 'draft'
          ? 'draft'
          : definition.archivedAt
            ? 'archived'
            : !definition.data?.render?.cid
              ? 'unrendered'
              : !atlases.has(cid)
                ? 'no-atlas'
                : '';
    if (problem) problems.set(itemId, { cid, problem });
  }
  return problems;
}

/**
 * Checks worlds against the catalog before a game server loads them: every item a world names
 * needs one binding to a definition this host stores, published, offered and with its atlas, and
 * no document of the world may still pin a definition.
 * @param {Object} models - Served models.
 * @param {{instanceCodes?:string[]}} [params] - Every instance by default.
 * @returns {Promise<{ok:boolean,worlds:Array<{instanceCode:string,items:number,findings:Array<{itemId:string,cid:string,problem:string,error:boolean}>}>}>}
 * @memberof CyberiaCatalogConsistency
 */
export async function checkWorldBindings(models, { instanceCodes } = {}) {
  const worlds = [];
  for (const instanceCode of instanceCodes ?? (await models.CyberiaInstance.distinct('code'))) {
    const { itemIds, actionDocs, questDocs } = await loadWorld(models, instanceCode);
    const findings = [];
    const report = (itemId, cid, problem) =>
      findings.push({ itemId, cid, problem, error: WORLD_ERRORS.includes(problem) });
    for (const [itemId, { cid, problem }] of await bindingProblems(models, [...itemIds].sort()))
      report(itemId, cid, problem);
    for (const [collection, documents] of [
      ['CyberiaQuest', questDocs],
      ['CyberiaAction', actionDocs],
    ])
      for (const document of documents)
        for (const { itemId, cid } of legacyPinsOf(collection, document).pins) report(itemId, cid, 'legacy-pin');
    worlds.push({ instanceCode, items: itemIds.size, findings });
  }
  return { ok: worlds.every(({ findings }) => findings.every(({ error }) => !error)), worlds };
}

/**
 * The categories a storage finding belongs to, kept apart: `binding` (the bound definition cannot
 * run), `content` (its render is not stored here), `mfs` (a file is not listed under the
 * definition's CID, or another CID is) and `pin` (the registry, the node or the Cluster lacks a pin).
 * @memberof CyberiaCatalogConsistency
 */
export const STORAGE_CATEGORIES = Object.freeze(['binding', 'content', 'mfs', 'pin']);

/**
 * Checks how every bound definition is stored, one category of {@link STORAGE_CATEGORIES} at a
 * time. A definition several items run is checked once.
 * @param {Object} models - Served models: `CyberiaItemCatalog`, `ObjectLayer`, `AtlasSpriteSheet`, `Ipfs`.
 * @param {Object} params
 * @param {boolean} [params.canonical=false] - This host pins the canonical bytes: it is the Object Layer authority.
 * @param {Object} [params.options] - Router options ({ host, path }).
 * @returns {Promise<{ok:boolean,findings:Array<{category:string,itemIds:string[],cid:string,file:string,problem:string}>}>}
 * @memberof CyberiaCatalogConsistency
 */
export async function checkCatalogStorage(models, { canonical = false, options } = {}) {
  const entries = await models.CyberiaItemCatalog.find({}, { itemId: 1, objectLayerCid: 1 }).lean();
  const itemsOf = new Map();
  for (const { itemId, objectLayerCid } of entries)
    itemsOf.set(objectLayerCid, [...(itemsOf.get(objectLayerCid) ?? []), itemId]);
  const problems = await bindingProblems(
    models,
    entries.map(({ itemId }) => itemId),
  );
  const definitions = new Map(
    (await models.ObjectLayer.find({ cid: { $in: [...itemsOf.keys()] } }).lean()).map((definition) => [
      definition.cid,
      definition,
    ]),
  );
  const findings = [];
  for (const [cid, itemIds] of itemsOf) {
    const report = (category, file, problem) => findings.push({ category, itemIds, cid, file, problem });
    const problem = problems.get(itemIds[0])?.problem;
    if (['missing', 'draft', 'archived'].includes(problem)) {
      report('binding', '', problem);
      continue;
    }
    if (problem === 'no-atlas') report('content', 'atlas.png', problem);
    for (const file of await objectLayerIpfsState({ definition: definitions.get(cid), options })) {
      if ((canonical || file.name !== 'object-layer.json') && !file.registered) report('pin', file.name, 'unrecorded');
      if (!file.pinned) report('pin', file.name, 'unpinned');
      if (file.cluster !== true)
        report('pin', file.name, file.cluster === false ? 'cluster-unpinned' : 'cluster-unreachable');
      if (file.listedCid === null) report('mfs', file.name, 'unlisted');
      else if (file.listedCid !== file.cid) report('mfs', file.name, `lists ${file.listedCid}`);
    }
  }
  return { ok: findings.length === 0, findings };
}
