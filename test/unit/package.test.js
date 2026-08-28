import { expect } from 'chai';
import fs from 'fs-extra';
import shell from 'shelljs';
import {
  STAGED_CLI_PACKAGE,
  buildProductPackageJson,
  productDevDependenciesFactory,
  stagePackageArchive,
} from '../../src/server/build/package.js';

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
