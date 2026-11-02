'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import Underpost from '../../../../src/index.js';
import {
  RUNTIME_STATUS,
  containerStatusValue,
  deployStatusPort,
  normalizeContainerStatus,
  resolveInternalStatusPort,
  runtimeTelemetryPayload,
  setRuntimeStatus,
  stopInternalStatusServer,
} from '../../../../src/server/runtime/runtime-status.js';

/** Binds a port on all interfaces and frees it again; rejects while another listener holds it. */
const bindOnce = (port = 0) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, () => {
      const bound = server.address().port;
      server.close(() => resolve(bound));
    });
  });

// The status endpoint and the CD monitor must resolve one port; the state store holds the phase.
describe('runtime status contract', () => {
  const cwd = process.cwd();
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-runtime-status-'));
    process.chdir(root);
    vi.stubEnv('UNDERPOST_INTERNAL_PORT', '');
    vi.stubEnv('PORT', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.chdir(cwd);
    fs.removeSync(root);
  });

  it('binds the internal status endpoint to the override port, then to the base port', () => {
    expect(resolveInternalStatusPort()).to.equal(undefined);
    vi.stubEnv('PORT', '4000');
    expect(resolveInternalStatusPort()).to.equal(4000);
    vi.stubEnv('UNDERPOST_INTERNAL_PORT', '4100');
    expect(resolveInternalStatusPort()).to.equal(4100);
  });

  it('resolves the port of a deploy from the override, its environment file, then the ambient port', () => {
    vi.stubEnv('PORT', '4000');
    expect(deployStatusPort('dd-shop', 'production')).to.equal(4000);
    fs.outputFileSync(path.join(root, 'engine-private/conf/dd-shop/.env.production'), 'PORT=4200\n');
    fs.outputFileSync(path.join(root, 'engine-private/conf/dd-shop/.env.development'), 'HOST=shop.net\n');
    expect(deployStatusPort('dd-shop', 'production')).to.equal(4200);
    expect(deployStatusPort('dd-shop', 'development')).to.equal(4000);
    vi.stubEnv('UNDERPOST_INTERNAL_PORT', '4100');
    expect(deployStatusPort('dd-shop', 'production')).to.equal(4100);
  });

  it('namespaces every phase but a failure, which every deploy reports the same way', () => {
    expect(containerStatusValue('dd-shop', 'production', RUNTIME_STATUS.RUNNING)).to.equal(
      'dd-shop-production-running-deployment',
    );
    expect(containerStatusValue('dd-shop', 'production', RUNTIME_STATUS.ERROR)).to.equal('error');
    for (const phase of Object.values(RUNTIME_STATUS))
      expect(normalizeContainerStatus(containerStatusValue('dd-shop', 'production', phase))).to.equal(phase);
  });

  it('publishes a phase to the container state store', () => {
    const set = vi.spyOn(Underpost.state, 'set').mockImplementation(() => {});
    setRuntimeStatus('dd-shop', 'production', RUNTIME_STATUS.INIT);
    expect(set.mock.calls).to.deep.equal([['container-status', 'dd-shop-production-initializing-deployment']]);
  });

  it('reports state, health and metrics by name, never the environment', () => {
    const state = {
      'container-status': 'dd-shop-production-running-deployment',
      'start-container-status': 'dd-shop-production-running-deployment',
      'await-deploy': '',
    };
    vi.spyOn(Underpost.state, 'get').mockImplementation((key) => state[key]);
    vi.spyOn(Underpost.state, 'isInsideContainer').mockReturnValue(true);
    vi.stubEnv('DEPLOY_ID', 'dd-shop');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INSTANCE_ID', 'shop-0');
    vi.stubEnv('DB_PASSWORD', 'secret');

    const payload = runtimeTelemetryPayload();

    expect(payload).to.include({ status: 'running-deployment', deployId: 'dd-shop', env: 'production' });
    expect(payload.instanceId).to.equal('shop-0');
    expect(payload.health).to.deep.equal({ ready: true, awaitingDeploy: false, inContainer: true });
    expect(Object.keys(payload.metrics)).to.deep.equal([
      'uptimeSeconds',
      'rssBytes',
      'heapUsedBytes',
      'heapTotalBytes',
      'cpuUserMicros',
      'cpuSystemMicros',
      'loadAverage1m',
    ]);
    expect(Number.isNaN(Date.parse(payload.observedAt))).to.equal(false);
    expect(JSON.stringify(payload)).to.not.include('secret');
  });
});

// A pod command chains start calls; only the call with --run keeps the status endpoint.
describe('start hands the status endpoint to the next pod step', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await stopInternalStatusServer();
  });

  /** Runs one start call with its phases stubbed and returns the statuses it publishes. */
  const start = async (options) => {
    const statuses = [];
    vi.stubEnv('UNDERPOST_INTERNAL_PORT', `${await bindOnce()}`);
    vi.spyOn(Underpost.state, 'isInsideContainer').mockReturnValue(false);
    vi.spyOn(Underpost.state, 'set').mockImplementation((key, value) => statuses.push(value));
    vi.spyOn(Underpost.start, 'build').mockResolvedValue();
    vi.spyOn(Underpost.start, 'run').mockResolvedValue();
    await Underpost.start.callback('dd-shop', 'production', options);
    return statuses;
  };

  it('frees the port after a build without --run', async () => {
    expect(await start({ build: true })).to.deep.equal([
      'dd-shop-production-build-deployment',
      'dd-shop-production-initializing-deployment',
    ]);
    await bindOnce(Number(process.env.UNDERPOST_INTERNAL_PORT));
  });

  it('keeps the port and never goes back to the build phase on a run', async () => {
    expect(await start({ run: true })).to.deep.equal(['dd-shop-production-initializing-deployment']);
    const port = Number(process.env.UNDERPOST_INTERNAL_PORT);
    await expect(bindOnce(port)).rejects.toThrow('EADDRINUSE');
  });
});
