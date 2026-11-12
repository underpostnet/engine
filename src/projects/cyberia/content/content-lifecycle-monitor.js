/**
 * The Content Lifecycle Monitor of a portal: where this engine reads the cycles, and the read-only
 * projections the monitor shows. The server decides the source. An engine that holds a share reads
 * the one cycle the control node shares with it; a container or a control node reads the central
 * cycles in the runtime database of its deployment; any other engine reads its own development
 * database, which holds rehearsal cycles only. An engine outside a container also reports its
 * Development Sandbox. The share token never leaves this process.
 *
 * @module src/projects/cyberia/content/content-lifecycle-monitor.js
 * @namespace CyberiaContentLifecycleMonitor
 */
import os from 'node:os';
import Underpost from '../../../index.js';
import { DataBaseProviderService } from '../../../db/database-provider.js';
import {
  hostAddressesFactory,
  readEdgeContext,
  readNodeIdentity,
  tunnelAddressFactory,
} from '../../../cli/wireguard.js';
import { roleHasCapability } from '../../../server/network/node-capability.js';
import { isOciRuntime } from '../../../server/runtime/environment.js';
import { DataQuery } from '../../../server/storage/data-query.js';
import { checkoutGit, optionalContentArtifact } from './content-artifact.js';
import { SHARE_ENV, lifecyclePlan, lifecycleSummary, readLifecycle } from './content-lifecycle.js';
import { shareClient, shareView } from './content-lifecycle-share.js';
import { sandboxTarget, sourceTarget } from './content-lifecycle-target.js';

/**
 * The sources of the cycles a monitor shows.
 * @memberof CyberiaContentLifecycleMonitor
 */
export const MONITOR_SOURCES = Object.freeze({
  share: 'The cycle the control node shares with this workstation, read through the share',
  central: 'The cycles of the deployment, from its runtime database',
  local: 'The cycles of this development database: rehearsals only. The central cycles need a share',
});

const EVENT_PAGE_LIMIT = 100;

/** A refusal the monitor answers with a status, and never with the share value. */
const unavailable = (message, status = 503) => Object.assign(new Error(message), { status, expected: true });

/**
 * Where this engine reads the cycles: `share` with a share value, `central` in a container or on a node
 * that administers the cluster, `local` anywhere else.
 * @returns {{kind:'share'|'central'|'local', node:Object}}
 * @memberof CyberiaContentLifecycleMonitor
 */
function monitorSource() {
  const { nodeName = '', role = '', peerId = '' } = readNodeIdentity();
  const node = { hostname: os.hostname(), nodeName, role, peerId };
  if (process.env[SHARE_ENV]) return { kind: 'share', node };
  return { kind: isOciRuntime() || roleHasCapability(role, 'kubernetes-administration') ? 'central' : 'local', node };
}

/** Whether the tunnel address of this host is up; a host off the WireGuard network has none. */
const tunnelState = () => {
  try {
    const address = tunnelAddressFactory(readEdgeContext().address);
    return hostAddressesFactory().has(address)
      ? { up: true, address }
      : { up: false, message: `The tunnel address ${address} is not on this host: bring the WireGuard tunnel up` };
  } catch (error) {
    return { up: false, message: `This host is not on the WireGuard network: ${error.message}` };
  }
};

/**
 * The shared cycle and the state of the share: `connected`, or why it is not, never as an empty list.
 * @returns {Promise<{state:string, message:string, address?:string, cycle?:Object, client?:Object}>}
 */
async function readShare() {
  let client;
  try {
    client = shareClient(process.env[SHARE_ENV]);
  } catch (error) {
    return { state: 'invalid', message: error.message };
  }
  try {
    return { state: 'connected', message: '', address: client.address, cycle: await client.read(), client };
  } catch (error) {
    if (error.code === 'unreachable') {
      const tunnel = tunnelState();
      return tunnel.up
        ? {
            state: 'unreachable',
            message: `The control node does not answer at ${client.address}: the share may be closed. Ask for a new share`,
            address: client.address,
          }
        : { state: 'tunnel-down', message: tunnel.message, address: client.address };
    }
    const state = { expired: 'expired', revoked: 'revoked', closed: 'closed' }[error.code] ?? 'refused';
    return {
      state,
      message:
        state === 'refused'
          ? 'The control node refuses this share: it opens to another peer, or a newer share replaced it'
          : `The share is ${state}: ask the control node for a new share`,
      address: client.address,
    };
  }
}

/** The runtime models of the routes, and the database configuration of this deploy host. */
const runtimeOf = (options) => {
  const CyberiaContentLifecycle = DataBaseProviderService.getModel('CyberiaContentLifecycle', options);
  return {
    CyberiaContentLifecycle,
    CyberiaContentLifecycleEvent: DataBaseProviderService.getModel('CyberiaContentLifecycleEvent', options),
    client: CyberiaContentLifecycle.db.getClient(),
    db: options.services.database.configuration(),
  };
};

/**
 * The targets this engine observes: its Development Sandbox and its content checkout. A container
 * observes none.
 */
async function observedTargets(options, node) {
  if (isOciRuntime()) return { targets: {}, unobserved: {} };
  const { client, db } = runtimeOf(options);
  const targets = {};
  const unobserved = {};
  try {
    targets.sandbox = await sandboxTarget({
      node,
      deployId: process.env.DEPLOY_ID ?? '',
      environment: 'development',
      db,
      client,
    });
  } catch (error) {
    if (!error.expected) throw error;
    unobserved.sandbox = error.message;
  }
  const source = sourceTarget({ node });
  if (source) targets.source = source;
  else unobserved.source = 'This host has no cyberia-content checkout';
  return { targets, unobserved };
}

/** The Development Sandbox of this engine: its target, its session and a check of each service. */
async function sandboxStatus({ targets, unobserved }) {
  const target = targets.sandbox;
  const session =
    target && Underpost.sandbox.sessions().find(({ sandboxId }) => sandboxId === target.identity.sandboxId);
  const services = await Promise.all(
    (session?.forwards ?? []).map(async (forward) => ({
      id: forward.id,
      label: forward.label,
      endpoint: `${forward.address}:${forward.localPort}`,
      resource: `${forward.namespace}/${forward.resource}:${forward.remotePort}`,
      forward: forward.state,
      ...(await Underpost.sandbox.probe(forward)),
    })),
  );
  const artifact = optionalContentArtifact();
  const source = targets.source;
  return {
    state: target ? 'ready' : 'unavailable',
    message: target ? '' : unobserved.sandbox,
    target: target ? { id: target.id, fingerprint: target.fingerprint, identity: target.identity } : null,
    session: session
      ? {
          sandboxId: session.sandboxId,
          startedAt: session.startedAt,
          kubeContext: session.descriptor.kubeContext,
          namespace: session.descriptor.namespaces.mongodb,
          fingerprint: session.descriptor.fingerprint,
        }
      : null,
    services,
    workspace: target
      ? target.databases.includes(target.identity.contentDatabase)
        ? 'initialized'
        : 'not initialized'
      : 'unknown',
    releases: target ? target.databases.filter((name) => name.startsWith(`${target.identity.contentDatabase}-`)) : [],
    artifact: artifact && {
      version: artifact.manifest.contentVersion,
      digest: artifact.manifest.contentDigest,
      sourceRevision: artifact.manifest.sourceRevision,
    },
    source: source
      ? {
          id: source.id,
          revision: source.revision,
          branch: source.identity.branch,
          changed: source.changed,
          remote: source.identity.remote,
          head: checkoutGit(source.identity.root, 'log', '-1', '--format=%s'),
        }
      : { message: unobserved.source },
  };
}

/**
 * The context of the monitor: the source of its cycles, this node, the state of its share, and, outside
 * a container, its Development Sandbox.
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @returns {Promise<Object>}
 * @memberof CyberiaContentLifecycleMonitor
 */
export async function monitorRuntime(options) {
  const source = monitorSource();
  const share = source.kind === 'share' ? await readShare() : null;
  const observed = source.kind === 'central' ? null : await observedTargets(options, source.node);
  return {
    source: { kind: source.kind, description: MONITOR_SOURCES[source.kind] },
    node: source.node,
    container: isOciRuntime(),
    share: share && {
      state: share.state,
      message: share.message,
      address: share.address ?? '',
      cycleId: share.cycle?.cycleId ?? '',
    },
    sandbox: observed && (await sandboxStatus(observed)),
  };
}

/** The shared cycle, or a refusal that names why it is not available. */
const sharedCycle = async () => {
  const share = await readShare();
  if (share.state !== 'connected') throw unavailable(share.message);
  return share;
};

/**
 * A page of cycle summaries from the source of this engine, newest change first, for the targets it observes.
 * @param {Object} req - Express request with parsed pagination.
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @returns {Promise<{data:Object[], total:number, page:number, totalPages:number}>}
 * @memberof CyberiaContentLifecycleMonitor
 */
export async function monitorCycles(req, options) {
  const source = monitorSource();
  const observed = source.kind === 'central' ? null : await observedTargets(options, source.node);
  if (source.kind === 'share') {
    const { cycle } = await sharedCycle();
    return { data: [lifecycleSummary(cycle, observed)], total: 1, page: 1, totalPages: 1 };
  }
  const { CyberiaContentLifecycle } = runtimeOf(options);
  const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
  const [documents, total] = await Promise.all([
    CyberiaContentLifecycle.find(query)
      .sort(Object.keys(sort ?? {}).length ? sort : { updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CyberiaContentLifecycle.countDocuments(query),
  ]);
  return {
    data: documents.map((cycle) => lifecycleSummary(cycle, observed)),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * The plan of one cycle, evaluated against the targets this engine observes, with its shares.
 * @param {string} cycleId
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @returns {Promise<Object>}
 * @memberof CyberiaContentLifecycleMonitor
 */
export async function monitorPlan(cycleId, options) {
  const source = monitorSource();
  const cycle =
    source.kind === 'share' ? (await sharedCycle()).cycle : await readLifecycle(runtimeOf(options), cycleId);
  if (cycle.cycleId !== cycleId) throw unavailable(`This engine reads cycle ${cycle.cycleId} only`, 404);
  const observed =
    source.kind === 'central' ? { targets: {}, unobserved: {} } : await observedTargets(options, source.node);
  return {
    ...lifecyclePlan(cycle, { targets: observed.targets }),
    unobserved: observed.unobserved,
    shares: (cycle.shares ?? []).map((share) => shareView(share)),
  };
}

/**
 * A page of the journal of one cycle, newest first.
 * @param {{cycleId:string, page?:number|string, limit?:number|string}} query
 * @param {import('../../../api/types.js').ApiRouterContext} options
 * @returns {Promise<{data:Object[], total:number, page:number, totalPages:number}>}
 * @memberof CyberiaContentLifecycleMonitor
 */
export async function monitorEvents({ cycleId, page: pageValue, limit: limitValue }, options) {
  if (!cycleId) throw unavailable('cycleId is required', 400);
  const limit = Math.min(EVENT_PAGE_LIMIT, Math.max(1, Number.parseInt(limitValue, 10) || 20));
  const page = Math.max(1, Number.parseInt(pageValue, 10) || 1);
  if (monitorSource().kind === 'share') {
    const { cycle, client } = await sharedCycle();
    if (cycle.cycleId !== cycleId) throw unavailable(`This engine reads cycle ${cycle.cycleId} only`, 404);
    // The share answers the newest events up to a limit: one more page tells whether another follows.
    const events = await client.events(Math.min(500, page * limit + 1));
    const total = Math.min(events.length, page * limit) + (events.length > page * limit ? 1 : 0);
    return {
      data: events.slice((page - 1) * limit, page * limit),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
  const { CyberiaContentLifecycleEvent } = runtimeOf(options);
  const [data, total] = await Promise.all([
    CyberiaContentLifecycleEvent.find({ cycleId })
      .sort({ seq: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CyberiaContentLifecycleEvent.countDocuments({ cycleId }),
  ]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
}
