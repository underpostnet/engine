import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaWorldDropService {
  static get = async (req, res, options) => {
    const WorldDrop = DataBaseProviderService.getModel('CyberiaWorldDrop', options);
    if (req.params.id) return await WorldDrop.findOne(DataQuery.naturalKeyFilter('dropId', req.params.id)).lean();
    return await DataQuery.findPage(WorldDrop, req.query);
  };
}

export { CyberiaWorldDropService };
