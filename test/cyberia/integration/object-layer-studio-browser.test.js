// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';
import { writeProceduralArtifact } from '../../support/procedural-content.js';
import { DEFAULT_PROFILES } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { importPaletteDefaults, proceduralConfig } from '../../../src/projects/cyberia/procedural/spec.js';
import { sourceFromDirectionFrames, toWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';
import { STAT_TYPES, statBoundsForType } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

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
const frames = toWire(
  sourceFromDirectionFrames({
    framesByCode: {
      '08': [
        [
          [
            [200, 40, 40, 255],
            [0, 0, 0, 0],
          ],
          [
            [0, 0, 0, 0],
            [40, 40, 200, 255],
          ],
        ],
      ],
    },
    frameDurationMs: 120,
  }),
);

describe.skipIf(!driver || !browserBinary)('the Object Layer Studio in a browser', () => {
  let browser, server, page;
  const imported = [];
  const errors = [];

  beforeAll(async () => {
    vi.stubEnv(
      'CYBERIA_CONTENT_ROOT',
      writeProceduralArtifact({
        'aether-agent': {
          artBrief: { paletteDirection: 'Black #000000 and #2a2a2a, white #EEEEEE, violets #350035.' },
        },
      }),
    );
    const config = await proceduralConfig(models);
    const result = await build({
      stdin: {
        contents: `import {ObjectLayerEngineModal} from './src/client/components/objectlayer-studio/ObjectLayerEngineModal.js';
        import {CyberiaObjectLayerProfile} from './src/client/components/cyberia/ObjectLayerProfileCyberia.js';
        import {CyberiaObjectLayerStudio} from './src/client/components/cyberia/ObjectLayerStudioCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        import {DropDown} from './src/client/components/core/DropDown.js';
        window.notes = [];
        window.studio = {modal: ObjectLayerEngineModal, DropDown};
        NotificationManager.Push = async (options) => window.notes.push(options);
        document.querySelector('#mount').innerHTML = await ObjectLayerEngineModal.instance({
          idModal: 'modal-object-layer-engine',
          appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}},
          profile: CyberiaObjectLayerProfile,
          studio: CyberiaObjectLayerStudio,
        });
        window.mounted = true;`,
        resolveDir: process.cwd(),
        sourcefile: 'object-layer-studio-test.js',
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
    const script = result.outputFiles[0].text;
    const grid = readFileSync(resolve('node_modules/ag-grid-community/dist/ag-grid-community.min.js'), 'utf8');
    server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const send = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'success', data }));
      };
      if (url.pathname === '/studio.js' || url.pathname === '/grid.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(url.pathname === '/studio.js' ? script : grid);
      }
      if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
          <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
          <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
          <script src="/grid.js"></script>
          <div id="mount"></div><script type="module" src="/studio.js"></script></html>`);
      }
      if (url.pathname.includes('/object-layer/context/')) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ status: 'error', message: 'No foundation definition labels this item' }));
      }
      if (url.pathname.endsWith('/cyberia-procedural-profile/config')) return send(config);
      if (url.pathname.endsWith('/cyberia-procedural-profile/import-palette'))
        return send(
          importPaletteDefaults({
            itemId: url.searchParams.get('itemId') ?? '',
            paletteId: url.searchParams.get('paletteId') ?? '',
          }),
        );
      if (url.pathname.endsWith('/object-layer/import-frames')) {
        let body = '';
        for await (const chunk of req) body += chunk;
        imported.push(JSON.parse(body));
        return send({ frames: 1, accepted: 0, rejected: 0, frameDurationMs: 120, renderFrames: frames });
      }
      return send({ data: [], total: 0, page: 1, totalPages: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.mounted && document.querySelector('.ol-select-stat-bounds'));
    await page.waitForFunction(() => document.querySelectorAll('.ol-import-palette .procedural-slot').length > 0);
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((done) => (server ? server.close(done) : done()));
    vi.unstubAllEnvs();
  });

  const text = (selector) => page.evaluate((selector) => document.querySelector(selector)?.innerText ?? '', selector);

  /** What the stats section shows: the bounds it names, each range and value, and its problems. */
  const stats = () =>
    page.evaluate((keys) => {
      const input = (key) => document.querySelector(`input.ol-input-item-stats-${key}`);
      return {
        bounds: document.querySelector('.ol-select-stat-bounds').selectedOptions[0].textContent.trim(),
        ranges: Object.fromEntries(
          keys.map((key) => [key, document.querySelector(`.ol-stat-range-${key}`).textContent]),
        ),
        values: Object.fromEntries(keys.map((key) => [key, Number(input(key).value)])),
        invalid: keys.filter((key) => input(key).getAttribute('aria-invalid') === 'true'),
        problems: document.querySelector('.ol-stats-problems').textContent.trim(),
        correct: !document.querySelector('.ol-btn-correct-stats').hidden,
      };
    }, STAT_TYPES);

  /** The import palette editor: the palette it shows, and the color and origin of each slot. */
  const importPalette = () =>
    page.evaluate(() => ({
      shown: !document.querySelector('.ol-import-palette').hidden,
      palette: document.querySelector('.dropdown-current-procedural-palette-object-layer-import')?.textContent.trim(),
      slots: Object.fromEntries(
        [...document.querySelectorAll('.ol-import-palette .procedural-slot')].map((card) => [
          card.querySelector('input').getAttribute('aria-label').replace(' color', ''),
          card.querySelector('.procedural-slot-value').textContent,
        ]),
      ),
    }));

  /** Imports frames as the author does, and waits for the answer to show. */
  const importFrames = async () => {
    const before = imported.length;
    await page.evaluate(() => {
      window.studio.DropDown.Tokens['ol-dropdown-import-frames'] = {
        ...window.studio.DropDown.Tokens['ol-dropdown-import-frames'],
        value: 'violet-skin',
      };
      document.querySelector('.ol-btn-import-frames').click();
    });
    await page.waitForFunction(
      (count) => window.notes.filter(({ html }) => html.includes('imported')).length > count,
      before,
    );
    return imported.at(-1);
  };

  /** Sets the color of one slot of the import palette, as a pick in its color input does. */
  const setSlot = (slot, color) =>
    page.evaluate(
      ([id, value]) => {
        const input = document.querySelector(`.ol-import-palette input[aria-label="${id} color"]`);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      },
      [slot, color],
    );

  it('bounds the stats by the item type: ranges, a draw inside them, a refused value and its correction', async () => {
    await page.click('.ol-tabs [role="tab"][data-tab="item"]');
    await page.evaluate(() => document.querySelector('.dropdown-option-ol-dropdown-item-type-weapon').click());
    const weapon = statBoundsForType('weapon');
    const shown = await stats();
    expect(shown.bounds).toBe('weapon · STAT_TYPE_BOUNDS');
    expect(shown.ranges).toEqual(Object.fromEntries(STAT_TYPES.map((key) => [key, weapon[key].join(' — ')])));

    await page.evaluate(() => document.querySelector('.ol-btn-randomize-stats').click());
    const drawn = await stats();
    for (const key of STAT_TYPES) {
      expect(drawn.values[key]).toBeGreaterThanOrEqual(weapon[key][0]);
      expect(drawn.values[key]).toBeLessThanOrEqual(weapon[key][1]);
    }
    expect(drawn).toMatchObject({ invalid: [], problems: '', correct: false });

    await page.fill('input.ol-input-item-stats-effect', '99');
    await page.dispatchEvent('input.ol-input-item-stats-effect', 'change');
    expect(await stats()).toMatchObject({
      invalid: ['effect'],
      problems: `Outside the weapon bounds: Effect 99 (${weapon.effect[0]} to ${weapon.effect[1]}).`,
      correct: true,
    });
    await page.evaluate(() => document.querySelector('.ol-btn-correct-stats').click());
    const corrected = await stats();
    expect(corrected).toMatchObject({ invalid: [], problems: '', correct: false });
    expect(corrected.values.effect).toBe(weapon.effect[1]);
    expect(errors).toEqual([]);
  });

  it('takes custom bounds inside the stat contract: draws inside them, and names a value or a range outside', async () => {
    await page.selectOption('.ol-select-stat-bounds', 'custom');
    expect(await page.isVisible('.ol-stat-custom-effect')).toBe(true);
    expect(await page.isVisible('.ol-stat-range-effect')).toBe(false);
    await page.fill('.ol-stat-min-effect', '30');
    await page.fill('.ol-stat-max-effect', '40');
    await page.evaluate(() => document.querySelector('.ol-btn-randomize-stats').click());
    const drawn = await stats();
    expect(drawn.values.effect).toBeGreaterThanOrEqual(30);
    expect(drawn.values.effect).toBeLessThanOrEqual(40);
    expect(drawn).toMatchObject({ bounds: 'Custom bounds', problems: '' });

    await page.fill('.ol-stat-min-effect', '50');
    expect((await stats()).problems).toBe('Custom bounds: effect: the minimum 50 is above the maximum 40.');
    await page.fill('.ol-stat-min-effect', '30');
    await page.fill('input.ol-input-item-stats-effect', '99');
    expect(await stats()).toMatchObject({
      invalid: ['effect'],
      problems: 'Outside the custom bounds: Effect 99 (30 to 40).',
    });
    await page.evaluate(() => document.querySelector('.ol-btn-correct-stats').click());
    expect((await stats()).values.effect).toBe(40);
    await page.selectOption('.ol-select-stat-bounds', 'contract');
    expect(await page.isVisible('.ol-stat-custom-effect')).toBe(false);
    expect(errors).toEqual([]);
  });

  it('paints n × n cells with a brush of size n, and keeps no palette section in Paint', async () => {
    await page.click('.ol-tabs [role="tab"][data-tab="paint"]');
    expect(await page.$('.ol-palette-panel')).toBeNull();
    expect(await text('.ol-tabs')).not.toContain('Palettes');
    const painted = async (size) => {
      const box = await page.evaluate((size) => {
        const editor = document.querySelector('object-layer-engine');
        editor.clear();
        editor.setBrushSize(size);
        const canvas = editor.shadowRoot.querySelector('canvas[part="canvas"]');
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left, y: rect.top, cell: rect.width / canvas.width };
      }, size);
      await page.mouse.click(box.x + 8.5 * box.cell, box.y + 8.5 * box.cell);
      return page.evaluate(() =>
        document
          .querySelector('object-layer-engine')
          .getFrame()
          .flatMap((row, y) => row.flatMap((cell, x) => (cell[3] > 0 ? [`${x},${y}`] : []))),
      );
    };
    expect(await painted(1)).toEqual(['8,8']);
    expect(await painted(2)).toEqual(['8,8', '9,8', '8,9', '9,9']);
    expect(await painted(3)).toHaveLength(9);
    expect(await painted(3)).toContain('7,7');
    expect(errors).toEqual([]);
  });

  it('mutates imported frames in the procedural palette slots: the foundation of the item, any library palette, a color per slot', async () => {
    await page.click('.ol-tabs [role="tab"][data-tab="frames"]');
    expect((await importPalette()).shown).toBe(false);
    // The toggle has no size without the global stylesheet of the app.
    await page.dispatchEvent('div.ol-toggle-import-mutate', 'click');
    await page.waitForFunction(
      () =>
        document.querySelector('.dropdown-current-procedural-palette-object-layer-import')?.textContent.trim() ===
        'Default colors',
    );
    const library = await importPalette();
    expect(library).toMatchObject({ shown: true, palette: 'Default colors' });
    const previews = await page.evaluate(() =>
      [...document.querySelectorAll('[class*="dropdown-option-procedural-palette-object-layer-import-"]')]
        .filter((option) => option.querySelector('.procedural-swatch'))
        .map((option) =>
          [...option.querySelectorAll('.procedural-swatch')].every(
            (swatch) => getComputedStyle(swatch).width === '16px' && swatch.style.background,
          ),
        ),
    );
    expect(previews.length).toBeGreaterThan(0);
    expect(previews.every(Boolean)).toBe(true);
    expect(Object.values(library.slots).every((value) => value.startsWith('palette #'))).toBe(true);

    await page.evaluate(() => {
      const input = document.querySelector('.ol-input-item-id');
      input.value = 'aether-agent';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() =>
      document.querySelector('.ol-import-palette .procedural-slot-value')?.textContent.startsWith('foundation'),
    );
    // The dropdown names its choice a moment after it draws.
    await page.waitForFunction(
      () =>
        document.querySelector('.dropdown-current-procedural-palette-object-layer-import')?.textContent.trim() ===
        'Foundation palette',
    );
    expect(await importFrames()).toMatchObject({ mutate: true, palette: { slots: {} }, target: 'aether-agent' });

    await page.evaluate(() =>
      document.querySelector('.dropdown-option-procedural-palette-object-layer-import-exotic-teal').click(),
    );
    await page.waitForFunction(() =>
      document.querySelector('.ol-import-palette .procedural-slot-value')?.textContent.startsWith('palette'),
    );
    await setSlot('primary', '#123456');
    await setSlot('outline', '#010101');
    expect((await importPalette()).slots).toMatchObject({ primary: '#123456', outline: '#010101' });
    expect((await importFrames()).palette).toEqual({
      paletteId: 'exotic-teal',
      slots: { primary: '#123456', outline: '#010101' },
    });

    await page.evaluate(() =>
      document
        .querySelector('.ol-import-palette input[aria-label="outline color"]')
        .closest('.procedural-slot')
        .querySelector('.procedural-slot-clear')
        .click(),
    );
    expect((await importFrames()).palette).toEqual({ paletteId: 'exotic-teal', slots: { primary: '#123456' } });
    await page.evaluate(() =>
      [...document.querySelectorAll('.ol-import-palette .procedural-palette-tools button')]
        .find(({ textContent }) => textContent.includes('Reset'))
        .click(),
    );
    expect((await importFrames()).palette).toEqual({ paletteId: 'exotic-teal', slots: {} });
    expect(errors).toEqual([]);
  });
});
