import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-procedural-job';

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

const itemPath = ({ jobId, itemId }) => `${jobId}/items/${itemId}`;

/** The Procedural Engine API: a job per generation spec, its candidates, and the decisions on them. */
class CyberiaProceduralJobService {
  /** Creates the job of a generation request of either mode; an equal spec answers with the same job. */
  static post = (options = { body: {} }) => send(getApiBaseUrl({ endpoint }), 'POST', options.body);

  /** One job with its persisted counts (`id`), or a page of jobs. */
  static get = (options = {}) => {
    const url = buildQueryUrl(getApiBaseUrl({ id: options.id, endpoint }), options);
    return send(url.toString(), 'GET');
  };

  /** A page of the existing items an update can target; `filterModel` and `sortModel` apply on the server. */
  static getSources = (options = {}) =>
    send(buildQueryUrl(getApiBaseUrl({ id: 'sources', endpoint }), options).toString(), 'GET');

  /**
   * The palette an update starts from for one item (`itemId`), under the palette `paletteId`
   * names, from the Genesis Template when `fromTemplate` is set.
   */
  static getSourcePalette = (options = { itemId: '', paletteId: '', templateId: '', fromTemplate: false }) => {
    const url = new URL(getApiBaseUrl({ id: `sources/${encodeURIComponent(options.itemId)}/palette`, endpoint }));
    if (options.paletteId) url.searchParams.set('paletteId', options.paletteId);
    if (options.templateId) url.searchParams.set('templateId', options.templateId);
    if (options.fromTemplate) url.searchParams.set('fromTemplate', 'true');
    return send(url.toString(), 'GET');
  };

  /** A page of the candidates of a job; `filterModel` and `sortModel` apply on the server. */
  static getItems = (options = { jobId: '' }) =>
    send(buildQueryUrl(getApiBaseUrl({ id: `${options.jobId}/items`, endpoint }), options).toString(), 'GET');

  /** One candidate with its job and audit trail. */
  static getItem = (options) => send(getApiBaseUrl({ id: itemPath(options), endpoint }), 'GET');

  /** Deletes a job and everything it left; a job that still works is stopped first. */
  static delete = (options) => send(getApiBaseUrl({ id: options.jobId, endpoint }), 'DELETE');

  static cancel = (options) =>
    send(getApiBaseUrl({ id: `${options.jobId}/cancel`, endpoint }), 'POST', options.body ?? {});

  /** Promotes the approved candidates of a job, or one candidate when `itemId` is given. */
  static promote = (options) =>
    send(
      getApiBaseUrl({ id: options.itemId ? `${itemPath(options)}/promote` : `${options.jobId}/promote`, endpoint }),
      'POST',
      options.body ?? {},
    );

  /** A decision on one candidate: `regenerate`, `approve` (`body.cid`), `reject` or `edit`. */
  static decide = (options) =>
    send(getApiBaseUrl({ id: `${itemPath(options)}/${options.action}`, endpoint }), 'POST', options.body ?? {});
}

export { CyberiaProceduralJobService };
