import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { connectPortals } from './cyberia-portal-connector.js';
import { triggerHotReload } from '../../projects/cyberia/hot-reload-trigger.js';
import { CacheService } from '../../server/storage/cache.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';

const logger = loggerFactory(import.meta);

/** Instance lists and reads by code; every instance write invalidates them. */
const instanceCache = (options) => CacheService.namespace(options, 'cyberia-instance');

class CyberiaInstanceService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    const CyberiaInstanceConf = DataBaseProviderService.getModel('CyberiaInstanceConf', options);
    const instance = await new CyberiaInstance({ ...req.body, creator: req.auth.user._id }).save();
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
    // The owner is set once, by the write that created the instance.
    const { creator, ...changes } = req.body;
    if (changes.thumbnail && instance.thumbnail && String(changes.thumbnail) !== String(instance.thumbnail)) {
      const File = DataBaseProviderService.getModel('File', options);
      await File.findByIdAndDelete(instance.thumbnail);
    }
    const updated = await CyberiaInstance.findByIdAndUpdate(req.params.id, changes, { returnDocument: 'after' });
    await CacheService.invalidate(instanceCache(options));
    return updated;
  };
  /**
   * Ask a running cyberia-server to rebuild its world now (gRPC control
   * service, REST fallback). Moderator/admin only — the route guards the
   * caller; the internal CYBERIA_SERVER_API_KEY never leaves the engine.
   */
  static hotReload = async (req, res, options) => {
    const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
    const { serverUrl, mode } = req.body || {};
    if (!serverUrl) throw new Error('serverUrl is required');

    // Resolve the instance the component is editing so the target server can
    // reject a trigger aimed at a different world.
    let instanceCode = req.body?.instanceCode || '';
    if (!instanceCode && req.params.id) {
      const instance = await CyberiaInstance.findById(req.params.id).select('code').lean();
      instanceCode = instance?.code || '';
    }

    const { transport, result, grpcError } = await triggerHotReload({ serverUrl, instanceCode, mode });
    return { transport, instanceCode, grpcError, ...result };
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
      await CyberiaInstance.findByIdAndUpdate(req.params.id, { portals: result.portals });
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
      if (instance.thumbnail) {
        const File = DataBaseProviderService.getModel('File', options);
        await File.findByIdAndDelete(instance.thumbnail);
      }
      removed = await CyberiaInstance.findByIdAndDelete(req.params.id);
    } else removed = await CyberiaInstance.deleteMany();
    await CacheService.invalidate(instanceCache(options));
    return removed;
  };
}

export { CyberiaInstanceService };
