import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// A process outside the cluster reaches one replica set member: a forward to it, then a direct connection.
const spawned = vi.hoisted(() => []);
vi.mock('../../../src/server/runtime/process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shellSpawn: vi.fn((command) => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    let exit;
    const entry = {
      command,
      child,
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

const { default: Underpost } = await import('../../../src/index.js');
const { MongooseDB } = await import('../../../src/db/mongo/MongooseDB.js');

afterEach(() => {
  spawned.length = 0;
  vi.unstubAllEnvs();
});

describe('a forward to one pod', () => {
  it('listens on a free local port once kubectl says it forwards', async () => {
    const pending = Underpost.kubectl.portForward({ podName: 'mongodb-1', namespace: 'default', remotePort: 27017 });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    const [forward] = spawned;
    expect(forward.command).toMatch(
      /^sudo kubectl port-forward -n 'default' 'pod\/mongodb-1' --address 127\.0\.0\.1 \d+:27017$/,
    );
    forward.stdout.write('Forwarding from 127.0.0.1:4100 -> 27017\n');
    const { localPort, close } = await pending;
    expect(forward.command).toContain(` ${localPort}:27017`);
    close();
    expect(forward.child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('fails when kubectl exits or never listens, and stops it', async () => {
    const refused = Underpost.kubectl.portForward({ podName: 'gone', remotePort: 27017 });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    spawned[0].exit.reject(Object.assign(new Error('exit 1'), { stderr: 'pods "gone" not found' }));
    await expect(refused).rejects.toThrow(/pods "gone" not found/);
    expect(spawned[0].child.kill).toHaveBeenCalled();

    const silent = Underpost.kubectl.portForward({ podName: 'slow', remotePort: 27017, readyTimeoutMs: 20 });
    await expect(silent).rejects.toThrow(/did not listen in 20ms/);
  });
});

describe('a connection to one member', () => {
  it('names the replica set of the environment, unless the connection is direct', () => {
    for (const [name, value] of Object.entries({
      DB_REPLICA_SET: 'rs0',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_AUTH_SOURCE: '',
    }))
      vi.stubEnv(name, value);
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
});
