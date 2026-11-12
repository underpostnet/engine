/**
 * The share of one content lifecycle with one workstation: an HTTP service on the WireGuard address of
 * the control node, and its client. The control node keeps the cycles and their database; the
 * workstation reads its cycle and records its stages through the share, never through the database.
 *
 * Each request passes two checks. Its source address must be the tunnel address of the shared peer,
 * which WireGuard binds to the key of that peer. Its bearer token must be the token of the share. The
 * service takes the node of the caller from the topology, never from the request, records only the
 * stages that the role of that node may run, and only for targets of that peer.
 *
 * A share holds a lease on the cycle: the service renews it while it runs, and a share whose lease
 * lapses is expired, so a crash or a lost tunnel ends it without a close. A share also ends at its
 * expiry time and on revocation. The journal records the open, the close, the expiry and the
 * revocation of each share; the cycle keeps the digest of the token, never the token.
 *
 * @module src/projects/cyberia/content/content-lifecycle-share.js
 * @namespace CyberiaContentLifecycleShare
 */
import crypto from 'node:crypto';
import http from 'node:http';
import {
  LIFECYCLE_STAGES,
  SHARE_ENV,
  TARGET_KINDS,
  appendEvent,
  assertCycleOpen,
  assertOperationReady,
  assertStageReady,
  failure,
  hostContexts,
  noteOperation,
  readLifecycle,
  recordStage,
} from './content-lifecycle.js';

const BODY_LIMIT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const EVENT_STATUS = Object.freeze(['succeeded', 'failed', 'blocked']);

/** How long a share lives without a renewal of its lease, and how often the service renews it. */
const SHARE_LEASE_MS = 90000;
const RENEW_MS = 30000;

/** The longest and the default life of a share. */
export const SHARE_MAX_HOURS = 24;
export const SHARE_DEFAULT_HOURS = 8;

/** Operations that only the control node records: the cycle itself, its shares and its stages. */
const RESERVED_OPERATION = /^(lifecycle\.(?!doctor$)|stage\.)/;

/** A refusal of the share, with the HTTP status it answers and a code a client can act on. */
const refusal = (status, message, code = 'refused') => Object.assign(failure('blocked', message), { status, code });

const tokenDigest = (token) => `sha256:${crypto.createHash('sha256').update(token).digest('hex')}`;

/**
 * The value of {@link SHARE_ENV} for a share: a URL whose user part is the token, so log redaction
 * treats it as a credential.
 * @param {{token:string, address:string, port:number}} share
 * @returns {string}
 * @memberof CyberiaContentLifecycleShare
 */
export const shareHandleFactory = ({ token, address, port }) => `http://${token}@${address}:${port}`;

/**
 * The parts of a {@link SHARE_ENV} value.
 * @param {string} value
 * @returns {{token:string, address:string, port:number}}
 * @throws {Error} `blocked` when the value is not a share.
 * @memberof CyberiaContentLifecycleShare
 */
export function parseShareHandle(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    url = null;
  }
  if (
    url?.protocol !== 'http:' ||
    !/^[A-Za-z0-9_-]{43}$/.test(url.username) ||
    url.password ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ||
    !url.port
  )
    throw failure(
      'blocked',
      `${SHARE_ENV} is not a share: set the value that "cyberia content lifecycle share" printed`,
    );
  return { token: url.username, address: url.hostname, port: Number(url.port) };
}

/**
 * The state of a share at a time: `open`, or how it ended. A share whose lease lapsed, or whose
 * expiry passed, is `expired` before any host records it.
 * @param {{closedAt?:Date, closeReason?:string, leaseUntil:Date, expiresAt:Date}} share
 * @param {Date} [now]
 * @returns {'open'|'closed'|'expired'|'revoked'}
 * @memberof CyberiaContentLifecycleShare
 */
export const shareState = (share, now = new Date()) =>
  share.closedAt
    ? share.closeReason
    : new Date(share.leaseUntil) < now || new Date(share.expiresAt) < now
      ? 'expired'
      : 'open';

/** What a list shows of a share: never its token digest. */
export const shareView = ({ tokenDigest: _, ...share }, now = new Date()) => ({
  ...share,
  state: shareState(share, now),
});

/** Ends one share in the cycle and the journal, once: a share another host ended stays as it ended. */
async function endShare(models, { cycleId, share, reason, host, at = new Date(), summary = {} }) {
  const { modifiedCount } = await models.CyberiaContentLifecycle.updateOne(
    { cycleId, shares: { $elemMatch: { shareId: share.shareId, closedAt: null } } },
    { $set: { 'shares.$.closedAt': at, 'shares.$.closeReason': reason } },
  );
  if (!modifiedCount) return false;
  await appendEvent(models, {
    cycleId,
    operation: `lifecycle.share.${reason === 'closed' ? 'close' : reason === 'revoked' ? 'revoke' : 'expire'}`,
    status: 'succeeded',
    actor: host.actor,
    node: host.node,
    environment: host.environment,
    executionContext: host.contexts.join(','),
    startedAt: at,
    completedAt: at,
    resultSummary: { shareId: share.shareId, peerId: share.peerId, nodeName: share.nodeName, ...summary },
  });
  return true;
}

/**
 * Records the shares of a deployment that ended without a close: their lease lapsed or their expiry
 * passed. Each becomes `expired` in its cycle with one journal event.
 * @param {Object} models - {@link lifecycleModels} of the database that keeps the cycles.
 * @param {{deployId:string, host:Object, now?:Date}} params - `host` is this control node.
 * @returns {Promise<number>} The shares it recorded as expired.
 * @memberof CyberiaContentLifecycleShare
 */
export async function sweepShares(models, { deployId, host, now = new Date() }) {
  const cycles = await models.CyberiaContentLifecycle.find(
    {
      deployId,
      shares: {
        $elemMatch: { closedAt: null, $or: [{ leaseUntil: { $lt: now } }, { expiresAt: { $lt: now } }] },
      },
    },
    { cycleId: 1, shares: 1 },
  ).lean();
  let expired = 0;
  for (const cycle of cycles)
    for (const share of cycle.shares.filter((entry) => shareState(entry, now) === 'expired'))
      if (
        await endShare(models, {
          cycleId: cycle.cycleId,
          share,
          reason: 'expired',
          host,
          at: new Date(Math.min(new Date(share.leaseUntil), new Date(share.expiresAt))),
        })
      )
        expired++;
  return expired;
}

/**
 * Revokes an open share of a cycle: its service refuses every request from then on and stops.
 * @param {Object} models - {@link lifecycleModels}.
 * @param {{cycleId:string, shareId:string, host:Object, reason:string}} params - `host` is this control node.
 * @returns {Promise<Object>} The share as the cycle keeps it.
 * @throws {Error} `blocked` without a reason, or when the cycle has no open share with that id.
 * @memberof CyberiaContentLifecycleShare
 */
export async function revokeShare(models, { cycleId, shareId, host, reason }) {
  if (!String(reason ?? '').trim()) throw failure('blocked', 'A revocation needs a reason');
  const cycle = await readLifecycle(models, cycleId);
  const share = (cycle.shares ?? []).find((entry) => entry.shareId === shareId);
  if (!share) throw failure('blocked', `Cycle ${cycleId} has no share ${shareId}`);
  if (!(await endShare(models, { cycleId, share, reason: 'revoked', host, summary: { reason } })))
    throw failure('blocked', `Share ${shareId} is ${shareState(share)} already`);
  return shareView((await readLifecycle(models, cycleId)).shares.find((entry) => entry.shareId === shareId));
}

/** Reads a JSON request body up to {@link BODY_LIMIT}. */
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(refusal(413, 'The request body is too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(refusal(400, 'The request body is not JSON'));
      }
    });
    req.on('error', reject);
  });

/** The fields of a recorded operation that a caller may set. */
const recordedFields = ({ evidence, summary, references, scope, error, commandId, startedAt } = {}) => ({
  ...(evidence && { evidence }),
  ...(summary && { summary }),
  ...(references && { references }),
  ...(scope && { scope }),
  error: String(error ?? ''),
  commandId: String(commandId ?? ''),
  startedAt: startedAt ? new Date(startedAt) : new Date(),
});

/**
 * The targets a peer reports, each refused unless it is a sandbox or a checkout of that peer.
 * @param {Object} targets - By kind.
 * @param {{peerId:string}} peer
 * @returns {Object}
 */
const peerTargets = (targets = {}, peer) =>
  Object.fromEntries(
    Object.entries(targets ?? {}).map(([kind, target]) => {
      if (kind === 'deployment' || !TARGET_KINDS[kind] || target?.kind !== kind)
        throw refusal(400, `${kind} is not a target a share records`);
      if (typeof target.id !== 'string' || !target.id.startsWith(`${kind}:${peer.peerId}/`))
        throw refusal(403, `Target ${target.id} is not a ${kind} of peer ${peer.peerId}`, 'forbidden');
      if (typeof target.fingerprint !== 'string' || !target.fingerprint)
        throw refusal(400, `Target ${target.id} has no fingerprint`);
      return [kind, { kind, id: target.id, fingerprint: target.fingerprint, identity: target.identity ?? {} }];
    }),
  );

/**
 * Opens the share of one cycle with one peer, on the tunnel address of this node, for a bounded time.
 * The journal records its open; `close` records its close.
 * @param {Object} params
 * @param {string} params.cycleId
 * @param {Object} params.models - {@link lifecycleModels} of the database that keeps the cycles.
 * @param {Object} params.host - This control node, for the journal.
 * @param {{nodeName:string, role:string, peerId:string, address:string}} params.peer - The shared
 *   peer and the node document that names it.
 * @param {string} params.address - The tunnel address of this node.
 * @param {number} params.port
 * @param {number} [params.hours] - The life of the share, at most {@link SHARE_MAX_HOURS}.
 * @param {(entry:{status:number, route:string, source:string}) => void} [params.onRequest]
 * @returns {Promise<{handle:string, shareId:string, port:number, expiresAt:Date,
 *   stats:{answered:number, refused:number}, ended:Promise<string>, close:() => Promise<void>}>}
 *   `ended` resolves with the reason the share ended by itself.
 * @memberof CyberiaContentLifecycleShare
 */
export async function openShareServer({
  cycleId,
  models,
  host,
  peer,
  address,
  port,
  hours = SHARE_DEFAULT_HOURS,
  onRequest = () => {},
}) {
  if (!(hours > 0 && hours <= SHARE_MAX_HOURS))
    throw failure('blocked', `A share lives more than 0 and at most ${SHARE_MAX_HOURS} hours`);
  const token = crypto.randomBytes(32).toString('base64url');
  const expected = Buffer.from(token);
  const shareId = crypto.randomUUID();
  const stats = { answered: 0, refused: 0 };
  const openedAt = new Date();
  const share = {
    shareId,
    peerId: peer.peerId,
    nodeName: peer.nodeName,
    tokenDigest: tokenDigest(token),
    openedAt,
    expiresAt: new Date(openedAt.getTime() + hours * 3600000),
    leaseUntil: new Date(openedAt.getTime() + SHARE_LEASE_MS),
    closedAt: null,
    closeReason: '',
  };
  const stateNow = async () => {
    const cycle = await models.CyberiaContentLifecycle.findOne(
      { cycleId, 'shares.shareId': shareId },
      { 'shares.$': 1 },
    ).lean();
    return cycle ? shareState(cycle.shares[0]) : 'revoked';
  };
  const callerOf = ({ actor, environment, sources } = {}, targets) => ({
    node: { nodeName: peer.nodeName, role: peer.role, peerId: peer.peerId },
    actor: String(actor ?? ''),
    environment: String(environment ?? ''),
    contexts: hostContexts({ role: peer.role, environment: String(environment ?? ''), sources: sources === true }),
    targets: peerTargets(targets, peer),
    shareId,
  });
  const statusOf = (status) => {
    if (!EVENT_STATUS.includes(status)) throw refusal(400, `Status ${status} is not one of ${EVENT_STATUS.join(', ')}`);
    return status;
  };
  const routes = {
    'GET /cycle': async () => {
      const cycle = await readLifecycle(models, cycleId);
      return { ...cycle, shares: (cycle.shares ?? []).map((entry) => shareView(entry)) };
    },
    'GET /events': (_, url) =>
      models.CyberiaContentLifecycleEvent.find({ cycleId })
        .sort({ seq: -1 })
        .limit(Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit'), 10) || 50)))
        .lean(),
    'POST /record': async ({ stage, status, host: reported, targets, ...fields }) => {
      const definition = LIFECYCLE_STAGES.find(({ id }) => id === stage);
      if (!definition) throw refusal(400, `Unknown stage ${stage}`);
      const caller = callerOf(reported, targets);
      const cycle = await readLifecycle(models, cycleId);
      if (!definition.contexts.every((context) => caller.contexts.includes(context))) {
        // A refused attempt stays in the journal; the stage keeps its state.
        if (statusOf(status) === 'blocked')
          return await noteOperation(models, {
            cycleId,
            operation: 'stage.refused',
            host: caller,
            status,
            summary: { stage },
            ...recordedFields(fields),
          });
        throw refusal(403, `${definition.label} is not a stage of ${peer.role} ${peer.nodeName}`, 'forbidden');
      }
      if (statusOf(status) === 'succeeded') assertStageReady(cycle, stage, caller);
      else assertCycleOpen(cycle);
      return await recordStage(models, { cycle, stageId: stage, host: caller, status, ...recordedFields(fields) });
    },
    'POST /note': async ({ operation, status, host: reported, targets, ...fields }) => {
      if (typeof operation !== 'string' || !operation || RESERVED_OPERATION.test(operation))
        throw refusal(403, `${operation} is not an operation a share records`, 'forbidden');
      const caller = callerOf(reported, targets);
      if (operation !== 'lifecycle.doctor')
        assertOperationReady(await readLifecycle(models, cycleId), operation, caller);
      return await noteOperation(models, {
        cycleId,
        operation,
        host: caller,
        status: statusOf(status),
        ...recordedFields(fields),
      });
    },
  };

  let finish;
  const ended = new Promise((resolve) => (finish = resolve));
  let closing = false;
  const server = http.createServer(async (req, res) => {
    const source = String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    const url = new URL(req.url, 'http://share');
    const name = `${req.method} ${url.pathname}`;
    const reply = (status, body) => {
      if (status < 400) stats.answered++;
      else stats.refused++;
      onRequest({ status, route: name, source });
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
    try {
      if (source !== peer.address)
        throw refusal(403, `Only peer ${peer.peerId} at ${peer.address} may use this share`, 'forbidden');
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected))
        throw refusal(401, 'The token is not the token of this share', 'unauthorized');
      const state = await stateNow();
      if (state !== 'open') throw refusal(401, `The share is ${state}: ask for a new share`, state);
      const route = routes[name];
      if (!route) throw refusal(404, `No route ${name}`);
      reply(200, await route(req.method === 'POST' ? await readBody(req) : {}, url));
    } catch (error) {
      reply(error.status ?? 500, {
        error: error.message,
        outcome: error.outcome ?? 'failed',
        code: error.code ?? 'failed',
      });
    }
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, address, resolve);
  });
  share.address = `${address}:${server.address().port}`;
  const stop = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  try {
    await models.CyberiaContentLifecycle.updateOne({ cycleId }, { $push: { shares: share } });
    await appendEvent(models, {
      cycleId,
      operation: 'lifecycle.share.open',
      status: 'succeeded',
      actor: host.actor,
      node: host.node,
      environment: host.environment,
      executionContext: host.contexts.join(','),
      commandId: 'content lifecycle share',
      startedAt: openedAt,
      resultSummary: {
        shareId,
        peerId: peer.peerId,
        nodeName: peer.nodeName,
        address: share.address,
        expiresAt: share.expiresAt,
      },
    });
  } catch (error) {
    await stop();
    throw error;
  }

  const end = async (reason) => {
    if (closing) return;
    closing = true;
    clearInterval(lease);
    await endShare(models, { cycleId, share, reason, host, summary: { ...stats } });
    await stop();
  };
  const lease = setInterval(async () => {
    try {
      if (Date.now() >= share.expiresAt.getTime()) {
        await end('expired');
        return finish(`The share reached its expiry at ${share.expiresAt.toISOString()}`);
      }
      const { modifiedCount } = await models.CyberiaContentLifecycle.updateOne(
        { cycleId, shares: { $elemMatch: { shareId, closedAt: null } } },
        { $set: { 'shares.$.leaseUntil': new Date(Date.now() + SHARE_LEASE_MS) } },
      );
      if (!modifiedCount) {
        closing = true;
        clearInterval(lease);
        await stop();
        finish(`The share is ${await stateNow()}`);
      }
    } catch {
      // A missed renewal is retried; a lease that lapses expires the share.
    }
  }, RENEW_MS);

  return {
    handle: shareHandleFactory({ token, address, port: server.address().port }),
    shareId,
    port: server.address().port,
    expiresAt: share.expiresAt,
    stats,
    ended,
    close: () => end('closed'),
  };
}

/**
 * The client of a share: the cycle store of a workstation, and the shared cycle of its local engine.
 * A refusal keeps the `code` the share answered; a share that does not answer is `unreachable`.
 * @param {string} value - A {@link SHARE_ENV} value.
 * @returns {{address:string, read:(cycleId?:string)=>Promise<Object>, events:(limit:number)=>Promise<Object[]>,
 *   record:(fields:Object)=>Promise<Object>, note:(fields:Object)=>Promise<Object>}}
 * @memberof CyberiaContentLifecycleShare
 */
export function shareClient(value) {
  const { token, address, port } = parseShareHandle(value);
  // Each call opens its own connection: a pooled one can die while this process runs a long build.
  const send = (method, path, body) =>
    new Promise((resolve, reject) => {
      const request = http.request(
        {
          host: address,
          port,
          path,
          method,
          agent: false,
          headers: { authorization: `Bearer ${token}`, ...(body && { 'content-type': 'application/json' }) },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString() }));
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end(body && JSON.stringify(body));
    });
  const call = async (method, path, body) => {
    let response;
    try {
      response = await send(method, path, body);
    } catch (error) {
      throw Object.assign(
        failure(
          'blocked',
          `The share at ${address}:${port} does not answer (${error.code ?? error.name}): check the tunnel, ` +
            'and that "cyberia content lifecycle share" still runs on the control node',
        ),
        { code: 'unreachable', cause: error.code ?? error.name },
      );
    }
    let result;
    try {
      result = JSON.parse(response.text);
    } catch {
      result = {};
    }
    if (response.status >= 400)
      throw Object.assign(
        failure(result.outcome === 'blocked' ? 'blocked' : 'failed', result.error ?? `${response.status}`),
        { status: response.status, code: result.code ?? 'failed' },
      );
    return result;
  };
  const hostOf = ({ actor, environment, sources }) => ({ actor, environment, sources });
  return {
    address: `${address}:${port}`,
    read: async (cycleId) => {
      const cycle = await call('GET', '/cycle');
      if (cycleId && cycle.cycleId !== cycleId)
        throw Object.assign(failure('failed', `The share opens cycle ${cycle.cycleId}, not ${cycleId}`), {
          status: 404,
          code: 'other-cycle',
        });
      return cycle;
    },
    events: (limit) => call('GET', `/events?limit=${limit}`),
    record: ({ stageId, host, cycle, ...fields }) =>
      call('POST', '/record', { stage: stageId, host: hostOf(host), targets: host.targets ?? {}, ...fields }),
    note: ({ host, cycleId, ...fields }) =>
      call('POST', '/note', { host: hostOf(host), targets: host.targets ?? {}, ...fields }),
  };
}
