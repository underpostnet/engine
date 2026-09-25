import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The backup path only routes documents and payloads; the collections are in-memory stand-ins,
// IPFS answers with the CIDs a test names (or nothing), and the static frame writer is a no-op.
const models = {};
const ipfs = vi.hoisted(() => ({ added: [], answer: null }));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/api/ipfs/ipfs.service.js', () => ({ createPinRecord: async () => ({}) }));
vi.mock('../../../src/api/ipfs/ipfs.client.js', () => ({
  IpfsClient: {
    addToIpfs: async (content, filename, mfsPath) => {
      ipfs.added.push({ filename, mfsPath, content });
      return ipfs.answer ? { cid: ipfs.answer[filename.endsWith('.png') ? 'png' : 'json'] } : null;
    },
  },
}));
vi.mock('../../../src/api/object-layer/object-layer.publication.js', () => ({
  repinCanonical: vi.fn(async () => true),
}));
// Publication names the render it is handed and stores the materializations under the cid; here
// it records what the restore hands it.
const published = vi.hoisted(() => []);
vi.mock('../../../src/projects/cyberia/object-layer.js', () => ({
  ObjectLayerEngine: {
    writeStaticFrameAssets: async () => [],
    publishItemDefinition: async (write) => {
      published.push(write);
      const { models, payload, rendered } = write;
      const data = rendered ? { ...payload.data, render: rendered.render } : payload.data;
      return await models.ObjectLayer.upsertByIdentity({ ...payload, data });
    },
  },
}));
const { AtlasSpriteSheetGenerator } =
  await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js');
const { canonicalJsonBytes, renderContractOf } = await import('../../../src/api/object-layer/object-layer.identity.js');
const { AtlasSpriteSheetStore } = await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.store.js');
const { repinCanonical } = await import('../../../src/api/object-layer/object-layer.publication.js');
const {
  atlasBackupFileKey,
  atlasFileIdsOf,
  exportObjectLayerBackup,
  fileBackup,
  fileFromBackup,
  readObjectLayerBackup,
  restoreObjectLayerBackup,
} = await import('../../../src/projects/cyberia/instance-backup.js');
const { ObjectLayerSchema } = await import('../../../src/api/object-layer/object-layer.model.js');
const { AtlasSpriteSheetSchema } = await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.model.js');
const { ObjectLayerRenderFramesSchema } =
  await import('../../../src/api/object-layer-render-frames/object-layer-render-frames.model.js');

/** A collection that remembers what was created and hands the last write back as the live document. */
const collection = () => {
  const created = [];
  let live = null;
  const query = (value) => {
    const q = Promise.resolve(value);
    q.populate = () => q;
    q.lean = () => q;
    return q;
  };
  return {
    created,
    deleteOne: async () => ({ deletedCount: 0 }),
    create: async (doc) => (created.push(doc), doc),
    // The label is bound to the live document; the catalog answers with its cid.
    findOne: () => query(live ? { objectLayerCid: live.cid } : null),
    findByCid: async () => live,
    upsertByIdentity: async (doc) => {
      live = { ...doc, cid: `cid-${created.length}-${JSON.stringify(doc.data.render)}`, save: async () => live };
      return live;
    },
    get live() {
      return live;
    },
  };
};

let backupDir;
let primary;
let metadata;
let render;
const write = (rel, value) => writeFile(join(backupDir, rel), Buffer.isBuffer(value) ? value : JSON.stringify(value));
const base64 = (bytes) => ({ $base64: bytes.toString('base64') });

beforeAll(async () => {
  ({ primary, metadata } = await AtlasSpriteSheetGenerator.generateAtlas(
    { colors: [[255, 0, 0, 255]], frames: { down_idle: [[[0, 0]]] } },
    'hatchet',
  ));
  render = renderContractOf({ primary, metadata });
  backupDir = await mkdtemp(join(tmpdir(), 'cyberia-backup-'));
  for (const dir of ['object-layers', 'render-frames', 'atlas-sprite-sheets', 'files', 'ipfs/content']) {
    await mkdir(join(backupDir, dir), { recursive: true });
  }
  await write('object-layers/hatchet.json', {
    _id: 'ol1',
    cid: 'cid-data',
    data: { item: { id: 'hatchet', type: 'weapon' }, render },
  });
  await write('render-frames/hatchet.json', { _id: 'rf1', frames: {}, colors: [], frame_duration: 100 });
  await write('atlas-sprite-sheets/hatchet.json', {
    _id: 'at1',
    fileId: 'f-primary',
    upscaleFileId: 'f-upscale',
    idlePreviewFileId: 'f-idle',
    metadata,
  });
  // Files are matched on _id, never on name: one is misnamed on purpose, one is a bystander.
  await write('files/whatever.json', { _id: 'f-primary', name: 'hatchet-primary.png', data: base64(primary) });
  await write('files/render-upscale-hatchet.json', {
    _id: 'f-upscale',
    name: 'hatchet-upscale.png',
    data: { type: 'Buffer', data: [1, 2, 3] },
  });
  await write('files/render-idle-hatchet.json', { _id: 'f-idle', name: 'hatchet-idle.png', data: { $base64: 'AA==' } });
  await write('files/render-sword.json', { _id: 'f-other', name: 'sword-primary.png', data: { $base64: 'AA==' } });
  // A backup may still carry raw payloads; nothing reads them.
  await write('ipfs/content/cid-data.bin', Buffer.from('{"ledger":{"type":"OFF_CHAIN"}}'));
});

afterAll(() => rm(backupDir, { recursive: true, force: true }));

describe('reading one object layer out of an instance backup', () => {
  it('gathers the object layer and every document it references', () => {
    const backup = readObjectLayerBackup({ backupDir, itemId: 'hatchet' });
    expect(backup.objectLayer.data.item.id).toBe('hatchet');
    expect(backup.renderFrames._id).toBe('rf1');
    expect(backup.atlas._id).toBe('at1');
  });

  it('resolves the atlas render Files by _id and leaves other Files alone', () => {
    const { files } = readObjectLayerBackup({ backupDir, itemId: 'hatchet' });
    expect(files.map((f) => f._id).sort()).toEqual(['f-idle', 'f-primary', 'f-upscale']);
  });

  it('names each exported render after its atlas field', () => {
    expect(atlasBackupFileKey('fileId', 'hatchet')).toBe('render-hatchet');
    expect(atlasBackupFileKey('upscaleFileId', 'hatchet')).toBe('render-upscale-hatchet');
    expect(atlasBackupFileKey('idlePreviewFileId', 'hatchet')).toBe('render-idle-hatchet');
  });

  it('decodes both File byte encodings the export can write', () => {
    const { files } = readObjectLayerBackup({ backupDir, itemId: 'hatchet' });
    const byId = Object.fromEntries(files.map((f) => [f._id, f.data]));
    expect(Buffer.isBuffer(byId['f-primary']) && byId['f-primary'].equals(primary)).toBe(true);
    expect(Buffer.isBuffer(byId['f-upscale']) && [...byId['f-upscale']]).toEqual([1, 2, 3]);
  });

  it("reads no IPFS payload: the render is the atlas and the definition bytes are the authority's", () => {
    expect(Object.keys(readObjectLayerBackup({ backupDir, itemId: 'hatchet' })).sort()).toEqual([
      'atlas',
      'files',
      'objectLayer',
      'renderFrames',
    ]);
  });

  it('names the Files the atlases own, so an instance import leaves them to the item restore', () => {
    expect([...atlasFileIdsOf(backupDir)].sort()).toEqual(['f-idle', 'f-primary', 'f-upscale']);
  });

  it('names the Files an atlas of another shape owns, under every File field', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cyberia-atlas-files-'));
    await mkdir(join(dir, 'atlas-sprite-sheets'));
    await writeFile(
      join(dir, 'atlas-sprite-sheets', 'coin.json'),
      JSON.stringify({
        _id: 'at9',
        fileId: 'f-a',
        previewFileId: 'f-b',
        idlePreviewFileId: null,
        cid: 'c',
        metadata: {},
      }),
    );
    expect([...atlasFileIdsOf(dir)].sort()).toEqual(['f-a', 'f-b']);
    await rm(dir, { recursive: true, force: true });
  });

  it('writes File bytes as base64 and reads them back unchanged', () => {
    const file = { _id: 'f', name: 'a.png', data: Buffer.from([0, 1, 250]) };
    expect(fileBackup(file).data).toEqual({ $base64: 'AAH6' });
    expect([...fileFromBackup(fileBackup(file)).data]).toEqual([0, 1, 250]);
  });

  it('names the backup and item when the item is missing', () => {
    expect(() => readObjectLayerBackup({ backupDir, itemId: 'ghost' })).toThrow(/no object layer 'ghost'/);
  });

  it('tolerates an item with no atlas or render frames yet', async () => {
    await write('object-layers/bare.json', { _id: 'ol2', data: { item: { id: 'bare', type: 'floor' } } });
    const backup = readObjectLayerBackup({ backupDir, itemId: 'bare' });
    expect(backup.atlas).toBeNull();
    expect(backup.renderFrames).toBeNull();
    expect(backup.files).toEqual([]);
  });
});

describe('restoring one object layer from an instance backup', () => {
  let build;
  let derived;

  beforeEach(() => {
    ipfs.added.length = 0;
    ipfs.answer = null;
    published.length = 0;
    repinCanonical.mockClear();
    for (const name of ['ObjectLayer', 'File']) models[name] = collection();
    models.CyberiaItemCatalog = models.ObjectLayer;
    build = vi.spyOn(AtlasSpriteSheetStore, 'build');
    derived = vi.spyOn(AtlasSpriteSheetStore, 'syncDerivedRenders').mockResolvedValue({ status: 'unchanged' });
    vi.spyOn(AtlasSpriteSheetStore, 'pruneOrphanRenders').mockResolvedValue(0);
  });

  afterAll(() => vi.restoreAllMocks());

  it('publishes the definition with the atlas and render frames the backup carries, and derives what they lack', async () => {
    await restoreObjectLayerBackup({ backupDir, itemId: 'hatchet', options: {} });
    const [{ rendered, renderFrames }] = published;
    expect(rendered.render).toEqual(render);
    expect(rendered.atlas).toMatchObject({ fileId: 'f-primary', upscaleFileId: 'f-upscale' });
    expect(renderFrames._id).toBe('rf1');
    expect(models.File.created.map((file) => file._id).sort()).toEqual(['f-idle', 'f-primary', 'f-upscale']);
    expect(build).not.toHaveBeenCalled();
    expect(derived).toHaveBeenCalledWith({ objectLayerCid: models.ObjectLayer.live.cid, options: {} });
    expect(models.ObjectLayer.live.data.render).toEqual(render);
  });

  it('pins the primary render and its metadata, and never writes the definition payload', async () => {
    ipfs.answer = { png: render.cid, json: render.metadataCid };
    const { pins } = await restoreObjectLayerBackup({ backupDir, itemId: 'hatchet', options: {} });
    expect(pins).toBe(2);
    expect(ipfs.added.map(({ mfsPath }) => mfsPath)).toEqual([
      '/object-layer/hatchet/hatchet_render.png',
      '/object-layer/hatchet/hatchet_render_metadata.json',
    ]);
    expect(ipfs.added[0].content.equals(primary)).toBe(true);
    expect(ipfs.added[1].content.equals(canonicalJsonBytes(metadata))).toBe(true);
    expect(ipfs.added.some(({ mfsPath }) => mfsPath.endsWith('_data.json'))).toBe(false);
  });

  it('has the authority pin the canonical bytes of the restored definition again', async () => {
    await restoreObjectLayerBackup({ backupDir, itemId: 'hatchet', options: {} });
    expect(repinCanonical).toHaveBeenCalledOnce();
    expect(repinCanonical.mock.calls[0][0].definition).toBe(models.ObjectLayer.live);
  });

  it('refuses a pin under another CID than the render contract names, and writes nothing', async () => {
    ipfs.answer = { png: 'cid-other', json: render.metadataCid };
    await expect(restoreObjectLayerBackup({ backupDir, itemId: 'hatchet', options: {} })).rejects.toThrow(
      /pinned atlas-sprite-sheet as cid-other/,
    );
    expect(models.File.created).toEqual([]);
    expect(models.ObjectLayer.live).toBeNull();
  });

  it('refuses an atlas that is not the render the definition names when no frames can rebuild it', async () => {
    await write('object-layers/relic.json', {
      _id: 'ol3',
      data: { item: { id: 'relic', type: 'skin' }, render: { cid: 'cid-png', metadataCid: render.metadataCid } },
    });
    await write('atlas-sprite-sheets/relic.json', { _id: 'at3', fileId: 'f-primary', metadata });

    await expect(restoreObjectLayerBackup({ backupDir, itemId: 'relic', options: {} })).rejects.toThrow(
      "'relic' names render cid-png; the backup holds neither it nor the frames to rebuild it",
    );
    expect(models.File.created).toEqual([]);
    expect(models.ObjectLayer.live).toBeNull();
  });

  it('rebuilds from the render frames an atlas whose render its metadata does not describe', async () => {
    // A render at another density than its metadata describes: the contract cannot hold.
    const upscaled = await AtlasSpriteSheetGenerator.upscaledFromRender(primary, metadata);
    const frames = { _id: 'rf4', frames: { down_idle: [] }, colors: [], frame_duration: 100 };
    await write('object-layers/ember.json', {
      _id: 'ol4',
      cid: 'cid-ember',
      data: { item: { id: 'ember', type: 'skin' }, render: renderContractOf({ primary: upscaled, metadata }) },
    });
    await write('render-frames/ember.json', frames);
    await write('atlas-sprite-sheets/ember.json', {
      _id: 'at4',
      fileId: 'f-ember',
      metadata: { ...metadata, upscaleFactor: 8 },
    });
    await write('files/render-ember.json', { _id: 'f-ember', name: 'ember-primary.png', data: base64(upscaled) });
    const rebuilt = { render, atlas: { fileId: 'f-rebuilt' } };
    build.mockResolvedValueOnce(rebuilt);

    const summary = await restoreObjectLayerBackup({ backupDir, itemId: 'ember', options: {} });

    expect(build).toHaveBeenCalledWith({
      itemKey: 'ember',
      objectLayerRenderFrames: frames,
      upscaleFactor: 8,
      options: {},
    });
    expect(published[0]).toMatchObject({ renderFrames: frames, rendered: rebuilt });
    expect(models.File.created).toEqual([]);
    expect(models.ObjectLayer.live.data.render).toEqual(render);
    expect(derived).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ rebuilt: true, replaced: 'cid-ember', cid: models.ObjectLayer.live.cid });
  });

  it('rebuilds nothing when the backup atlas is the render the definition names', async () => {
    expect((await restoreObjectLayerBackup({ backupDir, itemId: 'hatchet', options: {} })).rebuilt).toBe(false);
    expect(build).not.toHaveBeenCalled();
  });
});

describe('exporting one object layer into an instance backup', () => {
  let exportDir;
  const lean = (doc) => ({ lean: async () => doc });
  const definition = {
    _id: 'ol1',
    cid: 'cid-data',
    contentHash: 'h',
    profile: { id: 'cyberia', version: 2 },
    origin: 'cache',
    published: false,
    data: { item: { id: 'hatchet', type: 'weapon' }, render: { cid: 'cid-png', metadataCid: 'cid-meta' } },
  };
  const atlas = {
    _id: 'at1',
    objectLayerCid: 'cid-data',
    fileId: 'f-primary',
    upscaleFileId: null,
    idlePreviewFileId: 'f-idle',
    metadata: {},
  };

  const ownedBy =
    (doc) =>
    ({ objectLayerCid }) =>
      lean(objectLayerCid === 'cid-data' ? doc : null);

  beforeEach(async () => {
    ipfs.added.length = 0;
    exportDir = await mkdtemp(join(tmpdir(), 'cyberia-export-'));
    models.ObjectLayer = { schema: ObjectLayerSchema };
    models.ObjectLayerRenderFrames = {
      schema: ObjectLayerRenderFramesSchema,
      findOne: ownedBy({ _id: 'rf1', objectLayerCid: 'cid-data', frames: {} }),
    };
    models.AtlasSpriteSheet = { schema: AtlasSpriteSheetSchema, findOne: ownedBy(atlas) };
    const files = {
      'f-primary': { _id: 'f-primary', data: Buffer.from('PNG') },
      'f-idle': { _id: 'f-idle', data: Buffer.from('I') },
    };
    models.File = { findById: (id) => lean(files[id] ?? null) };
  });

  afterAll(() => rm(exportDir, { recursive: true, force: true }));

  it('writes the definition without host state, and the materializations of its cid', async () => {
    const summary = await exportObjectLayerBackup({ backupDir: exportDir, definition, options: {} });
    expect(summary).toEqual({ itemId: 'hatchet', renderFrames: true, atlas: true, files: 2 });
    const {
      objectLayer,
      atlas: stored,
      files,
      renderFrames,
    } = readObjectLayerBackup({
      backupDir: exportDir,
      itemId: 'hatchet',
    });
    expect(objectLayer).not.toHaveProperty('origin');
    expect(objectLayer).not.toHaveProperty('published');
    expect(objectLayer.cid).toBe('cid-data');
    expect([stored.objectLayerCid, renderFrames.objectLayerCid]).toEqual(['cid-data', 'cid-data']);
    expect(files.map((file) => [file._id, file.data.toString()]).sort()).toEqual([
      ['f-idle', 'I'],
      ['f-primary', 'PNG'],
    ]);
  });

  it('writes only the fields each schema declares, whatever else the database still holds', async () => {
    models.AtlasSpriteSheet.findOne = ownedBy({ ...atlas, cid: 'bafkrei-old', minifyFileId: 'f-min' });
    await exportObjectLayerBackup({
      backupDir: exportDir,
      definition: { ...definition, atlasSpriteSheetId: 'at1', objectLayerRenderFramesId: 'rf1' },
      options: {},
    });
    const { objectLayer, atlas: stored } = readObjectLayerBackup({ backupDir: exportDir, itemId: 'hatchet' });
    expect(Object.keys(stored).sort()).toEqual(Object.keys(atlas).sort());
    expect(objectLayer).not.toHaveProperty('atlasSpriteSheetId');
    expect(objectLayer).not.toHaveProperty('objectLayerRenderFramesId');
  });

  it('reads the materializations by the definition cid only, never by the label', async () => {
    const summary = await exportObjectLayerBackup({
      backupDir: exportDir,
      definition: { ...definition, cid: 'cid-other' },
      options: {},
    });
    expect(summary).toEqual({ itemId: 'hatchet', renderFrames: false, atlas: false, files: 0 });
  });

  it('is a pure projection: exporting twice writes the same bytes, and no IPFS payload', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    await exportObjectLayerBackup({ backupDir: exportDir, definition, options: {} });
    const first = await readFile(join(exportDir, 'object-layers', 'hatchet.json'), 'utf8');
    await exportObjectLayerBackup({ backupDir: exportDir, definition, options: {} });
    expect(await readFile(join(exportDir, 'object-layers', 'hatchet.json'), 'utf8')).toBe(first);
    expect((await readdir(exportDir)).sort()).toEqual([
      'atlas-sprite-sheets',
      'files',
      'object-layers',
      'render-frames',
    ]);
    expect(ipfs.added).toEqual([]);
  });
});
