import { describe, it, expect, beforeEach, vi } from 'vitest';

// The materializations a write stores, by definition cid.
const materializations = vi.hoisted(() => ({ ObjectLayerRenderFrames: new Map(), AtlasSpriteSheet: new Map() }));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: (name) => {
      const stored = materializations[name];
      if (!stored) return { name };
      return {
        findOne: ({ objectLayerCid }) => ({ lean: async () => stored.get(objectLayerCid) ?? null }),
        materialize: async (objectLayerCid, source) => stored.set(objectLayerCid, source),
        sourceOf: (document) => ({ ...document }),
      };
    },
  },
}));
vi.mock('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js', () => ({
  AtlasSpriteSheetStore: {
    materialize: async ({ objectLayerCid, atlas }) => materializations.AtlasSpriteSheet.set(objectLayerCid, atlas),
  },
}));

// Publication is the Object Layer module's; here it stores through the stub model, or refuses.
const publication = { refuse: null };
vi.mock('../../../src/api/object-layer/object-layer.publication.js', () => ({
  publishDefinition: async ({ ObjectLayer, payload }) => {
    if (publication.refuse) throw publication.refuse;
    return await ObjectLayer.upsertByIdentity(payload, { origin: 'canonical' });
  },
  cacheCanonical: async () => {},
  isObjectLayerAuthority: () => true,
  objectLayerCache: () => ({ instance: {}, prefix: 'cache:test', label: 'test', ttlMs: 0 }),
}));
vi.mock('../../../src/server/storage/cache.js', () => ({ CacheService: { invalidate: async () => {} } }));
// The IPFS bundle of every written definition, by cid, after its materializations.
const bundles = vi.hoisted(() => []);
vi.mock('../../../src/api/object-layer/object-layer.ipfs.js', () => ({
  publishObjectLayerBundle: async ({ definition }) => {
    bundles.push(definition.cid);
    return { resources: [] };
  },
}));

const {
  bindItem,
  boundItemIds,
  catalogModels,
  composeItemDefinition,
  findAllBoundDefinitions,
  findBoundDefinition,
  findBoundDefinitions,
  mergeObjectLayerData,
  publishItemDefinition,
  reviseItemDefinition,
  seedItemCatalog,
} = await import('../../../src/projects/cyberia/catalog/object-layer-catalog.js');
const { objectLayerIdentity } = await import('../../../src/api/object-layer/object-layer.identity.js');
const { CyberiaObjectLayerProfile } =
  await import('../../../src/client/components/cyberia/ObjectLayerProfileCyberia.js');

const lean = (value) => ({ lean: async () => value });
const def = (cid, id = 'hatchet') => ({ _id: `doc-${cid}`, cid, data: { item: { id, type: 'weapon' } } });

// A catalog collection and a store keyed by cid.
const stubModels = ({ bindings = {}, definitions = [] } = {}) => {
  const state = { bindings: { ...bindings }, definitions: [...definitions], created: null, bound: [] };
  const CyberiaItemCatalog = {
    findOne: ({ itemId }) => lean(state.bindings[itemId] ? { objectLayerCid: state.bindings[itemId] } : null),
    resolve: async (itemIds) =>
      new Map(itemIds.filter((id) => state.bindings[id]).map((id) => [id, state.bindings[id]])),
    distinct: async (field) =>
      field === 'itemId' ? Object.keys(state.bindings) : [...new Set(Object.values(state.bindings))],
    bind: async (itemId, cid, { expectedCid, source, by }) => {
      state.bound.push({ itemId, cid, expectedCid, source, by });
      state.bindings[itemId] = cid;
      return { itemId, objectLayerCid: cid };
    },
  };
  const ObjectLayer = {
    findByCid: async (cid) => {
      const doc = state.definitions.find((d) => d.cid === cid);
      return doc ? { ...doc, toObject: () => JSON.parse(JSON.stringify(doc)) } : null;
    },
    findOne: ({ cid }) => lean(state.definitions.find((d) => d.cid === cid) ?? null),
    find: (filter) => lean(state.definitions.filter((d) => filter.cid.$in.includes(d.cid))),
    upsertByIdentity: async (payload, { origin }) => {
      state.created = { ...payload, origin };
      const stored = { ...payload, origin, cid: `cid-of-${payload.data.item.id}-${payload.data.stats?.effect ?? 0}` };
      state.definitions.push(stored);
      return stored;
    },
    aggregate: async () => {
      const groups = new Map();
      for (const d of state.definitions) groups.set(d.data.item.id, [...(groups.get(d.data.item.id) ?? []), d.cid]);
      return [...groups].map(([_id, cids]) => ({ _id, cids }));
    },
  };
  return { models: { ObjectLayer, CyberiaItemCatalog }, state };
};

describe('catalog resolution', () => {
  it('resolves a label to the definition it is bound to, and nothing when unbound', async () => {
    const { models } = stubModels({ bindings: { hatchet: 'B' }, definitions: [def('A'), def('B')] });
    expect((await findBoundDefinition(models, 'hatchet')).cid).toBe('B');
    expect(await findBoundDefinition(models, 'ghost')).toBe(null);
  });

  it('never picks a definition by label alone: several definitions, no binding, no result', async () => {
    const { models } = stubModels({ definitions: [def('A'), def('B')] });
    expect(await findBoundDefinition(models, 'hatchet')).toBe(null);
    expect(await findBoundDefinitions(models, ['hatchet'])).toEqual([]);
  });

  it('lists the bound definitions of several labels and of the whole catalog', async () => {
    const { models } = stubModels({
      bindings: { hatchet: 'B', sword: 'S' },
      definitions: [def('A'), def('B'), def('S', 'sword')],
    });
    expect((await findBoundDefinitions(models, ['hatchet', 'sword', 'ghost'])).map((d) => d.cid)).toEqual(['B', 'S']);
    expect((await findAllBoundDefinitions(models)).map((d) => d.cid)).toEqual(['B', 'S']);
    expect(await boundItemIds(models)).toEqual(['hatchet', 'sword']);
  });

  it('reads both models from one deployment context', () => {
    expect(catalogModels({ host: 'h', path: '/' })).toEqual({
      ObjectLayer: { name: 'ObjectLayer' },
      CyberiaItemCatalog: { name: 'CyberiaItemCatalog' },
    });
  });
});

const storedData = () => ({
  stats: { effect: 5, resistance: 4, agility: 6, range: 2, intelligence: 0, utility: 1 },
  item: { id: 'hatchet', type: 'weapon', description: 'a hatchet', activable: true },
  render: { cid: 'bafk-atlas', metadataCid: 'bafk-atlas-metadata' },
});

describe('object layer data merge', () => {
  it('keeps the stored value when the writer sends null, undefined or empty string', () => {
    const merged = mergeObjectLayerData(storedData(), {
      render: { cid: null, metadataCid: '' },
      item: { description: undefined },
    });
    expect(merged.render).toEqual({ cid: 'bafk-atlas', metadataCid: 'bafk-atlas-metadata' });
    expect(merged.item.description).toBe('a hatchet');
  });

  it('prioritizes the last attribute that carries a value', () => {
    const merged = mergeObjectLayerData(storedData(), {
      item: { description: 'sharpened hatchet' },
      render: { cid: 'bafk-new-atlas' },
    });
    expect(merged.item.description).toBe('sharpened hatchet');
    expect(merged.render).toEqual({ cid: 'bafk-new-atlas', metadataCid: 'bafk-atlas-metadata' });
  });

  it('treats false and 0 as real values, not as absent', () => {
    const merged = mergeObjectLayerData(storedData(), { item: { activable: false }, stats: { effect: 0 } });
    expect(merged.item.activable).toBe(false);
    expect(merged.stats.effect).toBe(0);
  });

  it('replaces non-plain values whole and takes the incoming shape when nothing is stored', () => {
    expect(mergeObjectLayerData({ at: new Date(0) }, { at: new Date(1) }).at.getTime()).toBe(1);
    expect(mergeObjectLayerData({ ref: 'old' }, { ref: null }).ref).toBe('old');
    expect(mergeObjectLayerData(undefined, { render: { cid: null } })).toEqual({ render: { cid: null } });
  });
});

describe('publishItemDefinition', () => {
  const profile = { id: CyberiaObjectLayerProfile.id, version: CyberiaObjectLayerProfile.version };

  beforeEach(() => {
    for (const stored of Object.values(materializations)) stored.clear();
  });

  it('rejects a payload without data.item.id', async () => {
    const { models } = stubModels();
    await expect(publishItemDefinition({ models, payload: { data: { item: {} } } })).rejects.toThrow(/data\.item\.id/);
  });

  it('publishes a new label under the Cyberia profile and binds nothing', async () => {
    const { models, state } = stubModels();
    await publishItemDefinition({
      models,
      payload: { data: { item: { id: 'shard', type: 'resource' }, stats: { effect: 1 } } },
      setOnInsert: { data: { render: {} } },
    });
    expect(state.created.profile).toEqual(profile);
    expect(state.created.data.render).toEqual({});
    expect(state.created.data.stats.effect).toBe(1);
    expect(state.bound).toEqual([]);
  });

  it('rejects stats outside the Cyberia profile', async () => {
    const { models } = stubModels();
    await expect(
      publishItemDefinition({
        models,
        payload: { data: { item: { id: 'shard', type: 'resource' }, stats: { effect: 101 } } },
      }),
    ).rejects.toThrow();
  });

  it('never lets a degraded import erase what the bound definition holds, and keeps the binding', async () => {
    const bound = { _id: 'a', cid: 'cid-of-hatchet-5', data: storedData() };
    const { models, state } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    await publishItemDefinition({
      models,
      payload: {
        _id: 'backup-id',
        data: {
          item: { id: 'hatchet', type: 'weapon', description: '', activable: true },
          stats: { effect: 7 },
          render: { cid: '', metadataCid: '' },
        },
      },
    });
    const { created } = state;
    expect(created).not.toHaveProperty('_id');
    expect(created.data.render).toEqual({ cid: 'bafk-atlas', metadataCid: 'bafk-atlas-metadata' });
    expect(created.data.item.description).toBe('a hatchet');
    expect(created.data.stats.effect).toBe(7);
    expect(state.bound).toEqual([]);
    expect(state.bindings.hatchet).toBe(bound.cid);
  });

  it('composes an exact payload alone, never over the bound definition', async () => {
    const bound = { _id: 'a', cid: 'cid-of-hatchet-5', data: storedData() };
    const { models, state } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    await publishItemDefinition({
      models,
      payload: { data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 7 } } },
      exact: true,
    });
    expect(state.created.data.render).toBeUndefined();
    expect(state.created.data.item.description).toBeUndefined();
  });

  it('stores the render frames and atlas it is given under the written cid, names that render, and stores its bundle', async () => {
    const { models, state } = stubModels();
    const renderFrames = { frames: {}, colors: [], frame_duration: 100 };
    const rendered = { render: { cid: 'bafk-new', metadataCid: 'bafk-new-metadata' }, atlas: { fileId: 'f1' } };
    const definition = await publishItemDefinition({
      models,
      payload: { data: { item: { id: 'shard', type: 'resource' }, stats: { effect: 1 } } },
      renderFrames,
      rendered,
    });
    expect(state.created.data.render).toEqual(rendered.render);
    expect(materializations.ObjectLayerRenderFrames.get(definition.cid)).toBe(renderFrames);
    expect(materializations.AtlasSpriteSheet.get(definition.cid)).toBe(rendered.atlas);
    expect(bundles.at(-1)).toBe(definition.cid);
  });

  it("hands the bound definition's materializations to a successor that names its render", async () => {
    const bound = { _id: 'a', cid: 'cid-of-hatchet-5', data: storedData() };
    const { models } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    materializations.ObjectLayerRenderFrames.set(bound.cid, { frames: { down_idle: [] } });
    materializations.AtlasSpriteSheet.set(bound.cid, { fileId: 'f-hatchet' });

    const successor = await publishItemDefinition({
      models,
      payload: { data: { item: { id: 'hatchet' }, stats: { effect: 7 } } },
    });

    expect(successor.cid).toBe('cid-of-hatchet-7');
    expect(materializations.ObjectLayerRenderFrames.get(successor.cid)).toEqual({ frames: { down_idle: [] } });
    expect(materializations.AtlasSpriteSheet.get(successor.cid)).toEqual({ fileId: 'f-hatchet' });
  });

  it('hands nothing to a successor that names another render', async () => {
    const bound = { _id: 'a', cid: 'cid-of-hatchet-5', data: storedData() };
    const { models } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    materializations.ObjectLayerRenderFrames.set(bound.cid, { frames: { down_idle: [] } });
    const rendered = { render: { cid: 'bafk-other', metadataCid: 'bafk-other-metadata' }, atlas: { fileId: 'f2' } };

    const successor = await publishItemDefinition({
      models,
      payload: { data: { item: { id: 'hatchet' }, stats: { effect: 7 } } },
      rendered,
    });

    expect(materializations.ObjectLayerRenderFrames.has(successor.cid)).toBe(false);
    expect(materializations.AtlasSpriteSheet.get(successor.cid)).toBe(rendered.atlas);
  });

  it('binds nothing when the content is unchanged', async () => {
    const bound = { _id: 'a', cid: 'cid-of-hatchet-5', data: storedData() };
    const { models, state } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    await publishItemDefinition({ models, payload: { data: { item: { id: 'hatchet' }, stats: { effect: 5 } } } });
    expect(state.bound).toEqual([]);
  });

  it('binds nothing when the Object Layer authority does not store the definition', async () => {
    const bound = { _id: 'a', cid: 'cid-of-hatchet-5', data: storedData() };
    const { models, state } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    publication.refuse = new Error('Object Layer cid-of-hatchet-7 is kept as a draft: authority unreachable');
    try {
      await expect(
        publishItemDefinition({ models, payload: { data: { item: { id: 'hatchet' }, stats: { effect: 7 } } } }),
      ).rejects.toThrow(/kept as a draft/);
    } finally {
      publication.refuse = null;
    }
    expect(state.bound).toEqual([]);
    expect(state.bindings.hatchet).toBe('cid-of-hatchet-5');
  });
});

describe('bindItem', () => {
  it('binds through the catalog with the cid the caller saw, what binds and who', async () => {
    const { models, state } = stubModels({ definitions: [{ ...def('A'), origin: 'canonical' }] });
    await bindItem({ models, itemId: 'hatchet', objectLayerCid: 'A', expectedCid: '', source: 'studio', by: 'u1' });
    expect(state.bound).toEqual([{ itemId: 'hatchet', cid: 'A', expectedCid: '', source: 'studio', by: 'u1' }]);
  });

  it('refuses a draft, an archived definition and one no host holds, and binds nothing', async () => {
    const { models, state } = stubModels({
      definitions: [
        { ...def('D'), origin: 'draft' },
        { ...def('R'), origin: 'canonical', archivedAt: new Date() },
      ],
    });
    const bind = (objectLayerCid) =>
      bindItem({ models, itemId: 'hatchet', objectLayerCid, expectedCid: '', source: 'studio' });
    await expect(bind('D')).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/draft/) });
    await expect(bind('R')).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/archived/) });
    await expect(bind('ghost')).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/No Object Layer/),
    });
    await expect(bindItem({ models, itemId: '', objectLayerCid: 'D', expectedCid: '' })).rejects.toThrow(/item id/);
    expect(state.bound).toEqual([]);
  });
});

describe('reviseItemDefinition', () => {
  const profile = { id: CyberiaObjectLayerProfile.id, version: CyberiaObjectLayerProfile.version };
  // A bound definition stored as the current profile composes it: its cid is its identity.
  const current = (data) => {
    const composed = composeItemDefinition({ boundData: data, payload: { data } });
    return { _id: 'a', cid: objectLayerIdentity(composed).cid, profile: composed.profile, data: composed.data };
  };

  it('writes nothing while the bound definition is current under the profile', async () => {
    const bound = current(storedData());
    const { models, state } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    const result = await reviseItemDefinition({ models, itemId: 'hatchet' });
    expect(result.written).toBe(false);
    expect(result.definition.cid).toBe(bound.cid);
    expect(state.created).toBe(null);
    expect(state.bound).toEqual([]);
  });

  it('writes a definition stored under an older profile again, with the stats the current one declares', async () => {
    const { utility, ...olderStats } = storedData().stats;
    const data = { ...storedData(), stats: olderStats };
    const older = { profile: { ...profile, version: profile.version - 1 }, data };
    const bound = { _id: 'a', cid: objectLayerIdentity(older).cid, ...older };
    const { models, state } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    const result = await reviseItemDefinition({ models, itemId: 'hatchet' });
    expect(result.written).toBe(true);
    expect(state.created.profile).toEqual(profile);
    expect(state.created.data.stats.utility).toBe(0);
    expect(state.bound).toEqual([
      { itemId: 'hatchet', cid: 'cid-of-hatchet-5', expectedCid: bound.cid, source: 'revise', by: '' },
    ]);
  });

  it('writes what revise changes on a copy, and rebinds the label', async () => {
    const bound = current(storedData());
    const { models, state } = stubModels({ bindings: { hatchet: bound.cid }, definitions: [bound] });
    const result = await reviseItemDefinition({
      models,
      itemId: 'hatchet',
      revise: (payload) => {
        payload.data.stats.effect = 9;
      },
    });
    expect(result.written).toBe(true);
    expect(state.bound).toEqual([
      { itemId: 'hatchet', cid: 'cid-of-hatchet-9', expectedCid: bound.cid, source: 'revise', by: '' },
    ]);
    expect(bound.data.stats.effect).toBe(5);
  });

  it('answers no definition for an unbound label', async () => {
    const { models, state } = stubModels();
    expect(await reviseItemDefinition({ models, itemId: 'ghost' })).toEqual({ definition: null, written: false });
    expect(state.created).toBe(null);
  });
});

describe('seedItemCatalog', () => {
  it('binds labels with one definition and reports labels with several', async () => {
    const { models, state } = stubModels({
      bindings: { sword: 'S' },
      definitions: [def('A'), def('B'), def('S', 'sword'), def('X', 'shard')],
    });
    const result = await seedItemCatalog(models);
    expect(result.bound).toBe(1);
    expect(state.bindings.shard).toBe('X');
    expect(result.ambiguous).toEqual([{ itemId: 'hatchet', cids: ['A', 'B'] }]);
  });
});
