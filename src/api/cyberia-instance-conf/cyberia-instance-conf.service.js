import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  fillInstanceConfDefaults,
  resolveProgressionRules,
} from '../cyberia-server-defaults/cyberia-server-defaults.js';

const logger = loggerFactory(import.meta);

const readPath = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);

const writePath = (object, path, value) => {
  const keys = path.split('.');
  let node = object;
  for (const key of keys.slice(0, -1)) {
    if (node[key] == null || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[keys.at(-1)] = value;
};

/* The canonical default for a path, or for the nearest ancestor that has one: a value nested
 * inside an array element has no default of its own, so the whole array falls back. */
const defaultFor = (path) => {
  const keys = path.split('.');
  for (let depth = keys.length; depth > 0; depth--) {
    const candidate = keys.slice(0, depth).join('.');
    const value = readPath(CYBERIA_INSTANCE_CONF_DEFAULTS, candidate);
    if (value !== undefined) return { path: candidate, value: structuredClone(value) };
  }
  return null;
};

const validationPaths = async (Model, conf) => {
  try {
    await new Model(conf).validate();
    return [];
  } catch (error) {
    return Object.keys(error?.errors ?? {});
  }
};

class CyberiaInstanceConfService {
  /**
   * Makes a conf whole and valid: fills every missing field, then resets every field the schema
   * rejects to its canonical default.
   *
   * A backup written before a bound tightened, or edited by hand, must still round-trip: the
   * world it describes is worth more than one stale number in it, and resetting that number is
   * what an operator would do by hand. Each reset is logged by path so the decision is visible.
   * A default the schema itself rejects is a code fault, not bad data, and still throws.
   *
   * @param {object} conf - Conf as read from a backup or from the database.
   * @param {import('mongoose').Model} CyberiaInstanceConf - The model whose schema decides.
   * @returns {Promise<{conf: object, resets: Array<{path: string, from: unknown, to: unknown}>}>}
   */
  static async coerceToSchema(conf, CyberiaInstanceConf) {
    const out = fillInstanceConfDefaults(conf);
    const resets = [];
    // One pass resets the rejected paths; the second proves the defaults themselves pass.
    for (let pass = 0; pass < 2; pass++) {
      const failing = await validationPaths(CyberiaInstanceConf, out);
      if (failing.length === 0) return { conf: out, resets };
      if (pass === 1) throw new Error(`CyberiaInstanceConf defaults fail validation at: ${failing.join(', ')}`);
      for (const path of failing) {
        const fallback = defaultFor(path);
        if (!fallback) throw new Error(`CyberiaInstanceConf has no default to reset "${path}" to`);
        const from = readPath(out, fallback.path);
        writePath(out, fallback.path, fallback.value);
        resets.push({ path: fallback.path, from, to: fallback.value });
        logger.warn(`CyberiaInstanceConf "${fallback.path}" reset to default`, { from, to: fallback.value });
      }
    }
    return { conf: out, resets };
  }

  static post = async (req, res, options) => {
    if (Object.hasOwn(req.body, 'progressionRules')) req.body.progressionRules = resolveProgressionRules(req.body.progressionRules);
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf =
      DataBaseProviderService.getModel("CyberiaInstanceConf", options);
    return await new CyberiaInstanceConf(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf =
      DataBaseProviderService.getModel("CyberiaInstanceConf", options);
    if (req.params.id) return await CyberiaInstanceConf.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaInstanceConf.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaInstanceConf.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    if (Object.hasOwn(req.body, 'progressionRules')) req.body.progressionRules = resolveProgressionRules(req.body.progressionRules);
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf =
      DataBaseProviderService.getModel("CyberiaInstanceConf", options);
    return await CyberiaInstanceConf.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf =
      DataBaseProviderService.getModel("CyberiaInstanceConf", options);
    if (req.params.id) return await CyberiaInstanceConf.findByIdAndDelete(req.params.id);
    else return await CyberiaInstanceConf.deleteMany();
  };
}

export { CyberiaInstanceConfService };
