import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPOSITORY_DEFAULTS } from '../../../src/server/storage/repository.js';
import { buildManifestFactory } from '../../../src/client-builder/build-manifest.js';
import { BUILD_MANIFEST_ELEMENT_ID } from '../../../src/client/components/core/BuildManifest.js';

// The browser modules the documentation menu imports; only its links are under test.
vi.mock('../../../src/client/components/core/Css.js', () => ({
  Css: {},
  darkTheme: true,
  simpleIconsRender: () => '',
  ThemeEvents: {},
  Themes: {},
}));
vi.mock('../../../src/client/components/core/Modal.js', () => ({
  Modal: { Data: {} },
  SUBMENU_SELECTION_QUERY_KEY: 'submenu',
  renderViewTitle: () => '',
}));
vi.mock('../../../src/client/components/core/Responsive.js', () => ({ Responsive: {} }));
vi.mock('../../../src/client/components/core/Router.js', () => ({
  listenQueryPathInstance: () => {},
  setQueryPath: () => {},
  closeModalRouteChangeEvent: () => {},
  getProxyPath: () => '/',
  getQueryParams: () => ({}),
}));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({ s: () => null, sIframe: () => null }));

const documented = buildManifestFactory({
  application: 'portal',
  documentation: {
    repository: { ...REPOSITORY_DEFAULTS, owner: 'documented-owner' },
    coverage: [{ id: 'engine', label: 'Engine' }],
  },
});

// Look-alike fields outside the documentation section, which the client must never read.
const LOOK_ALIKES = {
  repository: { ...REPOSITORY_DEFAULTS, owner: 'top-level-owner' },
  coverage: [{ id: 'top-level', label: 'Top level' }],
};

/** The documentation modules of a document that inlines `manifest`. */
const documentationOf = async (manifest) => {
  vi.stubGlobal('document', {
    getElementById: (id) => (id === BUILD_MANIFEST_ELEMENT_ID ? { textContent: JSON.stringify(manifest) } : null),
  });
  vi.stubGlobal('html', (strings, ...values) => String.raw({ raw: strings }, ...values));
  return {
    ...(await import('../../../src/client/components/core/Repository.js')),
    ...(await import('../../../src/client/components/core/Docs.js')),
  };
};

describe('the documentation section of the build manifest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('is where the client reads the repository and the coverage reports', async () => {
    const { Docs, coverallsUrl, githubUrl, repositoryIdentity } = await documentationOf({
      ...documented,
      ...LOOK_ALIKES,
    });
    expect(repositoryIdentity()).toEqual(documented.documentation.repository);
    expect(githubUrl()).toBe('https://github.com/documented-owner/');
    expect(coverallsUrl()).toBe(`https://coveralls.io/github/documented-owner/${REPOSITORY_DEFAULTS.name}`);
    expect(Docs.coverageReports().map(({ type, text, url }) => ({ type, text, url: url() }))).toEqual([
      { type: 'coverage-engine', text: 'Engine', url: '/docs/coverage/engine' },
    ]);
  });

  it('is the only place: look-alike fields elsewhere give the client nothing', async () => {
    const { documentation, ...undocumented } = documented;
    const { Docs, githubUrl } = await documentationOf({ ...undocumented, ...LOOK_ALIKES });
    expect(() => githubUrl()).toThrow(TypeError);
    expect(() => Docs.coverageReports()).toThrow(TypeError);
  });
});
