/**
 * @module deploy-monitor.test
 * @description End-to-end test of the two-phase deployment readiness contract
 * between the in-pod runtime (`start.js` / `runtime-status.js`) and the CD-runner
 * monitor (`Underpost.monitor.monitorReadyRunner`), exercised as real OS
 * processes coordinating through the shared underpost env file and a real HTTP
 * internal status endpoint.
 *
 * Contract under test:
 *
 *   - The in-pod runtime publishes only `container-status` (Phase 2) and serves
 *     it over `GET /_internal/status`. It never propagates an exit code.
 *
 *   - monitorReadyRunner (CD runner) confirms BOTH phases before exiting 0:
 *       Phase 1 — Kubernetes pod `Ready` condition (kubectl get pod -o json).
 *       Phase 2 — runtime `running-deployment` read over HTTP via
 *                 `kubectl port-forward` to the internal endpoint.
 *     It throws (→ exit 1) on explicit runtime `error`, and returns (→ exit 0)
 *     only once both phases are satisfied.
 *
 * The cluster surface is supplied by fake `sudo`/`kubectl` binaries on PATH:
 *   - `get pods` / `get pod -o json` report one pod whose Ready condition is
 *     driven by FAKE_POD_READY.
 *   - `port-forward` is a no-op sleep; the monitor's HTTP GET reaches a REAL
 *     internal status server bound in this test process (localPort == port),
 *     which reads the same env file the runtime writes.
 *
 * The env file is redirected under a temp `npm_config_prefix`, so the test
 * needs no cluster, no root, and never touches the machine's global install.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Underpost from '../src/index.js';
import { shellExec } from '../src/server/process.js';
import { startInternalStatusServer, stopInternalStatusServer } from '../src/server/runtime-status.js';

const node = process.execPath;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEPLOY_ID = 'dd-test';
const ENV = 'production';
const TRAFFIC = 'green';
const POD_NAME = `${DEPLOY_ID}-${ENV}-${TRAFFIC}-pod`;
const RUNNING_STATUS = `${DEPLOY_ID}-${ENV}-running-deployment`;
const INIT_STATUS = `${DEPLOY_ID}-${ENV}-initializing-deployment`;
const BUILD_STATUS = `${DEPLOY_ID}-${ENV}-build-deployment`;

const INTERNAL_PORT = 39517; // internal status endpoint (real server bound here)
const CLOSED_PORT = 39518; // no server — used to force a transport failure

describe('Deploy monitor — two-phase state machine (e2e, real HTTP transport)', function () {
  this.timeout(60000);

  let prevPrefix;
  let tmpPrefix;
  let fakeBinDir;
  let envFile;
  let monitorScriptPath;

  before(() => {
    prevPrefix = process.env.npm_config_prefix;
    tmpPrefix = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-e2e-'));
    process.env.npm_config_prefix = tmpPrefix;

    Underpost.env.set('container-status', 'init');
    const npmRoot = shellExec('npm root -g', { stdout: true, silent: true, disableLog: true }).trim();
    envFile = path.join(npmRoot, 'underpost', '.env');

    // Real in-pod internal status server: serves container-status from the same
    // env file the runtime writes. Bound in this test process; the monitor's
    // port-forward tunnel (localPort == INTERNAL_PORT) resolves straight to it.
    process.env.UNDERPOST_INTERNAL_PORT = String(INTERNAL_PORT);
    startInternalStatusServer(INTERNAL_PORT);

    fakeBinDir = path.join(tmpPrefix, 'fakebin');
    fs.ensureDirSync(fakeBinDir);

    const sudoPath = path.join(fakeBinDir, 'sudo');
    fs.writeFileSync(
      sudoPath,
      `#!/usr/bin/env bash
while [[ "$1" == -* || "$1" == "--" ]]; do shift; done
exec "$@"
`,
    );

    const kubectlPath = path.join(fakeBinDir, 'kubectl');
    fs.writeFileSync(
      kubectlPath,
      `#!/usr/bin/env bash
verb="$1"; kind="$2"
if [[ "$verb" == "get" && "$kind" == "pods" ]]; then
  printf 'NAME READY STATUS RESTARTS AGE\\n'
  printf '%s 1/1 Running 0 1m\\n' "$POD_NAME"
  exit 0
fi
if [[ "$verb" == "get" && "$kind" == "pod" ]]; then
  printf '{"status":{"conditions":[{"type":"Ready","status":"%s"}]}}\\n' "\${FAKE_POD_READY:-True}"
  exit 0
fi
if [[ "$verb" == "port-forward" ]]; then
  sleep 30
  exit 0
fi
exit 0
`,
    );
    fs.chmodSync(sudoPath, 0o755);
    fs.chmodSync(kubectlPath, 0o755);

    monitorScriptPath = path.join(tmpPrefix, 'monitor-ready.mjs');
    fs.writeFileSync(
      monitorScriptPath,
      `import Underpost from ${JSON.stringify(pathToFileURL(path.join(repoRoot, 'src/index.js')).href)};
try {
  await Underpost.monitor.monitorReadyRunner(${JSON.stringify(DEPLOY_ID)}, ${JSON.stringify(ENV)}, ${JSON.stringify(
    TRAFFIC,
  )}, [], 'default');
  process.exit(0);
} catch (_) {
  process.exit(1);
}
`,
    );
  });

  after(async () => {
    await stopInternalStatusServer();
    delete process.env.UNDERPOST_INTERNAL_PORT;
    if (prevPrefix === undefined) delete process.env.npm_config_prefix;
    else process.env.npm_config_prefix = prevPrefix;
    fs.removeSync(tmpPrefix);
  });

  beforeEach(() => {
    // Deploy in flight: app not yet reporting running.
    Underpost.env.set('container-status', INIT_STATUS);
  });

  // Spawns the real monitorReadyRunner with the fake cluster on PATH; resolves
  // with its exit code. `overrides` inject deterministic timing / target port.
  const spawnMonitor = (overrides = {}) =>
    new Promise((resolve) => {
      const envVars = {
        PATH: `${fakeBinDir}:${process.env.PATH}`,
        UNDERPOST_ENV_FILE: envFile,
        POD_NAME,
        npm_config_prefix: tmpPrefix,
        UNDERPOST_INTERNAL_PORT: String(INTERNAL_PORT),
        // Pin the tunnel's local port so the no-op fake port-forward + the real
        // internal server (bound to INTERNAL_PORT in this process) resolve to the
        // same address the monitor's HTTP GET targets.
        UNDERPOST_PF_LOCAL_PORT: String(INTERNAL_PORT),
        UNDERPOST_MONITOR_DELAY_MS: '100',
        UNDERPOST_MONITOR_MAX_ITERATIONS: '60',
        UNDERPOST_PF_ATTEMPTS: '3',
        FAKE_POD_READY: 'True',
        ...overrides,
      };
      const prefix = Object.entries(envVars)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      shellExec(`${prefix} ${node} ${monitorScriptPath}`, {
        async: true,
        silent: true,
        disableLog: true,
        callback: (code) => resolve(code),
      });
    });

  it('success: both phases satisfied → monitor exits 0', async () => {
    Underpost.env.set('container-status', RUNNING_STATUS);
    const code = await spawnMonitor({ FAKE_POD_READY: 'True' });
    expect(code).to.equal(0);
  });

  it('runtime failure: container-status=error → monitor exits 1', async () => {
    const monitorExit = spawnMonitor({ FAKE_POD_READY: 'True' });
    Underpost.env.set('container-status', 'error');
    expect(await monitorExit).to.equal(1);
  });

  it('readiness mismatch: runtime running but pod not Ready → never succeeds (exits 1)', async () => {
    // Phase 2 satisfied, Phase 1 not: success requires BOTH, so it must time out.
    Underpost.env.set('container-status', RUNNING_STATUS);
    const code = await spawnMonitor({ FAKE_POD_READY: 'False', UNDERPOST_MONITOR_MAX_ITERATIONS: '4' });
    expect(code).to.equal(1);
  });

  it('transport failure: endpoint unreachable is never success (exits 1)', async () => {
    // Point the monitor at a port with no internal server; the HTTP read always
    // fails, so runtime readiness is never confirmed and the monitor times out.
    Underpost.env.set('container-status', RUNNING_STATUS);
    const code = await spawnMonitor({
      UNDERPOST_INTERNAL_PORT: String(CLOSED_PORT),
      UNDERPOST_PF_LOCAL_PORT: String(CLOSED_PORT),
      UNDERPOST_MONITOR_MAX_ITERATIONS: '3',
    });
    expect(code).to.equal(1);
  });

  it('timeout: runtime stuck initializing → monitor exits 1', async () => {
    Underpost.env.set('container-status', INIT_STATUS);
    const code = await spawnMonitor({ FAKE_POD_READY: 'True', UNDERPOST_MONITOR_MAX_ITERATIONS: '4' });
    expect(code).to.equal(1);
  });

  it('regression: advanced pod whose runtime status falls back → monitor exits 1', async () => {
    // Pod advances past build, then its reported status regresses (pod restart);
    // the monitor must treat this as a failure rather than wait it out.
    Underpost.env.set('container-status', INIT_STATUS);
    const monitorExit = spawnMonitor({ FAKE_POD_READY: 'False', UNDERPOST_MONITOR_MAX_ITERATIONS: '120' });
    await new Promise((r) => setTimeout(r, 1500));
    Underpost.env.set('container-status', BUILD_STATUS);
    expect(await monitorExit).to.equal(1);
  });
});
