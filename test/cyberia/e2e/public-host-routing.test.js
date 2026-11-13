'use strict';

// The public website and the services host of a running dd-cyberia stack. Opt-in: set
// CYBERIA_E2E_PUBLIC_ORIGIN and CYBERIA_E2E_SERVICES_ORIGIN, such as http://localhost:4006 and
// http://localhost:4004 for `npm run dev dd-cyberia` on a development sandbox, or the production
// origins. The browser cases also need puppeteer-core and Firefox (UNDERPOST_BROWSER_BIN or PATH).

import { describe, expect, it } from 'vitest';
import { findBinary } from '../../support/binary.js';

const PUBLIC = process.env.CYBERIA_E2E_PUBLIC_ORIGIN ?? '';
const SERVICES = process.env.CYBERIA_E2E_SERVICES_ORIGIN ?? '';
const puppeteer = await import('puppeteer-core').then((module) => module.default).catch(() => null);
const browserBinary = findBinary('firefox', 'UNDERPOST_BROWSER_BIN');

const get = (origin, path, init) => fetch(`${origin}${path}`, { redirect: 'manual', ...init });

/** The account behind the guest session of the services origin: the subject of its token. */
const guestOf = (page) =>
  page.evaluate(() => {
    const token = localStorage.getItem('jwt.g');
    return token && JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))._id;
  });

const withPage = async (run) => {
  const browser = await puppeteer.launch({ browser: 'firefox', executablePath: browserBinary, headless: true });
  try {
    await run(await browser.newPage());
  } finally {
    await browser.close();
  }
};

describe.skipIf(!PUBLIC || !SERVICES)('public host routing of a running stack', () => {
  it('serves the static landing page at the root of the public host', async () => {
    for (const path of ['/', '/index.html']) {
      const response = await get(PUBLIC, path);
      expect(response.status, path).toBe(200);
      const html = await response.text();
      expect(html).toContain('class="cp-hero"');
      expect(html).not.toContain('cyberia-portal.index.js');
      expect(html).toContain(`href="${SERVICES}/">Open portal</a>`);
    }
  });

  it('redirects every portal path of the public host to the same path and query on the services host', async () => {
    for (const path of ['/log-in/', '/log-in', '/sign-up/', '/cyberia-studio/', '/launch?world=test', '/api-docs']) {
      const response = await get(PUBLIC, path);
      expect(response.status, path).toBe(308);
      expect(response.headers.get('location'), path).toBe(`${SERVICES}${path}`);
      expect(response.headers.get('cache-control'), path).toBe('no-cache');
    }
    const post = await get(PUBLIC, '/log-in/', { method: 'POST' });
    expect(post.status).toBe(308);
  });

  it('routes no API, socket or portal module of the services host through the public host', async () => {
    for (const [path, init] of [
      ['/api/v1/user/guest', { method: 'POST' }],
      ['/api/v1/openapi.json'],
      ['/socket.io/?EIO=4&transport=polling'],
      ['/components/core/Router.js'],
    ]) {
      const response = await get(PUBLIC, path, init);
      expect(response.status, path).toBeGreaterThanOrEqual(400);
    }
  });

  it('keeps the portal on the services host as it was', async () => {
    const response = await get(SERVICES, '/log-in/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('cyberia-portal.index.js');
  });

  it.skipIf(!puppeteer || !browserBinary)(
    'opens a deep link of the public host on the services host, before any portal script runs there',
    () =>
      withPage(async (page) => {
        await page.goto(`${PUBLIC}/log-in/`, { waitUntil: 'load' });
        await page.waitForSelector('#log-in-password-name', { visible: true, timeout: 30000 });
        expect(await page.evaluate(() => location.origin + location.pathname)).toBe(`${SERVICES}/log-in/`);
      }),
    60000,
  );

  it.skipIf(!puppeteer || !browserBinary)(
    'keeps one session on the services host, whichever host the visitor enters through',
    () =>
      withPage(async (page) => {
        await page.goto(`${PUBLIC}/log-in/`, { waitUntil: 'load' });
        await page.waitForFunction(() => localStorage.getItem('jwt.g'), { timeout: 30000 });
        const guest = await guestOf(page);
        expect(guest).toBeTruthy();

        await page.goto(`${PUBLIC}/`, { waitUntil: 'load' });
        await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.cp-nav-actions a[href$="/"]')]);
        expect(await page.evaluate(() => location.origin)).toBe(SERVICES);
        await page.waitForFunction(() => localStorage.getItem('jwt.g'), { timeout: 30000 });
        expect(await guestOf(page)).toBe(guest);
      }),
    90000,
  );
});
