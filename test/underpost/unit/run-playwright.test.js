'use strict';

import { expect } from 'chai';
import { EventEmitter } from 'node:events';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import UnderpostRun from '../../../src/cli/run.js';
import { shellHarness } from '../../support/shell-harness.js';

const logs = vi.hoisted(() => ({ children: [] }));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal()),
  spawn: vi.fn(() => {
    const child = new EventEmitter();
    Object.assign(child, {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    logs.children.push(child);
    return child;
  }),
}));

describe('run playwright', () => {
  let root;
  let harness;
  let hostPath;

  const options = () => ({ underpostRoot: '.', namespace: 'qa', args: ['/app/ok.json', hostPath] });
  const copied = (command) => {
    if (!command.startsWith('kubectl cp')) return false;
    fs.outputFileSync(hostPath, '{}');
    return true;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-playwright-'));
    hostPath = path.join(root, 'ok.json');
    logs.children.length = 0;
  });

  afterEach(() => {
    harness.restore();
    vi.useRealTimers();
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  it('recreates the pod, waits for the artifact and resolves only after the host copy exists', async () => {
    let checks = 0;
    harness = shellHarness([
      { match: 'kubectl get pods', stdout: 'playwright-server-x1' },
      { match: (command) => command.includes('-- test -f') && ++checks === 1, code: 1 },
      { match: copied },
    ]);
    fs.outputFileSync(hostPath, 'stale');

    expect(await UnderpostRun.RUNNERS.playwright('/scripts/r0d.js', options())).to.equal(hostPath);

    expect(harness.calls.slice(0, 5)).to.deep.equal([
      "kubectl create configmap playwright-script --from-file=script.js='/scripts/r0d.js' -n 'qa' --dry-run=client -o yaml | kubectl apply -n 'qa' -f -",
      "kubectl delete deployment playwright-server -n 'qa' --ignore-not-found --wait=true",
      harness.calls[2],
      "kubectl apply -f ./manifests/deployment/playwright/deployment.yaml -n 'qa'",
      harness.calls[4],
    ]);
    expect(harness.calls[2]).to.match(
      /^kubectl wait --for=delete pod -l app=playwright-server -n 'qa' --timeout=\d+s$/,
    );
    expect(harness.calls[4]).to.match(/^kubectl wait --for=condition=Available deployment\/playwright-server/);
    expect(checks).to.equal(2);
    expect(harness.calls.at(-1)).to.equal(`kubectl cp 'qa/playwright-server-x1:/app/ok.json' '${hostPath}'`);
    expect(fs.readFileSync(hostPath, 'utf8')).to.equal('{}');
    expect(logs.children).to.have.length(1);
    expect(logs.children[0].kill).toHaveBeenCalled();
  });

  it('fails when the copy does not reach the host, and stops the log stream', async () => {
    harness = shellHarness([{ match: 'kubectl get pods', stdout: 'playwright-server-x1' }]);
    await expect(UnderpostRun.RUNNERS.playwright('/scripts/r0d.js', options())).rejects.toThrow(
      'copy of /app/ok.json not found',
    );
    expect(logs.children[0].kill).toHaveBeenCalled();
  });

  it('fails when the artifact is not written within the timeout', async () => {
    vi.useFakeTimers();
    harness = shellHarness([
      { match: 'kubectl get pods', stdout: 'playwright-server-x1' },
      { match: '-- test -f', code: 1 },
    ]);
    const run = UnderpostRun.RUNNERS.playwright('/scripts/r0d.js', options());
    const failure = expect(run).rejects.toThrow('not written in pod playwright-server-x1 within the timeout');
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    await failure;
    expect(logs.children[0].kill).toHaveBeenCalled();
    expect(harness.ran('kubectl cp')).to.equal(false);
  });

  it('requires a script and an artifact path', async () => {
    harness = shellHarness();
    await expect(UnderpostRun.RUNNERS.playwright('', options())).rejects.toThrow('playwright requires');
    await expect(UnderpostRun.RUNNERS.playwright('/scripts/r0d.js', { ...options(), args: undefined })).rejects.toThrow(
      'playwright requires',
    );
    expect(harness.calls).to.deep.equal([]);
  });
});
