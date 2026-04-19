import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';
import { connectPortals } from './cyberia-portal-connector.js';
import { generateFallbackWorld } from './cyberia-fallback-world.js';

const logger = loggerFactory(import.meta);

const CyberiaInstanceService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    const CyberiaInstanceConf =
      DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstanceConf;
    if (req.auth && req.auth.user) req.body.creator = req.auth.user._id;
    const instance = await new CyberiaInstance(req.body).save();

    // Auto-upsert a CyberiaInstanceConf for this instance using schema defaults.
    // $setOnInsert ensures existing conf documents are never overwritten.
    if (instance.code && CyberiaInstanceConf) {
      try {
        const conf = await CyberiaInstanceConf.findOneAndUpdate(
          { instanceCode: instance.code },
          { $setOnInsert: { instanceCode: instance.code } },
          { upsert: true, new: true },
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
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    const populateCreator = { path: 'creator', model: 'User', select: '_id username' };
    if (req.params.id) return await CyberiaInstance.findById(req.params.id).populate(populateCreator);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaInstance.find(query).sort(sort).limit(limit).skip(skip).populate(populateCreator),
      CyberiaInstance.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    const instance = await CyberiaInstance.findById(req.params.id);
    if (!instance) throw new Error('instance not found');
    if (req.auth.user.role !== 'admin' && String(instance.creator) !== String(req.auth.user._id))
      throw new Error('insufficient permission');
    if (req.body.thumbnail && instance.thumbnail && String(req.body.thumbnail) !== String(instance.thumbnail)) {
      const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;
      await File.findByIdAndDelete(instance.thumbnail);
    }
    return await CyberiaInstance.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  },
  /**
   * Central portal connector endpoint.
   *
   * Delegates topology computation to the pure-function `connectPortals()`
   * from cyberia-portal-connector.js so the same logic can be used by the
   * GUI without a DB dependency.
   *
   * Builds a minimal ring connecting all maps and assigns random portal
   * subtypes to remaining portals.  Does NOT generate procedural entities —
   * entity generation is handled exclusively by the fallback world logic
   * (cyberia-world-generator.js).
   *
   *   ?persist=true  — save generated portals to DB
   */
  portalConnect: async (req, res, options) => {
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    const CyberiaMap = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaMap;

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
      await CyberiaInstance.findByIdAndUpdate(req.params.id, { portals: result.portals });
    }

    return {
      ...result,
      persisted: persist,
    };
  },

  delete: async (req, res, options) => {
    /** @type {import('./cyberia-instance.model.js').CyberiaInstanceModel} */
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    if (req.params.id) {
      const instance = await CyberiaInstance.findById(req.params.id);
      if (!instance) throw new Error('instance not found');
      if (req.auth.user.role !== 'admin' && String(instance.creator) !== String(req.auth.user._id))
        throw new Error('insufficient permission');
      if (instance.thumbnail) {
        const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;
        await File.findByIdAndDelete(instance.thumbnail);
      }
      return await CyberiaInstance.findByIdAndDelete(req.params.id);
    } else return await CyberiaInstance.deleteMany();
  },

  /**
   * Return an in-memory procedural fallback world.
   *
   * Nothing is persisted to MongoDB.  The world is regenerated on every
   * call but stays deterministic for a given seed.
   *
   * Query params:
   *   ?mapCount=<number>       — maps to generate  (default: 4)
   *   ?botCount=<number>       — bots per map      (random 8–16 if omitted)
   *   ?obstacleCount=<number>  — obstacles per map  (random 12–20 if omitted)
   *   ?foregroundCount=<number>— foreground per map (random 6–12 if omitted)
   */
  fallbackWorld: async (req) => {
    const q = req.query || {};
    return generateFallbackWorld({
      mapCount: q.mapCount ? parseInt(q.mapCount, 10) : undefined,
      botCount: q.botCount ? parseInt(q.botCount, 10) : undefined,
      obstacleCount: q.obstacleCount ? parseInt(q.obstacleCount, 10) : undefined,
      foregroundCount: q.foregroundCount ? parseInt(q.foregroundCount, 10) : undefined,
    });
  },
};

export { CyberiaInstanceService };
