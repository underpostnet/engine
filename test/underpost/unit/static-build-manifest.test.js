import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import nodePath from 'path';
import UnderpostStatic from '../../../src/cli/static.js';
import { BUILD_MANIFEST_ELEMENT_ID, BUILD_MANIFEST_REL } from '../../../src/client/components/core/BuildManifest.js';

const PAGE = './examples/static-page/ssr-components/CustomPage.js';
const INLINE = new RegExp(`<script id="${BUILD_MANIFEST_ELEMENT_ID}" type="application/json">([\\s\\S]*?)</script>`);

// `node bin static`: every page links the manifest the build writes at its site root.
describe('the build manifest of a static page', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'static-build-manifest-'));
  });

  afterEach(() => fs.removeSync(root));

  it('is written at the site root and linked from the page of a site', async () => {
    await UnderpostStatic.API.callback({
      page: PAGE,
      outputPath: `${root}/docs/index.html`,
      buildPath: '/docs',
      siteRoot: `${root}/docs`,
      siteName: 'Example',
    });
    const html = fs.readFileSync(`${root}/docs/index.html`, 'utf8');
    const file = fs.readFileSync(`${root}/docs/underpost.manifest`, 'utf8');
    expect(html).toContain(
      `<link rel="${BUILD_MANIFEST_REL}" href="/docs/underpost.manifest" type="application/json" />`,
    );
    expect(html.match(INLINE)[1]).toBe(file);
    expect(JSON.parse(file)).toMatchObject({
      application: 'CustomPage',
      build: { mode: 'production' },
      runtime: { basePath: '/docs', siteName: 'Example' },
    });
    expect(JSON.parse(file)).not.toHaveProperty('documentation');
  });

  it('is written beside a single page by default, and linked before the inline copy', async () => {
    await UnderpostStatic.API.callback({ page: PAGE, outputPath: `${root}/page.html`, env: 'development' });
    const html = fs.readFileSync(`${root}/page.html`, 'utf8');
    const file = fs.readFileSync(`${root}/underpost.manifest`, 'utf8');
    expect(html).toContain(
      `<link rel="${BUILD_MANIFEST_REL}" href="/underpost.manifest" type="application/json" />` +
        `<script id="${BUILD_MANIFEST_ELEMENT_ID}" type="application/json">`,
    );
    expect(html.match(INLINE)[1]).toBe(file);
    expect(JSON.parse(file).build.mode).toBe('development');
  });

  it('is one manifest for the pages of one site that name one application', async () => {
    await UnderpostStatic.API.callback({ page: PAGE, outputPath: `${root}/index.html`, application: 'site' });
    await UnderpostStatic.API.callback({
      page: PAGE,
      outputPath: `${root}/404/index.html`,
      siteRoot: root,
      application: 'site',
    });
    const file = fs.readFileSync(`${root}/underpost.manifest`, 'utf8');
    for (const page of ['index.html', '404/index.html'])
      expect(fs.readFileSync(`${root}/${page}`, 'utf8').match(INLINE)[1], page).toBe(file);
    expect(JSON.parse(file).application).toBe('site');
    expect(fs.existsSync(`${root}/404/underpost.manifest`)).toBe(false);
  });

  it('serializes its structured data like every other data block in HTML', async () => {
    await UnderpostStatic.API.callback({
      page: PAGE,
      outputPath: `${root}/page.html`,
      microdata: [{ '@type': 'WebPage', name: '</script><script>alert(1)</script>' }],
    });
    const html = fs.readFileSync(`${root}/page.html`, 'utf8');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('\\u003c/script\\u003e');
  });
});
