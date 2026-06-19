import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';

const logger = loggerFactory(import.meta);

class CyberiaSagaService {
  static post = async (req, res, options) => {
    /** @type {import('./cyberia-saga.model.js').CyberiaSagaModel} */
    const CyberiaSaga = DataBaseProviderService.getModel("CyberiaSaga", options);
    return await new CyberiaSaga(req.body).save();
  };
  static get = async (req, res, options) => {
    /** @type {import('./cyberia-saga.model.js').CyberiaSagaModel} */
    const CyberiaSaga = DataBaseProviderService.getModel("CyberiaSaga", options);
    if (req.params.id) return await CyberiaSaga.findById(req.params.id);

    // Parse query parameters using DataQuery helper
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaSaga.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaSaga.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };
  static put = async (req, res, options) => {
    /** @type {import('./cyberia-saga.model.js').CyberiaSagaModel} */
    const CyberiaSaga = DataBaseProviderService.getModel("CyberiaSaga", options);
    return await CyberiaSaga.findByIdAndUpdate(req.params.id, req.body);
  };
  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-saga.model.js').CyberiaSagaModel} */
    const CyberiaSaga = DataBaseProviderService.getModel("CyberiaSaga", options);
    if (req.params.id) return await CyberiaSaga.findByIdAndDelete(req.params.id);
    else return await CyberiaSaga.deleteMany();
  };
}

export { CyberiaSagaService };
