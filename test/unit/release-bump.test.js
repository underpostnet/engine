'use strict';

import path from 'node:path';

import { expect } from 'chai';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import shell from 'shelljs';

import UnderpostRelease, { bumpAuxiliaryFiles } from '../../src/cli/release.js';
import UnderpostRepository from '../../src/cli/repository.js';
import { Dns } from '../../src/server/network/dns.js';

const DOC_ROOT = 'src/client/public';
const VERSION_HEADER = /\*\*(?:Current )?[Vv]ersion:\*\* (\d+\.\d+\.\d+)/;

// `bumpp` mutates package.json and every lockfile it is handed, so the release
// pipeline drives a stand-in and the file list it was asked to bump is asserted.
const bumpped = vi.hoisted(() => []);
vi.mock('bumpp', () => ({
  versionBump: async (options) => {
    bumpped.push(options);
    return { updatedFiles: options.files };
  },
}));

const markdownFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
};

describe('release version bump targets', () => {
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

  it('bumps every shipped doc that stamps the current version in its header', () => {
    // A doc tree the target table does not name is bumped by nothing, and the stale
    // header only surfaces after the release is out.
    const stamped = markdownFiles(DOC_ROOT).filter(
      (file) => fs.readFileSync(file, 'utf8').match(VERSION_HEADER)?.[1] === version,
    );
    const bumped = new Set(bumpAuxiliaryFiles(version, '0.0.0', { dryRun: true }).map(({ file }) => file));

    for (const file of stamped) expect(bumped.has(file), file).to.equal(true);
  });

  it('reports nothing at all when the version does not move', () => {
    expect(bumpAuxiliaryFiles(version, version, { dryRun: true })).to.deep.equal([]);
  });

  it('leaves every file on disk untouched under a dry run', () => {
    const written = vi.spyOn(fs, 'writeFileSync');
    try {
      bumpAuxiliaryFiles(version, '0.0.0', { dryRun: true });
      expect(written.mock.calls.length).to.equal(0);
    } finally {
      written.mockRestore();
    }
  });

  it('rewrites only the occurrences carrying the pre-bump version', () => {
    // A doc naming several historical tags must keep them; only the version the
    // release is moving away from is a bump target.
    const readme = ['[![v3.2.9](https://socket.dev/api/badge/npm/package/underpost/3.2.9)]', 'ci/cd cli v3.2.9'].join(
      '\n',
    );
    const files = new Map([['README.md', readme]]);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => files.has(`${filePath}`));
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => files.get(`${filePath}`));
    const writes = new Map();
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => writes.set(`${filePath}`, value));
    try {
      expect(bumpAuxiliaryFiles('3.2.9', '3.3.0')).to.deep.equal([{ file: 'README.md', count: 2 }]);
      expect(writes.get('README.md')).to.include('package/underpost/3.3.0');
      expect(writes.get('README.md')).to.include('ci/cd cli v3.3.0');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('preserves narrative references to other versions', () => {
    const files = new Map([['README.md', 'ci/cd cli v3.2.9 — upgrading from ci/cd cli v3.1.0']]);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => files.has(`${filePath}`));
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => files.get(`${filePath}`));
    const writes = new Map();
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => writes.set(`${filePath}`, value));
    try {
      expect(bumpAuxiliaryFiles('3.2.9', '3.3.0')).to.deep.equal([{ file: 'README.md', count: 1 }]);
      expect(writes.get('README.md')).to.equal('ci/cd cli v3.3.0 — upgrading from ci/cd cli v3.1.0');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('never rewrites the changelog, logs, vendored trees or private env files', () => {
    // These paths hold history, runtime output and secrets: a regex sweep over
    // them is destructive in a way no release needs.
    const skipped = [
      'CHANGELOG.md',
      'logs/start.js/all.log',
      'node_modules/pkg/README.md',
      '.git/COMMIT_EDITMSG',
      'engine-private/conf/dd-cron/.env.production',
    ];
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir) =>
      `${dir}` === 'logs'
        ? skipped.map((file) => ({ name: path.basename(file), isDirectory: () => false, isFile: () => true }))
        : [],
    );
    vi.spyOn(fs, 'readFileSync').mockReturnValue('ci/cd cli v3.2.9');
    const written = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    try {
      bumpAuxiliaryFiles('3.2.9', '3.3.0');
      for (const file of written.mock.calls.map(([filePath]) => `${filePath}`)) {
        expect(
          skipped.some((skip) => file.includes(skip)),
          file,
        ).to.equal(false);
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// Every release command is a chain of host commands against /home/dd. The suite
// asserts the command vector and its ordering; nothing is allowed to reach the
// real shell, the real repositories or the real production env file.
describe('release pipeline commands', () => {
  let commands;
  let directories;

  const PACKAGE = { version: '3.2.9' };

  beforeEach(() => {
    commands = [];
    directories = [];
    bumpped.length = 0;
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '', toString: () => '' };
    });
    vi.spyOn(shell, 'cd').mockImplementation((dir) => directories.push(`${dir}`));
    // `release build` and `release deploy` load dd-cron's production env with
    // `override: true`; on a checkout that carries it, that would replace this
    // process's own environment with live deploy credentials.
    vi.spyOn(dotenv, 'config').mockReturnValue({ parsed: {} });
    vi.spyOn(UnderpostRepository.API, 'clean').mockImplementation(() => undefined);
    vi.spyOn(UnderpostRepository.API, 'initLocalRepo').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  // `buildAndTestTemplate` waits 5.5s for the template dev server to write its
  // startup log. The wait is the only real time in the pipeline, so it is faked
  // rather than slept through.
  const runTemplateBuild = async (...args) => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const pending = UnderpostRelease.API.build(...args);
      await vi.advanceTimersByTimeAsync(6000);
      return await pending;
    } finally {
      vi.useRealTimers();
    }
  };

  const stubPackageJson = () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) =>
      `${filePath}` === 'package.json' ? JSON.stringify(PACKAGE) : '',
    );
  };

  describe('build', () => {
    it('previews the canonical and auxiliary changes without touching the working tree', async () => {
      stubPackageJson();
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
      const written = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const result = await UnderpostRelease.API.build('3.3.0', { dryRun: true });

      expect(result).to.deep.equal({ from: '3.2.9', to: '3.3.0', files: [], dryRun: true });
      expect(bumpped.length).to.equal(0);
      expect(written.mock.calls.length).to.equal(0);
      expect(commands.length).to.equal(0);
    });

    it('lists the manifests whose canonical version would move', async () => {
      const manifests = new Map([
        ['package.json', JSON.stringify(PACKAGE)],
        ['hardhat/package.json', JSON.stringify({ version: '3.2.9' })],
        ['package-lock.json', JSON.stringify({ version: '3.3.0' })],
      ]);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (manifests.has(`${filePath}`)) return manifests.get(`${filePath}`);
        throw new Error(`ENOENT ${filePath}`);
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      await UnderpostRelease.API.build('3.3.0', { dryRun: true });

      expect(commands.length).to.equal(0);
    });

    it('defaults to the version already in package.json', async () => {
      stubPackageJson();
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = await UnderpostRelease.API.build(undefined, { dryRun: true });

      expect(result).to.include({ from: '3.2.9', to: '3.2.9' });
    });

    it('aborts the whole release when the template smoke test fails', async () => {
      stubPackageJson();
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
      vi.spyOn(fs, 'removeSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(Dns, 'getLocalIPv4Address').mockReturnValue('10.0.0.8');

      expect(await runTemplateBuild('3.3.0')).to.equal(undefined);
      // The template log is absent, so the runner result is empty and the build
      // must stop before bumpp and before any downstream regeneration.
      expect(bumpped.length).to.equal(0);
      expect(commands.some((command) => command.startsWith('node bin/deploy cli-docs'))).to.equal(false);
    });

    it('bumps and regenerates once the template starts cleanly', async () => {
      const envExample = 'DB_HOST=127.0.0.1\nDB_USER=root\nDB_PASSWORD=\nVALKEY_HOST=127.0.0.1\n';
      const writes = new Map();
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.endsWith('logs/start.js/all.log'));
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (`${filePath}` === 'package.json') return JSON.stringify(PACKAGE);
        if (`${filePath}`.endsWith('.env.example')) return envExample;
        if (`${filePath}`.endsWith('all.log')) return 'server listening\n';
        return '';
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
      vi.spyOn(fs, 'removeSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => writes.set(`${filePath}`, value));
      vi.spyOn(Dns, 'getLocalIPv4Address').mockReturnValue('10.0.0.8');

      const result = await runTemplateBuild('3.3.0', {
        mongoHost: 'mongo.fixture.test',
        mongoUser: 'fixture',
        mongoPassword: 'secret',
        valkeyHost: 'valkey.fixture.test',
      });

      expect(result).to.include({ from: '3.2.9', to: '3.3.0', dryRun: false });
      expect(bumpped[0].files).to.include('package.json').and.to.include('hardhat/package-lock.json');
      expect(bumpped[0]).to.include({ release: '3.3.0', commit: false, tag: false, push: false, confirm: false });

      const templateEnv = writes.get('../pwa-microservices-template/.env.example');
      expect(templateEnv).to.include('DB_HOST=mongo.fixture.test');
      expect(templateEnv).to.include('DB_USER=fixture');
      expect(templateEnv).to.include('DB_PASSWORD=secret');
      expect(templateEnv).to.include('VALKEY_HOST=valkey.fixture.test');
      // The example ships 127.0.0.1; the smoke test has to reach the host over
      // the address the containers can route to.
      expect(templateEnv).not.to.include('127.0.0.1');
      expect(templateEnv).to.include('ENABLE_FILE_LOGS=true');

      expect(commands).to.include('node bin/deploy cli-docs 3.2.9 3.3.0');
      expect(commands).to.include('node bin cmt --changelog-build');
      // The default conf is generated and removed again — leaving it behind
      // makes the next `dd` fan-out build a deploy the release never declared.
      expect(commands.filter((command) => command.includes('rm -rf ./engine-private/conf/dd-default')).length).to.equal(
        2,
      );
    });

    it('runs the template smoke test in an isolated environment', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) =>
        `${filePath}` === 'package.json' ? JSON.stringify(PACKAGE) : '',
      );
      vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
      vi.spyOn(fs, 'removeSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      vi.spyOn(Dns, 'getLocalIPv4Address').mockReturnValue(null);

      await runTemplateBuild('3.3.0');

      const devCommand = commands.find((command) => command.includes('npm run dev'));
      expect(devCommand).to.include('env -i HOME="$HOME" PATH="$PATH"');
      expect(devCommand).to.include('ENABLE_FILE_LOGS=true');
      expect(commands.filter((command) => command.startsWith('node bin run kill')).length).to.equal(8);
    });
  });

  describe('ci', () => {
    it('strips every accepted deploy id prefix down to one repository name', async () => {
      for (const deployId of ['cyberia', 'dd-cyberia', 'engine-cyberia']) {
        commands = [];
        const { triggerCmd } = await UnderpostRelease.API.ci(deployId, 'fixture message');
        expect(triggerCmd, deployId).to.include('/engine-cyberia');
        expect(commands, deployId).to.include('node bin/build dd-cyberia');
      }
    });

    it('replaces the template git directory with the bare clone of the target repository', async () => {
      await UnderpostRelease.API.ci('core', 'fixture message');
      expect(commands).to.include('rm -rf ./.git');
      expect(commands).to.include('mv ../engine-core.git ./.git');
      expect(commands).to.include('git config --local core.bare false');
      expect(directories).to.include('/home/dd/pwa-microservices-template');
    });

    it('falls back to the engine changelog message when none is passed', async () => {
      vi.spyOn(shell, 'exec').mockImplementation((command) => {
        commands.push(command);
        const stdout = command.includes('--changelog-msg') ? ' generated message \n' : '';
        return { code: 0, stdout, stderr: '', toString: () => stdout };
      });
      const { triggerCmd } = await UnderpostRelease.API.ci('core');
      expect(triggerCmd).to.include('git commit -m "generated message"');
    });

    it('falls back to a generic message when the changelog yields nothing', async () => {
      const { triggerCmd } = await UnderpostRelease.API.ci('core', '   ');
      expect(triggerCmd).to.include('git commit -m "Update engine-core repository"');
    });
  });

  describe('pwa', () => {
    it('re-clones, rebuilds and stages the template', async () => {
      const { triggerCmd } = await UnderpostRelease.API.pwa('fixture message');
      expect(commands).to.include('sudo rm -rf /home/dd/pwa-microservices-template');
      expect(commands).to.include('npm run build:template');
      expect(commands).to.include('git add .');
      expect(triggerCmd).to.include('git commit -m "fixture message"');
    });

    it('falls back to the engine changelog message', async () => {
      vi.spyOn(shell, 'exec').mockImplementation((command) => {
        commands.push(command);
        const stdout = command.includes('--changelog-msg') ? 'changelog line' : '';
        return { code: 0, stdout, stderr: '', toString: () => stdout };
      });
      const { triggerCmd } = await UnderpostRelease.API.pwa();
      expect(triggerCmd).to.include('git commit -m "changelog line"');
    });

    it('falls back to a generic message', async () => {
      const { triggerCmd } = await UnderpostRelease.API.pwa('');
      expect(triggerCmd).to.include('Update pwa-microservices-template repository');
    });
  });

  describe('deploy', () => {
    it('syncs the secrets, commits and pushes both repositories', async () => {
      const previous = process.env.GITHUB_USERNAME;
      process.env.GITHUB_USERNAME = 'fixture-org';
      try {
        await UnderpostRelease.API.deploy('3.3.0');
        // Host configuration, loaded by domain rather than by a hardcoded env-file path.
        expect(commands).to.include('node bin host load');
        expect(commands).to.include(`node bin cmt . ci package-pwa-microservices-template 'New release v:3.3.0'`);
        expect(commands).to.include('node bin push . fixture-org/engine');
        expect(commands).to.include('cd ./engine-private && node ../bin push . fixture-org/engine-private');
      } finally {
        if (previous === undefined) delete process.env.GITHUB_USERNAME;
        else process.env.GITHUB_USERNAME = previous;
      }
    });
  });
});
