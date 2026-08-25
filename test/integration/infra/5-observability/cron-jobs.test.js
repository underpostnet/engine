'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import UnderpostCron, {
  cronDeployIdResolve,
  cronJobYamlFactory,
  loadCronDeployEnv,
  parseList,
  resolveDeployId,
  resolveJobDeployList,
} from '../../../../src/server/ops/cron.js';
import Underpost from '../../../../src/index.js';
import UnderpostImage from '../../../../src/cli/image.js';
import { Dns } from '../../../../src/server/network/dns.js';
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

  it('loads the cron deploy env before running the job', () => {
    expect(render()).to.include('node bin app load --env production --args deploy-id=dd-cron');
  });

  it('loads the development env under --dev', () => {
    expect(render({ dev: true })).to.include('node bin app load --env development --args deploy-id=dd-cron');
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
});

describe('cron CLI', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
    vi.spyOn(UnderpostImage.API, 'pullDockerHubImage').mockImplementation(() => undefined);
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
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

    it('copies the engine into the kind worker before applying on a kind cluster', async () => {
      await generate({ apply: true, kind: true });
      expect(harness.ran('docker cp /home/dd/engine kind-worker:/home/dd/engine')).to.equal(true);
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
