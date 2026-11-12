// `run sync` pre-pulls the deploy image on the workload nodes and applies the CronJobs of the cron deployment
// before it deploys, and forwards `--cmd-cron-jobs` to that `cron` command as `--cmd`, shell-quoted. The shell
// harness stops the run at the cron step: no real command runs, and every file lives in a scratch checkout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import { shellHarness } from '../../support/shell-harness.js';

let cwd;
let scratch;
let harness;

beforeEach(() => {
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-run-sync-'));
  process.chdir(scratch);
  fs.outputJsonSync('./engine-private/deploy/conf.cluster.json', {
    environments: {
      production: {
        context: 'underpost-production',
        profile: 'recommended',
        routing: { provider: 'gateway-api' },
        tls: { mode: 'cert-manager', issuer: 'letsencrypt-prod' },
      },
    },
  });
  harness = shellHarness([{ match: /^node bin cron /, throws: 'stopped after the cron step' }]);
});

afterEach(() => {
  harness.restore();
  vi.restoreAllMocks();
  process.chdir(cwd);
  fs.removeSync(scratch);
});

const sync = (options) =>
  Underpost.run.CALL('sync', '', {
    ...Underpost.run.DEFAULT_OPTION,
    deployId: 'dd-core',
    deployIdCronJobs: 'dd-cron',
    disablePrivateConfUpdate: true,
    timezone: 'none',
    kubeadm: true,
    ...options,
  });

describe('run sync', () => {
  it('forwards --cmd-cron-jobs to the cron command as --cmd, quoted as one argument', async () => {
    await expect(sync({ cmdCronJobs: "cd /home/dd/engine && echo 'ready'" })).rejects.toThrow(
      'stopped after the cron step',
    );
    expect(harness.calls.filter((call) => call.startsWith('node bin cron'))).toEqual([
      "node bin cron dd-cron --kubeadm --setup-start --apply --cmd 'cd /home/dd/engine && echo '\\''ready'\\'''",
    ]);
  });

  it('pre-pulls the deploy image on the workload nodes, through the deploy key', async () => {
    vi.spyOn(Underpost.deploy, 'resolveDeployNodes').mockReturnValue(['worker']);
    const pull = vi.spyOn(Underpost.image, 'pullDockerHubImage').mockReturnValue(undefined);
    await expect(sync({ image: 'underpost/engine-cyberia:v4.0.0', sshKeyPath: '/deploy/key' })).rejects.toThrow(
      'stopped after the cron step',
    );
    expect(pull.mock.calls[0][0]).toMatchObject({
      dockerhubImage: 'underpost/engine-cyberia:v4.0.0',
      nodes: ['worker'],
      kind: false,
      k3s: false,
      sshKeyPath: '/deploy/key',
    });
  });

  it('sends no --cmd without --cmd-cron-jobs', async () => {
    await expect(sync({})).rejects.toThrow('stopped after the cron step');
    expect(harness.calls.filter((call) => call.startsWith('node bin cron'))).toEqual([
      'node bin cron dd-cron --kubeadm --setup-start --apply',
    ]);
  });
});
