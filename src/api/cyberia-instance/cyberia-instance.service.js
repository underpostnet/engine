import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { connectPortals, portalTopology } from './cyberia-portal-connector.js';
import { contentArtifact } from '../../projects/cyberia/content/content-artifact.js';
import { reloadContentServers } from '../../projects/cyberia/content/content-release.js';
import { CacheService } from '../../server/storage/cache.js';
import { revisionGuard } from '../../server/storage/revision.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';
import { graphLayoutDefect } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { removeUniverseMember } from '../cyberia-universe/cyberia-universe.service.js';
import { registryModels, registryTransaction } from '../../projects/cyberia/instance/map-registry.js';

const logger = loggerFactory(import.meta);

/** Instance lists and reads by code; every instance write invalidates them. */
export const instanceCache = (options) => CacheService.namespace(options, 'cyberia-instance');

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * The saved cells of the maps the instance keeps; a cell of a removed map goes with it.
 * @throws {Error} 400 on an invalid layout.
 */
const keptMapLayout = ({ cyberiaMapCodes = [], mapLayout = [] }) => {
  const kept = mapLayout.filter((cell) => cyberiaMapCodes.includes(cell?.mapCode));
  const defect = graphLayoutDefect(cyberiaMapCodes, kept, 'mapCode');
  if (defect) throw httpError(400, `Invalid map layout: ${defect}`);
  return kept;
};

class CyberiaInstanceService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    const { revision, ...fields } = req.body;
    const { value: instance } = await registryTransaction(registryModels(options), (session) =>
      new CyberiaInstance({ ...fields, mapLayout: keptMapLayout(fields), creator: req.auth.user._id }).save({
        session,
      }),
    );
    await CacheService.invalidate(instanceCache(options));

    // Auto-upsert a CyberiaInstanceConf for this instance using schema defaults.
    // $setOnInsert ensures existing conf documents are never overwritten.
    if (instance.code && CyberiaInstanceConf) {
      try {
        const conf = await CyberiaInstanceConf.findOneAndUpdate(
          { instanceCode: instance.code },
          { $setOnInsert: { instanceCode: instance.code } },
          { upsert: true, returnDocument: 'after' },
        );
        if (conf && !instance.conf) {
          await CyberiaInstance.findByIdAndUpdate(instance._id, { conf: conf._id });
          instance.conf = conf._id;
        }
      } catch (e) {
        logger.error('auto-upsert CyberiaInstanceConf failed:', e);
      }
    }

    return instance;
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    const populateCreator = { path: 'creator', model: 'User', select: '_id username' };
    // Instances are addressed by code, the key the engine navigates by.
    if (req.params.id)
      return await CacheService.getOrLoad(instanceCache(options), {
        identifier: req.params.id,
        load: async () => {
          const instance = await CyberiaInstance.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).populate(
            populateCreator,
          );
          return instance ? instance.toJSON() : null;
        },
      });

    return await CacheService.getOrLoad(instanceCache(options), {
      identifier: 'list',
      variant: CacheService.variant(req.query),
      load: async () => {
        const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
        const [documents, total] = await Promise.all([
          CyberiaInstance.find(query).sort(sort).limit(limit).skip(skip).populate(populateCreator),
          CyberiaInstance.countDocuments(query),
        ]);
        const data = documents.map((document) => document.toJSON());
        return { data, total, page, totalPages: Math.ceil(total / limit) };
      },
    });
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    const instance = await CyberiaInstance.findById(req.params.id);
    if (!instance) throw new Error('instance not found');
    assertOwnerOrAdmin(req.auth.user, instance.creator);
    // The owner and the code are set once, by the write that created the instance; the revision only moves forward.
    const { creator, revision, ...changes } = req.body;
    if (changes.code !== undefined && changes.code !== instance.code)
      throw httpError(400, `The code of instance ${instance.code} never changes`);
    if (revision !== instance.revision)
      throw httpError(
        409,
        `Instance ${instance.code} is at revision ${instance.revision}, not ${revision}: reload it before saving`,
      );
    changes.mapLayout = keptMapLayout({
      cyberiaMapCodes: changes.cyberiaMapCodes ?? instance.cyberiaMapCodes,
      mapLayout: changes.mapLayout ?? instance.mapLayout,
    });
    await new CyberiaInstance({ ...instance.toObject(), ...changes }).validate();
    const { filter, next } = revisionGuard(instance);
    const { value: updated } = await registryTransaction(registryModels(options), async (session) => {
      const saved = await CyberiaInstance.findOneAndUpdate(
        filter,
        { $set: { ...changes, revision: next } },
        { returnDocument: 'after', runValidators: true, session },
      );
      if (!saved) throw httpError(409, `Instance ${instance.code} changed while saving: reload it before saving`);
      return saved;
    });
    if (changes.thumbnail && instance.thumbnail && String(changes.thumbnail) !== String(instance.thumbnail)) {
      const File = DataBaseProviderService.getModel('File', options);
      await File.findByIdAndDelete(instance.thumbnail);
    }
    await CacheService.invalidate(instanceCache(options));
    return updated;
  };
  /**
   * Asks the live servers of this instance to rebuild its world now (gRPC control service, REST
   * fallback). The registry names the servers; the internal CYBERIA_SERVER_API_KEY never leaves the engine.
   */
  static hotReload = async (req, res, options) => {
    const instance = await DataBaseProviderService.getModel('CyberiaInstance', options)
      .findById(req.params.id)
      .select('code')
      .lean();
    if (!instance) throw httpError(404, 'instance not found');
    const mode = req.body?.mode === 'incremental' ? 'incremental' : 'full';
    const endpoints = await reloadContentServers(options, { mode, instanceCode: instance.code });
    if (endpoints.length === 0) throw httpError(404, `No live server runs ${instance.code}`);
    return { instanceCode: instance.code, mode, endpoints };
  };

  /**
   * GET `/map-sources`: the maps an instance takes in one step: the maps of the Foundation and the
   * maps of each saga, each with whether this host stores it. A map it does not store needs the
   * content imported first.
   */
  static mapSources = async (req, res, options) => {
    const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
    const CyberiaSaga = DataBaseProviderService.getModel('CyberiaSaga', options);
    const foundation = contentArtifact().foundation.maps.map(({ code }) => code);
    const sagas = await CyberiaSaga.find({}, { _id: 0, code: 1, name: 1, mapCodes: 1 }).sort({ code: 1 }).lean();
    const codes = [...new Set([...foundation, ...sagas.flatMap(({ mapCodes }) => mapCodes)])];
    const stored = new Map(
      (await CyberiaMap.find({ code: { $in: codes } }, { _id: 0, code: 1, name: 1 }).lean()).map(({ code, name }) => [
        code,
        name,
      ]),
    );
    const entryOf = (code) => ({ code, name: stored.get(code) ?? '', stored: stored.has(code) });
    return {
      foundation: [...foundation].sort().map(entryOf),
      sagas: sagas.map(({ code, name, mapCodes }) => ({ code, name, maps: mapCodes.map(entryOf) })),
    };
  };

  /**
   * POST `/topology`: what `{ mapCodes, portals }` connect, from the portal entities the maps hold.
   * Unsaved edits check as they are; nothing is stored.
   */
  static topology = async (req, res, options) => {
    const { mapCodes, portals } = req.body ?? {};
    if (!Array.isArray(mapCodes) || !Array.isArray(portals))
      throw httpError(400, 'A topology names mapCodes and portals');
    const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);
    const maps = await CyberiaMap.find({ code: { $in: mapCodes } }, { code: 1, entities: 1 }).lean();
    return portalTopology(mapCodes, maps, portals);
  };

  /**
   * Central portal connector endpoint.
   *
   * Delegates topology computation to the pure-function `connectPortals()`
   * from cyberia-portal-connector.js so the same logic can be used by the
   * GUI without a DB dependency.
   *
   * Builds a minimal ring connecting all maps and assigns random portal
   * subtypes to remaining portals.
   *
   *   ?persist=true  — save generated portals to DB
   */
  static portalConnect = async (req, res, options) => {
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    const CyberiaMap = DataBaseProviderService.getModel('CyberiaMap', options);

    const instance = await CyberiaInstance.findById(req.params.id).lean();
    if (!instance) throw new Error('instance not found');

    const mapCodes = instance.cyberiaMapCodes || [];

    // Load maps with the fields needed by the connector.
    const mapDocs = await CyberiaMap.find(
      { code: { $in: mapCodes } },
      {
        code: 1,
        gridX: 1,
        gridY: 1,
        entities: 1,
      },
    ).lean();

    // ── Portal topology (pure function) ──────────────────────────────────
    const result = connectPortals(mapCodes, mapDocs);

    // ── Persist to DB when requested ─────────────────────────────────────
    const persist = req.query?.persist === 'true';
    if (persist) {
      assertOwnerOrAdmin(req.auth.user, instance.creator);
      const { filter, next } = revisionGuard(instance);
      const { matchedCount } = await CyberiaInstance.updateOne(filter, {
        $set: { portals: result.portals, revision: next },
      });
      if (!matchedCount) throw httpError(409, `Instance ${instance.code} changed while connecting: try again`);
      await CacheService.invalidate(instanceCache(options));
    }

    return {
      ...result,
      persisted: persist,
    };
  };

  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    let removed;
    if (req.params.id) {
      const instance = await CyberiaInstance.findById(req.params.id);
      if (!instance) throw new Error('instance not found');
      assertOwnerOrAdmin(req.auth.user, instance.creator);
      ({ value: removed } = await registryTransaction(registryModels(options), (session) =>
        CyberiaInstance.findByIdAndDelete(req.params.id, { session }),
      ));
      if (instance.thumbnail) {
        const File = DataBaseProviderService.getModel('File', options);
        await File.findByIdAndDelete(instance.thumbnail);
      }
      await removeUniverseMember(instance.code, options);
    } else
      ({ value: removed } = await registryTransaction(registryModels(options), (session) =>
        CyberiaInstance.deleteMany({}, { session }),
      ));
    await CacheService.invalidate(instanceCache(options));
    return removed;
  };
}

export { CyberiaInstanceService };
