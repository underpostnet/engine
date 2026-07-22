/**
 * Hot-reload trigger — engine-cyberia → cyberia-server control channel.
 *
 * Asks a running cyberia-server to rebuild its world NOW instead of waiting
 * for its polling loop (ENGINE_GRPC_RELOAD_INTERVAL_SEC). Two transports, in
 * order:
 *
 *   1. gRPC  — cyberia-server's CyberiaControlService. Preferred.
 *   2. REST  — POST {baseUrl}/api/v1/hot-reload. Fallback when the control
 *              gRPC port is unreachable (not exposed, different network).
 *
 * The gRPC control service is served with a JSON codec, so this client is
 * hand-rolled with makeUnaryRequest + JSON serializers — no .proto codegen on
 * either side. Keep SERVICE/METHOD in sync with cyberia-server/hotreload/grpc.go.
 *
 * AUTHORIZATION
 * -------------
 * Both transports carry CYBERIA_SERVER_API_KEY, the INTERNAL shared secret
 * between engine-cyberia and cyberia-server. It is read from the environment
 * here and never returned to a browser: the engine's REST endpoint is the only
 * public surface, and it is moderator/admin guarded.
 *
 * @module src/projects/cyberia/hot-reload-trigger.js
 */

import * as grpc from '@grpc/grpc-js';
import { loggerFactory } from '../../server/logger.js';

const logger = loggerFactory(import.meta);

const SERVICE = 'cyberia.CyberiaControlService';
const METHOD = 'TriggerHotReload';
const FULL_METHOD = `/${SERVICE}/${METHOD}`;

const DEFAULT_GRPC_PORT = 50052;
const DEFAULT_TIMEOUT_MS = 20000;

const jsonSerialize = (value) => Buffer.from(JSON.stringify(value ?? {}));
const jsonDeserialize = (buffer) => JSON.parse(Buffer.from(buffer).toString('utf8') || '{}');

/** The internal shared secret; empty when the deploy has not configured one. */
const serverApiKey = () => process.env.CYBERIA_SERVER_API_KEY || '';

/**
 * Split a user-supplied server URL into the REST base URL and the gRPC target.
 *
 * Accepts `https://server.cyberiaonline.com`, a variant sub-path
 * (`https://server.cyberiaonline.com/FOREST`), `localhost:8081`, or an explicit
 * gRPC target. The gRPC host reuses the hostname with the control port, since
 * the control service listens on its own port.
 *
 * The URL sub-path is preserved as `basePath` ("", "/FOREST", "/TEST") and kept
 * on `restBaseUrl`: a path-based multi-instance proxy routes the REST trigger to
 * the right variant by that prefix (then strips it via pathRewritePolicy, so the
 * backend matches its own instanceCode). Using `url.origin` alone would drop the
 * sub-path and land every trigger on the default (root) deployment.
 */
const resolveTargets = (rawUrl, { grpcPort = DEFAULT_GRPC_PORT } = {}) => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) throw new Error('server URL is required');

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  const basePath = url.pathname.replace(/\/+$/, '');
  const restBaseUrl = `${url.origin}${basePath}`;
  const grpcTarget = `${url.hostname}:${grpcPort}`;
  return { restBaseUrl, grpcTarget, basePath };
};

/** Trigger over the gRPC control service. Rejects on any transport error. */
const triggerViaGrpc = ({ grpcTarget, apiKey, mode, instanceCode, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const client = new grpc.Client(grpcTarget, grpc.credentials.createInsecure());
    const deadline = new Date(Date.now() + timeoutMs);
    client.makeUnaryRequest(
      FULL_METHOD,
      jsonSerialize,
      jsonDeserialize,
      { apiKey, mode, instanceCode },
      new grpc.Metadata(),
      { deadline },
      (error, response) => {
        client.close();
        if (error) return reject(error);
        resolve(response);
      },
    );
  });

/** Trigger over the REST fallback. */
const triggerViaRest = async ({ restBaseUrl, apiKey, mode, instanceCode, timeoutMs }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${restBaseUrl}/api/v1/hot-reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cyberia-Server-Api-Key': apiKey },
      body: JSON.stringify({ mode, instanceCode }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.title || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Trigger a hot reload on a cyberia-server, preferring gRPC.
 *
 * @param {object} params
 * @param {string} params.serverUrl        Target server (origin or host:port).
 * @param {string} [params.instanceCode]   Guard: server rejects a mismatch.
 * @param {'full'|'incremental'} [params.mode='full']
 * @param {number} [params.grpcPort=50052]
 * @param {number} [params.timeoutMs=20000]
 * @returns {Promise<{transport:'grpc'|'rest', result:object, grpcError?:string}>}
 */
const triggerHotReload = async ({
  serverUrl,
  instanceCode = '',
  mode = 'full',
  grpcPort = DEFAULT_GRPC_PORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
  const apiKey = serverApiKey();
  if (!apiKey) {
    throw new Error('CYBERIA_SERVER_API_KEY is not configured on engine-cyberia — hot reload is disabled');
  }
  const { restBaseUrl, grpcTarget, basePath } = resolveTargets(serverUrl, { grpcPort });
  const call = { apiKey, mode, instanceCode, timeoutMs };

  // A path-based multi-instance proxy routes by URL sub-path, but a gRPC method
  // path is fixed (/cyberia.CyberiaControlService/…) and can't carry the
  // /FOREST prefix — a control call to hostname:port reaches the default
  // variant. When the target names a variant sub-path, use the sub-path-aware
  // REST transport directly instead of triggering the wrong world over gRPC.
  if (basePath) {
    const result = await triggerViaRest({ ...call, restBaseUrl });
    logger.info(`hot reload via REST ${restBaseUrl}: ${result?.message}`);
    return { transport: 'rest', result };
  }

  try {
    const result = await triggerViaGrpc({ ...call, grpcTarget });
    logger.info(`hot reload via gRPC ${grpcTarget}: ${result?.message}`);
    return { transport: 'grpc', result };
  } catch (grpcError) {
    // A rejected key is a real answer, not a transport failure — do not retry
    // over REST, or a misconfigured key would be reported twice.
    if (grpcError?.code === grpc.status.PERMISSION_DENIED) throw new Error(grpcError.details || grpcError.message);
    logger.warn(`hot reload gRPC (${grpcTarget}) unavailable: ${grpcError.message} — falling back to REST`);

    const result = await triggerViaRest({ ...call, restBaseUrl });
    logger.info(`hot reload via REST ${restBaseUrl}: ${result?.message}`);
    return { transport: 'rest', result, grpcError: grpcError.message };
  }
};

export { triggerHotReload, resolveTargets, SERVICE, METHOD, FULL_METHOD };
