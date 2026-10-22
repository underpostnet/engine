// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { findBinary } from '../../support/binary.js';
import { MARKET_CONTRACT } from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const profile = {
  _id: 'market-wods',
  code: 'wods',
  name: 'Wood exchange',
  description: '',
  status: 'active',
  revision: 1,
  scope: 'universe',
  currencyCode: 'coin',
  modes: ['fixed', 'auction'],
  hours: [1, 12, 48],
  auction: { raisePercent: 5, minRaise: 1 },
  fees: { listing: 0, sale: 1 },
  limits: { priceMin: 1, priceMax: 1000000000, listingsPerPlayer: 20 },
};
const view = {
  market: profile,
  held: { listings: 4, claims: 3 },
  terminals: [
    {
      code: 'interact-thon-zheng',
      label: 'Border-Watch Workshop',
      sourceMapCode: 'athel-ferrum-outpost',
      worlds: ['amethyst-strata-expansion'],
      selection: 'policy',
      itemIds: [],
      listingModes: ['fixed', 'auction'],
    },
    {
      code: 'test',
      label: 'Test stall',
      sourceMapCode: 'test-a',
      worlds: ['test'],
      selection: 'items',
      itemIds: ['wood-drop-1', 'wood-drop-2'],
      listingModes: ['fixed'],
    },
  ],
  markets: [
    {
      ref: 'dd-cyberia/universe:cyberia/wods',
      scope: 'universe',
      scopeKey: 'cyberia',
      worlds: ['amethyst-strata-expansion', 'test'],
      terminals: ['interact-thon-zheng', 'test'],
      open: 4,
      auctions: 1,
      unsettled: 0,
      pendingClaims: 3,
    },
  ],
  defects: [],
};
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};

describe.skipIf(!driver || !browserBinary)('Market Studio in a browser', () => {
  let browser, server, page, base, script;
  const puts = [];
  const errors = [];
  const notes = () => page.evaluate(() => window.notes.map(({ status, html }) => `${status}: ${html}`));
  const toggle = (block, value) => page.locator(`.studio-form-toggle input[data-block="${block}"][value="${value}"]`);

  beforeAll(async () => {
    const result = await build({
      stdin: {
        contents: `import {MarketEngineCyberia} from './src/client/components/cyberia/MarketEngineCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        window.notes = [];
        NotificationManager.Push = async (options) => window.notes.push(options);
        document.querySelector('#mount').innerHTML = await MarketEngineCyberia.render({
          appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}}
        });`,
        resolveDir: process.cwd(),
        sourcefile: 'market-studio-test.js',
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
    server = createServer(async (req, res) => {
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
          <style>body{margin:12px;font:20px sans-serif;background:#111b2b;color:#e5efff;--studio-card:#16233a;--studio-border:#52647e}</style>
          <div id="mount"></div><script type="module" src="/studio.js"></script></html>`);
      }
      res.setHeader('Content-Type', 'application/json');
      const send = (data) => res.end(JSON.stringify({ status: 'success', data }));
      if (path.endsWith('/cyberia-market/schema/contract')) return send(MARKET_CONTRACT);
      if (path.endsWith('/cyberia-market/wods/view')) return send(view);
      if (path.endsWith('/cyberia-market/wods') && req.method === 'PUT') {
        let body = '';
        for await (const chunk of req) body += chunk;
        puts.push(JSON.parse(body));
        res.statusCode = 409;
        return res.end(JSON.stringify({ status: 'error', message: 'Market wods is at revision 2, not 1: reload it' }));
      }
      if (path.endsWith('/cyberia-market/wods')) return send(profile);
      if (path.endsWith('/cyberia-market')) return send({ data: [profile], total: 1 });
      return send({ data: [], total: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/?marketCode=wods`);
    await page.waitForFunction(() => document.querySelector('.market-engine-code')?.value === 'wods');
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise((done) => server.close(done));
  });

  it('shows the shared terms of a market and keeps its scope and currency while it holds goods', async () => {
    expect(await page.locator('.studio-form-toggle').count()).toBe(
      MARKET_CONTRACT.modes.length + MARKET_CONTRACT.hours.length,
    );
    for (const hours of MARKET_CONTRACT.hours)
      expect(await toggle('hours', hours).isChecked()).toBe(profile.hours.includes(hours));
    await page.waitForFunction(() => document.querySelector('select[data-key="scope"]').disabled);
    expect(await page.locator('select[data-key="currencyCode"]').isDisabled()).toBe(true);
    expect(await page.locator('select[data-key="status"]').isDisabled()).toBe(false);
    expect(await page.locator('.market-engine-profile').textContent()).toContain(
      'Scope and currency stay while 4 open listings and 3 owed claims hold goods in this market.',
    );
    if (process.env.CYBERIA_UI_SCREENSHOTS) {
      await mkdir(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
      await page.screenshot({
        path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, 'market-profile.png'),
        fullPage: true,
      });
    }
  });

  it('names what a profile breaks and sends nothing until it is fixed', async () => {
    await page.locator('input[data-block="fees"][data-key="sale"]').fill('5');
    await page.locator('input[data-block="fees"][data-key="sale"]').dispatchEvent('change');
    await page.waitForSelector('.market-engine-profile [role="alert"]');
    expect(await page.locator('.market-engine-profile [role="alert"]').textContent()).toContain(
      'The sale fee is above the lowest price',
    );
    await page.locator('button[data-crud="save"]').click();
    expect(puts).toEqual([]);
    expect((await notes()).at(-1)).toContain('error: The sale fee is above the lowest price');
    await page.locator('input[data-block="fees"][data-key="sale"]').fill('1');
    await page.locator('input[data-block="fees"][data-key="sale"]').dispatchEvent('change');
    await page.waitForFunction(() => !document.querySelector('.market-engine-profile [role="alert"]'));
  });

  it('names the revision it read and keeps the edit when another editor saved first', async () => {
    await toggle('hours', 6).check();
    await page.waitForSelector('.market-engine-dirty-slot .studio-form-dirty');
    await page.locator('button[data-crud="save"]').click();
    await page.waitForFunction(() => window.notes.some(({ status }) => status === 'warning'));
    expect(puts).toEqual([expect.objectContaining({ code: 'wods', revision: 1, hours: [1, 6, 12, 48] })]);
    expect((await notes()).at(-1)).toContain('warning: Another editor saved this market first');
    expect(await toggle('hours', 6).isChecked()).toBe(true);
    expect(await page.locator('.market-engine-dirty-slot .studio-form-dirty').count()).toBe(1);
  });

  it('lists the terminals that open the profile and its live markets, read only', async () => {
    await page.locator('[role="tab"][data-tab="references"]').click();
    const text = await page.locator('.market-engine-references').textContent();
    expect(text).toContain('interact-thon-zheng');
    expect(text).toContain('lists what the economy allows');
    expect(text).toContain('lists wood-drop-1, wood-drop-2');
    expect(text).toContain('dd-cyberia/universe:cyberia/wods');
    expect(text).toContain('3 claims owed');
    expect(await page.locator('.market-engine-open-action').count()).toBe(2);
    expect(await page.locator('.market-engine-references input, .market-engine-references select').count()).toBe(0);
  });

  it('fits a mobile viewport without a horizontal scroll', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[role="tab"][data-tab="profile"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (process.env.CYBERIA_UI_SCREENSHOTS)
      await page.screenshot({ path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, 'market-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
});
