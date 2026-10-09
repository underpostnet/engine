import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, buildQueryUrl, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'cyberia-procedural-profile';

const read = (url) =>
  fetch(url, { method: 'GET', headers: headersFactory(), credentials: 'include' })
    .then(readResponse)
    .catch((error) => {
      logger.error(error);
      throw error;
    });

class CyberiaProceduralProfileService {
  /** One profile (`id`), or a page of profiles. */
  static get = (options = {}) => read(buildQueryUrl(getApiBaseUrl({ id: options.id, endpoint }), options).toString());

  /** What a request is built from: generators, Genesis Templates, the palette catalog and the limits. */
  static getConfig = () => read(getApiBaseUrl({ id: 'config', endpoint }));

  /** The palette a create starts from with a Genesis Template (`id`), under the Palette Template `paletteId` names. */
  static getTemplatePalette = (options = { id: '', paletteId: '' }) => {
    const url = new URL(getApiBaseUrl({ id: `templates/${encodeURIComponent(options.id)}/palette`, endpoint }));
    if (options.paletteId) url.searchParams.set('paletteId', options.paletteId);
    return read(url.toString());
  };

  /** A random color for each color slot of a Genesis Template (`id`). */
  static getRandomSlots = (options = { id: '' }) =>
    read(getApiBaseUrl({ id: `templates/${encodeURIComponent(options.id)}/random-slots`, endpoint }));
}

export { CyberiaProceduralProfileService };
