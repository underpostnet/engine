/**
 * Consistency of the runtime binding. Ordinary content names items by item id, and the catalog
 * alone binds each item to the definition the runtime runs (`object-layer-catalog.js`).
 *
 * {@link checkWorldBindings} reads each world as the game server receives it and reports every
 * item it names that cannot run, before a server loads it. {@link checkCatalogStorage} reports how
 * every bound definition is stored on IPFS.
 *
 * @module src/projects/cyberia/catalog/catalog-consistency.js
 * @namespace CyberiaCatalogConsistency
 */
import { objectLayerIpfsState } from '../../../api/object-layer/object-layer.ipfs.js';
import { loadWorld } from '../instance-data.js';

/**
 * Problems that stop an item from running: unbound, bound to a definition this host does not
 * store, to a draft, to an archived definition, or to a render this host holds no atlas of.
 * `unrendered` is a warning: the item runs without a render until the Studio paints it.
 * @memberof CyberiaCatalogConsistency
 */
export const WORLD_ERRORS = Object.freeze(['unbound', 'missing', 'draft', 'archived', 'no-atlas']);

/**
 * What stops each of some items from running, by the catalog: one of {@link WORLD_ERRORS}, or
 * `unrendered`. An item with no problem is absent.
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
 * needs one binding to a definition this host stores, published, offered and with its atlas.
 * @param {Object} models - Served models.
 * @param {{instanceCodes?:string[]}} [params] - Every instance by default.
 * @returns {Promise<{ok:boolean,worlds:Array<{instanceCode:string,items:number,findings:Array<{itemId:string,cid:string,problem:string,error:boolean}>}>}>}
 * @memberof CyberiaCatalogConsistency
 */
export async function checkWorldBindings(models, { instanceCodes } = {}) {
  const worlds = [];
  for (const instanceCode of instanceCodes ?? (await models.CyberiaInstance.distinct('code'))) {
    const { itemIds } = await loadWorld(models, instanceCode);
    const findings = [];
    for (const [itemId, { cid, problem }] of await bindingProblems(models, [...itemIds].sort()))
      findings.push({ itemId, cid, problem, error: WORLD_ERRORS.includes(problem) });
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
