import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: () => ({ findOne: () => ({ lean: async () => null }), materialize: async () => {} }),
  },
}));
vi.mock('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js', () => ({
  AtlasSpriteSheetStore: { materialize: async () => {} },
}));
vi.mock('../../../src/api/object-layer/object-layer.publication.js', () => ({
  publishDefinition: async ({ ObjectLayer, payload }) => ObjectLayer.store(payload),
  objectLayerCache: () => ({}),
}));
vi.mock('../../../src/server/storage/cache.js', () => ({ CacheService: { invalidate: async () => {} } }));

const { objectLayerIdentity } = await import('../../../src/api/object-layer/object-layer.identity.js');
const { composeItemDefinition } = await import('../../../src/projects/cyberia/object-layer-catalog.js');
const { readSourceLock, verifyLockedSource } = await import('../../../src/server/release/source-lock.js');
const {
  CONTENT_FAMILIES,
  CONTENT_SCHEMA_VERSION,
  RELEASE_ARTIFACT_COLLECTION,
  auditContent,
  contentArtifact,
  contentLockEntry,
  contentRoot,
  contentSources,
  deploymentRoot,
  hasContentArtifact,
  holdsContent,
  importContent,
  loadContentArtifact,
  materializeObjectLayers,
  openContentArtifact,
  planMaterialization,
  planObjectLayer,
  readBackupContent,
  serveContentArtifact,
  servedContentArtifact,
  storeContentArtifact,
} = await import('../../../src/projects/cyberia/content-artifact.js');

const ENGINE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RENDERLESS = { data: { render: {} } };
const RENDER = { cid: 'bafkreirender', metadataCid: 'bafkreimetadata' };
const zero = { effect: 0, resistance: 0, agility: 0, range: 0, intelligence: 0, utility: 0 };

// Artifact data as cyberia-content builds it, for labels this suite names on its own.
const item = (id, itemId, type, stats = {}) => ({
  id,
  itemId,
  payload: {
    data: { item: { id: itemId, type, description: `The ${itemId}.`, activable: false }, stats: { ...zero, ...stats } },
  },
});
const ITEMS = [
  item('currency.coin', 'coin', 'coin'),
  item('skin.anon', 'anon', 'skin', { effect: 1 }),
  item('floor.grass', 'grass', 'floor'),
  item('weapon.pistol', 'pistol', 'weapon', { effect: 5 }),
  item('projectile.bullet', 'bullet', 'skill', { range: 5 }),
];
const byItemId = new Map(ITEMS.map((entry) => [entry.itemId, entry]));
const SKILLS = [
  {
    triggerItemId: 'pistol',
    logicEventIds: ['projectile'],
    skills: [{ logicEventId: 'projectile', name: 'Shot', description: 'A shot.', summonedEntityItemId: 'bullet' }],
  },
];

const sha256 = (data) => `sha256:${createHash('sha256').update(data).digest('hex')}`;

/** Writes an artifact the way cyberia-content builds one: its files, then a manifest of their digests. */
const writeArtifact = (files, edit = () => {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-artifact-'));
  const digests = {};
  for (const [file, value] of Object.entries(files)) {
    const data = Buffer.from(JSON.stringify(value));
    fs.outputFileSync(path.join(root, 'dist', file), data);
    digests[file] = sha256(data);
  }
  const manifest = {
    repository: 'underpostnet/cyberia-content',
    contentVersion: '1.0.0',
    sourceRevision: 'a'.repeat(40),
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentDigest: sha256(
      Object.keys(digests)
        .sort()
        .map((file) => `${file} ${digests[file]}\n`)
        .join(''),
    ),
    build: {},
    instances: ['X'],
    sagas: [],
    files: digests,
  };
  edit(manifest);
  fs.outputJsonSync(path.join(root, 'dist', 'manifest.json'), manifest);
  return root;
};
const FILES = {
  ...Object.fromEntries(Object.values(CONTENT_FAMILIES).map((family) => [`foundation/${family}.json`, []])),
  'foundation/object-layers.json': ITEMS,
  'foundation/baseline.json': [],
  'instances/X/cyberia-instance.json': { code: 'X' },
};

/** The stored form of what the artifact carries for a label: in sync by construction. */
const projected = (itemId) =>
  composeItemDefinition({ boundData: null, payload: byItemId.get(itemId).payload, setOnInsert: RENDERLESS });

/** The same label as an older record stored it: no description, a drawn render. */
const drawn = (itemId) => {
  const payload = structuredClone(projected(itemId));
  payload.data.item.description = '';
  payload.data.render = RENDER;
  return payload;
};

// An Object Layer store keyed by the real identity, and a catalog of label bindings.
const store = (seed = []) => {
  const docs = new Map();
  const bindings = new Map();
  const put = (payload) => {
    const doc = { ...JSON.parse(JSON.stringify(payload)), ...objectLayerIdentity(payload) };
    docs.set(doc.cid, doc);
    return doc;
  };
  for (const payload of seed) bindings.set(payload.data.item.id, put(payload).cid);
  const ObjectLayer = {
    store: async (payload) => put(payload),
    findByCid: async (cid) => {
      const doc = docs.get(cid);
      return doc ? { ...doc, toObject: () => JSON.parse(JSON.stringify(doc)) } : null;
    },
  };
  const CyberiaItemCatalog = {
    findOne: ({ itemId }) => ({
      lean: async () => (bindings.has(itemId) ? { objectLayerCid: bindings.get(itemId) } : null),
    }),
    bind: async (itemId, cid) => bindings.set(itemId, cid),
  };
  return { models: { ObjectLayer, CyberiaItemCatalog }, docs, bindings };
};

const itemsOf = (...itemIds) => itemIds.map((itemId) => byItemId.get(itemId));

describe('artifact verification', () => {
  it('opens a valid artifact and verifies each file it reads', () => {
    const artifact = openContentArtifact(writeArtifact(FILES));
    expect(artifact.manifest.contentVersion).toBe('1.0.0');
    expect(artifact.json('foundation/object-layers.json')).toHaveLength(ITEMS.length);
    expect(fs.readJsonSync(path.join(artifact.instanceDir('X'), 'cyberia-instance.json'))).toEqual({ code: 'X' });
  });

  it('fails on a missing artifact', () => {
    expect(() => openContentArtifact(fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-empty-')))).toThrow(
      'No content artifact at',
    );
  });

  it('fails on an invalid manifest, a missing version and an unsupported schema', () => {
    const broken = writeArtifact(FILES);
    fs.writeFileSync(path.join(broken, 'dist', 'manifest.json'), '{');
    expect(() => openContentArtifact(broken)).toThrow('Invalid content artifact');
    const floating = writeArtifact(FILES, (manifest) => (manifest.sourceRevision = 'main'));
    expect(() => openContentArtifact(floating)).toThrow('sourceRevision is not a commit id');
    const unversioned = writeArtifact(FILES, (manifest) => delete manifest.contentVersion);
    expect(() => openContentArtifact(unversioned)).toThrow('The content artifact names no content version');
    const newer = writeArtifact(FILES, (manifest) => (manifest.schemaVersion = CONTENT_SCHEMA_VERSION + 1));
    expect(() => openContentArtifact(newer)).toThrow(
      `Content artifact schema ${CONTENT_SCHEMA_VERSION + 1} is not supported`,
    );
  });

  it('fails on a digest mismatch of the file list or of one file', () => {
    const listed = writeArtifact(
      FILES,
      (manifest) => (manifest.files['foundation/object-layers.json'] = `sha256:${'0'.repeat(64)}`),
    );
    expect(() => openContentArtifact(listed)).toThrow(
      'Content digest mismatch: the file list does not match contentDigest',
    );
    const altered = writeArtifact(FILES);
    fs.appendFileSync(path.join(altered, 'dist', 'instances', 'X', 'cyberia-instance.json'), ' ');
    expect(() => openContentArtifact(altered).instanceDir('X')).toThrow(
      'Content digest mismatch: instances/X/cyberia-instance.json',
    );
  });

  it('fails on content the artifact does not hold', () => {
    const artifact = openContentArtifact(writeArtifact(FILES));
    expect(() => artifact.instanceDir('Y')).toThrow('The content artifact holds no instance Y');
    expect(() => artifact.json('sagas/none/saga.json')).toThrow('The content artifact holds no sagas/none/saga.json');
  });
});

/** A release database as the driver offers it: one collection, enough to store and read an artifact. */
const releaseDb = (databaseName = 'cyberia-content-r1') => {
  let documents = [];
  return {
    databaseName,
    documents: () => documents,
    edit: (id, data) => (documents.find(({ _id }) => _id === id).data = data),
    collection: (name) => {
      expect(name).toBe(RELEASE_ARTIFACT_COLLECTION);
      return {
        deleteMany: async () => (documents = []),
        insertMany: async (docs) => documents.push(...structuredClone(docs)),
        find: () => ({ toArray: async () => structuredClone(documents) }),
      };
    },
  };
};
const CONTEXT = { definitions: {}, labels: {}, sources: {}, references: {}, referencedBy: {}, entities: {} };
const RELEASE_FILES = { ...FILES, 'context.json': CONTEXT };

describe('the content artifact a release database holds', () => {
  afterEach(() => serveContentArtifact());

  it('holds every file but the instance backups, and reads as the artifact on disk', async () => {
    const opened = openContentArtifact(writeArtifact(RELEASE_FILES));
    const db = releaseDb();
    expect(await storeContentArtifact(db, opened)).toBe(Object.keys(RELEASE_FILES).length);
    expect(db.documents().map(({ _id }) => _id)).not.toContain('instances/X/cyberia-instance.json');
    const stored = await loadContentArtifact(db, opened.manifest.contentDigest);
    expect(stored.manifest).toEqual(opened.manifest);
    expect(stored.files).toEqual(
      Object.keys(RELEASE_FILES)
        .filter((file) => !file.startsWith('instances/'))
        .sort(),
    );
    expect(stored.json('foundation/object-layers.json')).toEqual(opened.json('foundation/object-layers.json'));
    expect(() => stored.instanceDir('X')).toThrow('A release database holds no instance backup');
  });

  it('replaces what the database held', async () => {
    const db = releaseDb();
    await storeContentArtifact(db, openContentArtifact(writeArtifact(RELEASE_FILES)));
    const next = openContentArtifact(
      writeArtifact({ ...RELEASE_FILES, 'foundation/baseline.json': [{ entityType: 'floor' }] }),
    );
    await storeContentArtifact(db, next);
    expect((await loadContentArtifact(db, next.manifest.contentDigest)).json('foundation/baseline.json')).toEqual([
      { entityType: 'floor' },
    ]);
  });

  it('fails on no artifact, on another artifact than the release records, and on an altered or missing file', async () => {
    const opened = openContentArtifact(writeArtifact(RELEASE_FILES));
    const { contentDigest } = opened.manifest;
    await expect(loadContentArtifact(releaseDb(), contentDigest)).rejects.toThrow(
      'No content artifact in cyberia-content-r1',
    );
    const db = releaseDb();
    await storeContentArtifact(db, opened);
    await expect(loadContentArtifact(db, `sha256:${'0'.repeat(64)}`)).rejects.toThrow(
      `cyberia-content-r1 holds content ${contentDigest}; the release records sha256:${'0'.repeat(64)}`,
    );
    await expect(loadContentArtifact(db, '')).rejects.toThrow('the release records no content');
    db.edit('context.json', '{}');
    await expect(loadContentArtifact(db, contentDigest)).rejects.toThrow('Content digest mismatch: context.json');
    const partial = releaseDb();
    await storeContentArtifact(partial, opened);
    partial.documents().splice(
      partial.documents().findIndex(({ _id }) => _id === 'foundation/skills.json'),
      1,
    );
    await expect(loadContentArtifact(partial, contentDigest)).rejects.toThrow(
      'Invalid content artifact: foundation/skills.json is missing',
    );
  });

  it('is what the process reads while its release serves, until the workspace serves again', async () => {
    const opened = openContentArtifact(writeArtifact(RELEASE_FILES));
    const db = releaseDb();
    await storeContentArtifact(db, opened);
    expect(await serveContentArtifact({ releaseId: 'r1', db, digest: opened.manifest.contentDigest })).toEqual({
      releaseId: 'r1',
      error: '',
    });
    expect(contentArtifact().manifest.contentDigest).toBe(opened.manifest.contentDigest);
    expect(contentArtifact().context).toEqual(CONTEXT);
    expect(Object.isFrozen(contentArtifact().foundation.objectLayers[0].payload.data.item)).toBe(true);
    expect(await serveContentArtifact()).toEqual({ releaseId: '', error: '' });
    expect(servedContentArtifact()).toEqual({ releaseId: '', error: '' });
  });

  it('fails every read of a release whose copy does not load, and loads it again on the next call', async () => {
    const opened = openContentArtifact(writeArtifact(RELEASE_FILES));
    const db = releaseDb();
    const digest = opened.manifest.contentDigest;
    expect(await serveContentArtifact({ releaseId: 'r1', db, digest })).toEqual({
      releaseId: 'r1',
      error: 'Content release r1: No content artifact in cyberia-content-r1',
    });
    expect(() => contentArtifact()).toThrow('Content release r1: No content artifact in cyberia-content-r1');
    await storeContentArtifact(db, opened);
    expect(await serveContentArtifact({ releaseId: 'r1', db, digest })).toEqual({ releaseId: 'r1', error: '' });
    expect(contentArtifact().context).toEqual(CONTEXT);
  });
});

describe('content roots', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolves the nested checkouts, or the paths the variables name', () => {
    vi.stubEnv('CYBERIA_CONTENT_ROOT', '');
    vi.stubEnv('CYBERIA_DEPLOYMENT_ROOT', '');
    expect(contentRoot()).toBe(path.join(ENGINE_ROOT, 'cyberia-content'));
    expect(deploymentRoot()).toBe(path.join(ENGINE_ROOT, 'cyberia-deployment'));
    vi.stubEnv('CYBERIA_CONTENT_ROOT', '/srv/content');
    vi.stubEnv('CYBERIA_DEPLOYMENT_ROOT', '/srv/deployment');
    expect(contentRoot()).toBe('/srv/content');
    expect(deploymentRoot()).toBe('/srv/deployment');
  });

  it('writes into a source checkout only, never into a packed artifact', () => {
    const packed = writeArtifact(FILES);
    vi.stubEnv('CYBERIA_CONTENT_ROOT', packed);
    expect(() => contentSources()).toThrow(`${packed} is not a cyberia-content source checkout`);
    fs.mkdirpSync(path.join(packed, 'src'));
    expect(contentSources()).toBe(path.join(packed, 'src'));
  });
});

describe('the source lock entry of the content artifact', () => {
  const { manifest } = openContentArtifact(writeArtifact(FILES));
  const entry = contentLockEntry(manifest);

  it('pins the repository, the source revision and the identity of the artifact', () => {
    expect(entry).toEqual({
      repository: manifest.repository,
      revision: manifest.sourceRevision,
      artifact: { version: manifest.contentVersion, digest: manifest.contentDigest },
    });
    expect(
      readSourceLock({ lockVersion: 1, sources: { 'cyberia-content': entry } }).sources['cyberia-content'],
    ).toEqual(entry);
  });

  it('matches the lock that pins it, and names every field another artifact changes', () => {
    const lock = readSourceLock({ lockVersion: 1, sources: { 'cyberia-content': entry } });
    expect(() => verifyLockedSource(lock, 'cyberia-content', entry)).not.toThrow();
    const other = { ...entry, artifact: { version: '0.0.1', digest: `sha256:${'0'.repeat(64)}` } };
    expect(() => verifyLockedSource(lock, 'cyberia-content', other)).toThrow(
      `artifact version 0.0.1 (lock: ${manifest.contentVersion}), artifact digest ${other.artifact.digest} (lock: ${manifest.contentDigest})`,
    );
  });
});

// cyberia-content is a checkout of the workspace: without its built artifact there is nothing to open.
describe.skipIf(!hasContentArtifact())('the workspace content artifact', () => {
  it('opens once, of a supported schema, with every foundation family and its baseline frozen', () => {
    const artifact = contentArtifact();
    expect(contentArtifact()).toBe(artifact);
    expect(artifact.manifest.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(Object.keys(artifact.foundation)).toEqual(Object.keys(CONTENT_FAMILIES));
    expect(Object.isFrozen(artifact.baseline[0].liveItemIds)).toBe(true);
    expect(Object.isFrozen(artifact.foundation.objectLayers[0].payload.data.item)).toBe(true);
    const [code] = artifact.manifest.instances;
    expect(fs.existsSync(path.join(artifact.instanceDir(code), 'cyberia-instance.json'))).toBe(true);
    for (const saga of artifact.manifest.sagas)
      expect(Object.keys(artifact.saga(saga).families)).toEqual(Object.keys(CONTENT_FAMILIES));
    expect(() => artifact.saga('none')).toThrow('The content artifact holds no saga none');
  });
});

describe('materialization plan', () => {
  it('names a label with no definition absent, and the identity it would get', () => {
    const entry = planObjectLayer(byItemId.get('coin'), null);
    expect(entry).toMatchObject({ itemId: 'coin', status: 'absent', boundCid: '' });
    expect(entry.cid).toBe(objectLayerIdentity(projected('coin')).cid);
  });

  it('reuses a bound definition that holds the same canonical content', () => {
    const bound = { ...projected('coin'), ...objectLayerIdentity(projected('coin')) };
    expect(planObjectLayer(byItemId.get('coin'), bound)).toMatchObject({ status: 'in-sync', cid: bound.cid });
  });

  it('names what differs on a bound definition with other content, and keeps its render', () => {
    const bound = { ...drawn('anon'), ...objectLayerIdentity(drawn('anon')) };
    const entry = planObjectLayer(byItemId.get('anon'), bound);
    expect(entry).toMatchObject({ status: 'differs', boundCid: bound.cid, fields: ['item.description'] });
    const next = composeItemDefinition({ boundData: bound.data, payload: byItemId.get('anon').payload });
    expect(next.data.render).toEqual(RENDER);
    expect(entry.cid).toBe(objectLayerIdentity(next).cid);
  });
});

describe('materialization', () => {
  it('creates absent labels, keeps differing ones, and is idempotent', async () => {
    const { models, docs, bindings } = store([drawn('anon')]);
    const items = itemsOf('coin', 'anon');
    const plan = await planMaterialization({ items, models });
    expect(plan.map(({ itemId, status }) => [itemId, status])).toEqual([
      ['coin', 'absent'],
      ['anon', 'differs'],
    ]);

    const written = await materializeObjectLayers({ plan, items, models });
    expect(written.map(({ itemId }) => itemId)).toEqual(['coin']);
    expect(bindings.get('anon')).toBe(plan[1].boundCid);

    const again = await planMaterialization({ items, models });
    expect(again.map(({ status }) => status)).toEqual(['in-sync', 'differs']);
    expect(await materializeObjectLayers({ plan: again, items, models })).toEqual([]);
    expect(docs.size).toBe(2);
  });

  it('publishes differing content as a new definition on a rebind: both definitions of the label survive', async () => {
    const { models, docs, bindings } = store([drawn('anon')]);
    const items = itemsOf('anon');
    const plan = await planMaterialization({ items, models });
    const [entry] = await materializeObjectLayers({ plan, items, models, rebind: true });

    expect(entry.cid).not.toBe(plan[0].boundCid);
    expect(bindings.get('anon')).toBe(entry.cid);
    // The earlier definition is never rewritten: it stays stored under its own identity.
    expect(docs.get(plan[0].boundCid).data.item.description).toBe('');
    expect(docs.get(entry.cid).data.render).toEqual(RENDER);
    expect((await planMaterialization({ items, models }))[0].status).toBe('in-sync');
  });

  it('plans by identity, never by item id: a stored definition no binding names leaves the label absent', async () => {
    const { models, docs, bindings } = store([drawn('anon')]);
    bindings.delete('anon');
    const items = itemsOf('anon');
    const plan = await planMaterialization({ items, models });
    expect(plan.map(({ status }) => status)).toEqual(['absent']);
    const [entry] = await materializeObjectLayers({ plan, items, models });
    expect(bindings.get('anon')).toBe(entry.cid);
    expect([...docs.values()].filter((doc) => doc.data.item.id === 'anon')).toHaveLength(2);
  });
});

/** An in-memory collection with the queries an import runs. */
const collection = (seed = []) => {
  const docs = seed.map((doc, index) => ({ _id: `seed-${index}`, ...structuredClone(doc) }));
  const matches = (doc, filter) =>
    Object.entries(filter).every(([key, value]) => JSON.stringify(doc[key]) === JSON.stringify(value));
  const add = (doc) => docs.push({ _id: `id-${docs.length}`, ...structuredClone(doc) });
  return {
    docs,
    findOne: (filter) => ({ lean: async () => structuredClone(docs.find((doc) => matches(doc, filter)) ?? null) }),
    find: (filter) => ({
      sort: () => ({
        lean: async () => structuredClone(docs.filter((doc) => matches(doc, filter)).sort((a, b) => a.order - b.order)),
      }),
    }),
    create: async (doc) => add(doc),
    insertMany: async (list) => list.forEach(add),
    updateOne: async (filter, { $set }) =>
      Object.assign(
        docs.find((doc) => matches(doc, filter)),
        structuredClone($set),
      ),
    deleteMany: async (filter) => {
      for (let index = docs.length - 1; index >= 0; index--) if (matches(docs[index], filter)) docs.splice(index, 1);
    },
  };
};

// Compiled families as cyberia-content builds them, one document or dialogue per family.
const FAMILIES = {
  objectLayers: itemsOf('coin', 'pistol'),
  entityTypeDefaults: [
    {
      entityType: 'bot',
      liveItemIds: ['anon', 'pistol'],
      deadItemIds: [],
      dropItemIds: ['coin'],
      inventoryItemsIds: [],
      overrideItemsIdsState: [{ itemId: 'coin', quantity: 2, dropChance: 0.5 }],
      behavior: 'hostile',
    },
  ],
  skills: SKILLS,
  maps: [
    {
      code: 'glade',
      name: 'Glade',
      description: 'A glade.',
      tags: ['meadow'],
    },
  ],
  quests: [
    {
      code: 'logs',
      title: 'Logs',
      description: 'Cut logs.',
      prerequisiteCodes: [],
      unlocksQuestCodes: [],
      sourceMapCode: null,
      sourceCellX: null,
      sourceCellY: null,
      steps: [{ id: 'cut', description: 'Cut.', objectives: [{ type: 'collect', itemId: 'coin', quantity: 2 }] }],
      rewards: [{ itemId: 'coin', quantity: 3 }],
    },
  ],
  dialogues: [
    { code: 'default-anon', order: 0, speaker: 'Anon', text: 'Hello.', mood: 'happy' },
    { code: 'default-anon', order: 1, speaker: 'Anon', text: 'Bye.', mood: 'neutral' },
  ],
  actions: [
    {
      code: 'post',
      label: 'Post',
      dialogCode: 'default-anon',
      sourceMapCode: null,
      sourceCellX: null,
      sourceCellY: null,
      questDialogueCodes: [],
      shopItems: [{ itemId: 'pistol', priceItemId: 'coin', priceQty: 4 }],
      craftRecipes: [],
      storageSlots: 0,
    },
  ],
};

/** A store of every content collection, and the catalog of the Object Layer store. */
const contentStore = (seed = {}) => {
  const { models } = store();
  return {
    ...models,
    CyberiaEntityTypeDefault: collection(seed.entityTypeDefaults),
    CyberiaSkill: collection(seed.skills),
    CyberiaMap: collection(seed.maps),
    CyberiaQuest: collection(seed.quests),
    CyberiaDialogue: collection(seed.dialogues),
    CyberiaAction: collection(seed.actions),
  };
};
const statuses = (plan) =>
  Object.fromEntries(
    Object.entries(plan.documents).map(([family, entries]) => [family, entries.map(({ status }) => status)]),
  );

describe('content import', () => {
  it('inserts every family, finds it in sync the second time, and writes nothing then', async () => {
    const models = contentStore();
    const first = await importContent({ families: FAMILIES, models });
    expect(first.objectLayers).toBe(2);
    expect(first.written).toEqual({
      entityTypeDefaults: 1,
      skills: 1,
      maps: 1,
      quests: 1,
      dialogues: 1,
      actions: 1,
    });
    expect(models.CyberiaDialogue.docs.map(({ order }) => order)).toEqual([0, 1]);
    expect(first.entityTypeDefaultIds).toEqual([models.CyberiaEntityTypeDefault.docs[0]._id]);

    const second = await importContent({ families: FAMILIES, models });
    expect(second.objectLayers).toBe(0);
    expect(Object.values(second.written).every((count) => count === 0)).toBe(true);
    expect(
      Object.values(statuses(second.plan))
        .flat()
        .every((status) => status === 'in-sync'),
    ).toBe(true);
  });

  it('keeps what differs, and moves it to the artifact on rebind, never Studio placement or entities', async () => {
    const placedQuest = { ...FAMILIES.quests[0], title: 'Old', sourceMapCode: 'glade', sourceCellX: 3, sourceCellY: 4 };
    const models = contentStore({
      quests: [placedQuest],
      dialogues: [{ code: 'default-anon', order: 0, speaker: 'Anon', text: 'Old.', mood: 'neutral' }],
      maps: [{ ...FAMILIES.maps[0], name: 'Old', entities: [{ entityType: 'bot', initCellX: 1, initCellY: 2 }] }],
    });
    const kept = await importContent({ families: FAMILIES, models });
    expect(statuses(kept.plan)).toMatchObject({ quests: ['differs'], dialogues: ['differs'], maps: ['differs'] });
    expect(models.CyberiaQuest.docs[0].title).toBe('Old');

    await importContent({ families: FAMILIES, models, rebind: true });
    expect(models.CyberiaQuest.docs[0]).toMatchObject({ title: 'Logs', sourceMapCode: 'glade', sourceCellX: 3 });
    expect(models.CyberiaDialogue.docs.map(({ text }) => text)).toEqual(['Hello.', 'Bye.']);
    expect(models.CyberiaMap.docs[0]).toMatchObject({ name: 'Glade', entities: [{ initCellX: 1, initCellY: 2 }] });
  });

  it('compares only what the artifact compiles: stored extras never differ', () => {
    expect(holdsContent({ _id: 'x', a: [{ _id: 'y', b: 1, active: true }], c: null }, { a: [{ b: 1 }], c: null })).toBe(
      true,
    );
    expect(holdsContent({ a: [{ b: 1 }, { b: 2 }] }, { a: [{ b: 1 }] })).toBe(false);
    expect(holdsContent({}, { c: null })).toBe(true);
  });
});

describe('content audit', () => {
  const write = (root, file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), JSON.stringify(value));
  };
  const backup = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-backup-'));
    write(root, 'object-layers/coin.json', { ...projected('coin'), ...objectLayerIdentity(projected('coin')) });
    write(root, 'object-layers/anon.json', { ...drawn('anon'), ...objectLayerIdentity(drawn('anon')) });
    const legacy = {
      data: { item: { id: 'gp1', type: 'skin', description: 'Old skin', activable: true }, stats: { effect: 1 } },
    };
    write(root, 'object-layers/gp1.json', legacy);
    write(root, 'maps/m.json', { code: 'm', entities: [{ objectLayerItemIds: ['grass', 'violet-knot'] }] });
    write(root, 'cyberia-sagas/s.json', {
      code: 'saga-x',
      definitions: [{ id: 'vegetation.violet-knot', objectLayer: { itemType: 'static' } }],
    });
    write(root, 'cyberia-skills/pistol.json', { _id: 'x', ...SKILLS[0] });
    write(root, 'cyberia-skills/custom.json', { triggerItemId: 'custom-gun', skills: [] });
    write(root, 'cyberia-dialogues/default-coin.json', [{ code: 'default-coin', order: 0 }]);
    return root;
  };

  it('classifies every label a backup stores or names, and plans the foundation ones', () => {
    const root = backup();
    const report = auditContent({
      content: readBackupContent(root),
      artifact: { byItemId, foundation: { skills: SKILLS } },
    });
    fs.rmSync(root, { recursive: true, force: true });

    expect(report.inspected).toMatchObject({ objectLayers: 3, maps: 1, sagas: 1, skills: 2, dialogues: 1 });
    const status = Object.fromEntries(report.foundation.map(({ itemId, status }) => [itemId, status]));
    expect(status).toEqual({ coin: 'in-sync', anon: 'differs', grass: 'absent', pistol: 'absent', bullet: 'absent' });
    expect(report.generated).toEqual([{ itemId: 'violet-knot', saga: 'saga-x' }]);
    expect(report.unresolved).toEqual([
      { itemId: 'custom-gun', stored: false, named: true },
      { itemId: 'gp1', stored: true, named: false },
    ]);
    expect(report.skills).toEqual([
      { triggerItemId: 'custom-gun', status: 'not-foundation' },
      { triggerItemId: 'pistol', status: 'in-sync' },
    ]);
  });
});
