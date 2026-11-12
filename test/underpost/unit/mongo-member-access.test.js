import { describe, it, expect, vi, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';

// A process outside the cluster reaches one replica set member: a forward to it, then a direct connection.
const spawned = vi.hoisted(() => []);
vi.mock('../../../src/server/runtime/process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shellSpawn: vi.fn((command) => {
    let exit;
    const entry = {
      command,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      exited: new Promise((resolve, reject) => (exit = { resolve, reject })),
    };
    entry.exited.catch(() => {});
    entry.exit = exit;
    spawned.push(entry);
    return entry;
  }),
}));

// Whether this process runs in a container; the real answer unless a case sets it.
const container = vi.hoisted(() => ({ value: undefined }));
vi.mock('../../../src/server/runtime/environment.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, isOciRuntime: () => container.value ?? original.isOciRuntime() };
});

const { default: Underpost } = await import('../../../src/index.js');
const { MongooseDB } = await import('../../../src/db/mongo/mongoose-db.js');

afterEach(() => {
  spawned.length = 0;
  container.value = undefined;
  vi.unstubAllEnvs();
});

describe('a forward to one pod', () => {
  it('listens on a free local port once kubectl says it forwards', async () => {
    const pending = Underpost.kubectl.portForward({
      resource: 'pod/mongodb-1',
      namespace: 'default',
      remotePort: 27017,
    });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    const [forward] = spawned;
    expect(forward.command).toMatch(
      /^sh -c '.*kubectl port-forward -n '\\''default'\\'' '\\''pod\/mongodb-1'\\'' --address '\\''127\.0\.0\.1'\\'' \d+:27017 /,
    );
    forward.stdout.write('Forwarding from 127.0.0.1:4100 -> 27017\n');
    const { localPort, close } = await pending;
    expect(forward.command).toContain(` ${localPort}:27017`);
    expect(forward.stdin.writableEnded).toBe(false);
    close();
    expect(forward.stdin.writableEnded).toBe(true);
  });

  it('pins the kubeconfig context and forwards a Service, and refuses any other resource', async () => {
    const pending = Underpost.kubectl.portForward({
      resource: 'svc/valkey-service',
      context: 'kind-kind',
      remotePort: 6379,
      localPort: 6379,
    });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    expect(spawned[0].command).toMatch(
      /kubectl --context '\\''kind-kind'\\'' port-forward -n '\\''default'\\'' '\\''svc\/valkey-service'\\'' --address '\\''127\.0\.0\.1'\\'' 6379:6379 /,
    );
    spawned[0].stdout.write('Forwarding from 127.0.0.1:6379 -> 6379\n');
    (await pending).close();
    for (const resource of ['mongodb-0', 'deployment/x', 'pod/$(id)', ''])
      await expect(Underpost.kubectl.portForward({ resource, remotePort: 27017 }), resource).rejects.toThrow(
        'A forward targets pod/<name> or svc/<name>',
      );
    expect(spawned).toHaveLength(1);
  });

  it('fails when kubectl exits or never listens, and stops it', async () => {
    const refused = Underpost.kubectl.portForward({ resource: 'pod/gone', remotePort: 27017 });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    spawned[0].exit.reject(Object.assign(new Error('exit 1'), { stderr: 'pods "gone" not found' }));
    await expect(refused).rejects.toThrow(/pods "gone" not found/);
    expect(spawned[0].stdin.writableEnded).toBe(true);

    const silent = Underpost.kubectl.portForward({ resource: 'pod/slow', remotePort: 27017, readyTimeoutMs: 20 });
    await expect(silent).rejects.toThrow(/did not listen in 20ms/);
  });
});

describe('a connection to one member', () => {
  // Sets every variable the connection reads, so the shell env of the run has no effect.
  const stubConnectionEnv = (values = {}) => {
    for (const [name, value] of Object.entries({
      DB_REPLICA_SET: 'rs0',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_AUTH_SOURCE: '',
      NODE_ENV: 'test',
      ...values,
    }))
      vi.stubEnv(name, value);
  };

  it('names the replica set of the environment, unless the connection is direct', () => {
    stubConnectionEnv();
    expect(MongooseDB.buildUri({ host: 'mongodb://127.0.0.1:27017', name: 'app' })).toBe(
      'mongodb://127.0.0.1:27017/app?replicaSet=rs0',
    );
    expect(MongooseDB.buildUri({ host: '127.0.0.1:41000', name: 'app', directConnection: true })).toBe(
      'mongodb://127.0.0.1:41000/app?directConnection=true',
    );
    expect(MongooseDB.buildUri({ host: 'a:1,b:2', name: 'app', directConnection: true })).toBe(
      'mongodb://a:1,b:2/app?replicaSet=rs0',
    );
  });

  it('reaches one forwarded member alone in development on this host, never in a container', () => {
    stubConnectionEnv({ NODE_ENV: 'development' });
    container.value = false;
    expect(MongooseDB.buildUri({ host: 'mongodb://127.0.0.1:27017', name: 'app' })).toBe(
      'mongodb://127.0.0.1:27017/app?directConnection=true',
    );
    container.value = true;
    expect(MongooseDB.buildUri({ host: 'mongodb-0.mongodb-service:27017', name: 'app' })).toBe(
      'mongodb://mongodb-0.mongodb-service:27017/app?replicaSet=rs0',
    );
  });
});
