import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { Types } from 'mongoose';
import { load } from 'js-yaml';

const models = {};
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: (name) => models[name],
    getProvider: () => ({ models, partitions: {} }),
    partitionDatabase: () => '',
  },
}));
vi.mock('../../../src/api/ipfs/ipfs.client.js', () => ({ IpfsClient: {} }));
vi.mock('../../../src/projects/cyberia/hot-reload-trigger.js', () => ({ triggerHotReload: vi.fn() }));

const {
  beginContentRelease,
  contentPartitionOf,
  contentReleaseRowFactory,
  importArtifactContent,
  publishContentRelease,
  pruneContentReleases,
  releaseDatabaseName,
  releaseDbConf,
  reloadContentServers,
  servedContent,
  validateContentRelease,
} = await import('../../../src/projects/cyberia/content-release.js');
const { triggerHotReload } = await import('../../../src/projects/cyberia/hot-reload-trigger.js');
const { assertReleaseId } = await import('../../../src/server/release/source-release.js');
const { CyberiaContentReleaseSchema } =
  await import('../../../src/api/cyberia-content-release/cyberia-content-release.model.js');
const { objectLayerIdentity, renderContractOf } =
  await import('../../../src/api/object-layer/object-layer.identity.js');
const { MongooseDB } = await import('../../../src/db/mongo/MongooseDB.js');
const { profileRef } = await import('../../../src/client/components/objectlayer-studio/ObjectLayerProtocol.js');
const { CyberiaObjectLayerProfile } =
  await import('../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js');
const { AtlasSpriteSheetStore } = await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js');
const { selectReleaseContent } = await import('../../../src/projects/cyberia/release-content.js');

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
      if ('$nin' in condition) return !condition.$nin.map(String).includes(String(value));
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
      CyberiaSkill: new FakeModel([
        {
          triggerItemId: 'hatchet',
          skills: [{ summonedEntityItemId: 'hatchet' }, { summonedEntityItemId: '$active_skin' }],
        },
      ]),
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
      'artifact',
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

  it('checks every label the content names, not only what maps place', async () => {
    const { models, hatchet, sword } = content();
    models.CyberiaEntityTypeDefault.docs[0].dropItemIds = ['loot'];
    models.CyberiaAction.docs[0].craftRecipes = [{ outputItems: [{ itemId: 'blade' }], ingredients: [] }];
    models.CyberiaQuest.docs[0].rewards = [{ itemId: 'medal' }];
    models.CyberiaSkill.docs[0].skills[0].summonedEntityItemId = 'bolt';
    const errors = failing(await validateContentRelease(models, { resolveCanonical: canonicalFrom([hatchet, sword]) }));
    expect(errors.labels).toEqual([
      'entity default bot: label "loot" is not bound',
      'action shop: label "blade" is not bound',
      'quest q1: label "medal" is not bound',
      'skill hatchet: label "bolt" is not bound',
    ]);
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

  it('fails a release that holds no content artifact, or another one, and skips the workspace', async () => {
    const { models, hatchet, sword } = content();
    const resolveCanonical = canonicalFrom([hatchet, sword]);
    const workspace = await validateContentRelease(models, { resolveCanonical });
    expect(workspace.checks[0]).toEqual({
      name: 'artifact',
      ok: true,
      count: 0,
      findings: ['skipped: the workspace holds no content artifact'],
    });
    const stored = [];
    const db = {
      databaseName: 'cyberia-content-r1',
      collection: () => ({ find: () => ({ toArray: async () => stored }) }),
    };
    const digest = `sha256:${'a'.repeat(64)}`;
    const empty = await validateContentRelease(models, { resolveCanonical, artifact: { db, digest } });
    expect(failing(empty)).toEqual({ artifact: ['No content artifact in cyberia-content-r1'] });
    expect(empty.ok).toBe(false);
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
  it('drops old releases beyond the kept ones, never a protected or executing one', async () => {
    const at = (minute) => new Date(Date.UTC(2026, 8, 20, 10, minute));
    const ledger = releases([
      { releaseId: 'r5', database: 'c-r5', status: 'active', promotedAt: at(5) },
      { releaseId: 'r4', database: 'c-r4', status: 'retired', promotedAt: at(4), retiredAt: at(5) },
      { releaseId: 'r3', database: 'c-r3', status: 'retired', promotedAt: at(3), retiredAt: at(4) },
      { releaseId: 'r2', database: 'c-r2', status: 'retired', promotedAt: at(2), retiredAt: at(3) },
      { releaseId: 'bad', database: 'c-bad', status: 'failed', createdAt: at(1) },
      { releaseId: 'next', database: 'c-next', status: 'validated', createdAt: at(6) },
      { releaseId: 'b1', database: 'c-b1', status: 'building', createdAt: at(7) },
      { releaseId: 'run', database: 'c-run', status: 'candidate', lease: { executing: true, heartbeatAt: new Date() } },
    ]);
    const dropped = [];
    const connection = { useDb: (name) => ({ dropDatabase: async () => dropped.push(name) }) };

    const removed = await pruneContentReleases({ CyberiaContentRelease: ledger, connection, keep: 1 });
    expect(removed.sort()).toEqual(['bad', 'r2']);
    expect(dropped.sort()).toEqual(['c-bad', 'c-r2']);
    expect(ledger.docs.map((doc) => doc.releaseId).sort()).toEqual(['b1', 'next', 'r3', 'r4', 'r5', 'run']);
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

describe('served content', () => {
  it('names the active release database, else the workspace', async () => {
    models.CyberiaContentRelease = { active: async () => null };
    expect(await servedContent({}, 'cyberia-content')).toEqual({
      releaseId: '',
      database: 'cyberia-content',
      digest: '',
    });
    models.CyberiaContentRelease = {
      active: async () => ({ releaseId: 'r1', database: 'cyberia-content-r1', content: { digest: 'sha256:r1' } }),
    };
    expect(await servedContent({}, 'cyberia-content')).toEqual({
      releaseId: 'r1',
      database: 'cyberia-content-r1',
      digest: 'sha256:r1',
    });
    delete models.CyberiaContentRelease;
  });

  it('reloads every registered server in the mode asked, and counts the servers reached', async () => {
    models.CyberiaServerRegistry = {
      find: () => ({
        lean: async () => [
          { serverUrl: 'http://forest', instanceCode: 'FOREST' },
          { serverUrl: 'http://gone', instanceCode: 'TEST' },
        ],
      }),
    };
    triggerHotReload.mockReset();
    triggerHotReload.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('unreachable'));
    expect(await reloadContentServers({}, { mode: 'incremental' })).toBe(1);
    expect(triggerHotReload.mock.calls.map(([call]) => call)).toEqual([
      { serverUrl: 'http://forest', instanceCode: 'FOREST', mode: 'incremental' },
      { serverUrl: 'http://gone', instanceCode: 'TEST', mode: 'incremental' },
    ]);
    delete models.CyberiaServerRegistry;
  });
});

describe('candidate database', () => {
  const source = { from: 'backups' };
  const begin = async (docs, releaseId) => {
    const reset = [];
    const begun = await beginContentRelease(releases(docs), {
      releaseId,
      holder: 'job',
      fields: { database: `cyberia-content-${releaseId}`, source },
      reset: async (database) => reset.push(database),
    });
    return { begun, reset };
  };

  it('empties the database of every build that runs: a first build and a retry of a failed one', async () => {
    expect((await begin([], 'v1')).reset).toEqual(['cyberia-content-v1']);
    const failed = { releaseId: 'v1', status: 'failed', source, database: 'cyberia-content-v1' };
    expect((await begin([failed], 'v1')).reset).toEqual(['cyberia-content-v1']);
  });

  it('never empties a release it keeps', async () => {
    const { begun, reset } = await begin([{ releaseId: 'v1', status: 'validated', source }], 'v1');
    expect(begun.skipped).toBe(true);
    expect(reset).toEqual([]);
  });
});

describe('artifact import order', () => {
  const recorder = (fail = '') => {
    const ran = [];
    const run = async (args) => {
      ran.push(args);
      if (fail && args.startsWith(fail)) throw new Error(`${args} failed`);
    };
    return { ran, run };
  };

  it('imports the foundation, then the sagas, which replace what they hold, then each instance', async () => {
    const { ran, run } = recorder();
    await importArtifactContent({ run, instances: ['a', 'b'], sagas: ['s'] });
    expect(ran).toEqual([
      'content import',
      'content import --saga s --rebind',
      'instance a --import',
      'instance b --import',
    ]);
  });

  it('runs the same import for the same artifact and content set, and leaves undeclared instances out', async () => {
    const manifest = {
      sagas: ['amethyst-strata-expansion'],
      instances: ['amethyst-strata-expansion', 'fallback', 'test'],
    };
    const imported = async () => {
      const { ran, run } = recorder();
      await importArtifactContent({ run, ...selectReleaseContent({ manifest }), releaseId: 'v1' });
      return ran;
    };
    const first = await imported();
    expect(await imported()).toEqual(first);
    expect(first).toEqual([
      'content import --release v1',
      'content import --saga amethyst-strata-expansion --rebind --release v1',
      'instance amethyst-strata-expansion --import --release v1',
      'instance test --import --release v1',
    ]);
  });

  it('imports into the release database it names', async () => {
    const { ran, run } = recorder();
    await importArtifactContent({ run, instances: ['a'], releaseId: 'v1-abc' });
    expect(ran).toEqual(['content import --release v1-abc', 'instance a --import --release v1-abc']);
    await expect(importArtifactContent({ run, instances: ['a'], releaseId: 'V1 ABC' })).rejects.toThrow();
  });

  it('imports no instance once the foundation import fails', async () => {
    const { ran, run } = recorder('content import');
    await expect(importArtifactContent({ run, instances: ['a'], sagas: ['s'] })).rejects.toThrow(
      'content import failed',
    );
    expect(ran).toEqual(['content import']);
  });
});

describe('deploy pipeline', () => {
  const script = fs.readFileSync(new URL('../../../deploy/dd-cyberia/sync-deploy.sh', import.meta.url), 'utf8');
  const cli = fs.readFileSync(new URL('../../../bin/cyberia.js', import.meta.url), 'utf8');
  const lib = fs.readFileSync(new URL('../../../deploy/lib/content-release.sh', import.meta.url), 'utf8');

  it('never drops a database on a normal deploy', () => {
    expect(script).not.toMatch(/drop-db|ol --drop|--drop\b|dropDatabase/);
  });

  it('deploys a pinned image, never a floating tag', () => {
    expect(script).toMatch(/DEPLOY_IMAGE="\$\{DEPLOY_IMAGE:-underpost\/engine-cyberia:v\$\{version\}\}"/);
    expect(script).toMatch(/\*:latest\)\s+if \[ "\$\{ALLOW_LATEST_IMAGE:-0\}" != "1" \]/);
  });

  it('runs the stages in order: the content candidate before the rollout, the promotion after readiness', () => {
    const order = [
      'stage_sources',
      'stage_build',
      'stage_configuration',
      'stage_content_candidate',
      'stage_rollout',
      'stage_readiness',
      'stage_promotion',
      'stage_mirror',
    ];
    const main = script.slice(script.indexOf('main() {'));
    const positions = order.map((stage) => main.indexOf(`    ${stage}\n`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('skips the content candidate and the promotion when SKIP_CONTENT_RELEASE is 1', () => {
    expect(script).toContain('SKIP_CONTENT_RELEASE="${SKIP_CONTENT_RELEASE:-0}"');
    const helper = script.slice(script.indexOf('content_release_skipped() {'), script.indexOf('# ── Stage D'));
    const run = (skip) =>
      spawnSync(
        'bash',
        [
          '-c',
          `set -euo pipefail
          RUN_QUIET_NODE_TAG=[tag] SKIP_CONTENT_RELEASE=${skip}
          deploy_step() { echo "step: $1"; }
          ${helper}
          stage_content_candidate() { ! content_release_skipped "content candidate" || return 0; deploy_step candidate; }
          stage_promotion() { if content_release_skipped "content promotion"; then RELEASE_STATE=committed; return 0; fi; deploy_step promotion; }
          stage_content_candidate
          stage_promotion
          echo "state: \${RELEASE_STATE:-}"`,
        ],
        { encoding: 'utf8' },
      );
    expect(run(1).stdout).not.toContain('step:');
    expect(run(1).stdout).toContain('content promotion skipped');
    expect(run(1).stdout).toContain('state: committed');
    expect(run(0).stdout).toContain('state: \n');
    expect(run(0).stdout).toContain('step: candidate');
    expect(run(0).stdout).toContain('step: promotion');
    for (const stage of ['stage_content_candidate() {', 'stage_promotion() {'])
      expect(script.slice(script.indexOf(stage), script.indexOf(stage) + 200)).toContain('content_release_skipped');
  });

  it('starts the pod on the served release, and builds the candidate in a Release Job', () => {
    const podCmd = script.slice(script.indexOf('pod_cmd="$(pod_bootstrap_cmd'), script.indexOf('underpost start'));
    expect(podCmd).not.toContain('content-release');
    const candidate = script.slice(
      script.indexOf('stage_content_candidate() {'),
      script.indexOf('stage_promotion() {'),
    );
    const prepared = candidate.indexOf('content-release prepare $CONTENT_RELEASE_ID --channel $CYBERIA_SOURCE_CHANNEL');
    const secret = candidate.indexOf('apply_release_secret');
    const built = candidate.indexOf('content_release_job "$CONTENT_RELEASE_ID" "$DEPLOY_IMAGE"');
    expect(prepared).toBeGreaterThan(-1);
    expect(prepared).toBeLessThan(secret);
    expect(secret).toBeLessThan(built);
    expect(candidate).toContain('build "$CONTENT_RELEASE_ID" --from source');
    // Only the prepare names the channel: both channels build through the one Release Job.
    expect(candidate.slice(secret)).not.toContain('CYBERIA_SOURCE_CHANNEL');
    expect(script).not.toMatch(/content import|import-content/);
    expect(script).not.toContain('kubectl exec');
    expect(lib).not.toContain('kubectl exec');
  });

  it('promotes a release from either channel, then mirrors a private one', () => {
    const promotion = script.slice(script.indexOf('stage_promotion() {'), script.indexOf('# ── Stage H'));
    expect(promotion).not.toMatch(/CYBERIA_SOURCE_CHANNEL|private|public/);
    expect(promotion).toContain(
      'content_release_job "content-release-promote" "$DEPLOY_IMAGE" promote "$CONTENT_RELEASE_ID"',
    );
    const mirror = script.slice(script.indexOf('stage_mirror() {'), script.indexOf('main() {'));
    expect(mirror).toContain('[ "$CYBERIA_SOURCE_CHANNEL" = private ] || return 0');
    expect(mirror).toContain('data-release | source-sync)');
    expect(mirror).toContain('deploy_step "Mirror $name" mirror_revision "$repository" "$(checkout_revision "$name")"');
    const main = script.slice(script.indexOf('main() {'));
    expect(main.indexOf('stage_promotion')).toBeLessThan(main.indexOf('stage_mirror'));
  });

  it('prunes after the commit: the databases in a Release Job, then the release store on the host', () => {
    const promotion = script.slice(script.indexOf('stage_promotion() {'), script.indexOf('# ── Stage H'));
    const committed = promotion.indexOf('RELEASE_STATE=committed');
    const databases = promotion.indexOf('content_release_job "content-release-prune" "$DEPLOY_IMAGE" prune');
    const store = promotion.indexOf('node bin source-release prune $CONTENT_RELEASE_ID');
    expect(committed).toBeGreaterThan(-1);
    expect(committed).toBeLessThan(databases);
    expect(databases).toBeLessThan(store);
  });

  it('restores what served before when the deploy fails after its switch, and never after its commit', () => {
    const revert = script.slice(script.indexOf('revert_release() {'), script.indexOf('main() {'));
    const run = (state, previousRelease, status = 1) =>
      spawnSync(
        'bash',
        [
          '-c',
          `deploy_step() { echo "step: $1"; shift; "$@"; }
          content_release_job() { echo "job: $*"; }
          live_colour() { echo green; }
          sudo() { echo "host: \${@: -1}"; }
          DEPLOY_ID=dd-cyberia DEPLOY_ENV=production DEPLOY_IMAGE=engine:1 ENGINE_ROOT=/engine ROUTING_FLAGS=--gateway-api
          CONTENT_RELEASE_ID=v2 PREVIOUS_COLOUR=blue PREVIOUS_RELEASE=${previousRelease} RELEASE_STATE=${state}
          ${revert}
          trap revert_release EXIT
          exit ${status}`,
        ],
        { encoding: 'utf8' },
      );
    const promoting = run('promoting', 'v1');
    expect(promoting.status).toBe(1);
    expect(promoting.stdout).toContain('job: content-release-rollback engine:1 rollback --from v2');
    expect(promoting.stdout).toContain('node bin run promote dd-cyberia,production --traffic blue --gateway-api');
    expect(promoting.stdout.indexOf('rollback --from v2')).toBeLessThan(promoting.stdout.indexOf('run promote'));
    const switched = run('switched', '');
    expect(switched.stdout).not.toContain('rollback');
    expect(switched.stdout).toContain('--traffic blue');
    expect(run('promoting', 'v2').stdout).not.toContain('rollback');
    for (const quiet of [run('committed', 'v1'), run('', ''), run('promoting', 'v1', 0)]) expect(quiet.stdout).toBe('');
  });

  it('runs a content release in a Release Job with the data-release Secret alone', () => {
    // A stub sudo hands the host command to the real CLI with --dry-run.
    const libDir = new URL('../../../deploy/lib/', import.meta.url).pathname;
    const manifest = execFileSync(
      'bash',
      [
        '-c',
        `sudo() { shift 2; /bin/bash -lc "$3 --dry-run"; }; ` +
          `source ${libDir}github-actions-logging.sh; source ${libDir}host.sh; source ${libDir}content-release.sh; ` +
          'DEPLOY_ID=dd-cyberia DEPLOY_ENV=production TARGET_NODE=node-1 ENGINE_ROOT=' +
          new URL('../../../', import.meta.url).pathname +
          '; content_release_job v1-abc engine:1 build v1-abc --from source --instances a,b',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const [container] = load(manifest).spec.template.spec.containers;
    expect(container.envFrom).toEqual([{ secretRef: { name: 'dd-cyberia-production-data-release' } }]);
    expect(container.env.map(({ name }) => name)).toEqual([
      'NODE_ENV',
      'OBJECT_LAYER_API_ORIGIN',
      'UNDERPOST_RELEASE_STORE',
    ]);
    // The Job runs the engine this host deploys, staged in the release store, not the image's CLI.
    expect(container.command[2]).toBe(
      'cp -r --no-preserve=mode "$UNDERPOST_RELEASE_STORE/.engine/." /home/dd/engine/ && ' +
        'cd /home/dd/engine && npm install --no-audit --no-fund && ' +
        'rm -f .env && node bin/cyberia content-release build v1-abc --from source --instances a,b',
    );
    expect(container.volumeMounts[0].readOnly).toBe(true);
    expect(manifest).not.toMatch(/underpost-config|GITHUB_TOKEN|underpost clone/);
  });

  it('prints ledger rows that start with the status and the release id', () => {
    const row = contentReleaseRowFactory({
      status: 'validated',
      releaseId: 'v1',
      database: 'db-v1',
      instances: ['a', 'b'],
      source: { from: 'source', channel: 'private', sourceRevision: 'f'.repeat(40) },
      provenance: { engineCommit: 'abc1234' },
    });
    expect(row.split(/\s+/).slice(0, 2)).toEqual(['validated', 'v1']);
    expect(row).toContain(`source=private@${'f'.repeat(12)}`);
    expect(row).toContain('engine=abc1234');
    expect(cli).toContain('console.log(contentReleaseRowFactory(entry))');
  });

  it('asks for the deploy id before any destructive command runs', () => {
    for (const action of ['ol --drop', 'instance --drop', 'drop-db'])
      expect(cli).toContain(`assertDestructiveConfirmation(options, deployId, '${action}')`);
    expect(cli).toMatch(/\.option\('--include-runtime'/);
  });

  it('imports each release from the artifact it built, into its own database', () => {
    const runner = cli.slice(cli.indexOf('const artifactImportRunner = '), cli.indexOf('const resolvedSources = '));
    expect(runner).toContain('CYBERIA_CONTENT_ROOT: root');
    const build = cli.slice(
      cli.indexOf(".command('build <release-id>')"),
      cli.indexOf(".command('validate [release-id]')"),
    );
    expect(build.match(/importArtifactContent\(\{\s+run: artifactImportRunner\([\s\S]*?releaseId: id,/g)).toHaveLength(
      2,
    );
    expect(build).toContain('artifactImportRunner(`${buildDir}/source`, options)');
  });

  it('bootstraps a development workspace through the same ordered import, without a release', () => {
    const workflow = cli.slice(cli.indexOf(".command('import-content')"), cli.indexOf(".command('stage-cli')"));
    expect(workflow).toContain('...selectReleaseContent({ manifest }),');
    expect(workflow).not.toContain('manifest.instances');
    expect(workflow).not.toContain('releaseId');
    expect(workflow).not.toContain('content-release');
  });

  it('releases the declared content set, and only what its artifact holds', () => {
    const build = cli.slice(
      cli.indexOf(".command('build <release-id>')"),
      cli.indexOf(".command('validate [release-id]')"),
    );
    expect(build).toContain('const instances = releaseInstanceCodes(codeList(options.instances));');
    expect(build.match(/\.\.\.selectReleaseContent\(\{ manifest(: built)?, instances \}\)/g)).toHaveLength(2);
    expect(script).not.toMatch(/CONTENT_INSTANCES="\$\{CONTENT_INSTANCES:-[^}]/);
  });

  it('builds the content with its own commands and no Secret in their environment', () => {
    const contract = cli.slice(cli.indexOf('const runContentContract = '), cli.indexOf('const buildRelease = '));
    expect(contract).toContain("shellExecAsync('npm ci && npm test && npm pack'");
    expect(contract).toContain("env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true' }");
  });

  it('syncs every product repository from the one source channel, at the revision the lock pins', () => {
    const sources = script.slice(script.indexOf('stage_sources() {'), script.indexOf('# ── Stage B'));
    expect(sources.indexOf('prepare_host')).toBeLessThan(sources.indexOf('sync_release_sources'));
    expect(sources).toContain('sync_release_sources "$CYBERIA_SOURCE_CHANNEL"');
    expect(script).toContain('content_revision="$(checkout_revision cyberia-content)"');
    expect(script).toContain('CYBERIA_SOURCE_CHANNEL="${CYBERIA_SOURCE_CHANNEL:-private}"');
    expect(script).toContain('ENGINE_SRC_REPO="$(engine_source_repo "$DEPLOY_ID" "$CYBERIA_SOURCE_CHANNEL")"');
    expect(script).not.toMatch(/underpostnet\/cyberia-/);
    // The CLI answers through stubs: two repositories, the deployment holding the lock that pins the content.
    const run = execFileSync(
      'bash',
      [
        '-c',
        `set -euo pipefail
        sudo() {
          case "$*" in
            *--locked*) printf 'cyberia-content underpostnet/cyberia-content data-release %040d\\n' 7 ;;
            *) printf '[log] start\\ncyberia-content underpostnet/cyberia-content data-release\\ncyberia-deployment underpostnet/cyberia-deployment source-sync\\n' ;;
          esac
        }
        source_repository() { printf '%s-private' "$1"; }
        sync_checkout() { echo "sync $*"; }
        pin_checkout() { echo "pin $*"; }
        ENGINE_ROOT=/engine
        source "${new URL('../../../deploy/lib/release-sources.sh', import.meta.url).pathname}"
        sync_release_sources private
        printf 'repository %s\\n' "\${RELEASE_REPOSITORIES[@]}"`,
      ],
      { encoding: 'utf8' },
    );
    expect(run.trim().split('\n')).toEqual([
      'sync underpostnet/cyberia-content-private /engine cyberia-content',
      'sync underpostnet/cyberia-deployment-private /engine cyberia-deployment',
      `pin cyberia-content ${'0'.repeat(39)}7`,
      'repository cyberia-content underpostnet/cyberia-content data-release',
      'repository cyberia-deployment underpostnet/cyberia-deployment source-sync',
    ]);
  });

  it('stops the deploy with the error of the CLI when the deployment holds no lock', () => {
    const run = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail
        sudo() { echo 'error No underpost.lock.json: run cyberia release lock --commit'; return 1; }
        ENGINE_ROOT=/engine
        source "${new URL('../../../deploy/lib/release-sources.sh', import.meta.url).pathname}"
        locked="$(release_repositories --locked)"
        echo unreachable`,
      ],
      { encoding: 'utf8' },
    );
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toContain('unreachable');
    expect(run.stderr).toContain('No underpost.lock.json: run cyberia release lock --commit');
  });

  it('releases each game instance from the revision the lock pins', () => {
    for (const project of ['cyberia-server', 'cyberia-client']) {
      const deploy = fs.readFileSync(new URL(`../../../deploy/${project}/deploy.sh`, import.meta.url), 'utf8');
      const synced = deploy.indexOf('sync_release_sources "$CYBERIA_SOURCE_CHANNEL"');
      expect(synced).toBeGreaterThan(deploy.indexOf('prepare_host'));
      expect(deploy.indexOf('revision="$(checkout_revision "${RELEASE_REPOSITORY##*/}")"')).toBeGreaterThan(synced);
      expect(deploy).not.toContain('sync_checkout');
    }
  });

  it('builds only the game checkouts on the host, and only `release lock` writes the lock', () => {
    expect(script).not.toMatch(/cyberia-content\.js|npm ci|merge-base|release lock/);
    expect(script).toContain('node bin/cyberia release build cyberia-server cyberia-client');
    expect(cli.match(/writeSourceLockFile\(/g)).toHaveLength(1);
  });
});
