import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaEconomyOperationService {
  static get = async (req, res, options) => {
    const Operation = DataBaseProviderService.getModel('CyberiaEconomyOperation', options);
    if (req.params.id) return await Operation.findOne(DataQuery.naturalKeyFilter('operationId', req.params.id)).lean();
    return await DataQuery.findPage(Operation, req.query);
  };
}

export { CyberiaEconomyOperationService };
