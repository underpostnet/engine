// Requires mongod (UNDERPOST_MONGOD_BIN), Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can
// name its module path; CYBERIA_UI_SCREENSHOTS a directory for the screenshots of each step.
// The routers are the real ones on a real MongoDB. Like production, a request without the session token
// in its header is refused, and a stub game server records the hot reloads.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import express from 'express';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';
import { mongodBinary } from '../../support/mongod.js';
import { resolveEntityDefaultBuild } from '../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import { CyberiaEntityTypeDefaultService } from '../../../src/api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { MODERATOR, host, publishItem, startEngine, stopEngine } from '../../support/procedural-engine.js';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { sourceFromDirectionFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { PROCEDURAL_APIS } from '../../../src/projects/cyberia/procedural/engine.js';
import { stopProceduralWorkers } from '../../../src/projects/cyberia/procedural/jobs/worker.js';
import { populationModels } from '../../../src/projects/cyberia/procedural/population/map-context.js';
import { addDefault } from '../../../src/projects/cyberia/procedural/population/defaults.js';
import {
  createPopulation,
  getPopulation,
  saveDraft,
  updateTarget,
} from '../../../src/projects/cyberia/procedural/population/population.js';
import {
  advancePublication,
  claimPublication,
  refreshPublication,
} from '../../../src/projects/cyberia/procedural/population/publication.js';
import {
  instanceDraftView,
  populationGraph,
} from '../../../src/projects/cyberia/procedural/population/working-graph.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const TOKEN = 'browser-test';
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};
const APIS = [
  ...PROCEDURAL_APIS,
  'atlas-sprite-sheet',
  'cyberia-item-catalog',
  'object-layer',
  'cyberia-map',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-entity-type-default',
  'cyberia-universe',
  'cyberia-server-registry',
];
const ROUTES = Object.freeze({
  engine: 'cyberia-procedural-engine',
  instance: 'cyberia-instance-engine',
  universe: 'cyberia-universe-engine',
  entity: 'cyberia-entity-engine',
});
const GRID = { gridX: 8, gridY: 8, cellWidth: 16, cellHeight: 16 };
const entity = (entityType, objectLayerItemIds, x, y) => ({
  entityType,
  objectLayerItemIds,
  initCellX: x,
  initCellY: y,
  dimX: 1,
  dimY: 1,
  color: 'rgba(90, 160, 110, 1)',
});

describe.skipIf(!driver || !browserBinary || !mongodBinary)('the working graph in the Studios, on the real API', () => {
  const errors = [];
  const reloads = [];
  const refused = [];
  let browser, server, page, base, id, row, nextId;
  const all = () => populationModels(host);
  const until = async (check, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) return true;
      await new Promise((done) => setTimeout(done, 100));
    }
    return false;
  };
  const text = (selector) => page.evaluate((selector) => document.querySelector(selector)?.innerText ?? '', selector);
  const press = async (selector, label) => {
    const target = `[...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => node.textContent.includes(${JSON.stringify(label)}))`;
    expect(await until(() => page.evaluate(`Boolean(${target})`))).toBe(true);
    await page.evaluate(`${target}.click()`);
  };
  const shot = async (name) => {
    if (!process.env.CYBERIA_UI_SCREENSHOTS) return;
    mkdirSync(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, `${name}.png`), fullPage: true });
  };
  const routed = (route) => until(() => page.evaluate((route) => window.route === route && window.mounted, route));
  const node = (code) => page.locator(`.graph-layout-node[data-code="${code}"]`);
  const banner = (route) =>
    page.locator(route === ROUTES.instance ? '.instance-engine-population' : '.universe-engine-population');
  const context = async (check) => expect(await until(async () => check(await text('.procedural-context')))).toBe(true);

  beforeAll(async () => {
    await startEngine({ maps: {}, entities: [] });
    process.env.CYBERIA_SERVER_API_KEY = 'working-graph-browser-key';
    await publishItem('moss', {
      type: 'floor',
      renderSource: sourceFromDirectionFrames({
        framesByCode: { '08': [Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [60, 120, 70, 255]))] },
        frameDurationMs: 250,
      }),
    });
    const { CyberiaMap, CyberiaInstance, CyberiaInstanceConf, CyberiaEntityTypeDefault } = all();
    const glade = await CyberiaMap.create({
      code: 'glade',
      name: 'Glade',
      ...GRID,
      worldX: 200,
      worldY: 0,
      entities: [entity('floor', ['moss'], 0, 0), entity('portal', [], 2, 2)],
    });
    await CyberiaMap.create({
      code: 'cave',
      name: 'Cave',
      ...GRID,
      worldX: 0,
      worldY: 0,
      entities: [entity('floor', ['moss'], 1, 0), entity('portal', [], 1, 1), entity('bot', ['guard-skin'], 3, 3)],
    });
    row = await CyberiaEntityTypeDefault.create({
      entityType: 'bot',
      liveItemIds: ['guard-skin'],
      behavior: 'passive',
    });
    await DataBaseProviderService.getModel('CyberiaEconomy', host).create({ code: 'standard', name: 'Standard' });
    await CyberiaInstance.create({ code: 'home', name: 'Home', cyberiaMapCodes: ['cave'] });
    await CyberiaInstanceConf.create({ instanceCode: 'home', entityDefaults: [row._id] });
    await DataBaseProviderService.getModel('CyberiaUniverse', host).create({
      code: 'realm',
      name: 'Realm',
      instances: [{ instanceCode: 'home', x: 0, y: 0 }],
    });
    id = String(
      (
        await createPopulation({
          models: all(),
          request: { mapCode: 'glade', seed: { mode: 'fixed', value: 5 } },
          actor: MODERATOR,
        })
      )._id,
    );
    // The map draft the Map Studio saved: one more portal entity.
    await saveDraft({
      models: all(),
      id,
      body: {
        grid: GRID,
        entities: [entity('floor', ['moss'], 0, 0), entity('portal', [], 2, 2), entity('portal', [], 5, 5)],
        revision: 0,
        baseRevision: glade.revision,
      },
      actor: MODERATOR,
    });
    await updateTarget({ models: all(), id, itemId: 'moss', body: { resolution: 'keep' }, actor: MODERATOR });
    await addDefault({ models: all(), id, rowId: String(row._id) });

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    // What the Instance Studio lists besides the instance: no economy, saga or file on this host.
    const nothing = { status: 'success', data: { data: [], total: 0, page: 1, totalPages: 0 } };
    app.get(['/api/v1/cyberia-economy', '/api/v1/file'], (req, res) => res.json(nothing));
    app.get('/api/v1/cyberia-instance/map-sources', (req, res) =>
      res.json({ status: 'success', data: { foundation: [], sagas: [] } }),
    );
    app.post(/^\/game\/[\w-]+\/api\/v1\/hot-reload$/, (req, res) => {
      reloads.push({ instanceCode: req.body.instanceCode, mode: req.body.mode });
      res.json({ message: 'reloading' });
    });
    const options = {
      ...host,
      authMiddleware: (req, res, next) => {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) {
          refused.push(req.originalUrl);
          return res.status(401).json({ status: 'error', message: 'Unauthorized' });
        }
        req.auth = { user: { _id: MODERATOR, role: 'moderator' } };
        next();
      },
    };
    for (const api of APIS) {
      const { ApiRouter } = await import(`../../../src/api/${api}/${api}.router.js`);
      const extension = await import(`../../../src/projects/cyberia/${api}.extension.js`).catch(() => undefined);
      app.use(`/api/v1/${api}`, ApiRouter({ ...options, extension }));
    }
    const bundle = await build({
      stdin: {
        contents: `import {ProceduralEngineCyberia} from './src/client/components/cyberia/ProceduralEngineCyberia.js';
        import {InstanceEngineCyberia} from './src/client/components/cyberia/InstanceEngineCyberia.js';
        import {UniverseEngineCyberia} from './src/client/components/cyberia/UniverseEngineCyberia.js';
        import {EntityEngineCyberia} from './src/client/components/cyberia/EntityEngineCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        import {Modal} from './src/client/components/core/Modal.js';
        import {Auth} from './src/client/components/core/Auth.js';
        import {registerRoutes} from './src/client/components/core/Router.js';
        Auth.setToken('${TOKEN}');
        registerRoutes(() => Object.fromEntries(Object.values(${JSON.stringify(ROUTES)}).map((route) => ['/' + route, {}])));
        window.notes = [];
        NotificationManager.Push = async (note) => window.notes.push(note);
        Modal.RenderConfirm = async () => ({ status: 'confirm' });
        Modal.Data['modal-cyberia-instance-engine'] = { options: {}, onObserverListener: {} };
        const appStore = {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}};
        // The app shell: one entry per Studio, each showing its view as the portal does.
        const views = {
          '${ROUTES.engine}': ProceduralEngineCyberia,
          '${ROUTES.instance}': InstanceEngineCyberia,
          '${ROUTES.universe}': UniverseEngineCyberia,
          '${ROUTES.entity}': EntityEngineCyberia,
        };
        const show = async (route) => {
          window.mounted = false;
          document.querySelector('#mount').innerHTML = await views[route].render({ appStore });
          window.route = route;
          window.mounted = true;
        };
        for (const route of Object.keys(views)) {
          const entry = Object.assign(document.createElement('button'), { className: 'main-btn-' + route, hidden: true });
          entry.onclick = () => show(route);
          document.body.append(entry);
        }
        await show(Object.keys(views).find((route) => location.pathname.endsWith(route)) ?? '${ROUTES.engine}');`,
        resolveDir: process.cwd(),
        sourcefile: 'working-graph-test.js',
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
    const script = bundle.outputFiles[0].text;
    const grid = readFileSync(resolve('node_modules/ag-grid-community/dist/ag-grid-community.min.js'), 'utf8');
    app.get('/studio.js', (req, res) => res.type('text/javascript').send(script));
    app.get('/grid.js', (req, res) => res.type('text/javascript').send(grid));
    app.get(/^\/(?!api\/)/, (req, res) =>
      res.type('html')
        .send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
        <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
        <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
        <script src="/grid.js"></script>
        <style>body{margin:12px;font:15px sans-serif;background:#111b2b;color:#e5efff;--studio-card:#16233a;--studio-border:#52647e}.hide{display:none!important}</style>
        <div id="mount"></div><script type="module" src="/studio.js"></script></html>`),
    );
    server = await new Promise((done) => {
      const listening = app.listen(0, '127.0.0.1', () => done(listening));
    });
    base = `http://127.0.0.1:${server.address().port}`;
    const now = new Date();
    await DataBaseProviderService.getModel('CyberiaServerRegistry', host).create({
      serverId: 'server-home',
      url: `${base}/game/home`,
      instanceCode: 'home',
      state: 'ready',
      seq: 1,
      startedAt: now,
      lastSeen: now,
    });
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
  }, 120000);

  afterAll(async () => {
    delete process.env.CYBERIA_SERVER_API_KEY;
    await browser?.close();
    stopProceduralWorkers();
    await new Promise((done) => (server ? server.close(done) : done()));
    await stopEngine();
  });

  it('builds a map, instance and universe topology in the drafts of a population, keeps it across a reload, and publishes what the review showed', async () => {
    // 1. The runtime context draws the map draft through the session, as every Studio does.
    await page.goto(`${base}/${ROUTES.engine}?workflow=map&population=${id}&step=context`);
    await context(
      (shown) =>
        shown.includes('This map is not assigned to an instance or universe.') && shown.includes('Draft preview'),
    );
    expect(await text('.procedural-context')).not.toContain('Preview unavailable');
    await shot('working-graph-1-context');

    // 2. Add the map of the population to the stored instance.
    await page.locator('.procedural-context input[placeholder="Instance code"]').first().fill('home');
    await press('.procedural-context .procedural-action', 'Add map to existing instance');
    expect(await routed(ROUTES.instance)).toBe(true);
    await expect.poll(() => banner(ROUTES.instance).innerText()).toContain('Persisted · revision 1');

    // 3. The node of the drafted map shows its draft picture and the association it waits for.
    await expect.poll(() => node('glade').textContent()).toContain('Draft preview · Pending association');
    expect(await node('glade').locator('image').getAttribute('href')).toMatch(/^blob:/);
    await expect.poll(() => node('cave').textContent()).toContain('Persisted preview');

    // 4. The Portal Connector reads the maps of the working graph: the portal entity of the map draft.
    await page.getByRole('tab', { name: 'Maps', exact: true }).click();
    await page.locator('.btn-instance-engine-portal-connect').click();
    expect(
      await until(() =>
        page.evaluate(() => window.notes.some(({ html }) => html.includes('Save to Procedural Draft to keep them'))),
      ),
    ).toBe(true);
    await expect.poll(() => banner(ROUTES.instance).innerText()).toContain('Unsaved changes');
    await shot('working-graph-2-instance');

    // 5. Save to the Procedural Draft: the Studio returns to the runtime context.
    await page.locator('.instance-engine-crud [data-crud="save"]').click();
    expect(await routed(ROUTES.engine)).toBe(true);
    const drafted = instanceDraftView(await populationGraph(all(), id, host), 'home');
    expect(drafted).toMatchObject({ state: 'draft', document: { cyberiaMapCodes: ['cave', 'glade'] } });
    expect(
      drafted.document.portals.some(({ sourceMapCode, sourceCellX }) => sourceMapCode === 'glade' && sourceCellX === 5),
    ).toBe(true);
    expect(await all().CyberiaInstance.findOne({ code: 'home' }).lean()).toMatchObject({
      revision: 1,
      cyberiaMapCodes: ['cave'],
    });
    await context((shown) => shown.includes('Saved to Procedural Draft') && shown.includes('Checks · 0 errors'));

    // 6. Back in the Instance Studio, and after a reload of the page, the same draft shows.
    await press('.procedural-context .procedural-action', 'Open Instance Studio');
    expect(await routed(ROUTES.instance)).toBe(true);
    await expect
      .poll(() => banner(ROUTES.instance).innerText())
      .toContain('Saved to Procedural Draft · starts from revision 1');
    await page.reload();
    expect(await routed(ROUTES.instance)).toBe(true);
    await expect
      .poll(() => banner(ROUTES.instance).innerText())
      .toContain('Saved to Procedural Draft · starts from revision 1');
    await expect.poll(() => node('glade').textContent()).toContain('Draft preview');
    await expect.poll(() => page.locator('.instance-engine-world-preview').innerText()).toContain('Draft preview');
    expect(await page.locator('.instance-engine-world-preview img').getAttribute('src')).toMatch(/^blob:/);
    await shot('working-graph-3-reloaded');
    await banner(ROUTES.instance).getByRole('button', { name: 'Back without saving' }).click();
    expect(await routed(ROUTES.engine)).toBe(true);

    // 7. The universe shows the world as the draft holds it, and saves to the Procedural Draft too.
    await context((shown) => shown.includes('Universes · 1'));
    await press('.procedural-context .procedural-action', 'Open Universe Studio');
    expect(await routed(ROUTES.universe)).toBe(true);
    await expect.poll(() => node('home').textContent()).toContain('Draft preview · Saved to Procedural Draft');
    expect(await node('home').locator('image').getAttribute('href')).toMatch(/^blob:/);
    await page.getByRole('tab', { name: 'Universe', exact: true }).click();
    await page.locator('.universe-engine-input-name').fill('Realm of the glade');
    await shot('working-graph-4-universe');
    await page.locator('.universe-engine-crud [data-crud="save"]').click();
    expect(await routed(ROUTES.engine)).toBe(true);
    await context((shown) => shown.includes('Realm of the glade') && shown.includes('Checks · 0 errors'));
    await shot('working-graph-5-context');

    // 8. The defaults step and the review show the same graph.
    await press('.procedural-stepper button', 'Entity type defaults');
    expect(await until(async () => (await text('.procedural-defaults')).includes('Instance · home'))).toBe(true);
    await press('.procedural-stepper button', 'Publish');
    expect(await until(async () => (await text('.procedural-publish')).includes('Ready to publish'))).toBe(true);
    const review = await text('.procedural-publish');
    for (const line of [
      'Instances: home (revision 1 → 2)',
      'Universes: realm (revision 1 → 2)',
      'Worlds to reload after the commit: home',
    ])
      expect(review).toContain(line);
    await shot('working-graph-6-review');

    // 9. Publish what the review showed; the worker commits it in one transaction and reloads the world.
    stopProceduralWorkers();
    await press('.procedural-publish .procedural-action', 'Publish');
    expect(
      await until(async () => Boolean((await all().CyberiaProceduralPopulation.findById(id).lean()).publication)),
    ).toBe(true);
    for (let step = 0; step < 6; step++) {
      const claimed = await claimPublication({ models: all(), holder: 'browser-worker' });
      if (!claimed) break;
      await advancePublication({
        models: all(),
        population: claimed,
        holder: 'browser-worker',
        options: host,
        refresh: refreshPublication,
      });
    }
    const { publication } = await getPopulation(all(), id);
    expect(publication.status, JSON.stringify(publication.error)).toBe('completed');
    const home = await all().CyberiaInstance.findOne({ code: 'home' }).lean();
    expect(home).toMatchObject({ revision: 2, cyberiaMapCodes: ['cave', 'glade'] });
    expect(home.portals).toEqual(drafted.document.portals);
    expect(
      await DataBaseProviderService.getModel('CyberiaUniverse', host).findOne({ code: 'realm' }).lean(),
    ).toMatchObject({
      revision: 2,
      name: 'Realm of the glade',
    });
    expect(reloads).toEqual([{ instanceCode: 'home', mode: 'full' }]);

    // 10. A new population of the map starts from the published documents, not from an old draft.
    const next = await createPopulation({
      models: all(),
      request: { mapCode: 'glade', seed: { mode: 'fixed', value: 6 } },
      actor: MODERATOR,
    });
    nextId = String(next._id);
    expect(instanceDraftView(await populationGraph(all(), next._id, host), 'home')).toMatchObject({
      state: 'persisted',
      revision: 2,
      document: { cyberiaMapCodes: ['cave', 'glade'], portals: home.portals },
    });
    expect(refused).toEqual([]);
    expect(errors).toEqual([]);
  }, 180000);
  it('edits a shared default and links a world in the Entity Studio, keeps both across a return and a reopen, and publishes them with the economy each world names', async () => {
    const { CyberiaInstance, CyberiaInstanceConf, CyberiaEntityTypeDefault } = all();
    // A second world on the cave map, and the item decision the publication needs.
    await CyberiaInstance.create({ code: 'outpost', name: 'Outpost', cyberiaMapCodes: ['cave'] });
    await CyberiaInstanceConf.create({ instanceCode: 'outpost' });
    const now = new Date();
    await DataBaseProviderService.getModel('CyberiaServerRegistry', host).create({
      serverId: 'server-outpost',
      url: `${base}/game/outpost`,
      instanceCode: 'outpost',
      state: 'ready',
      seq: 1,
      startedAt: now,
      lastSeen: now,
    });
    await updateTarget({ models: all(), id: nextId, itemId: 'moss', body: { resolution: 'keep' }, actor: MODERATOR });
    reloads.length = 0;
    const pictures = [];
    page.on('request', (request) => {
      const match = request.url().match(/\/world-preview\/([\w-]+)\?revision=(\d+)/);
      if (match) pictures.push({ code: match[1], revision: Number(match[2]) });
    });
    const rowId = String(row._id);
    const workspaceRow = () =>
      page.evaluate(
        (rowId) =>
          [...document.querySelectorAll('.procedural-defaults tr')].find((line) =>
            line.innerText.includes('guard-skin'),
          )?.innerText ?? '',
        rowId,
      );
    const scope = () => page.locator('.entity-engine-population').innerText();

    // 1–2. The population of the map, with the economy its world names.
    await page.goto(`${base}/${ROUTES.engine}?workflow=map&population=${nextId}&step=context`);
    await context((shown) => shown.includes('Economy · standard') && shown.includes('Checks · 0 errors'));
    await shot('defaults-1-context');

    // 3. The defaults step: the stored default joins the workspace, with the item it runs on and where it runs.
    await press('.procedural-stepper button', 'Entity type defaults');
    expect(await until(async () => (await text('.procedural-defaults')).includes('Add an existing default'))).toBe(
      true,
    );
    await page.locator('.procedural-defaults summary', { hasText: 'Add an existing default' }).click();
    await page.locator('.procedural-defaults input[aria-label="Live item id of the default"]').fill('guard-skin');
    await press('.procedural-defaults button', 'Find');
    expect(await until(async () => (await text('.procedural-defaults')).includes('passive'))).toBe(true);
    await press('.procedural-defaults button', 'Add');
    expect(await until(async () => (await workspaceRow()).includes('Instance · home'))).toBe(true);
    await shot('defaults-2-workspace');

    // 4–6. Edit opens the Entity Studio on the row as the working graph holds it: behavior and links change there.
    await page.evaluate(() =>
      [...document.querySelectorAll('.procedural-defaults tr')]
        .find((line) => line.innerText.includes('guard-skin'))
        .querySelector('button')
        .click(),
    );
    expect(await routed(ROUTES.entity)).toBe(true);
    await expect.poll(scope).toContain('Persisted · Instance · home');
    expect(await page.evaluate(() => new URLSearchParams(location.search).get('population'))).toBe(nextId);
    await page.evaluate(() =>
      [...document.querySelectorAll('[class*="dropdown-option-entity-engine-behavior-"]')]
        .find((option) => /hostile/i.test(option.textContent))
        .click(),
    );
    await page.evaluate(() => {
      const search = document.querySelector('.search-box-entity-engine-instance-picker');
      search.value = 'outpost';
      search.dispatchEvent(new Event('input'));
    });
    const option = () =>
      [...document.querySelectorAll('[class*="dropdown-option-entity-engine-instance-picker-"]')].find(
        (option) => option.textContent.trim() === 'outpost',
      );
    expect(await until(() => page.evaluate(`Boolean((${option})())`))).toBe(true);
    await page.evaluate(`(${option})().click()`);
    await page.locator('.btn-entity-engine-add-instance').click();
    await expect.poll(scope).toContain('Persisted · Shared · 2 instances: home, outpost · Unsaved changes');
    expect(await text('.entity-engine-instance-list')).toContain('outpost · pending association');
    await shot('defaults-3-entity-studio');

    // 7–8. Save to the Procedural Draft: one write of the row and its links, then back to the defaults step.
    await page.locator('.entity-engine-crud [data-crud="save"]').click();
    expect(await routed(ROUTES.engine)).toBe(true);
    expect(await until(async () => (await workspaceRow()).includes('Pending association · outpost'))).toBe(true);
    const shown = await workspaceRow();
    for (const part of ['hostile', 'Edit saved to Procedural Draft', 'Shared · 2 instances', 'home, outpost'])
      expect(shown).toContain(part);
    const record = await all().CyberiaProceduralPopulation.findById(nextId).lean();
    expect(record.defaultDrafts).toHaveLength(1);
    expect(record.defaultDrafts[0]).toMatchObject({ rowId, row: { behavior: 'hostile' }, global: false });
    expect(record.instanceDrafts.find(({ code }) => code === 'outpost').conf.entityDefaults).toEqual([rowId]);
    expect(await CyberiaEntityTypeDefault.findById(rowId).lean()).toMatchObject({ behavior: 'passive' });
    expect(await CyberiaInstanceConf.findOne({ instanceCode: 'outpost' }).lean()).toMatchObject({ entityDefaults: [] });
    await shot('defaults-4-returned');

    // 9. The runtime context draws each world at the revision the population holds, with its links.
    pictures.length = 0;
    await press('.procedural-stepper button', 'Runtime context');
    await context((shown) => shown.includes('Outpost') && shown.includes('Draft preview'));
    const revision = (await all().CyberiaProceduralPopulation.findById(nextId, { revision: 1 }).lean()).revision;
    expect(await until(() => pictures.some(({ code }) => code === 'outpost'))).toBe(true);
    expect(pictures.every((picture) => picture.revision === revision)).toBe(true);
    expect(await text('.procedural-context')).not.toContain('Preview unavailable');
    await shot('defaults-5-context');

    // 10. Reopened, the Entity Studio shows the draft: the edit and both links.
    await press('.procedural-stepper button', 'Entity type defaults');
    expect(await until(async () => (await workspaceRow()).includes('hostile'))).toBe(true);
    await page.evaluate(() =>
      [...document.querySelectorAll('.procedural-defaults tr')]
        .find((line) => line.innerText.includes('guard-skin'))
        .querySelector('button')
        .click(),
    );
    expect(await routed(ROUTES.entity)).toBe(true);
    await expect.poll(scope).toContain('Saved to Procedural Draft · Shared · 2 instances: home, outpost');
    expect(await scope()).not.toContain('Unsaved changes');
    expect(await text('.entity-engine-instance-list')).toContain('outpost · pending association');
    expect(await text('.dropdown-current-entity-engine-behavior')).toMatch(/hostile/i);
    await shot('defaults-6-reopened');
    await page.locator('.entity-engine-population').getByRole('button', { name: 'Back without saving' }).click();
    expect(await routed(ROUTES.engine)).toBe(true);

    // 11–12. The review: the edited default, the world that joins it, both reloads, and no economy defect.
    await press('.procedural-stepper button', 'Publish');
    expect(await until(async () => (await text('.procedural-publish')).includes('Ready to publish'))).toBe(true);
    const review = await text('.procedural-publish');
    for (const line of [
      `Defaults to write: edit of …${rowId.slice(-6)}`,
      'Instances: outpost (revision 1 → 2)',
      'Worlds to reload after the commit: home, outpost',
    ])
      expect(review).toContain(line);
    expect(review).not.toMatch(/economy/i);
    await shot('defaults-7-review');

    // 13. Publish; the worker commits in one transaction and reloads each world that runs the row.
    stopProceduralWorkers();
    await press('.procedural-publish .procedural-action', 'Publish');
    expect(
      await until(async () => Boolean((await all().CyberiaProceduralPopulation.findById(nextId).lean()).publication)),
    ).toBe(true);
    for (let step = 0; step < 6; step++) {
      const claimed = await claimPublication({ models: all(), holder: 'browser-worker' });
      if (!claimed) break;
      await advancePublication({
        models: all(),
        population: claimed,
        holder: 'browser-worker',
        options: host,
        refresh: refreshPublication,
      });
    }
    const { publication } = await getPopulation(all(), nextId);
    expect(publication.status, JSON.stringify(publication.error)).toBe('completed');

    // 14. The stored row, both references and the economy, and what the runtime resolves in each world.
    expect(await CyberiaEntityTypeDefault.findById(rowId).lean()).toMatchObject({ behavior: 'hostile' });
    for (const instanceCode of ['home', 'outpost']) {
      const conf = await CyberiaInstanceConf.findOne({ instanceCode }).lean();
      expect(conf.entityDefaults.map(String)).toEqual([rowId]);
      expect(conf.economyCode).toBe('standard');
      const running = await CyberiaEntityTypeDefaultService.resolveWithCanonical(conf.entityDefaults, host);
      expect(resolveEntityDefaultBuild({ entityType: 'bot', itemIds: ['guard-skin'] }, running)).toMatchObject({
        behavior: 'hostile',
        liveItemIds: ['guard-skin'],
      });
    }
    expect(await CyberiaEntityTypeDefault.countDocuments()).toBe(1);

    // 15. Each world that runs the edited row reloads, and no other.
    expect(reloads.map(({ instanceCode }) => instanceCode).sort()).toEqual(['home', 'outpost']);
    expect(refused).toEqual([]);
    expect(errors).toEqual([]);
  }, 240000);
});
