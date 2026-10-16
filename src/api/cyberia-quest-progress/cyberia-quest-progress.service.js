import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaQuestProgressService {
  static get = async (req, res, options) => {
    const CyberiaQuestProgress = DataBaseProviderService.getModel('CyberiaQuestProgress', options);
    if (req.params.id) return await CyberiaQuestProgress.findById(req.params.id).lean();
    return await DataQuery.findPage(CyberiaQuestProgress, req.query);
  };
}

export { CyberiaQuestProgressService };
