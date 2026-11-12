import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, buildQueryUrl, readResponse } from '../core/CoreService.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-saga-workflow';

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

const at = (id, path = '') => getApiBaseUrl({ id: path ? `${id}/${path}` : id, endpoint });

/**
 * The workflow API of the Saga Engine: workflows, their narrative context, generations, candidates,
 * checks, the application to the content source and the completeness report.
 */
class CyberiaSagaWorkflowService {
  /** A page of workflow summaries, or one workflow (`id`). */
  static get = (options = {}) => {
    const { id, page, limit, filterModel, sortModel } = options;
    return send(
      buildQueryUrl(getApiBaseUrl({ id, endpoint }), { page, limit, filterModel, sortModel }).toString(),
      'GET',
    );
  };

  /** Opens the saga `{ sagaCode }` of the content source, or starts `{ context }`. */
  static post = (options = { body: {} }) => send(getApiBaseUrl({ endpoint }), 'POST', options.body);

  /** Sets fields of the narrative context of the next generation. */
  static setContext = ({ id, body }) => send(at(id, 'context'), 'PUT', body);

  /** Queues the next generation; `{ context }` sets context fields first. */
  static generate = ({ id, body = {} }) => send(at(id, 'generations'), 'POST', body);

  /** One generation with its stage results. */
  static getGeneration = ({ id, attempt }) => send(at(id, `generations/${attempt}`), 'GET');

  /** Stops a generation that waits or runs. */
  static cancelGeneration = ({ id, attempt }) => send(at(id, `generations/${attempt}/cancel`), 'POST', {});

  /** Resumes a failed or cancelled generation at its first step not done. */
  static retryGeneration = ({ id, attempt }) => send(at(id, `generations/${attempt}/retry`), 'POST', {});

  /** One candidate with its package. */
  static getCandidate = ({ id, revision }) => send(at(id, `candidates/${revision}`), 'GET');

  /** Saves `{ package, parent }` as the next candidate. */
  static saveCandidate = ({ id, body }) => send(at(id, 'candidates'), 'POST', body);

  /** The differences of `{ package }` from the candidate `{ revision }`. */
  static diff = ({ id, body }) => send(at(id, 'diff'), 'POST', body);

  /** Checks the candidate `revision` against the content source. */
  static validate = ({ id, revision }) => send(at(id, 'validate'), 'POST', { revision });

  /** Writes the checked candidate `revision` to the content source. */
  static apply = ({ id, revision }) => send(at(id, 'apply'), 'POST', { revision });

  /** Leaves the report row `key` out with a `reason`; an empty reason takes it back. */
  static exclude = ({ id, key, reason }) => send(at(id, 'exclusions'), 'PUT', { key, reason });

  /** The completeness report of a candidate, the newest by default. */
  static report = ({ id, revision }) =>
    send(`${at(id, 'report')}${revision ? `?revision=${encodeURIComponent(revision)}` : ''}`, 'GET');
}

export { CyberiaSagaWorkflowService };
