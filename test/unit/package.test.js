import { expect } from 'chai';
import { buildProductPackageJson, productDevDependenciesFactory } from '../../src/server/build/package.js';

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
