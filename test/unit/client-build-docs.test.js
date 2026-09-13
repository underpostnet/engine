'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import shell from 'shelljs';
import { COVERAGE_BUNDLE_DIRECTORY } from '../../src/server/build/coverage.js';
import { buildCoverage, buildDocs, buildSwaggerUiOptions } from '../../src/client-builder/client-build-docs.js';

// swagger-autogen is a code generator that walks the real router files and
// writes into ./public. The doc it is handed is what this module is responsible
// for, so the generator itself is replaced and its arguments are asserted; it
// writes the document a test stages as its output, so the post-process has one.
const generated = vi.hoisted(() => []);
const staged = vi.hoisted(() => ({ swaggerJson: null }));
vi.mock('swagger-autogen', async () => {
  const fs = (await import('fs-extra')).default;
  return {
    default: (options) => async (outputFile, routes, doc) => {
      generated.push({ options, outputFile, routes, doc });
      if (staged.swaggerJson) fs.outputJsonSync(outputFile, staged.swaggerJson);
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
      docs: { coverage: [{ id: 'engine', suite: 'unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.existsSync(`${fixturePath}/out/coverage/legacy`)).to.equal(false);
    expect(fs.existsSync(`${fixturePath}/out/coverage/engine/index.html`)).to.equal(true);
  });

  it("publishes the run a report names, never another selection's", async () => {
    fs.outputFileSync(`${fixturePath}/coverage/unit-infra-app-cyberia/index.html`, '<!doctype html><title>all</title>');

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'unit,infra,app' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    const page = fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8');
    expect(page).to.include('Coverage report unavailable');
    expect(page).to.include('node bin test unit,infra,app');
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
      docs: { coverage: [{ id: 'engine', suite: 'unit' }] },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/engine/index.html`, 'utf8')).to.include('bundled');
  });

  it('prefers a freshly generated report over the bundled artifact', async () => {
    fs.outputFileSync(`${fixturePath}/coverage/unit/index.html`, '<!doctype html><title>fresh</title>');
    fs.outputFileSync(
      `${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/engine/index.html`,
      '<!doctype html><title>bundled</title>',
    );

    await buildCoverage({
      docs: { coverage: [{ id: 'engine', suite: 'unit' }] },
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
      docs: { coverage: [{ id: 'engine', suite: 'unit' }] },
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
  let publicRoot;

  const PACKAGE_DATA = { version: 'v1.2.3' };
  const HOST = 'docs.fixture.test';

  const runBuildDocs = async (overrides = {}) =>
    buildDocs({
      host: HOST,
      path: '/',
      port: 4000,
      metadata: { title: 'Fixture API', description: 'fixture docs' },
      apis: ['user', 'object-layer', 'unknown-api'],
      publicClientId: 'fixture',
      rootClientPath: `${fixturePath}/client`,
      packageData: PACKAGE_DATA,
      docs: { jsJsonPath: `${fixturePath}/typedoc.json` },
      ...overrides,
    });

  beforeEach(() => {
    generated.length = 0;
    fixturePath = fs.mkdtempSync('/tmp/engine-docs-');
    publicRoot = `./public/${HOST}`;
    if (fs.existsSync(publicRoot)) throw new Error(`Refusing to write fixtures into an existing site: ${publicRoot}`);
    staged.swaggerJson = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(fixturePath);
    fs.removeSync(publicRoot);
    fs.removeSync('.typedoc.tmp.json');
  });

  it('renders the typedoc runtime config without mutating the base config on disk', async () => {
    const baseConfig = { tsconfig: './tsconfig.docs.json', name: 'Base', entryPoints: ['./src'] };
    fs.outputJsonSync(`${fixturePath}/typedoc.json`, baseConfig);
    fs.outputFileSync(`${fixturePath}/reference-a.md`, '# a');
    let tmpConfig;
    vi.spyOn(shell, 'exec').mockImplementation(() => {
      tmpConfig = JSON.parse(fs.readFileSync('.typedoc.tmp.json', 'utf8'));
      return { code: 0, stdout: '', stderr: '' };
    });

    await runBuildDocs({
      docs: {
        jsJsonPath: `${fixturePath}/typedoc.json`,
        references: [`${fixturePath}/reference-a.md`, `${fixturePath}/missing.md`],
      },
    });

    expect(tmpConfig.name).to.equal('Fixture API');
    expect(tmpConfig.out).to.equal(`./public/${HOST}/docs/engine/1.2.3/`);
    expect(tmpConfig.favicon).to.equal(`./public/${HOST}/favicon.ico`);
    expect(tmpConfig.tsconfig.startsWith('/')).to.equal(true);
    expect(tmpConfig.projectDocuments).to.deep.equal([`${fixturePath}/reference-a.md`]);
    expect(fs.readJsonSync(`${fixturePath}/typedoc.json`)).to.deep.equal(baseConfig);
    expect(fs.existsSync('.typedoc.tmp.json')).to.equal(false);
  });

  it('keeps the base name and drops the documents key when nothing resolves', async () => {
    fs.outputJsonSync(`${fixturePath}/typedoc.json`, { tsconfig: './tsconfig.docs.json', name: 'Base' });
    let tmpConfig;
    vi.spyOn(shell, 'exec').mockImplementation(() => {
      tmpConfig = JSON.parse(fs.readFileSync('.typedoc.tmp.json', 'utf8'));
      return { code: 0, stdout: '', stderr: '' };
    });

    await runBuildDocs({ metadata: {}, docs: { jsJsonPath: `${fixturePath}/typedoc.json`, references: [] } });

    expect(tmpConfig.name).to.equal('Base');
    expect(tmpConfig).not.to.have.property('projectDocuments');
  });

  it('skips the typedoc build when the deploy declares no config', async () => {
    const exec = vi.spyOn(shell, 'exec');
    await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
    expect(exec.mock.calls.length).to.equal(0);
  });

  it('documents only the routers it has schemas for, at the deploy version', async () => {
    const exec = vi.spyOn(shell, 'exec').mockReturnValue({ code: 0, stdout: '', stderr: '' });
    await runBuildDocs();

    expect(exec.mock.calls.length).to.equal(0);
    expect(generated.length).to.equal(1);
    const [{ options, outputFile, routes, doc }] = generated;
    expect(options).to.deep.equal({ openapi: '3.0.0' });
    expect(outputFile).to.equal(`./public/${HOST}/swagger-output.json`);
    expect(routes).to.deep.equal(['./src/api/user/user.router.js', './src/api/object-layer/object-layer.router.js']);
    expect(doc.info).to.deep.equal({ version: 'v1.2.3', title: 'Fixture API', description: 'fixture docs' });
    expect(doc.components.securitySchemes.bearerAuth).to.deep.equal({ type: 'http', scheme: 'bearer' });
  });

  it('falls back to a generic title and empty description without metadata', async () => {
    await runBuildDocs({ metadata: {}, docs: { jsJsonPath: `${fixturePath}/absent.json` } });
    expect(generated[0].doc.info.title).to.equal('REST API');
    expect(generated[0].doc.info.description).to.equal('');
  });

  it('points the server at localhost in development and at the host in production', async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousApi = process.env.BASE_API;
    process.env.BASE_API = 'api';
    try {
      process.env.NODE_ENV = 'development';
      await runBuildDocs({ path: '/store', docs: { jsJsonPath: `${fixturePath}/absent.json` } });
      expect(generated[0].doc.servers[0].url).to.equal('http://localhost:4000/store/api');
      expect(generated[0].outputFile).to.equal(`./public/${HOST}/store/swagger-output.json`);

      generated.length = 0;
      process.env.NODE_ENV = 'production';
      await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
      expect(generated[0].doc.servers[0].url).to.equal(`https://${HOST}/api`);
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (previousApi === undefined) delete process.env.BASE_API;
      else process.env.BASE_API = previousApi;
    }
  });

  it('points the server at the API runtime when the client and the API are split', async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousApi = process.env.BASE_API;
    process.env.BASE_API = 'api';
    try {
      process.env.NODE_ENV = 'development';
      await runBuildDocs({
        apiBaseHost: 'localhost:4017',
        apiBaseProxyPath: '/',
        docs: { jsJsonPath: `${fixturePath}/absent.json` },
      });
      expect(generated[0].doc.servers[0].url).to.equal('http://localhost:4017/api');

      generated.length = 0;
      process.env.NODE_ENV = 'production';
      await runBuildDocs({
        path: '/store',
        apiBaseHost: 'api.fixture.test',
        apiBaseProxyPath: '/store',
        docs: { jsJsonPath: `${fixturePath}/absent.json` },
      });
      expect(generated[0].doc.servers[0].url).to.equal('https://api.fixture.test/store/api');
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (previousApi === undefined) delete process.env.BASE_API;
      else process.env.BASE_API = previousApi;
    }
  });

  // swagger-autogen has no OAS-3 requestBody support, so the generated document
  // is patched afterwards. The patch has to survive an operation the generator
  // did not emit, and has to strip the OAS-2 `in: body` parameter it did.
  it('injects the request bodies into the generated document', async () => {
    const outputFile = `./public/${HOST}/swagger-output.json`;
    staged.swaggerJson = {
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
    await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });

    const patched = fs.readJsonSync(outputFile);
    expect(patched.paths['/user'].post.requestBody.content['application/json'].schema.$ref).to.equal(
      '#/components/schemas/userRequest',
    );
    expect(patched.paths['/user'].post.parameters).to.deep.equal([{ in: 'query', name: 'q' }]);
    expect(patched.paths['/user/{id}'].get).not.to.have.property('requestBody');
  });

  it('leaves the generated document alone when no operation matches', async () => {
    const outputFile = `./public/${HOST}/swagger-output.json`;
    staged.swaggerJson = { paths: { '/health': { get: {} } } };
    await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
    expect(fs.readJsonSync(outputFile)).to.deep.equal({ paths: { '/health': { get: {} } } });
  });

  // Regression: the spec was generated on a timer the build never awaited, so a bundle zipped
  // right after the build shipped without it and the pod restoring it served no api-docs.
  it('has written the spec by the time the build returns', async () => {
    staged.swaggerJson = { paths: {} };
    await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
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
