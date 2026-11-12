/**
 * Development Sandbox: an isolated development cluster that a workstation hosts, and the loopback
 * forwards that expose its services on that host.
 *
 * Underpost owns the sandbox: its identity, the provisioning of its services and its forwards. A
 * sandbox is not a node role, not a WireGuard peer and not a fleet member. Its identity comes from
 * the cluster, never from the caller, so a recreated cluster has another fingerprint. One session
 * holds the forwards of a sandbox; its record lets a product read the sandbox without kubectl.
 *
 * @module src/cli/sandbox.js
 * @namespace UnderpostSandbox
 */
import crypto from 'node:crypto';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import net from 'node:net';
import os from 'node:os';
import nodePath from 'node:path';
import { MongoBootstrap } from '../db/mongo/mongo-bootstrap.js';
import { MONGODB_DEFAULT_PORT, MONGODB_STATEFULSET_NAME } from '../db/mongo/mongoose-db.js';
import { roleHasCapability } from '../server/network/node-capability.js';
import { loggerFactory } from '../server/ops/logger.js';
import { etcHostFactory } from '../server/runtime/conf.js';
import { HOST_LOCK_DIRECTORY, acquireHostLock, hostLockHolders } from '../server/runtime/host-lock.js';
import { shellArgumentFactory, shellExec } from '../server/runtime/process.js';
import { readNodeIdentity } from './wireguard.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/** The directory of the session records. */
const SANDBOX_DIRECTORY = nodePath.join(os.tmpdir(), 'underpost-sandbox');

/** The Kind cluster `underpost cluster` creates. */
const SANDBOX_DEFAULT_CLUSTER = 'kind';

/** The loopback address every forward listens on. */
const SANDBOX_ADDRESS = '127.0.0.1';

const RECONCILE_MS = 10000;
const PROBE_TIMEOUT_MS = 2000;
const STOP_TIMEOUT_MS = 15000;
const NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/**
 * The cluster providers a sandbox runs on.
 * @memberof UnderpostSandbox
 */
const SANDBOX_PROVIDERS = Object.freeze({
  kind: Object.freeze({
    contextOf: (clusterName) => `kind-${clusterName}`,
    clusters: () =>
      shellExec('kind get clusters', { stdout: true, silent: true, silentOnError: true, disableLog: true })
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
  }),
});

/**
 * The services a sandbox provisions and the StatefulSet that holds each one. `default` services are
 * part of every sandbox; the others join on request.
 * @memberof UnderpostSandbox
 */
const SANDBOX_COMPONENTS = Object.freeze({
  mongodb: Object.freeze({ label: 'MongoDB', workload: MONGODB_STATEFULSET_NAME, flag: 'mongodb', default: true }),
  valkey: Object.freeze({ label: 'Valkey', workload: 'valkey-service', flag: 'valkey', default: true }),
  ipfs: Object.freeze({ label: 'IPFS Cluster', workload: 'ipfs-cluster', flag: 'ipfs', default: false }),
});

/** Runs one request on a TCP connection and resolves with the reply once `done` accepts it. */
const exchange = ({ address, localPort }, request, done) =>
  new Promise((resolve, reject) => {
    let reply = '';
    const socket = net.connect({ host: address, port: localPort });
    socket.setTimeout(PROBE_TIMEOUT_MS, () => socket.destroy(new Error('no answer in time')));
    socket.on('connect', () => socket.write(request));
    socket.on('data', (chunk) => {
      reply += chunk;
      if (done(reply)) socket.end();
    });
    socket.on('error', reject);
    socket.on('close', () => resolve(reply));
  });

const httpProbe =
  (method, path, describe) =>
  async ({ address, localPort }) => {
    const response = await fetch(`http://${address}:${localPort}${path}`, {
      method,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`answers HTTP ${response.status}`);
    return { ready: true, detail: describe(await response.text()) };
  };

const field = (text, key) => {
  try {
    return JSON.parse(text)[key] ?? '';
  } catch {
    return '';
  }
};

/**
 * The service checks: each speaks the protocol of its service, so a listening port alone never
 * passes. A check resolves `{ ready, detail }` and throws when the service does not answer.
 */
const PROBES = Object.freeze({
  async mongodb({ address, localPort }) {
    const client = new mongoose.mongo.MongoClient(`mongodb://${address}:${localPort}/?directConnection=true`, {
      serverSelectionTimeoutMS: PROBE_TIMEOUT_MS,
      connectTimeoutMS: PROBE_TIMEOUT_MS,
    });
    try {
      await client.connect();
      const hello = await client.db('admin').command({ hello: 1 });
      return {
        ready: hello.isWritablePrimary === true,
        detail: hello.isWritablePrimary
          ? `primary ${hello.me ?? 'standalone'}${hello.setName ? ` of ${hello.setName}` : ''}`
          : `not the primary: ${hello.me ?? 'no member name'}`,
        member: hello.me ?? '',
      };
    } finally {
      await client.close().catch(() => {});
    }
  },
  async valkey(forward) {
    const reply = await exchange(forward, 'PING\r\n', (text) => text.includes('\r\n'));
    if (reply.startsWith('+PONG')) return { ready: true, detail: 'PONG' };
    if (reply.startsWith('-NOAUTH')) return { ready: true, detail: 'answers; authentication required' };
    throw new Error(reply ? `answers ${reply.trim().slice(0, 60)}` : 'closes without an answer');
  },
  'ipfs-api': httpProbe('POST', '/api/v0/version', (text) => `Kubo ${field(text, 'Version') || 'answers'}`),
  'ipfs-cluster': httpProbe('GET', '/version', (text) => `IPFS Cluster ${field(text, 'version') || 'answers'}`),
  // The identity CID of empty content: a gateway serves it without the network.
  'ipfs-gateway': httpProbe('GET', '/ipfs/bafkqaaa', () => 'serves /ipfs'),
});

/**
 * The forwards of a sandbox: the service each exposes, the component that holds it, and its ports.
 * `primary` resolves to the MongoDB primary pod when the forward opens.
 * @memberof UnderpostSandbox
 */
const SANDBOX_SERVICES = Object.freeze([
  Object.freeze({
    id: 'mongodb',
    label: 'MongoDB',
    component: 'mongodb',
    resource: 'primary',
    port: MONGODB_DEFAULT_PORT,
  }),
  Object.freeze({ id: 'valkey', label: 'Valkey', component: 'valkey', resource: 'svc/valkey-service', port: 6379 }),
  Object.freeze({ id: 'ipfs-api', label: 'IPFS API', component: 'ipfs', resource: 'svc/ipfs-cluster', port: 5001 }),
  Object.freeze({
    id: 'ipfs-cluster',
    label: 'IPFS Cluster',
    component: 'ipfs',
    resource: 'svc/ipfs-cluster',
    port: 9094,
  }),
  Object.freeze({
    id: 'ipfs-gateway',
    label: 'IPFS gateway',
    component: 'ipfs',
    resource: 'svc/ipfs-cluster',
    port: 8080,
  }),
]);

/** The sha256 of a JSON value, keys sorted at every level. */
const digest = (value) => {
  const canonical = (entry) =>
    Array.isArray(entry)
      ? entry.map(canonical)
      : entry && typeof entry === 'object'
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [key, canonical(entry[key])]),
          )
        : entry;
  return `sha256:${crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')}`;
};

/** A refusal: an expected outcome the operator acts on, apart from a failure. */
const refusal = (message) => Object.assign(new Error(message), { expected: true });

const kubectlRead = (args) =>
  `${shellExec(`kubectl ${args}`, { stdout: true, silent: true, silentOnError: true, disableLog: true }) ?? ''}`.trim();

const lockName = (sandboxId) => `sandbox-${sandboxId}`;
const recordPath = (directory, sandboxId) => nodePath.join(directory, `${sandboxId}.json`);

const assertName = (clusterName) => {
  if (!NAME.test(`${clusterName}`)) throw refusal(`Invalid Kind cluster name: ${clusterName}`);
};

/** The namespace of each component, from the development placement and the overrides of the command. */
const namespacesOf = (options) =>
  Object.fromEntries(
    Object.keys(SANDBOX_COMPONENTS).map((id) => [
      id,
      Underpost.namespace.of(id, { environment: 'development', options }),
    ]),
  );

/** Whether a Kubernetes API server URL is on this host's loopback. */
const loopbackServer = (server) => {
  try {
    const { hostname } = new URL(server);
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

/** Whether a local port is free on an address: a bind proves it, without touching a holder. */
const portFree = (address, port) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(false) : reject(error)));
    server.listen(port, address, () => server.close(() => resolve(true)));
  });

/** Whether something accepts connections on an address and port. */
const listening = (address, port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: address, port });
    socket.setTimeout(PROBE_TIMEOUT_MS, () => socket.destroy());
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => resolve(false));
  });

/**
 * The forwards a sandbox opens for the components it holds.
 * @param {Object} descriptor - {@link UnderpostSandbox.resolve} output.
 * @param {Iterable<string>} components - The components the cluster holds.
 * @returns {Array<{id:string, label:string, component:string, resource:string, namespace:string,
 *   context:string, address:string, localPort:number, remotePort:number}>}
 * @memberof UnderpostSandbox
 */
export const sandboxPlan = (descriptor, components) => {
  const held = new Set(components);
  return SANDBOX_SERVICES.filter(({ component }) => held.has(component)).map((service) => ({
    id: service.id,
    label: service.label,
    component: service.component,
    resource: service.resource,
    namespace: descriptor.namespaces[service.component],
    context: descriptor.kubeContext,
    address: SANDBOX_ADDRESS,
    localPort: service.port,
    remotePort: service.port,
  }));
};

class UnderpostSandbox {
  static API = {
    /**
     * Checks one exposed service with its own protocol.
     * @param {{id:string, address:string, localPort:number}} forward
     * @returns {Promise<{ready:boolean, detail:string, member?:string}>}
     * @memberof UnderpostSandbox
     */
    async probe(forward) {
      try {
        return await PROBES[forward.id](forward);
      } catch (error) {
        return { ready: false, detail: error.code === 'ECONNREFUSED' ? 'nothing listens' : error.message };
      }
    },

    /**
     * The live session records of this host, each with the state of its forwards as its session wrote it.
     * @param {{directory?:string, lockDirectory?:string}} [options]
     * @returns {Object[]}
     * @memberof UnderpostSandbox
     */
    sessions({ directory = SANDBOX_DIRECTORY, lockDirectory = HOST_LOCK_DIRECTORY } = {}) {
      if (!fs.existsSync(directory)) return [];
      return fs
        .readdirSync(directory)
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => {
          try {
            return fs.readJsonSync(nodePath.join(directory, entry));
          } catch {
            // A record is written by rename: an unreadable one is not a session.
            return null;
          }
        })
        .filter(
          (record) =>
            record?.sandboxId &&
            hostLockHolders(lockName(record.sandboxId), 1, lockDirectory).some(({ pid }) => pid === record.pid),
        );
    },

    /**
     * The sandbox a `--dev` command uses: the one live session of `underpost sandbox up` on this host.
     * @param {{directory?:string, lockDirectory?:string}} [options]
     * @returns {Object} The session record: `sandboxId`, `descriptor` (with `kubeContext`) and `forwards`.
     * @throws {Error} A refusal when no sandbox runs on this host, or several do.
     * @memberof UnderpostSandbox
     */
    live(options) {
      const sessions = Underpost.sandbox.sessions(options);
      if (sessions.length === 1) return sessions[0];
      throw refusal(
        sessions.length
          ? `--dev needs one development sandbox, and ${sessions.length} run on this host: ${sessions.map(({ sandboxId }) => sandboxId).join(', ')}`
          : '--dev uses the development sandbox, and none runs on this host: start it with underpost sandbox up',
      );
    },

    /**
     * The address of one service of the live sandbox: its ready forward on this host.
     * @param {string} id - A sandbox service: `mongodb`, `valkey`, `ipfs-api`, `ipfs-cluster` or `ipfs-gateway`.
     * @param {{directory?:string, lockDirectory?:string}} [options]
     * @returns {{host:string, port:number}}
     * @throws {Error} A refusal when the live sandbox does not serve it.
     * @memberof UnderpostSandbox
     */
    endpoint(id, options) {
      const session = Underpost.sandbox.live(options);
      const forward = session.forwards.find((entry) => entry.id === id && entry.state === 'ready');
      if (!forward)
        throw refusal(
          `The sandbox ${session.sandboxId} serves no ${id}: start it again with underpost sandbox up${id.startsWith('ipfs') ? ' --ipfs' : ''}`,
        );
      return { host: forward.address, port: forward.localPort };
    },

    /**
     * A database configuration that reaches the MongoDB of the live sandbox: its forward, as the one
     * member it serves. The replica set member names resolve only inside the cluster.
     * @param {Object} db - A `db` block of `conf.server.json`, secrets resolved.
     * @param {{directory?:string, lockDirectory?:string}} [options]
     * @returns {Object}
     * @memberof UnderpostSandbox
     */
    database(db, options) {
      const { host, port } = Underpost.sandbox.endpoint('mongodb', options);
      return { ...db, host: `${host}:${port}`, directConnection: true };
    },

    /**
     * The live session forward that serves an endpoint of this host, such as the MongoDB of a deploy.
     * @param {{host:string, port:number|string}} endpoint
     * @param {{directory?:string, lockDirectory?:string}} [options]
     * @returns {?{session:Object, forward:Object}} Null when no ready forward of a live session serves it.
     * @memberof UnderpostSandbox
     */
    serving({ host, port }, options) {
      const local = ['127.0.0.1', 'localhost'].includes(`${host}`) ? SANDBOX_ADDRESS : `${host}`;
      for (const session of Underpost.sandbox.sessions(options)) {
        const forward = session.forwards.find(
          (entry) => entry.state === 'ready' && entry.address === local && entry.localPort === Number(port),
        );
        if (forward) return { session, forward };
      }
      return null;
    },

    /**
     * The identity of a sandbox, read from Kind, the kubeconfig, the cluster and the node document of
     * this host, with the namespace of each component from the development placement. The fingerprint
     * changes when the cluster or a namespace of it is recreated, even under the same names.
     * @param {{clusterName?:string, options?:Object}} [params] - `options` carry the namespace overrides.
     * @returns {Object} `sandboxId`, `provider`, `clusterName`, `kubeContext`, `server`, `namespaces`
     *   by component, `kubeSystemUid`, `namespaceUids` by namespace ('' for one not created yet),
     *   `hostname`, `node` and `fingerprint`.
     * @throws {Error} When the cluster or its context cannot be identified on this host.
     * @memberof UnderpostSandbox
     */
    resolve({ clusterName = SANDBOX_DEFAULT_CLUSTER, options = {} } = {}) {
      assertName(clusterName);
      const provider = SANDBOX_PROVIDERS.kind;
      if (!provider.clusters().includes(clusterName))
        throw refusal(`No Kind cluster ${clusterName} on this host: run underpost sandbox up`);
      const kubeContext = provider.contextOf(clusterName);
      const context = shellArgumentFactory(kubeContext);
      const server = kubectlRead(
        `config view --minify --context ${context} -o jsonpath='{.clusters[0].cluster.server}'`,
      );
      if (!server)
        throw refusal(`The kubeconfig has no context ${kubeContext}: run kind export kubeconfig --name ${clusterName}`);
      if (!loopbackServer(server))
        throw refusal(`Context ${kubeContext} points at ${server}, not at a Kind API server on this host`);
      const uidOf = (name) =>
        kubectlRead(`--context ${context} get namespace ${shellArgumentFactory(name)} -o jsonpath='{.metadata.uid}'`);
      const kubeSystemUid = uidOf('kube-system');
      if (!kubeSystemUid) throw refusal(`The Kind API server of ${kubeContext} does not answer`);
      const namespaces = namespacesOf(options);
      const namespaceUids = Object.fromEntries(
        [...new Set(Object.values(namespaces))].map((name) => [name, uidOf(name)]),
      );
      const { nodeName = '', role = '', peerId = '' } = readNodeIdentity();
      const identity = {
        hostname: os.hostname(),
        node: { nodeName, role, peerId },
        provider: 'kind',
        clusterName,
        kubeContext,
        server,
        kubeSystemUid,
        namespaces,
        namespaceUids,
      };
      return { sandboxId: clusterName, ...identity, fingerprint: digest(identity) };
    },

    /**
     * Refuses a host that may not run a sandbox, and a kubeconfig whose current context is not the
     * sandbox: provisioning and the MongoDB primary lookup run in the current context.
     * @param {Object} descriptor - {@link UnderpostSandbox.resolve} output.
     * @throws {Error}
     * @memberof UnderpostSandbox
     */
    assertOperable(descriptor) {
      if (roleHasCapability(descriptor.node.role, 'fleet-member'))
        throw refusal(
          `${descriptor.node.nodeName} is a ${descriptor.node.role} node, a fleet member: a Development Sandbox runs ` +
            'on a workstation or on a host with no node document',
        );
      const current = kubectlRead('config current-context');
      if (current !== descriptor.kubeContext)
        throw refusal(
          `The kubeconfig context is ${current || 'unset'}, not the sandbox ${descriptor.kubeContext}: ` +
            'run underpost sandbox up, which pins it',
        );
    },

    /**
     * The components a sandbox holds: each StatefulSet of {@link SANDBOX_COMPONENTS} in the namespace
     * of its component.
     * @param {Object} descriptor - {@link UnderpostSandbox.resolve} output.
     * @returns {string[]}
     * @memberof UnderpostSandbox
     */
    components(descriptor) {
      const held = kubectlRead(
        `--context ${shellArgumentFactory(descriptor.kubeContext)} get statefulset --all-namespaces -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\\n"}{end}'`,
      ).split('\n');
      return Object.keys(SANDBOX_COMPONENTS).filter((id) =>
        held.includes(`${descriptor.namespaces[id]}/${SANDBOX_COMPONENTS[id].workload}`),
      );
    },

    /**
     * Provisions the components a sandbox lacks, through `underpost cluster`. A component it holds is
     * left as it is: provisioning never resets a cluster, a database or a volume.
     * @param {Object} descriptor - {@link UnderpostSandbox.resolve} output.
     * @param {string[]} wanted - Component ids.
     * @param {Object} [options] - The namespace overrides the descriptor was resolved with.
     * @returns {Promise<string[]>} The components the sandbox holds afterwards.
     * @memberof UnderpostSandbox
     */
    async provision(descriptor, wanted, options = {}) {
      const held = Underpost.sandbox.components(descriptor);
      for (const id of wanted.filter((component) => !held.includes(component))) {
        const { label, workload, flag } = SANDBOX_COMPONENTS[id];
        if (id === 'ipfs') {
          const volumes = kubectlRead(
            `--context ${shellArgumentFactory(descriptor.kubeContext)} get pvc -n ${shellArgumentFactory(descriptor.namespaces.ipfs)} -o name`,
          );
          if (volumes.includes(`-${workload}-`))
            throw refusal(
              `${label} volumes exist without their StatefulSet. Provisioning recreates them: run underpost cluster --dev --ipfs to do it`,
            );
        }
        logger.info(`Provisioning ${label} in sandbox ${descriptor.sandboxId}`);
        await Underpost.cluster.init(undefined, {
          ...Underpost.namespace.overrides(options),
          dev: true,
          pullImage: true,
          [flag]: true,
        });
      }
      return Underpost.sandbox.components(descriptor);
    },

    /**
     * Holds the forwards of a sandbox as one session: every forward listens on loopback, a forward
     * that exits or stops answering opens again, and the session ends when the cluster identity
     * changes. Nothing outside the session is stopped: a port in use refuses the session.
     * @param {Object} params
     * @param {Object} params.descriptor - {@link UnderpostSandbox.resolve} output.
     * @param {Array<Object>} params.plan - {@link sandboxPlan} output.
     * @param {() => string} [params.primary] - The MongoDB primary pod; read again on each open.
     * @param {() => ?string} [params.fingerprint] - The fingerprint of the cluster now; null when unknown.
     * @param {(member:string) => void} [params.onPrimary] - Called with the member name of the primary.
     * @param {number} [params.reconcileMs]
     * @param {string} [params.directory]
     * @param {string} [params.lockDirectory]
     * @returns {Promise<{record:() => Object, ended:Promise<string>, close:() => Promise<void>}>}
     *   `ended` resolves with the reason the session ended by itself.
     * @throws {Error} When another session holds the sandbox, a port is in use, or a forward does not open.
     * @memberof UnderpostSandbox
     */
    async openSession({
      descriptor,
      plan,
      primary = () => '',
      fingerprint = () => descriptor.fingerprint,
      onPrimary = () => {},
      reconcileMs = RECONCILE_MS,
      directory = SANDBOX_DIRECTORY,
      lockDirectory = HOST_LOCK_DIRECTORY,
    }) {
      const lock = await acquireHostLock({
        name: lockName(descriptor.sandboxId),
        timeoutMs: 1,
        directory: lockDirectory,
      });
      if (!lock) {
        const [holder] = hostLockHolders(lockName(descriptor.sandboxId), 1, lockDirectory);
        throw refusal(
          `Sandbox ${descriptor.sandboxId} has a session already${holder ? ` (pid ${holder.pid})` : ''}: ` +
            `stop it with underpost sandbox down ${descriptor.clusterName}`,
        );
      }
      const entries = plan.map((spec) => ({ spec, state: 'opening', resource: '', restarts: 0, misses: 0, error: '' }));
      const startedAt = new Date().toISOString();
      let closing = false;
      let timer;
      let finish;
      const ended = new Promise((resolve) => (finish = resolve));

      const record = () => ({
        sandboxId: descriptor.sandboxId,
        pid: process.pid,
        startedAt,
        updatedAt: new Date().toISOString(),
        descriptor,
        forwards: entries.map(({ spec, state, resource, since, restarts, error }) => ({
          id: spec.id,
          label: spec.label,
          component: spec.component,
          resource,
          namespace: spec.namespace,
          context: spec.context,
          address: spec.address,
          localPort: spec.localPort,
          remotePort: spec.remotePort,
          state,
          since: since ?? '',
          restarts,
          error,
        })),
      });
      const write = () => {
        if (closing) return;
        const path = recordPath(directory, descriptor.sandboxId);
        fs.ensureDirSync(directory);
        fs.writeJsonSync(`${path}.tmp`, record(), { mode: 0o644 });
        fs.renameSync(`${path}.tmp`, path);
      };
      const open = async (entry) => {
        const { spec } = entry;
        entry.state = 'opening';
        entry.resource = spec.resource === 'primary' ? `pod/${primary()}` : spec.resource;
        const handle = await Underpost.kubectl.portForward({
          resource: entry.resource,
          namespace: spec.namespace,
          context: spec.context,
          remotePort: spec.remotePort,
          address: spec.address,
          localPort: spec.localPort,
        });
        Object.assign(entry, { handle, state: 'ready', since: new Date().toISOString(), misses: 0, error: '' });
        handle.ended.then(() => {
          if (closing || entry.handle !== handle) return;
          Object.assign(entry, { state: 'exited', error: 'the forward stopped' });
          write();
        });
        if (spec.id === 'mongodb') {
          const health = await Underpost.sandbox.probe(spec);
          if (health.member) onPrimary(health.member);
        }
      };
      const reopen = async (entry, reason) => {
        entry.handle?.close();
        entry.restarts++;
        logger.warn(`Sandbox ${descriptor.sandboxId}: ${entry.spec.label} opens again: ${reason}`);
        try {
          await open(entry);
        } catch (error) {
          Object.assign(entry, { state: 'failed', error: error.message });
        }
      };
      const close = async () => {
        if (closing) return;
        closing = true;
        clearInterval(timer);
        for (const entry of entries) entry.handle?.close();
        await Promise.all(entries.map((entry) => entry.handle?.ended));
        fs.removeSync(recordPath(directory, descriptor.sandboxId));
        lock.release();
      };
      const reconcile = async () => {
        const now = fingerprint();
        if (now && now !== descriptor.fingerprint) {
          await close();
          return finish(`The identity of cluster ${descriptor.kubeContext} changed: run underpost sandbox up again`);
        }
        for (const entry of entries) {
          if (closing) return;
          if (entry.state !== 'ready') {
            await reopen(entry, entry.error || entry.state);
            continue;
          }
          const health = await Underpost.sandbox.probe(entry.spec);
          entry.misses = health.ready ? 0 : entry.misses + 1;
          // One miss can be a slow answer; two in a row are a stale forward.
          if (entry.misses >= 2) await reopen(entry, health.detail);
        }
        write();
      };

      try {
        const busy = [];
        for (const { spec } of entries)
          if (!(await portFree(spec.address, spec.localPort)))
            busy.push(`${spec.label} ${spec.address}:${spec.localPort}`);
        if (busy.length)
          throw refusal(
            `In use by another process: ${busy.join(', ')}. Stop that process; the sandbox never stops a process it did not start`,
          );
        for (const entry of entries) await open(entry);
      } catch (error) {
        closing = true;
        for (const entry of entries) entry.handle?.close();
        lock.release();
        throw error;
      }
      write();
      timer = setInterval(() => {
        reconcile().catch((error) => logger.error(`Sandbox ${descriptor.sandboxId}: ${error.message}`));
      }, reconcileMs);
      return { record, ended, close };
    },

    /**
     * Starts a sandbox: creates the default Kind cluster when it is missing, pins its context for this
     * process, provisions the components it lacks in their namespaces, then holds its forwards. It never
     * resets a cluster, a database or a volume.
     * @param {{clusterName?:string, options?:Object, ipfs?:boolean}} [params] - `options` carry the
     *   namespace overrides.
     * @returns {Promise<Object>} The session of {@link UnderpostSandbox.openSession}, with `descriptor`.
     * @memberof UnderpostSandbox
     */
    async up({ clusterName = SANDBOX_DEFAULT_CLUSTER, options = {}, ipfs = false } = {}) {
      assertName(clusterName);
      if (!SANDBOX_PROVIDERS.kind.clusters().includes(clusterName)) {
        if (clusterName !== SANDBOX_DEFAULT_CLUSTER)
          throw refusal(
            `No Kind cluster ${clusterName} on this host: create it with kind create cluster --name ${clusterName}`,
          );
        await Underpost.cluster.createKind({ underpostRoot: '.' });
      }
      const identity = Underpost.sandbox.resolve({ clusterName, options });
      const { context } = Underpost.namespace.cluster({ environment: 'development' });
      if (context && context !== identity.kubeContext)
        throw refusal(
          `conf.cluster.json names the development context ${context}, not the sandbox ${identity.kubeContext}`,
        );
      // Every kubectl of this command, and of each command it starts, reaches the sandbox.
      Underpost.namespace.pin({
        environment: 'development',
        context: identity.kubeContext,
        source: 'the sandbox',
        runtime: 'kind',
      });
      Underpost.sandbox.assertOperable(identity);
      const wanted = Object.keys(SANDBOX_COMPONENTS).filter(
        (id) => SANDBOX_COMPONENTS[id].default || (id === 'ipfs' && ipfs),
      );
      const held = await Underpost.sandbox.provision(identity, wanted, options);
      // Provisioning creates the namespaces it needs: the session holds the identity they give.
      const descriptor = Underpost.sandbox.resolve({ clusterName, options });
      const session = await Underpost.sandbox.openSession({
        descriptor,
        plan: sandboxPlan(descriptor, held),
        primary: () => {
          Underpost.sandbox.assertOperable(descriptor);
          const pod = MongoBootstrap.getPrimaryPodName({
            namespace: descriptor.namespaces.mongodb,
            podName: `${MONGODB_STATEFULSET_NAME}-0`,
          });
          if (!pod) throw new Error(`No MongoDB primary answers in sandbox ${descriptor.sandboxId}`);
          return pod;
        },
        fingerprint: () => {
          try {
            return Underpost.sandbox.resolve({ clusterName, options }).fingerprint;
          } catch {
            // A slow API server is not another cluster: the forwards report it.
            return null;
          }
        },
        onPrimary: (member) => {
          const [name] = member.split(':');
          if (net.isIP(name)) return;
          try {
            etcHostFactory([name], { blockId: lockName(descriptor.sandboxId) });
          } catch (error) {
            logger.warn(`Map ${name} to ${SANDBOX_ADDRESS} in /etc/hosts for replica set clients: ${error.message}`);
          }
        },
      });
      return { ...session, descriptor };
    },

    /**
     * The state of a sandbox: its identity now, its session, and each service checked through its
     * forward. A port that answers outside a session is reported as foreign, never as the sandbox.
     * @param {{clusterName?:string, options?:Object}} [params] - `options` carry the namespace overrides.
     * @returns {Promise<Object>}
     * @memberof UnderpostSandbox
     */
    async status({ clusterName = SANDBOX_DEFAULT_CLUSTER, options = {} } = {}) {
      let sandbox = null;
      let error = '';
      try {
        sandbox = Underpost.sandbox.resolve({ clusterName, options });
      } catch (refused) {
        error = refused.message;
      }
      const session = Underpost.sandbox.sessions().find(({ sandboxId }) => sandboxId === clusterName) ?? null;
      const forwards =
        session?.forwards ??
        SANDBOX_SERVICES.map((service) => ({
          id: service.id,
          label: service.label,
          component: service.component,
          resource: service.resource,
          namespace: namespacesOf(options)[service.component],
          address: SANDBOX_ADDRESS,
          localPort: service.port,
          remotePort: service.port,
          state: 'closed',
        }));
      const services = await Promise.all(
        forwards.map(async (forward) => {
          const owned = forward.state === 'ready';
          const health =
            owned || (await listening(forward.address, forward.localPort))
              ? await Underpost.sandbox.probe(forward)
              : null;
          return {
            ...forward,
            owner: owned ? 'sandbox' : health ? 'foreign' : 'none',
            ready: owned && health.ready,
            detail: health?.detail ?? 'nothing listens',
          };
        }),
      );
      return {
        sandbox,
        error,
        context: { current: kubectlRead('config current-context'), sandbox: sandbox?.kubeContext ?? '' },
        session: session && {
          pid: session.pid,
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
          fingerprint: session.descriptor.fingerprint,
          current: sandbox?.fingerprint === session.descriptor.fingerprint,
        },
        services,
      };
    },

    /**
     * Stops the session of a sandbox: signals its own process, never a process found by port.
     * @param {{clusterName?:string}} [options]
     * @returns {Promise<{stopped:boolean, pid?:number}>}
     * @throws {Error} When the session does not stop in time or belongs to another user.
     * @memberof UnderpostSandbox
     */
    async down({ clusterName = SANDBOX_DEFAULT_CLUSTER } = {}) {
      const [holder] = hostLockHolders(lockName(clusterName));
      if (!holder) return { stopped: false };
      try {
        process.kill(holder.pid, 'SIGTERM');
      } catch (error) {
        throw refusal(
          error.code === 'EPERM'
            ? `The session of sandbox ${clusterName} (pid ${holder.pid}) runs as another user: stop it as that user`
            : error.message,
        );
      }
      const deadline = Date.now() + STOP_TIMEOUT_MS;
      while (hostLockHolders(lockName(clusterName)).length && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 200));
      if (hostLockHolders(lockName(clusterName)).length)
        throw new Error(`The session of sandbox ${clusterName} (pid ${holder.pid}) did not stop in time`);
      return { stopped: true, pid: holder.pid };
    },

    /**
     * The `underpost sandbox` command.
     * @param {'up'|'status'|'down'} operation
     * @param {string} [clusterName]
     * @param {{namespace?:string, ipfs?:boolean}} [options]
     * @memberof UnderpostSandbox
     */
    async callback(operation, clusterName = SANDBOX_DEFAULT_CLUSTER, options = {}) {
      const params = { clusterName, options, ipfs: options.ipfs === true };
      try {
        if (operation === 'status') return console.log(JSON.stringify(await Underpost.sandbox.status(params), null, 2));
        if (operation === 'down') {
          const { stopped, pid } = await Underpost.sandbox.down(params);
          return logger.info(
            stopped
              ? `Stopped the session of sandbox ${clusterName} (pid ${pid})`
              : `Sandbox ${clusterName} has no session`,
          );
        }
        if (operation !== 'up') throw refusal(`Unknown operation ${operation}: up, status or down`);
        const session = await Underpost.sandbox.up(params);
        for (const forward of session.record().forwards)
          logger.info(
            `${forward.label}: ${forward.address}:${forward.localPort} -> ${forward.resource}:${forward.remotePort} (${forward.namespace}, ${forward.context})`,
          );
        logger.info(`Sandbox ${clusterName} is up (fingerprint ${session.descriptor.fingerprint}) until Ctrl+C`);
        const reason = await Promise.race([
          session.ended,
          new Promise((resolve) =>
            ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => process.once(signal, () => resolve(''))),
          ),
        ]);
        await session.close();
        if (reason) throw new Error(reason);
        logger.info(`Sandbox ${clusterName}: the forwards are closed`);
        process.exit(0);
      } catch (error) {
        logger.error(error.message);
        process.exit(error.expected ? 3 : 1);
      }
    },
  };
}

export default UnderpostSandbox;
