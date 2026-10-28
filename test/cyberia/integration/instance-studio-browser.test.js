// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};
const stored = {
  _id: 'instance-moss',
  code: 'moss-world',
  name: 'Moss World',
  cyberiaMapCodes: ['camp'],
  mapLayout: [{ mapCode: 'camp', x: 0, y: 0 }],
  portals: [],
  status: 'unlisted',
  revision: 4,
};
// moss-world as the population drafts it: the stored instance is at revision 4, the draft starts from revision 3.
const draftOf = (baseRevision) => ({
  code: 'moss-world',
  document: {
    name: 'Moss draft',
    description: '',
    tags: [],
    status: 'unlisted',
    cyberiaMapCodes: ['camp', 'glade'],
    mapLayout: [
      { mapCode: 'camp', x: 0, y: 0 },
      { mapCode: 'glade', x: 1, y: 0 },
    ],
    portals: [],
    playerSpawn: { sourceMapCode: '', sourceCellX: 0, sourceCellY: 0, random: false },
  },
  conf: { aoiRadius: 12, economyCode: '', entityDefaults: [] },
  variants: [],
  state: 'draft',
  revision: 4,
  baseRevision,
  draftRevision: 2,
  preview: 'draft',
  persistedMapCodes: ['camp'],
  populationRevision: 7,
  map: { code: 'glade', state: 'draft', draftRevision: 2 },
});

describe.skipIf(!driver || !browserBinary)('Instance Studio for the Procedural Engine in a browser', () => {
  let browser, server, page, base, script, grid;
  let draftBase = 3;
  const errors = [];
  const canonical = [];
  const drafts = [];
  const rebases = [];
  const topologies = [];
  const connections = [];
  const pictures = [];

  const shoot = async (name) => {
    if (!process.env.CYBERIA_UI_SCREENSHOTS) return;
    await mkdir(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, name), fullPage: true });
  };
  /** A Procedural Engine entry that records where the Studio sends the moderator back to. */
  const recordReturn = () =>
    page.evaluate(() => {
      window.opened = [];
      const entry = Object.assign(document.createElement('button'), {
        className: 'main-btn-cyberia-procedural-engine',
      });
      entry.onclick = () =>
        window.opened.push({
          path: location.pathname,
          query: Object.fromEntries(new URLSearchParams(location.search)),
        });
      document.body.append(entry);
    });
  const banner = () => page.locator('.instance-engine-population');

  beforeAll(async () => {
    const result = await build({
      stdin: {
        contents: `import {InstanceEngineCyberia} from './src/client/components/cyberia/InstanceEngineCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        import {Modal} from './src/client/components/core/Modal.js';
        import {Auth} from './src/client/components/core/Auth.js';
        Auth.setToken('studio-test');
        window.notes = [];
        NotificationManager.Push = async (note) => window.notes.push(note);
        window.confirms = [];
        Modal.RenderConfirm = async ({ id }) => (window.confirms.push(id), { status: 'confirm' });
        Modal.Data['modal-cyberia-instance-engine'] = { options: {}, onObserverListener: {} };
        document.querySelector('#mount').innerHTML = await InstanceEngineCyberia.render({
          appStore: {Data: {user: {main: {model: {user: {role: 'admin'}}}}}}
        });`,
        resolveDir: process.cwd(),
        sourcefile: 'instance-studio-test.js',
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
    grid = await readFile(resolve('node_modules/ag-grid-community/dist/ag-grid-community.min.js'), 'utf8');
    server = createServer(async (req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/studio.js' || path === '/grid.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(path === '/grid.js' ? grid : script);
      }
      if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
          <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
          <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
          <script src="/grid.js"></script>
          <style>body{margin:12px;font:16px sans-serif;background:#111b2b;color:#e5efff;--studio-card:#16233a;--studio-border:#52647e}</style>
          <div id="mount"></div><script type="module" src="/studio.js"></script></html>`);
      }
      if (path.includes('-preview')) {
        // A route of a moderator answers no bare image request: the session token goes in the header.
        if (path.includes('/cyberia-procedural-population/')) {
          pictures.push({ url: req.url, authorized: req.headers.authorization === 'Bearer studio-test' });
          if (!pictures.at(-1).authorized) {
            res.statusCode = 401;
            return res.end();
          }
        }
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#284634"/></svg>',
        );
      }
      res.setHeader('Content-Type', 'application/json');
      const send = (data) => res.end(JSON.stringify({ status: 'success', data }));
      let text = '';
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text || '{}');
      const population = '/cyberia-procedural-population/pop-1';
      if (path.endsWith(population)) return send({ _id: 'pop-1', mapCode: 'glade', draft: { revision: 2 } });
      if (path.endsWith(`${population}/topology`)) {
        topologies.push(body);
        return send({
          maps: [],
          portalEntities: [],
          connections: [],
          unreachable: [],
          unresolved: [],
          invalid: [],
          unconnected: [],
        });
      }
      if (path.endsWith(`${population}/portal-connect`)) {
        connections.push(body);
        return send({
          topology: 'ring',
          mapCount: 2,
          portals: [
            {
              sourceMapCode: 'camp',
              sourceCellX: 1,
              sourceCellY: 1,
              targetMapCode: 'glade',
              targetCellX: 5,
              targetCellY: 5,
            },
            {
              sourceMapCode: 'glade',
              sourceCellX: 5,
              sourceCellY: 5,
              targetMapCode: 'camp',
              targetCellX: 1,
              targetCellY: 1,
            },
          ],
        });
      }
      if (path.endsWith(`${population}/instances/glade-world`) && req.method === 'PUT') {
        drafts.push({ code: 'glade-world', ...body });
        return send({ code: 'glade-world', state: 'new' });
      }
      if (path.endsWith(`${population}/instances/moss-world/rebase`)) {
        rebases.push(body);
        if (!body.prefer) {
          res.statusCode = 409;
          return res.end(
            JSON.stringify({
              status: 'error',
              message:
                'moss-world changed name in the draft and at revision 4: keep the draft values, or discard the draft',
            }),
          );
        }
        draftBase = 4;
        return send(draftOf(4));
      }
      if (path.endsWith(`${population}/instances/moss-world`)) return send(draftOf(draftBase));
      if (path.includes('/cyberia-instance') && req.method !== 'GET') {
        canonical.push({ method: req.method, path });
        return send({});
      }
      if (path.endsWith('/cyberia-instance/moss-world')) return send(stored);
      if (path.endsWith('/cyberia-instance/map-sources')) return send({ sagas: [], maps: [] });
      return send({ data: [], total: 0, page: 1, totalPages: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
  });
  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise((done) => server.close(done));
  });

  it('creates an instance with the map of the population and saves it to the Procedural Draft, not the stored instances', async () => {
    await page.goto(`${base}/?population=pop-1&mapCode=glade`);
    await expect.poll(() => banner().innerText()).toContain('New instance · not saved');
    expect(await banner().innerText()).toContain('Map glade is among its maps.');
    const node = page.locator('.graph-layout-node[data-code="glade"]');
    await expect.poll(() => node.textContent()).toContain('Draft preview · Pending association');
    expect(await page.locator('.instance-engine-input-code').isDisabled()).toBe(false);
    expect(await page.locator('.instance-engine-crud [data-crud="new"]').isHidden()).toBe(true);
    expect(await page.locator('.instance-engine-crud [data-crud="save"]').innerText()).toContain(
      'Save to Procedural Draft',
    );
    await page.locator('.instance-engine-input-code').fill('glade-world');
    await page.locator('.instance-engine-input-name').fill('Glade World');
    await expect.poll(() => banner().innerText()).toContain('Unsaved changes');
    await shoot('instance-studio-population-new.png');
    await recordReturn();
    await page.locator('.instance-engine-crud [data-crud="save"]').click();
    await page.waitForFunction(() => window.opened.length === 1);
    expect(drafts).toEqual([
      {
        code: 'glade-world',
        document: expect.objectContaining({
          name: 'Glade World',
          cyberiaMapCodes: ['glade'],
        }),
        conf: {},
        baseRevision: null,
        revision: 0,
      },
    ]);
    expect(await page.evaluate(() => window.opened[0])).toEqual({
      path: '/cyberia-procedural-engine',
      query: { population: 'pop-1', workflow: 'map', step: 'context' },
    });
    expect(await page.evaluate(() => window.confirms)).toEqual([]);
    expect(canonical).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('opens the saved draft of a stored instance with its draft previews, keeps writes out of the stored instance, and rebases a stale draft', async () => {
    await page.goto(`${base}/?population=pop-1&instanceCode=moss-world&mapCode=glade`);
    await expect.poll(() => banner().innerText()).toContain('the stored instance moved to revision 4');
    expect(await page.locator('.instance-engine-input-code').inputValue()).toBe('moss-world');
    expect(await page.locator('.instance-engine-input-code').isDisabled()).toBe(true);
    expect(await page.locator('.instance-engine-input-name').inputValue()).toBe('Moss draft');
    expect(await page.locator('.instance-engine-aoi-radius').inputValue()).toBe('12');
    expect(await page.locator('.instance-engine-crud').innerText()).toContain('moss-world');
    expect(await page.locator('.instance-engine-crud [data-crud="reset"]').isDisabled()).toBe(false);
    await expect
      .poll(() => page.locator('.graph-layout-node[data-code="glade"]').textContent())
      .toContain('Draft preview · Pending association');
    expect(await page.locator('.graph-layout-node[data-code="camp"]').textContent()).not.toContain('Pending');
    const world = page.locator('.instance-engine-world-preview');
    await expect.poll(() => world.innerText()).toContain('Draft preview');
    expect(await world.locator('img').getAttribute('src')).toMatch(/^blob:/);
    expect(pictures.map(({ url, authorized }) => [url.replace(/^\/api\/v1/, ''), authorized])).toEqual(
      expect.arrayContaining([
        ['/cyberia-procedural-population/pop-1/map-preview?revision=2', true],
        ['/cyberia-procedural-population/pop-1/world-preview/moss-world?revision=7', true],
      ]),
    );
    await expect.poll(() => topologies.length).toBeGreaterThan(0);
    expect(topologies.at(-1)).toEqual({ mapCodes: ['camp', 'glade'], portals: [] });
    await shoot('instance-studio-population-stale.png');

    await page.getByRole('tab', { name: 'Maps', exact: true }).click();
    await page.locator('.btn-instance-engine-portal-connect').click();
    await expect.poll(() => topologies.at(-1)?.portals.length).toBe(2);
    expect(connections).toEqual([{ mapCodes: ['camp', 'glade'] }]);
    expect(
      await page.evaluate(() => window.notes.map(({ html }) => html).find((note) => note.startsWith('ring'))),
    ).toBe('ring — 2 portal(s) from the maps as the population drafts them. Save to Procedural Draft to keep them.');
    await expect.poll(() => banner().innerText()).toContain('Unsaved changes');

    await page.getByRole('tab', { name: 'Runtime', exact: true }).click();
    expect(await page.locator('.btn-instance-engine-hot-reload').isVisible()).toBe(false);
    expect(await page.locator('.btn-instance-engine-sync-entities').isVisible()).toBe(false);
    expect(await page.locator('.instance-engine-runtime-population').innerText()).toContain(
      'the stored instance changes at the publication',
    );
    expect(canonical).toEqual([]);

    await banner().getByRole('button', { name: 'Rebase on revision 4' }).click();
    await expect.poll(() => banner().innerText()).toContain('Saved to Procedural Draft · starts from revision 4');
    expect(rebases).toEqual([{}, { prefer: 'draft' }]);
    expect(await page.evaluate(() => window.confirms)).toEqual(['instance-engine-rebase-confirm']);

    await page.getByRole('tab', { name: 'Instance', exact: true }).click();
    await page.locator('.instance-engine-input-name').fill('Moss renamed');
    await expect.poll(() => banner().innerText()).toContain('Unsaved changes');
    await recordReturn();
    await banner().getByRole('button', { name: 'Back without saving' }).click();
    await page.waitForFunction(() => window.opened.length === 1);
    expect(await page.evaluate(() => window.confirms)).toEqual([
      'instance-engine-rebase-confirm',
      'instance-engine-leave-confirm',
    ]);
    expect(await banner().isHidden()).toBe(true);
    expect(canonical).toEqual([]);
    expect(errors).toEqual([]);
  });
});
