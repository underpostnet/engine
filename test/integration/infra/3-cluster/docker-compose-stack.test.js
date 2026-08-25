'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import UnderpostDockerCompose from '../../../../src/cli/docker-compose.js';
import { shellHarness } from '../../../support/shell-harness.js';

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
    it('renders the nginx routes, mongo entrypoint, monitoring config and env example', () => {
      const { written } = composeFixture();
      UnderpostDockerCompose.generate({});
      const paths = [...written.keys()].map(relative);
      expect(paths).to.include('docker/nginx/default.conf');
      expect(paths).to.include('docker/mongodb/entrypoint.sh');
      expect(paths).to.include('docker/prometheus/prometheus.yml');
      expect(paths).to.include('docker/grafana/provisioning/datasources/datasource.yml');
      expect(paths).to.include('docker/compose.env.example');
      expect(paths).to.include('docker/compose.app.yml');
    });

    it('seeds the working env-file from the example only when it is absent', () => {
      const { written } = composeFixture();
      UnderpostDockerCompose.generate({});
      const envPath = [...written.keys()].find((path) => relative(path) === 'docker/compose.env');
      expect(written.get(envPath)).to.equal(written.get(`${envPath}.example`));

      vi.restoreAllMocks();
      const existing = composeFixture({ [envPath]: 'DB_PASSWORD=real\n' });
      UnderpostDockerCompose.generate({});
      expect(existing.written.has(envPath)).to.equal(false);
    });

    it('bakes the deploy id and environment into the app command override', () => {
      const { written } = composeFixture();
      UnderpostDockerCompose.generate({ deployId: 'dd-core', env: 'production' });
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

    it('honours every generated path override', () => {
      const { written } = composeFixture();
      UnderpostDockerCompose.generate({
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

    // A named workflow is fully owned by its canonical directory: the generic
    // CLI never writes application-specific content into it.
    it('uses a custom workflow canonical files as-is', () => {
      const base = 'engine-private/conf/dd-core/docker-compose/custom';
      const { written } = composeFixture({
        [UnderpostDockerCompose.resolve(`${base}/docker-compose.yml`)]: 'services: {}\n',
        [UnderpostDockerCompose.resolve(`${base}/compose.env`)]: 'FIXTURE=true\n',
      });
      UnderpostDockerCompose.generate({ deployId: 'dd-core', dockerComposeId: 'custom' });
      expect(written.size).to.equal(0);
    });

    it('names the canonical files a custom workflow is missing', () => {
      composeFixture();
      expect(() => UnderpostDockerCompose.generate({ deployId: 'dd-core', dockerComposeId: 'custom' })).to.throw(
        'missing',
      );
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
