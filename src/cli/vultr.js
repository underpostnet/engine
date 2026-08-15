/**
 * Vultr bandwidth guard for the edge hub.
 *
 * The edge VPS is the only machine in the topology that pays for traffic: every
 * byte a client receives leaves through it, and Vultr bills the overage per GB
 * once the plan's monthly transfer quota is spent. Nothing in the request path
 * knows how much of that quota is left — HAProxy forwards bytes it never
 * counts, and the spokes behind the tunnel cannot see the meter at all.
 *
 * This module is that meter. It reads the instance's consumption from the Vultr
 * API, compares it against the plan's quota, and — once a configured fraction of
 * it is gone — reaches the VPS over SSH and drops its egress with
 * {@link module:src/server/dns.js}'s `blockAllEgress`.
 *
 * That last step is deliberately blunt: it takes every hostname behind the hub
 * offline. It is the cheaper failure. An overage accrues silently and without a
 * ceiling, while a blocked edge is loud, immediate, and reversible with one
 * command. `blockAllEgress` keeps established and related connections, so a new
 * inbound SSH session still completes its handshake and the host stays
 * reachable to undo it.
 *
 * The enforcement is latched in the root env rather than re-applied every run,
 * so a cron firing every ten minutes does not re-open an SSH session to a host
 * that is already blocked.
 *
 * @module src/cli/vultr.js
 * @namespace UnderpostVultr
 */

import axios from 'axios';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @constant UNDERPOST_VULTR
 * @description Fixed identity of the bandwidth guard: API surface, defaults, and
 * the key the enforcement state is latched under.
 * @memberof UnderpostVultr
 */
const UNDERPOST_VULTR = {
  apiBaseUrl: 'https://api.vultr.com/v2',
  // Vultr quotes plan `bandwidth` in GB and usage in bytes, so one of the two
  // has to be converted. GB here is binary, matching how the quota is metered.
  bytesPerGB: 1024 * 1024 * 1024,
  defaultThreshold: 0.8,
  // The documented maximum; fewer pages means fewer round trips before the
  // instance's plan is found.
  plansPerPage: 500,
  // A cursor loop bounded so a malformed `meta.links.next` cannot spin forever.
  maxPlanPages: 20,
  requestTimeoutMs: 20000,
  defaultSshUser: 'root',
  defaultSshPort: 22,
  defaultSshKeyPath: './engine-private/deploy/id_rsa',
  remoteEnginePath: '/home/dd/engine',
  // Latched in the root env, which the CronJob mounts from the host, so the
  // decision survives the container that made it.
  latchKey: 'VULTR_EGRESS_BLOCKED_AT',
  env: {
    apiKey: 'VULTR_API_KEY',
    instanceId: 'VULTR_INSTANCE_ID',
    threshold: 'VULTR_BANDWIDTH_THRESHOLD',
    host: ['VULTR_VPS_IP', 'DEFAULT_SSH_HOST'],
    user: ['VULTR_SSH_USER', 'DEFAULT_SSH_USER'],
    keyPath: ['VULTR_SSH_KEY_PATH', 'DEFAULT_SSH_KEY_PATH'],
    port: ['VULTR_SSH_PORT', 'DEFAULT_SSH_PORT'],
  },
};

/**
 * @constant rootEnvCache
 * @description Per-key memo of the root env reads.
 *
 * `Underpost.env.get` resolves the npm global prefix by shelling out on every
 * call, and this module reads up to ten keys through it. Without the memo a
 * single run spawns `npm root -g` once per key it has to fall back for.
 *
 * Cleared at the start of every resolution pass, so it never outlives the read
 * it exists to batch — a second check in the same process sees the root env as
 * it is then, not as it was. The latch is read straight through
 * `Underpost.env.get` for the same reason: it is written during the same run.
 * @memberof UnderpostVultr
 */
const rootEnvCache = new Map();

/**
 * @method envFactory
 * @description First non-empty value among a list of keys, read from the
 * process environment and then from the underpost root env.
 *
 * Both are consulted because the two callers differ: a CronJob container has the
 * deploy's `.env.<env>` loaded into `process.env` by `loadCronDeployEnv`, while
 * an operator running the command by hand has the root env and nothing else.
 * Never logged — one of the keys this resolves is an API key.
 * @param {string|Array<string>} keys - Environment variable name, or names in precedence order.
 * @returns {string} The resolved value, or an empty string.
 * @memberof UnderpostVultr
 */
const envFactory = (keys) => {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const fromProcess = `${process.env[key] ?? ''}`.trim();
    if (fromProcess) return fromProcess;
    if (!rootEnvCache.has(key))
      rootEnvCache.set(key, `${Underpost.env.get(key, undefined, { disableLog: true }) ?? ''}`.trim());
    const fromRoot = rootEnvCache.get(key);
    if (fromRoot) return fromRoot;
  }
  return '';
};

/**
 * @method thresholdFactory
 * @description Normalizes the configured trigger fraction.
 *
 * `80` and `0.80` are the same intent expressed two ways, and the first one
 * silently never fires — a guard that never fires is worse than no guard, since
 * it reads as protection. Both are accepted and resolve to the same ratio.
 * @param {string|number} [raw] - Configured value.
 * @param {number} [fallback] - Ratio used when nothing usable is configured.
 * @returns {number} Ratio in `(0, 1]`.
 * @memberof UnderpostVultr
 */
const thresholdFactory = (raw, fallback = UNDERPOST_VULTR.defaultThreshold) => {
  const parsed = parseFloat(`${raw ?? ''}`.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const ratio = parsed > 1 ? parsed / 100 : parsed;
  return ratio > 1 ? 1 : ratio;
};

/**
 * @method billingMonthFactory
 * @description The `YYYY-MM` prefix the daily buckets of the current cycle carry.
 *
 * UTC, because the endpoint's day boundaries are UTC. A host in a negative
 * offset would otherwise drop the current day for part of its evening.
 * @param {Date} [now] - Reference instant.
 * @returns {string} `YYYY-MM`.
 * @memberof UnderpostVultr
 */
const billingMonthFactory = (now = new Date()) =>
  `${now.getUTCFullYear()}-${`${now.getUTCMonth() + 1}`.padStart(2, '0')}`;

/**
 * @method bandwidthTotalsFactory
 * @description Folds the endpoint's daily buckets into one consumption figure.
 *
 * Scoped to the current month by default rather than summing every key
 * returned. The response is a rolling window that can still carry the tail of
 * the previous cycle, and those bytes are against a quota that has already
 * reset — counting them reports a host as over budget on the first days of a
 * month when it has barely spent anything.
 *
 * Both directions are returned separately because which of them is billable is
 * a property of the account's plan, not of this code: `total` is the
 * conservative reading and trips first, `outgoing` is the one that maps to
 * egress alone.
 * @param {object} [bandwidth] - `bandwidth` object from the Vultr response.
 * @param {string} [month] - `YYYY-MM` to scope to; empty sums every bucket.
 * @returns {{totalBytes: number, incomingBytes: number, outgoingBytes: number, days: number, dates: Array<string>}} Consumption for the window.
 * @memberof UnderpostVultr
 */
const bandwidthTotalsFactory = ({ bandwidth = {}, month = billingMonthFactory() } = {}) => {
  const dates = Object.keys(bandwidth || {})
    .filter((date) => !month || `${date}`.startsWith(month))
    .sort();
  let incomingBytes = 0;
  let outgoingBytes = 0;
  for (const date of dates) {
    const bucket = bandwidth[date] || {};
    incomingBytes += Number(bucket.incoming_bytes) || 0;
    outgoingBytes += Number(bucket.outgoing_bytes) || 0;
  }
  return { totalBytes: incomingBytes + outgoingBytes, incomingBytes, outgoingBytes, days: dates.length, dates };
};

/**
 * @method quotaStateFactory
 * @description The consumption decision: quota, effective trigger, and whether
 * it has been crossed.
 *
 * A plan with no quota (`bandwidth: 0`, which Vultr uses for unmetered plans)
 * yields `exceeded: false` and is reported as such rather than dividing by zero
 * and blocking a host that cannot run out.
 * @param {number} consumedBytes - Bytes counted for the cycle.
 * @param {number} planBandwidthGB - Plan quota in GB.
 * @param {number} [threshold] - Trigger fraction of the quota.
 * @returns {{maxBytes: number, limitBytes: number, consumedBytes: number, ratio: number, exceeded: boolean, metered: boolean}} Decision inputs and outcome.
 * @memberof UnderpostVultr
 */
const quotaStateFactory = ({
  consumedBytes = 0,
  planBandwidthGB = 0,
  threshold = UNDERPOST_VULTR.defaultThreshold,
}) => {
  const maxBytes = Math.max(0, Number(planBandwidthGB) || 0) * UNDERPOST_VULTR.bytesPerGB;
  const limitBytes = maxBytes * threshold;
  const metered = maxBytes > 0;
  return {
    maxBytes,
    limitBytes,
    consumedBytes,
    ratio: metered ? consumedBytes / maxBytes : 0,
    exceeded: metered && consumedBytes >= limitBytes,
    metered,
  };
};

/**
 * @method formatBytes
 * @description Byte count as GB, for log lines an operator has to read against
 * a plan quota that is quoted in GB.
 * @param {number} bytes - Byte count.
 * @returns {string} e.g. `812.40 GB`.
 * @memberof UnderpostVultr
 */
const formatBytes = (bytes) => `${((Number(bytes) || 0) / UNDERPOST_VULTR.bytesPerGB).toFixed(2)} GB`;

/**
 * @method vultrRequest
 * @description One authenticated Vultr API call.
 *
 * Errors are re-thrown with Vultr's own message and without the request config,
 * because an axios error carries the `Authorization` header it was sent with and
 * this module's failures are logged.
 * @param {string} apiKey - Vultr API key.
 * @param {string} path - Path below `/v2`.
 * @param {object} [params] - Query parameters.
 * @returns {Promise<object>} Response body.
 * @throws {Error} With the API's status and message, never the credentials.
 * @memberof UnderpostVultr
 */
const vultrRequest = async ({ apiKey, path, params = {} }) => {
  try {
    const { data } = await axios.get(`${UNDERPOST_VULTR.apiBaseUrl}${path}`, {
      params,
      timeout: UNDERPOST_VULTR.requestTimeoutMs,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    return data;
  } catch (error) {
    const status = error?.response?.status;
    const detail = error?.response?.data?.error || error?.message || 'request failed';
    throw new Error(`[vultr] GET /v2${path} failed${status ? ` (${status})` : ''}: ${detail}`);
  }
};

/**
 * @method planBandwidthGBFactory
 * @description The monthly transfer quota, in GB, of the plan an instance runs.
 *
 * `/v2/plans` is paginated and the catalogue is longer than one page, so the
 * cursor is followed rather than the first page searched — a plan that happens
 * to sort past the page boundary would otherwise read as "not found" and, on a
 * naive implementation, as a quota of zero.
 * @param {string} apiKey - Vultr API key.
 * @param {string} planId - Plan id from the instance record.
 * @returns {Promise<number>} Quota in GB.
 * @throws {Error} When the plan is absent from the catalogue.
 * @memberof UnderpostVultr
 */
const planBandwidthGBFactory = async ({ apiKey, planId }) => {
  let cursor = '';
  for (let page = 0; page < UNDERPOST_VULTR.maxPlanPages; page++) {
    const data = await vultrRequest({
      apiKey,
      path: '/plans',
      params: { type: 'all', per_page: UNDERPOST_VULTR.plansPerPage, ...(cursor ? { cursor } : {}) },
    });
    const match = (data?.plans || []).find((plan) => plan?.id === planId);
    if (match) return Number(match.bandwidth) || 0;
    cursor = `${data?.meta?.links?.next || ''}`.trim();
    if (!cursor) break;
  }
  throw new Error(`[vultr] Plan ${planId} was not found in the plan catalogue; cannot resolve its bandwidth quota`);
};

/**
 * @class UnderpostVultr
 * @description Bandwidth accounting for the edge VPS, and the egress cut-off it
 * triggers.
 * @memberof UnderpostVultr
 */
class UnderpostVultr {
  static API = {
    /**
     * @method callback
     * @description CLI and cron entry point.
     *
     * Takes the same `(deployList, options)` shape every other
     * {@link UnderpostCron} job does, so `underpost cron default vultr` dispatches
     * to it unchanged. The deploy list is not used to select an instance — the
     * edge hub is one machine for the whole cluster, exactly as its WireGuard
     * peer registry is — but it is logged so a run is attributable.
     * @param {string} [deployList] - Comma-separated deploy ids, from the cron dispatcher.
     * @param {object} [options] - CLI flags.
     * @returns {Promise<object>} Result from {@link UnderpostVultr.checkBandwidth}.
     * @memberof UnderpostVultr
     */
    callback: async function (deployList = 'default', options = {}) {
      return await UnderpostVultr.API.checkBandwidth({ ...options, deployList });
    },

    /**
     * @method resolveConfig
     * @description Every input the guard needs, resolved once.
     *
     * CLI flags win over the environment so a one-off run can target another
     * instance without editing any `.env`; the environment is the standing
     * configuration. Single source of truth for the resolution, so no other
     * method re-reads `process.env`.
     * @param {object} [options] - CLI flags.
     * @returns {object} Resolved configuration; `apiKey` is present but must never be logged.
     * @memberof UnderpostVultr
     */
    resolveConfig(options = {}) {
      rootEnvCache.clear();
      return {
        apiKey: `${options.apiKey || ''}`.trim() || envFactory(UNDERPOST_VULTR.env.apiKey),
        instanceId: `${options.instanceId || ''}`.trim() || envFactory(UNDERPOST_VULTR.env.instanceId),
        threshold: thresholdFactory(options.threshold || envFactory(UNDERPOST_VULTR.env.threshold)),
        host: `${options.host || ''}`.trim() || envFactory(UNDERPOST_VULTR.env.host),
        user: `${options.user || ''}`.trim() || envFactory(UNDERPOST_VULTR.env.user) || UNDERPOST_VULTR.defaultSshUser,
        keyPath:
          `${options.keyPath || ''}`.trim() ||
          envFactory(UNDERPOST_VULTR.env.keyPath) ||
          UNDERPOST_VULTR.defaultSshKeyPath,
        port: Number(options.port || envFactory(UNDERPOST_VULTR.env.port)) || UNDERPOST_VULTR.defaultSshPort,
        // `total` is the conservative reading and trips first; `outgoing` counts
        // egress alone, which is what a plan billing outbound-only meters.
        metric: `${options.metric || 'total'}`.trim() === 'outgoing' ? 'outgoing' : 'total',
        month: options.allDates === true ? '' : `${options.month || ''}`.trim() || billingMonthFactory(),
        dryRun: options.dryRun === true,
        force: options.force === true,
        autoUnblock: options.autoUnblock === true,
      };
    },

    /**
     * @method checkBandwidth
     * @description Reads the instance's consumption for the cycle and enforces
     * the threshold.
     *
     * Three calls, in the only order that works: the instance record names its
     * plan, the plan carries the quota, and the bandwidth endpoint carries the
     * consumption. Nothing is enforced until all three have answered — a guard
     * that blocked an edge on a failed API call would be an outage caused by the
     * thing meant to prevent one.
     * @param {object} [options] - CLI flags; see {@link UnderpostVultr.resolveConfig}.
     * @returns {Promise<{instanceId: string, plan: string, metric: string, month: string, consumedBytes: number, limitBytes: number, maxBytes: number, ratio: number, exceeded: boolean, enforced: boolean, latched: boolean}>} What was measured and what was done about it.
     * @throws {Error} When credentials are missing or the API cannot be read.
     * @memberof UnderpostVultr
     */
    checkBandwidth: async function (options = {}) {
      const config = UnderpostVultr.API.resolveConfig(options);
      if (!config.apiKey) throw new Error(`[vultr] ${UNDERPOST_VULTR.env.apiKey} is not set`);
      if (!config.instanceId) throw new Error(`[vultr] ${UNDERPOST_VULTR.env.instanceId} is not set`);

      const instance = (await vultrRequest({ apiKey: config.apiKey, path: `/instances/${config.instanceId}` }))
        ?.instance;
      const planId = `${instance?.plan || ''}`.trim();
      if (!planId) throw new Error(`[vultr] Instance ${config.instanceId} returned no plan id`);

      const planBandwidthGB = await planBandwidthGBFactory({ apiKey: config.apiKey, planId });
      const { bandwidth } = await vultrRequest({
        apiKey: config.apiKey,
        path: `/instances/${config.instanceId}/bandwidth`,
      });

      const totals = bandwidthTotalsFactory({ bandwidth, month: config.month });
      const consumedBytes = config.metric === 'outgoing' ? totals.outgoingBytes : totals.totalBytes;
      const state = quotaStateFactory({ consumedBytes, planBandwidthGB, threshold: config.threshold });
      const latchedAt = `${Underpost.env.get(UNDERPOST_VULTR.latchKey, undefined, { disableLog: true }) ?? ''}`.trim();

      const summary = {
        instanceId: config.instanceId,
        plan: planId,
        metric: config.metric,
        month: config.month || 'all-dates',
        days: totals.days,
        consumed: formatBytes(consumedBytes),
        incoming: formatBytes(totals.incomingBytes),
        outgoing: formatBytes(totals.outgoingBytes),
        triggerLimit: formatBytes(state.limitBytes),
        planQuota: formatBytes(state.maxBytes),
        usedPercent: `${(state.ratio * 100).toFixed(1)}%`,
        threshold: `${(config.threshold * 100).toFixed(0)}%`,
      };

      if (!state.metered) {
        logger.info('Vultr plan reports no metered bandwidth quota; nothing to enforce', summary);
        return { ...state, ...summary, enforced: false, latched: !!latchedAt };
      }

      if (!state.exceeded) {
        logger.info('Vultr bandwidth within budget', summary);
        // A latch that outlives the cycle it was set in would suppress the next
        // real trigger, so it is cleared as soon as usage is back under the
        // threshold — but the host stays blocked until someone says otherwise.
        if (latchedAt) {
          if (!config.dryRun) Underpost.env.delete(UNDERPOST_VULTR.latchKey);
          if (config.autoUnblock) await UnderpostVultr.API.setEdgeEgress({ config, blocked: false });
          else
            logger.warn('Edge egress is still blocked from a previous cycle; unblock it when you are ready', {
              host: config.host,
              blockedAt: latchedAt,
              next: `underpost ip --unblock-all-egress   (on ${config.host || 'the edge VPS'})`,
            });
        }
        return { ...state, ...summary, enforced: false, latched: false };
      }

      logger.warn('Vultr bandwidth threshold reached; edge egress will be blocked', summary);

      if (latchedAt && !config.force) {
        logger.info('Edge egress was already blocked for this cycle; not re-applying', {
          host: config.host,
          blockedAt: latchedAt,
          next: 'pass --force to re-apply',
        });
        return { ...state, ...summary, enforced: false, latched: true };
      }

      const enforced = await UnderpostVultr.API.setEdgeEgress({ config, blocked: true });
      if (enforced && !config.dryRun) Underpost.env.set(UNDERPOST_VULTR.latchKey, new Date().toISOString());
      return { ...state, ...summary, enforced, latched: enforced };
    },

    /**
     * @method setEdgeEgress
     * @description Blocks or restores outbound traffic on the edge VPS over SSH.
     *
     * The command is run on the VPS rather than here because the nftables rules
     * belong to that host — this process usually runs in a CronJob container
     * inside a spoke cluster, on the far side of the tunnel the rules govern.
     *
     * `underpost ip` is preferred when the CLI is installed globally and the
     * checked-out engine is the fallback, so a VPS provisioned either way is
     * reachable. The command already elevates internally, so it is not wrapped
     * in `sudo` here.
     * @param {object} config - Resolved configuration from {@link UnderpostVultr.resolveConfig}.
     * @param {boolean} blocked - True to block egress, false to restore it.
     * @returns {Promise<boolean>} True when the remote command succeeded.
     * @memberof UnderpostVultr
     */
    setEdgeEgress: async function ({ config, blocked }) {
      const flag = blocked ? '--block-all-egress' : '--unblock-all-egress';
      if (!config.host) {
        logger.error('No edge host configured; cannot reach the VPS to change its egress', {
          set: UNDERPOST_VULTR.env.host.join(' or '),
        });
        return false;
      }
      const command = [
        'set -e',
        'if command -v underpost >/dev/null 2>&1; then',
        `  underpost ip ${flag}`,
        'else',
        `  cd ${UNDERPOST_VULTR.remoteEnginePath} && node bin ip ${flag}`,
        'fi',
      ].join('\n');

      if (config.dryRun) {
        logger.info('[dry-run] would run on the edge VPS', {
          target: `${config.user}@${config.host}:${config.port}`,
          command: `underpost ip ${flag}`,
        });
        return false;
      }

      const result = await Underpost.ssh.sshExecBatch({
        host: config.host,
        port: config.port,
        user: config.user,
        keyPath: config.keyPath,
        command,
      });
      if (!result.ok) {
        logger.error(`Failed to run 'underpost ip ${flag}' on the edge VPS`, {
          target: `${config.user}@${config.host}:${config.port}`,
          code: result.code,
          stderr: `${result.stderr || ''}`.slice(-400),
        });
        return false;
      }
      if (blocked)
        logger.warn('Edge egress blocked; every hostname behind the hub is now offline', {
          host: config.host,
          restore: `underpost ip --unblock-all-egress   (on ${config.host})`,
        });
      else logger.info('Edge egress restored', { host: config.host });
      return true;
    },
  };
}

export default UnderpostVultr;

export {
  UNDERPOST_VULTR,
  bandwidthTotalsFactory,
  billingMonthFactory,
  envFactory,
  formatBytes,
  planBandwidthGBFactory,
  quotaStateFactory,
  thresholdFactory,
};
