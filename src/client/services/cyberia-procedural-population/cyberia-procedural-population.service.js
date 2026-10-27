import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-procedural-population';

const send = (url, method, body) =>
  fetch(url, {
    method,
    headers: headersFactory(),
    credentials: 'include',
    ...(body !== undefined && { body: payloadFactory(body) }),
  })
    .then(async (res) => ({ code: res.status, ...(await readResponse(res)) }))
    .catch((error) => {
      logger.error(error);
      throw error;
    });

const at = (id, path) => getApiBaseUrl({ id: `${id}/${path}`, endpoint });
const targetPath = (itemId) => `targets/${encodeURIComponent(itemId)}`;

/**
 * The map population API of the Procedural Engine: map contexts, populations, their items and
 * entries, the map draft, the entity-type defaults and the publication.
 */
class CyberiaProceduralPopulationService {
  /** A page of map summaries; `filterModel` and `sortModel` apply on the server. */
  static getMaps = (options = {}) =>
    send(buildQueryUrl(getApiBaseUrl({ id: 'maps', endpoint }), options).toString(), 'GET');

  /** The context a population of a map (`code`) would read now. */
  static getMapContext = (options = { code: '' }) =>
    send(getApiBaseUrl({ id: `maps/${encodeURIComponent(options.code)}`, endpoint }), 'GET');

  /** Creates the population of `{ mapCode, seed? }`; equal inputs answer the same population. */
  static post = (options = { body: {} }) => send(getApiBaseUrl({ endpoint }), 'POST', options.body);

  /** One population (`id`), or a page of populations. */
  static get = (options = {}) =>
    send(buildQueryUrl(getApiBaseUrl({ id: options.id, endpoint }), options).toString(), 'GET');

  /** Where each target of a population runs now besides its map. */
  static getImpact = (options = { id: '' }) => send(at(options.id, 'impact'), 'GET');

  /** Adds an item `{ itemId, stage?, itemType?, cid? }`, or restores a removed one. */
  static addTarget = (options = { id: '', body: {} }) => send(at(options.id, 'targets'), 'POST', options.body);

  /** Sets `{ resolution?, templateId?, palette?, variation? }` of an item. */
  static updateTarget = (options = { id: '', itemId: '', body: {} }) =>
    send(at(options.id, targetPath(options.itemId)), 'PATCH', options.body);

  /** Removes an item from the population with `reason`; its runs stop and stay. */
  static removeTarget = (options = { id: '', itemId: '', reason: '' }) =>
    send(at(options.id, targetPath(options.itemId)), 'DELETE', { reason: options.reason ?? '' });

  /** Forgets a removed item permanently: only its entry in the removed list goes. */
  static forgetRemoved = (options = { id: '', itemId: '' }) =>
    send(at(options.id, `removed/${encodeURIComponent(options.itemId)}`), 'DELETE', {});

  /** Resets the workflow of an item to a clean start: answers the population and its `reset` report. */
  static resetTarget = (options = { id: '', itemId: '' }) =>
    send(at(options.id, `${targetPath(options.itemId)}/reset`), 'POST', {});

  /** Generates `count` new results of an item from its configuration. */
  static generate = (options = { id: '', itemId: '', count: 1 }) =>
    send(at(options.id, `${targetPath(options.itemId)}/generate`), 'POST', { count: options.count ?? 1 });

  /** The results of an item with the actions each takes, how many it keeps and the most it may keep. */
  static getResults = (options = { id: '', itemId: '' }) =>
    send(at(options.id, `${targetPath(options.itemId)}/results`), 'GET');

  /** Deletes the results `ids` of an item: answers the population and its `deleted` report. */
  static deleteResults = (options = { id: '', itemId: '', ids: [] }) =>
    send(at(options.id, `${targetPath(options.itemId)}/results/delete`), 'POST', { ids: options.ids });

  /** A page of the stored definitions of an item its results do not show. */
  static getTargetDefinitions = (options = { id: '', itemId: '' }) =>
    send(buildQueryUrl(at(options.id, `${targetPath(options.itemId)}/definitions`), options).toString(), 'GET');

  /** Uses the generated result `{ entryId, cid }` of an item. */
  static select = (options = { id: '', itemId: '', body: {} }) =>
    send(at(options.id, `${targetPath(options.itemId)}/select`), 'POST', options.body);

  /** Runs a failed result of an item again under its own seed. */
  static retryEntry = (options = { id: '', itemId: '', entryId: '' }) =>
    send(at(options.id, `${targetPath(options.itemId)}/entries/${options.entryId}/retry`), 'POST', {});

  /** What a bulk palette change `{ itemIds, source, paletteId?, overrides }` gives each item. */
  static previewPalette = (options = { id: '', body: {} }) =>
    send(at(options.id, 'palette/preview'), 'POST', options.body);

  /** Applies a bulk palette change. */
  static applyPalette = (options = { id: '', body: {} }) => send(at(options.id, 'palette'), 'POST', options.body);

  /** The map draft of a population, with the CID that draws each item. */
  static getDraft = (options = { id: '' }) => send(at(options.id, 'draft'), 'GET');

  /** Saves the map draft: `body` is `{ grid, entities, revision, baseRevision }`. */
  static saveDraft = (options = { id: '', body: {} }) => send(at(options.id, 'draft'), 'PUT', options.body);

  static discardDraft = (options = { id: '' }) => send(at(options.id, 'draft'), 'DELETE');

  /** Moves the draft onto `{ mapRevision }` reviewed, at draft `{ revision }`. */
  static rebaseDraft = (options = { id: '', body: {} }) => send(at(options.id, 'draft/rebase'), 'POST', options.body);

  /** The entity-type defaults workspace: the rows of the staged items, the items no row names, the removed rows. */
  static getDefaults = (options = { id: '' }) => send(at(options.id, 'defaults'), 'GET');

  /** Adds the stored row `rowId` to the workspace. */
  static addDefault = (options = { id: '', rowId: '' }) =>
    send(at(options.id, 'defaults'), 'POST', { rowId: options.rowId });

  /** Removes the row `rowId` from the workspace; the row stays as it is. */
  static removeDefault = (options = { id: '', rowId: '' }) =>
    send(at(options.id, `defaults/${options.rowId}`), 'DELETE');

  /** What a publication would do now; `body` is `{ acknowledged }`. */
  static validate = (options = { id: '', body: {} }) => send(at(options.id, 'validate'), 'POST', options.body ?? {});

  /** Starts the publication; `body` is `{ acknowledged }`. */
  static publish = (options = { id: '', body: {} }) => send(at(options.id, 'publish'), 'POST', options.body ?? {});

  /** Resumes the phase of the publication that failed. */
  static retryPublication = (options = { id: '' }) => send(at(options.id, 'publication/retry'), 'POST', {});

  /** Cancels the publication before its commit. */
  static cancelPublication = (options = { id: '' }) => send(at(options.id, 'publication/cancel'), 'POST', {});

  static cancel = (options = { id: '' }) => send(at(options.id, 'cancel'), 'POST', {});

  /** Deletes a population and the job of each target. */
  static delete = (options = { id: '' }) => send(getApiBaseUrl({ id: options.id, endpoint }), 'DELETE');
}

export { CyberiaProceduralPopulationService };
