import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import nodePath from 'path';
import { minify } from 'html-minifier-terser';
import Underpost from '../../../src/index.js';
import {
  buildManifestFactory,
  buildManifestHead,
  buildManifestHref,
  buildManifestPrelude,
  serviceWorkerManifest,
  writeBuildManifest,
} from '../../../src/client-builder/build-manifest.js';
import {
  BUILD_MANIFEST_ELEMENT_ID,
  BUILD_MANIFEST_FILE,
  BUILD_MANIFEST_REL,
  BUILD_MANIFEST_SCHEMA,
  assertBuildManifest,
} from '../../../src/client/components/core/BuildManifest.js';
import { ssrFactory } from '../../../src/client-builder/ssr.js';

const INLINE = new RegExp(`<script id="${BUILD_MANIFEST_ELEMENT_ID}" type="application/json">([\\s\\S]*?)</script>`);
const inlineTextOf = (html) => html.match(INLINE)[1];

const REPOSITORY = {
  owner: 'underpostnet',
  organization: 'underpost',
  name: 'engine',
  template: 'pwa-microservices-template',
  packageSuffix: '-ghpkg',
  deployPackage: 'engine-ghpkg-cyberia',
};

const manifestOf = (values = {}) =>
  buildManifestFactory({
    application: 'portal',
    basePath: '/test',
    apiBaseHost: 'api.test',
    documentation: { repository: REPOSITORY, coverage: [{ id: 'engine', label: 'Engine', suite: 'underpost' }] },
    ...values,
  });

const withTemporaryRoot = (run) => {
  const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'build-manifest-'));
  try {
    return run(root);
  } finally {
    fs.removeSync(root);
  }
};

describe('the build manifest producer', () => {
  it('separates the schema version from the build version, and identifies the build', () => {
    const manifest = manifestOf();
    expect(manifest.schema).toBe(BUILD_MANIFEST_SCHEMA);
    expect(manifest.application).toBe('portal');
    expect(manifest.version).toBe(Underpost.version);
    expect(manifest.build).toEqual({ id: expect.stringMatching(/^[0-9a-f]{16}$/), mode: 'production' });
    expect(manifest.runtime).toEqual({ basePath: '/test', apiBasePath: 'api/v1', apiBaseHost: 'api.test' });
    expect(manifestOf({ development: true }).build.mode).toBe('development');
  });

  it('gives the same id to the same inputs and another id to other inputs', () => {
    expect(manifestOf().build.id).toBe(manifestOf().build.id);
    expect(manifestOf({ apiBaseHost: 'api.other.test' }).build.id).not.toBe(manifestOf().build.id);
    expect(manifestOf({ development: true }).build.id).not.toBe(manifestOf().build.id);
  });

  it('sets each field on purpose and copies no input as a whole', () => {
    const manifest = manifestOf({
      token: 'secret',
      apiHosts: {},
      documentation: {
        repository: { ...REPOSITORY, password: 'secret' },
        coverage: [{ id: 'engine', label: 'Engine', path: '/private/report' }],
      },
    });
    expect(JSON.stringify(manifest)).not.toContain('secret');
    expect(JSON.stringify(manifest)).not.toContain('/private/report');
    expect(manifest.runtime).not.toHaveProperty('apiHosts');
    expect(manifest.documentation).toEqual({ repository: REPOSITORY, coverage: [{ id: 'engine', label: 'Engine' }] });
    expect(manifestOf({ documentation: undefined })).not.toHaveProperty('documentation');
  });

  it('returns a frozen manifest that the client contract accepts, and leaves its inputs unfrozen', () => {
    const apiHosts = { 'object-layer': 'objectlayer.org' };
    const manifest = manifestOf({ apiHosts });
    expect(Object.isFrozen(manifest.runtime.apiHosts)).toBe(true);
    expect(Object.isFrozen(apiHosts)).toBe(false);
    expect(assertBuildManifest(structuredClone(manifest), 'test')).toEqual(manifest);
  });

  it('configures the service worker from the SSR views of the application', () => {
    const views = [
      { path: '/offline', offlineDefault: true },
      { path: '/maintenance', maintenanceDefault: true },
      { path: '/404' },
    ];
    expect(serviceWorkerManifest({ basePath: '/', views })).toEqual({
      cachePrefix: 'engine-core-root',
      precache: ['/offline/index.html', '/maintenance/index.html'],
      offline: '/offline/index.html',
      maintenance: '/maintenance/index.html',
    });
    expect(serviceWorkerManifest({ basePath: '/test', views: [] })).toEqual({
      cachePrefix: 'engine-core-_test',
      precache: [],
      offline: '/test/offline/index.html',
      maintenance: '/test/maintenance/index.html',
    });
    const serviceWorker = serviceWorkerManifest({ basePath: '/test', views });
    expect(manifestOf({ serviceWorker }).serviceWorker).toEqual(serviceWorker);
  });
});

describe('the copies of the build manifest', () => {
  it('links the file under its relation, from the base path of the application, before the inline copy', () => {
    expect(BUILD_MANIFEST_REL).toBe('https://underpost.net/rel/build-manifest');
    expect(buildManifestHref('/')).toBe('/underpost.manifest');
    expect(buildManifestHref('/test')).toBe('/test/underpost.manifest');
    const head = buildManifestHead({ manifest: manifestOf() });
    expect(
      head.startsWith(
        '<link rel="https://underpost.net/rel/build-manifest" href="/test/underpost.manifest" type="application/json" />' +
          `<script id="${BUILD_MANIFEST_ELEMENT_ID}" type="application/json">`,
      ),
    ).toBe(true);
    expect(head).not.toContain('rel="manifest"');
    expect(JSON.parse(inlineTextOf(head))).toEqual(manifestOf());
  });

  it('cannot end the data block that inlines it', () => {
    const manifest = manifestOf({ siteName: '</script><script>alert(1)</script>' });
    const head = buildManifestHead({ manifest });
    expect(head.match(/<\/script>/g)).toHaveLength(1);
    expect(JSON.parse(inlineTextOf(head))).toEqual(manifest);
  });

  it('writes the file, the inline snapshot and the worker prelude with the same bytes', () =>
    withTemporaryRoot((root) => {
      const manifest = manifestOf({ siteName: 'A & B <C>' });
      const file = fs.readFileSync(writeBuildManifest(root, manifest), 'utf8');
      expect(file).toBe(inlineTextOf(buildManifestHead({ manifest })));
      expect(buildManifestPrelude(manifest)).toBe(`self.buildManifest = ${file};`);
      const worker = {};
      new Function('self', buildManifestPrelude(manifest))(worker);
      expect(worker.buildManifest).toEqual(manifest);
    }));

  it('heads every SSR document, and keeps its bytes through the production minifier', async () => {
    const Render = await ssrFactory();
    const manifest = manifestOf();
    const html = Render({
      title: 'Portal',
      ssrPath: '/test/',
      ssrHeadComponents: '',
      ssrBodyComponents: '',
      buildManifestHead: buildManifestHead({ manifest }),
    });
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain(`rel="${BUILD_MANIFEST_REL}" href="/test/${BUILD_MANIFEST_FILE}"`);
    const minified = await minify(html, {
      minifyCSS: true,
      minifyJS: true,
      collapseBooleanAttributes: true,
      collapseInlineTagWhitespace: true,
      collapseWhitespace: true,
    });
    expect(inlineTextOf(minified)).toBe(inlineTextOf(html));
  });

  it('is read by the static views under the same element id, once', () => {
    const view = fs.readFileSync('./src/client/ssr/views/CyberiaServerMetrics.js', 'utf8');
    expect(view.match(new RegExp(`s\\('#${BUILD_MANIFEST_ELEMENT_ID}'\\)`, 'g'))).toHaveLength(1);
  });

  it('is the only configuration of the service worker', () => {
    const worker = fs.readFileSync('./src/client/sw/core.sw.js', 'utf8');
    expect(worker).toContain('= self.buildManifest;');
    expect(worker).not.toContain('renderPayload');
  });

  it('has no renderPayload left in the source tree', () => {
    const offenders = fs
      .readdirSync('./src', { recursive: true })
      .filter((file) => /\.(js|md|json)$/.test(file))
      .filter((file) => fs.readFileSync(`./src/${file}`, 'utf8').includes('renderPayload'));
    expect(offenders).toEqual([]);
  });
});

const PUBLIC_TREES = './src/client/public';
const RELATION_PAGE = `${new URL(BUILD_MANIFEST_REL).pathname.slice(1)}/index.html`;
const SPECIFICATION = `${PUBLIC_TREES}/underpost/${RELATION_PAGE}`;
const specification = () => fs.readFileSync(SPECIFICATION, 'utf8');
/** The text an HTML page shows for its escaped markup. */
const shown = (html) =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

// A sliced tree ships no underpost client.
describe.skipIf(!fs.existsSync(SPECIFICATION))('the relation specification', () => {
  it('is a page of the underpost client alone, at the path of the relation URI', () => {
    const trees = fs
      .readdirSync(PUBLIC_TREES)
      .filter((tree) => fs.existsSync(`${PUBLIC_TREES}/${tree}/${RELATION_PAGE}`));
    expect(trees).toEqual(['underpost']);
  });

  it('names the relation URI as its canonical location', () => {
    expect(specification()).toContain(`<link rel="canonical" href="${BUILD_MANIFEST_REL}" />`);
    expect(specification()).toContain('<title>Underpost Build Manifest</title>');
  });

  it('specifies the discovery link the build emits, and its target resource', () => {
    const text = shown(specification());
    expect(text).toContain(`rel="${BUILD_MANIFEST_REL}"`);
    expect(text).toContain(`href="${buildManifestHref('/')}"`);
    expect(text).toContain(`id="${BUILD_MANIFEST_ELEMENT_ID}"`);
    expect(text).toContain(buildManifestHref('/test'));
  });

  it('shows an example manifest of the schema this client reads', () => {
    const example = JSON.parse(
      shown(specification().match(/<pre id="example-manifest"><code>([\s\S]*?)<\/code><\/pre>/)[1]),
    );
    expect(assertBuildManifest(example, 'the example')).toEqual(example);
    expect(example.schema).toBe(BUILD_MANIFEST_SCHEMA);
  });
});

describe('the client bootstrap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  /** A document that inlines `inline` and links `linked`, and a fetch that serves `linked` with `status`. */
  const bootstrap = async ({ inline, linked, status = 200, unreachable = false }) => {
    const reads = { inline: 0 };
    vi.stubGlobal('document', {
      getElementById: (id) =>
        id === BUILD_MANIFEST_ELEMENT_ID && inline !== undefined
          ? {
              get textContent() {
                reads.inline++;
                return typeof inline === 'string' ? inline : JSON.stringify(inline);
              },
            }
          : null,
      querySelector: (selector) =>
        linked !== undefined && selector === `link[rel="${BUILD_MANIFEST_REL}"]`
          ? { href: '/test/underpost.manifest' }
          : null,
    });
    const fetch = vi.fn(async () => {
      if (unreachable) throw new TypeError('Failed to fetch');
      return { ok: status < 400, status, json: async () => linked };
    });
    vi.stubGlobal('fetch', fetch);
    return { fetch, reads, ...(await import('../../../src/client/components/core/BuildManifest.js')) };
  };

  it('reads the inline snapshot first, once, with no request, as one frozen object', async () => {
    const { fetch, reads, buildManifest, loadBuildManifest, developmentBuild } = await bootstrap({
      inline: manifestOf({ siteName: 'inline' }),
      linked: manifestOf({ siteName: 'linked' }),
    });
    const manifest = buildManifest();
    expect(manifest.runtime.siteName).toBe('inline');
    expect(await loadBuildManifest()).toBe(manifest);
    expect(buildManifest()).toBe(manifest);
    expect(developmentBuild()).toBe(false);
    expect(Object.isFrozen(manifest.runtime)).toBe(true);
    expect(reads.inline).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the linked file when the document has no inline snapshot', async () => {
    const { fetch, buildManifest, loadBuildManifest, developmentBuild } = await bootstrap({
      linked: manifestOf({ development: true }),
    });
    expect(() => buildManifest()).toThrow('The build manifest is not loaded');
    expect(developmentBuild()).toBe(false);
    const [first, second] = await Promise.all([loadBuildManifest(), loadBuildManifest()]);
    expect(first).toBe(second);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/test/underpost.manifest');
    expect(buildManifest()).toBe(first);
    expect(developmentBuild()).toBe(true);
  });

  it.each([
    ['no manifest at all', {}, 'The document neither inlines nor links a build manifest'],
    ['a linked file that fails', { linked: manifestOf(), status: 503 }, 'answered 503'],
    ['a linked file out of reach', { linked: manifestOf(), unreachable: true }, 'is unreachable: Failed to fetch'],
    ['an inline snapshot that is not JSON', { inline: '{"schema":' }, 'is not JSON'],
    ['an incompatible schema', { inline: { ...manifestOf(), schema: 2 } }, 'has schema 2, this client reads 1'],
    ['a linked manifest of no schema', { linked: { version: 'v1' } }, 'has schema undefined'],
    [
      'a missing required field',
      { inline: { ...manifestOf(), runtime: {} } },
      'lacks runtime.basePath, runtime.apiBasePath',
    ],
  ])('stops the bootstrap with an explicit error for %s', async (_, document, message) => {
    const { loadBuildManifest } = await bootstrap(document);
    await expect(loadBuildManifest()).rejects.toThrow(message);
  });
});
