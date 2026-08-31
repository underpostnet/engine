'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import shell from 'shelljs';
import { COVERAGE_BUNDLE_DIRECTORY } from '../../src/server/build/coverage.js';
import { buildCoverage, buildDocs, buildSwaggerUiOptions } from '../../src/client-builder/client-build-docs.js';

// swagger-autogen is a code generator that walks the real router files and
// writes into ./public. The doc it is handed is what this module is responsible
// for, so the generator itself is replaced and its arguments are asserted.
const generated = vi.hoisted(() => []);
vi.mock('swagger-autogen', () => ({
  default: (options) => async (outputFile, routes, doc) => {
    generated.push({ options, outputFile, routes, doc });
  },
}));

describe('client coverage build', () => {
  let fixturePath;

  afterEach(() => {
    if (fixturePath) fs.removeSync(fixturePath);
    fixturePath = undefined;
    vi.restoreAllMocks();
  });

  it('publishes the Vitest lcov HTML report at the coverage route root', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    const reportPath = `${fixturePath}/coverage/lcov-report`;
    const docsDestination = `${fixturePath}/public/docs/`;
    fs.outputFileSync(`${reportPath}/index.html`, '<!doctype html><title>Coverage</title>');
    fs.outputFileSync(`${reportPath}/base.css`, 'body {}');

    await buildCoverage({ docs: { coveragePath: fixturePath }, docsDestination });

    expect(fs.existsSync(`${docsDestination}coverage/index.html`)).to.equal(true);
    expect(fs.existsSync(`${docsDestination}coverage/base.css`)).to.equal(true);
    expect(fs.existsSync(`${docsDestination}coverage/lcov-report`)).to.equal(false);
  });

  it('prefers an html report directory over the lcov one', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    fs.outputFileSync(`${fixturePath}/coverage/html/index.html`, '<!doctype html><title>html</title>');
    fs.outputFileSync(`${fixturePath}/coverage/lcov-report/index.html`, '<!doctype html><title>lcov</title>');

    await buildCoverage({ docs: { coveragePath: fixturePath }, docsDestination: `${fixturePath}/out/` });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/index.html`, 'utf8')).to.include('html');
  });

  it('publishes a flat report directory that carries the index itself', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    fs.outputFileSync(`${fixturePath}/coverage/index.html`, '<!doctype html><title>flat</title>');

    await buildCoverage({
      docs: { coveragePath: fixturePath, coverageOutputDir: 'report' },
      docsDestination: `${fixturePath}/out/`,
    });

    expect(fs.existsSync(`${fixturePath}/out/report/index.html`)).to.equal(true);
  });

  it('publishes the unavailable page for a coverage directory with no HTML index', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    fs.outputFileSync(`${fixturePath}/coverage/lcov.info`, 'TN:\n');

    await buildCoverage({ docs: { coveragePath: fixturePath }, docsDestination: `${fixturePath}/out/` });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/index.html`, 'utf8')).to.include('Coverage report unavailable');
  });

  it('publishes the report an assembled deploy artifact bundled', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    fs.outputFileSync(
      `${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/index.html`,
      '<!doctype html><title>bundled</title>',
    );

    await buildCoverage({ docs: { coveragePath: fixturePath }, docsDestination: `${fixturePath}/out/` });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/index.html`, 'utf8')).to.include('bundled');
  });

  it('prefers a freshly generated report over the bundled artifact', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    fs.outputFileSync(`${fixturePath}/coverage/lcov-report/index.html`, '<!doctype html><title>fresh</title>');
    fs.outputFileSync(
      `${fixturePath}/${COVERAGE_BUNDLE_DIRECTORY}/index.html`,
      '<!doctype html><title>bundled</title>',
    );

    await buildCoverage({ docs: { coveragePath: fixturePath }, docsDestination: `${fixturePath}/out/` });

    expect(fs.readFileSync(`${fixturePath}/out/coverage/index.html`, 'utf8')).to.include('fresh');
  });

  // Regression: the build used to shell out to `npm test` when no report was present. Inside a
  // pod that spent minutes of the build phase on a test runner, and the suite's expected
  // non-zero exits latched `container-status=error`, failing a healthy rollout.
  it('never runs a test runner to produce a missing report', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');
    fs.outputJsonSync(`${fixturePath}/package.json`, {
      scripts: { coverage: 'vitest run --coverage', test: 'vitest run' },
    });
    const exec = vi.spyOn(shell, 'exec');

    await buildCoverage({ docs: { coveragePath: fixturePath }, docsDestination: `${fixturePath}/out/` });

    expect(exec.mock.calls.length).to.equal(0);
    expect(fs.readFileSync(`${fixturePath}/out/coverage/index.html`, 'utf8')).to.include('Coverage report unavailable');
  });

  it('publishes nothing for a deploy that declares no coverage source', async () => {
    fixturePath = fs.mkdtempSync('/tmp/engine-coverage-');

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
      docs: { jsJsonPath: `${fixturePath}/typedoc.json`, coveragePath: `${fixturePath}/nothing-here` },
      ...overrides,
    });

  beforeEach(() => {
    generated.length = 0;
    fixturePath = fs.mkdtempSync('/tmp/engine-docs-');
    publicRoot = `./public/${HOST}`;
    if (fs.existsSync(publicRoot)) throw new Error(`Refusing to write fixtures into an existing site: ${publicRoot}`);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fs.removeSync(fixturePath);
    fs.removeSync(publicRoot);
    fs.removeSync('.typedoc.tmp.json');
  });

  const flushApiDocs = async () => {
    await vi.advanceTimersByTimeAsync(1);
  };

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
        coveragePath: `${fixturePath}/nothing-here`,
        references: [`${fixturePath}/reference-a.md`, `${fixturePath}/missing.md`],
      },
    });
    await flushApiDocs();

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
    await flushApiDocs();

    expect(tmpConfig.name).to.equal('Base');
    expect(tmpConfig).not.to.have.property('projectDocuments');
  });

  it('skips the typedoc build when the deploy declares no config', async () => {
    const exec = vi.spyOn(shell, 'exec');
    await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
    await flushApiDocs();
    expect(exec.mock.calls.length).to.equal(0);
  });

  it('documents only the routers it has schemas for, at the deploy version', async () => {
    const exec = vi.spyOn(shell, 'exec').mockReturnValue({ code: 0, stdout: '', stderr: '' });
    await runBuildDocs();
    await flushApiDocs();

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
    await flushApiDocs();
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
      await flushApiDocs();
      expect(generated[0].doc.servers[0].url).to.equal('http://localhost:4000/store/api');
      expect(generated[0].outputFile).to.equal(`./public/${HOST}/store/swagger-output.json`);

      generated.length = 0;
      process.env.NODE_ENV = 'production';
      await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
      await flushApiDocs();
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
      await flushApiDocs();
      expect(generated[0].doc.servers[0].url).to.equal('http://localhost:4017/api');

      generated.length = 0;
      process.env.NODE_ENV = 'production';
      await runBuildDocs({
        path: '/store',
        apiBaseHost: 'api.fixture.test',
        apiBaseProxyPath: '/store',
        docs: { jsJsonPath: `${fixturePath}/absent.json` },
      });
      await flushApiDocs();
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
    await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
    fs.outputJsonSync(outputFile, {
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
    });
    await flushApiDocs();

    const patched = fs.readJsonSync(outputFile);
    expect(patched.paths['/user'].post.requestBody.content['application/json'].schema.$ref).to.equal(
      '#/components/schemas/userRequest',
    );
    expect(patched.paths['/user'].post.parameters).to.deep.equal([{ in: 'query', name: 'q' }]);
    expect(patched.paths['/user/{id}'].get).not.to.have.property('requestBody');
  });

  it('leaves the generated document alone when no operation matches', async () => {
    const outputFile = `./public/${HOST}/swagger-output.json`;
    await runBuildDocs({ docs: { jsJsonPath: `${fixturePath}/absent.json` } });
    fs.outputJsonSync(outputFile, { paths: { '/health': { get: {} } } });
    await flushApiDocs();
    expect(fs.readJsonSync(outputFile)).to.deep.equal({ paths: { '/health': { get: {} } } });
  });
});

describe('swagger UI options', () => {
  it('renders the dark mode toggle css and script from the SSR component', async () => {
    const { customCss, customJsStr } = await buildSwaggerUiOptions();
    expect(customCss).to.be.a('string').and.not.equal('');
    expect(customJsStr).to.be.a('string').and.not.equal('');
  });
});
