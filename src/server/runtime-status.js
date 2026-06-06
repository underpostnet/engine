/**
 * Runtime status contract and the in-pod internal status endpoint.
 *
 * Single source of truth for the Underpost runtime readiness signal (Phase 2 of
 * the two-phase deployment monitor). The runtime publishes its lifecycle here;
 * the CD-side monitor (`src/cli/monitor.js`) reads it over HTTP via
 * `kubectl port-forward`. Kubernetes pod readiness (Phase 1) is owned by kubelet
 * and is intentionally not modeled in this module.
 *
 * Cross-process contract:
 *   - In-pod, the canonical value lives in the underpost root env key
 *     `container-status`, written by `start.js`. For non-error phases it carries
 *     the namespaced form `<deployId>-<env>-<phase>`; a fatal fault collapses to
 *     the bare value `error`.
 *   - The internal HTTP server exposes that value (normalized to the bare
 *     contract phase) and never exposes secrets, env dumps, or configuration.
 *
 * @module src/server/runtime-status.js
 * @namespace RuntimeStatus
 */

import http from 'node:http';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../index.js';
import { loggerFactory } from './logger.js';

const logger = loggerFactory(import.meta);

/**
 * Allowed runtime status contract values. These are the only Phase-2 signals
 * the monitor reasons about.
 * @memberof RuntimeStatus
 */
const RUNTIME_STATUS = {
  BUILD: 'build-deployment',
  INIT: 'initializing-deployment',
  RUNNING: 'running-deployment',
  ERROR: 'error',
};

const CONTAINER_STATUS_KEY = 'container-status';
const INTERNAL_STATUS_PATH = '/_internal/status';
const INTERNAL_READY_PATH = '/_internal/ready';
const INTERNAL_HEALTH_PATH = '/_internal/health';

/**
 * Resolves the internal status port. Defaults to the deployment base `PORT`
 * (app instances bind `PORT + 1` upward, so the base port is free inside the
 * pod). An explicit `UNDERPOST_INTERNAL_PORT` override wins.
 * @memberof RuntimeStatus
 * @returns {number|undefined}
 */
const resolveInternalStatusPort = () => {
  const raw = process.env.UNDERPOST_INTERNAL_PORT || process.env.PORT;
  const port = parseInt(raw);
  return Number.isNaN(port) ? undefined : port;
};

/**
 * Single source of truth for the internal status port of a specific deployment,
 * used identically by the in-pod server bind (`start.js`) and the CD-side
 * monitor target (`monitor.js`) so the two can never disagree.
 *
 * Resolution order: `UNDERPOST_INTERNAL_PORT` override → the deployment's
 * `.env.<env>` `PORT` → the ambient `PORT`.
 *
 * @memberof RuntimeStatus
 * @param {string} deployId
 * @param {string} env
 * @returns {number|undefined}
 */
const deployStatusPort = (deployId, env) => {
  const override = parseInt(process.env.UNDERPOST_INTERNAL_PORT);
  if (!Number.isNaN(override)) return override;
  try {
    const envPath = `./engine-private/conf/${deployId}/.env.${env}`;
    if (fs.existsSync(envPath)) {
      const port = parseInt(dotenv.parse(fs.readFileSync(envPath, 'utf8')).PORT);
      if (!Number.isNaN(port)) return port;
    }
  } catch (_) {
    /* fall through to ambient resolution */
  }
  return resolveInternalStatusPort();
};

/**
 * Builds the `container-status` env value for a lifecycle phase.
 * @memberof RuntimeStatus
 */
const containerStatusValue = (deployId, env, phase) =>
  phase === RUNTIME_STATUS.ERROR ? RUNTIME_STATUS.ERROR : `${deployId}-${env}-${phase}`;

/**
 * Normalizes a raw `container-status` value to a bare contract phase.
 * Strips the `<deployId>-<env>-` prefix; `error` and unknown/empty values are
 * passed through (empty → undefined).
 * @memberof RuntimeStatus
 * @param {string} raw
 * @returns {string|undefined}
 */
const normalizeContainerStatus = (raw) => {
  if (!raw || typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value || value === 'undefined' || value.toLowerCase().includes('empty')) return undefined;
  if (value === RUNTIME_STATUS.ERROR) return RUNTIME_STATUS.ERROR;
  for (const phase of [RUNTIME_STATUS.BUILD, RUNTIME_STATUS.INIT, RUNTIME_STATUS.RUNNING])
    if (value.endsWith(`-${phase}`)) return phase;
  return value;
};

/**
 * Reads the current normalized runtime status from the env file.
 * @memberof RuntimeStatus
 * @returns {string|undefined}
 */
const getRuntimeStatus = () =>
  normalizeContainerStatus(Underpost.env.get(CONTAINER_STATUS_KEY, undefined, { disableLog: true }));

/**
 * Minimal, secret-free payload served by the internal status endpoint and used
 * by the monitor for failure classification and observability.
 * @memberof RuntimeStatus
 * @returns {{status: (string|null), deployId: (string|null), env: (string|null)}}
 */
const runtimeStatusPayload = () => ({
  status: getRuntimeStatus() ?? null,
  deployId: process.env.DEPLOY_ID ?? null,
  env: process.env.NODE_ENV ?? null,
});

/**
 * Emits a structured, secret-free deployment transition event.
 * @memberof RuntimeStatus
 */
const emitRuntimeEvent = ({ deployId, env, phase }) => {
  logger.info('runtime-status', {
    deployId,
    env,
    phase: 'runtime',
    status: phase,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Publishes a runtime lifecycle phase to the cross-process contract.
 * @memberof RuntimeStatus
 * @param {string} deployId
 * @param {string} env
 * @param {string} phase - One of {@link RUNTIME_STATUS}.
 */
const setRuntimeStatus = (deployId, env, phase) => {
  Underpost.env.set(CONTAINER_STATUS_KEY, containerStatusValue(deployId, env, phase));
  emitRuntimeEvent({ deployId, env, phase });
};

let internalServer;

/**
 * Starts the in-pod internal status server. Idempotent: repeated calls return
 * the already-listening server. Exposes only the three internal endpoints and
 * never serves secrets or configuration.
 *
 *   GET /_internal/status  → 200, `{status, deployId, env}` (monitor transport)
 *   GET /_internal/ready   → 200 iff running-deployment, else 503 (readinessProbe)
 *   GET /_internal/health  → 200 while the process is alive (livenessProbe)
 *
 * @memberof RuntimeStatus
 * @param {number} [port]
 * @returns {import('node:http').Server|undefined}
 */
const startInternalStatusServer = (port = resolveInternalStatusPort()) => {
  if (internalServer) return internalServer;
  if (!port) {
    logger.warn('Internal status server not started: no resolvable port');
    return undefined;
  }
  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];
    const sendJson = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return sendJson(405, { error: 'method_not_allowed' });
    switch (url) {
      case INTERNAL_HEALTH_PATH:
        return sendJson(200, { status: 'ok' });
      case INTERNAL_READY_PATH:
        return getRuntimeStatus() === RUNTIME_STATUS.RUNNING
          ? sendJson(200, { status: RUNTIME_STATUS.RUNNING })
          : sendJson(503, { status: getRuntimeStatus() ?? null });
      case INTERNAL_STATUS_PATH:
        return sendJson(200, runtimeStatusPayload());
      default:
        return sendJson(404, { error: 'not_found' });
    }
  });
  server.on('error', (error) => logger.error('internal status server error', error?.message ?? error));
  server.listen(port, () => logger.info(`Internal status endpoint listening on :${port}${INTERNAL_STATUS_PATH}`));
  internalServer = server;
  return internalServer;
};

/**
 * Stops the internal status server if running. Returns a promise that resolves
 * once the listener is closed. Primarily a test/teardown hook.
 * @memberof RuntimeStatus
 * @returns {Promise<void>}
 */
const stopInternalStatusServer = () =>
  new Promise((resolve) => {
    if (!internalServer) return resolve();
    const server = internalServer;
    internalServer = undefined;
    server.close(() => resolve());
  });

export {
  RUNTIME_STATUS,
  CONTAINER_STATUS_KEY,
  INTERNAL_STATUS_PATH,
  INTERNAL_READY_PATH,
  INTERNAL_HEALTH_PATH,
  resolveInternalStatusPort,
  deployStatusPort,
  containerStatusValue,
  normalizeContainerStatus,
  getRuntimeStatus,
  runtimeStatusPayload,
  setRuntimeStatus,
  startInternalStatusServer,
  stopInternalStatusServer,
};
