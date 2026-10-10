/**
 * CyberiaItemCatalog service: the active runtime binding of each Cyberia item, the one place the
 * definition an item runs changes.
 *
 * @module src/api/cyberia-item-catalog/cyberia-item-catalog.service.js
 * @namespace CyberiaItemCatalogService
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { objectLayerCache } from '../object-layer/object-layer.publication.js';
import { objectLayerIpfsState, objectLayerMfsPaths } from '../object-layer/object-layer.ipfs.js';
import { CyberiaItemCatalogDto } from './cyberia-item-catalog.model.js';
import { CacheService } from '../../server/storage/cache.js';
import {
  bindItem,
  catalogModels,
  itemBindingHistory,
  listBindings,
  reconcileItemCatalog,
  unboundItems,
} from '../../projects/cyberia/catalog/object-layer-catalog.js';
import { reloadContentServers } from '../../projects/cyberia/content/content-release.js';

const bindingModels = (options) => ({
  ...catalogModels(options),
  AtlasSpriteSheet: DataBaseProviderService.getModel('AtlasSpriteSheet', options),
});

class CyberiaItemCatalogService {
  /**
   * GET `/` (a page of bindings with the state of each, see `listBindings`) or `/:id` (one binding).
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static get = async (req, res, options) => {
    const CyberiaItemCatalog = DataBaseProviderService.getModel('CyberiaItemCatalog', options);
    if (req.params.id) {
      const entry = await CyberiaItemCatalog.findOne({ itemId: req.params.id }).select(
        CyberiaItemCatalogDto.select.get(),
      );
      if (!entry) throw new Error('Item is not bound');
      return entry;
    }
    const page = DataQuery.parse(req.query);
    const { data, total } = await listBindings(bindingModels(options), page);
    return { data, total, page: page.page, totalPages: Math.ceil(total / page.limit) };
  };

  /**
   * GET `/unbound?q=`: the items a bind can add, see `unboundItems`.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{items:Array<{itemId:string,itemType:string,definitions:number}>}>}
   */
  static unbound = async (req, res, options) => ({
    items: await unboundItems(catalogModels(options), { q: String(req.query.q ?? '').trim() }),
  });

  /**
   * GET `/:id/history`: the binding history of an item and the definitions it could run.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static history = async (req, res, options) => await itemBindingHistory(catalogModels(options), req.params.id);

  /**
   * GET `/:id/diagnostics`: how a definition of an item is stored on IPFS, `?cid=` or the one the
   * item runs: for each file its CID, MFS path, registry record, Kubo pin, Cluster pin and the CID
   * its path lists.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{itemId:string,objectLayerCid:string,cid:string,root:string,files:Array}>}
   */
  static diagnostics = async (req, res, options) => {
    const models = catalogModels(options);
    const entry = await models.CyberiaItemCatalog.findOne({ itemId: req.params.id }, { objectLayerCid: 1 }).lean();
    const cid = req.query.cid || entry?.objectLayerCid;
    const definition = cid ? await models.ObjectLayer.findOne({ cid }).lean() : null;
    if (!definition)
      throw Object.assign(new Error(`No stored definition ${cid || `for ${req.params.id}`}`), { status: 404 });
    return {
      itemId: req.params.id,
      objectLayerCid: entry?.objectLayerCid ?? '',
      cid,
      root: objectLayerMfsPaths(cid).root,
      files: await objectLayerIpfsState({ definition, options }),
    };
  };

  /**
   * POST `/`: binds an item to a definition, `{ itemId, objectLayerCid, expectedCid }`.
   * `expectedCid` is the definition the moderator saw the item run, empty for an unbound item; a
   * binding made meanwhile answers 409. The game servers then reload their object layers.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>} The catalog entry.
   */
  static post = async (req, res, options) => {
    const { itemId, objectLayerCid, expectedCid } = req.body;
    if (expectedCid === undefined)
      throw new Error('expectedCid is required: the cid the item runs, or empty when it is unbound');
    const entry = await bindItem({
      models: catalogModels(options),
      itemId,
      objectLayerCid,
      expectedCid,
      source: 'studio',
      by: String(req.auth.user._id),
      options,
    });
    void reloadContentServers(options, { mode: 'incremental' });
    return entry;
  };

  /**
   * POST `/reconcile`: unbinds every item whose definition the Object Layer authority no longer
   * offers. Idempotent.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{checked:number,unbound:Array}>}
   */
  static reconcile = async (req, res, options) => await reconcileItemCatalog(catalogModels(options), options);

  /**
   * DELETE `/:itemId`: unbinds an item.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static delete = async (req, res, options) => {
    const CyberiaItemCatalog = DataBaseProviderService.getModel('CyberiaItemCatalog', options);
    if (!req.params.id) throw new Error('Item id is required');
    const removed = await CyberiaItemCatalog.findOneAndDelete({ itemId: req.params.id });
    if (!removed) throw new Error('Item is not bound');
    await CacheService.invalidate(objectLayerCache(options));
    return removed;
  };
}

export { CyberiaItemCatalogService };
