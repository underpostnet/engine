import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import {
  ENTITY_TYPE_DEFAULTS,
  resolveEntityDefaultBuild,
  resolveEntityInventory,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';
import { collectInstanceItemIds, selectInstanceSkills } from '../cyberia-instance/cyberia-instance-items.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';

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
  let ObjectLayer;
  try {
    ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
  } catch {
    return types;
  }
  if (!ObjectLayer?.find) return types;
  for (const doc of await ObjectLayer.find({ 'data.item.id': { $in: [...itemIds] } }, { 'data.item': 1 }).lean()) {
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
   * The defaults a world runs on: what its conf references, completed by the canonical set.
   *
   * Every entity type the referenced documents do not cover falls back to ENTITY_TYPE_DEFAULTS, so
   * an instance only has to own the rows it actually changes.
   *
   * @param {Array<object>} resolved - Defaults an instance references, already materialised.
   * @returns {Array<object>} Those defaults followed by the uncovered canonical ones.
   */
  static completeWithCanonical = (resolved = []) => {
    const covered = new Set(resolved.map((entityDefault) => entityDefault.entityType));
    return [
      ...resolved.map(toEntityDefault),
      ...ENTITY_TYPE_DEFAULTS.filter((canonical) => !covered.has(canonical.entityType)).map(toEntityDefault),
    ];
  };

  /** {@link completeWithCanonical} over what a conf references. */
  static resolveWithCanonical = async (entityDefaultIds = [], options) =>
    CyberiaEntityTypeDefaultService.completeWithCanonical(
      await CyberiaEntityTypeDefaultService.resolve(entityDefaultIds, options),
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
   * Points an instance's conf at every entity-type default its own content needs.
   *
   * Matching is the runtime's rule, not a guess: a document belongs to this world when all of its
   * `liveItemIds` appear together on some entity its maps place — the same subset containment
   * `game/entity_defaults.go` resolves an entity with. So whatever an author drops on a map, the
   * conf ends up referencing the wiring that will actually be applied to it.
   *
   * Additive, then compacting: references already there are kept in place (order carries
   * specificity), matches missing from the conf are appended, and references whose document is
   * gone are dropped. Nothing an author linked by hand is lost — a player or coin default is
   * never placed on a map, so a wholesale replace would silently discard it.
   *
   * A match is reported rather than linked whenever linking it would decide something for the
   * operator. Two worlds built on the same art hold documents with identical `liveItemIds`, so
   * matching alone cannot tell them apart: one another instance references is left to that
   * instance (`skipped`), and one answering for a build this conf already references is left
   * where it is (`conflicts`), since the two would then differ only by list order. Both stay
   * claimable by hand in the Entity engine. That is the cross-instance contamination the
   * reference model exists to prevent — a document is in a world because the world points at it.
   *
   * Membership is only ever added here. A reference an operator made is never withdrawn on a
   * guess: the sole removal is `dropped`, a reference whose document no longer exists.
   *
   * The skills the world runs are reported, not written. They follow from its content by the
   * shared rule in cyberia-instance-items.js — a skill belongs when its trigger item is named by
   * a map entity, an entity-type default, a vendor or assembler catalog, or a quest. Nothing to
   * store means nothing to keep in step: the export and the boot payload derive the same list
   * from the same content.
   *
   * @param {{instanceCode: string, mapCodes?: string[]}} params - Target instance; `mapCodes`
   *   overrides the stored set, which is what lets an editor sync against an unsaved selection.
   * @param {{host: string, path: string}} options - Provider context.
   * Placed entities are rewritten too: each carries the items the default it resolves to says it
   * wears, so a map document and the simulation agree on what is on an entity.
   *
   * @returns {Promise<{instanceCode: string, mapCodes: string[], linked: string[], skipped: string[],
   *   dropped: string[], entityDefaults: string[], skills: string[],
   *   entitiesUpdated: Array<{mapCode: string, entities: number}>, conflicts: string[],
   *   duplicates: string[]}>}
   */
  static syncInstance = async ({ instanceCode, mapCodes }, options) => {
    if (!instanceCode) throw new Error('instanceCode is required to sync entity-type defaults');
    const CyberiaAction = DataBaseProviderService.getModel('CyberiaAction', options);
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
    const CyberiaQuest = DataBaseProviderService.getModel('CyberiaQuest', options);
    const CyberiaSkill = DataBaseProviderService.getModel('CyberiaSkill', options);

    const confs = await CyberiaInstanceConf.find({}, { instanceCode: 1, entityDefaults: 1 }).lean();
    const conf = confs.find((entry) => entry.instanceCode === instanceCode);
    if (!conf) throw new Error(`cyberia-instance-conf not found for instanceCode="${instanceCode}"`);
    const codes = mapCodes?.length
      ? [...mapCodes]
      : (await CyberiaInstance.findOne({ code: instanceCode }).select('cyberiaMapCodes').lean())?.cyberiaMapCodes ??
        [];

    const maps = codes.length ? await CyberiaMap.find({ code: { $in: codes } }, { code: 1, entities: 1 }).lean() : [];
    const placed = maps.flatMap((map) => (map.entities || []).map((entity) => new Set(entity.objectLayerItemIds || [])));

    const defaults = await CyberiaEntityTypeDefault.find(
      {},
      { entityType: 1, liveItemIds: 1, updatedAt: 1 },
    ).lean();
    const matched = defaults
      .filter(({ liveItemIds }) => (liveItemIds || []).length > 0)
      .filter(({ liveItemIds }) => placed.some((itemIds) => liveItemIds.every((id) => itemIds.has(id))))
      .map((doc) => String(doc._id));

    const claimedElsewhere = new Set(
      confs
        .filter((entry) => entry.instanceCode !== instanceCode)
        .flatMap((entry) => (entry.entityDefaults || []).map(String)),
    );
    const byId = new Map(defaults.map((doc) => [String(doc._id), doc]));
    const existing = new Set(byId.keys());
    const refs = (conf.entityDefaults || []).map(String);
    const dropped = refs.filter((ref) => !existing.has(ref));
    const kept = refs.filter((ref) => existing.has(ref));
    // What this world already has an answer for. A match that answers for a build a reference
    // already covers is a second opinion, never an upgrade: adopting it would put a document the
    // operator never linked into the world, and — sharing the winner's key — it would decide by
    // list order which of the two the entities actually resolve to. Reported, not linked.
    const answered = new Set(kept.map((ref) => buildKey(byId.get(ref))));
    const candidates = matched.filter((id) => !kept.includes(id));
    const skipped = candidates.filter((id) => claimedElsewhere.has(id));
    const linked = [];
    const conflicts = [];
    for (const id of candidates.filter((candidate) => !claimedElsewhere.has(candidate))) {
      const key = buildKey(byId.get(id));
      if (answered.has(key)) {
        conflicts.push(id);
        continue;
      }
      answered.add(key);
      linked.push(id);
    }
    const entityDefaults = [...kept, ...linked];
    const duplicates = findDuplicateBuilds(entityDefaults, defaults);

    // Every item the world can hold: what it references, completed by the canonical defaults for
    // the entity types it does not cover. A skill triggers from one of these or from nothing.
    const referenced = await CyberiaEntityTypeDefault.find({ _id: { $in: entityDefaults } }).lean();
    const running = CyberiaEntityTypeDefaultService.completeWithCanonical(referenced.map(toEntityDefault));
    const carried = new Set(running.flatMap((doc) => resolveEntityInventory(doc).map((row) => row.itemId)));

    // Which skills the world runs is derived, never stored. Reported so an operator can see what
    // a sync changed, and computed by the one rule the export and the boot payload also use — a
    // stored list was a second answer to the same question, and it disagreed: a trigger only a
    // quest or a vendor named was reachable in play, exported with the world, and missing here.
    const [actions, quests] = codes.length
      ? await Promise.all([
          CyberiaAction.find({ sourceMapCode: { $in: codes } }, { shopItems: 1, craftRecipes: 1 }).lean(),
          CyberiaQuest.find({ sourceMapCode: { $in: codes } }, { steps: 1, rewards: 1 }).lean(),
        ])
      : [[], []];
    const owned = collectInstanceItemIds({ maps, entityDefaults: running, actions, quests });
    const skills = selectInstanceSkills(await CyberiaSkill.find({}, { triggerItemId: 1 }).lean(), owned)
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

    if (linked.length > 0 || dropped.length > 0) {
      // A conf written before skills were derived still carries the field. It reaches nothing —
      // it is off the schema, and fillInstanceConfDefaults strips it from every read that matters
      // — so it is cleared here rather than in a write of its own.
      await CyberiaInstanceConf.updateOne(
        { _id: conf._id },
        { $set: { entityDefaults, updatedAt: new Date() }, $unset: { skillConfig: '' } },
      );
    }
    logger.info('Synced entity-type defaults', {
      instanceCode,
      maps: codes.length,
      linked,
      skipped,
      dropped,
      skills,
      entitiesUpdated,
      ...(conflicts.length > 0 ? { conflicts } : {}),
      ...(duplicates.length > 0 ? { duplicates } : {}),
    });
    return {
      instanceCode,
      mapCodes: codes,
      linked,
      skipped,
      dropped,
      entityDefaults,
      skills,
      entitiesUpdated,
      conflicts,
      duplicates,
    };
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
    if (req.params.id) return await CyberiaEntityTypeDefault.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaEntityTypeDefault.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaEntityTypeDefault.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-entity-type-default.model.js').CyberiaEntityTypeDefaultModel} */
    const CyberiaEntityTypeDefault = DataBaseProviderService.getModel('CyberiaEntityTypeDefault', options);
    return await CyberiaEntityTypeDefault.findByIdAndUpdate(req.params.id, req.body);
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

export { applyDefaultsToEntities, buildKey, findDuplicateBuilds, CyberiaEntityTypeDefaultService, toEntityDefault };
