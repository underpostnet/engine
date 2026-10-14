import { loggerFactory } from '../../components/core/Logger.js';
import { getApiBaseUrl, headersFactory, payloadFactory, readResponse } from '../core/core.service.js';
const logger = loggerFactory(import.meta);
logger.info('Load service');
const endpoint = 'google-auth';

/** Posts the flow of a finished Google sign-in. The answer carries its HTTP status as `code`. */
const postFlow = (id, flow) =>
  fetch(getApiBaseUrl({ id, endpoint }), {
    method: 'POST',
    headers: headersFactory(),
    credentials: 'include',
    body: payloadFactory({ flow }),
  })
    .then(async (res) => ({ ...(await readResponse(res)), code: res.status }))
    .catch((error) => {
      logger.error(error);
      return { status: 'error', message: error.message, code: 0 };
    });

class GoogleAuthService {
  /** Where the browser goes to start Google sign-in from a view: `log-in` or `sign-up`. */
  static signInUrl = (view) => `${getApiBaseUrl({ endpoint })}?${new URLSearchParams({ view })}`;

  /** Exchanges the ticket of a flow for a session: `{ status, data: { token, user } }`. */
  static session = (flow) => postFlow('session', flow);

  /** Links the Google account of a flow to the signed-in user: `{ status, data: { user } }`. */
  static link = (flow) => postFlow('link', flow);
}

export { GoogleAuthService };
