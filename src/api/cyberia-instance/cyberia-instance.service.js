import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

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
   * Heuristic portal connector.
   *
   * Given an instance ID, loads all its maps from MongoDB, extracts the first
   * `portal`-type entity from each map, and builds a **minimal circular ring**:
   *
   *   A → B → C → … → A
   *
   * Each directed edge uses:
   *   - sourceCell = first portal entity coords of the source map (fallback 0,0)
   *   - targetCell = first portal entity coords of the target map (= landing spot)
   *
   * If only 1 map exists no portals are possible (returns []).
   * If 2 maps exist, a bidirectional pair A↔B is returned.
   * For N ≥ 2 maps the result is always a directed Hamiltonian cycle
   * using exactly N edges (minimal circular graph).
   */
  portalConnect: async (req, res, options) => {
    const CyberiaInstance = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstance;
    const CyberiaMap = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaMap;

    const instance = await CyberiaInstance.findById(req.params.id).lean();
    if (!instance) throw new Error('instance not found');

    const mapCodes = instance.cyberiaMapCodes || [];
    if (mapCodes.length < 2) return { portals: [], topology: 'none', message: 'Need at least 2 maps to connect.' };

    // Load all maps — only fetch portal entities to keep the query light
    const mapDocs = await CyberiaMap.find(
      { code: { $in: mapCodes } },
      { code: 1, 'entities.entityType': 1, 'entities.initCellX': 1, 'entities.initCellY': 1 },
    ).lean();

    // Index: mapCode → first portal entity (or null)
    const portalEntityByCode = {};
    for (const doc of mapDocs) {
      const portalEnt = (doc.entities || []).find((e) => e.entityType === 'portal');
      portalEntityByCode[doc.code] = portalEnt || null;
    }

    // Build ordered list preserving instance.cyberiaMapCodes order so the
    // ring follows the order the user placed the maps.
    const ordered = mapCodes.filter((c) => portalEntityByCode[c] !== undefined || !mapDocs.find((d) => d.code !== c));
    const n = ordered.length;
    if (n < 2) return { portals: [], topology: 'none', message: 'Need at least 2 maps to connect.' };

    const portals = [];
    for (let i = 0; i < n; i++) {
      const srcCode = ordered[i];
      const tgtCode = ordered[(i + 1) % n];
      const srcEnt = portalEntityByCode[srcCode];
      const tgtEnt = portalEntityByCode[tgtCode];
      portals.push({
        sourceMapCode: srcCode,
        sourceCellX: srcEnt?.initCellX ?? 0,
        sourceCellY: srcEnt?.initCellY ?? 0,
        targetMapCode: tgtCode,
        targetCellX: tgtEnt?.initCellX ?? 0,
        targetCellY: tgtEnt?.initCellY ?? 0,
      });
    }

    const topology = n === 2 ? 'bidirectional' : 'circular';
    return { portals, topology, mapCount: n };
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
};

export { CyberiaInstanceService };
