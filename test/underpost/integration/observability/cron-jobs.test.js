'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import UnderpostCron, {
  cronCheckoutContextFactory,
  cronDeployIdResolve,
  cronJobYamlFactory,
  loadCronDeployEnv,
  parseList,
  resolveDeployId,
  resolveJobDeployList,
} from '../../../../src/server/ops/cron.js';
import Underpost from '../../../../src/index.js';
import UnderpostImage from '../../../../src/cli/image.js';
import UnderpostSecret from '../../../../src/cli/secrets.js';
import { Dns } from '../../../../src/server/network/dns.js';
import { SCOPE_ENTITLEMENTS } from '../../../../src/server/runtime/config-scope.js';
import { shellHarness } from '../../../support/shell-harness.js';

const CRON_ID_PATH = './engine-private/deploy/dd.cron';
const ROUTES_PATH = './engine-private/deploy/dd.routes';

// Every path this module reads lives in the private repository, and the apply
// path talks to a live cluster. The suite fixes both: an in-memory file table
// and the shell harness, so the assertions are over the manifests written and
// the kubectl vector issued.
const fileSystemFixture = (files = {}) => {
  const table = new Map(Object.entries(files));
  const written = new Map();
  const directories = [];
  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => table.has(`${filePath}`) || written.has(`${filePath}`));
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (written.has(key)) return written.get(key);
    if (table.has(key)) return table.get(key);
    throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' });
  });
  vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
  vi.spyOn(fs, 'mkdirSync').mockImplementation((dir) => directories.push(`${dir}`));
  return { table, written, directories };
};

const CONF_CRON = {
  jobs: {
    dns: { expression: '*/5 * * * *' },
    backup: { expression: '0 3 * * *' },
    disabled: { enabled: false },
  },
};

describe('cron deploy resolution', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the cron deploy id off the private deploy marker', () => {
    fileSystemFixture({ [CRON_ID_PATH]: ' dd-cron \n' });
    expect(cronDeployIdResolve()).to.equal('dd-cron');
  });

  it('reports no cron deploy when the marker is absent or blank', () => {
    fileSystemFixture({});
    expect(cronDeployIdResolve()).to.equal(null);
    vi.restoreAllMocks();
    fileSystemFixture({ [CRON_ID_PATH]: '  \n' });
    expect(cronDeployIdResolve()).to.equal(null);
  });

  it('prefers an explicit deploy id over the marker, but never the dd meta id', () => {
    fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
    expect(resolveDeployId('dd-core')).to.equal('dd-core');
    expect(resolveDeployId('dd')).to.equal('dd-cron');
    expect(resolveDeployId('')).to.equal('dd-cron');
  });

  it('parses a CLI list from either a string or an array', () => {
    expect(parseList('dns, backup ,,')).to.deep.equal(['dns', 'backup']);
    expect(parseList([' dns ', '', 'backup'])).to.deep.equal(['dns', 'backup']);
    expect(parseList(undefined)).to.deep.equal([]);
    expect(parseList(42)).to.deep.equal([]);
  });

  it('fans a backup job out to the whole route table', () => {
    fileSystemFixture({ [ROUTES_PATH]: 'dd-core,dd-cyberia', [CRON_ID_PATH]: 'dd-cron' });
    expect(Underpost.cron.getRelatedDeployIdList('backup')).to.equal('dd-core,dd-cyberia');
  });

  it('falls back to the cron deploy id when no route table is checked out', () => {
    fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
    expect(Underpost.cron.getRelatedDeployIdList('backup')).to.equal('dd-cron');
    expect(Underpost.cron.getRelatedDeployIdList('dns')).to.equal('dd-cron');
  });

  it('falls back to the built-in cron id when nothing is configured', () => {
    fileSystemFixture({});
    expect(Underpost.cron.getRelatedDeployIdList('dns')).to.equal('dd-cron');
  });

  it('normalizes an explicit job deploy list to the comma separated shape callbacks split on', () => {
    fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
    expect(resolveJobDeployList('dns', ['dd-a', ' dd-b '])).to.equal('dd-a,dd-b');
    expect(resolveJobDeployList('dns', 'dd')).to.equal('dd-cron');
    expect(resolveJobDeployList('dns', '')).to.equal('dd-cron');
  });

  it('exposes the registered job handlers', () => {
    expect(Underpost.cron.getJobsIDs()).to.deep.equal(['dns', 'backup', 'vultr']);
    expect(Underpost.cron.JOB.dns).to.equal(Underpost.dns);
  });
});

describe('cron deploy environment', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads the cron deploy env first and lets no routed deploy overwrite it', () => {
    const previous = { ...process.env };
    fileSystemFixture({
      [CRON_ID_PATH]: 'dd-cron',
      [ROUTES_PATH]: 'dd-core',
      './engine-private/conf/dd-cron/.env.production': 'CRON_FIXTURE_KEY=cron\nSHARED_FIXTURE_KEY=cron\n',
      './engine-private/conf/dd-core/.env.production': 'SHARED_FIXTURE_KEY=core\nROUTED_FIXTURE_KEY=core\n',
    });
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      loadCronDeployEnv();
      expect(process.env.CRON_FIXTURE_KEY).to.equal('cron');
      expect(process.env.SHARED_FIXTURE_KEY).to.equal('cron');
      expect(process.env.ROUTED_FIXTURE_KEY).to.equal('core');
    } finally {
      process.env = previous;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
    }
  });

  it('loads nothing at all when neither marker nor route table exists', () => {
    fileSystemFixture({});
    expect(() => loadCronDeployEnv()).not.to.throw();
  });
});

// Regression: the job body is the checkout's own CLI, so a mount `container_t` may not read
// surfaced as `Cannot find module '/home/dd/engine/bin'` — naming neither the mount nor the policy
// that denied it, and pinning the pod to the node holding the checkout did not help.
describe('checkout readability', () => {
  let harness;

  beforeEach(() => (harness = shellHarness()));
  afterEach(() => harness.restore());

  const context = ({ mode, label }) => {
    harness.route({ match: 'getenforce', code: 0, stdout: `${mode}\n` });
    harness.route({ match: 'ls -Zd', code: 0, stdout: `${label} /home/dd/engine\n` });
    return cronCheckoutContextFactory();
  };

  it('names the type denying a checkout the pods cannot read', () => {
    expect(context({ mode: 'Enforcing', label: 'unconfined_u:object_r:user_home_t:s0' })).to.deep.equal({
      readable: false,
      type: 'user_home_t',
    });
  });

  it('reads the shared container label as usable', () => {
    expect(context({ mode: 'Enforcing', label: 'system_u:object_r:container_file_t:s0' })).to.deep.equal({
      readable: true,
      type: 'container_file_t',
    });
  });

  it('claims nothing off an enforcing host, where no label denies', () => {
    expect(context({ mode: 'Permissive', label: 'unconfined_u:object_r:user_home_t:s0' })).to.deep.equal({
      readable: true,
      type: '',
    });
    expect(harness.ran('ls -Zd')).to.equal(false);
  });
});

describe('CronJob manifest', () => {
  afterEach(() => vi.restoreAllMocks());

  const render = (overrides = {}) => {
    fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
    return cronJobYamlFactory({
      name: 'dd-cron-dns',
      expression: '*/5 * * * *',
      deployList: 'dd-core',
      jobList: 'dns',
      ...overrides,
    });
  };

  it('sanitizes the name into a DNS subdomain and caps it', () => {
    const yaml = render({ name: '--DD_Cron//DNS--' });
    expect(yaml).to.include('name: dd-cron-dns');
    expect(yaml).not.to.include('name: --DD_Cron');
  });

  it('caps a long name at the 52 characters a CronJob name allows', () => {
    const yaml = render({ name: 'a'.repeat(80) });
    expect(yaml.match(/^  name: (.*)$/m)[1].length).to.equal(52);
  });

  it('defaults to the engine image for the running version and the default namespace', () => {
    const yaml = render();
    expect(yaml).to.include(`image: underpost/underpost-engine:${Underpost.version}`);
    expect(yaml).to.include('namespace: default');
  });

  it('takes a custom image and namespace', () => {
    const yaml = render({ image: 'fixture/image:1', namespace: 'ops' });
    expect(yaml).to.include('image: fixture/image:1');
    expect(yaml).to.include('namespace: ops');
  });

  it('renders no nodeSelector when the pod is not pinned', () => {
    expect(render()).not.to.include('nodeSelector');
  });

  it('pins the pod to a node by hostname', () => {
    expect(render({ nodeName: 'worker-1' })).to.include('kubernetes.io/hostname: worker-1');
  });

  // The pod takes its environment injected, so it materializes none: `app load` reads a
  // deployment's env file and writes the working tree, and the mirror carries neither.
  it('states the environment on the pod rather than materializing it from a file', () => {
    expect(render()).to.not.include('app load');
    expect(render()).to.include('- name: NODE_ENV\n                  value: production');
    expect(render({ dev: true })).to.include('- name: NODE_ENV\n                  value: development');
  });

  it('injects the cron credential Secret and takes the job straight from the CLI', () => {
    const yaml = render();
    expect(yaml).to.include('name: underpost-cron-env');
    expect(yaml).to.match(/cd \/home\/dd\/engine &&\n\s+node bin cron dd-core dns/);
  });

  it('forwards every cluster and execution flag to the containerised command', () => {
    const yaml = render({ git: true, dev: true, dryRun: true, k3s: true, kind: true, kubeadm: true });
    expect(yaml).to.include('node bin cron dd-core dns --git --dev --dry-run --k3s --kind --kubeadm');
  });

  it('runs a pre-script before the cron command', () => {
    expect(render({ cmd: 'npm ci' })).to.include('npm ci &&');
  });

  it('publishes suspended when asked', () => {
    expect(render({ suspend: true })).to.include('suspend: true');
    expect(render()).to.include('suspend: false');
  });

  describe('host mounts', () => {
    // Every mount is a host path an unprivileged `container_t` pod has to be able to use, so the
    // set is asserted exactly rather than loosely: a mount added without a labeling story is a
    // denial the next Enforcing transition discovers, not a review comment.
    const hostPaths = (yaml) => [...yaml.matchAll(/^\s+path: (\S+)$/gm)].map((match) => match[1]);

    it('mounts the engine mirror and the metrics textfile directory, and nothing else', () => {
      expect(hostPaths(render())).to.deep.equal(['/opt/engine', '/var/lib/node_exporter/textfile']);
    });

    // `container_t` is denied every read under a home tree, so nothing the pods mount may live in
    // one — the checkout included, which is why they mount a mirror of it instead.
    it('mounts no host path out of a home directory', () => {
      const yaml = render();
      expect(yaml).to.not.include('node_modules/underpost');
      expect(hostPaths(yaml).every((hostPath) => !/^\/(home|root)(\/|$)/.test(hostPath))).to.equal(true);
    });

    it('lands the mirror on the path the image and the job body already resolve against', () => {
      // The container's own layout does not change with the host source: the body still runs
      // `cd /home/dd/engine`, and every relative path the CLI resolves hangs off it.
      const yaml = render();
      expect(yaml).to.include('mountPath: /home/dd/engine');
      expect(yaml).to.include('cd /home/dd/engine');
    });

    it('carries no hardcoded Node version, which a runtime upgrade would strand', () => {
      expect(render()).to.not.match(/v\d+\.\d+\.\d+\/lib/);
    });

    it('takes the job credentials from a Secret, optional so a pod without one still schedules', () => {
      const yaml = render();
      expect(yaml).to.include('envFrom:');
      expect(yaml).to.include('secretRef:');
      expect(yaml).to.include('name: underpost-cron-env');
      expect(yaml).to.include('optional: true');
    });

    it('mounts the mirror as a Directory that must already exist, never DirectoryOrCreate', () => {
      // `DirectoryOrCreate` would let kubelet materialize an empty tree and run the job against
      // no CLI at all; the mirror is a precondition, not something a pod may invent.
      expect(render()).to.match(/path: \/opt\/engine\n\s+type: Directory\n/);
    });
  });
});

describe('cron CLI', () => {
  let harness;
  let previousEnv;

  beforeEach(() => {
    harness = shellHarness();
    vi.spyOn(UnderpostImage.API, 'pullDockerHubImage').mockImplementation(() => undefined);
    // `--apply` projects `underpost-cron-env` from whatever this host's own environment carries
    // within the `cron` scope (see seedEnvValues / SCOPE_ENTITLEMENTS.cron), so any of those keys
    // set for real in the runner's shell would otherwise get staged and show up in `written`
    // alongside the manifests, breaking the assertions below in a way that depends on who is
    // running the suite.
    previousEnv = { ...process.env };
    for (const key of SCOPE_ENTITLEMENTS.cron) delete process.env[key];
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
    process.env = previousEnv;
  });

  describe('direct execution', () => {
    it('runs each selected job handler with its resolved deploy list', async () => {
      fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
      const callback = vi.spyOn(Dns, 'callback').mockResolvedValue(undefined);
      await UnderpostCron.API.callback('dd-core', 'dns', {});
      expect(callback.mock.calls[0][0]).to.equal('dd-core');
    });

    it('previews without running the handler under --dry-run', async () => {
      fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
      const callback = vi.spyOn(Dns, 'callback').mockResolvedValue(undefined);
      await UnderpostCron.API.callback('dd-core', 'dns', { dryRun: true });
      expect(callback.mock.calls.length).to.equal(0);
    });

    it('warns on an unknown job rather than failing the whole run', async () => {
      fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
      const callback = vi.spyOn(Dns, 'callback').mockResolvedValue(undefined);
      await UnderpostCron.API.callback('dd-core', 'not-a-job,dns', {});
      expect(callback.mock.calls.length).to.equal(1);
    });

    // Placement belongs to the manifest, so passing it to a direct run is a
    // no-op the operator has to be told about rather than a silent nothing.
    it('warns that node placement has no effect on a direct run', async () => {
      fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
      await UnderpostCron.API.callback('dd-core', '', { nodeName: 'worker-1' });
      expect(harness.calls.length).to.equal(0);
    });
  });

  describe('setup-start', () => {
    const CONF_DIR = './engine-private/conf/dd-cron';

    it('rewrites the start script to apply exactly the manifests it generates', async () => {
      const { written } = fileSystemFixture({
        [CRON_ID_PATH]: 'dd-cron',
        [`${CONF_DIR}/conf.cron.json`]: JSON.stringify(CONF_CRON),
        [`${CONF_DIR}/package.json`]: JSON.stringify({ name: 'dd-cron' }),
      });

      await UnderpostCron.API.callback('dd-cron', '', { setupStart: true });

      const packageJson = JSON.parse(written.get(`${CONF_DIR}/package.json`));
      expect(packageJson.scripts.start).to.include('./manifests/cronjobs/dd-cron/dd-cron-dns.yaml');
      expect(packageJson.scripts.start).to.include('./manifests/cronjobs/dd-cron/dd-cron-backup.yaml');
      expect(packageJson.scripts.start).not.to.include('dd-cron-disabled.yaml');
      expect(written.has('./manifests/cronjobs/dd-cron/dd-cron-dns.yaml')).to.equal(true);
    });

    it('restricts the start script to the requested job list', async () => {
      const { written } = fileSystemFixture({
        [CRON_ID_PATH]: 'dd-cron',
        [`${CONF_DIR}/conf.cron.json`]: JSON.stringify(CONF_CRON),
        [`${CONF_DIR}/package.json`]: JSON.stringify({}),
      });

      await UnderpostCron.API.callback('dd-cron', 'dns', { setupStart: true });

      expect(JSON.parse(written.get(`${CONF_DIR}/package.json`)).scripts.start).not.to.include('dd-cron-backup');
    });

    it('stops before touching anything when no deploy id resolves', async () => {
      const { written } = fileSystemFixture({});
      await UnderpostCron.API.callback('', '', { setupStart: true });
      expect(written.size).to.equal(0);
    });

    it('stops when the deploy declares no cron conf', async () => {
      const { written } = fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
      await UnderpostCron.API.callback('dd-cron', '', { setupStart: true });
      expect(written.size).to.equal(0);
    });

    it('stops when the cron conf declares no jobs', async () => {
      const { written } = fileSystemFixture({
        [CRON_ID_PATH]: 'dd-cron',
        [`${CONF_DIR}/conf.cron.json`]: JSON.stringify({ jobs: {} }),
      });
      await UnderpostCron.API.callback('dd-cron', '', { setupStart: true });
      expect(written.size).to.equal(0);
    });

    it('stops when the job filter matches no enabled job', async () => {
      const { written } = fileSystemFixture({
        [CRON_ID_PATH]: 'dd-cron',
        [`${CONF_DIR}/conf.cron.json`]: JSON.stringify(CONF_CRON),
      });
      await UnderpostCron.API.callback('dd-cron', 'disabled', { setupStart: true });
      expect(written.size).to.equal(0);
    });

    it('still generates the manifests when the deploy carries no package.json', async () => {
      const { written } = fileSystemFixture({
        [CRON_ID_PATH]: 'dd-cron',
        [`${CONF_DIR}/conf.cron.json`]: JSON.stringify(CONF_CRON),
      });
      await UnderpostCron.API.callback('dd-cron', '', { setupStart: true });
      expect(written.has('./manifests/cronjobs/dd-cron/dd-cron-dns.yaml')).to.equal(true);
    });
  });

  describe('manifest generation and apply', () => {
    const CONF_DIR = './engine-private/conf/dd-cron';

    const generate = async (options = {}) => {
      const fixture = fileSystemFixture({
        [CRON_ID_PATH]: 'dd-cron',
        [`${CONF_DIR}/conf.cron.json`]: JSON.stringify(CONF_CRON),
      });
      await UnderpostCron.API.callback('dd-cron', options.jobList ?? '', {
        generateK8sCronjobs: true,
        ...options,
      });
      return fixture;
    };

    it('writes one manifest per enabled job and applies nothing without --apply', async () => {
      const { written, directories } = await generate();
      expect(directories).to.include('./manifests/cronjobs/dd-cron');
      expect([...written.keys()]).to.deep.equal([
        './manifests/cronjobs/dd-cron/dd-cron-dns.yaml',
        './manifests/cronjobs/dd-cron/dd-cron-backup.yaml',
      ]);
      expect(harness.calls.length).to.equal(0);
    });

    it('stops when no deploy id resolves', async () => {
      fileSystemFixture({});
      await UnderpostCron.API.callback('', '', { generateK8sCronjobs: true });
      expect(harness.calls.length).to.equal(0);
    });

    it('stops when the cron conf is missing', async () => {
      fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron' });
      await UnderpostCron.API.callback('dd-cron', '', { generateK8sCronjobs: true });
      expect(harness.calls.length).to.equal(0);
    });

    it('stops when the cron conf declares no jobs', async () => {
      fileSystemFixture({ [CRON_ID_PATH]: 'dd-cron', [`${CONF_DIR}/conf.cron.json`]: JSON.stringify({ jobs: {} }) });
      await UnderpostCron.API.callback('dd-cron', '', { generateK8sCronjobs: true });
      expect(harness.calls.length).to.equal(0);
    });

    it('stops when the job filter matches nothing declared', async () => {
      const { written } = await generate({ jobList: 'not-a-job' });
      expect(written.size).to.equal(0);
    });

    it('replaces the published CronJobs and loads the default image before applying', async () => {
      const pull = vi.spyOn(UnderpostImage.API, 'pullDockerHubImage');
      await generate({ apply: true, kubeadm: true });
      expect(harness.ran('kubectl delete cronjob dd-cron-dns --namespace=default --ignore-not-found')).to.equal(true);
      expect(harness.ran('kubectl apply -f ./manifests/cronjobs/dd-cron/dd-cron-dns.yaml')).to.equal(true);
      expect(pull.mock.calls[0][0]).to.include({ dockerhubImage: 'underpost', kubeadm: true });
    });

    it('leaves image loading alone when a custom image is pinned', async () => {
      const pull = vi.spyOn(UnderpostImage.API, 'pullDockerHubImage');
      await generate({ apply: true, image: 'fixture/image:1' });
      expect(pull.mock.calls.length).to.equal(0);
    });

    it('copies the engine mirror into the kind worker before applying on a kind cluster', async () => {
      await generate({ apply: true, kind: true });
      expect(harness.ran('docker cp /opt/engine kind-worker:/opt/engine')).to.equal(true);
    });

    // The pods execute the mirror, so a stale one is the same outage as an unlabeled one. `--delete`
    // because it is an output: a file the checkout dropped must not survive in the tree they run.
    it('refreshes the mirror from the checkout before labeling it', async () => {
      await generate({ apply: true, kubeadm: true });
      const rsync = harness.calls.find((command) => command.includes('rsync'));
      expect(rsync).to.include('--delete');
      expect(rsync).to.include(`'${process.cwd()}/'`);
      expect(rsync).to.include("'/opt/engine/'");
      expect(harness.calls.indexOf(rsync)).to.be.lessThan(
        harness.calls.findIndex((command) => command.includes('restorecon')),
      );
    });

    // The mirror carries the shared container label, so every `container_t` process on the node
    // can read it. An allowlist is what keeps a repository that gains a key from leaking it.
    it('mirrors an allowlist, closed by a trailing exclude of everything else', async () => {
      await generate({ apply: true, kubeadm: true });
      const rules = [...harness.calls.find((command) => command.includes('rsync')).matchAll(/'(--\S+?)'/g)].map(
        ([, rule]) => rule,
      );
      expect(rules.at(-1)).to.equal('--exclude=*');
      // rsync takes the first matching rule, so a subtraction placed after the include that
      // covers its parent never fires.
      for (const asset of ['/src/client/public/**', '/src/runtime/engine-cyberia/**'])
        expect(rules.indexOf(`--exclude=${asset}`), asset).to.be.lessThan(rules.indexOf('--include=/src/**'));
    });

    it('narrows engine-private to the documents a job body resolves, and no environment', async () => {
      await generate({ apply: true, kubeadm: true });
      const rsync = harness.calls.find((command) => command.includes('rsync'));
      // `cron` reads deploy/dd.cron, deploy/dd.routes and the conf documents; every value those
      // documents reference arrives injected, so no env file is mirrored at any environment.
      expect(rsync).to.include("'--include=/engine-private/conf/*/conf.*.json'");
      expect(rsync).to.include("'--include=/engine-private/deploy/dd.cron'");
      expect(rsync).to.include("'--include=/engine-private/deploy/dd.routes'");
      expect(rsync).to.not.include('.env');
      // `conf/<id>` also holds per-deploy key pairs, so neither half may be globbed.
      for (const glob of ['/engine-private/**', '/engine-private/conf/**', '/engine-private/deploy/**'])
        expect(rsync, glob).to.not.include(glob);
    });

    // The mirror is readable by every `container_t` process on the node, so no key may reach it.
    // Every deploy's env file is that deploy's whole credential set, and the mirror is readable by
    // every container on the node, so none of them is mirrored at any environment.
    it('mirrors no deployment environment, whichever environment the pods run', async () => {
      for (const dev of [false, true]) {
        harness.calls.length = 0;
        const { written } = await generate({ apply: true, kubeadm: true, dev });
        expect(
          harness.calls.find((command) => command.includes('rsync')),
          `dev=${dev}`,
        ).to.not.include('.env');
        for (const manifest of written.values())
          expect(manifest, `dev=${dev}`).to.include(`value: ${dev ? 'development' : 'production'}`);
      }
    });

    it('mirrors no key material, and mounts the connection key as a Secret instead', async () => {
      const { written } = await generate({ apply: true, kubeadm: true });
      const rsync = harness.calls.find((command) => command.includes('rsync'));
      for (const material of ['id_rsa', 'conf.users.json', 'ipfs-cluster-secret', 'mariadb-password'])
        expect(rsync, material).to.not.include(material);

      for (const manifest of written.values()) {
        expect(manifest).to.include('secretName: underpost-ssh-key');
        expect(manifest).to.include('defaultMode: 0400');
        expect(manifest).to.include('mountPath: /etc/underpost/secrets/ssh');
      }
    });

    it('projects the key Secret alongside the credential Secret', async () => {
      const applied = [];
      vi.spyOn(UnderpostSecret.API, 'applyIfPresent').mockImplementation((name) => (applied.push(name), true));
      await generate({ apply: true, kubeadm: true });
      expect(applied).to.deep.equal(['underpost-cron-env', 'underpost-ssh-key']);
    });

    // A nodeSelector naming an unregistered node leaves every Job Pending at its
    // next fire, with nothing in the manifest to say why.
    it('warns about an unregistered target node but still applies', async () => {
      harness.route({ match: 'kubectl get node', code: 0, stdout: '' });
      await generate({ apply: true, nodeName: 'worker-9' });
      expect(harness.ran('kubectl get node worker-9 -o name')).to.equal(true);
      expect(harness.ran('kubectl apply -f')).to.equal(true);
    });

    it('accepts a registered target node', async () => {
      harness.route({ match: 'kubectl get node', code: 0, stdout: 'node/worker-1\n' });
      await generate({ apply: true, nodeName: 'worker-1' });
      expect(harness.ran('kubectl apply -f')).to.equal(true);
    });

    // Regression: an unpinned pod landed on a node whose /home/dd/engine was not the checkout,
    // and the job body died on `Cannot find module '/home/dd/engine/bin'` before it could report
    // anything of its own. A hostPath mount is node-local, so the placement has to be too.
    it('pins the pods it publishes to the node whose checkout they mount', async () => {
      const local = os.hostname();
      harness.route({ match: `kubectl get node ${local}`, code: 0, stdout: `node/${local}\n` });
      const { written } = await generate({ apply: true, kubeadm: true });
      for (const manifest of written.values()) expect(manifest).to.include(`kubernetes.io/hostname: ${local}`);
    });

    it('leaves a manifest it only writes unpinned, and reads no cluster to write it', async () => {
      const { written } = await generate();
      for (const manifest of written.values()) expect(manifest).to.not.include('nodeSelector');
      expect(harness.calls.length).to.equal(0);
    });

    it('leaves the pods unpinned when the cluster does not know this machine as a node', async () => {
      harness.route({ match: 'kubectl get node', code: 0, stdout: '' });
      const { written } = await generate({ apply: true, kubeadm: true });
      for (const manifest of written.values()) expect(manifest).to.not.include('nodeSelector');
    });

    // The context is rendered into the pod's own command, so a run that names none used to
    // publish a CronJob whose body addressed no cluster at all.
    it('reads the cluster context off the cluster when the run names none', async () => {
      harness.route({
        match: 'kubectl get nodes',
        code: 0,
        stdout: 'NAME STATUS ROLES AGE VERSION\nnode-a Ready control-plane 1d v1.30.5+k3s1\n',
      });
      const { written } = await generate({ apply: true });
      for (const manifest of written.values()) expect(manifest).to.include('--k3s');
    });

    it('never overrides a context the run named', async () => {
      harness.route({
        match: 'kubectl get nodes',
        code: 0,
        stdout: 'NAME STATUS ROLES AGE VERSION\nnode-a Ready control-plane 1d v1.30.5+k3s1\n',
      });
      const { written } = await generate({ apply: true, kubeadm: true });
      for (const manifest of written.values()) {
        expect(manifest).to.include('--kubeadm');
        expect(manifest).to.not.include('--k3s');
      }
    });

    // Reported, not repaired: relabeling the operator's live working tree is not this command's
    // call, so a denied checkout still publishes its manifests.
    it('publishes even when its pods cannot read the checkout they mount', async () => {
      harness.route({ match: 'getenforce', code: 0, stdout: 'Enforcing\n' });
      harness.route({ match: 'ls -Zd', code: 0, stdout: 'unconfined_u:object_r:user_home_t:s0 /home/dd/engine\n' });
      await generate({ apply: true, kubeadm: true });
      expect(harness.ran('kubectl apply -f')).to.equal(true);
    });

    it('creates one immediate Job per published CronJob', async () => {
      harness.route({ match: 'kubectl get cronjob', code: 0, stdout: 'cronjob.batch/dd-cron-dns\n' });
      await generate({ apply: true, createJobNow: true });
      expect(harness.count('kubectl create job')).to.equal(2);
      expect(harness.ran('--from=cronjob/dd-cron-dns -n default')).to.equal(true);
    });

    it('skips the immediate Job for a CronJob that was never published', async () => {
      harness.route({ match: 'kubectl get cronjob', code: 0, stdout: '' });
      await generate({ createJobNow: true });
      expect(harness.ran('kubectl create job')).to.equal(false);
    });
  });
});
