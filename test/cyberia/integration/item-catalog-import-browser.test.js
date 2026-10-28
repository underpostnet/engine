// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';
import { sourceFromDirectionFrames, toWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};
const CID = 'bafkreigoodlanternskin2xbvkozmmlvrxqdbvqm5bzxz4dydm7k6zq6bq4i';
const BOUND = 'bafkreioldlanternskin3xbvkozmmlvrxqdbvqm5bzxz4dydm7k6zq6bq4i';
const FORGED = 'bafkreiforgedlanternskinbvkozmmlvrxqdbvqm5bzxz4dydm7k6zq6bq4i';

/** One frame of the down idle keyframe, in the wire form a preview carries. */
const frame = (() => {
  const wire = toWire(
    sourceFromDirectionFrames({
      framesByCode: {
        '08': [Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => [x * 20, y * 20, 90, 255]))],
      },
      frameDurationMs: 200,
    }),
  );
  return { keyframe: 'down_idle', ...wire, frames: { down_idle: [wire.frames.down_idle[0]] } };
})();
const LICENSE = 'It names no license or author: the Object Layer protocol carries none; confirm the right to use it';

/** The preview the server answers for a definition and an item id. */
const previewOf = (cid, itemId, at = 'authority') => ({
  cid,
  source: { domain: 'objectlayer.test', at, createdBy: 'service:objectlayer', createdAt: '2026-10-20T00:00:00.000Z' },
  item: { id: 'lantern-skin', type: 'skin', description: 'A lantern skin' },
  profile: { id: 'cyberia', version: 2 },
  stats: {},
  render: { width: 12, height: 12, colors: 144, frameDurationMs: 200, frames: { down_idle: 1 }, preview: frame },
  stores: { definition: true, frames: true, atlas: true },
  global: false,
  validation:
    cid === FORGED
      ? { ok: false, problems: [`Its bytes hash to bafkreielse, not ${FORGED}`], warnings: [LICENSE] }
      : { ok: true, problems: [], warnings: [LICENSE] },
  target:
    itemId === 'old-lantern'
      ? { itemId, boundCid: BOUND, revision: 2, unchanged: false, replaces: true }
      : { itemId: itemId || 'lantern-skin', boundCid: '', revision: 0, unchanged: false, replaces: false },
});

/** The global content the list shows: one bound definition, one available by its CID only. */
const GLOBAL_ROWS = [
  {
    objectLayerCid: BOUND,
    reason: 'catalog',
    by: 'export-live',
    registeredAt: '2026-10-25T00:00:00.000Z',
    provenance: { domain: 'objectlayer.test' },
    item: { id: 'old-lantern', type: 'skin' },
    availability: 'available',
    itemIds: ['old-lantern'],
  },
  {
    objectLayerCid: CID,
    reason: 'import',
    by: 'moderator-ana',
    registeredAt: '2026-10-26T00:00:00.000Z',
    provenance: { domain: 'objectlayer.test' },
    item: { id: 'lantern-skin', type: 'skin' },
    availability: 'unrendered',
    itemIds: [],
  },
];

describe.skipIf(!driver || !browserBinary)('Import from Object Layer in a browser', () => {
  let browser, server, page;
  const imports = [];
  const documents = [];
  const removed = [];
  const errors = [];
  const text = (selector) => page.evaluate((selector) => document.querySelector(selector)?.innerText ?? '', selector);
  const run = () => page.locator('.item-catalog-import-run');
  const runState = () =>
    page.evaluate(() => {
      const node = document.querySelector('.item-catalog-import-run');
      return node && { disabled: node.disabled, label: node.textContent.trim() };
    });
  const boxes = () => page.locator('.item-catalog-import-preview input[type="checkbox"]');
  const outcome = (value) => page.locator(`.item-catalog-import-preview input[type="radio"][value="${value}"]`);
  const bodyOf = async (req) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    return JSON.parse(body);
  };

  beforeAll(async () => {
    const script = (
      await build({
        stdin: {
          contents: `import {ItemCatalogCyberia} from './src/client/components/cyberia/ItemCatalogCyberia.js';
          import {NotificationManager} from './src/client/components/core/NotificationManager.js';
          import {Modal} from './src/client/components/core/Modal.js';
          window.notes = [];
          NotificationManager.Push = async (options) => window.notes.push(options);
          Modal.RenderConfirm = async () => ({ status: 'confirm' });
          document.querySelector('#mount').innerHTML = await ItemCatalogCyberia.render({
            appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}}
          });
          window.mounted = true;`,
          resolveDir: process.cwd(),
          sourcefile: 'item-catalog-test.js',
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
      })
    ).outputFiles[0].text;
    const grid = readFileSync(resolve('node_modules/ag-grid-community/dist/ag-grid-community.min.js'), 'utf8');
    server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/catalog.js' || url.pathname === '/grid.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(url.pathname === '/catalog.js' ? script : grid);
      }
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
          <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
          <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
          <script src="/grid.js"></script>
          <style>body{margin:12px;font:16px sans-serif;background:#111b2b;color:#e5efff}.hide{display:none!important}</style>
          <div id="mount"></div><script type="module" src="/catalog.js"></script></html>`);
      }
      res.setHeader('Content-Type', 'application/json');
      const send = (data) => res.end(JSON.stringify({ status: 'success', data }));
      if (url.pathname.endsWith('/cyberia-item-catalog/import/search'))
        return send({
          data: [
            { cid: CID, itemId: 'lantern-skin', itemType: 'skin', profile: 'cyberia v2', archived: false },
            { cid: FORGED, itemId: 'lantern-skin-forged', itemType: 'skin', profile: 'cyberia v2', archived: false },
          ],
        });
      if (url.pathname.endsWith('/cyberia-item-catalog/import/preview') && req.method === 'POST') {
        const body = await bodyOf(req);
        documents.push(body);
        return send(previewOf(CID, body.itemId ?? '', 'document'));
      }
      const preview = url.pathname.match(/\/cyberia-item-catalog\/import\/([^/]+)$/);
      if (preview && req.method === 'GET') return send(previewOf(preview[1], url.searchParams.get('itemId') ?? ''));
      if (url.pathname.endsWith('/cyberia-item-catalog/import')) {
        imports.push(await bodyOf(req));
        const { itemId, bind } = imports.at(-1);
        return send({ cid: CID, itemId, binding: bind ? 'bound' : 'none', stored: {}, entry: null });
      }
      if (url.pathname.endsWith('/cyberia-global-content') && req.method === 'GET')
        return send({ data: GLOBAL_ROWS, total: GLOBAL_ROWS.length, page: 1, totalPages: 1 });
      const unregister = url.pathname.match(/\/cyberia-global-content\/([^/]+)$/);
      if (unregister && req.method === 'DELETE') {
        removed.push(unregister[1]);
        return send({ objectLayerCid: unregister[1] });
      }
      if (url.pathname.endsWith('/history'))
        return send({
          objectLayerCid: CID,
          definitions: [],
          history: [
            {
              objectLayerCid: CID,
              previousCid: '',
              source: 'import',
              by: 'moderator-ana',
              at: '2026-10-26T10:00:00.000Z',
              provenance: { domain: 'objectlayer.test', createdBy: 'service:objectlayer', warnings: [LICENSE] },
            },
          ],
        });
      return send({ data: [], total: 0, page: 1, totalPages: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.mounted && document.querySelector('.item-catalog-import-open'));
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((done) => (server ? server.close(done) : done()));
  });

  it('finds a definition, draws its frame, and imports and binds it only once its warnings are confirmed', async () => {
    await page.locator('.item-catalog-import-open').click();
    await page.locator('.item-catalog-import-q').fill('lantern');
    await page.locator('.item-catalog-import form button[type="submit"]').first().click();
    await page.waitForFunction(() =>
      document.querySelector('.item-catalog-import-results')?.textContent.includes('lantern-skin'),
    );
    await page.locator('.item-catalog-import-results .item-catalog-button').first().click();
    await page.waitForSelector('.item-catalog-import-frame');
    expect(
      await page.evaluate(() => {
        const canvas = document.querySelector('.item-catalog-import-frame');
        return [canvas.width, canvas.height, [...canvas.getContext('2d').getImageData(11, 11, 1, 1).data]];
      }),
    ).toEqual([12, 12, [220, 220, 90, 255]]);
    const shown = await text('.item-catalog-import-preview');
    expect(shown).toContain('From objectlayer.test, stored there by service:objectlayer');
    expect(shown).toContain('The import stores its definition, its render frames, its atlas here.');
    expect(shown).toContain(`I confirm: ${LICENSE}`);
    expect(shown).toContain('The import adds it to the global content: the next release carries it with no world.');
    expect(await outcome('global').isChecked()).toBe(true);
    expect(await page.locator('.item-catalog-import-bind').isVisible()).toBe(false);
    expect(await runState()).toEqual({ disabled: true, label: 'Import as global content' });
    await boxes().nth(0).check();
    expect(await runState()).toEqual({ disabled: false, label: 'Import as global content' });
    await outcome('bind').check();
    expect(await runState()).toEqual({ disabled: false, label: 'Import and bind' });
    expect(await text('.item-catalog-import-preview')).toContain(
      'lantern-skin runs no definition now: the import binds it.',
    );
    await run().click();
    await expect.poll(() => imports.length).toBe(1);
    expect(imports[0]).toEqual({
      cid: CID,
      itemId: 'lantern-skin',
      bind: true,
      expectedCid: '',
      replace: false,
      acknowledged: true,
    });
    await page.waitForFunction(() => window.notes.some(({ status }) => status === 'success'));
    await page.waitForFunction(() =>
      document.querySelector('.item-catalog-details')?.textContent.includes('From objectlayer.test'),
    );
  });

  it('asks for a decision before it replaces a binding, and sends the binding the moderator saw', async () => {
    const target = page.locator('.item-catalog-import-preview form input');
    await target.fill('old-lantern');
    await page.locator('.item-catalog-import-preview form button[type="submit"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector('.item-catalog-import-preview')
        ?.textContent.includes('Replace the binding of old-lantern'),
    );
    await boxes().nth(0).check();
    expect(await outcome('bind').isChecked()).toBe(true);
    expect(await runState()).toEqual({ disabled: true, label: 'Import and bind' });
    await boxes().nth(1).check();
    expect((await runState()).disabled).toBe(false);
    await run().click();
    await expect.poll(() => imports.length).toBe(2);
    expect(imports[1]).toEqual({
      cid: CID,
      itemId: 'old-lantern',
      bind: true,
      expectedCid: BOUND,
      replace: true,
      acknowledged: true,
    });
  });

  it('imports as global content alone when no bind is chosen', async () => {
    await page.locator('.item-catalog-import-results .item-catalog-button').first().click();
    await page.waitForSelector('.item-catalog-import-frame');
    await boxes().nth(0).check();
    await outcome('global').check();
    expect(await page.locator('.item-catalog-import-bind').isVisible()).toBe(false);
    expect(await runState()).toEqual({ disabled: false, label: 'Import as global content' });
    await run().click();
    await expect.poll(() => imports.length).toBe(3);
    expect(imports[2]).toEqual({ cid: CID, itemId: 'lantern-skin', bind: false, acknowledged: true });
    await page.waitForFunction(() => window.notes.some(({ html }) => html.includes('is global content')));
  });

  it('shows why a definition does not import, and offers no import', async () => {
    await page.locator('.item-catalog-import-results .item-catalog-button').nth(1).click();
    await page.waitForFunction(() =>
      document.querySelector('.item-catalog-import-preview')?.textContent.includes('It does not import.'),
    );
    expect(await text('.item-catalog-import-preview')).toContain(`Its bytes hash to bafkreielse, not ${FORGED}`);
    expect((await runState()).disabled).toBe(true);
  });

  it('checks a pasted document in the browser first, and imports an attached one by its document', async () => {
    const field = page.locator('#item-catalog-import-text');
    const check = page.locator('.item-catalog-import-document button[type="submit"]');
    await field.fill('{"item": {"id": "js-rules"}}');
    await check.click();
    expect(await text('.item-catalog-import-problems')).toContain(
      'schemaVersion is null: this host reads Object Layer schema 1',
    );
    await field.fill('{"schemaVersion": 1, "profile": {"id": "cyberia", "version": 2}, "data": {"item": {}}}');
    await check.click();
    const problems = await text('.item-catalog-import-problems');
    expect(problems).toContain('data.stats is missing');
    expect(problems).toContain('data.render is missing');
    await field.fill('{"item":');
    await check.click();
    expect(await text('.item-catalog-import-problems')).toContain('The document is not JSON');
    expect(documents).toEqual([]);

    const definition = JSON.stringify({
      schemaVersion: 1,
      profile: { id: 'cyberia', version: 2 },
      data: {
        item: { id: 'lantern-skin', type: 'skin', description: 'A lantern skin', activable: true },
        stats: { effect: 1, resistance: 0, agility: 0, range: 0, intelligence: 0, utility: 0 },
        render: { cid: `bafkrei${'r'.repeat(52)}`, metadataCid: `bafkrei${'l'.repeat(52)}` },
      },
    });
    await page.setInputFiles('.item-catalog-import-document input[type="file"]', {
      name: 'lantern-skin.json',
      mimeType: 'application/json',
      buffer: Buffer.from(definition),
    });
    await expect.poll(() => documents.length).toBe(1);
    expect(documents[0]).toEqual({ document: definition });
    expect(await field.inputValue()).toBe(definition);
    await page.waitForFunction(() =>
      document.querySelector('.item-catalog-import-preview')?.textContent.includes('From the document'),
    );
    await boxes().nth(0).check();
    await outcome('global').check();
    await run().click();
    await expect.poll(() => imports.length).toBe(4);
    expect(imports[3]).toEqual({ document: definition, itemId: 'lantern-skin', bind: false, acknowledged: true });
  });

  it('lists the global content with its availability and bindings, binds one later, and removes only what nothing holds', async () => {
    await page.waitForFunction(() => document.querySelectorAll('.item-catalog-global .item-catalog-row').length === 2);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.item-catalog-global .item-catalog-row')].map((row) => ({
        text: row.innerText,
        remove: [...row.querySelectorAll('button')].find((button) => button.textContent.includes('Remove')).disabled,
      })),
    );
    expect(rows[0].text).toContain('Bound to old-lantern');
    expect(rows[0].text).toContain('available');
    expect(rows[0].remove).toBe(true);
    expect(rows[1].text).toContain('No item binding: it shows by its CID only.');
    expect(rows[1].text).toContain('no render');
    expect(rows[1].remove).toBe(false);
    await page.evaluate(() =>
      [...document.querySelectorAll('.item-catalog-global .item-catalog-row')][1]
        .querySelector('.item-catalog-cell-actions button:last-child')
        .click(),
    );
    await expect.poll(() => removed).toEqual([CID]);
    await page.evaluate(() =>
      [...document.querySelectorAll('.item-catalog-global .item-catalog-row')][1]
        .querySelectorAll('.item-catalog-cell-actions button')[1]
        .click(),
    );
    await page.waitForSelector('.item-catalog-import-frame');
    expect(await outcome('bind').isChecked()).toBe(true);
    expect(await page.locator('.item-catalog-import-bind').isVisible()).toBe(true);
  });

  it('fits a phone screen with no horizontal scroll', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => {
        const panel = document.querySelector('.item-catalog-import');
        return panel.scrollWidth <= panel.clientWidth;
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
});
