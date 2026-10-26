import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import {
  resolveEntityDefaultBuild,
  resolveEntityInventory,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';
import { collectInstanceItemIds, selectInstanceSkills } from '../cyberia-instance/cyberia-instance-items.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { catalogModels, findBoundDefinitions } from '../../projects/cyberia/catalog/object-layer-catalog.js';
import { contentArtifact } from '../../projects/cyberia/content/content-artifact.js';

const logger = loggerFactory(import.meta);

/** The stored shape, as every consumer of a resolved default expects to read it. */
const toEntityDefault = (source) => ({
  entityType: source.entityType || '',
  liveItemIds: [...(source.liveItemIds || [])],
  deadItemIds: [...(source.deadItemIds || [])],
  dropItemIds: [...(source.dropItemIds || [])],
  inventoryItemsIds: [...(source.inventoryItemsIds || [])],
  overrideItemsIdsState: (source.overrideItemsIdsState || [])
    .filter((rule) => rule?.itemId)
    .map((rule) => ({
      itemId: rule.itemId,
      ...('boolean' === typeof rule.active ? { active: rule.active } : {}),
      ...(Number.isFinite(rule.quantity) ? { quantity: rule.quantity } : {}),
      ...(Number.isFinite(rule.dropChance) ? { dropChance: rule.dropChance } : {}),
    })),
  behavior: source.behavior || '',
});

/** Each default with the codes of the instances whose conf references it. */
async function withInstanceCodes(CyberiaInstanceConf, defaults) {
  const codes = new Map(defaults.map(({ _id }) => [String(_id), []]));
  const confs = await CyberiaInstanceConf.find(
    { entityDefaults: { $in: defaults.map(({ _id }) => _id) } },
    { instanceCode: 1, entityDefaults: 1 },
  ).lean();
  for (const conf of confs) for (const ref of conf.entityDefaults) codes.get(String(ref))?.push(conf.instanceCode);
  return defaults.map((doc) => ({ ...doc, instanceCodes: codes.get(String(doc._id)).sort() }));
}

/** The key resolution ties on: same entity type, same live set, whatever order it is written in. */
const buildKey = (doc) => `${doc?.entityType || ''}|${[...(doc?.liveItemIds || [])].sort().join(',')}`;

/**
 * Names the references that answer for the same entities, changing nothing.
 *
 * Resolution is by containment with the most specific match winning, so two documents declaring
 * the same type and the same live ids are not a refinement of each other — whichever the conf
 * lists first wins, which is not a decision anyone made. That is worth telling an operator about.
 *
 * It is not worth unlinking over. A reference is a world's declared membership, and picking which
 * of two to discard by timestamp guesses at intent and throws away the other instance's wiring
 * when it guesses wrong. The report says which record to delete; the deleting stays deliberate.
 *
 * @param {string[]} references - Document ids, in conf order.
 * @param {Array<{_id: any, entityType?: string, liveItemIds?: string[]}>} defaults
 * @returns {string[]} Each reference after the first that answers for an already-answered build.
 */
const findDuplicateBuilds = (references, defaults) => {
  const byId = new Map(defaults.map((doc) => [String(doc._id), doc]));
  const answered = new Set();
  // A reference with no document is the `dropped` path's business: it cannot be compared, so it
  // is never called a duplicate of something unseen.
  return references.filter((id) => {
    if (!byId.has(id)) return false;
    const key = buildKey(byId.get(id));
    if (answered.has(key)) return true;
    answered.add(key);
    return false;
  });
};

/**
 * itemId → item type for the ids a world carries, or an empty map when this provider has no
 * ObjectLayer model. Types only settle a contested equipment slot, so a world without them keeps
 * every row the state its list derives — the same "unknown types pass through" the runtime applies.
 *
 * @param {Set<string>} itemIds - Ids to resolve.
 * @param {{host: string, path: string}} options - Provider context.
 * @returns {Promise<Object<string,string>>}
 */
const readItemTypes = async (itemIds, options) => {
  const types = {};
  if (itemIds.size === 0) return types;
  let models;
  try {
    models = catalogModels(options);
  } catch {
    return types;
  }
  for (const doc of await findBoundDefinitions(models, [...itemIds])) {
    const item = doc?.data?.item;
    if (item?.id && item?.type) types[item.id] = item.type;
  }
  return types;
};

/**
 * Rewrites one map's entities so each carries what its default says it wears.
 *
 * A placed entity names itself by the ids the author put on it, and the simulation seeds the rest
 * from the default that name resolves to. The map document has to agree: an override that
 * activates a carried item is a decision about the entity, and it is only real once the entity on
 * the map holds that item too. Everything reading a map — the editor, the instance payload, the
 * spawn — then sees one answer instead of two.
 *
 * The rewrite is a replacement, not a merge: a matched entity ends up carrying its build's live
 * ids and whatever that build wears, and nothing else. Merging cannot converge — an id the sync
 * added stops being recognisable the moment the default stops naming it, and it would sit on the
 * map for good. Stating the whole set is what makes the second run a no-op and what makes removing
 * an item from a default actually remove it from the world.
 *
 * The live ids are always kept, even when an override unseats one: they are the key the entity
 * resolves by, and dropping one would send the next sync to a different, less specific default.
 * Which of them is actually worn is settled at spawn, from the same inventory this reads.
 *
 * Only a default the entity genuinely carries speaks for it. The fallback match — the first of its
 * type — answers what a bot looks like in general, never what is on this one, so an entity that
 * contains no default's live set is left exactly as its author placed it.
 *
 * @param {Array<object>} entities - The map's entities.
 * @param {Array<object>} defaults - The world's entity-type defaults, most specific first.
 * @param {Object<string,string>} itemTypes - itemId → item type, for the equipment rules.
 * @returns {{entities: Array<object>, changed: number}} The rewritten entities and how many moved.
 */
const applyDefaultsToEntities = (entities = [], defaults = [], itemTypes = {}) => {
  let changed = 0;
  const next = entities.map((entity) => {
    const placed = entity.objectLayerItemIds || [];
    const build = resolveEntityDefaultBuild({ entityType: entity.entityType, itemIds: placed }, defaults);
    const identity = build?.liveItemIds || [];
    if (identity.length === 0 || !identity.every((itemId) => placed.includes(itemId))) return entity;
    const worn = resolveEntityInventory(build, { itemTypes })
      .filter((row) => row.active)
      .map((row) => row.itemId);
    const itemIds = [...new Set([...identity, ...worn])];
    if (itemIds.length === placed.length && itemIds.every((id, index) => id === placed[index])) return entity;
    changed++;
    return { ...entity, objectLayerItemIds: itemIds };
  });
  return { entities: next, changed };
};

/**
 * The global rows: the entity-type defaults no instance conf references. Every world runs them,
 * oldest first. A row a conf references is an instance row of that world only.
 * @param {{CyberiaEntityTypeDefault: import('mongoose').Model, CyberiaInstanceConf: import('mongoose').Model}} models
 * @param {import('mongoose').ClientSession} [session] - The transaction the read joins.
 * @returns {Promise<Array<object>>} Lean rows, by `_id`.
 */
const findGlobalDefaults = async ({ CyberiaEntityTypeDefault, CyberiaInstanceConf }, session = null) => {
  const referenced = await CyberiaInstanceConf.distinct('entityDefaults').session(session);
  return await CyberiaEntityTypeDefault.find({ _id: { $nin: referenced } })
    .sort({ _id: 1 })
    .session(session)
    .lean();
};

/**
 * The rows a world runs on, in the order the runtime resolves them: its instance rows in conf order;
 * then the baseline rows of the entity types they leave out, each replaced in place by the global
 * row of its build; then the other global rows. The most specific match wins, an earlier row wins a
 * tie, and with no match the first row of the type answers.
 * @param {{instance?: Array<object>, baseline?: Array<object>, global?: Array<object>}} rows
 * @returns {Array<{row: object, source: 'instance'|'baseline'|'global'}>}
 */
const runtimeEntityDefaults = ({ instance = [], baseline = [], global = [] }) => {
  const covered = new Set(instance.map(({ entityType }) => entityType));
  const byBuild = new Map();
  for (const row of global) if (!byBuild.has(buildKey(row))) byBuild.set(buildKey(row), row);
  const placed = new Set();
  const base = baseline
    .filter(({ entityType }) => !covered.has(entityType))
    .map((row) => {
      const replacement = byBuild.get(buildKey(row));
      if (!replacement) return { row, source: 'baseline' };
      placed.add(replacement);
      return { row: replacement, source: 'global' };
    });
  return [
    ...instance.map((row) => ({ row, source: 'instance' })),
    ...base,
    ...global.filter((row) => !placed.has(row)).map((row) => ({ row, source: 'global' })),
  ];
};

class CyberiaEntityTypeDefaultService {
  // No per-itemId uniqueness: resolution is by subset containment (most-specific
  // match wins), so the same itemId may appear in many documents — e.g.
  // [purple, atlas_pistol_mk2]→hostile alongside [purple]→passive. See the model.

  /**
   * Materialises the entity-type defaults an instance conf references.
   *
   * This is the only way a conf's `entityDefaults` becomes usable data. It reads the ids the conf
   * names and nothing else: a document belongs to a world because that world points at it, never
   * because their item ids happen to overlap. That distinction is the whole fix — matching by
   * item id is what let two instances sharing a skin resolve into each other's wiring.
   *
   * Order follows the conf, so the most specific documents an operator listed first stay first.
   * An id naming no document is dropped and reported: the reference outliving its document is a
   * broken world, not a silent one.
   *
   * @param {import('mongoose').Model} Model - CyberiaEntityTypeDefault model.
   * @param {Array<string|import('mongoose').Types.ObjectId>} entityDefaultIds - Conf references.
   * @returns {Promise<Array<object>>} Referenced defaults, in reference order.
   */
  static resolveWith = async (Model, entityDefaultIds = []) => {
    const ids = (entityDefaultIds || []).map((id) => String(id?._id ?? id)).filter(Boolean);
    if (!Model || ids.length === 0) return [];
    const docs = await Model.find({ _id: { $in: ids } }).lean();
    const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      logger.warn('Instance conf references entity-type defaults that no longer exist', { missing });
    }
    return ids.filter((id) => byId.has(id)).map((id) => toEntityDefault(byId.get(id)));
  };

  /** {@link resolveWith}, addressing the model through the provider context. */
  static resolve = async (entityDefaultIds = [], options) =>
    CyberiaEntityTypeDefaultService.resolveWith(
      DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options),
      entityDefaultIds,
    );

  /**
   * The defaults a world runs on: what its conf references, the foundation baseline and the global
   * rows, in {@link runtimeEntityDefaults} order.
   *
   * @param {Array<object>} resolved - Defaults an instance references, already materialised.
   * @param {Array<object>} [global] - {@link findGlobalDefaults}.
   * @returns {Array<object>} The rows in the stored shape.
   */
  static completeWithCanonical = (resolved = [], global = []) =>
    runtimeEntityDefaults({ instance: resolved, baseline: contentArtifact().baseline, global }).map(({ row }) =>
      toEntityDefault(row),
    );

  /** {@link completeWithCanonical} over what a conf references and the global rows. */
  static resolveWithCanonical = async (entityDefaultIds = [], options) =>
    CyberiaEntityTypeDefaultService.completeWithCanonical(
      await CyberiaEntityTypeDefaultService.resolve(entityDefaultIds, options),
      await findGlobalDefaults({
        CyberiaEntityTypeDefault: DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options),
        CyberiaInstanceConf: DataBaseProviderService.getModel('CyberiaInstanceConf', options),
      }),
    );

  /**
   * Makes exactly the named instances reference this default.
   *
   * States the whole membership, so re-sending converges: a conf that drops out of the list has
   * the reference removed, and one that joins gets it appended. Order inside a conf is
   * significant (most specific first), so an existing reference is left where it is.
   *
   * @param {object} req - Express request; `params.id` is the default's _id, `body.instanceCodes`
   *   the complete set of instances that should reference it.
   * @param {object} res
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<{instanceCodes: string[], linked: string[], unlinked: string[]}>}
   */
  static setInstances = async (req, res, options) => {
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    const id = String(req.params.id);
    if (!(await CyberiaEntityTypeDefault.exists({ _id: id }))) {
      throw new Error(`cyberia-entity-type-default not found for _id="${id}"`);
    }
    const wanted = new Set((req.body?.instanceCodes || []).map(String));

    const confs = await CyberiaInstanceConf.find({}, { instanceCode: 1, entityDefaults: 1 }).lean();
    const unknown = [...wanted].filter((code) => !confs.some((conf) => conf.instanceCode === code));
    if (unknown.length > 0) throw new Error(`cyberia-instance-conf not found for: ${unknown.join(', ')}`);

    const linked = [];
    const unlinked = [];
    for (const conf of confs) {
      const refs = (conf.entityDefaults || []).map(String);
      const has = refs.includes(id);
      const should = wanted.has(conf.instanceCode);
      if (has === should) continue;
      await CyberiaInstanceConf.updateOne(
        { _id: conf._id },
        { $set: { entityDefaults: should ? [...refs, id] : refs.filter((ref) => ref !== id), updatedAt: new Date() } },
      );
      (should ? linked : unlinked).push(conf.instanceCode);
    }
    const compacted = await CyberiaEntityTypeDefaultService.compactInstanceRefs(options);
    logger.info('Updated entity-type default instance links', { id, linked, unlinked });
    return { instanceCodes: [...wanted].sort(), linked, unlinked, compacted };
  };

  /**
   * Drops conf references whose entity-type default no longer exists.
   *
   * A reference outliving its document is a world half-declared: the boot path skips it, the
   * export cannot find it, and nobody can tell from the conf whether the wiring was meant to be
   * there. Deleting a default unlinks it everywhere (see `delete`), so this exists for what
   * slipped past that — a document removed straight from the collection, or a conf restored from
   * a backup whose defaults were not.
   *
   * @param {{host: string, path: string}} options - Provider context.
   * @param {{instanceCode?: string}} [scope] - Limit to one instance; omit for the whole collection.
   * @returns {Promise<Array<{instanceCode: string, dropped: string[]}>>} What each conf lost.
   */
  static compactInstanceRefs = async (options, { instanceCode } = {}) => {
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    const confs = await CyberiaInstanceConf.find(instanceCode ? { instanceCode } : {}, {
      instanceCode: 1,
      entityDefaults: 1,
    }).lean();
    const referenced = [...new Set(confs.flatMap((conf) => (conf.entityDefaults || []).map(String)))];
    if (referenced.length === 0) return [];
    const existing = new Set(
      (await CyberiaEntityTypeDefault.find({ _id: { $in: referenced } }, { _id: 1 }).lean()).map((doc) =>
        String(doc._id),
      ),
    );

    const compacted = [];
    for (const conf of confs) {
      const refs = (conf.entityDefaults || []).map(String);
      const kept = refs.filter((ref) => existing.has(ref));
      if (kept.length === refs.length) continue;
      await CyberiaInstanceConf.updateOne(
        { _id: conf._id },
        { $set: { entityDefaults: kept, updatedAt: new Date() } },
      );
      compacted.push({ instanceCode: conf.instanceCode, dropped: refs.filter((ref) => !existing.has(ref)) });
    }
    if (compacted.length > 0) logger.info('Dropped orphaned entity-type default references', { compacted });
    return compacted;
  };

  /**
   * What an instance's content implies, with no reference made: a global row runs in every world
   * without one, and a reference an operator made stays. The only removal is `dropped`, a reference
   * whose document is gone.
   *
   * The skills the world runs are reported, not written. They follow from its content by the
   * shared rule in cyberia-instance-items.js — a skill belongs when its trigger item is named by
   * a map entity, an entity-type default, a vendor or assembler catalog, or a quest.
   *
   * Placed entities are rewritten too: each carries the items the default it resolves to says it
   * wears, so a map document and the simulation agree on what is on an entity.
   *
   * @param {{instanceCode: string, mapCodes?: string[]}} params - Target instance; `mapCodes`
   *   overrides the stored set, which is what lets an editor sync against an unsaved selection.
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<{instanceCode: string, mapCodes: string[], dropped: string[], entityDefaults: string[],
   *   skills: string[], entitiesUpdated: Array<{mapCode: string, entities: number}>, duplicates: string[]}>}
   */
  static syncInstance = async ({ instanceCode, mapCodes }, options) => {
    if (!instanceCode) throw new Error('instanceCode is required to sync entity-type defaults');
    const model = (name) => DataBaseProviderService.getModel(name, options);
    const CyberiaEntityTypeDefault = model('CyberiaEntityTypeDefault');
    const CyberiaInstanceConf = model('CyberiaInstanceConf');
    const CyberiaMap = model('CyberiaMap');
    if (!(await CyberiaInstanceConf.exists({ instanceCode })))
      throw new Error(`cyberia-instance-conf not found for instanceCode="${instanceCode}"`);
    const codes = mapCodes?.length
      ? [...mapCodes]
      : (await model('CyberiaInstance').findOne({ code: instanceCode }).select('cyberiaMapCodes').lean())
          ?.cyberiaMapCodes ?? [];
    const maps = codes.length ? await CyberiaMap.find({ code: { $in: codes } }, { code: 1, entities: 1 }).lean() : [];

    const [compacted] = await CyberiaEntityTypeDefaultService.compactInstanceRefs(options, { instanceCode });
    const conf = await CyberiaInstanceConf.findOne({ instanceCode }, { entityDefaults: 1 }).lean();
    const entityDefaults = (conf.entityDefaults || []).map(String);
    const referenced = await CyberiaEntityTypeDefault.find({ _id: { $in: entityDefaults } }).lean();
    const duplicates = findDuplicateBuilds(entityDefaults, referenced);

    // Every item the world can hold: its instance rows, the baseline and the global rows. A skill
    // triggers from one of these or from nothing.
    const running = CyberiaEntityTypeDefaultService.completeWithCanonical(
      await CyberiaEntityTypeDefaultService.resolveWith(CyberiaEntityTypeDefault, entityDefaults),
      await findGlobalDefaults({ CyberiaEntityTypeDefault, CyberiaInstanceConf }),
    );
    const carried = new Set(running.flatMap((doc) => resolveEntityInventory(doc).map((row) => row.itemId)));

    // Which skills the world runs is derived, never stored, by the one rule the export and the boot
    // payload also use.
    const [actions, quests] = codes.length
      ? await Promise.all([
          model('CyberiaAction').find({ sourceMapCode: { $in: codes } }, { shopItems: 1, craftRecipes: 1 }).lean(),
          model('CyberiaQuest').find({ sourceMapCode: { $in: codes } }, { steps: 1, rewards: 1 }).lean(),
        ])
      : [[], []];
    const owned = collectInstanceItemIds({ maps, entityDefaults: running, actions, quests });
    const skills = selectInstanceSkills(await model('CyberiaSkill').find({}, { triggerItemId: 1 }).lean(), owned)
      .map((skill) => skill.triggerItemId)
      .sort();

    // Maps carry what their entities wear. The equipment rules settle a contested slot, so the
    // types come along: an override that names a second skin decides which one the entity has on.
    const itemTypes = await readItemTypes(carried, options);
    const entitiesUpdated = [];
    for (const map of maps) {
      const { entities, changed } = applyDefaultsToEntities(map.entities, running, itemTypes);
      if (changed === 0) continue;
      await CyberiaMap.updateOne({ _id: map._id }, { $set: { entities } });
      entitiesUpdated.push({ mapCode: map.code, entities: changed });
    }

    const dropped = compacted?.dropped ?? [];
    logger.info('Synced entity-type defaults', {
      instanceCode,
      maps: codes.length,
      dropped,
      skills,
      entitiesUpdated,
      ...(duplicates.length > 0 ? { duplicates } : {}),
    });
    return { instanceCode, mapCodes: codes, dropped, entityDefaults, skills, entitiesUpdated, duplicates };
  };

  /** REST form of {@link syncInstance}: `params.instanceCode`, optional `body.mapCodes`. */
  static sync = async (req, res, options) =>
    await CyberiaEntityTypeDefaultService.syncInstance(
      { instanceCode: req.params.instanceCode, mapCodes: req.body?.mapCodes },
      options,
    );

  static post = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    return await new CyberiaEntityTypeDefault(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    if (req.params.id) {
      const doc = await CyberiaEntityTypeDefault.findById(req.params.id).lean();
      return doc ? (await withInstanceCodes(CyberiaInstanceConf, [doc]))[0] : doc;
    }

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [defaults, total] = await Promise.all([
      CyberiaEntityTypeDefault.find(query).sort(sort).limit(limit).skip(skip).lean(),
      CyberiaEntityTypeDefault.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data: await withInstanceCodes(CyberiaInstanceConf, defaults), total, page, totalPages };
  };
  // A save that names the `updatedAt` it read refuses a newer version. A behavior is valid only for
  // its entity type, so the merged document is what validates.
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    const { updatedAt, ...changes } = req.body;
    const stored = await CyberiaEntityTypeDefault.findById(req.params.id).lean();
    if (!stored)
      throw Object.assign(new Error(`cyberia-entity-type-default not found for _id="${req.params.id}"`), {
        status: 404,
      });
    await new CyberiaEntityTypeDefault({ ...stored, ...changes }).validate();
    const saved = await CyberiaEntityTypeDefault.findOneAndUpdate(
      { _id: req.params.id, ...(updatedAt && { updatedAt: new Date(updatedAt) }) },
      changes,
      { returnDocument: 'after' },
    ).lean();
    if (!saved)
      throw Object.assign(new Error('This entity default changed since you opened it: reload it, then save again'), {
        status: 409,
      });
    return saved;
  };
  // Unlinks before it deletes: a conf pointing at a document that is gone is the one way this
  // collection produces orphans, and the delete is where it would happen.
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    if (req.params.id) {
      const id = String(req.params.id);
      const { modifiedCount } = await CyberiaInstanceConf.updateMany(
        { entityDefaults: id },
        { $pull: { entityDefaults: id }, $set: { updatedAt: new Date() } },
      );
      if (modifiedCount > 0) logger.info('Unlinked deleted entity-type default', { id, confs: modifiedCount });
      return await CyberiaEntityTypeDefault.findByIdAndDelete(id);
    }
    await CyberiaInstanceConf.updateMany(
      { entityDefaults: { $ne: [] } },
      { $set: { entityDefaults: [], updatedAt: new Date() } },
    );
    return await CyberiaEntityTypeDefault.deleteMany();
  };
}

export {
  applyDefaultsToEntities,
  buildKey,
  findDuplicateBuilds,
  findGlobalDefaults,
  runtimeEntityDefaults,
  CyberiaEntityTypeDefaultService,
  toEntityDefault,
};
