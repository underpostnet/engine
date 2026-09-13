import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The restore path only routes documents; the collections are in-memory stand-ins, IPFS is
// unreachable, and the static frame writer is a no-op, so what is asserted is the routing.
const models = {};
vi.mock('../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../src/api/ipfs/ipfs.service.js', () => ({ createPinRecord: async () => ({}) }));
vi.mock('../../src/projects/cyberia/ipfs-client.js', () => ({ IpfsClient: { addToIpfs: async () => null } }));
vi.mock('../../src/projects/cyberia/object-layer.js', () => ({
  ObjectLayerEngine: { writeStaticFrameAssets: async () => [], computeAndSaveFinalSha256: async () => ({}) },
}));

const { AtlasSpriteSheetStore } = await import('../../src/projects/cyberia/atlas-sprite-sheet-store.js');
const { atlasBackupFileKey, readObjectLayerBackup, restoreObjectLayerBackup } =
  await import('../../src/projects/cyberia/instance-backup.js');

/** A collection that remembers what was created and hands the last upsert back as the live document. */
const collection = () => {
  const created = [];
  let live = null;
  const query = (value) => Object.assign(Promise.resolve(value), { populate: () => Promise.resolve(value) });
  return {
    created,
    deleteOne: async () => ({ deletedCount: 0 }),
    create: async (doc) => (created.push(doc), doc),
    findByItemId: () => query(live),
    upsertByItemId: async (doc) => {
      live = { ...doc, markModified() {}, save: async () => live };
      return live;
    },
    get live() {
      return live;
    },
  };
};

let backupDir;
const write = (rel, value) => writeFile(join(backupDir, rel), Buffer.isBuffer(value) ? value : JSON.stringify(value));

beforeAll(async () => {
  backupDir = await mkdtemp(join(tmpdir(), 'cyberia-backup-'));
  for (const dir of ['object-layers', 'render-frames', 'atlas-sprite-sheets', 'files', 'ipfs/content']) {
    await mkdir(join(backupDir, dir), { recursive: true });
  }
  await write('object-layers/hatchet.json', {
    _id: 'ol1',
    cid: 'cid-data',
    objectLayerRenderFramesId: 'rf1',
    atlasSpriteSheetId: 'at1',
    data: { item: { id: 'hatchet', type: 'weapon' }, render: { cid: 'cid-png', metadataCid: 'cid-meta' } },
  });
  await write('render-frames/hatchet.json', { _id: 'rf1', frames: {}, colors: [], frame_duration: 100 });
  await write('atlas-sprite-sheets/hatchet.json', {
    _id: 'at1',
    fileId: 'f-full',
    minifyFileId: 'f-min',
    idlePreviewFileId: 'f-idle',
    cid: 'cid-png',
  });
  // Files are matched on _id, never on name: one is misnamed on purpose, one is a bystander.
  await write('files/whatever.json', {
    _id: 'f-full',
    name: 'hatchet-atlas.png',
    data: { $base64: Buffer.from('PNG').toString('base64') },
  });
  await write('files/atlas-minify-hatchet.json', {
    _id: 'f-min',
    name: 'hatchet-minify.png',
    data: { type: 'Buffer', data: [1, 2, 3] },
  });
  await write('files/atlas-idle-hatchet.json', { _id: 'f-idle', name: 'hatchet-idle.png', data: { $base64: 'AA==' } });
  await write('files/atlas-sword.json', { _id: 'f-other', name: 'sword-atlas.png', data: { $base64: 'AA==' } });
  await write('ipfs/content/cid-data.bin', Buffer.from('data'));
  await write('ipfs/content/cid-png.bin', Buffer.from('png'));
  // cid-meta has no payload on purpose.
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
    expect(files.map((f) => f._id).sort()).toEqual(['f-full', 'f-idle', 'f-min']);
  });

  it('names each exported render after its atlas field', () => {
    expect(atlasBackupFileKey('fileId', 'hatchet')).toBe('atlas-hatchet');
    expect(atlasBackupFileKey('minifyFileId', 'hatchet')).toBe('atlas-minify-hatchet');
    expect(atlasBackupFileKey('idlePreviewFileId', 'hatchet')).toBe('atlas-idle-hatchet');
  });

  it('decodes both File byte encodings the export can write', () => {
    const { files } = readObjectLayerBackup({ backupDir, itemId: 'hatchet' });
    const byId = Object.fromEntries(files.map((f) => [f._id, f.data]));
    expect(Buffer.isBuffer(byId['f-full']) && byId['f-full'].toString()).toBe('PNG');
    expect(Buffer.isBuffer(byId['f-min']) && [...byId['f-min']]).toEqual([1, 2, 3]);
  });

  it('collects only the payloads the backup actually carries', () => {
    const { payloads } = readObjectLayerBackup({ backupDir, itemId: 'hatchet' });
    expect([...payloads.keys()].sort()).toEqual(['cid-data', 'cid-png']);
    expect(payloads.get('cid-png').toString()).toBe('png');
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
    expect(backup.payloads.size).toBe(0);
  });
});

describe('restoring one object layer from an instance backup', () => {
  let persist;
  let idle;

  beforeEach(() => {
    for (const name of ['ObjectLayer', 'ObjectLayerRenderFrames', 'AtlasSpriteSheet', 'File'])
      models[name] = collection();
    persist = vi.spyOn(AtlasSpriteSheetStore, 'persist').mockResolvedValue({
      atlasDoc: { _id: 'at-rebuilt' },
      atlasCid: 'cid-rebuilt-png',
      atlasMetadataCid: 'cid-rebuilt-meta',
    });
    idle = vi.spyOn(AtlasSpriteSheetStore, 'syncIdlePreview').mockResolvedValue({ status: 'unchanged' });
    vi.spyOn(AtlasSpriteSheetStore, 'pruneOrphanRenders').mockResolvedValue(0);
  });

  afterAll(() => vi.restoreAllMocks());

  it('keeps the atlas the backup carries when it holds its minified render', async () => {
    await restoreObjectLayerBackup({ backupDir, itemId: 'hatchet', options: {} });
    expect(models.AtlasSpriteSheet.created[0].minifyFileId).toBe('f-min');
    expect(persist).not.toHaveBeenCalled();
    expect(idle).toHaveBeenCalledWith({ itemKey: 'hatchet', options: {} });
    expect(models.ObjectLayer.live.data.render).toEqual({ cid: 'cid-png', metadataCid: 'cid-meta' });
  });

  // Regression: a backup written before the minified render existed restored an atlas the
  // blob route could not serve, and the client runtime got a 500 for every entity wearing it.
  it('rebuilds the atlas a backup restores without its minified render and relinks the item', async () => {
    await write('object-layers/relic.json', {
      _id: 'ol3',
      objectLayerRenderFramesId: 'rf3',
      atlasSpriteSheetId: 'at3',
      data: { item: { id: 'relic', type: 'skin' }, render: { cid: 'cid-old-png', metadataCid: 'cid-old-meta' } },
    });
    const frames = { _id: 'rf3', frames: { down_idle: [] }, colors: [], frame_duration: 100 };
    await write('render-frames/relic.json', frames);
    await write('atlas-sprite-sheets/relic.json', { _id: 'at3', fileId: 'f-relic', minifyFileId: null });

    await restoreObjectLayerBackup({ backupDir, itemId: 'relic', options: {} });

    expect(persist).toHaveBeenCalledWith({ itemKey: 'relic', objectLayerRenderFrames: frames, options: {} });
    const { live } = models.ObjectLayer;
    expect(live.atlasSpriteSheetId).toBe('at-rebuilt');
    expect(live.data.render).toEqual({ cid: 'cid-rebuilt-png', metadataCid: 'cid-rebuilt-meta' });
  });
});
