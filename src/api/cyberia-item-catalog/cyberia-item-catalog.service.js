/**
 * CyberiaItemCatalog service: which Object Layer definition each Cyberia item label runs on.
 *
 * @module src/api/cyberia-item-catalog/cyberia-item-catalog.service.js
 * @namespace CyberiaItemCatalogService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { resolveObjectLayer } from '../../server/domain/object-layer-resolver.js';
import { cacheCanonical, isObjectLayerAuthority, objectLayerCache } from '../object-layer/object-layer.publication.js';
import { CyberiaItemCatalogDto } from './cyberia-item-catalog.model.js';
import { CacheService } from '../../server/storage/cache.js';
import { catalogModels, reconcileItemCatalog } from '../../projects/cyberia/object-layer-catalog.js';

class CyberiaItemCatalogService {
  /**
   * GET `/` (paginated) or `/:itemId` (one binding).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const CyberiaItemCatalog = DataBaseProviderService.getModel('CyberiaItemCatalog', options);
    const select = CyberiaItemCatalogDto.select.get();
    if (req.params.id) {
      const entry = await CyberiaItemCatalog.findOne({ itemId: req.params.id }).select(select);
      if (!entry) throw new Error('Item label is not bound');
      return entry;
    }
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
    const [data, total] = await Promise.all([
      CyberiaItemCatalog.find(query).sort(sort).limit(limit).skip(skip).select(select),
      CyberiaItemCatalog.countDocuments(query),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };

  /**
   * POST `/`: binds a label to a stored definition `{ itemId, objectLayerCid }`.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static post = async (req, res, options) => {
    const CyberiaItemCatalog = DataBaseProviderService.getModel('CyberiaItemCatalog', options);
    const { itemId, objectLayerCid } = req.body;
    // A label binds only to a published definition: the authority holds it. A consumer keeps
    // its cached copy so the runtime serves the label.
    const definition = await resolveObjectLayer(objectLayerCid, options);
    if (!definition) throw new Error(`No Object Layer definition with cid ${objectLayerCid}`);
    if (definition.origin === 'draft') throw new Error(`Object Layer ${objectLayerCid} is a draft; publish it first`);
    if (definition.archivedAt) throw new Error(`Object Layer ${objectLayerCid} is archived at the authority`);
    if (!isObjectLayerAuthority(options)) {
      const ObjectLayer = DataBaseProviderService.getModel('ObjectLayer', options);
      await cacheCanonical({ ObjectLayer, cid: objectLayerCid, definition, options });
    }
    const bound = await CyberiaItemCatalog.bind(itemId || definition.data.item.id, objectLayerCid);
    await CacheService.invalidate(objectLayerCache(options));
    return bound;
  };

  /**
   * POST `/reconcile`: unbinds every label whose definition the Object Layer authority no
   * longer offers. Idempotent.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{checked:number,unbound:Array}>}
   */
  static reconcile = async (req, res, options) => await reconcileItemCatalog(catalogModels(options), options);

  /**
   * DELETE `/:itemId`: unbinds a label.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static delete = async (req, res, options) => {
    const CyberiaItemCatalog = DataBaseProviderService.getModel('CyberiaItemCatalog', options);
    if (!req.params.id) throw new Error('Item label is required');
    const removed = await CyberiaItemCatalog.findOneAndDelete({ itemId: req.params.id });
    if (!removed) throw new Error('Item label is not bound');
    await CacheService.invalidate(objectLayerCache(options));
    return removed;
  };
}

export { CyberiaItemCatalogService };
