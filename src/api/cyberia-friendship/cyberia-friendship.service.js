import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaFriendshipService {
  static get = async (req, res, options) => {
    const CyberiaFriendship = DataBaseProviderService.getModel('CyberiaFriendship', options);
    if (req.params.id) return await CyberiaFriendship.findById(req.params.id).lean();
    return await DataQuery.findPage(CyberiaFriendship, req.query);
  };
}

export { CyberiaFriendshipService };
