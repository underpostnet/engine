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
  renderedCids,
  unboundItems,
} from '../../projects/cyberia/catalog/object-layer-catalog.js';
import {
  importDefinition,
  previewImport,
  searchAuthority,
} from '../../projects/cyberia/catalog/object-layer-import.js';
import { reloadContentServers } from '../../projects/cyberia/content/content-release.js';

/** The most item ids one resolve reads. */
const RESOLVE_LIMIT = 500;

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
   * GET `/resolve?ids=a,b`: the CID each item id runs now and whether it has a render, or null for
   * an unbound one.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object<string,{cid:string,hasRender:boolean}|null>>}
   */
  static resolve = async (req, res, options) => {
    const itemIds = [
      ...new Set(
        String(req.query.ids ?? '')
          .split(',')
          .filter(Boolean),
      ),
    ].slice(0, RESOLVE_LIMIT);
    const bindings = await DataBaseProviderService.getModel('CyberiaItemCatalog', options).resolve(itemIds);
    const rendered = await renderedCids(
      { ObjectLayerRenderFrames: DataBaseProviderService.getModel('ObjectLayerRenderFrames', options) },
      [...bindings.values()],
    );
    return Object.fromEntries(
      itemIds.map((itemId) => {
        const cid = bindings.get(itemId);
        return [itemId, cid ? { cid, hasRender: rendered.has(cid) } : null];
      }),
    );
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
   * GET `/import/search?q=`: the canonical definitions of the Object Layer authority whose item id
   * holds `q`, or the one `q` names by its CID.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{data:Object[]}>}
   */
  static importSearch = async (req, res, options) => await searchAuthority({ q: req.query.q });

  /**
   * GET `/import/:cid?itemId=`: what an import of a definition of the authority would do. Stores nothing.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static importPreview = async (req, res, options) =>
    await previewImport(catalogModels(options), { cid: req.params.cid, itemId: req.query.itemId }, options);

  /**
   * POST `/import/preview`: what an import of a definition document would do, `{ document, itemId? }`.
   * Stores nothing.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static importDocumentPreview = async (req, res, options) =>
    await previewImport(catalogModels(options), { document: req.body?.document, itemId: req.body?.itemId }, options);

  /**
   * POST `/import`: imports a definition into the live content, `{ cid | document, itemId?, bind?,
   * expectedCid?, replace?, acknowledged }`. With `bind`, it binds the item to it.
   * @param {Object} req - Express request.
   * @param {Object} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<Object>}
   */
  static importDefinition = async (req, res, options) =>
    await importDefinition(
      catalogModels(options),
      {
        cid: req.body?.cid,
        document: req.body?.document,
        itemId: req.body?.itemId,
        bind: req.body?.bind,
        expectedCid: req.body?.expectedCid,
        replace: req.body?.replace,
        acknowledged: req.body?.acknowledged,
        actor: req.auth.user._id,
      },
      options,
      (host) => reloadContentServers(host, { mode: 'incremental' }),
    );

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
