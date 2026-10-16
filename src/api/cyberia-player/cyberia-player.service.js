import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaPlayerService {
  static get = async (req, res, options) => {
    const CyberiaPlayer = DataBaseProviderService.getModel('CyberiaPlayer', options);
    if (req.params.id) return await CyberiaPlayer.findById(req.params.id).lean();
    return await DataQuery.findPage(CyberiaPlayer, req.query);
  };
}

export { CyberiaPlayerService };
