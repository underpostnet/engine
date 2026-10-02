'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { load as yamlLoad } from 'js-yaml';
import UnderpostDockerCompose from '../../../../src/cli/docker-compose.js';
import { loadProjectExport } from '../../../../src/server/runtime/conf.js';
import { shellHarness } from '../../../support/shell-harness.js';

// A project stack is loaded by deploy id; each test declares the one it needs.
vi.mock(import('../../../../src/server/runtime/conf.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  loadProjectExport: vi.fn(async () => null),
}));

// Everything below writes generated artifacts under the engine tree and drives
// the docker CLI. Both are replaced: an in-memory file table for the artifacts,
// and the shell harness for the compose invocations.
const composeFixture = (files = {}) => {
  const table = new Map(Object.entries(files));
  const written = new Map();
  const removed = [];
  const keys = () => [...table.keys(), ...written.keys()];

  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
    const key = `${filePath}`;
    if (removed.includes(key)) return false;
    return table.has(key) || written.has(key) || keys().some((entry) => entry.startsWith(`${key}/`));
  });
  vi.spyOn(fs, 'readFileSync').mockImplementation(
    (filePath) => table.get(`${filePath}`) ?? written.get(`${filePath}`) ?? '',
  );
  vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));
  vi.spyOn(fs, 'mkdirpSync').mockImplementation(() => undefined);
  vi.spyOn(fs, 'copySync').mockImplementation((src, dest) =>
    written.set(`${dest}`, written.get(`${src}`) ?? table.get(`${src}`) ?? ''),
  );
  vi.spyOn(fs, 'removeSync').mockImplementation((filePath) => {
    written.delete(`${filePath}`);
    removed.push(`${filePath}`);
  });
  return { written, removed };
};

const relative = (path) => `${path}`.replace(`${process.cwd()}/`, '');

describe('docker compose stack', () => {
  let harness;

  beforeEach(() => {
    harness = shellHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  describe('generated artifacts', () => {
    it('renders the nginx routes, mongo entrypoint, monitoring config and env example', async () => {
      const { written } = composeFixture();
      await UnderpostDockerCompose.generate({});
      const paths = [...written.keys()].map(relative);
      expect(paths).to.include('docker/nginx/default.conf');
      expect(paths).to.include('docker/mongodb/entrypoint.sh');
      expect(paths).to.include('docker/prometheus/prometheus.yml');
      expect(paths).to.include('docker/grafana/provisioning/datasources/datasource.yml');
      expect(paths).to.include('docker/compose.env.example');
      expect(paths).to.include('docker/compose.app.yml');
    });

    it('routes every proxy host and answers the health probe on each server', async () => {
      const { written } = composeFixture();
      await UnderpostDockerCompose.generate({});
      const conf = written.get([...written.keys()].find((path) => relative(path) === 'docker/nginx/default.conf'));
      expect(conf).to.include('server_name default.net;');
      expect(conf).to.include('proxy_pass http://app:4002;');
      expect(conf).to.include('listen 80 default_server;');
      expect(conf.match(/location = \/healthz/g)).to.have.length(3);
    });

    it('seeds the working env-file from the example only when it is absent', async () => {
      const { written } = composeFixture();
      await UnderpostDockerCompose.generate({});
      const envPath = [...written.keys()].find((path) => relative(path) === 'docker/compose.env');
      expect(written.get(envPath)).to.equal(written.get(`${envPath}.example`));

      vi.restoreAllMocks();
      const existing = composeFixture({ [envPath]: 'DB_PASSWORD=real\n' });
      await UnderpostDockerCompose.generate({});
      expect(existing.written.has(envPath)).to.equal(false);
    });

    it('bakes the deploy id and environment into the app command override', async () => {
      const { written } = composeFixture();
      await UnderpostDockerCompose.generate({ deployId: 'dd-core', env: 'production' });
      const override = written.get([...written.keys()].find((path) => relative(path) === 'docker/compose.app.yml'));
      expect(override).to.include('dd-core');
      expect(override).to.include('production');
    });

    it('self-bootstraps a fresh engine for the default deploy', () => {
      expect(UnderpostDockerCompose.appCommand().join(' ')).to.include('underpost new engine');
      expect(UnderpostDockerCompose.appCommand('dd-core', 'production').join(' ')).to.include(
        'underpost start --build --run dd-core production',
      );
    });

    it('honours every generated path override', async () => {
      const { written } = composeFixture();
      await UnderpostDockerCompose.generate({
        nginxConf: 'custom/nginx.conf',
        envFile: 'custom/env',
        appOverride: 'custom/app.yml',
      });
      const paths = [...written.keys()].map(relative);
      expect(paths).to.include('custom/nginx.conf');
      expect(paths).to.include('custom/env');
      expect(paths).to.include('custom/app.yml');
    });

    it('scrapes the app service in the rendered prometheus config', () => {
      expect(UnderpostDockerCompose.prometheusContent()).to.include('app:4001');
      expect(UnderpostDockerCompose.grafanaDatasourceContent()).to.include('http://prometheus:9090');
      expect(UnderpostDockerCompose.envExampleContent()).to.include('=');
      expect(UnderpostDockerCompose.mongoEntrypointContent()).to.include('BOOTSTRAP_USER_CREATED');
    });

    // Without a project stack, a named workflow is owned by its canonical directory.
    it('uses a custom workflow canonical files as-is', async () => {
      const base = 'engine-private/conf/dd-core/docker-compose/custom';
      const { written } = composeFixture({
        [UnderpostDockerCompose.resolve(`${base}/docker-compose.yml`)]: 'services: {}\n',
        [UnderpostDockerCompose.resolve(`${base}/compose.env`)]: 'FIXTURE=true\n',
      });
      await UnderpostDockerCompose.generate({ deployId: 'dd-core', dockerComposeId: 'custom' });
      expect(written.size).to.equal(0);
    });

    it('names the canonical files a custom workflow is missing', async () => {
      composeFixture();
      let error;
      await UnderpostDockerCompose.generate({ deployId: 'dd-core', dockerComposeId: 'custom' }).catch(
        (e) => (error = e),
      );
      expect(error?.message).to.include('docker-compose.yml').and.include('compose.env');
    });
  });

  describe('project stacks', () => {
    const base = 'engine-private/conf/dd-core/docker-compose/custom';
    const at = (file) => UnderpostDockerCompose.resolve(`${base}/${file}`);
    let context;
    const stack = (args) => {
      context = args;
      args.nginx.addServer({ names: ['app.test'], locations: [{ match: '/', proxy: 'app:4001' }] });
      return { name: 'dd-core', services: { mongodb: { image: 'mongo' }, app: { image: 'app' } } };
    };

    beforeEach(() => {
      context = undefined;
      vi.mocked(loadProjectExport).mockResolvedValue({ custom: stack });
    });

    it('renders the compose document, the gateway and the init script of each platform service', async () => {
      const { written } = composeFixture({ [at('compose.env')]: 'PORT=4000\n' });
      await UnderpostDockerCompose.generate({ deployId: 'dd-core', dockerComposeId: 'custom' });
      expect(vi.mocked(loadProjectExport)).toHaveBeenCalledWith('dd-core', 'compose-stack.js', 'composeStacks');
      const compose = written.get(at('docker-compose.yml'));
      expect(compose.split('\n')[0]).to.match(/^# Generated by .*--docker-compose-id custom.* do not hand-edit\.$/);
      expect(yamlLoad(compose).services.app.image).to.equal('app');
      expect(written.get(at('nginx.conf'))).to.include('server_name app.test;');
      expect(written.get(at('mongodb/entrypoint.sh'))).to.equal(UnderpostDockerCompose.mongoEntrypointContent());
      expect(written.has(at('ipfs/configure-ipfs.sh'))).to.equal(false);
      // The operator-owned env-file is read, never written.
      expect(written.has(at('compose.env'))).to.equal(false);
      expect(context.composeEnv).to.deep.equal({ PORT: '4000' });
    });

    it('hands the stack the deployment environment', async () => {
      composeFixture({ [at('compose.env')]: '' });
      await UnderpostDockerCompose.generate({ deployId: 'dd-core', dockerComposeId: 'custom', env: 'production' });
      expect(context.env).to.equal('production');
      expect(context.deployId).to.equal('dd-core');
    });

    it('needs only the env-file, which the stack never generates', async () => {
      composeFixture();
      let error;
      await UnderpostDockerCompose.generate({ deployId: 'dd-core', dockerComposeId: 'custom' }).catch(
        (e) => (error = e),
      );
      expect(error?.message).to.include('compose.env').and.not.include('docker-compose.yml');
    });
  });

  describe('host installation', () => {
    it('skips a platform the installer does not target', () => {
      const previous = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        UnderpostDockerCompose.install({});
        expect(harness.calls.length).to.equal(0);
      } finally {
        Object.defineProperty(process, 'platform', previous);
      }
    });

    it('installs nothing when compose already works', () => {
      composeFixture({ '/etc/redhat-release': 'Rocky Linux release 9\n' });
      harness.route({ match: 'docker compose version', code: 0, stdout: 'v2.29.0\n' });
      UnderpostDockerCompose.install({});
      expect(harness.ran('dnf -y install docker-ce')).to.equal(false);
    });

    it('installs the engine and the compose plugin from the official repository', () => {
      composeFixture({ '/etc/redhat-release': 'Rocky Linux release 9\n' });
      harness.route({ match: 'docker compose version', code: 1, stdout: '' });
      UnderpostDockerCompose.install({ user: 'operator' });
      expect(harness.ran('download.docker.com/linux/rhel/docker-ce.repo')).to.equal(true);
      expect(harness.ran('dnf -y install docker-ce docker-ce-cli containerd.io')).to.equal(true);
      expect(harness.ran('systemctl enable --now docker')).to.equal(true);
      expect(harness.ran('usermod -aG docker operator')).to.equal(true);
    });

    it('reinstalls under --force and warns on a host that is not RHEL-compatible', () => {
      composeFixture();
      harness.route({ match: 'docker compose version', code: 0, stdout: 'v2.29.0\n' });
      UnderpostDockerCompose.install({ force: true, user: 'root' });
      expect(harness.ran('dnf -y install docker-ce')).to.equal(true);
      // root is already privileged; adding it to the group buys nothing.
      expect(harness.ran('usermod -aG docker')).to.equal(false);
    });
  });

  describe('reset', () => {
    it('tears down containers, volumes and images, then prunes the generated artifacts', () => {
      const { removed } = composeFixture({
        [UnderpostDockerCompose.resolve('docker/nginx/default.conf')]: 'server {}\n',
        [UnderpostDockerCompose.resolve('docker/compose.env')]: 'DB_PASSWORD=real\n',
      });
      UnderpostDockerCompose.reset({});
      expect(harness.ran('down --remove-orphans --volumes --rmi local')).to.equal(true);
      expect(removed.map(relative)).to.include('docker/nginx/default.conf');
      // The working env-file holds credentials, so it survives a plain reset.
      expect(removed.map(relative)).not.to.include('docker/compose.env');
    });

    it('drops the working env-file too under --force', () => {
      const { removed } = composeFixture({ [UnderpostDockerCompose.resolve('docker/compose.env')]: 'DB=1\n' });
      UnderpostDockerCompose.reset({ force: true });
      expect(removed.map(relative)).to.include('docker/compose.env');
    });

    it('never prunes the files a custom workflow owns', () => {
      const base = 'engine-private/conf/dd-core/docker-compose/custom';
      const { removed } = composeFixture({
        [UnderpostDockerCompose.resolve(`${base}/docker-compose.yml`)]: 'services: {}\n',
        [UnderpostDockerCompose.resolve(`${base}/compose.env`)]: 'FIXTURE=true\n',
      });
      UnderpostDockerCompose.reset({ deployId: 'dd-core', dockerComposeId: 'custom' });
      expect(harness.ran('down --remove-orphans')).to.equal(true);
      expect(removed).to.deep.equal([]);
    });
  });

  describe('CLI dispatch', () => {
    const run = async (target, options) => {
      composeFixture();
      await UnderpostDockerCompose.API.callback(target, options);
    };

    it('brings the stack up when no action flag is given', async () => {
      await run('', {});
      expect(harness.ran('up -d')).to.equal(true);
    });

    it('rebuilds the images when asked to', async () => {
      await run('', { up: true, build: true });
      expect(harness.ran('up -d --build')).to.equal(true);
    });

    // baseCmd conditionally includes the app override, so it has to exist before
    // the invocation is composed — notably after a reset prunes it.
    it('regenerates the config before composing the invocation', async () => {
      const { written } = composeFixture();
      let generatedBeforeUp = false;
      harness.route({
        match: (command) => {
          if (command.includes('up -d')) generatedBeforeUp = written.size > 0;
          return false;
        },
      });
      await UnderpostDockerCompose.API.callback('', { up: true });
      expect(generatedBeforeUp).to.equal(true);
    });

    it('stops at the install when nothing else was requested', async () => {
      composeFixture({ '/etc/redhat-release': 'Rocky\n' });
      harness.route({ match: 'docker compose version', code: 0, stdout: 'v2\n' });
      await UnderpostDockerCompose.API.callback('', { install: true });
      expect(harness.ran('up -d')).to.equal(false);
    });

    it('continues past the install when a lifecycle flag follows it', async () => {
      composeFixture({ '/etc/redhat-release': 'Rocky\n' });
      harness.route({ match: 'docker compose version', code: 0, stdout: 'v2\n' });
      await UnderpostDockerCompose.API.callback('', { install: true, up: true });
      expect(harness.ran('up -d')).to.equal(true);
    });

    it('stops at the reset when nothing else was requested', async () => {
      await run('', { reset: true });
      expect(harness.ran('up -d')).to.equal(false);
    });

    it('recreates the stack when a reset is followed by an up', async () => {
      await run('', { reset: true, up: true });
      expect(harness.ran('up -d')).to.equal(true);
    });

    it('routes every remaining lifecycle flag to its compose subcommand', async () => {
      for (const [options, expected] of [
        [{ down: true }, 'down --remove-orphans'],
        [{ down: true, volumes: true }, 'down --remove-orphans --volumes'],
        [{ restart: true }, 'restart'],
        [{ build: true }, 'build --no-cache'],
        [{ pull: true }, 'pull'],
        [{ logs: true }, 'logs -f --tail=200'],
        [{ status: true }, 'ps --format'],
        [{ exec: 'config' }, 'config'],
      ]) {
        harness.restore();
        harness = shellHarness();
        await run('', options);
        expect(harness.ran(expected), JSON.stringify(options)).to.equal(true);
      }
    });

    it('targets a single service where one is named', async () => {
      await run('app', { logs: true });
      expect(harness.ran('logs -f --tail=200 app')).to.equal(true);
      harness.restore();
      harness = shellHarness();
      await run('mongodb', { restart: true });
      expect(harness.ran('restart mongodb')).to.equal(true);
    });

    it('opens bash in the app service and sh in every other', async () => {
      await run('', { shell: true });
      expect(harness.ran('exec app /bin/bash')).to.equal(true);
      harness.restore();
      harness = shellHarness();
      await run('mongodb', { shell: true });
      expect(harness.ran('exec mongodb /bin/sh')).to.equal(true);
    });

    it('writes the config and runs nothing for a bare generate', async () => {
      await run('', { generate: true });
      expect(harness.calls.length).to.equal(0);
    });

    it('fails the process rather than half-applying a broken invocation', async () => {
      const previousExit = process.exit;
      let exitCode;
      process.exit = (code) => {
        exitCode = code;
      };
      try {
        composeFixture();
        harness.route({ match: 'up -d', throws: new Error('docker daemon unreachable') });
        await UnderpostDockerCompose.API.callback('', { up: true });
        expect(exitCode).to.equal(1);
      } finally {
        process.exit = previousExit;
      }
    });
  });
});
