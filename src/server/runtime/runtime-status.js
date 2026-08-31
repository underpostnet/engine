/**
 * Runtime status contract and the in-pod internal status endpoint: the base module of the
 * `state` domain, the runtime monitoring / telemetry layer.
 *
 * Single source of truth for the Underpost runtime readiness signal (Phase 2 of
 * the two-phase deployment monitor). The runtime publishes its lifecycle here;
 * the CD-side monitor (`src/cli/monitor.js`) reads it over HTTP via
 * `kubectl port-forward`. Kubernetes pod readiness (Phase 1) is owned by kubelet
 * and is intentionally not modeled in this module.
 *
 * Three observations make up the layer, and they are deliberately separate:
 *   - **execution state** — where the runtime is in its lifecycle (`container-status`)
 *   - **health indicators** — whether it is ready and whether it is still booting
 *   - **performance metrics** — uptime, memory and CPU of the process serving it
 * {@link runtimeStatusPayload} carries the first for the monitor's failure classification;
 * {@link runtimeTelemetryPayload} carries all three for an agent exporting them off-cluster.
 *
 * Cross-process contract:
 *   - In-pod, the canonical value lives in the container state store key
 *     `container-status`, written by `start.js`. For non-error phases it carries
 *     the namespaced form `<deployId>-<env>-<phase>`; a fatal fault collapses to
 *     the bare value `error`.
 *   - The internal HTTP server exposes that value (normalized to the bare
 *     contract phase) and never exposes secrets, env dumps, or configuration.
 *     Neither payload is ever built from `process.env` wholesale — each field is
 *     named, so a new environment variable can never widen what is published.
 *
 * @module src/server/runtime/runtime-status.js
 * @namespace RuntimeStatus
 */

import http from 'node:http';
import os from 'node:os';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import Underpost from '../../index.js';
import { EXECUTION_PROFILES, activeExecutionProfile } from '../build/execution.js';
import { loggerFactory } from '../ops/logger.js';

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
const START_CONTAINER_STATUS_KEY = 'start-container-status';
// The boot latch: present from the moment a runtime starts configuring itself until that runtime
// is listening. Container-scoped like the two above — same owner, same lifetime — so it lives in
// the container state store. It was previously written to the host configuration store, where
// `host load` and `host clean` erase the whole file and would silently drop the latch mid-boot.
const AWAIT_DEPLOY_KEY = 'await-deploy';
const INTERNAL_STATUS_PATH = '/_internal/status';
const INTERNAL_READY_PATH = '/_internal/ready';
const INTERNAL_HEALTH_PATH = '/_internal/health';
const INTERNAL_TELEMETRY_PATH = '/_internal/telemetry';

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
  normalizeContainerStatus(Underpost.state.get(CONTAINER_STATUS_KEY, undefined, { disableLog: true }));

/**
 * Reads the start-container-status key — an insulated marker the start pipeline writes once
 * after completing the running phase. Unlike container-status, which lifecycle hooks and failure
 * latches also write, this is only ever set by that pipeline, so the readinessProbe endpoint is
 * never derailed by lifecycle noise.
 * @memberof RuntimeStatus
 * @returns {string|undefined}
 */
const getStartContainerStatus = () => {
  const raw = Underpost.state.get(START_CONTAINER_STATUS_KEY, undefined, { disableLog: true });
  return raw && typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
};

/**
 * Latches this container as still bringing its runtime up. Cleared by {@link clearAwaitDeploy}
 * once the runtime is listening; polled by `awaitDeployMonitor` in between.
 * @memberof RuntimeStatus
 * @returns {void}
 */
const latchAwaitDeploy = () => {
  Underpost.state.set(AWAIT_DEPLOY_KEY, new Date().toISOString());
};

/**
 * Whether a runtime in this container is still coming up.
 * @memberof RuntimeStatus
 * @returns {boolean}
 */
const isAwaitingDeploy = () => Boolean(Underpost.state.get(AWAIT_DEPLOY_KEY, undefined, { disableLog: true }));

/**
 * Releases the boot latch. Called by the runtime once every configured host and path is bound.
 * @memberof RuntimeStatus
 * @returns {void}
 */
const clearAwaitDeploy = () => {
  Underpost.state.delete(AWAIT_DEPLOY_KEY);
};

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
 * Live execution state, health indicators and performance metrics for this container: what a
 * telemetry agent collects and exports off-cluster.
 *
 * A superset of {@link runtimeStatusPayload}, kept separate from it because the monitor's
 * failure classification must not start depending on metrics that move on every read. Every
 * field is named individually and none is read from the environment in bulk, so this can never
 * become an env dump.
 * @memberof RuntimeStatus
 * @returns {object} Secret-free telemetry observation.
 */
const runtimeTelemetryPayload = () => {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    ...runtimeStatusPayload(),
    instanceId: process.env.INSTANCE_ID ?? null,
    health: {
      // The insulated readiness marker, not the lifecycle status: the two disagree exactly when
      // a lifecycle hook has moved container-status after the start pipeline signed off.
      ready: Boolean(getStartContainerStatus()),
      awaitingDeploy: isAwaitingDeploy(),
      inContainer: Underpost.state.isInsideContainer(),
    },
    metrics: {
      uptimeSeconds: Math.round(process.uptime()),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
      loadAverage1m: os.loadavg()[0],
    },
    observedAt: new Date().toISOString(),
  };
};

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
  Underpost.state.set(CONTAINER_STATUS_KEY, containerStatusValue(deployId, env, phase));
  emitRuntimeEvent({ deployId, env, phase });
};

/**
 * Whether this process is executing under a test runner.
 * @memberof RuntimeStatus
 * @returns {boolean} True under `NODE_ENV=test` or a Vitest worker.
 */
const isTestRuntime = () =>
  process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID);

/**
 * Whether this process may write the runtime status contract.
 *
 * Only a live workload observes itself. A test run and a non-live execution profile both
 * execute commands whose non-zero exit is the expected outcome — a suite asserting a failure
 * path, a hermetic build eliding a cluster call — and neither is an observation of a running
 * deployment. Letting them latch `container-status` published a false `error` to the CD
 * monitor and failed rollouts that were healthy.
 * @memberof RuntimeStatus
 * @returns {boolean} True when this process speaks for a live container.
 */
const runtimeStatusWritable = () =>
  Underpost.state.isInsideContainer() &&
  !isTestRuntime() &&
  activeExecutionProfile().name === EXECUTION_PROFILES.LIVE_CLUSTER.name;

/**
 * Latches the container as failed, for a failure detected outside the lifecycle phases — a shell
 * command, a database connection, a backup. A no-op wherever the contract is not writable:
 * outside a container, under a test runner, or under a non-live execution profile.
 * @memberof RuntimeStatus
 * @returns {void}
 */
const latchRuntimeError = () => {
  if (runtimeStatusWritable()) Underpost.state.set(CONTAINER_STATUS_KEY, RUNTIME_STATUS.ERROR);
};

/**
 * Marks the start pipeline's own completion. Written once, read only by the readinessProbe.
 * @memberof RuntimeStatus
 * @param {string} deployId
 * @param {string} env
 * @returns {void}
 */
const setStartContainerStatus = (deployId, env) => {
  Underpost.state.set(START_CONTAINER_STATUS_KEY, containerStatusValue(deployId, env, RUNTIME_STATUS.RUNNING));
};

let internalServer;

/**
 * Starts the in-pod internal status server. Idempotent: repeated calls return
 * the already-listening server. Exposes only the three internal endpoints and
 * never serves secrets or configuration.
 *
 *   GET /_internal/status    → 200, `{status, deployId, env}` (monitor transport)
 *   GET /_internal/ready     → 200 iff running-deployment, else 503 (readinessProbe)
 *   GET /_internal/health    → 200 while the process is alive (livenessProbe)
 *   GET /_internal/telemetry → 200, state + health + metrics (telemetry agent)
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
        return getStartContainerStatus()
          ? sendJson(200, { status: RUNTIME_STATUS.RUNNING })
          : sendJson(503, { status: getRuntimeStatus() ?? null });
      case INTERNAL_STATUS_PATH:
        return sendJson(200, runtimeStatusPayload());
      case INTERNAL_TELEMETRY_PATH:
        return sendJson(200, runtimeTelemetryPayload());
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
  START_CONTAINER_STATUS_KEY,
  AWAIT_DEPLOY_KEY,
  INTERNAL_STATUS_PATH,
  INTERNAL_READY_PATH,
  INTERNAL_HEALTH_PATH,
  INTERNAL_TELEMETRY_PATH,
  resolveInternalStatusPort,
  deployStatusPort,
  containerStatusValue,
  normalizeContainerStatus,
  getRuntimeStatus,
  getStartContainerStatus,
  latchAwaitDeploy,
  isAwaitingDeploy,
  clearAwaitDeploy,
  isTestRuntime,
  latchRuntimeError,
  runtimeStatusWritable,
  setStartContainerStatus,
  runtimeStatusPayload,
  runtimeTelemetryPayload,
  setRuntimeStatus,
  startInternalStatusServer,
  stopInternalStatusServer,
};
