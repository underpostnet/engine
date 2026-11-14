// Needs only Node and a POSIX shell: stand-ins for sudo, kubectl and kind on PATH replace the real ones,
// and test servers stand in for the services of the cluster.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import nodePath from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Underpost from '../../../src/index.js';
import { sandboxPlan } from '../../../src/cli/sandbox.js';
import { hostLockHolders } from '../../../src/server/runtime/host-lock.js';
import { alive } from '../../support/process.js';
import { freePort, installSandbox, sandboxDescriptor } from '../../support/sandbox.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import mongoose from 'mongoose';

// The host that runs the suite is never a container: a case stubs KUBERNETES_SERVICE_HOST to run in a pod.
vi.mock('../../../src/server/runtime/environment.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isOciRuntime: () => !!process.env.KUBERNETES_SERVICE_HOST,
}));

const ENTRY = fileURLToPath(new URL('../../../src/index.js', import.meta.url));
const CLI = fileURLToPath(new URL('../../../bin/index.js', import.meta.url));
const CLUSTER = 'underpost-test';
const FIXTURE = Object.freeze({
  clusters: [CLUSTER],
  currentContext: `kind-${CLUSTER}`,
  server: 'https://127.0.0.1:40000',
  uids: { 'kube-system': 'uid-1', default: 'ns-1' },
  statefulsets: ['mongodb', 'valkey-service'],
  pods: ['mongodb-0'],
  primary: 'mongodb-0.mongodb-service:27017',
});

const until = async (condition, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition()) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  return condition();
};

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
/** Stops a test server and every connection it holds: a forward keeps its connections open. */
const stop = (server) =>
  new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
    for (const socket of server.sockets ?? []) socket.destroy();
    server.closeAllConnections?.();
  });
const tracked = (server) => {
  server.sockets = new Set();
  server.on('connection', (socket) => {
    server.sockets.add(socket);
    socket.on('close', () => server.sockets.delete(socket));
  });
  return server;
};
const answers = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
  });

/** Valkey: answers PING. */
const valkeyServer = () =>
  tracked(net.createServer((socket) => socket.on('data', () => socket.write('+PONG\r\n')).on('error', () => {})));
/** Kubo: answers its version. */
const kuboServer = () =>
  http.createServer((req, res) => {
    res.writeHead(req.url === '/api/v0/version' && req.method === 'POST' ? 200 : 404, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({ Version: '0.36.0' }));
  });

let sandbox;
let cwd;
let scratch;
let servers = [];
let sessions = [];

/** A plan of the sandbox services `ids`, each on a free local port to an upstream test server. */
const planOf = async (descriptor, upstreams) => {
  const plan = [];
  for (const forward of sandboxPlan(descriptor, ['mongodb', 'valkey', 'ipfs'])) {
    if (!upstreams[forward.id]) continue;
    const remotePort = await freePort();
    sandbox.upstream(remotePort, `127.0.0.1:${upstreams[forward.id]}`);
    plan.push({ ...forward, remotePort, localPort: await freePort() });
  }
  return plan;
};
const serve = async (server) => {
  servers.push(server);
  return listen(server);
};
const open = async (params) => {
  const session = await Underpost.sandbox.openSession({
    directory: sandbox.directory,
    lockDirectory: sandbox.lockDirectory,
    ...params,
  });
  sessions.push(session);
  return session;
};
const forwardPids = () =>
  sandbox
    .kubectlCalls()
    .filter(({ args }) => args.includes('port-forward'))
    .map(({ pid, args }) => ({ pid, port: Number(args.at(-1).split(':')[0]) }));

const kubeconfig = process.env.KUBECONFIG;

beforeAll(() => {
  sandbox = installSandbox(FIXTURE);
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-sandbox-host-'));
  process.chdir(scratch);
});

afterAll(() => {
  process.chdir(cwd);
  fs.removeSync(scratch);
  sandbox.restore();
});

beforeEach(() => {
  sandbox.answer(FIXTURE);
  // A change in an environment needs its routing and its TLS policy.
  fs.outputJsonSync(nodePath.join(scratch, 'engine-private/deploy/conf.cluster.json'), {
    environments: {
      development: { profile: 'legacy', routing: { provider: 'gateway-api' }, tls: { mode: 'self-signed' } },
    },
  });
});

afterEach(async () => {
  for (const session of sessions) await session.close();
  for (const server of servers) await stop(server).catch(() => {});
  for (const { pid } of forwardPids()) if (alive(pid)) process.kill(pid, 'SIGKILL');
  fs.removeSync(sandbox.env.SANDBOX_KUBECTL_LOG);
  fs.removeSync(nodePath.join(scratch, 'engine-private'));
  sessions = [];
  servers = [];
  vi.restoreAllMocks();
  if (kubeconfig === undefined) delete process.env.KUBECONFIG;
  else process.env.KUBECONFIG = kubeconfig;
});

describe('the identity of a Development Sandbox', () => {
  it('reads the Kind cluster, its context and the namespace of each service; a recreated cluster has another fingerprint', () => {
    const before = Underpost.sandbox.resolve({ clusterName: CLUSTER });
    expect(before).toMatchObject({
      sandboxId: CLUSTER,
      provider: 'kind',
      clusterName: CLUSTER,
      kubeContext: `kind-${CLUSTER}`,
      server: FIXTURE.server,
      kubeSystemUid: 'uid-1',
      namespaces: { mongodb: 'default', valkey: 'default', ipfs: 'default' },
      namespaceUids: { default: 'ns-1' },
      hostname: os.hostname(),
      node: { role: '' },
    });
    sandbox.answer({ ...FIXTURE, uids: { ...FIXTURE.uids, 'kube-system': 'uid-2' } });
    const after = Underpost.sandbox.resolve({ clusterName: CLUSTER });
    expect(after.kubeContext).toBe(before.kubeContext);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('refuses a context that points at a remote API server and a missing cluster, and places each service apart', () => {
    sandbox.answer({ ...FIXTURE, server: 'https://192.168.1.85:6443' });
    expect(() => Underpost.sandbox.resolve({ clusterName: CLUSTER })).toThrow(
      `Context kind-${CLUSTER} points at https://192.168.1.85:6443, not at a Kind API server on this host`,
    );
    sandbox.answer({ ...FIXTURE, clusters: [] });
    expect(() => Underpost.sandbox.resolve({ clusterName: CLUSTER })).toThrow(
      `No Kind cluster ${CLUSTER} on this host`,
    );
    sandbox.answer(FIXTURE);
    // A namespace the cluster does not hold yet has no uid: provisioning creates it.
    expect(Underpost.sandbox.resolve({ clusterName: CLUSTER, options: { namespaceMongodb: 'dd-data' } })).toMatchObject(
      {
        namespaces: { mongodb: 'dd-data', valkey: 'default', ipfs: 'default' },
        namespaceUids: { 'dd-data': '', default: 'ns-1' },
      },
    );
    expect(() => Underpost.sandbox.resolve({ clusterName: CLUSTER, options: { namespaceValkey: 'Bad_NS' } })).toThrow(
      'is not a Kubernetes namespace name',
    );
    expect(() => Underpost.sandbox.resolve({ clusterName: 'Bad Name' })).toThrow('Invalid Kind cluster name');
  });

  it('refuses another current context, and a host that is a fleet member', () => {
    sandbox.answer({ ...FIXTURE, currentContext: 'kubernetes-admin@kubernetes' });
    const descriptor = Underpost.sandbox.resolve({ clusterName: CLUSTER });
    expect(() => Underpost.sandbox.assertOperable(descriptor)).toThrow(
      `The kubeconfig context is kubernetes-admin@kubernetes, not the sandbox kind-${CLUSTER}: ` +
        'run underpost sandbox up, which pins it',
    );
    sandbox.answer(FIXTURE);
    for (const [role, refused] of [
      ['workstation', false],
      ['control', true],
      ['worker', true],
    ]) {
      fs.outputJsonSync(nodePath.join(scratch, `engine-private/deploy/nodes/${os.hostname().split('.')[0]}.json`), {
        role,
        peerId: `${role}-peer`,
      });
      const check = () => Underpost.sandbox.assertOperable(Underpost.sandbox.resolve({ clusterName: CLUSTER }));
      if (refused) expect(check, role).toThrow(`is a ${role} node, a fleet member`);
      else expect(check, role).not.toThrow();
    }
  });
});

describe('the start of a Development Sandbox', () => {
  const held = () => {
    const opened = vi.spyOn(Underpost.sandbox, 'openSession').mockResolvedValue({
      record: () => ({ forwards: [] }),
      ended: new Promise(() => {}),
      close: async () => {},
    });
    const init = vi.spyOn(Underpost.cluster, 'init').mockResolvedValue();
    const createKind = vi.spyOn(Underpost.cluster, 'createKind').mockReturnValue();
    return { opened, init, createKind };
  };

  it('provisions only the components the sandbox lacks, and never resets a cluster, a database or a volume', async () => {
    sandbox.answer({ ...FIXTURE, statefulsets: ['mongodb'] });
    const { opened, init, createKind } = held();
    await Underpost.sandbox.up({ clusterName: CLUSTER, ipfs: true });
    expect(createKind).not.toHaveBeenCalled();
    expect(init.mock.calls.map(([, options]) => options)).toEqual([
      { dev: true, pullImage: true, valkey: true },
      { dev: true, pullImage: true, ipfs: true },
    ]);
    for (const [, options] of init.mock.calls)
      for (const flag of ['reset', 'resetMongodb', 'removeVolumeHostPaths']) expect(options).not.toHaveProperty(flag);
    expect(sandbox.kubectlCalls().map(({ args }) => args.join(' '))).not.toContainEqual(
      expect.stringMatching(/delete/),
    );

    const [[{ plan, primary, descriptor }]] = opened.mock.calls;
    expect(descriptor).toMatchObject({ sandboxId: CLUSTER, kubeContext: `kind-${CLUSTER}` });
    expect(plan.map(({ namespace }) => namespace)).toEqual(['default']);
    expect(plan.map(({ id, address, context, resource }) => [id, address, context, resource])).toEqual([
      ['mongodb', '127.0.0.1', `kind-${CLUSTER}`, 'primary'],
    ]);
    expect(primary()).toBe('mongodb-0');
    sandbox.answer({ ...FIXTURE, currentContext: 'kubernetes-admin@kubernetes' });
    expect(() => primary()).toThrow('run underpost sandbox up');
    // Every kubectl of the command, and of each command it starts, reaches the sandbox.
    const [pin] = process.env.KUBECONFIG.split(nodePath.delimiter);
    expect(fs.readJsonSync(pin)['current-context']).toBe(`kind-${CLUSTER}`);
  });

  it('refuses a development context of conf.cluster.json that is not the sandbox', async () => {
    fs.outputJsonSync(nodePath.join(scratch, 'engine-private/deploy/conf.cluster.json'), {
      environments: { development: { context: 'kind-other', profile: 'legacy' } },
    });
    const { init } = held();
    await expect(Underpost.sandbox.up({ clusterName: CLUSTER })).rejects.toThrow(
      `conf.cluster.json names the development context kind-other, not the sandbox kind-${CLUSTER}`,
    );
    expect(init).not.toHaveBeenCalled();
  });

  it('provisions and forwards each service in its own namespace, as the command places it', async () => {
    sandbox.answer({ ...FIXTURE, statefulsets: ['dd-data/mongodb'], pvcs: [] });
    const { opened, init } = held();
    await Underpost.sandbox.up({
      clusterName: CLUSTER,
      options: { namespaceMongodb: 'dd-data', namespaceValkey: 'dd-cache' },
    });
    expect(init.mock.calls.map(([, options]) => options)).toEqual([
      { namespaceMongodb: 'dd-data', namespaceValkey: 'dd-cache', dev: true, pullImage: true, valkey: true },
    ]);
    const [[{ plan, descriptor }]] = opened.mock.calls;
    expect(descriptor.namespaces).toEqual({ mongodb: 'dd-data', valkey: 'dd-cache', ipfs: 'default' });
    expect(plan.map(({ id, namespace }) => [id, namespace])).toEqual([['mongodb', 'dd-data']]);
  });

  it('refuses IPFS volumes left without their StatefulSet, and a missing cluster it does not create', async () => {
    sandbox.answer({ ...FIXTURE, pvcs: ['persistentvolumeclaim/ipfs-storage-ipfs-cluster-0'] });
    const { init, createKind } = held();
    await expect(Underpost.sandbox.up({ clusterName: CLUSTER, ipfs: true })).rejects.toThrow(
      'IPFS Cluster volumes exist without their StatefulSet',
    );
    expect(init).not.toHaveBeenCalled();
    sandbox.answer({ ...FIXTURE, clusters: [] });
    await expect(Underpost.sandbox.up({ clusterName: CLUSTER })).rejects.toThrow(
      `create it with kind create cluster --name ${CLUSTER}`,
    );
    expect(createKind).not.toHaveBeenCalled();
  });
});

describe('a session of a Development Sandbox', () => {
  it('forwards each service on loopback in the sandbox context, and checks each one with its own protocol', async () => {
    const descriptor = sandboxDescriptor(CLUSTER);
    const plan = await planOf(descriptor, {
      valkey: await serve(valkeyServer()),
      'ipfs-api': await serve(kuboServer()),
    });
    const session = await open({ descriptor, plan });
    const { forwards } = session.record();
    expect(forwards).toEqual([
      expect.objectContaining({ id: 'valkey', resource: 'svc/valkey-service', address: '127.0.0.1', state: 'ready' }),
      expect.objectContaining({ id: 'ipfs-api', resource: 'svc/ipfs-cluster', address: '127.0.0.1', state: 'ready' }),
    ]);
    for (const { args } of sandbox.kubectlCalls().filter(({ args }) => args.includes('port-forward'))) {
      expect(args.slice(0, 2)).toEqual(['--context', `kind-${CLUSTER}`]);
      expect(args[args.indexOf('--address') + 1]).toBe('127.0.0.1');
    }
    expect(await Underpost.sandbox.probe(forwards[0])).toEqual({ ready: true, detail: 'PONG' });
    expect(await Underpost.sandbox.probe(forwards[1])).toEqual({ ready: true, detail: 'Kubo 0.36.0' });

    // A listener alone proves no service.
    const silent = tracked(net.createServer(() => {}));
    const port = await serve(silent);
    expect(await Underpost.sandbox.probe({ id: 'valkey', address: '127.0.0.1', localPort: port })).toMatchObject({
      ready: false,
    });

    const options = { directory: sandbox.directory, lockDirectory: sandbox.lockDirectory };
    expect(Underpost.sandbox.sessions(options).map(({ sandboxId }) => sandboxId)).toEqual([CLUSTER]);
    expect(Underpost.sandbox.serving({ host: 'localhost', port: forwards[0].localPort }, options)).toMatchObject({
      forward: { id: 'valkey' },
    });
    // A --dev command reaches each service of the live sandbox through its forward, and nothing else.
    expect(Underpost.sandbox.live(options).descriptor.kubeContext).toBe(`kind-${CLUSTER}`);
    expect(Underpost.sandbox.endpoint('valkey', options)).toEqual({ host: '127.0.0.1', port: forwards[0].localPort });
    expect(() => Underpost.sandbox.database({ name: 'app', host: 'mongodb-0.mongodb-service:27017' }, options)).toThrow(
      `The sandbox ${CLUSTER} serves no mongodb`,
    );
    await session.close();
    expect(Underpost.sandbox.sessions(options)).toEqual([]);
    expect(() => Underpost.sandbox.live(options)).toThrow('none runs on this host: start it with underpost sandbox up');
    for (const { localPort } of forwards) expect(await answers(localPort)).toBe(false);
  });

  it('refuses a port another process holds, and stops nothing it did not start', async () => {
    const descriptor = sandboxDescriptor(CLUSTER);
    const [plan] = await planOf(descriptor, { valkey: await serve(valkeyServer()) });
    const foreign = valkeyServer();
    await new Promise((resolve) => foreign.listen(plan.localPort, '127.0.0.1', resolve));
    servers.push(foreign);
    await expect(open({ descriptor, plan: [plan] })).rejects.toThrow(
      `In use by another process: Valkey 127.0.0.1:${plan.localPort}`,
    );
    expect(await answers(plan.localPort)).toBe(true);
    expect(forwardPids()).toEqual([]);
    expect(hostLockHolders(`sandbox-${CLUSTER}`, 1, sandbox.lockDirectory)).toEqual([]);
  });

  it('holds one session per sandbox', async () => {
    const descriptor = sandboxDescriptor(CLUSTER);
    const upstream = await serve(valkeyServer());
    await open({ descriptor, plan: await planOf(descriptor, { valkey: upstream }) });
    await expect(open({ descriptor, plan: await planOf(descriptor, { valkey: upstream }) })).rejects.toThrow(
      `Sandbox ${CLUSTER} has a session already (pid ${process.pid}): stop it with underpost sandbox down ${CLUSTER}`,
    );
  });

  it('opens again a forward that exits, and one that stops answering', async () => {
    const descriptor = sandboxDescriptor(CLUSTER);
    const upstream = valkeyServer();
    const session = await open({
      descriptor,
      plan: await planOf(descriptor, { valkey: await serve(upstream) }),
      reconcileMs: 100,
    });
    const [{ pid }] = forwardPids();
    process.kill(pid, 'SIGKILL');
    expect(await until(() => session.record().forwards[0].restarts === 1 && forwardPids().length === 2)).toBe(true);
    expect(await until(() => session.record().forwards[0].state === 'ready')).toBe(true);
    expect(await Underpost.sandbox.probe(session.record().forwards[0])).toMatchObject({ ready: true });

    await stop(upstream);
    expect(await until(() => session.record().forwards[0].restarts >= 2)).toBe(true);
  });

  it('ends when the identity of its cluster changes', async () => {
    const descriptor = sandboxDescriptor(CLUSTER);
    let fingerprint = descriptor.fingerprint;
    const session = await open({
      descriptor,
      plan: await planOf(descriptor, { valkey: await serve(valkeyServer()) }),
      fingerprint: () => fingerprint,
      reconcileMs: 100,
    });
    fingerprint = 'sha256:recreated';
    await expect(session.ended).resolves.toBe(
      `The identity of cluster kind-${CLUSTER} changed: run underpost sandbox up again`,
    );
    expect(Underpost.sandbox.sessions({ directory: sandbox.directory, lockDirectory: sandbox.lockDirectory })).toEqual(
      [],
    );
  });

  it('stops every forward when its process dies without a close', async () => {
    const upstream = await serve(valkeyServer());
    const descriptor = sandboxDescriptor(CLUSTER);
    const plan = await planOf(descriptor, { valkey: upstream });
    const owner = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { default: Underpost } = await import(${JSON.stringify(ENTRY)});
await Underpost.sandbox.openSession(${JSON.stringify({
          descriptor,
          plan,
          directory: sandbox.directory,
          lockDirectory: sandbox.lockDirectory,
        })});
process.kill(process.pid, 'SIGKILL');`,
      ],
      { stdio: 'ignore', env: process.env },
    );
    const [, signal] = await new Promise((resolve) => owner.on('exit', (...outcome) => resolve(outcome)));
    expect(signal).toBe('SIGKILL');
    const [{ pid, port }] = forwardPids();
    expect(await until(() => !alive(pid))).toBe(true);
    // A dead process can hold its sockets while its other threads exit.
    expect(await until(async () => !(await answers(port)))).toBe(true);
    expect(Underpost.sandbox.sessions({ directory: sandbox.directory, lockDirectory: sandbox.lockDirectory })).toEqual(
      [],
    );
  });
});

describe('the sandbox command', () => {
  const cli = (...args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, 'sandbox', ...args], { cwd: scratch, env: process.env });
      let stdout = '';
      let output = '';
      child.stdout.on('data', (chunk) => ((stdout += chunk), (output += chunk)));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('close', (status) => resolve({ status, stdout, output }));
    });
  const json = ({ stdout }) => JSON.parse(stdout.slice(stdout.indexOf('{\n'), stdout.lastIndexOf('\n}') + 2));

  it('reports a port that answers outside the session as foreign, and stops a session by its own process', async () => {
    const descriptor = Underpost.sandbox.resolve({ clusterName: CLUSTER });
    const plan = await planOf(descriptor, { valkey: await serve(valkeyServer()) });
    // The child holds the session where the command finds it: under its own temporary directory.
    const holder = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { default: Underpost } = await import(${JSON.stringify(ENTRY)});
await Underpost.sandbox.openSession(${JSON.stringify({ descriptor, plan, reconcileMs: 600000 })});
console.log('ready');`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'], env: process.env },
    );
    await new Promise((resolve) => holder.stdout.on('data', resolve));

    const running = await cli('status', CLUSTER);
    expect(running.status, running.output).toBe(0);
    expect(json(running)).toMatchObject({
      sandbox: { sandboxId: CLUSTER, fingerprint: descriptor.fingerprint },
      context: { current: `kind-${CLUSTER}`, sandbox: `kind-${CLUSTER}` },
      session: { pid: holder.pid, current: true },
      services: [{ id: 'valkey', owner: 'sandbox', ready: true, detail: 'PONG' }],
    });

    // The forward of the session exits, and another process takes its port.
    const [{ pid }] = forwardPids();
    process.kill(pid, 'SIGKILL');
    await until(async () => !alive(pid) && !(await answers(plan[0].localPort)));
    const foreign = valkeyServer();
    await new Promise((resolve, reject) =>
      foreign.once('error', reject).listen(plan[0].localPort, '127.0.0.1', resolve),
    );
    servers.push(foreign);
    const taken = await cli('status', CLUSTER);
    expect(json(taken).services).toEqual([expect.objectContaining({ id: 'valkey', owner: 'foreign', ready: false })]);

    const down = await cli('down', CLUSTER);
    expect(down.status, down.output).toBe(0);
    expect(down.output).toContain(`Stopped the session of sandbox ${CLUSTER} (pid ${holder.pid})`);
    expect(await until(() => !alive(holder.pid))).toBe(true);
    expect(await answers(plan[0].localPort)).toBe(true);
    const idle = await cli('down', CLUSTER);
    expect(idle.output).toContain(`Sandbox ${CLUSTER} has no session`);
  }, 60000);
});

describe.skipIf(!mongodBinary)('a --dev command', () => {
  it('reaches MongoDB through the forward of the live sandbox, whatever host the configuration names', async () => {
    const mongod = await startMongod('dev-command');
    let holder;
    try {
      const client = await new mongoose.mongo.MongoClient(`mongodb://${mongod.host}/?directConnection=true`).connect();
      await client
        .db('app')
        .collection('users')
        .insertMany([{ email: 'a@dev.test' }, { email: 'b@dev.test' }]);
      await client.close();
      // The configuration names the in-cluster member, which no host outside the cluster resolves.
      fs.outputJsonSync(nodePath.join(scratch, 'engine-private/conf/dd-dev/conf.server.json'), {
        'app.test': {
          '/': {
            apis: ['user', 'file'],
            db: { provider: 'mongoose', host: 'mongodb-0.mongodb-service:27017', name: 'app' },
          },
        },
      });
      const descriptor = Underpost.sandbox.resolve({ clusterName: CLUSTER });
      const plan = await planOf(descriptor, { mongodb: mongod.port });
      holder = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const { default: Underpost } = await import(${JSON.stringify(ENTRY)});
await Underpost.sandbox.openSession({ ...${JSON.stringify({ descriptor, plan })}, primary: () => 'mongodb-0' });
console.log('ready');`,
        ],
        { stdio: ['ignore', 'pipe', 'inherit'], env: process.env },
      );
      await new Promise((resolve) => holder.stdout.on('data', resolve));
      const options = { directory: sandbox.directory, lockDirectory: sandbox.lockDirectory };
      expect(
        await until(() => Underpost.sandbox.sessions(options)[0]?.forwards.every(({ state }) => state === 'ready')),
      ).toBe(true);

      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('DB_')));
      const run = await new Promise((resolve) => {
        const child = spawn(
          process.execPath,
          [CLI, 'db', 'collection', 'inspect', 'user', '--dev', '--deploy-id', 'dd-dev', '--host', 'app.test'],
          { cwd: scratch, env: { ...env, DB_HOST: 'mongodb-0.mongodb-service:27017', DB_REPLICA_SET: 'rs0' } },
        );
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.on('close', (status) => resolve({ status, output }));
      });
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain(`"server": "127.0.0.1:${plan[0].localPort}"`);
      expect(run.output).toMatch(/"collection": "users"[\s\S]*"documents": 2/);
    } finally {
      if (holder && alive(holder.pid)) holder.kill('SIGTERM');
      await mongod.stop();
    }
  });
});
