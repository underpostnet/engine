// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { findBinary } from '../../support/binary.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');

const live = {
  instanceCode: 'amethyst-strata-expansion',
  serverId: 'mmo-server-7f3a',
  mapCode: 'athel-ferrum-outpost',
  epoch: 12,
  startedAt: '2026-10-21T10:00:00.000Z',
  expiresAt: '2026-10-21T10:21:00.000Z',
  live: true,
  ended: false,
  health: {
    durability: 'recovery',
    closing: false,
    seq: 177,
    durableSeq: 173,
    unsavedMs: 185000,
    failure: 'integrity',
    at: '2026-10-21T10:20:40.000Z',
  },
};
const rows = [
  {
    id: '6ad8e4e75cf28247fcd66001',
    accountId: '6ad8e4e75cf28247fcd65001',
    username: 'neo',
    universeCode: 'cyberia',
    lastPlayedAt: '2026-10-21T10:00:00.000Z',
    epoch: 12,
    commitSeq: 173,
    revision: 410,
    schemaVersion: 2,
    coins: 950,
    xp: 12000,
    status: 'online',
    session: live,
  },
  {
    id: '6ad8e4e75cf28247fcd66002',
    accountId: '6ad8e4e75cf28247fcd65002',
    username: 'trinity',
    universeCode: 'cyberia',
    lastPlayedAt: '2026-10-20T08:00:00.000Z',
    epoch: 3,
    commitSeq: 0,
    revision: 22,
    schemaVersion: 2,
    coins: 40,
    xp: 600,
    status: 'offline',
    session: null,
  },
];
const detail = {
  ...rows[0],
  schemaCurrent: true,
  createdAt: '2026-10-16T08:00:00.000Z',
  carried: { bag: 9, storage: 4, held: 1 },
  worlds: [
    {
      instanceCode: 'amethyst-strata-expansion',
      mapCode: 'athel-ferrum-outpost',
      positionAt: null,
      vaults: 2,
      held: 0,
      quests: { active: 3, completed: 7 },
    },
  ],
};
const audit = [
  {
    id: 'a1',
    action: 'session.end',
    actor: 'operator-ana',
    reason: 'Stuck after the index incident',
    outcome: 'refused',
    refusal: 'no_session',
    epochBefore: 11,
    epochAfter: 11,
    createdAt: '2026-10-21T09:00:00.000Z',
  },
];
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};

/** The bundle of the manager for one role. */
const bundle = async (role) =>
  (
    await build({
      stdin: {
        contents: `import {PlayerCyberiaManager} from './src/client/components/cyberia/PlayerCyberiaManager.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        import {EditorCrud} from './src/client/components/core/EditorCrud.js';
        window.notes = [];
        window.questions = [];
        NotificationManager.Push = async (options) => window.notes.push(options);
        EditorCrud.confirm = async (action, question) => (window.questions.push(question), true);
        document.querySelector('#mount').innerHTML = await PlayerCyberiaManager.render({
          appStore: {Data: {user: {main: {model: {user: {role: '${role}'}}}}}}
        });`,
        resolveDir: process.cwd(),
        sourcefile: 'player-studio-test.js',
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

describe.skipIf(!driver || !browserBinary)('Player manager in a browser', () => {
  let browser, server, page, base;
  const scripts = {};
  const reads = [];
  const ends = [];
  const errors = [];
  const notes = () => page.evaluate(() => window.notes.map(({ status, html }) => `${status}: ${html}`));
  const shot = async (name) => {
    if (!process.env.CYBERIA_UI_SCREENSHOTS) return;
    await mkdir(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, name), fullPage: true });
  };
  const visit = async (role, query = '') => {
    await page.goto(`${base}/?role=${role}${query}`);
    await page.waitForSelector('.player-manager-row');
  };

  beforeAll(async () => {
    for (const role of ['moderator', 'admin']) scripts[role] = await bundle(role);
    server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/studio.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(scripts[url.searchParams.get('role')]);
      }
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
          <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
          <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
          <style>body{margin:12px;font:16px sans-serif;background:#111b2b;color:#e5efff;--studio-border:#52647e}</style>
          <div id="mount"></div><script type="module" src="/studio.js?role=${url.searchParams.get('role')}"></script></html>`);
      }
      res.setHeader('Content-Type', 'application/json');
      const send = (data) => res.end(JSON.stringify({ status: 'success', data }));
      if (url.pathname.endsWith('/session/end')) {
        let body = '';
        for await (const chunk of req) body += chunk;
        ends.push(JSON.parse(body));
        return send({ operationId: ends.at(-1).operationId, outcome: 'done', refusal: '', epoch: 13 });
      }
      if (url.pathname.endsWith('/cyberia-player-audit')) return send({ data: audit, next: '' });
      if (url.pathname.endsWith(`/cyberia-player/${detail.id}`)) return send(detail);
      if (url.pathname.endsWith('/cyberia-player')) {
        const query = Object.fromEntries(url.searchParams);
        reads.push(query);
        const page = query.after
          ? rows.slice(1)
          : query.q
            ? rows.filter((row) => row.username.startsWith(query.q))
            : rows.slice(0, 1);
        return send({ data: page, next: query.after || query.q ? '' : 'cursor-1' });
      }
      return send({ data: [], next: '' });
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

  it('lists profiles a page at a time by cursor, with their session status and save health', async () => {
    await visit('moderator');
    const first = await page.locator('.player-manager-row').first().textContent();
    expect(first).toContain('neo');
    expect(first).toContain('Online');
    expect(first).toContain('Recovery required');
    await page.locator('.list-pager-player-manager-list-next').click();
    await page.waitForFunction(() => document.querySelector('.player-manager-row')?.textContent.includes('trinity'));
    expect(reads.at(-1)).toMatchObject({ after: 'cursor-1', limit: '25' });
    expect(await page.locator('.player-manager-row').first().textContent()).toContain('Offline');
  });

  it('filters by account name and status on the server', async () => {
    await page.locator('.player-manager-search').fill('neo');
    await expect.poll(() => reads.at(-1)).toMatchObject({ q: 'neo' });
    await page.waitForFunction(() => document.querySelector('.player-manager-row')?.textContent.includes('neo'));
    await page.locator('.player-manager-status').selectOption('online');
    await expect.poll(() => reads.at(-1)).toMatchObject({ q: 'neo', status: 'online' });
    expect(reads.at(-1)).not.toHaveProperty('after');
  });

  it('keeps the persistent profile apart from the live session and says what the health means', async () => {
    await visit('moderator', `&playerId=${detail.id}`);
    await page.waitForSelector('.player-manager-detail h4');
    const cards = await page.locator('.player-manager-detail .studio-form-card h4').allTextContents();
    expect(cards.slice(0, 2)).toEqual(['Profile', 'Live session']);
    const text = await page.locator('.player-manager-detail').textContent();
    expect(text).toContain('Persistent: what the account keeps in this universe.');
    expect(text).toContain('Runtime: the lease one game server holds to write the profile.');
    expect(text).toContain('4 change(s) not saved, the oldest 3 min old');
    expect(text).toContain('Cause: the database refuses the write as it stands.');
    expect(text).toContain('3 active / 7 completed quests');
    expect(text).toContain('operator-ana: Stuck after the index incident');
    expect(text).not.toContain('sword');
    expect(await page.locator('.player-manager-end').isDisabled()).toBe(true);
    await shot('player-manager-detail.png');
  });

  it('lets an admin end a live session only with a reason, after a confirmation that names what is lost', async () => {
    await visit('admin', `&playerId=${detail.id}`);
    await page.waitForSelector('.player-manager-end:not([disabled])');
    await page.locator('.player-manager-end').click();
    expect(ends).toEqual([]);
    expect((await notes()).at(-1)).toContain('error: Give the reason');
    await page.locator('.player-manager-reason').fill('Account blocked by a poisoned commit');
    await page.locator('.player-manager-end').click();
    await page.waitForFunction(() => window.notes.some(({ status }) => status === 'success'));
    expect(await page.evaluate(() => window.questions)).toEqual([
      expect.stringContaining('Its server reports 4 change(s) not saved'),
    ]);
    expect(ends).toEqual([
      {
        operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        reason: 'Account blocked by a poisoned commit',
        epoch: 12,
      },
    ]);
    expect((await notes()).at(-1)).toContain('Session ended');
  });

  it('fits a mobile viewport without a horizontal scroll', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit('moderator', `&playerId=${detail.id}`);
    await page.waitForSelector('.player-manager-detail h4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot('player-manager-mobile.png');
    expect(errors).toEqual([]);
  });
});
