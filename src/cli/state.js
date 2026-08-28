/**
 * State domain: the runtime monitoring / telemetry layer.
 *
 * An agent that observes one workload's live container execution state, health indicators and
 * performance metrics, and exports them off-cluster. Its base module is
 * {@link module:src/server/runtime/runtime-status.js}, which defines the observation contract;
 * this domain is the operator surface over it.
 *
 * Backed by its own store file, never the host configuration store. The two have different
 * lifetimes and different owners: host configuration is provisioned onto a node and survives,
 * while this is per-container and resets with the container. Sharing one file meant a host
 * operation could erase a workload's status, and a status write could outlive the workload that
 * produced it.
 *
 * The domain has **no durable source**, and that is what makes it the fourth domain rather than
 * a variation on the other three. An observation is only ever true of a running container, so:
 *   - `load` collects from the live workload rather than from a file,
 *   - `publish` exports the collection off-cluster rather than writing a source back,
 *   - `apply` stamps a contract phase into the live workload.
 * That asymmetry is deliberate and is the whole of this domain.
 *
 * Implements the canonical domain action set; see {@link UnderpostDomains.DOMAIN_ACTIONS}.
 * @module src/cli/state.js
 * @namespace UnderpostState
 */

import fs from 'fs-extra';

import { domainContextFactory } from './domains.js';
import { dotenvStoreFactory } from './dotenv-store.js';
import { getUnderpostRootPath, isOciRuntime } from '../server/runtime/environment.js';
import { loggerFactory } from '../server/ops/logger.js';
import {
  CONTAINER_STATUS_KEY,
  containerStatusValue,
  deployStatusPort,
  normalizeContainerStatus,
  RUNTIME_STATUS,
  runtimeTelemetryPayload,
  setRuntimeStatus,
} from '../server/runtime/runtime-status.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const store = dotenvStoreFactory({
  path: () => `${getUnderpostRootPath()}/.state`,
  label: 'container state',
});

/**
 * The workload this invocation observes: `<deployId>[-<instanceId>]-<env>`, the same name every
 * other object of that workload is prefixed with.
 * @param {object} context - Normalized domain context.
 * @returns {string} Workload id.
 * @memberof UnderpostState
 */
const deployIdOf = (context = {}) =>
  `${context.args?.['deploy-id'] ?? ''}`.trim() || `${process.env.DEPLOY_ID || ''}`.trim();

const workloadId = (context = {}) =>
  [deployIdOf(context), `${context.args?.['instance-id'] ?? ''}`.trim()].filter(Boolean).join('-');

/**
 * Whether this process is reporting into a GitHub Actions job.
 *
 * `GITHUB_ACTIONS` exists on a runner but is not carried across the SSH hop a remote deploy
 * runs over, so `RUN_QUIET_CI` — which the deploy workflows export explicitly — is what actually
 * marks the far side. Both are honoured, and `deploy/lib/github-actions-logging.sh` reads the same pair.
 * @returns {boolean} True when workflow commands will be interpreted.
 * @memberof UnderpostState
 */
const inGithubActions = () => Boolean(process.env.GITHUB_ACTIONS || process.env.RUN_QUIET_CI);

/**
 * Renders one observation as GitHub Actions workflow commands on stdout.
 *
 * stdout is the only transport that survives the SSH hop: `$GITHUB_OUTPUT` and
 * `$GITHUB_STEP_SUMMARY` are files on the runner, so they are written too when they exist —
 * a direct runner invocation — but never relied on.
 * @param {object} observation - Telemetry observation.
 * @memberof UnderpostState
 */
const exportToGithubActions = (observation) => {
  const { workload, status, ready, phase } = observation;
  const summary =
    `${workload || 'workload'} | status=${status ?? 'unknown'} | ready=${ready} | ` +
    `uptime=${observation.metrics?.uptimeSeconds ?? '?'}s | rss=${Math.round(
      (observation.metrics?.rssBytes ?? 0) / 1048576,
    )}MiB`;
  // A fatal phase is an annotation the job surfaces, not a line in a log nobody opens.
  console.log(`::${phase === RUNTIME_STATUS.ERROR ? 'error' : 'notice'} title=underpost state::${summary}`);
  console.log(`::group::underpost state ${workload || ''}`.trimEnd());
  console.log(JSON.stringify(observation, null, 2));
  console.log('::endgroup::');
  const appendFile = (variable, content) => {
    const target = process.env[variable];
    if (!target) return;
    try {
      fs.appendFileSync(target, content);
    } catch (error) {
      logger.warn(`[state] could not write ${variable}`, error?.message ?? error);
    }
  };
  appendFile('GITHUB_OUTPUT', `status=${status ?? ''}\nready=${ready}\nworkload=${workload ?? ''}\n`);
  appendFile('GITHUB_STEP_SUMMARY', `### underpost state\n\n\`\`\`\n${summary}\n\`\`\`\n`);
};

/**
 * @class UnderpostState
 * @description Runtime monitoring / telemetry domain, and key-level access to its store.
 * @memberof UnderpostState
 */
class UnderpostState {
  static API = {
    ...store,

    /**
     * Whether this process runs inside a container, by Kubernetes service injection or Docker's
     * marker file. Kept on this class because every caller reaches it through the state domain;
     * the detection itself is {@link ServerEnvironment.isOciRuntime}, shared with the OCI env
     * overlay so both agree on what "inside a container" means.
     * @returns {boolean} True when running inside a container.
     * @memberof UnderpostState
     */
    isInsideContainer() {
      return isOciRuntime();
    },

    /**
     * The current observation: execution state, health indicators and performance metrics.
     *
     * In-pod this is measured directly. On a node it is collected from the workload's pods over
     * the monitor's own exec transport, so there is one implementation of "read a pod's status"
     * and the agent can never disagree with the monitor that gates the rollout.
     * @param {object} [context] - Normalized domain context.
     * @returns {object} Telemetry observation.
     * @memberof UnderpostState
     */
    observe(context = {}) {
      const workload = workloadId(context);
      const local = runtimeTelemetryPayload();
      if (UnderpostState.API.isInsideContainer() || !workload)
        return { workload: workload || local.deployId, phase: local.status, ...local, pods: null };
      const pods = Underpost.kubectl
        .get(`${workload}-${context.env}`, 'pods', context.namespace)
        .map((pod) => pod.NAME)
        .filter(Boolean);
      // Status gates the rollout and must stay total; telemetry adds the fields that exist only
      // where the process is measured. A pod that cannot answer the second keeps the first.
      const internalPort = deployStatusPort(deployIdOf(context), context.env);
      const readings = pods.map((pod) => {
        const status = Underpost.monitor.readRuntimeStatusViaExec(pod, context.namespace);
        const telemetry = Underpost.monitor.readRuntimeTelemetryViaExec(pod, context.namespace, internalPort);
        return {
          pod,
          ...status,
          health: telemetry.ok ? (telemetry.telemetry?.health ?? null) : null,
          metrics: telemetry.ok ? (telemetry.telemetry?.metrics ?? null) : null,
          telemetryError: telemetry.ok ? undefined : telemetry.transportError,
        };
      });
      // The workload's phase is its worst reading: one pod latched `error` is the deployment's
      // state, not an outlier to be averaged away.
      const statuses = readings.filter((reading) => reading.ok).map((reading) => reading.status);
      const phase = statuses.includes(RUNTIME_STATUS.ERROR)
        ? RUNTIME_STATUS.ERROR
        : statuses.every((status) => status === RUNTIME_STATUS.RUNNING) && statuses.length > 0
          ? RUNTIME_STATUS.RUNNING
          : statuses[0];
      return {
        workload,
        env: context.env,
        namespace: context.namespace,
        status: phase ?? null,
        phase: phase ?? null,
        ready: phase === RUNTIME_STATUS.RUNNING,
        pods: readings,
        metrics: { pods: readings.length, reporting: statuses.length },
        observedAt: new Date().toISOString(),
      };
    },

    // ── canonical domain actions ────────────────────────────────────────────────────────────

    /**
     * Renders an observation as a fixed-width table, one row per pod.
     *
     * The shape an operator actually watches: JSON is the export format, but a rollout is read
     * by scanning columns. Absent metrics print as `-` rather than collapsing the row, so a pod
     * that answers only the status read still occupies its line.
     * @param {object} observation - The observation to render.
     * @returns {string} The rendered table.
     * @memberof UnderpostState
     */
    table(observation = {}, refresh = '') {
      const mib = (bytes) => (typeof bytes === 'number' ? `${Math.round(bytes / 1048576)}Mi` : '-');
      const columns = [
        ['POD', 42],
        ['PHASE', 26],
        ['READY', 6],
        ['UPTIME', 8],
        ['RSS', 9],
        ['HEAP', 9],
        ['CPU', 10],
        ['LOAD', 6],
      ];
      const pad = (value, width) => `${value ?? '-'}`.slice(0, width).padEnd(width);
      const line = (cells) => `| ${cells.map(([v, w]) => pad(v, w)).join(' | ')} |`;
      const rows = (observation.pods ?? []).map((reading) =>
        line([
          [reading.pod, 42],
          [reading.status ?? reading.transportError ?? '-', 26],
          [reading.health ? (reading.health.ready ? 'yes' : 'no') : '-', 6],
          [reading.metrics ? `${reading.metrics.uptimeSeconds}s` : '-', 8],
          [mib(reading.metrics?.rssBytes), 9],
          [mib(reading.metrics?.heapUsedBytes), 9],
          [reading.metrics ? `${Math.round((reading.metrics.cpuUserMicros ?? 0) / 1000)}ms` : '-', 10],
          [reading.metrics ? `${reading.metrics.loadAverage1m?.toFixed?.(2) ?? '-'}` : '-', 6],
        ]),
      );
      const header = line(columns.map(([name, width]) => [name, width]));
      const rule = `|${columns.map(([, width]) => '-'.repeat(width + 2)).join('|')}|`;
      const clock = new Date().toTimeString().slice(0, 8);
      const title = `Runtime state ${observation.workload ?? 'workload'}${
        refresh ? ` (refresh #${refresh}, ${clock})` : ''
      } | phase=${observation.phase ?? '-'} | pods=${observation.metrics?.pods ?? (observation.pods ?? []).length}`;
      return [title, header, rule, ...(rows.length > 0 ? rows : [line([['(no pods)', 42]])])].join('\n');
    },

    /**
     * Onboards the agent: confirms the state store is writable, then takes a first observation.
     * Idempotent — repeating it re-observes rather than re-provisioning.
     * @param {object} context - Normalized domain context.
     * @returns {{store: string, workload: string, status: string|null}} What was onboarded.
     * @memberof UnderpostState
     */
    setup(context = {}) {
      context = domainContextFactory(context);
      const storePath = store.path();
      if (context.dryRun) {
        logger.info('[dry-run] state setup would provision the container state store', { store: storePath });
        return { store: storePath, workload: workloadId(context), status: null };
      }
      fs.ensureFileSync(storePath);
      const { status } = UnderpostState.API.load(context);
      return { store: storePath, workload: workloadId(context), status };
    },

    /**
     * Collects the live observation into this node's state store.
     *
     * The state domain's source is the running workload, not a file, so `load` reads the cluster
     * rather than the disk. What it writes is the collected reading, which is what `publish`
     * then exports.
     * @param {object} context - Normalized domain context.
     * @returns {{workload: string, status: string|null, pods: number}} What was collected.
     * @memberof UnderpostState
     */
    load(context = {}) {
      context = domainContextFactory(context);
      const observation = UnderpostState.API.observe(context);
      const status = normalizeContainerStatus(observation.status) ?? null;
      if (context.dryRun) {
        logger.info('[dry-run] state load would record the observation', {
          workload: observation.workload,
          status,
        });
        return { workload: observation.workload, status, pods: observation.pods?.length ?? 0 };
      }
      if (status) store.set(CONTAINER_STATUS_KEY, containerStatusValue(observation.workload, context.env, status));
      logger.info('Runtime state collected', {
        workload: observation.workload,
        status,
        pods: observation.pods?.length ?? 0,
      });
      return { workload: observation.workload, status, pods: observation.pods?.length ?? 0 };
    },

    /**
     * Exports the observation off-cluster.
     *
     * The inverse of `load` for the other domains is a write back to the durable source; this
     * domain has none, so the outward direction is the export instead. Under GitHub Actions the
     * observation becomes workflow commands on stdout — the one transport that survives the SSH
     * hop a remote deploy runs over — and, on a runner, `$GITHUB_OUTPUT` and
     * `$GITHUB_STEP_SUMMARY` as well. Anywhere else it is JSON on stdout.
     * @param {object} context - Normalized domain context.
     * @returns {object} The exported observation.
     * @memberof UnderpostState
     */
    publish(context = {}) {
      context = domainContextFactory(context);
      const observation = UnderpostState.API.observe(context);
      if (context.dryRun) {
        logger.info('[dry-run] state publish would export the observation', {
          workload: observation.workload,
          target: inGithubActions() ? 'github-actions' : 'stdout',
        });
        return observation;
      }
      if (inGithubActions()) exportToGithubActions(observation);
      else console.log(JSON.stringify(observation, null, 2));
      return observation;
    },

    /**
     * Stamps a contract phase into the live runtime.
     *
     * `--args phase=<phase>` selects it, defaulting to the phase already observed, so a bare
     * `state apply` re-asserts what is true rather than inventing a transition. This is the same
     * write the in-pod lifecycle hooks perform, which is why they call the state domain and not
     * the host one.
     * @param {object} context - Normalized domain context.
     * @returns {{workload: string, phase: string}} What was stamped.
     * @memberof UnderpostState
     */
    apply(context = {}) {
      context = domainContextFactory(context);
      const workload = workloadId(context) || `${process.env.DEPLOY_ID || ''}`.trim();
      const requested = `${context.args['phase'] ?? ''}`.trim();
      const phase = requested || UnderpostState.API.observe(context).status || RUNTIME_STATUS.INIT;
      const known = Object.values(RUNTIME_STATUS);
      if (requested && !known.includes(requested))
        throw new Error(`[state] unknown phase: ${requested} (expected ${known.join(', ')})`);
      if (context.dryRun) {
        logger.info('[dry-run] state apply would stamp the runtime phase', { workload, phase });
        return { workload, phase };
      }
      setRuntimeStatus(workload, context.env, phase);
      return { workload, phase };
    },

    /**
     * Read-only report: the observation, plus where this agent is reading it from.
     * @param {object} context - Normalized domain context.
     * @returns {object} Report.
     * @memberof UnderpostState
     */
    status(context = {}) {
      context = domainContextFactory(context);
      const observation = UnderpostState.API.observe(context);
      const report = {
        domain: 'state',
        env: context.env,
        namespace: context.namespace,
        store: store.path(),
        source: UnderpostState.API.isInsideContainer() ? 'in-container' : 'cluster-exec',
        ...observation,
      };
      console.log(UnderpostState.API.table(observation, `${context.args.refresh ?? ''}`.trim()));
      return report;
    },

    /**
     * Replaces the current projection: drops the latched status and re-stamps it from a fresh
     * observation. The way out of a fatal latch that outlived the fault that set it.
     * @param {object} context - Normalized domain context.
     * @returns {{workload: string, phase: string}} The re-stamped phase.
     * @memberof UnderpostState
     */
    rotate(context = {}) {
      context = domainContextFactory(context);
      if (context.dryRun) {
        logger.info('[dry-run] state rotate would clear and re-stamp the runtime phase');
        return { workload: workloadId(context), phase: null };
      }
      store.delete(CONTAINER_STATUS_KEY);
      return UnderpostState.API.apply(context);
    },

    /**
     * Withdraws the agent's local traces: removes the container state store.
     * @param {object} context - Normalized domain context.
     * @returns {{removed: string|null}} What was withdrawn.
     * @memberof UnderpostState
     */
    clean(context = {}) {
      context = domainContextFactory(context);
      const storePath = store.path();
      if (context.dryRun) {
        logger.info('[dry-run] state clean would remove the container state store', { store: storePath });
        return { removed: storePath };
      }
      const existed = fs.existsSync(storePath);
      if (existed) fs.removeSync(storePath);
      logger.info('Container state store withdrawn', { store: existed ? storePath : null });
      return { removed: existed ? storePath : null };
    },
  };
}

export default UnderpostState;
export { UnderpostState, workloadId };
