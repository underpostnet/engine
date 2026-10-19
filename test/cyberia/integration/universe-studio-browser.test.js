// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { findBinary } from '../../support/binary.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const topology = {
  _id: 'universe-demo',
  code: 'demo',
  name: 'Cyberia',
  description: 'Connected worlds',
  revision: 1,
  instances: [
    { instanceCode: 'forest', x: 0, y: 0 },
    { instanceCode: 'coast', x: 1, y: 0 },
  ],
  links: [{ sourceInstanceCode: 'forest', targetInstanceCode: 'coast', bidirectional: true }],
};
const view = {
  ...topology,
  instances: topology.instances.map((node) => ({
    ...node,
    name: node.instanceCode === 'forest' ? 'Forest' : 'Coast',
    description: 'A living world',
    mapCodes: ['glade', 'camp'],
    previewUrl: '/missing-preview.png',
    thumbnailUrl: node.instanceCode === 'forest' ? '/missing-thumbnail.png' : '',
    served: true,
    status: 'available',
  })),
};
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};
const distant = {
  ...topology,
  _id: 'universe-distant',
  code: 'distant',
  instances: [
    { instanceCode: 'peak', x: 30, y: 30 },
    { instanceCode: 'river', x: 31, y: 30 },
  ],
  links: [],
};

describe.skipIf(!driver || !browserBinary)('Universe Studio in a browser', () => {
  let browser, server, page, base, script;
  let failure = false;
  const errors = [];
  beforeAll(async () => {
    const result = await build({
      stdin: {
        contents: `import {UniverseEngineCyberia} from './src/client/components/cyberia/UniverseEngineCyberia.js';
        import {GraphLayoutCyberia} from './src/client/components/cyberia/GraphLayoutCyberia.js';
        window.GraphLayoutCyberia = GraphLayoutCyberia;
        document.querySelector('#mount').innerHTML = await UniverseEngineCyberia.render({
          appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}}
        });`,
        resolveDir: process.cwd(),
        sourcefile: 'universe-studio-test.js',
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
    server = createServer((req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/studio.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(script);
      }
      if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
          <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
          <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
          <style>body{margin:12px;font:16px sans-serif;background:#111b2b;color:#e5efff;--studio-card:#16233a;--studio-border:#52647e}</style>
          <div id="mount"></div><script type="module" src="/studio.js"></script></html>`);
      }
      if (path === '/missing-preview.png') {
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#284634"/></svg>',
        );
      }
      if (path === '/missing-thumbnail.png') {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader('Content-Type', 'application/json');
      const send = (data) => res.end(JSON.stringify({ status: 'success', data }));
      if (path.endsWith('/cyberia-server-registry')) {
        if (failure) {
          res.statusCode = 503;
          return res.end(JSON.stringify({ status: 'error', message: 'Unavailable' }));
        }
        return send([
          {
            instanceCode: 'forest',
            url: 'https://game.example.test',
            status: 'available',
            ready: 2,
            draining: 0,
            releases: ['release-a'],
          },
        ]);
      }
      if (path.endsWith('/demo/view')) return send(view);
      if (path.endsWith('/demo')) return send(topology);
      if (path.endsWith('/distant/view'))
        return send({
          ...distant,
          instances: distant.instances.map((node) => ({
            ...node,
            name: node.instanceCode,
            served: true,
            status: 'offline',
            mapCodes: [],
          })),
        });
      if (path.endsWith('/distant')) return send(distant);
      if (path.endsWith('/cyberia-universe')) return send({ data: [topology, distant], total: 2 });
      return send({ data: [], total: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/?universeCode=demo`);
    await page.waitForSelector('.graph-layout-node');
  });
  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise((done) => server.close(done));
  });

  it('keeps node previews separate from selected-world thumbnails', async () => {
    await page.locator('[data-code="forest"]').click();
    await page.waitForFunction(() =>
      document.querySelector('.universe-engine-selection').textContent.includes('A living world'),
    );
    const selection = await page.locator('.universe-engine-selection').textContent();
    expect(selection).toContain('glade, camp');
    expect(selection).toContain('2 ready');
    expect(await page.locator('[data-code="forest"] image').getAttribute('href')).toBe('/missing-preview.png');
    expect(await page.locator('.universe-engine-preview-image').getAttribute('src')).toBe('/missing-thumbnail.png');
    await page.waitForFunction(() => document.querySelector('.universe-engine-preview-image').hidden);
    expect(await page.locator('.universe-engine-preview span').isVisible()).toBe(true);
    await page.locator('[data-code="coast"]').click();
    expect(await page.locator('.universe-engine-preview-image').count()).toBe(0);
    expect(await page.locator('.universe-engine-selection').textContent()).toContain('No thumbnail set.');
    await page.locator('[data-code="forest"]').click();
    expect(errors).toEqual([]);
    if (process.env.CYBERIA_UI_SCREENSHOTS) {
      await mkdir(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
      await page.screenshot({
        path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, 'universe-desktop.png'),
        fullPage: true,
      });
    }
  });

  it('keeps keyboard focus and updates the selected node after a move', async () => {
    await page.locator('[data-code="forest"]').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    expect(await page.locator('[data-code="forest"]').getAttribute('transform')).toBe('translate(0 200)');
    expect(await page.locator('[data-code="forest"]').getAttribute('aria-pressed')).toBe('true');
    expect(await page.evaluate(() => document.activeElement.dataset.code)).toBe('forest');
  });

  it('shows stale availability without discarding the selected world', async () => {
    failure = true;
    await page.locator('.universe-engine-refresh').click();
    await page.waitForFunction(() => document.querySelector('.universe-engine-runtime').textContent.includes('stale'));
    expect(await page.locator('.universe-engine-selection').textContent()).toContain('Availability is unknown');
    expect(await page.locator('.graph-layout-node.selected').getAttribute('data-code')).toBe('forest');
  });

  it('fits a mobile viewport and releases graph resources on removal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.graph-layout-canvas').getBoundingClientRect();
      return [...document.querySelectorAll('.graph-layout-node')].every((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left >= canvas.left &&
          rect.right <= canvas.right &&
          rect.top >= canvas.top &&
          rect.bottom <= canvas.bottom
        );
      });
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.CYBERIA_UI_SCREENSHOTS) {
      await mkdir(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
      await page.screenshot({
        path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, 'universe-mobile.png'),
        fullPage: true,
      });
    }
    await page.evaluate(() => {
      window.destroyed = false;
      const root = document.createElement('div');
      root.innerHTML = GraphLayoutCyberia.render({ id: 'lifecycle', label: 'Lifecycle' });
      document.body.append(root);
      const graph = GraphLayoutCyberia.bind(root, {
        onDestroy: () => {
          window.destroyed = true;
        },
      });
      graph.update({ nodes: [], edges: [], empty: 'No worlds yet' });
      root.remove();
    });
    await page.waitForFunction(() => window.destroyed);
    expect(errors).toEqual([]);
  });

  it('moves nodes with a pointer and pans read-only nodes without changing their cells', async () => {
    await page.setViewportSize({ width: 1100, height: 850 });
    await page.evaluate(() => {
      const root = document.createElement('div');
      root.id = 'pointer-fixture';
      root.innerHTML = GraphLayoutCyberia.render({ id: 'pointer-graph', label: 'Pointer graph' });
      document.body.prepend(root);
      window.pointerReadOnly = false;
      window.pointerMoves = 0;
      const nodes = [
        { code: 'pointer-a', label: 'A', x: 0, y: 0 },
        { code: 'pointer-b', label: 'B', x: 1, y: 0 },
      ];
      const graph = GraphLayoutCyberia.bind(root, {
        editable: () => !window.pointerReadOnly,
        onMove: (code, x, y) => {
          window.pointerMoves++;
          Object.assign(
            nodes.find((node) => node.code === code),
            { x, y },
          );
          graph.update({ nodes, edges: [] });
          graph.fit();
        },
      });
      graph.update({ nodes, edges: [] });
    });
    const node = page.locator('[data-code="pointer-a"]');
    let box = await node.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + box.height * 1.25, { steps: 8 });
    await page.mouse.up();
    expect(await node.getAttribute('transform')).toBe('translate(0 200)');
    await page.evaluate(() => {
      window.pointerReadOnly = true;
    });
    box = await node.boundingBox();
    const canvas = page.locator('#pointer-fixture .graph-layout-canvas');
    const before = await canvas.getAttribute('viewBox');
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + 10, { steps: 4 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.pointerMoves)).toBe(1);
    expect(await canvas.getAttribute('viewBox')).not.toBe(before);
    await page.locator('#pointer-fixture').evaluate((node) => node.remove());
  });

  it('compacts read-only spacing without changing authored cells', async () => {
    const result = await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = GraphLayoutCyberia.render({ id: 'compact', label: 'Compact' });
      document.body.prepend(root);
      const nodes = [
        { code: 'a', label: 'A', x: -30, y: 4 },
        { code: 'b', label: 'B', x: 30, y: 4 },
      ];
      const before = JSON.stringify(nodes);
      const graph = GraphLayoutCyberia.bind(root, { editable: () => false });
      graph.update({ nodes, edges: [{ source: 'a', target: 'b' }] });
      const transforms = [...root.querySelectorAll('.graph-layout-node')].map((el) => el.getAttribute('transform'));
      const edges = root.querySelectorAll('.graph-layout-edge').length;
      root.remove();
      return { transforms, edges, unchanged: before === JSON.stringify(nodes) };
    });
    expect(result).toEqual({ transforms: ['translate(0 0)', 'translate(200 0)'], edges: 1, unchanged: true });
  });

  it('frames the new topology when the library opens another universe', async () => {
    await page.getByRole('tab', { name: 'Library', exact: true }).click();
    await page.locator('.universe-engine-library-open[data-code="distant"]').click();
    await page.waitForSelector('[data-code="peak"]');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.graph-layout-canvas').getBoundingClientRect();
      return [...document.querySelectorAll('.graph-layout-node')].every((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left >= canvas.left &&
          rect.right <= canvas.right &&
          rect.top >= canvas.top &&
          rect.bottom <= canvas.bottom
        );
      });
    });
    expect(errors).toEqual([]);
  });
});
