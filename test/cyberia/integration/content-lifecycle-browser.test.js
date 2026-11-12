// Requires Playwright and UNDERPOST_BROWSER_BIN. CYBERIA_BROWSER_DRIVER can name its module path.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBinary } from '../../support/binary.js';
import {
  LIFECYCLE_STAGE_ORDER,
  LIFECYCLE_STAGES,
  executionTarget,
  lifecyclePlan,
  lifecycleSummary,
  stageExecution,
} from '../../../src/projects/cyberia/content/content-lifecycle.js';
import { shareView } from '../../../src/projects/cyberia/content/content-lifecycle-share.js';
import { MONITOR_SOURCES } from '../../../src/projects/cyberia/content/content-lifecycle-monitor.js';

// The compiled monitor against the projections the engine serves, in each context an engine reads:
// the central cycles of a production container, the cycle a workstation reads through a share with
// its own Development Sandbox, and a share that ended.
const driver = await import(process.env.CYBERIA_BROWSER_DRIVER || 'playwright').catch(() => null);
const browserBinary = findBinary('chromium', 'UNDERPOST_BROWSER_BIN');
const manifest = {
  schema: 1,
  application: 'cyberia-portal',
  version: 'test',
  build: { id: 'test', mode: 'production' },
  runtime: { basePath: '/', apiBasePath: 'api/v1' },
};
const AT = '2026-11-05T10:00:00.000Z';
const TOKEN = 'T'.repeat(43);
const PEER = 'homelab-a-asus-a15';
const SANDBOX = {
  ...executionTarget('sandbox', `${PEER}/kind`, {
    sandboxId: 'kind',
    kubeContext: 'kind-kind',
    kubeSystemUid: 'uid-1',
    namespace: 'default',
    replicaSetId: '6720aa000000000000000001',
    database: 'cyberia',
    contentDatabase: 'cyberia-content',
  }),
  databases: ['cyberia', 'cyberia-content', 'cyberia-content-v3-4-5'],
};
const OTHER = executionTarget('sandbox', 'homelab-a-other/kind', { sandboxId: 'kind', kubeSystemUid: 'uid-9' });
const control = { node: { nodeName: 'localhost.localdomain', role: 'control', peerId: 'homelab-a' }, contexts: [] };
const workstation = (targets) => ({ node: { nodeName: 'asus-a15', role: 'workstation', peerId: PEER }, targets });

const cycleOf = (cycleId, fields = {}) => ({
  cycleId,
  deployId: 'dd-cyberia',
  environment: 'production',
  status: 'in-progress',
  stageOrder: LIFECYCLE_STAGE_ORDER,
  scope: { sagas: ['frontier'], instances: [], maps: ['outpost'], items: ['relay-rifle'], cids: [] },
  references: {},
  executions: [],
  shares: [],
  createdBy: 'operator@control-1',
  createdAt: AT,
  updatedAt: AT,
  ...fields,
});
/** Records a stage for a host as the CLI records it. */
const record = (cycle, stageId, recorder, { status = 'succeeded', evidence = { of: stageId }, error = '' } = {}) => {
  const { execution } = stageExecution(cycle, stageId, recorder, { status, evidence, error });
  cycle.executions = [
    ...cycle.executions.filter((stored) => !(stored.stage === stageId && stored.targetId === execution.targetId)),
    { ...execution, eventId: `event-${stageId}@${execution.targetId}`, node: recorder.node, at: AT },
  ];
};

const OPEN = cycleOf('dd-cyberia-202611051000-a1b2c3', {
  references: { backupId: '20261105T100000Z-b4c4c4', baselineId: '20261105T100500Z-d5d5d5' },
});
for (const id of ['preflight', 'infrastructure-backup', 'baseline-capture', 'baseline-verify'])
  record(OPEN, id, control);
record(OPEN, 'baseline-restore', workstation({ sandbox: OTHER }));
OPEN.shares = [
  {
    shareId: 'share-1',
    peerId: PEER,
    nodeName: 'asus-a15',
    address: '10.0.0.2:7735',
    tokenDigest: 'sha256:digest',
    openedAt: AT,
    expiresAt: '2099-01-01T00:00:00.000Z',
    leaseUntil: '2099-01-01T00:00:00.000Z',
    closedAt: null,
    closeReason: '',
  },
];
const DONE = cycleOf('dd-cyberia-202611040900-f0f0f0', { references: { releaseId: 'v3-4-5-8b4d643-04f978b0' } });
for (const { id, target } of LIFECYCLE_STAGES)
  record(
    DONE,
    id,
    target === 'deployment'
      ? control
      : workstation({ sandbox: OTHER, source: executionTarget('source', 'homelab-a-other/cyberia-content', {}) }),
  );
const CYCLES = { [OPEN.cycleId]: OPEN, [DONE.cycleId]: DONE };
const EVENTS = [
  {
    eventId: 'event-restore',
    cycleId: OPEN.cycleId,
    seq: 6,
    stage: 'baseline-restore',
    operation: 'stage.record',
    status: 'succeeded',
    actor: 'dev@other',
    node: { nodeName: 'other', role: 'workstation', peerId: 'homelab-a-other' },
    executionTargetId: OTHER.id,
    shareId: 'share-0',
    completedAt: AT,
    resultSummary: { baselineId: OPEN.references.baselineId },
    references: {},
  },
  {
    eventId: 'event-baseline-verify',
    cycleId: OPEN.cycleId,
    seq: 5,
    stage: 'baseline-verify',
    operation: 'stage.record',
    status: 'succeeded',
    actor: 'operator@control-1',
    node: control.node,
    executionTargetId: 'deployment:dd-cyberia/production',
    completedAt: AT,
    resultSummary: { baselineId: OPEN.references.baselineId, verifiedAt: AT },
    references: {},
  },
];

/** What the engine answers in each context: its runtime, its cycles and the targets it observes. */
const CONTEXTS = {
  production: {
    runtime: {
      source: { kind: 'central', description: MONITOR_SOURCES.central },
      node: { hostname: 'dd-cyberia-production-blue', nodeName: '', role: '', peerId: '' },
      container: true,
      share: null,
      sandbox: null,
    },
    cycles: [OPEN, DONE],
    targets: {},
  },
  workstation: {
    runtime: {
      source: { kind: 'share', description: MONITOR_SOURCES.share },
      node: { hostname: 'asus-a15', nodeName: 'asus-a15', role: 'workstation', peerId: PEER },
      container: false,
      share: { state: 'connected', message: '', address: '10.0.0.2:7735', cycleId: OPEN.cycleId },
      sandbox: {
        state: 'ready',
        message: '',
        target: { id: SANDBOX.id, fingerprint: SANDBOX.fingerprint, identity: SANDBOX.identity },
        session: {
          sandboxId: 'kind',
          startedAt: AT,
          kubeContext: 'kind-kind',
          namespace: 'default',
          fingerprint: 'sha256:s',
        },
        services: [
          {
            id: 'mongodb',
            label: 'MongoDB',
            endpoint: '127.0.0.1:27017',
            resource: 'default/pod/mongodb-0:27017',
            forward: 'ready',
            ready: true,
            detail: 'primary mongodb-0.mongodb-service:27017 of rs0',
          },
          {
            id: 'valkey',
            label: 'Valkey',
            endpoint: '127.0.0.1:6379',
            resource: 'default/svc/valkey-service:6379',
            forward: 'ready',
            ready: true,
            detail: 'PONG',
          },
          {
            id: 'ipfs-api',
            label: 'IPFS API',
            endpoint: '127.0.0.1:5001',
            resource: 'default/svc/ipfs-cluster:5001',
            forward: 'exited',
            ready: false,
            detail: 'nothing listens',
          },
        ],
        workspace: 'initialized',
        releases: ['cyberia-content-v3-4-5'],
        artifact: { version: '0.4.2', digest: 'sha256:artifact', sourceRevision: 'abcdef0123456789' },
        source: {
          id: `source:${PEER}/home/dd/engine/cyberia-content`,
          revision: '0123456789abcdef',
          branch: 'master',
          changed: true,
          head: 'Export the live baseline',
        },
      },
    },
    cycles: [OPEN],
    targets: { sandbox: SANDBOX },
  },
  expired: {
    runtime: {
      source: { kind: 'share', description: MONITOR_SOURCES.share },
      node: { hostname: 'asus-a15', nodeName: 'asus-a15', role: 'workstation', peerId: PEER },
      container: false,
      share: {
        state: 'expired',
        message: 'The share is expired: ask the control node for a new share',
        address: '10.0.0.2:7735',
        cycleId: '',
      },
      sandbox: {
        state: 'unavailable',
        message:
          'The development database 127.0.0.1:27017 is not the MongoDB of a Development Sandbox session of this host: start one with underpost sandbox up',
        target: null,
        session: null,
        services: [],
        workspace: 'unknown',
        releases: [],
        artifact: null,
        source: { message: 'This host has no cyberia-content checkout' },
      },
    },
    unavailable: 'The share is expired: ask the control node for a new share',
  },
};

describe.skipIf(!driver || !browserBinary)('the content lifecycle monitor in a browser', () => {
  let browser, server, page, script, origin;
  let context = 'production';
  const errors = [];
  const requests = [];
  const notes = () => page.evaluate(() => window.notes.map(({ status, html }) => `${status}: ${html}`));
  /** The text of an element as a reader sees it: one space between words. */
  const text = async (selector, index = 0) =>
    (await page.locator(selector).nth(index).textContent()).replace(/\s+/g, ' ');
  const open = async (path = '/', ready = '.content-lifecycle-cycle') => {
    await page.goto(`${origin}${path}`);
    await page.waitForFunction((selector) => window.mounted && document.querySelector(selector), ready);
    await page.waitForFunction(
      () => !document.querySelector('.content-lifecycle-source-body')?.textContent.includes('Reading'),
    );
  };

  beforeAll(async () => {
    const result = await build({
      stdin: {
        contents: `import {ContentLifecycleCyberia} from './src/client/components/cyberia/ContentLifecycleCyberia.js';
        import {NotificationManager} from './src/client/components/core/NotificationManager.js';
        window.notes = [];
        NotificationManager.Push = async (options) => window.notes.push(options);
        document.querySelector('#mount').innerHTML = await ContentLifecycleCyberia.render({
          appStore: {Data: {user: {main: {model: {user: {role: 'moderator'}}}}}}
        });
        window.mounted = true;`,
        resolveDir: process.cwd(),
        sourcefile: 'content-lifecycle-test.js',
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
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const engine = CONTEXTS[context];
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
      if (path === '/api/v1/cyberia-content-lifecycle/runtime') return send(engine.runtime);
      if (engine.unavailable) return send(engine.unavailable, 503);
      if (path === '/api/v1/cyberia-content-lifecycle')
        return send({
          data: engine.cycles.map((cycle) => lifecycleSummary(cycle, { targets: engine.targets })),
          total: engine.cycles.length,
          page: 1,
          totalPages: 1,
        });
      if (path.startsWith('/api/v1/cyberia-content-lifecycle/')) {
        const cycle = engine.cycles.find(({ cycleId }) => cycleId === decodeURIComponent(path.split('/').pop()));
        return cycle
          ? send({
              ...lifecyclePlan(cycle, { targets: engine.targets }),
              unobserved: {},
              shares: cycle.shares.map((share) => shareView(share)),
            })
          : send('No content lifecycle', 404);
      }
      if (path === '/api/v1/cyberia-content-lifecycle-event') {
        const data = EVENTS.filter(({ cycleId }) => cycleId === url.searchParams.get('cycleId'));
        return send({ data, total: data.length, page: 1, totalPages: 1 });
      }
      return send({ data: [], total: 0, page: 1, totalPages: 0 });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await driver.chromium.launch({ executablePath: browserBinary, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((done) => (server ? server.close(done) : done()));
  });

  beforeEach(() => {
    requests.length = 0;
  });

  it('production: lists the central cycles, with no local sandbox, and reaches only its own engine', async () => {
    context = 'production';
    await open();
    const source = await text('.content-lifecycle-source');
    expect(source).toContain('Central lifecycle');
    expect(source).toContain(MONITOR_SOURCES.central);
    expect(await page.locator('.content-lifecycle-sandbox').isHidden()).toBe(true);
    const cards = page.locator('.content-lifecycle-cycle');
    expect(await cards.count()).toBe(2);
    expect(await cards.nth(0).textContent()).toContain('Next: Development workspace reset');
    expect(await cards.nth(1).textContent()).toContain('Every stage is complete');

    await cards.nth(0).click();
    await page.waitForSelector('.content-lifecycle-stage');
    expect(await text('.content-lifecycle-title')).toBe(`Cycle ${OPEN.cycleId}`);
    expect(await page.locator('.content-lifecycle-stage').count()).toBe(LIFECYCLE_STAGES.length);
    // A stage complete for another host names that host's target, never this engine.
    const restore = await text('.content-lifecycle-stage', 4);
    expect(restore).toContain('Completed');
    expect(restore).toContain(`Development Sandbox ${OTHER.id}`);
    expect(restore).toContain('This host observes no development sandbox: the state above belongs to another host.');
    const detail = await text('.content-lifecycle-detail');
    expect(detail).toContain('Next action: Development workspace reset');
    expect(detail).toContain('Needs a workstation node, in the development environment (--dev).');
    expect(detail).toContain('Development Sandbox session that serves the development MongoDB (underpost sandbox up)');
    expect(await page.locator('.content-lifecycle-command code').allTextContents()).toEqual([
      `cyberia content workspace reset --confirm dd-cyberia --cycle ${OPEN.cycleId} --dev`,
    ]);
    await page.waitForSelector('.content-lifecycle-events-rows tbody tr');
    expect(await page.locator('.content-lifecycle-events-rows thead th').count()).toBe(6);
    expect(await page.locator('.content-lifecycle-events-rows tbody tr').first().textContent()).toContain(OTHER.id);
    expect(requests.every((url) => url.startsWith(origin))).toBe(true);
  });

  it('production: shows the node, the evidence and the shares in the operator view, and the editors in the developer view', async () => {
    await page.locator('.content-lifecycle-mode[data-mode="operator"]').click();
    expect(await page.locator('.content-lifecycle-mode[data-mode="operator"]').getAttribute('aria-pressed')).toBe(
      'true',
    );
    const detail = await text('.content-lifecycle-detail');
    expect(detail).toContain('node localhost.localdomain (control)');
    expect(detail).toContain(`${PEER} (asus-a15)`);
    expect(detail).toContain('open · opened');
    expect(detail).not.toContain('sha256:digest');
    const provenance = await page.locator('.content-lifecycle-detail th[scope="row"]').allTextContents();
    expect(provenance.slice(0, 2)).toEqual(['Infrastructure backup', 'Production baseline']);
    await page.waitForSelector('.content-lifecycle-events-rows thead th:nth-child(7)');
    expect(await page.locator('.content-lifecycle-events-rows pre').first().textContent()).toContain('"result"');

    await page.locator('.content-lifecycle-mode[data-mode="developer"]').click();
    expect(await page.locator('.content-lifecycle-editor').allTextContents()).toEqual(
      ['Saga frontier', 'Map outpost', 'Item catalog', 'Procedural Engine', 'Action Engine'].map((label) =>
        expect.stringContaining(label),
      ),
    );
    await page.locator('.content-lifecycle-editor').first().click();
    await page.waitForFunction(() => window.notes.some(({ html }) => html.includes('does not offer that editor')));
  });

  it('copies a command, or says that the browser refused the copy', async () => {
    const copy = async (writeText) => {
      await page.evaluate(
        (refuse) =>
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              writeText: async (value) => (refuse ? Promise.reject(new Error('denied')) : (window.copied = value)),
            },
          }),
        writeText === 'refuse',
      );
      await page.locator('.content-lifecycle-copy').first().click();
    };
    await copy('refuse');
    await page.waitForFunction(() => window.notes.some(({ html }) => html.includes('refused the copy')));
    await copy('accept');
    await page.waitForFunction(() => window.notes.some(({ html }) => html.includes('Command copied.')));
    expect(await page.evaluate(() => window.copied)).toBe(
      `node bin/cyberia content source export-live --baseline ${OPEN.references.baselineId} --dev`,
    );
  });

  it('workstation: reads the shared cycle through its engine, and shows its Development Sandbox apart', async () => {
    context = 'workstation';
    await open(`/?cycle=${OPEN.cycleId}`, '.content-lifecycle-stage');
    const source = await text('.content-lifecycle-source');
    expect(source).toContain('Shared cycle from the control node');
    expect(source).toContain('Connected');
    expect(source).toContain('10.0.0.2:7735');
    expect(await page.locator('.content-lifecycle-cycle').count()).toBe(1);
    expect(await text('.content-lifecycle-cycle')).toContain('Next: Development baseline restore');
    // A stage complete for this host shows no disclosure; one with executions of other targets does.
    expect(await page.locator('.content-lifecycle-stage').nth(0).locator('details').count()).toBe(0);
    // This host has its own sandbox: the restore of another host does not complete it here.
    const restore = await text('.content-lifecycle-stage', 4);
    expect(restore).toContain('Pending');
    expect(restore).toContain(`Development Sandbox ${SANDBOX.id} (this host)`);
    expect(restore).toContain('1 execution(s) by target');
    expect(await text('.content-lifecycle-detail')).toContain('Next action: Development baseline restore');

    const sandbox = await text('.content-lifecycle-sandbox');
    for (const fact of [
      'Development Sandbox: local sandbox state',
      SANDBOX.id,
      'kind-kind',
      '6720aa000000000000000001',
      'cyberia-content · initialized',
      'cyberia-content-v3-4-5',
      'primary mongodb-0.mongodb-service:27017 of rs0',
      'default/svc/valkey-service:6379',
      'Not ready',
      'modified: changes are not committed',
      'sha256:artifact',
    ])
      expect(sandbox, fact).toContain(fact);
    expect(requests.every((url) => url.startsWith(origin))).toBe(true);
    expect(await page.content()).not.toContain(TOKEN);
  });

  it('workstation: names why a share ended, and never shows it as an empty list', async () => {
    context = 'expired';
    await open('/', '.content-lifecycle-cycles-rows [role="alert"]');
    const source = await text('.content-lifecycle-source');
    expect(source).toContain('Share expired');
    expect(source).toContain('The share is expired: ask the control node for a new share');
    expect(await text('.content-lifecycle-cycles-rows')).toContain(
      'The cycles are not available: The share is expired: ask the control node for a new share',
    );
    expect(await text('.content-lifecycle-cycles-rows')).not.toContain('No cycle');
    expect(await text('.content-lifecycle-sandbox')).toContain('Local sandbox unavailable: The development database');
    expect(await page.content()).not.toContain(TOKEN);
  });

  it('fits a mobile viewport without a horizontal scroll', async () => {
    context = 'workstation';
    await page.setViewportSize({ width: 390, height: 844 });
    await open(`/?cycle=${OPEN.cycleId}`, '.content-lifecycle-command');
    for (const mode of ['developer', 'operator']) {
      await page.locator(`.content-lifecycle-mode[data-mode="${mode}"]`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), mode).toBe(true);
      if (process.env.CYBERIA_UI_SCREENSHOTS) {
        await mkdir(process.env.CYBERIA_UI_SCREENSHOTS, { recursive: true });
        await page.screenshot({
          path: resolve(process.env.CYBERIA_UI_SCREENSHOTS, `content-lifecycle-${mode}.png`),
          fullPage: true,
        });
      }
    }
    expect(errors).toEqual([]);
    expect(await notes()).not.toContainEqual(expect.stringContaining('undefined'));
  });
});
