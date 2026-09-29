import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { sourceFromIndexedFrames, toWire } from '../../../src/client/components/objectlayer-studio/RenderSource.js';

// The Studio writes through the Object Layer engine; here it records what the routes hand it.
const persisted = vi.hoisted(() => []);
const trees = vi.hoisted(() => ({ paths: [] }));
vi.mock('../../../src/projects/cyberia/object-layer.js', () => ({
  ObjectLayerEngine: {
    persistObjectLayerDocuments: async (write) => (persisted.push(write), { _id: 'new' }),
    publishItemDefinition: async (write) => (persisted.push(write), { _id: 'new' }),
    payloadOf: (doc) => ({ data: doc.data }),
    clientPublicPaths: () => trees.paths,
  },
}));
const store = vi.hoisted(() => ({ loaded: null, boundCid: null, stored: null }));
vi.mock('../../../src/projects/cyberia/object-layer-catalog.js', () => ({
  catalogModels: () => ({
    ObjectLayer: {
      findById: () => Object.assign(Promise.resolve(store.loaded), { lean: async () => store.loaded }),
      exists: async () => false,
    },
    CyberiaItemCatalog: { deleteMany: async () => ({}) },
  }),
  catalogMounted: () => true,
  findBoundDefinition: async () => (store.boundCid ? { cid: store.boundCid } : null),
}));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: () => ({
      findOne: () => ({ lean: async () => store.stored }),
      sourceOf: () => 'stored-source',
    }),
  },
}));

const { mount, beforeDelete } = await import('../../../src/projects/cyberia/object-layer.extension.js');

const routes = {};
mount(
  Object.fromEntries(
    ['get', 'post', 'put'].map((method) => [
      method,
      (route, ...handlers) => (routes[`${method} ${route}`] = handlers.at(-1)),
    ]),
  ),
  { authMiddleware: () => {}, host: 'h', path: '/' },
);
const call = async (route, req) => {
  const res = { status: (code) => ((res.code = code), res), json: (body) => ((res.body = body), res) };
  await routes[route]({ auth: { user: { _id: 'u1' } }, params: {}, ...req }, res);
  return res;
};
const source = sourceFromIndexedFrames({
  frames: { down_idle: [[[0, 1]]] },
  colors: [
    [0, 0, 0, 0],
    [255, 0, 0, 255],
  ],
  frameDurationMs: 100,
});

describe('the Cyberia Studio routes of the Object Layer API', () => {
  beforeEach(() => {
    persisted.length = 0;
    store.loaded = { _id: 'ol1', cid: 'cid-1', data: { item: { id: 'grass', type: 'floor' } } };
    store.boundCid = 'cid-1';
    store.stored = null;
  });

  it('serves no route that writes the asset tree', () => {
    expect(Object.keys(routes).sort()).toEqual(['get /context/:id', 'post /', 'post /:id', 'put /', 'put /:id']);
  });

  it('publishes the render source the editor sends inline, and answers 409 once another save moved the label', async () => {
    const body = { data: { item: { id: 'grass', type: 'floor' } }, objectLayerRenderFramesData: toWire(source) };
    const saved = await call('put /:id', { params: { id: 'ol1' }, body });
    expect(saved.code).toBe(200);
    expect(persisted[0].objectLayerRenderFramesData.frames.down_idle[0]).toEqual(source.frames.down_idle[0]);
    expect(persisted[0].objectLayerData).toMatchObject({ data: body.data, createdBy: 'u1' });

    store.boundCid = 'cid-2';
    const stale = await call('put /:id', { params: { id: 'ol1' }, body });
    expect(stale.code).toBe(409);
    expect(persisted).toHaveLength(1);
  });

  it('rebuilds from the stored render frames when the body carries none', async () => {
    store.stored = { objectLayerCid: 'cid-1' };
    await call('put /:id', { params: { id: 'ol1' }, body: { data: { item: { id: 'grass', type: 'floor' } } } });
    expect(persisted[0].objectLayerRenderFramesData).toBe('stored-source');
  });
});

describe('a deleted definition', () => {
  let root;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ol-assets-'));
    trees.paths = [path.join(root, 'src'), path.join(root, 'public')];
    for (const base of trees.paths) await fs.ensureDir(`${base}/assets/floor/grass/08`);
  });
  afterEach(() => fs.remove(root));

  it('keeps its folder in the asset trees unless the operator asks for it', async () => {
    const objectLayer = { _id: 'ol1', cid: 'cid-1', data: { item: { id: 'grass', type: 'floor' } } };
    await beforeDelete(objectLayer, { host: 'h', path: '/' });
    for (const base of trees.paths) expect(fs.existsSync(`${base}/assets/floor/grass`)).toBe(true);
    await beforeDelete(objectLayer, { host: 'h', path: '/' }, { assets: true });
    for (const base of trees.paths) expect(fs.existsSync(`${base}/assets/floor/grass`)).toBe(false);
  });
});
