import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaSocialProfileService {
  static get = async (req, res, options) => {
    const CyberiaSocialProfile = DataBaseProviderService.getModel('CyberiaSocialProfile', options);
    if (req.params.id) return await CyberiaSocialProfile.findById(req.params.id).lean();
    return await DataQuery.findPage(CyberiaSocialProfile, req.query);
  };
}

export { CyberiaSocialProfileService };
