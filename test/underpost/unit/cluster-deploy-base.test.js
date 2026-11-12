// `underpost new --cluster` writes the base of engine-private/deploy in a scratch checkout from
// underpost.cluster.config.js: it creates what is missing, keeps what an operator owns, and refuses an
// invalid placement. The configuration it writes passes the parser every command runs, names no context or
// cluster identity, and the adoption of a cluster the shell harness answers completes it. A deployment folder
// takes the app config of underpost.config.js only. The deploy keys exist beforehand, so no ssh-keygen runs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import Underpost from '../../../src/index.js';
import { readClusterConf } from '../../../src/cli/namespace.js';
import { Config } from '../../../src/server/runtime/conf.js';
import { controllerItem, kubeCluster, namespaceItem } from '../../support/kube-cluster.js';
import clusterConfig from '../../../underpost.cluster.config.js';
import underpostConfig from '../../../underpost.config.js';

let cwd;
let scratch;
const deployFile = (name) => `./engine-private/deploy/${name}`;

beforeEach(() => {
  cwd = process.cwd();
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-cluster-base-'));
  process.chdir(scratch);
  for (const key of ['id_rsa', 'id_rsa.pub']) fs.outputFileSync(deployFile(key), 'key', { mode: 0o600 });
});

afterEach(() => {
  process.chdir(cwd);
  fs.removeSync(scratch);
});

describe('the base of a cluster deploy folder', () => {
  it('creates the recommended placement, and keeps every file on a rerun', () => {
    const first = Underpost.repo.clusterDeployFactory();
    expect(first.created).toEqual(
      expect.arrayContaining([deployFile('conf.cluster.json'), deployFile('dd.cron'), deployFile('dd.routes')]),
    );
    expect(fs.readJsonSync(deployFile('conf.cluster.json'))).toEqual(Underpost.namespace.template());
    // The configuration references the profile and copies none of it.
    expect(fs.readJsonSync(deployFile('conf.cluster.json'))).not.toHaveProperty('profiles');

    const placement = fs.readJsonSync(deployFile('conf.cluster.json'));
    placement.environments.production.context = 'kubernetes-admin@kubernetes';
    fs.writeJsonSync(deployFile('conf.cluster.json'), placement);
    const second = Underpost.repo.clusterDeployFactory();
    expect(second.created).toEqual([]);
    expect(second.kept).toContain(deployFile('conf.cluster.json'));
    expect(fs.readJsonSync(deployFile('conf.cluster.json'))).toEqual(placement);
  });

  it('names the routing and TLS of each environment and no context or cluster identity, for the parser every command runs', () => {
    Underpost.repo.clusterDeployFactory();
    const path = deployFile('conf.cluster.json');
    const { environments } = fs.readJsonSync(path);
    expect(Object.keys(environments)).toEqual(['production', 'development', 'test']);
    for (const [environment, section] of Object.entries(environments)) {
      expect(section, environment).toMatchObject({
        context: null,
        cluster: null,
        profile: 'recommended',
        routing: { provider: 'gateway-api' },
        tls:
          environment === 'production' ? { mode: 'cert-manager', issuer: 'letsencrypt-prod' } : { mode: 'self-signed' },
      });
      // No current context is implicit: the target names what the environment lacks.
      expect(Underpost.namespace.target({ path, environment }).refusal, environment).toContain(
        `environments.${environment}.context is not configured`,
      );
    }
    const sections = readClusterConf(path);
    expect(sections.production).toMatchObject({ context: '', cluster: null, groups: { control: [], workers: [] } });
    // The profile stays in underpost.cluster.config.js, and its node groups wait for node records.
    expect(sections.production.scheduling).toEqual(clusterConfig.profiles.recommended.scheduling);
    expect(sections.test.scheduling.datastores).toEqual({ mode: 'scheduler' });
    expect(Underpost.namespace.of('mongodb', { path })).toBe('underpost-data');
  });

  it('is completed by the adoption of a live cluster: its context and identity, nothing else', async () => {
    Underpost.repo.clusterDeployFactory();
    const path = deployFile('conf.cluster.json');
    const generated = fs.readJsonSync(path);
    const harness = kubeCluster({
      contexts: 'kubernetes-admin@kubernetes\n',
      namespaces: [namespaceItem('kube-system'), namespaceItem('underpost-workloads')],
      controllers: [
        controllerItem('Deployment', 'dd-app-production-blue', 'underpost-workloads', {
          labels: { 'deploy-id': 'dd-app-production' },
        }),
      ],
    });
    try {
      const { capture } = await Underpost.namespace.capture({ options: { context: 'kubernetes-admin@kubernetes' } });
      const adopted = Underpost.namespace.adopt({ capture: Underpost.namespace.readCapture({}), write: true });
      expect(adopted.written).toBe(true);
      const { environments } = fs.readJsonSync(path);
      expect(environments.production).toEqual({
        ...generated.environments.production,
        context: 'kubernetes-admin@kubernetes',
        clusterDomain: 'cluster.local',
        cluster: { fingerprint: capture.cluster.fingerprint, servers: ['https://10.0.0.1:6443'] },
      });
      expect(environments.development).toEqual(generated.environments.development);
      expect(Underpost.namespace.target({ path })).toMatchObject({
        context: 'kubernetes-admin@kubernetes',
        blockers: [],
        refusal: '',
      });
    } finally {
      harness.restore();
    }
  });

  it('writes the users, WireGuard, event and cron defaults of the cluster config, the cron one for the cron deployment', () => {
    fs.outputFileSync(deployFile('dd.cron'), 'dd-cron');
    const { created } = Underpost.repo.clusterDeployFactory();
    for (const section of ['users', 'wireguard', 'event'])
      expect(fs.readJsonSync(deployFile(`conf.${section}.json`)), section).toEqual(clusterConfig[section]);
    expect(created).toContain('./engine-private/conf/dd-cron/conf.cron.json');
    expect(fs.readJsonSync('./engine-private/conf/dd-cron/conf.cron.json')).toEqual(clusterConfig.cron);
    expect(fs.readFileSync(deployFile('dd.cron'), 'utf8')).toBe('dd-cron');
  });

  it('gives a deployment folder the app config only: no cluster file belongs to a deployment', () => {
    fs.writeJsonSync('package.json', { name: 'scratch' });
    const { deployIdFolder } = Config.deployIdFactory('dd-app');
    expect(Object.keys(underpostConfig)).toEqual(['client', 'ssr', 'server']);
    expect(
      fs
        .readdirSync(deployIdFolder)
        .filter((name) => name.startsWith('conf.'))
        .sort(),
    ).toEqual(['conf.client.json', 'conf.server.json', 'conf.ssr.json']);
  });

  it('writes the legacy placement to adopt a cluster where every resource runs where it always has', () => {
    Underpost.repo.clusterDeployFactory('', 'legacy');
    expect(fs.readJsonSync(deployFile('conf.cluster.json'))).toEqual(Underpost.namespace.template('legacy'));
    expect(Underpost.namespace.of('workloads', { path: deployFile('conf.cluster.json') })).toBe('default');
  });

  it('refuses an invalid placement an operator wrote before it writes a file, and leaves it as it is', () => {
    const invalid = { environments: { staging: {} } };
    fs.outputJsonSync(deployFile('conf.cluster.json'), invalid);
    expect(() => Underpost.repo.clusterDeployFactory()).toThrow('staging is not an environment');
    expect(fs.readJsonSync(deployFile('conf.cluster.json'))).toEqual(invalid);
    expect(fs.readdirSync('./engine-private/deploy').sort()).toEqual(['conf.cluster.json', 'id_rsa', 'id_rsa.pub']);
  });

  it('writes the workflows of a deploy id from those of dd-test, and keeps the workflows that exist', () => {
    for (const name of ['engine-test.cd.yml', 'engine-test.ci.yml', 'engine-core.cd.yml', 'engine-core.ci.yml'])
      fs.copySync(nodePath.join(cwd, '.github/workflows', name), `./.github/workflows/${name}`);
    fs.removeSync('./.github/workflows/engine-core.ci.yml');
    const manifest = vi.spyOn(Underpost.repo, 'writeConfManifest').mockReturnValue();
    try {
      const { created, kept } = Underpost.repo.clusterDeployFactory('dd-core');
      // The committed dd-core workflows came from the same generator.
      expect(created).toContain('./.github/workflows/engine-core.ci.yml');
      expect(fs.readFileSync('./.github/workflows/engine-core.ci.yml', 'utf8')).toBe(
        fs.readFileSync(nodePath.join(cwd, '.github/workflows/engine-core.ci.yml'), 'utf8'),
      );
      expect(kept).toContain('./.github/workflows/engine-core.cd.yml');
      expect(manifest).toHaveBeenCalledWith({ deployId: 'dd-core' });

      fs.writeFileSync('./.github/workflows/engine-core.cd.yml', 'name: operator workflow\n');
      expect(Underpost.repo.clusterDeployFactory('dd-core').created).toEqual([]);
      expect(fs.readFileSync('./.github/workflows/engine-core.cd.yml', 'utf8')).toBe('name: operator workflow\n');
    } finally {
      manifest.mockRestore();
    }
  });

  it('refuses a placement of another shape and registers no route', () => {
    const older = { version: 1, environments: { production: {} } };
    fs.outputJsonSync(deployFile('conf.cluster.json'), older);
    expect(() => Underpost.repo.clusterDeployFactory()).toThrow('has unknown keys version');
    expect(fs.readJsonSync(deployFile('conf.cluster.json'))).toEqual(older);
    expect(fs.existsSync(deployFile('dd.routes'))).toBe(false);
  });
});
