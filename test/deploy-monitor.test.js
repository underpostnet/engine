/**
 * @module deploy-monitor.test
 * @description End-to-end test of the deploy readiness/failure contract between
 * the in-pod runtime (start.js) and the CD-runner monitor
 * (`Underpost.monitor.monitorReadyRunner`), exercised as two real OS processes
 * running in parallel and coordinating through the shared underpost env file.
 *
 * Contract under test:
 *
 *   - start.js (in-pod) only writes `container-status`; it never propagates an
 *     exit code. On a failed deploy child it sets `container-status=error`; on a
 *     healthy one it sets `container-status=<deploy>-<env>-running-deployment`.
 *
 *   - monitorReadyRunner (CD runner) reads that value per pod (via
 *     `kubectl exec … underpost config get container-status`) and is the side
 *     that produces the real process exit: it `throw`s (→ exit 1) on `error`,
 *     and returns (→ exit 0) once the pod is K8S-Ready AND reports
 *     `running-deployment`.
 *
 * The cluster surface monitorReadyRunner depends on (`sudo`, `kubectl get`,
 * `kubectl exec`) is supplied by tiny fake binaries on the child's PATH: one
 * always-Ready pod whose container-status is read straight from the same env
 * file start.js writes. The env file is redirected under a temp
 * `npm_config_prefix`, so the test needs no cluster, no root, and never touches
 * the machine's global install.
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

const node = process.execPath;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEPLOY_ID = 'dd-test';
const ENV = 'production';
const TRAFFIC = 'green';
const POD_NAME = `${DEPLOY_ID}-${ENV}-${TRAFFIC}-pod`;
const RUNNING_STATUS = `${DEPLOY_ID}-${ENV}-running-deployment`;

describe('Deploy monitor — start.js ↔ monitorReadyRunner (e2e, parallel processes)', function () {
  this.timeout(40000);

  let prevPrefix;
  let tmpPrefix;
  let fakeBinDir;
  let envFile;
  let monitorScriptPath;

  before(() => {
    prevPrefix = process.env.npm_config_prefix;
    tmpPrefix = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-e2e-'));
    process.env.npm_config_prefix = tmpPrefix;

    // Materialize the underpost env file and resolve its absolute path (the
    // fake `kubectl exec` reads container-status straight from it).
    Underpost.env.set('container-status', 'init');
    const npmRoot = shellExec('npm root -g', { stdout: true, silent: true, disableLog: true }).trim();
    envFile = path.join(npmRoot, 'underpost', '.env');

    // Fake cluster surface for monitorReadyRunner: a `sudo` that just drops its
    // flags and execs, and a `kubectl` that reports one always-Ready pod whose
    // container-status comes from the shared env file.
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
  printf '{"status":{"conditions":[{"type":"Ready","status":"True"}]}}\\n'
  exit 0
fi
if [[ "$verb" == "exec" ]]; then
  grep -E '^container-status=' "$UNDERPOST_ENV_FILE" 2>/dev/null | tail -n1 | sed -E 's/^container-status=//'
  exit 0
fi
exit 0
`,
    );
    fs.chmodSync(sudoPath, 0o755);
    fs.chmodSync(kubectlPath, 0o755);

    // Real monitorReadyRunner in its own process: exit 0 when it returns (ready),
    // exit 1 when it throws (container-status=error). This is the signal `set -e`
    // turns into a passed/failed GitHub Actions job.
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

  after(() => {
    if (prevPrefix === undefined) delete process.env.npm_config_prefix;
    else process.env.npm_config_prefix = prevPrefix;
    fs.removeSync(tmpPrefix);
  });

  beforeEach(() => {
    // Deploy in flight: K8S not-yet-running app phase before start.js reports.
    Underpost.env.set('container-status', `${DEPLOY_ID}-${ENV}-initializing-deployment`);
  });

  // Spawns the real monitorReadyRunner process with the fake cluster on PATH and
  // resolves with its exit code.
  const spawnMonitor = () =>
    new Promise((resolve) => {
      const prefix =
        `PATH="${fakeBinDir}:$PATH" ` +
        `UNDERPOST_ENV_FILE="${envFile}" ` +
        `POD_NAME="${POD_NAME}" ` +
        `npm_config_prefix="${tmpPrefix}"`;
      shellExec(`${prefix} ${node} ${monitorScriptPath}`, {
        async: true,
        silent: true,
        disableLog: true,
        callback: (code) => resolve(code),
      });
    });

  // Models start.js: runs the deploy as an async child and, mirroring its
  // `makeDeployCallback`, writes container-status from the child's exit code.
  // start.js never propagates the failure — it only sets the flag.
  const runStartJs = (shouldFail) =>
    new Promise((resolve) => {
      const deployCmd = `${node} -e "process.exit(${shouldFail ? 1 : 0})"`;
      shellExec(deployCmd, {
        async: true,
        silent: true,
        disableLog: true,
        callback: (code) => {
          if (code !== 0) Underpost.env.set('container-status', 'error');
          else Underpost.env.set('container-status', RUNNING_STATUS);
          resolve(code);
        },
      });
    });

  it('error: start.js sets container-status=error and monitorReadyRunner exits 1', async () => {
    const monitorExit = spawnMonitor();
    const deployCode = await runStartJs(true);

    expect(deployCode).to.not.equal(0);
    expect(Underpost.env.get('container-status', undefined, { disableLog: true })).to.equal('error');
    expect(await monitorExit).to.equal(1);
  });

  it('success: start.js sets running-deployment and monitorReadyRunner exits 0', async () => {
    const monitorExit = spawnMonitor();
    const deployCode = await runStartJs(false);

    expect(deployCode).to.equal(0);
    expect(Underpost.env.get('container-status', undefined, { disableLog: true })).to.equal(RUNNING_STATUS);
    expect(await monitorExit).to.equal(0);
  });
});
