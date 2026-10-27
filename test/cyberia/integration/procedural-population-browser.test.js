// Requires mongod (UNDERPOST_MONGOD_BIN), Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name
// the driver module path. The API is the real one: routers, MongoDB and the procedural worker.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import express from 'express';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';
import { mongodBinary } from '../../support/mongod.js';
import { VIOLET_STRATA } from '../../support/procedural-content.js';
import {
  MODERATOR,
  definitionOf,
  host,
  publishItem,
  startEngine,
  stopEngine,
} from '../../support/procedural-engine.js';
import { sourceFromDirectionFrames, toWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { PROCEDURAL_APIS } from '../../../src/projects/cyberia/procedural/engine.js';
import { stopProceduralWorkers } from '../../../src/projects/cyberia/procedural/jobs/worker.js';
import { populationModels } from '../../../src/projects/cyberia/procedural/population/map-context.js';
import {
  addTarget,
  createPopulation,
  removeTarget,
  runsOf,
  saveDraft,
} from '../../../src/projects/cyberia/procedural/population/population.js';
import { authorTarget } from '../../../src/projects/cyberia/procedural/population/results.js';
import {
  advancePublication,
  claimPublication,
} from '../../../src/projects/cyberia/procedural/population/publication.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
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
];
const ROOT_STYLE = readFileSync(resolve('src/client/ssr/RootDocument.js'), 'utf8').match(
  /<style class="root-style">[\s\S]*?<\/style>/,
)[0];
const WORLD = {
  maps: {
    'moss-hollow': {
      biome: VIOLET_STRATA.id,
      composition: [
        { entity: 'floor.violet-moss', count: 2 },
        { entity: 'character.violet-warden', count: 1 },
      ],
    },
  },
  entities: [
    { id: 'floor.violet-moss', entityType: 'floor', objectLayerItemIds: ['violet-moss'], itemType: 'floor' },
    { id: 'character.violet-warden', entityType: 'bot', objectLayerItemIds: ['violet-skin'] },
  ],
};

describe.skipIf(!driver || !browserBinary || !mongodBinary)('Map Population in a browser, on the real API', () => {
  let browser, server, page, id;
  const errors = [];
  const all = () => populationModels(host);
  const read = async () => (await all().CyberiaProceduralPopulation.findById(id).lean()).targets;
  const until = async (check, ms = 60000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) return true;
      await new Promise((done) => setTimeout(done, 300));
    }
    return false;
  };
  const text = (selector) => page.evaluate((selector) => document.querySelector(selector)?.innerText ?? '', selector);
  const shot = async (name, selector) => {
    if (!process.env.CYBERIA_UI_SCREENSHOTS) return;
    mkdirSync(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
    const path = resolve(process.env.CYBERIA_UI_SCREENSHOTS, `${name}.png`);
    await (selector ? page.locator(selector).screenshot({ path }) : page.screenshot({ path }));
  };
  const press = (selector, label) =>
    page.evaluate(
      ([selector, label]) =>
        [...document.querySelectorAll(selector)].find((node) => node.textContent.includes(label)).click(),
      [selector, label],
    );
  const openItem = async (itemId) => {
    await page.evaluate(
      (itemId) =>
        [...document.querySelectorAll('.procedural-item-open')]
          .find((node) => node.querySelector('.procedural-item-id').textContent === itemId)
          .click(),
      itemId,
    );
    expect(
      await until(() =>
        page.evaluate((itemId) => document.querySelector('.procedural-editor')?.dataset.item === itemId, itemId),
      ),
    ).toBe(true);
  };

  beforeAll(async () => {
    await startEngine(WORLD);
    const { CyberiaMap } = all();
    await CyberiaMap.create({
      code: 'moss-hollow',
      name: 'Moss Hollow',
      gridX: 16,
      gridY: 16,
      cellWidth: 16,
      cellHeight: 16,
      entities: [],
    });
    await publishItem('violet-moss', {
      type: 'floor',
      renderSource: sourceFromDirectionFrames({
        framesByCode: {
          '08': [Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => [60, 120, 70, 255]))],
        },
        frameDurationMs: 1000,
      }),
    });
    id = String(
      (
        await createPopulation({
          models: all(),
          request: { mapCode: 'moss-hollow', seed: { mode: 'fixed', value: 3 } },
          actor: MODERATOR,
        })
      )._id,
    );
    const options = {
      ...host,
      authMiddleware: (req, res, next) => {
        req.auth = { user: { _id: MODERATOR, role: 'moderator' } };
        next();
      },
    };
    const app = express();
    app.use(express.json({ limit: '20mb' }));
    for (const api of APIS) {
      const { ApiRouter } = await import(`../../../src/api/${api}/${api}.router.js`);
      const extension = await import(`../../../src/projects/cyberia/${api}.extension.js`).catch(() => undefined);
      app.use(`/api/v1/${api}`, ApiRouter({ ...options, extension }));
    }
    const bundle = await build({
      stdin: {
        contents: `import {ProceduralEngineCyberia} from './src/client/components/cyberia/ProceduralEngineCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        import {Modal} from './src/client/components/core/Modal.js';
        import {Css} from './src/client/components/core/Css.js';
        import {ObjectLayerEngineModal} from './src/client/components/objectlayer-studio/ObjectLayerEngineModal.js';
        window.notes = [];
        NotificationManager.Push = async (options) => window.notes.push(options);
        window.confirmDialog = async (options) => {
          await Css.loadThemes();
          return Modal.RenderConfirm.call(Modal, options);
        };
        const confirm = Modal.RenderConfirm;
        Modal.RenderConfirm = async () => ({ status: 'confirm' });
        window.restoreConfirm = () => (Modal.RenderConfirm = confirm);
        ObjectLayerEngineModal.open = (options) => ((window.studio = options), true);
        document.querySelector('#mount').innerHTML = await ProceduralEngineCyberia.render({
          appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}}
        });
        window.mounted = true;`,
        resolveDir: process.cwd(),
        sourcefile: 'population-test.js',
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
    app.get('/engine.js', (req, res) => res.type('text/javascript').send(script));
    app.get('/grid.js', (req, res) => res.type('text/javascript').send(grid));
    app.get('/', (req, res) =>
      res.type('html')
        .send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
        <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
        <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
        <script src="/grid.js"></script>
        <style>body{margin:12px;font:15px sans-serif;background:#111b2b;color:#e5efff}.hide{display:none!important}</style>
        <style class="theme-style"></style>
        <div id="mount"></div><script type="module" src="/engine.js"></script></html>`),
    );
    server = await new Promise((done) => {
      const listening = app.listen(0, '127.0.0.1', () => done(listening));
    });
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    stopProceduralWorkers();
    await new Promise((done) => (server ? server.close(done) : done()));
    await stopEngine();
  });

  const visit = async (query) => {
    await page.goto(`http://127.0.0.1:${server.address().port}/?workflow=map&population=${id}${query}`);
    expect(
      await until(() => page.evaluate(() => Boolean(window.mounted && document.querySelector('.procedural-stepper li')))),
    ).toBe(true);
  };

  it('keeps valid artwork, generates on request, removes, restores and forgets an item, publishes the plan', async () => {
    await visit('');
    expect(await text('.procedural-stepper')).toMatch(/Items\s+Ready/);
    await openItem('violet-moss');
    expect(await text('.procedural-editor')).toContain('Ready · current artwork');
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('input[name="resolution-violet-moss"]')].map((input) => [
          input.value,
          input.checked,
          input.disabled,
        ]),
      ),
    ).toEqual([
      ['keep', true, false],
      ['render', false, false],
      ['template', false, false],
      ['author', false, false],
    ]);
    const primary = () =>
      page.evaluate(() => {
        const action = document.querySelector('.procedural-editor [data-part="primary"] .procedural-action');
        return [action.textContent.trim(), action.disabled];
      });
    const choose = (resolution) =>
      page.evaluate(
        (resolution) => document.querySelector(`input[name="resolution-violet-moss"][value="${resolution}"]`).click(),
        resolution,
      );
    expect(await primary()).toEqual(['Keep current artwork', true]);
    for (const [resolution, label] of [
      ['template', 'Rebuild from template'],
      ['author', 'Open Object Layer Studio'],
      ['render', 'Generate variants'],
    ]) {
      await choose(resolution);
      expect(await primary()).toEqual([label, false]);
    }
    expect(await page.$$('.procedural-editor [data-part="primary"]')).toHaveLength(1);
    expect(await page.evaluate(() => document.querySelector('.procedural-editor').textContent)).not.toMatch(
      /\bSave\b|Revert/,
    );
    expect(
      await until(() =>
        page.evaluate(() =>
          Boolean(document.querySelector('.dropdown-option-procedural-palette-item-violet-moss-natural-deep')),
        ),
      ),
    ).toBe(true);
    await page.evaluate(() =>
      document.querySelector('.dropdown-option-procedural-palette-item-violet-moss-dark-basalt').click(),
    );
    await shot('population-item-generate', '.procedural-editor');
    expect((await read()).find(({ itemId }) => itemId === 'violet-moss').resolution).toBe('keep');
    expect(await runsOf(all(), id, 'violet-moss')).toHaveLength(0);
    await page.evaluate(() => {
      const row = document.querySelector('.procedural-editor [data-part="primary"]');
      row.querySelector('select').value = '2';
      row.querySelector('select').dispatchEvent(new Event('change'));
    });
    await press('.procedural-editor [data-part="primary"] .procedural-action', 'Generate variants');
    expect(await until(async () => (await runsOf(all(), id, 'violet-moss')).length === 2)).toBe(true);
    expect((await read()).find(({ itemId }) => itemId === 'violet-moss')).toMatchObject({
      resolution: 'render',
      palette: { paletteId: 'dark-basalt' },
    });
    expect(await until(async () => (await page.$$('.procedural-entry[data-state="ready"]')).length === 2, 90000)).toBe(
      true,
    );
    expect(await text('[data-part="results"] .procedural-card-head')).toContain('2 of 16 kept');
    await press('.procedural-entry .procedural-action', 'Use this result');
    expect(await until(async () => (await text('.procedural-editor')).includes('Ready · result selected'))).toBe(true);
    expect(await until(async () => (await page.$$('.procedural-entry[data-state="selected"]')).length === 1)).toBe(
      true,
    );
    await visit('&step=items&item=violet-moss');
    expect(await until(async () => (await page.$$('.procedural-entry[data-state="selected"]')).length === 1)).toBe(
      true,
    );
    expect(await text('.procedural-editor-head')).toContain('Ready · result selected');

    await openItem('violet-skin');
    expect(await until(async () => (await text('.procedural-editor')).includes('Kept ·'))).toBe(true);
    expect((await read()).find(({ itemId }) => itemId === 'violet-skin')).toMatchObject({
      resolution: 'keep',
      observed: { bindingRevision: 1 },
    });
    await press('.procedural-editor [data-part="footer"] .procedural-action', 'Remove from population');
    expect(
      await until(async () => (await all().CyberiaProceduralPopulation.findById(id).lean()).removed.length === 1),
    ).toBe(true);
    expect((await all().CyberiaProceduralPopulation.findById(id).lean()).removed[0]).toMatchObject({
      by: MODERATOR,
      target: { itemId: 'violet-skin', resolution: 'keep' },
    });
    expect(await until(async () => (await text('.procedural-item-list')).includes('Removed · 1'))).toBe(true);
    await page.evaluate(() => {
      const removed = [...document.querySelectorAll('.procedural-item-list details')].find((node) =>
        node.textContent.includes('Removed'),
      );
      removed.open = true;
      [...removed.querySelectorAll('.procedural-action')].find((node) => node.textContent.includes('Restore')).click();
    });
    expect(await until(async () => (await read()).some(({ itemId }) => itemId === 'violet-skin'))).toBe(true);
    await addTarget({
      models: all(),
      id,
      body: { itemId: 'old-relic', stage: 'other', itemType: 'static' },
      actor: MODERATOR,
    });
    await removeTarget({ models: all(), id, itemId: 'old-relic', reason: 'Not here', actor: MODERATOR });
    await visit('&step=items');
    expect(await until(async () => (await text('.procedural-item-list')).includes('Removed · 1'))).toBe(true);
    await page.evaluate(() => {
      const removed = [...document.querySelectorAll('.procedural-item-list details')].find((node) =>
        node.textContent.includes('Removed'),
      );
      removed.open = true;
      [...removed.querySelectorAll('.procedural-action')]
        .find((node) => node.textContent.includes('Forget permanently'))
        .click();
    });
    expect(
      await until(async () => (await all().CyberiaProceduralPopulation.findById(id).lean()).removed.length === 0),
    ).toBe(true);
    expect(await until(async () => !(await text('.procedural-item-list')).includes('Removed ·'))).toBe(true);
    expect((await read()).some(({ itemId }) => itemId === 'old-relic')).toBe(false);
    await openItem('violet-moss');
    expect(await text('.dropdown-current-procedural-palette-item-violet-moss')).toContain('Basalt');

    const draft = await all().CyberiaMap.findOne({ code: 'moss-hollow' }).lean();
    await saveDraft({
      models: all(),
      id,
      body: {
        grid: { gridX: 64, gridY: 64, cellWidth: 10, cellHeight: 10 },
        entities: [
          {
            entityType: 'floor',
            objectLayerItemIds: ['violet-moss'],
            initCellX: 1,
            initCellY: 1,
            dimX: 2,
            dimY: 2,
            color: 'rgba(0,0,0,1)',
          },
        ],
        revision: 0,
        baseRevision: draft.revision,
      },
      actor: MODERATOR,
    });
    await visit('&step=map');
    expect(await until(async () => (await text('.procedural-map')).includes('64 × 64 cells · 10 × 10 px a cell'))).toBe(
      true,
    );
    expect(await text('.procedural-map')).toContain('Live map preview');
    expect(await text('.procedural-stepper')).toMatch(/Items\s+Ready/);
    await visit('&step=defaults');
    expect(
      await until(async () => (await text('.procedural-defaults')).includes('A global default runs in every world')),
    ).toBe(true);
    const defaults = await text('.procedural-defaults');
    expect(defaults).toContain('No default names 2 items');
    expect(defaults).toContain('violet-moss · floor');
    expect(defaults).toContain('Create default');
    expect(await text('.procedural-stepper')).toMatch(/Entity type defaults\s+Ready/);

    await visit('&step=items&item=violet-moss');
    expect(await until(async () => (await text('.procedural-editor')).includes('Selected result'))).toBe(true);

    await press('.procedural-stepper button', 'Publish');
    expect(await until(async () => (await text('.procedural-publish')).includes('Ready to publish'))).toBe(true);
    const plan = await text('.procedural-publish');
    expect(plan).toMatch(/Review · population revision \d+/);
    expect(plan).toContain('Items · 2 of 2 ready');
    expect(plan).toContain('Publish the selected entry, then bind it');
    expect(plan).toContain('A publication changes no default');
    expect(plan).toContain('Map moss-hollow');
    expect(plan).toContain('Warnings: they stop nothing');
    expect(await page.$$('.procedural-publish .procedural-tile canvas')).toHaveLength(2);
    expect(plan).toContain('Kept: violet-skin');
    expect(plan).toContain('New revisions to publish and bind: violet-moss');
    expect(plan).toContain('Nothing is published or bound');
    stopProceduralWorkers();
    await press('.procedural-publish .procedural-action', 'Publish');
    expect(
      await until(async () => Boolean((await all().CyberiaProceduralPopulation.findById(id).lean()).publication)),
    ).toBe(true);
    const claimed = await claimPublication({ models: all(), holder: 'test-worker' });
    const quiet = async () => ({ cache: true, previews: 'refreshed', servers: [] });
    expect(
      await advancePublication({
        models: all(),
        population: claimed,
        holder: 'test-worker',
        options: host,
        refresh: quiet,
      }),
    ).toBe('completed');
    await press('.procedural-run-actions .procedural-action', 'Refresh');
    expect(
      await until(async () => (await text('.procedural-publish')).includes('Published and the runtime refreshed')),
    ).toBe(true);
    expect(await text('.procedural-publish')).toMatch(
      /Commit items and map\s+Done\s+1 binding · map revision \d+ → \d+/,
    );
    const map = await all().CyberiaMap.findOne({ code: 'moss-hollow' }).lean();
    expect([map.gridX, map.gridY, map.cellWidth, map.entities.length]).toEqual([64, 64, 10, 1]);
    expect(errors, errors.join(' | ')).toEqual([]);
  }, 240000);

  it('authors an item by hand: a start to continue from, each draft with its state, a selection that stays after a reload, a delete and a reset', async () => {
    id = String(
      (
        await createPopulation({
          models: all(),
          request: { mapCode: 'moss-hollow', seed: { mode: 'fixed', value: 4 } },
          actor: MODERATOR,
        })
      )._id,
    );
    const author = (description) =>
      authorTarget({
        models: all(),
        id,
        itemId: 'violet-skin',
        body: {
          data: { ...definitionOf('violet-skin'), item: { ...definitionOf('violet-skin').item, description } },
          objectLayerRenderFramesData: toWire(
            sourceFromDirectionFrames({
              framesByCode: {
                '08': [Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => [90, 40, 120, 255]))],
              },
              frameDurationMs: 250,
            }),
          ),
        },
        actor: MODERATOR,
        options: host,
      });
    const first = await author('first');
    const broken = await author('no frames');
    const last = await author('last');
    await all().ObjectLayerRenderFrames.deleteOne({ objectLayerCid: broken.cid });
    const short = (cid) => `${cid.slice(0, 9)}…${cid.slice(-5)}`;
    const rows = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('.procedural-editor .procedural-entry')].map((card) => [
            card.querySelector('.procedural-muted').textContent.split(' · ')[0],
            card.querySelector('.procedural-state').textContent,
          ]),
        ),
      );
    const act = (cid, label) =>
      page.evaluate(
        ([cell, label]) =>
          [...document.querySelectorAll('.procedural-editor .procedural-entry')]
            .find((card) => card.querySelector('.procedural-muted').textContent.startsWith(cell))
            .querySelectorAll('.procedural-action')
            .forEach((node) => node.textContent.includes(label) && node.click()),
        [short(cid), label],
      );

    await visit('&step=items&item=violet-skin');
    expect(await until(async () => Object.keys(await rows()).length === 3)).toBe(true);
    expect(await rows()).toEqual({
      [short(last.cid)]: 'Selected',
      [short(first.cid)]: 'Superseded',
      [short(broken.cid)]: 'Superseded',
    });
    expect(await text('.procedural-editor')).toContain('Use this result: It has no render frames: continue editing it');
    expect(await text('.procedural-editor')).toContain('Hand-authored');
    const bound = (await all().CyberiaItemCatalog.bindingsOf(['violet-skin'])).get('violet-skin').cid;
    expect(
      await until(async () => (await text('.procedural-editor [data-part="config"]')).includes(short(broken.cid))),
    ).toBe(true);
    await shot('population-item-author', '.procedural-editor');
    const sources = await text('.procedural-editor [data-part="config"]');
    expect(sources).toContain(`Current binding`);
    expect(sources).toContain(short(bound));
    expect(sources).toContain(short(first.cid));
    expect(await text('.procedural-editor [data-part="primary"]')).toContain(`Opens ${short(last.cid)}.`);
    await page.evaluate(
      (cid) => document.querySelector(`input[name="author-source-violet-skin"][value="${cid}"]`).click(),
      bound,
    );
    await press('.procedural-editor [data-part="primary"] .procedural-action', 'Open Object Layer Studio');
    expect(await page.evaluate(() => window.studio)).toEqual({ cid: bound, review: `population:${id}:violet-skin` });
    await page.evaluate(() => document.querySelector('input[name="author-start-violet-skin"][value="empty"]').click());
    expect(await text('.procedural-editor [data-part="primary"]')).toContain('Opens an empty skin canvas.');
    await press('.procedural-editor [data-part="primary"] .procedural-action', 'Open Object Layer Studio');
    expect(await page.evaluate(() => window.studio)).toEqual({ review: `population:${id}:violet-skin` });
    await act(first.cid, 'Use this result');
    expect(
      await until(
        async () => (await read()).find(({ itemId }) => itemId === 'violet-skin').definitionCid === first.cid,
      ),
    ).toBe(true);
    await visit('&step=items&item=violet-skin');
    expect(await until(async () => (await rows())[short(first.cid)] === 'Selected')).toBe(true);
    expect((await rows())[short(last.cid)]).toBe('Saved');

    await act(last.cid, 'Delete');
    expect(await until(async () => !(await all().ObjectLayer.exists({ cid: last.cid })))).toBe(true);
    expect(await until(async () => !(short(last.cid) in (await rows())))).toBe(true);

    await press('.procedural-editor [data-part="footer"] .procedural-action', 'Reset item');
    expect(
      await until(async () => {
        const target = (await read()).find(({ itemId }) => itemId === 'violet-skin');
        return target.definitionCid === '' && target.resolution === 'keep';
      }),
    ).toBe(true);
    expect(await all().ObjectLayer.exists({ cid: first.cid })).toBeNull();
    expect(await all().ObjectLayer.exists({ cid: broken.cid })).toBeNull();
    expect(await until(async () => Object.keys(await rows()).length === 0)).toBe(true);
    expect(
      await until(() =>
        page.evaluate(() => window.notes.some(({ html }) => html.startsWith('violet-skin starts clean'))),
      ),
    ).toBe(true);
    expect(await until(async () => (await text('.procedural-editor')).includes('Kept ·'))).toBe(true);
    expect(errors, errors.join(' | ')).toEqual([]);
  }, 120000);

  it('keeps the actions of a long confirmation in view on a small screen', async () => {
    await page.setViewportSize({ width: 360, height: 560 });
    await visit('&step=items');
    await page.evaluate((style) => {
      document.querySelector('.theme-style').insertAdjacentHTML('beforebegin', style);
      window.restoreConfirm();
      window.answer = window
        .confirmDialog({
          id: 'confirm-probe',
          danger: true,
          confirmLabel: 'Delete result',
          html: async () =>
            '<div class="in section-mp">' + 'Generated · violet-skin · revision 3. '.repeat(60) + '</div>',
        })
        .catch((error) => (window.failure = String(error?.stack ?? error)));
    }, ROOT_STYLE);
    expect(
      await until(
        () => page.evaluate(() => Boolean(document.querySelector('.btn-confirm-confirm-probe') || window.failure)),
        10000,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => window.failure ?? '')).toBe('');
    await new Promise((done) => setTimeout(done, 400));
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector('.modal.confirm-probe').getBoundingClientRect();
      const inView = (node) => {
        const box = node.getBoundingClientRect();
        return (
          box.top >= Math.max(0, dialog.top) &&
          box.left >= Math.max(0, dialog.left) &&
          box.bottom <= Math.min(innerHeight, dialog.bottom) &&
          box.right <= Math.min(innerWidth, dialog.right)
        );
      };
      const body = document.querySelector('.confirm-modal-body-confirm-probe');
      return {
        confirm: inView(document.querySelector('.btn-confirm-confirm-probe')),
        cancel: inView(document.querySelector('.btn-cancel-confirm-probe')),
        label: document.querySelector('.btn-confirm-confirm-probe').textContent.includes('Delete result'),
        scrolls: body.scrollHeight > body.clientHeight,
        focus: document.activeElement.classList.contains('btn-cancel-confirm-probe'),
        page: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(layout).toEqual({
      confirm: true,
      cancel: true,
      label: true,
      scrolls: true,
      focus: true,
      page: true,
    });
    await shot('population-confirm-small-screen');
    await page.locator('.btn-confirm-confirm-probe').click();
    expect(await page.evaluate(() => window.answer)).toEqual({ status: 'confirm' });
    expect(errors, errors.join(' | ')).toEqual([]);
  });
});
