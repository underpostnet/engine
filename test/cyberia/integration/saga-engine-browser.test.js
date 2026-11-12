// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';
import { REPORT_GATES, REPORT_STATUS } from '../../../src/projects/cyberia/saga/saga-report.js';

const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};
const STEPS = ['theme', 'composition', 'maps', 'quests', 'dialogues', 'actions', 'abilities', 'package'];
const PACKAGE = {
  schemaVersion: 2,
  foundationVersion: '3.0.0',
  saga: { code: 'ash-relay', name: 'Ash Relay', description: 'A relay goes quiet.' },
  references: ['character.drift-merchant'],
  definitions: [
    {
      id: 'quest.relay-first',
      name: 'Relay First',
      description: 'Talk to the merchant.',
      role: 'The first quest.',
      provider: 'character.drift-merchant',
    },
    { id: 'action.relay-stall', name: 'Relay Stall', provider: 'character.drift-merchant' },
  ],
};
const candidate = (revision, kind) => ({
  revision,
  kind,
  digest: `sha256:${revision}`,
  sagaCode: 'ash-relay',
  name: 'Ash Relay',
  definitions: 2,
  generation: kind === 'generated' ? 1 : null,
  parent: revision > 1 ? revision - 1 : null,
  actor: 'moderator-1',
  at: '2026-11-02T10:00:00.000Z',
});
const workflow = (extra = {}) => ({
  _id: 'wf-1',
  sagaCode: 'ash-relay',
  name: 'Ash Relay',
  stage: 'draft',
  context: {
    prompt: 'A relay keeper',
    saga: { code: 'ash-relay', name: 'Ash Relay', description: '' },
    reuse: [],
    sagas: [],
  },
  base: { source: 'new', digest: '', checkoutRevision: '' },
  candidates: [candidate(1, 'generated')],
  latest: candidate(1, 'generated'),
  package: PACKAGE,
  generations: [
    {
      attempt: 1,
      status: 'completed',
      candidate: 1,
      createdAt: '2026-11-02T10:00:00.000Z',
      provenance: { contentVersion: '3.0.0', artifactRevision: 'f97587ee', checkoutRevision: 'f97587ee', model: '' },
      steps: STEPS.map((id) => ({ id, status: 'done', attempts: 1, log: [`Stage ${id}`] })),
      error: { message: '', retryable: false },
    },
  ],
  validation: null,
  applied: null,
  exclusions: [],
  history: [{ action: 'workflow.created', actor: 'moderator-1', at: '2026-11-02T10:00:00.000Z', detail: 'new saga' }],
  capabilities: { sources: true },
  ...extra,
});
const REPORT = {
  saga: { code: 'ash-relay', name: 'Ash Relay' },
  source: { kind: 'candidate', revision: 1, digest: 'sha256:1' },
  statuses: REPORT_STATUS,
  generatedAt: '2026-11-02T10:00:00.000Z',
  gates: REPORT_GATES.map(({ id, label }) => ({
    id,
    label,
    status: id === 'visual' ? 'blocked' : 'pass',
    errors: id === 'visual' ? 1 : 0,
    warnings: 0,
    excluded: 0,
    rows: 1,
  })),
  counts: { error: 1, warning: 0, ok: 1, excluded: 0 },
  rows: [
    {
      key: 'item:relay-rifle',
      category: 'items',
      gate: 'visual',
      subject: 'relay-rifle',
      status: 'missing-render',
      level: 'error',
      remedy: 'generate',
      message: 'It runs without a render: generate one or author it',
      sagas: ['ash-relay', 'frontier'],
      link: { view: 'procedural', action: 'generate-item', itemId: 'relay-rifle' },
    },
    {
      key: 'map:relay-camp',
      category: 'maps',
      gate: 'spatial',
      subject: 'relay-camp',
      status: 'shared',
      level: 'ok',
      remedy: 'none',
      message: 'shared with frontier',
      sagas: ['ash-relay', 'frontier'],
      instances: ['frontier-world'],
    },
  ],
  graphs: {
    narrative: {
      nodes: [
        { id: 'saga:ash-relay', kind: 'saga', label: 'Ash Relay', status: 'defined' },
        {
          id: 'character.drift-merchant',
          kind: 'character',
          label: 'Drift Merchant',
          status: 'foundation',
          source: 'foundation',
          link: null,
        },
        {
          id: 'quest.relay-first',
          kind: 'quest',
          label: 'Relay First',
          status: 'defined',
          source: 'ash-relay',
          link: { view: 'action-engine', questCode: 'relay-first' },
        },
        {
          id: 'weapon.relay-rifle',
          kind: 'weapon',
          label: 'Relay Rifle',
          status: 'shared',
          source: 'frontier',
          link: null,
        },
      ],
      edges: [
        { from: 'saga:ash-relay', to: 'quest.relay-first', type: 'starts' },
        { from: 'character.drift-merchant', to: 'quest.relay-first', type: 'offers' },
        { from: 'quest.relay-first', to: 'weapon.relay-rifle', type: 'reward' },
      ],
    },
    composition: {
      nodes: [
        { id: 'saga:ash-relay', kind: 'saga', label: 'Ash Relay', status: 'defined' },
        { id: 'map.relay-camp', kind: 'map', label: 'Relay Camp', status: 'shared', source: 'frontier', link: null },
        { id: 'instance:frontier-world', kind: 'instance', label: 'frontier-world', status: 'world', link: null },
      ],
      edges: [
        { from: 'saga:ash-relay', to: 'map.relay-camp', type: 'place' },
        { from: 'map.relay-camp', to: 'instance:frontier-world', type: 'in world' },
      ],
    },
  },
  sync: null,
};
const catalogRow = (code, fields) => ({
  code,
  name: code,
  description: `The ${code} saga.`,
  source: { present: true, modifiedAt: '2026-11-02T10:00:00.000Z' },
  artifact: { present: true },
  workspace: { status: 'in-sync', updatedAt: '2026-11-02T10:00:00.000Z' },
  release: null,
  workflow: null,
  counts: { maps: 1, places: 0, items: 3, quests: 1, actions: 1, dialogues: 2 },
  shared: { maps: [], items: 0 },
  instances: [code],
  placement: { maps: { done: 1, total: 1 }, quests: { done: 0, total: 1 }, actions: { done: 1, total: 1 } },
  updatedAt: '2026-11-02T10:00:00.000Z',
  ...fields,
});
const CATALOG = {
  data: [
    catalogRow('frontier', {}),
    catalogRow('ash-relay', {
      name: 'Ash Relay',
      artifact: { present: false },
      workspace: { status: 'absent', updatedAt: null },
      workflow: { _id: 'wf-1', stage: 'draft', generation: { attempt: 1, status: 'completed' } },
      counts: { maps: 0, places: 1, items: null, quests: 1, actions: 1, dialogues: null },
      instances: [],
    }),
  ],
  total: 2,
  page: 1,
  limit: 8,
  drafts: [],
  releases: [{ releaseId: 'v1', status: 'active' }],
  capabilities: { sources: true, artifact: true },
};
const SYNC = {
  saga: { code: 'ash-relay', name: 'Ash Relay' },
  applied: false,
  counts: { assigned: 0, kept: 0, choose: 1, conflict: 0, failed: 0, omitted: 0 },
  entries: [
    {
      kind: 'quest',
      code: 'relay-first',
      outcome: 'choose',
      detail: '2 entities carry drift-merchant: choose the provider',
      candidates: [
        { mapCode: 'relay-camp', cellX: 2, cellY: 3, mapRevision: 4 },
        { mapCode: 'relay-camp', cellX: 9, cellY: 9, mapRevision: 4 },
      ],
    },
  ],
  reviewed: { 'quest:relay-first': 1, 'map:relay-camp': 4 },
};

describe.skipIf(!driver || !browserBinary)('Saga Engine in a browser', () => {
  let browser, server, page, script;
  const calls = [];
  const errors = [];
  const notes = () => page.evaluate(() => window.notes.map(({ status, html }) => `${status}: ${html}`));
  const tab = (id) => page.locator(`[role="tab"][data-tab="${id}"]`).click();

  beforeAll(async () => {
    const result = await build({
      stdin: {
        contents: `import {SagaEngineCyberia} from './src/client/components/cyberia/SagaEngineCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        import {Modal} from './src/client/components/core/Modal.js';
        window.notes = [];
        NotificationManager.Push = async (options) => window.notes.push(options);
        Modal.RenderConfirm = async () => ({ status: 'confirm' });
        document.querySelector('#mount').innerHTML = await SagaEngineCyberia.render({
          appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}}
        });
        window.mounted = true;`,
        resolveDir: process.cwd(),
        sourcefile: 'saga-engine-test.js',
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
      const path = url.pathname;
      const send = (data, status = 200) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(status === 200 ? { status: 'success', data } : { status: 'error', message: data }));
      };
      if (path === '/engine.js' || path === '/grid.js') {
        res.setHeader('Content-Type', 'text/javascript');
        return res.end(path === '/engine.js' ? script : grid);
      }
      if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
          <script id="underpost-build-manifest" type="application/json">${JSON.stringify(manifest)}</script>
          <script>globalThis.html = globalThis.css = (parts, ...values) => parts.reduce((text, part, i) => text + part + (values[i] ?? ''), '');</script>
          <script src="/grid.js"></script>
          <style>body{margin:12px;font:16px sans-serif;background:#111b2b;color:#e5efff}.hide{display:none!important}</style>
          <div id="mount"></div><script type="module" src="/engine.js"></script></html>`);
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      if (path.startsWith('/api/v1/'))
        calls.push({ method: req.method, path, query: url.search, body: body ? JSON.parse(body) : null });
      if (path.endsWith('/cyberia-saga-workflow/wf-1/validate'))
        return send(
          workflow({
            stage: 'findings',
            validation: {
              revision: 1,
              digest: 'sha256:1',
              ok: false,
              checkedAt: '2026-11-02T10:01:00.000Z',
              findings: [
                {
                  id: 'quest.relay-first',
                  message: 'provider names unknown definition character.nobody',
                  path: ['definitions', 0, 'provider'],
                },
              ],
            },
          }),
        );
      if (path.endsWith('/cyberia-saga-workflow/wf-1/report')) return send(REPORT);
      if (path.endsWith('/cyberia-saga-workflow/wf-1')) return send(workflow());
      if (path.endsWith('/cyberia-saga-workflow'))
        return send({ data: [workflow()], total: 1, page: 1, totalPages: 1 });
      if (path.endsWith('/cyberia-saga/catalog'))
        return send({
          ...CATALOG,
          data: CATALOG.data.filter(({ code }) => code.includes(url.searchParams.get('q') ?? '')),
        });
      if (path.endsWith('/cyberia-saga/report/frontier'))
        return send({ ...REPORT, saga: { code: 'frontier', name: 'frontier' }, source: { kind: 'artifact' } });
      if (path.endsWith('/cyberia-saga/sync/ash-relay'))
        return req.method === 'POST'
          ? send({ ...SYNC, applied: true, counts: { ...SYNC.counts, choose: 0, assigned: 1 } })
          : send(SYNC);
      if (path.endsWith('/cyberia-saga'))
        return send({
          data: [
            {
              code: 'ash-relay',
              name: 'Ash Relay',
              mapCodes: ['relay-camp'],
              itemIds: [],
              questCodes: [],
              actionCodes: [],
            },
          ],
          total: 1,
        });
      if (path.endsWith('/cyberia-procedural-job') && req.method === 'POST') return send('Stopped by the test', 400);
      return send({ data: [], total: 0, page: 1, totalPages: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.mounted && document.querySelector('.saga-engine-catalog-workflow'));
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((done) => (server ? server.close(done) : done()));
  });

  it('lists the sagas of the host with the state of each source, and filters them', async () => {
    const cards = page.locator('.saga-engine-card');
    expect(await cards.count()).toBe(2);
    const imported = await cards.nth(0).textContent();
    expect(imported).toContain('Imported, as built');
    expect(imported).toContain('No workflow');
    expect(imported).toContain('Quests placed 0/1');
    const draft = await cards.nth(1).textContent();
    expect(draft).toContain('Not built');
    expect(draft).toContain('Not imported');
    expect(draft).toContain('Workflow: Draft, not checked');
    expect(await page.locator('.saga-engine-catalog-open').count()).toBe(1);
    await page.locator('.saga-engine-filter-more summary').click();
    await page.locator('[data-block="catalog"][data-key="workspace"]').selectOption('in-sync');
    await page.waitForFunction(() =>
      document.querySelector('.saga-engine-catalog-status').textContent.includes('saga(s)'),
    );
    expect(calls.filter(({ path }) => path === '/api/v1/cyberia-saga/catalog').at(-1).query).toContain(
      'workspace=in-sync',
    );
    await page.locator('[data-block="catalog"][data-key="workspace"]').selectOption('');
    await page.locator('[data-block="catalog"][data-key="q"]').fill('ash');
    await page.waitForFunction(() => document.querySelectorAll('.saga-engine-card').length === 1);
    await page.locator('[data-block="catalog"][data-key="q"]').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.saga-engine-card').length === 2);
  });

  it('opens the workflow of a saga on its generation, step by step', async () => {
    await page.locator('.saga-engine-catalog-workflow').click();
    await tab('context');
    await page.waitForSelector('.saga-engine-step');
    expect(await page.locator('.saga-engine-title').textContent()).toContain('Ash Relay');
    expect(await page.locator('.saga-engine-step[data-status="done"]').count()).toBe(STEPS.length);
    expect(await page.locator('[data-context="prompt"]').inputValue()).toBe('A relay keeper');
    expect(await page.locator('.saga-engine-context').textContent()).toContain('Generation 1');
  });

  it('shows the package with its definitions, and each finding of a check at its path', async () => {
    await tab('package');
    await page.waitForSelector('.saga-package-editor .jse-main');
    expect(await page.locator('.saga-package-summary').textContent()).toContain('quest.relay-first');
    expect(await page.locator('.saga-package-state').textContent()).toContain('not checked yet');
    await page.locator('.saga-package-validate').click();
    await page.waitForSelector('.saga-package-findings [data-finding]');
    expect(await page.locator('.saga-package-findings').textContent()).toContain(
      'provider names unknown definition character.nobody',
    );
    expect(await page.locator('.saga-package-apply').isDisabled()).toBe(true);
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/cyberia-saga-workflow/wf-1/validate',
        body: { revision: 1 },
      }),
    );
  });

  it('shows the gates and each gap with the editor that resolves it', async () => {
    await tab('completeness');
    await page.waitForSelector('.saga-report-completeness .saga-report-gate');
    expect(
      await page.locator('.saga-report-completeness .saga-report-gate[data-state="blocked"]').textContent(),
    ).toContain('Visual and physical');
    const gap = page.locator('.saga-report-completeness .saga-report-row[data-level="error"]');
    expect(await gap.textContent()).toContain('Missing render or atlas');
    expect(await gap.textContent()).toContain('Sagas: ash-relay, frontier');
    expect(await gap.locator('.saga-report-link').textContent()).toContain('Generate variants');
    await gap.locator('.saga-report-link').click();
    await page.waitForFunction(() => window.notes.some(({ status }) => status === 'error'));
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/cyberia-procedural-job',
        body: { mode: 'update-existing', source: { itemIds: ['relay-rifle'] }, output: { variantsPerItem: 2 } },
      }),
    );
  });

  it('asks for the provider of an ambiguous quest and sends the choice with the reviewed revisions', async () => {
    await tab('integration');
    await page.waitForSelector('.saga-sync-saga-engine .saga-sync-choices input[type="radio"]');
    expect(await page.locator('.saga-sync-saga-engine .saga-sync-choices input[type="radio"]').count()).toBe(2);
    await page.locator('.saga-sync-saga-engine .saga-sync-choices input[type="radio"]').nth(1).check();
    await page.locator('.btn-saga-sync-apply-saga-engine').click();
    await page.waitForFunction(() => window.notes.some(({ html }) => html.includes('1 assigned')));
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/cyberia-saga/sync/ash-relay',
        body: {
          selections: [
            { kind: 'quest', code: 'relay-first', mapCode: 'relay-camp', cellX: 9, cellY: 9, mapRevision: 4 },
          ],
          reviewed: SYNC.reviewed,
        },
      }),
    );
  });

  it('opens a stored saga without a workflow on its narrative and content graphs', async () => {
    await tab('workspace');
    await page.locator('.saga-engine-catalog-open').click();
    await page.waitForSelector('.saga-report-completeness .saga-report-gate');
    expect(await page.locator('.saga-engine-title').textContent()).toContain('frontier');
    expect(calls.map(({ path }) => path)).toContain('/api/v1/cyberia-saga/report/frontier');
    await tab('graphs');
    await page.waitForSelector('.saga-graph-node');
    expect(await page.locator('.saga-graph-node').count()).toBe(4);
    expect(await page.locator('.saga-graph-edge').count()).toBe(3);
    await page.locator('.saga-graph-node[data-node="quest.relay-first"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.saga-graph[data-picking="true"]');
    const details = await page.locator('.saga-graph-details').textContent();
    expect(details).toContain('Relay First');
    expect(details).toContain('reward');
    expect(details).toContain('offers');
    expect(await page.locator('.saga-graph-node[data-near="false"]').count()).toBe(0);
    await page.locator('.saga-graph-open').click();
    await page.waitForFunction(() => window.notes.some(({ html }) => html.includes('does not offer that editor')));
    await page.locator('.saga-graph-toggle[data-value="list"]').click();
    expect(await page.locator('.saga-graph tbody tr').count()).toBe(3);
    await page.locator('.saga-graph-toggle[data-value="composition"]').click();
    expect(await page.locator('.saga-graph tbody').textContent()).toContain('place');
    await page.locator('.saga-graph-toggle[data-value="graph"]').click();
    expect(await page.locator('.saga-graph-node').count()).toBe(3);
    expect(await page.locator('.saga-graph-edge[data-class="shared"]').count()).toBe(1);
  });

  it('fits a mobile viewport without a horizontal scroll', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['workspace', 'context', 'package', 'completeness', 'graphs', 'audit']) {
      await tab(id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), id).toBe(true);
      if (process.env.CYBERIA_UI_SCREENSHOTS) {
        await mkdir(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
        await page.screenshot({
          path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, `saga-engine-${id}.png`),
          fullPage: true,
        });
      }
    }
    expect(errors).toEqual([]);
    expect(await notes()).not.toContainEqual(expect.stringContaining('undefined'));
  });
});
