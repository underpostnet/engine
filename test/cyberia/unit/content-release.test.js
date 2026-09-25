import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { Types } from 'mongoose';

const models = {};
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: (name) => models[name],
    getProvider: () => ({ models, partitions: {} }),
    partitionDatabase: () => '',
  },
}));
vi.mock('../../../src/api/ipfs/ipfs.client.js', () => ({ IpfsClient: {} }));

const {
  assertReleaseId,
  contentPartitionOf,
  contentReleaseRowFactory,
  publishContentRelease,
  pruneContentReleases,
  releaseDatabaseName,
  releaseDbConf,
  validateContentRelease,
} = await import('../../../src/projects/cyberia/content-release.js');
const { CyberiaContentReleaseSchema } =
  await import('../../../src/api/cyberia-content-release/cyberia-content-release.model.js');
const { objectLayerIdentity, renderContractOf } =
  await import('../../../src/api/object-layer/object-layer.identity.js');
const { MongooseDB } = await import('../../../src/db/mongo/MongooseDB.js');
const { profileRef } = await import('../../../src/client/components/object-layer/ObjectLayerProtocol.js');
const { CyberiaObjectLayerProfile } =
  await import('../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js');
const { AtlasSpriteSheetStore } = await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js');

// ── In-memory collections ────────────────────────────────────────────────────────────────

/** A deep copy that keeps ObjectIds and Dates as they are, like a driver round-trip. */
const clone = (value) => {
  if (value instanceof Types.ObjectId || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
};
const get = (doc, path) => path.split('.').reduce((node, key) => node?.[key], doc);
const matches = (doc, filter = {}) =>
  Object.entries(filter).every(([path, condition]) => {
    if (path === '$or') return condition.some((branch) => matches(doc, branch));
    const value = get(doc, path);
    if (
      condition &&
      typeof condition === 'object' &&
      !(condition instanceof Types.ObjectId) &&
      !Array.isArray(condition)
    ) {
      if ('$regex' in condition) return new RegExp(condition.$regex).test(String(value ?? ''));
      if ('$in' in condition) return condition.$in.map(String).includes(String(value));
      if ('$ne' in condition) return (value ?? null) !== condition.$ne;
    }
    return String(value) === String(condition);
  });
const sorter =
  (spec = {}) =>
  (a, b) => {
    for (const [key, order] of Object.entries(spec)) {
      const left = get(a, key) ?? null;
      const right = get(b, key) ?? null;
      if (left === right) continue;
      if (left === null) return 1;
      if (right === null) return -1;
      return (left < right ? -1 : 1) * order;
    }
    return 0;
  };

/** The query surface the release module reads through. */
class FakeModel {
  constructor(docs = [], statics = {}) {
    this.docs = docs.map((doc) => clone(doc));
    for (const [name, fn] of Object.entries(statics)) this[name] = fn.bind(this);
  }
  query(rows) {
    let result = rows;
    const query = {
      sort: (spec) => ((result = [...result].sort(sorter(spec))), query),
      lean: async () => clone(result),
      cursor: () => result.map((doc) => ({ ...clone(doc), validate: async () => {} }))[Symbol.iterator](),
      then: (resolve, reject) => query.lean().then(resolve, reject),
    };
    return query;
  }
  find(filter) {
    return this.query(this.docs.filter((doc) => matches(doc, filter)));
  }
  findOne(filter) {
    const query = this.find(filter);
    return { sort: (spec) => (query.sort(spec), this.single(query)), ...this.single(query) };
  }
  single(query) {
    return { lean: async () => (await query.lean())[0] ?? null };
  }
  findById(id) {
    const doc = this.docs.find((row) => String(row._id) === String(id));
    const value = doc ? clone(doc) : null;
    return { lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  }
  findOneAndUpdate(filter, { $set = {} }) {
    const doc = this.docs.find((row) => matches(row, filter));
    if (doc) Object.assign(doc, clone($set));
    return { lean: async () => (doc ? clone(doc) : null) };
  }
  async updateOne(filter, { $set = {}, $setOnInsert = {} }, { upsert } = {}) {
    const doc = this.docs.find((row) => matches(row, filter));
    if (doc) Object.assign(doc, $set);
    else if (upsert) this.docs.push({ ...filter, ...$setOnInsert, ...$set });
  }
  async deleteOne(filter) {
    this.docs = this.docs.filter((doc) => !matches(doc, filter));
  }
  async deleteMany(filter) {
    const before = this.docs.length;
    this.docs = this.docs.filter((doc) => !matches(doc, filter));
    return { deletedCount: before - this.docs.length };
  }
  async countDocuments(filter) {
    return this.docs.filter((doc) => matches(doc, filter)).length;
  }
  async distinct(field) {
    return [...new Set(this.docs.map((doc) => get(doc, field)))];
  }
  async exists(filter) {
    return this.docs.some((doc) => matches(doc, filter));
  }
}

const releases = (docs) =>
  new FakeModel(docs, {
    active: CyberiaContentReleaseSchema.statics.active,
    previousActive: CyberiaContentReleaseSchema.statics.previousActive,
  });

// ── A release's content ──────────────────────────────────────────────────────────────────

const profile = profileRef(CyberiaObjectLayerProfile);
// The check hashes bytes and never decodes them, so any bytes stand in for a PNG.
const primaryOf = (itemId) => Buffer.from(`${itemId} primary render`);
const layoutOf = (itemId) => ({ itemKey: itemId, atlasWidth: 1, atlasHeight: 1, cellPixelDim: 1 });
const renderOf = (itemId) => renderContractOf({ primary: primaryOf(itemId), metadata: layoutOf(itemId) });
const definition = (itemId, effect, rendered = false) => {
  const payload = {
    profile,
    data: {
      item: { id: itemId, type: 'weapon' },
      stats: { effect },
      render: rendered ? renderOf(itemId) : { cid: '', metadataCid: '' },
    },
  };
  return { ...payload, ...objectLayerIdentity(payload), origin: 'cache' };
};

const content = () => {
  const fileId = new Types.ObjectId();
  const hatchet = definition('hatchet', 5, true);
  const sword = definition('sword', 9);
  const confId = new Types.ObjectId();
  return {
    hatchet,
    sword,
    models: {
      CyberiaItemCatalog: new FakeModel([
        { itemId: 'hatchet', objectLayerCid: hatchet.cid },
        { itemId: 'sword', objectLayerCid: sword.cid },
      ]),
      ObjectLayer: new FakeModel([hatchet, sword]),
      AtlasSpriteSheet: new FakeModel([{ objectLayerCid: hatchet.cid, fileId, metadata: layoutOf('hatchet') }]),
      File: new FakeModel([{ _id: fileId, data: primaryOf('hatchet') }]),
      CyberiaQuest: new FakeModel([
        { code: 'q1', steps: [{ objectives: [{ itemId: 'hatchet', objectLayerCid: hatchet.cid }] }], rewards: [] },
      ]),
      CyberiaAction: new FakeModel([
        { code: 'shop', shopItems: [{ itemId: 'sword', objectLayerCid: sword.cid }], craftRecipes: [] },
      ]),
      CyberiaMap: new FakeModel([{ code: 'forest-1', entities: [{ objectLayerItemIds: ['hatchet'] }] }]),
      CyberiaEntityTypeDefault: new FakeModel([{ entityType: 'bot', liveItemIds: ['sword'] }]),
      CyberiaInstance: new FakeModel([{ code: 'FOREST', conf: confId, cyberiaMapCodes: ['forest-1'] }]),
      CyberiaInstanceConf: new FakeModel([{ _id: confId }]),
    },
  };
};

const canonicalFrom = (docs) => async (cid) => docs.find((doc) => doc.cid === cid) ?? null;
const failing = (validation) =>
  Object.fromEntries(validation.checks.filter((entry) => !entry.ok).map((entry) => [entry.name, entry.findings]));

// ── Tests ────────────────────────────────────────────────────────────────────────────────

describe('release identity', () => {
  it('names one database per release under the content partition', () => {
    expect(releaseDatabaseName('cyberia-content', 'v3-4-0-8b4d643')).toBe('cyberia-content-v3-4-0-8b4d643');
    const db = { name: 'cyberia', partitions: { content: { name: 'cyberia-content', apis: ['cyberia-map'] } } };
    const { db: releaseDb, database, base } = releaseDbConf(db, 'r1');
    expect(database).toBe('cyberia-content-r1');
    expect(base).toBe('cyberia-content');
    expect(releaseDb.name).toBe('cyberia');
    expect(releaseDb.partitions.content).toEqual({ name: 'cyberia-content-r1', apis: ['cyberia-map'] });
    expect(db.partitions.content.name).toBe('cyberia-content');
  });

  it('refuses release ids that cannot name a database', () => {
    for (const id of ['', 'Upper', 'has space', '../escape', 'v3.4.0', 'a'.repeat(49)])
      expect(() => assertReleaseId(id)).toThrow();
    expect(() => contentPartitionOf({ name: 'cyberia' })).toThrow(/declares no "content" partition/);
  });
});

describe('candidate validation', () => {
  it('passes a release whose every reference resolves', async () => {
    const { models, hatchet, sword } = content();
    const validation = await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) });
    expect(failing(validation)).toEqual({});
    expect(validation.ok).toBe(true);
    expect(validation.checks.map((entry) => entry.name)).toEqual([
      'catalog',
      'canonical',
      'pinned-references',
      'labels',
      'render',
      'instances',
      'schema',
    ]);
    expect(validation.manifest).toEqual({ instances: ['FOREST'], maps: 1, bindings: 2, quests: 1, actions: 1 });
    expect(validation.dependencies).toEqual([hatchet.cid, sword.cid].sort());
  });

  it('fails on a draft, or on a definition under another profile', async () => {
    const { models, hatchet } = content();
    const foreign = models.ObjectLayer.docs[1];
    foreign.profile = { id: 'other', version: 1 };
    Object.assign(foreign, objectLayerIdentity(foreign));
    models.CyberiaItemCatalog.docs[1].objectLayerCid = foreign.cid;
    models.ObjectLayer.docs[0].origin = 'draft';
    const errors = failing(await validateContentRelease(models, { resolveCanonical: canonicalFrom([]) })).catalog;
    expect(errors).toEqual([
      `hatchet: ${hatchet.cid} is a draft, never published`,
      expect.stringMatching(/^sword: profile other@1 is not the Cyberia runtime's cyberia@/),
    ]);
  });

  it('fails when a bound cid is not in the release, or its content hashes elsewhere', async () => {
    const { models, hatchet, sword } = content();
    models.ObjectLayer.docs = models.ObjectLayer.docs.filter((doc) => doc.cid !== sword.cid);
    models.ObjectLayer.docs[0].data.stats.effect = 99;
    const validation = await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) });
    const errors = failing(validation).catalog.join('\n');
    expect(validation.ok).toBe(false);
    expect(errors).toContain(`sword → ${sword.cid}: not in the release cache`);
    expect(errors).toMatch(new RegExp(`hatchet: ${hatchet.cid}: content hashes to bafkrei`));
  });

  it('fails when the Object Layer authority does not hold the content', async () => {
    const { models, hatchet, sword } = content();
    const validation = await validateContentRelease(models, {
      resolveCanonical: canonicalFrom([{ ...hatchet, contentHash: '0'.repeat(64) }]),
    });
    const errors = failing(validation).canonical.join('\n');
    expect(errors).toContain(`${sword.cid}: unknown to the Object Layer authority`);
    expect(errors).toContain(`${hatchet.cid}: the cached content differs from the authority`);
  });

  it('fails when the authority cannot be reached', async () => {
    const { models } = content();
    const validation = await validateContentRelease(models, {
      resolveCanonical: async () => {
        throw new Error('timed out');
      },
    });
    expect(failing(validation).canonical[0]).toMatch(/timed out/);
  });

  it('fails on an invalid profile', async () => {
    const { models, hatchet, sword } = content();
    models.ObjectLayer.docs[0].profile = { id: '', version: 0 };
    const validation = await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) });
    expect(failing(validation).catalog.join('\n')).toMatch(/profile is not a valid profile reference/);
  });

  it('fails on unpinned or dangling pinned references', async () => {
    const { models, hatchet, sword } = content();
    models.CyberiaQuest.docs[0].steps[0].objectives[0].objectLayerCid = '';
    models.CyberiaAction.docs[0].shopItems[0].objectLayerCid = definition('ghost', 1).cid;
    const errors = failing(await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) }))[
      'pinned-references'
    ].join('\n');
    expect(errors).toContain('CyberiaQuest q1: hatchet is not pinned');
    expect(errors).toMatch(/CyberiaAction shop: sword pins bafkrei\w+, not in the release cache/);
  });

  it('fails on a label the runtime cannot resolve', async () => {
    const { models, hatchet, sword } = content();
    models.CyberiaMap.docs[0].entities[0].objectLayerItemIds.push('unbound-label');
    const errors = failing(await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) }));
    expect(errors.labels).toEqual(['map forest-1: label "unbound-label" is not bound']);
  });

  it('fails when a bound definition has no stored primary render', async () => {
    const { models, hatchet, sword } = content();
    models.AtlasSpriteSheet.docs = [];
    const missing = failing(
      await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) }),
    );
    expect(missing.render).toEqual([`hatchet (${hatchet.cid}): no stored primary render`]);
  });

  it('fails when the stored primary render or its metadata is not the pair the definition names', async () => {
    const { models, hatchet, sword } = content();
    const named = renderOf('hatchet');
    const validate = async () =>
      failing(await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) })).render;

    models.File.docs[0].data = Buffer.from('another image');
    const other = renderContractOf({ primary: Buffer.from('another image'), metadata: layoutOf('hatchet') });
    expect(await validate()).toEqual([
      `hatchet: the atlas holds render ${other.cid} + ${named.metadataCid}, the definition names ${named.cid} + ${named.metadataCid}`,
    ]);

    models.File.docs[0].data = primaryOf('hatchet');
    models.AtlasSpriteSheet.docs[0].metadata = { ...layoutOf('hatchet'), cellPixelDim: 20 };
    const relaid = renderContractOf({
      primary: primaryOf('hatchet'),
      metadata: models.AtlasSpriteSheet.docs[0].metadata,
    });
    expect(await validate()).toEqual([
      `hatchet: the atlas holds render ${named.cid} + ${relaid.metadataCid}, the definition names ${named.cid} + ${named.metadataCid}`,
    ]);
  });

  it('reads the atlas of the bound definition by its cid, whatever label another atlas carries', async () => {
    const { models, hatchet, sword } = content();
    models.AtlasSpriteSheet.docs.unshift({ objectLayerCid: sword.cid, fileId: null, metadata: layoutOf('hatchet') });
    const validation = await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) });
    expect(failing(validation)).toEqual({});
  });

  it('fails on an instance whose conf or maps are missing', async () => {
    const { models, hatchet, sword } = content();
    models.CyberiaInstanceConf.docs = [];
    models.CyberiaInstance.docs[0].cyberiaMapCodes.push('forest-2');
    const errors = failing(await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) }));
    expect(errors.instances).toEqual(['instance FOREST: conf missing', 'instance FOREST: map "forest-2" missing']);
  });

  it('says why the canonical check did not run', async () => {
    const { models } = content();
    const owner = await validateContentRelease(models);
    expect(owner.checks.find((entry) => entry.name === 'canonical').findings).toEqual([
      'skipped: this deployment is the Object Layer authority',
    ]);
    const consumer = await validateContentRelease(models, {
      options: { consumes: { 'object-layer': 'object-layer' } },
    });
    expect(consumer.checks.find((entry) => entry.name === 'canonical').findings).toEqual([
      'skipped: no Object Layer authority origin is configured',
    ]);
  });
});

describe('publication to the Object Layer authority', () => {
  it('stores every bound definition, once, and reports what was new', async () => {
    const { models, hatchet, sword } = content();
    const pool = new Map([[hatchet.cid, hatchet]]);
    const sent = [];
    const publish = async (doc) => {
      sent.push(doc.cid);
      const created = !pool.has(doc.cid);
      pool.set(doc.cid, doc);
      return { cid: objectLayerIdentity(doc).cid, created };
    };
    const first = await publishContentRelease(models, { publish });
    expect(first).toMatchObject({ name: 'publication', ok: true, count: 2, created: 1 });
    const again = await publishContentRelease(models, { publish });
    expect(again).toMatchObject({ ok: true, count: 2, created: 0 });
    expect(sent.sort()).toEqual([hatchet.cid, hatchet.cid, sword.cid, sword.cid].sort());
  });

  it('fails when the authority stores the content under another identity', async () => {
    const { models } = content();
    const result = await publishContentRelease(models, {
      publish: async () => ({ cid: 'bafkreiother', created: true }),
    });
    expect(result.ok).toBe(false);
    expect(result.findings[0]).toMatch(/the authority stored it as bafkreiother/);
  });
});

describe('pruning', () => {
  it('drops retired databases beyond the kept ones, never the active release or the rollback target', async () => {
    const at = (minute) => new Date(Date.UTC(2026, 8, 20, 10, minute));
    const ledger = releases([
      { releaseId: 'r5', database: 'c-r5', status: 'active', promotedAt: at(5) },
      { releaseId: 'r4', database: 'c-r4', status: 'retired', promotedAt: at(4), retiredAt: at(5) },
      { releaseId: 'r3', database: 'c-r3', status: 'retired', promotedAt: at(3), retiredAt: at(4) },
      { releaseId: 'r2', database: 'c-r2', status: 'retired', promotedAt: at(2), retiredAt: at(3) },
      { releaseId: 'bad', database: 'c-bad', status: 'invalid', createdAt: at(1) },
    ]);
    const dropped = [];
    const connection = { useDb: (name) => ({ dropDatabase: async () => dropped.push(name) }) };

    const removed = await pruneContentReleases({ CyberiaContentRelease: ledger, connection, keep: 1 });
    expect(removed.sort()).toEqual(['bad', 'r2']);
    expect(dropped.sort()).toEqual(['c-bad', 'c-r2']);
    expect(ledger.docs.map((doc) => doc.releaseId).sort()).toEqual(['r3', 'r4', 'r5']);
  });
});

describe('atlas renders shared across releases', () => {
  const atlasIds = { a: new Types.ObjectId(), b: new Types.ObjectId() };
  const files = () =>
    new FakeModel([
      { _id: atlasIds.a, name: 'hatchet-primary.png' },
      { _id: atlasIds.b, name: 'sword-primary.png' },
    ]);
  const atlases = (fileIds, database) =>
    Object.assign(new FakeModel(fileIds.map((fileId) => ({ fileId, metadata: { itemKey: String(fileId) } }))), {
      db: { name: database },
    });

  beforeEach(() => {
    for (const key of Object.keys(models)) delete models[key];
  });

  it('are never pruned from one release alone', async () => {
    models.File = Object.assign(files(), { db: { name: 'cyberia' } });
    models.AtlasSpriteSheet = atlases([atlasIds.a], 'cyberia-content-r2');
    expect(await AtlasSpriteSheetStore.pruneOrphanRenders({})).toBe(0);
    expect(models.File.docs).toHaveLength(2);
  });

  it('are pruned only when no kept release holds them', async () => {
    models.File = Object.assign(files(), { db: { name: 'cyberia' } });
    models.AtlasSpriteSheet = atlases([atlasIds.a], 'cyberia-content-r2');
    const owners = [models.AtlasSpriteSheet, atlases([atlasIds.b], 'cyberia-content-r1')];
    expect(await AtlasSpriteSheetStore.pruneOrphanRenders({ owners })).toBe(0);
    expect(await AtlasSpriteSheetStore.pruneOrphanRenders({ owners: [models.AtlasSpriteSheet] })).toBe(1);
    expect(models.File.docs.map((doc) => doc.name)).toEqual(['hatchet-primary.png']);
  });
});

describe('content partition binding', () => {
  const fakeConnection = (name) => {
    const children = {};
    const conn = {
      name,
      models: {},
      model(key, schema) {
        const model = { key, schema, db: conn, on: () => model };
        conn.models[key] = model;
        return model;
      },
      useDb(database) {
        return (children[database] ??= fakeConnection(database));
      },
    };
    return conn;
  };

  it('binds partition APIs to the partition database and the rest to the host database', async () => {
    const conn = fakeConnection('cyberia');
    const loaded = await MongooseDB.loadModels({
      conn,
      apis: ['cyberia-quest-progress', 'cyberia-map', 'cyberia-content-release'],
      partitions: { content: { name: 'cyberia-content-r1', apis: ['cyberia-map'] } },
    });
    expect(loaded.CyberiaMap.db.name).toBe('cyberia-content-r1');
    expect(loaded.CyberiaQuestProgress.db.name).toBe('cyberia');
    expect(loaded.CyberiaContentRelease.db.name).toBe('cyberia');
  });
});

describe('deploy pipeline', () => {
  const script = fs.readFileSync(new URL('../../../deploy/dd-cyberia/sync-deploy.sh', import.meta.url), 'utf8');
  const cli = fs.readFileSync(new URL('../../../bin/cyberia.js', import.meta.url), 'utf8');

  it('never drops a database on a normal deploy', () => {
    expect(script).not.toMatch(/drop-db|ol --drop|--drop\b|dropDatabase/);
  });

  it('deploys a pinned image, never a floating tag', () => {
    expect(script).toMatch(/DEPLOY_IMAGE="\$\{DEPLOY_IMAGE:-underpost\/engine-cyberia:v\$\{version\}\}"/);
    expect(script).toMatch(/\*:latest\)\s+if \[ "\$\{ALLOW_LATEST_IMAGE:-0\}" != "1" \]/);
  });

  it('runs the stages in order, and builds and promotes content only after readiness', () => {
    const order = [
      'stage_sources',
      'stage_build',
      'stage_configuration',
      'stage_rollout',
      'stage_readiness',
      'stage_content_candidate',
      'stage_promotion',
    ];
    const main = script.slice(script.indexOf('main() {'));
    const positions = order.map((stage) => main.indexOf(`    ${stage}\n`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('starts the pod on the served release, and builds the candidate against the new version', () => {
    const podCmd = script.slice(script.indexOf('pod_cmd="$(pod_bootstrap_cmd'), script.indexOf('underpost start'));
    expect(podCmd).not.toContain('content-release');
    const candidate = script.slice(
      script.indexOf('stage_content_candidate() {'),
      script.indexOf('stage_promotion() {'),
    );
    expect(candidate).toMatch(/content_release_exec build "\$CONTENT_RELEASE_ID" --bootstrap/);
  });

  it('gives a release command in the live pod its private conf only while the command runs', () => {
    // A stub sudo returns the in-pod command; stub `underpost` and `node` stand in for the pod.
    const lib = new URL('../../../deploy/lib/', import.meta.url).pathname;
    const inner = execFileSync(
      'bash',
      [
        '-c',
        `sudo() { shift 2; if [ "$2" = get ]; then echo dd-x-production-blue; else printf '%s\\n' "$@"; fi; }; ` +
          `DEPLOY_ID=dd-x DEPLOY_ENV=production; source ${lib}host.sh; source ${lib}content-release.sh; ` +
          'content_release_exec status',
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .at(-1);
    const pod = fs.mkdtempSync(`${os.tmpdir()}/content-release-pod-`);
    try {
      fs.mkdirSync(`${pod}/bin`);
      fs.mkdirSync(`${pod}/engine`);
      fs.writeFileSync(
        `${pod}/bin/underpost`,
        '#!/bin/bash\nmkdir -p "./${2##*/}/conf" && touch "./${2##*/}/conf/x"\n',
        { mode: 0o755 },
      );
      fs.writeFileSync(`${pod}/bin/node`, '#!/bin/bash\n[ -f ./engine-private/conf/x ] && echo "conf $*"\nexit 3\n', {
        mode: 0o755,
      });
      const run = spawnSync('bash', ['-c', inner.replace('cd /home/dd/engine', `cd ${pod}/engine`)], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${pod}/bin:${process.env.PATH}` },
      });
      expect(run.stdout.trim()).toBe('conf bin/cyberia content-release status');
      expect(run.status).toBe(3);
      expect(fs.readdirSync(`${pod}/engine`)).toEqual([]);
    } finally {
      fs.rmSync(pod, { recursive: true, force: true });
    }
  });

  it('reads a release status from the rows `content-release status` prints', () => {
    const rows = [
      { status: 'active', releaseId: 'v1', database: 'db-v1', instances: ['A'], source: { commit: 'abc' } },
      { status: 'retired', releaseId: 'v0', database: 'db-v0', instances: ['A'] },
    ].map(contentReleaseRowFactory);
    // The command also logs a summary line, which the parser skips.
    const output = ['[cyberia.js] 2026-09-24 info Active release: v1 (db-v1)', ...rows].join('\n');
    const lib = new URL('../../../deploy/lib/content-release.sh', import.meta.url).pathname;
    const check = (id) =>
      spawnSync(
        'bash',
        [
          '-c',
          `source ${lib}; content_release_exec() { printf '%s\n' "$OUTPUT"; }; ` +
            `content_release_expect_status ${id} validated active`,
        ],
        { encoding: 'utf8', env: { ...process.env, OUTPUT: output } },
      ).status;
    expect(cli).toContain('console.log(contentReleaseRowFactory(entry))');
    expect(check('v1')).toBe(0);
    expect(check('v0')).toBe(1);
    expect(check('v9')).toBe(1);
  });

  it('asks for the deploy id before any destructive command runs', () => {
    for (const action of ['ol --drop', 'instance --drop', 'drop-db'])
      expect(cli).toContain(`assertDestructiveConfirmation(options, deployId, '${action}')`);
    expect(cli).toMatch(/\.option\('--include-runtime'/);
  });

  it('imports each release instance from its own backup directory', () => {
    const build = cli.slice(cli.indexOf(".command('build <release-id>')"), cli.indexOf('runValidation(release, id'));
    expect(build).toMatch(/for \(const code of instances\)\s+shellExec\([^;]*instance \$\{code\} --import --release/);
    expect(build).not.toContain("instances.join(',')");
  });
});
