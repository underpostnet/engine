import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaGameSessionService {
  static get = async (req, res, options) => {
    const CyberiaGameSession = DataBaseProviderService.getModel('CyberiaGameSession', options);
    if (req.params.id) return await CyberiaGameSession.findById(req.params.id).lean();
    return await DataQuery.findPage(CyberiaGameSession, req.query);
  };
}

export { CyberiaGameSessionService };
