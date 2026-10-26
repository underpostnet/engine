// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';
import { writeProceduralArtifact } from '../../support/procedural-content.js';
import { DEFAULT_PROFILES } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { paletteDefaults, proceduralConfig } from '../../../src/projects/cyberia/procedural/spec.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};
const models = {
  CyberiaProceduralProfile: { resolve: async (id) => DEFAULT_PROFILES.find(({ profileId }) => profileId === id) },
};

describe.skipIf(!driver || !browserBinary)('Item Generation in a browser', () => {
  let browser, server, page, script, config;
  const posted = [];
  const errors = [];

  beforeAll(async () => {
    vi.stubEnv('CYBERIA_CONTENT_ROOT', writeProceduralArtifact());
    config = await proceduralConfig(models);
    const result = await build({
      stdin: {
        contents: `import {ProceduralEngineCyberia} from './src/client/components/cyberia/ProceduralEngineCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        window.notes = [];
        NotificationManager.Push = async (options) => window.notes.push(options);
        document.querySelector('#mount').innerHTML = await ProceduralEngineCyberia.render({
          appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}}
        });
        window.mounted = true;`,
        resolveDir: process.cwd(),
        sourcefile: 'procedural-engine-test.js',
      },
      bundle: true,
      format: 'esm',
      write: false,
      logLevel: 'silent',
      alias: {
        'socket.io/client-dist/socket.io.esm.min.js': resolve(
          'node_modules/socket.io/client-dist/socket.io.esm.min.js',
        ),
      },
    });
    script = result.outputFiles[0].text;
    const grid = readFileSync(resolve('node_modules/ag-grid-community/dist/ag-grid-community.min.js'), 'utf8');
    server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const send = (data, status = 200) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(status === 200 ? { status: 'success', data } : { status: 'error', message: data }));
      };
      if (url.pathname === '/engine.js' || url.pathname === '/grid.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(url.pathname === '/engine.js' ? script : grid);
      }
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
          <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
          <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
          <script src="/grid.js"></script>
          <style>body{margin:12px;font:16px sans-serif;background:#111b2b;color:#e5efff}.hide{display:none!important}</style>
          <div id="mount"></div><script type="module" src="/engine.js"></script></html>`);
      }
      if (url.pathname.endsWith('/cyberia-procedural-profile/config')) return send(config);
      const palette = url.pathname.match(/\/cyberia-procedural-profile\/templates\/([^/]+)\/palette$/);
      if (palette)
        return send(
          await paletteDefaults(models, {
            templateId: decodeURIComponent(palette[1]),
            paletteId: url.searchParams.get('paletteId') ?? '',
          }),
        );
      if (url.pathname.endsWith('/cyberia-procedural-job') && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        posted.push(JSON.parse(body));
        return send('Stopped by the test', 400);
      }
      return send({ data: [], total: 0, page: 1, totalPages: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?workflow=items`);
    await page.waitForFunction(() => window.mounted && document.querySelector('.procedural-template-preview'));
    await page.evaluate(() => document.querySelector('.dropdown-option-procedural-mode-create-new').click());
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((done) => (server ? server.close(done) : done()));
    vi.unstubAllEnvs();
  });

  /** Picks an item type the way a moderator does, and reads what the form then shows. */
  const pick = async (itemType) => {
    await page.evaluate(
      (type) => document.querySelector(`.dropdown-option-procedural-item-type-${type}`).click(),
      itemType,
    );
    await page.waitForFunction(
      (type) => document.querySelector('.dropdown-current-procedural-template')?.textContent.includes(`${type}.`),
      itemType,
    );
    return await page.evaluate(() => ({
      offered: [
        ...document.querySelectorAll('.procedural-template-slot [class*="dropdown-option-procedural-template-"]'),
      ]
        .map((option) =>
          [...option.className.matchAll(/dropdown-option-procedural-template-(\S+)/g)]
            .map(([, id]) => id)
            .find((id) => id.includes('.')),
        )
        .filter(Boolean),
      frames: [...document.querySelectorAll('.procedural-template-view figcaption')].map(
        ({ textContent }) => textContent,
      ),
      prefix: document.querySelector('.procedural-input-prefix')?.value,
    }));
  };

  it('offers the templates of the item type it switches to, again and again, and sends the one it shows', async () => {
    for (const itemType of ['floor', 'skin', 'floor', 'skin', 'floor']) {
      const shown = await pick(itemType);
      expect(shown.offered, itemType).toEqual([itemType === 'floor' ? 'floor.terrain' : 'skin.humanoid']);
      expect(shown.prefix).toBe(`${itemType}-generated`);
      expect(shown.frames, itemType).toHaveLength(itemType === 'floor' ? 1 : 12);
    }
    await page.evaluate(() => document.querySelector('.procedural-btn-create').click());
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0]).toMatchObject({ mode: 'create-new', itemType: 'floor', template: { id: 'floor.terrain' } });
    await expect.poll(() => page.evaluate(() => window.notes.map(({ html }) => html))).toContain('Stopped by the test');
    expect(errors, errors.join(' | ')).toEqual([]);
  });

  it('previews the walk of a skin: two frames for each walking direction', async () => {
    const { frames } = await pick('skin');
    expect(frames).toEqual([
      'Down Idle',
      'Down Walk 1/2',
      'Down Walk 2/2',
      'Up Idle',
      'Up Walk 1/2',
      'Up Walk 2/2',
      'Left Idle',
      'Left Walk 1/2',
      'Left Walk 2/2',
      'Right Idle',
      'Right Walk 1/2',
      'Right Walk 2/2',
    ]);
  });
});
