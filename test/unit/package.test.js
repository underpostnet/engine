import { expect } from 'chai';
import fs from 'fs-extra';
import shell from 'shelljs';
import { program } from '../../src/cli/index.js';
import {
  STAGED_CLI_PACKAGE,
  deployDependencySpecsFactory,
  packageRepositoryFactory,
  renamePackage,
  setPackageRepository,
  buildDeployPackageJson,
  buildProductPackageJson,
  deployPackageNameFactory,
  deployPackagePathFactory,
  productDevDependenciesFactory,
  productPackageOptionsFactory,
  stagePackageArchive,
  syncDeployPackages,
} from '../../src/server/build/package.js';
import path from 'node:path';
import os from 'node:os';
import cyberiaCatalog from '../../src/projects/cyberia/catalog-cyberia.js';

describe('generated product package dependencies', () => {
  it('keeps the engine toolchain for checkout tests without duplicating runtime dependencies', () => {
    expect(
      productDevDependenciesFactory({
        engineDependencies: {
          'runtime-shared': '1.0.0',
          vitest: '4.1.11',
        },
        engineDevDependencies: {
          'engine-dev-only': '2.0.0',
        },
        productDependencies: {
          'runtime-shared': '3.0.0',
          underpost: '^3.3.0',
        },
        productDevDependencies: {
          'product-dev-only': '4.0.0',
        },
      }),
    ).to.deep.equal({
      vitest: '4.1.11',
      'engine-dev-only': '2.0.0',
      'product-dev-only': '4.0.0',
    });
  });

  it('accepts manifests without optional dependency groups', () => {
    expect(productDevDependenciesFactory()).to.deep.equal({});
  });

  it('builds a product manifest declaratively without mutating the template', () => {
    const basePackageJson = {
      name: 'pwa-microservices-template',
      description: 'Base template',
      repository: { url: 'https://github.com/underpostnet/pwa-microservices-template.git' },
      bin: { underpost: 'bin/index.js' },
      dependencies: { express: '5.2.1' },
      scripts: { test: 'node bin test' },
    };

    const result = buildProductPackageJson({
      basePackageJson,
      sourcePackageJson: {
        dependencies: { express: '5.2.1', vitest: '4.1.11' },
      },
      catalog: { description: 'Cyberia CLI', keywords: ['cyberia'] },
      confName: 'dd-cyberia',
      customDependencies: { underpost: '^3.3.0' },
      customScripts: { build: 'node bin client' },
      customBin: { cyberia: 'bin/index.js' },
    });

    expect(result).to.deep.include({
      name: 'cyberia',
      description: 'Cyberia CLI',
      keywords: ['cyberia'],
      bin: { cyberia: 'bin/index.js' },
      dependencies: { underpost: '^3.3.0' },
      devDependencies: { express: '5.2.1', vitest: '4.1.11' },
      scripts: { test: 'node bin test', build: 'node bin client' },
    });
    expect(result.repository.url).to.equal('https://github.com/underpostnet/engine-cyberia.git');
    expect(basePackageJson).to.deep.equal({
      name: 'pwa-microservices-template',
      description: 'Base template',
      repository: { url: 'https://github.com/underpostnet/pwa-microservices-template.git' },
      bin: { underpost: 'bin/index.js' },
      dependencies: { express: '5.2.1' },
      scripts: { test: 'node bin test' },
    });
  });

  it('preserves the base runtime manifest when no product overrides are declared', () => {
    const result = buildProductPackageJson({
      basePackageJson: {
        name: 'template',
        dependencies: { express: '5.2.1' },
        devDependencies: { vitest: '4.1.11' },
        scripts: { test: 'vitest' },
      },
      confName: 'dd-core',
    });

    expect(result).to.deep.include({
      name: 'core',
      dependencies: { express: '5.2.1' },
      devDependencies: { vitest: '4.1.11' },
      scripts: { test: 'vitest' },
    });
  });
});

describe('package archive staging', () => {
  let fixturePath;

  afterEach(() => {
    vi.restoreAllMocks();
    if (fixturePath) fs.removeSync(fixturePath);
  });

  it('packs in isolation and replaces the stable build-context archive', () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-package-stage-');
    const packagePath = `${fixturePath}/source package`;
    const outputPath = `${fixturePath}/build context`;
    fs.outputJsonSync(`${packagePath}/package.json`, { name: 'example-package', version: '1.2.3' });
    fs.outputFileSync(`${outputPath}/${STAGED_CLI_PACKAGE}`, 'old');

    let temporaryPath;
    const exec = vi.spyOn(shell, 'exec').mockImplementation((command) => {
      temporaryPath = command.match(/--pack-destination '([^']+)'/)?.[1];
      fs.outputFileSync(`${temporaryPath}/example-package-1.2.3.tgz`, 'new');
      return { code: 0, stdout: '', stderr: '' };
    });

    const stagedPath = stagePackageArchive({
      stagedFileName: STAGED_CLI_PACKAGE,
      outputPath,
      packagePath,
    });

    expect(stagedPath).to.equal(`${outputPath}/${STAGED_CLI_PACKAGE}`);
    expect(fs.readFileSync(stagedPath, 'utf8')).to.equal('new');
    expect(fs.existsSync(temporaryPath)).to.equal(false);
    expect(exec.mock.calls[0][0]).to.include("--ignore-scripts --pack-destination '");
    expect(exec.mock.calls[0][0]).to.include(`'${packagePath}'`);
    expect(exec.mock.calls[0][1]).to.deep.equal({ silent: true });
  });

  it('rejects staged names that can escape the output directory', () => {
    expect(() => stagePackageArchive({ stagedFileName: '../package.tgz' })).to.throw(
      'stagePackageArchive requires a file name without a directory',
    );
  });
});

describe('generated deploy package manifests', () => {
  const enginePackageJson = {
    name: 'underpost-engine',
    type: 'module',
    version: '3.3.0',
    description: 'engine',
    keywords: ['engine'],
    bin: { underpost: 'bin/index.js' },
    scripts: { start: 'node src/server', fix: 'npm audit fix --force', test: 'node bin test' },
    dependencies: { express: '5.2.1' },
    overrides: { ws: '^8.20.2' },
  };

  it('gives a deploy without a catalog the engine manifest under its own identity', () => {
    // The default is the whole point: a new deploy id declares nothing and still gets a
    // manifest the checkout can install and the CLI can run from.
    const manifest = buildDeployPackageJson({ deployId: 'dd-new', enginePackageJson });

    expect(manifest.name).to.equal('new');
    expect(manifest.scripts.start).to.equal('node --max-old-space-size=8192 src/server dd-new');
    expect(manifest.scripts.fix).to.equal('npm audit fix --force');
    expect(manifest.dependencies).to.deep.equal({ express: '5.2.1' });
    expect(manifest.overrides).to.deep.equal({ ws: '^8.20.2' });
    // The engine's command stays linkable: this manifest is installed over the checkout.
    expect(manifest.bin).to.deep.equal({ underpost: 'bin/index.js' });
  });

  it('adds exactly what the catalog declares, and nothing else', () => {
    const manifest = buildDeployPackageJson({
      deployId: 'dd-cyberia',
      enginePackageJson,
      catalog: {
        packageName: 'cyberia',
        description: 'Cyberia CLI',
        keywords: ['cyberia'],
        packageBin: { cyberia: 'bin/index.js' },
        packageDependencies: { ethers: '~6.16.0' },
        packageScripts: { 'docker:up': 'node bin docker-compose --up' },
      },
    });

    expect(manifest.name).to.equal('cyberia');
    expect(manifest.description).to.equal('Cyberia CLI');
    expect(manifest.keywords).to.deep.equal(['cyberia']);
    expect(manifest.dependencies).to.deep.equal({ express: '5.2.1', ethers: '~6.16.0' });
    expect(manifest.scripts['docker:up']).to.equal('node bin docker-compose --up');
    expect(manifest.bin).to.deep.equal({ underpost: 'bin/index.js' });
  });

  it('publishes the product identity only when asked for it', () => {
    expect(
      buildDeployPackageJson({
        deployId: 'dd-cyberia',
        enginePackageJson,
        catalog: cyberiaCatalog,
        productIdentity: true,
      }).bin,
    ).to.deep.equal({ cyberia: 'bin/index.js', underpost: 'bin/index.js' });
  });

  it('keeps a start script the deploy already declared', () => {
    // dd-cron starts a cron applier, not the engine server; regenerating must not overwrite it.
    const manifest = buildDeployPackageJson({
      deployId: 'dd-cron',
      enginePackageJson,
      currentPackageJson: { scripts: { start: 'kubectl apply -f ./manifests/cronjobs' } },
    });
    expect(manifest.scripts.start).to.equal('kubectl apply -f ./manifests/cronjobs');
  });

  it('refuses to guess what it was not given', () => {
    expect(() => buildDeployPackageJson({ enginePackageJson })).to.throw('deployId');
    expect(() => buildDeployPackageJson({ deployId: 'dd-new' })).to.throw('enginePackageJson');
  });

  it('names each deploy manifest one way, wherever it is generated', () => {
    expect(deployPackageNameFactory('dd-core')).to.equal('core');
    expect(deployPackageNameFactory('dd-cyberia', { packageName: 'cyberia' })).to.equal('cyberia');
    expect(deployPackagePathFactory('dd-core')).to.equal('./engine-private/conf/dd-core/package.json');
  });

  it('writes one manifest per deploy id in the configuration tree', async () => {
    const confRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-conf-'));
    try {
      fs.outputJsonSync(`${confRoot}/dd-one/package.json`, { name: 'engine', scripts: { start: 'custom' } });
      fs.outputJsonSync(`${confRoot}/dd-two/conf.server.json`, {});

      const synced = await syncDeployPackages({ confRoot, enginePackageJson });

      // Only deploy ids that carry a manifest: a conf directory without one is not a package.
      expect(synced.map(({ deployId }) => deployId)).to.deep.equal(['dd-one']);
      const written = fs.readJsonSync(`${confRoot}/dd-one/package.json`);
      expect(written.name).to.equal('one');
      expect(written.scripts.start).to.equal('custom');
      expect(written.dependencies).to.deep.equal({ express: '5.2.1' });
    } finally {
      fs.removeSync(confRoot);
    }
  });
});

describe('product manifest overrides read the catalog', () => {
  it('carries the published engine CLI alongside the catalog pins', () => {
    expect(
      productPackageOptionsFactory({
        catalog: {
          packageDependencies: { ethers: '~6.16.0' },
          packageBin: { cyberia: 'bin/index.js' },
          packageScripts: { 'docker:up': 'node bin docker-compose --up' },
        },
        underpostVersion: 'v3.3.0',
      }),
    ).to.deep.equal({
      customDependencies: { underpost: '^3.3.0', ethers: '~6.16.0' },
      customScripts: { 'docker:up': 'node bin docker-compose --up' },
      customBin: { cyberia: 'bin/index.js' },
    });
  });

  it('leaves the base template manifest alone for a catalog that declares no package', () => {
    expect(productPackageOptionsFactory({ catalog: {}, underpostVersion: 'v3.3.0' })).to.deep.equal({});
  });
});

describe('the package command is the one entry point to these manifests', () => {
  const packageCommand = () => program.commands.find((command) => command.name() === 'package');

  it('acts on a deploy id, not on a product it names', () => {
    // Regression: the same two operations lived as `deploy cyberia` and `deploy
    // update-dependencies`, one of them naming a single product in a build script.
    const command = packageCommand();
    expect(command, 'underpost package').to.exist;
    expect(command.options.map(({ long }) => long)).to.have.members([
      '--sync',
      '--install',
      '--rename',
      '--set-repo',
      '--dry-run',
    ]);
    expect(command.registeredArguments.map((argument) => argument.name())).to.deep.equal(['deploy-id']);
  });

  it('pins its installs from the catalog it generates manifests from', () => {
    expect(
      deployDependencySpecsFactory({ packageDependencies: { ethers: '~6.16.0', sharp: '^0.35.3' } }),
    ).to.deep.equal(['ethers@~6.16.0', 'sharp@^0.35.3']);
    expect(deployDependencySpecsFactory()).to.deep.equal([]);
  });

  it('regenerates only the deploy ids it was given', async () => {
    const confRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-conf-'));
    try {
      for (const deployId of ['dd-one', 'dd-two'])
        fs.outputJsonSync(`${confRoot}/${deployId}/package.json`, { name: 'engine' });

      const synced = await syncDeployPackages({
        deployIds: ['dd-two'],
        confRoot,
        enginePackageJson: { name: 'underpost-engine', dependencies: {}, scripts: {} },
      });

      expect(synced.map(({ deployId }) => deployId)).to.deep.equal(['dd-two']);
      expect(fs.readJsonSync(`${confRoot}/dd-one/package.json`).name).to.equal('engine');
      expect(fs.readJsonSync(`${confRoot}/dd-two/package.json`).name).to.equal('two');
    } finally {
      fs.removeSync(confRoot);
    }
  });
});

describe('package identity is written in one place', () => {
  const checkout = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-package-identity-'));
    fs.outputJsonSync(path.join(root, 'package.json'), { name: 'engine', version: '1.0.0' });
    return root;
  };

  it('renames the manifest and the lockfile together', () => {
    // npm refuses an install where the two disagree, so they are one operation.
    const root = checkout();
    try {
      fs.outputJsonSync(path.join(root, 'package-lock.json'), {
        name: 'engine',
        packages: { '': { name: 'engine', version: '1.0.0' } },
      });

      const { files } = renamePackage({
        name: '@underpostnet/underpost',
        packagePath: path.join(root, 'package.json'),
        lockPath: path.join(root, 'package-lock.json'),
      });

      expect(files).to.have.lengthOf(2);
      expect(fs.readJsonSync(path.join(root, 'package.json')).name).to.equal('@underpostnet/underpost');
      const lock = fs.readJsonSync(path.join(root, 'package-lock.json'));
      expect(lock.name).to.equal('@underpostnet/underpost');
      expect(lock.packages[''].name).to.equal('@underpostnet/underpost');
    } finally {
      fs.removeSync(root);
    }
  });

  it('renames a checkout that has no lockfile', () => {
    const root = checkout();
    try {
      const { files } = renamePackage({
        name: 'cyberia',
        packagePath: path.join(root, 'package.json'),
        lockPath: path.join(root, 'package-lock.json'),
      });
      expect(files).to.deep.equal([path.join(root, 'package.json')]);
      expect(fs.readJsonSync(path.join(root, 'package.json')).name).to.equal('cyberia');
    } finally {
      fs.removeSync(root);
    }
  });

  it('points a package at a repository, in the one form npm publishes', () => {
    const root = checkout();
    try {
      expect(packageRepositoryFactory('underpostnet/engine')).to.deep.equal({
        type: 'git',
        url: 'git+https://github.com/underpostnet/engine.git',
      });
      setPackageRepository({ slug: 'underpostnet/engine-ghpkg', packagePath: path.join(root, 'package.json') });
      expect(fs.readJsonSync(path.join(root, 'package.json')).repository.url).to.equal(
        'git+https://github.com/underpostnet/engine-ghpkg.git',
      );
    } finally {
      fs.removeSync(root);
    }
  });

  it('refuses to write an identity it was not given', () => {
    expect(() => renamePackage({})).to.throw('name');
    expect(() => setPackageRepository({})).to.throw('slug');
  });
});
