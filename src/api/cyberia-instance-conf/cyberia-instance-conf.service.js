import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

const CyberiaInstanceConfService = {
  post: async (req, res, options) => {
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstanceConf;
    return await new CyberiaInstanceConf(req.body).save();
  },
  get: async (req, res, options) => {
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstanceConf;
    if (req.params.id) return await CyberiaInstanceConf.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaInstanceConf.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaInstanceConf.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  },
  put: async (req, res, options) => {
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstanceConf;
    return await CyberiaInstanceConf.findByIdAndUpdate(req.params.id, req.body);
  },
  delete: async (req, res, options) => {
    /** @type {import('./cyberia-instance-conf.model.js').CyberiaInstanceConfModel} */
    const CyberiaInstanceConf = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.CyberiaInstanceConf;
    if (req.params.id) return await CyberiaInstanceConf.findByIdAndDelete(req.params.id);
    else return await CyberiaInstanceConf.deleteMany();
  },
};

export { CyberiaInstanceConfService };
