import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaMarketClaimService {
  static get = async (req, res, options) => {
    const MarketClaim = DataBaseProviderService.getModel('CyberiaMarketClaim', options);
    if (req.params.id) return await MarketClaim.findOne(DataQuery.naturalKeyFilter('claimId', req.params.id)).lean();
    return await DataQuery.findPage(MarketClaim, req.query);
  };
}

export { CyberiaMarketClaimService };
