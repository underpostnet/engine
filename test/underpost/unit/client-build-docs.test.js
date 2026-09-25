'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import shell from 'shelljs';
import { COVERAGE_BUNDLE_DIRECTORY } from '../../../src/server/build/coverage.js';
import { buildCoverage, buildDocs, buildSwaggerUiOptions } from '../../../src/client-builder/client-build-docs.js';

// swagger-autogen is a code generator that walks a router file and writes what it read. The
// doc it is handed and the document composed from its output are what this module is
// responsible for, so the generator itself is replaced and its arguments are asserted; it
// writes the part a test stages for that router, so the composition has one.
const generated = vi.hoisted(() => []);
const staged = vi.hoisted(() => ({ parts: {} }));
vi.mock('swagger-autogen', async () => {
  const fs = (await import('fs-extra')).default;
  return {
    default: (options) => async (outputFile, routes, doc) => {
      generated.push({ options, outputFile, routes, doc });
      const api = routes[0].match(/\/([^/]+)\.router\.js$/)[1];
      if (staged.parts[api]) fs.outputJsonSync(outputFile, staged.parts[api]);
    },
  };
});

describe('client coverage build', () => {
  let fixturePath;
  let cwd;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    // Suite reports resolve against the engine root, so the fixture stands in for it.
    cwd = process.cwd();
    process.chdir(fixturePath);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(fixturePath);
    vi.restoreAllMocks();
  });

  it('publishes each declared report at its own coverage route', async () => {
    fs.outputFileSync(`${fixturePath}/coverage/cyberia/index.html`, '<!doctype html><title>cyberia</title>');
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/html/index.html`, '<!doctype html><title>hardhat</title>');
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/html/base.css`, 'body {}');
    const docsDestination = `${fixturePath}/public/docs/`;

    await buildCoverage({
      docs: {
        coverage: [
          { id: 'cyberia', suite: 'cyberia' },
          { id: 'hardhat', path: `${fixturePath}/hardhat` },
        ],
      },
      docsDestination,
    });

    expect(fs.readFileSync(`${docsDestination}coverage/cyberia/index.html`, 'utf8')).to.include('cyberia');
    expect(fs.readFileSync(`${docsDestination}coverage/hardhat/index.html`, 'utf8')).to.include('hardhat');
    expect(fs.existsSync(`${docsDestination}coverage/hardhat/base.css`)).to.equal(true);
    expect(fs.existsSync(`${docsDestination}coverage/hardhat/html`)).to.equal(false);
  });

  it('drops a previously published report the conf no longer declares', async () => {
    fs.outputFileSync(`${fixturePath}/out/coverage/legacy/index.html`, '<!doctype html>');
    fs.outputFileSync(`${fixturePath}/coverage/unit/index.html`, '<!doctype html><title>unit</title>');

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.existsSync(`${fixturePath}/out/coverage/legacy`)).to.equal(false);
    expect(fs.existsSync(`${fixturePath}/out/coverage/engine/index.html`)).to.equal(true);
  });

  it("publishes the run a report names, never another selection's", async () => {
    fs.outputFileSync(`${fixturePath}/coverage/unit-infra-app-cyberia/index.html`, '<!doctype html><title>all</title>');

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost,ecosystem' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    const page = fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8');
    expect(page).to.include('Coverage report unavailable');
    expect(page).to.include('node bin test underpost,ecosystem');
  });

  it('publishes the unavailable page for a coverage directory with no HTML index', async () => {
    fs.outputFileSync(`${fixturePath}/hardhat/coverage/lcov.info`, 'TN:\n');

    await buildCoverage({
      docs: { coverage: [{ id: 'hardhat', path: `${fixturePath}/hardhat` }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/hardhat/index.html`, 'utf8')).to.include(
      'Coverage report unavailable',
    );
  });

  it('publishes the report an assembled deploy artifact bundled', async () => {
    fs.outputFileSync(
      `${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/engine/index.html`,
      '<!doctype html><title>bundled</title>',
    );

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8')).to.include('bundled');
  });

  it('prefers a freshly generated report over the bundled artifact', async () => {
    fs.outputFileSync(`${fixturePath}/coverage/underpost/index.html`, '<!doctype html><title>fresh</title>');
    fs.outputFileSync(
      `${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/engine/index.html`,
      '<!doctype html><title>bundled</title>',
    );

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8')).to.include('fresh');
  });

  // Regression: the build used to shell out to `npm test` when no report was present. Inside a
  // pod that spent minutes of the build phase on a test runner, and the suite's expected
  // non-zero exits latched `container-status=error`, failing a healthy rollout.
  it('never runs a test runner to produce a missing report', async () => {
    fs.outputJsonSync(`${fixturePath}/package.json`, {
      scripts: { coverage: 'vitest run --coverage', test: 'vitest run' },
    });
    const exec = vi.spyOn(shell, 'exec');

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'underpost:unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(exec.mock.calls.length).to.equal(0);
    expect(fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8')).to.include(
      'Coverage report unavailable',
    );
  });

  it('publishes nothing for a deploy that declares no coverage report', async () => {
    await buildCoverage({ docs: {}, docsDestination: `${fixturePath}/out/` });

    expect(fs.existsSync(`${fixturePath}/out`)).to.equal(false);
  });
});

describe('docs build', () => {
  let fixturePath;
  let cwd;

  const PACKAGE_DATA = { version: 'v1.2.3' };
  const HOST = 'docs.fixture.test';

  // The default config, the swagger-autogen patch target and every output path resolve
  // against the source tree root, so the fixture stands in for it.
  const stageTypedocConfig = (config = {}) => {
    fs.outputFileSync(`${fixturePath}/tsconfig.docs.json`, '{}');
    fs.outputJsonSync(`${fixturePath}/typedoc.json`, { tsconfig: './tsconfig.docs.json', name: 'Base', ...config });
  };

  const readTmpConfig = () => {
    let tmpConfig;
    vi.spyOn(shell, 'exec').mockImplementation(() => {
      tmpConfig = JSON.parse(fs.readFileSync('.typedoc.tmp.json', 'utf8'));
      return { code: 0, stdout: '', stderr: '' };
    });
    return () => tmpConfig;
  };

  // A router the instance serves; only an annotated one describes itself to the generator.
  const stageRouter = (api, { annotated = true } = {}) =>
    fs.outputFileSync(`${fixturePath}/src/api/${api}/${api}.router.js`, annotated ? '// #swagger.auto = false' : '');

  const runBuildDocs = async (overrides = {}) =>
    buildDocs({
      host: HOST,
      path: '/',
      port: 4000,
      metadata: { title: 'Fixture API', description: 'fixture docs' },
      apis: ['user', 'object-layer', 'unknown-api'],
      packageData: PACKAGE_DATA,
      docs: {},
      ...overrides,
    });

  const spec = () => fs.readJsonSync(`./public/${HOST}/swagger-output.json`);

  beforeEach(() => {
    generated.length = 0;
    fixturePath = fs.mkdtempSync('/tmp/engine-docs-');
    fs.outputFileSync(`${fixturePath}/node_modules/swagger-autogen/src/swagger-tags.js`, '');
    cwd = process.cwd();
    process.chdir(fixturePath);
    staged.parts = {};
    stageRouter('user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(cwd);
    fs.removeSync(fixturePath);
  });

  it('renders the typedoc runtime config without mutating the default config on disk', async () => {
    stageTypedocConfig({ entryPoints: ['./src'] });
    const baseConfig = fs.readJsonSync(`${fixturePath}/typedoc.json`);
    fs.outputFileSync(`${fixturePath}/references/reference-a.md`, '# a');
    const tmpConfig = readTmpConfig();

    await runBuildDocs({ docs: { references: ['./references'] } });

    expect(tmpConfig().name).to.equal('Fixture API');
    expect(tmpConfig().out).to.equal(`./public/${HOST}/docs/engine/1.2.3/`);
    expect(tmpConfig().favicon).to.equal(`./public/${HOST}/favicon.ico`);
    expect(tmpConfig().tsconfig.startsWith('/')).to.equal(true);
    expect(tmpConfig().projectDocuments).to.deep.equal(['./references/reference-a.md']);
    expect(fs.readJsonSync(`${fixturePath}/typedoc.json`)).to.deep.equal(baseConfig);
    expect(fs.existsSync('.typedoc.tmp.json')).to.equal(false);
  });

  it('overrides the default config with the client typedoc block', async () => {
    stageTypedocConfig({ entryPoints: ['./src'], exclude: ['**/node_modules/**'] });
    const tmpConfig = readTmpConfig();

    await runBuildDocs({
      metadata: {},
      docs: { typedoc: { name: 'Product', entryPoints: ['./src/api'] } },
    });

    expect(tmpConfig().name).to.equal('Product');
    expect(tmpConfig().entryPoints).to.deep.equal(['./src/api']);
    expect(tmpConfig().exclude).to.deep.equal(['**/node_modules/**']);
  });

  it('keeps the base name and drops the documents key when nothing resolves', async () => {
    stageTypedocConfig();
    const tmpConfig = readTmpConfig();

    await runBuildDocs({ metadata: {}, docs: { references: [] } });

    expect(tmpConfig().name).to.equal('Base');
    expect(tmpConfig()).not.to.have.property('projectDocuments');
  });

  it('skips the typedoc build when the tree carries no default config', async () => {
    const exec = vi.spyOn(shell, 'exec');
    await runBuildDocs();
    expect(exec.mock.calls.length).to.equal(0);
  });

  it('documents the served modules whose router describes itself, one run each', async () => {
    const exec = vi.spyOn(shell, 'exec').mockReturnValue({ code: 0, stdout: '', stderr: '' });
    stageRouter('object-layer');
    stageRouter('plain', { annotated: false });
    await runBuildDocs({ apis: ['user', 'object-layer', 'plain', 'unknown-api'] });

    expect(exec.mock.calls.length).to.equal(0);
    expect(generated.map(({ routes }) => routes)).to.deep.equal([
      ['./src/api/user/user.router.js'],
      ['./src/api/object-layer/object-layer.router.js'],
    ]);
    expect(generated.map(({ outputFile }) => outputFile)).to.deep.equal([
      '.swagger.user.tmp.json',
      '.swagger.object-layer.tmp.json',
    ]);
    const [{ options, doc }] = generated;
    expect(options).to.deep.equal({ openapi: '3.0.0' });
    expect(doc.info).to.deep.equal({ version: 'v1.2.3', title: 'Fixture API', description: 'fixture docs' });
    expect(doc.tags.map(({ name }) => name)).to.deep.equal(['user', 'object-layer']);
    expect(doc.components.securitySchemes.bearerAuth).to.deep.equal({ type: 'http', scheme: 'bearer' });
    expect(fs.existsSync('.swagger.user.tmp.json')).to.equal(false);
  });

  it('documents the modules the client declares, out of the ones the instance serves', async () => {
    stageRouter('item-ledger', { annotated: false });
    stageRouter('object-layer');
    await runBuildDocs({
      apis: ['user', 'item-ledger', 'object-layer'],
      docs: { api: ['item-ledger', 'object-layer', 'absent'] },
    });

    expect(generated.map(({ routes }) => routes)).to.deep.equal([
      ['./src/api/item-ledger/item-ledger.router.js'],
      ['./src/api/object-layer/object-layer.router.js'],
    ]);
    expect(spec().tags.map(({ name }) => name)).to.deep.equal(['item-ledger', 'object-layer']);
  });

  // The generator reads a router on its own: a route comes out relative to the router unless an
  // annotation names its full path, and it also emits a handler's parameter names as routes.
  it('mounts each route under its module, tags it, and drops the parser artifacts', async () => {
    stageRouter('item-ledger', { annotated: false });
    staged.parts['item-ledger'] = {
      paths: { '/': { get: {} }, '/{id}': { get: {}, delete: {} }, req: { get: {} } },
    };
    staged.parts.user = { paths: { '/user/{id}': { get: { tags: ['user'] } } } };
    await runBuildDocs({ apis: ['user', 'item-ledger'], docs: { api: ['item-ledger', 'user'] } });

    expect(spec().paths).to.deep.equal({
      '/item-ledger': { get: { tags: ['item-ledger'] } },
      '/item-ledger/{id}': { get: { tags: ['item-ledger'] }, delete: { tags: ['item-ledger'] } },
      '/user/{id}': { get: { tags: ['user'] } },
    });
  });

  it('carries only the schemas the documented operations reference', async () => {
    stageRouter('object-layer');
    staged.parts['object-layer'] = {
      paths: {
        '/object-layer/{id}': {
          get: { tags: ['object-layer'], responses: { 200: { $ref: '#/components/schemas/objectLayerResponse' } } },
        },
      },
    };
    await runBuildDocs({ apis: ['object-layer'], docs: { api: ['object-layer'] } });

    expect(Object.keys(spec().components.schemas)).to.deep.equal(['objectLayerResponse']);
    expect(spec().components.securitySchemes.bearerAuth).to.deep.equal({ type: 'http', scheme: 'bearer' });
  });

  it('falls back to a generic title and empty description without metadata', async () => {
    await runBuildDocs({ metadata: {} });
    expect(generated[0].doc.info.title).to.equal('REST API');
    expect(generated[0].doc.info.description).to.equal('');
  });

  it('points the server at localhost in development and at the host in production', async () => {
    const previousEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      await runBuildDocs({ path: '/store' });
      expect(generated[0].doc.servers[0].url).to.equal('http://localhost:4000/store/api/v1');
      expect(fs.existsSync(`./public/${HOST}/store/swagger-output.json`)).to.equal(true);

      generated.length = 0;
      process.env.NODE_ENV = 'production';
      await runBuildDocs();
      expect(generated[0].doc.servers[0].url).to.equal(`https://${HOST}/api/v1`);
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });

  it('points the server at the API runtime when the client and the API are split', async () => {
    const previousEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      await runBuildDocs({ apiBaseHost: 'localhost:4017', apiBaseProxyPath: '/' });
      expect(generated[0].doc.servers[0].url).to.equal('http://localhost:4017/api/v1');

      generated.length = 0;
      process.env.NODE_ENV = 'production';
      await runBuildDocs({ path: '/store', apiBaseHost: 'api.fixture.test', apiBaseProxyPath: '/store' });
      expect(generated[0].doc.servers[0].url).to.equal('https://api.fixture.test/store/api/v1');
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });

  // swagger-autogen has no OAS-3 requestBody support, so the generated document
  // is patched afterwards. The patch has to survive an operation the generator
  // did not emit, and has to strip the OAS-2 `in: body` parameter it did.
  it('injects the request bodies into the generated document', async () => {
    staged.parts.user = {
      paths: {
        '/user': {
          post: {
            parameters: [
              { in: 'body', name: 'obj' },
              { in: 'query', name: 'q' },
            ],
          },
        },
        '/user/{id}': { get: {} },
      },
    };
    await runBuildDocs();

    const patched = spec();
    expect(patched.paths['/user'].post.requestBody.content['application/json'].schema.$ref).to.equal(
      '#/components/schemas/userRequest',
    );
    expect(patched.paths['/user'].post.parameters).to.deep.equal([{ in: 'query', name: 'q' }]);
    expect(patched.paths['/user/{id}'].get).not.to.have.property('requestBody');
  });

  // Regression: the spec was generated on a timer the build never awaited, so a bundle zipped
  // right after the build shipped without it and the pod restoring it served no api-docs.
  it('has written the spec by the time the build returns', async () => {
    staged.parts.user = { paths: {} };
    await runBuildDocs();
    expect(fs.existsSync(`./public/${HOST}/swagger-output.json`)).to.equal(true);
  });
});

describe('swagger UI options', () => {
  it('renders the dark mode toggle css and script from the SSR component', async () => {
    const { customCss, customJsStr } = await buildSwaggerUiOptions();
    expect(customCss).to.be.a('string').and.not.equal('');
    expect(customJsStr).to.be.a('string').and.not.equal('');
  });
});
