import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaSocialService {
  static get = async (req, res, options) => {
    const CyberiaSocial = DataBaseProviderService.getModel('CyberiaSocial', options);
    if (req.params.id) return await CyberiaSocial.findById(req.params.id).lean();
    return await DataQuery.findPage(CyberiaSocial, req.query);
  };
}

export { CyberiaSocialService };
