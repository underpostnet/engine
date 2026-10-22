import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';

class CyberiaMarketListingService {
  static get = async (req, res, options) => {
    const MarketListing = DataBaseProviderService.getModel('CyberiaMarketListing', options);
    if (req.params.id)
      return await MarketListing.findOne(DataQuery.naturalKeyFilter('listingId', req.params.id)).lean();
    return await DataQuery.findPage(MarketListing, req.query);
  };
}

export { CyberiaMarketListingService };
