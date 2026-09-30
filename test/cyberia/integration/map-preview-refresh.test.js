import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { FileFactory } from '../../../src/api/file/file.service.js';
import { refreshMapPreview } from '../../../src/projects/cyberia/map-preview-generator.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// A refreshed map preview on a real MongoDB: the map names the new File, the replaced File goes,
// and neither the edit time nor the revision of the map moves.
const context = { host: 'map-preview-test', path: '/' };
const model = (name) => DataBaseProviderService.getModel(name, context);
const entities = [{ initCellX: 0, initCellY: 0, dimX: 2, dimY: 2, color: '#ff0000' }];
const file = (name) => new (model('File'))(FileFactory.create(Buffer.from(name), `${name}.png`)).save();
const storedMap = async (preview) =>
  (await new (model('CyberiaMap'))({ code: 'forest-1', gridX: 2, gridY: 2, entities, preview }).save()).toObject();
const previewOf = async (map) => String((await model('CyberiaMap').findById(map._id).lean()).preview);

describe.skipIf(!mongodBinary)('map preview refresh on a real MongoDB', () => {
  let mongod;

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    mongod = await startMongod('cyberia-map-preview');
    await DataBaseProviderService.load({
      apis: ['cyberia-map', 'file'],
      ...context,
      db: { provider: 'mongoose', host: mongod.host, name: 'cyberia-map-preview' },
    });
  });

  afterAll(async () => {
    await DataBaseProviderService.getProvider(context)
      ?.close()
      .catch(() => {});
    delete DataBaseProviderService.instance[`${context.host}${context.path}`];
    await mongod?.stop();
  });

  beforeEach(async () => {
    await model('CyberiaMap').deleteMany({});
    await model('File').deleteMany({});
  });

  it('points the map at a new File and deletes the File it replaced', async () => {
    const old = await file('old-preview');
    const map = await storedMap(old._id);
    expect(await refreshMapPreview(map, context)).toBeInstanceOf(Buffer);
    const stored = await model('CyberiaMap').findById(map._id).lean();
    expect(String(stored.preview)).not.toBe(String(old._id));
    expect(await model('File').exists({ _id: stored.preview })).toBeTruthy();
    expect(await model('File').exists({ _id: old._id })).toBeNull();
    expect(stored.updatedAt).toEqual(map.updatedAt);
    expect(stored.revision).toBe(map.revision);
  });

  it('keeps the File of a preview that already holds the picture', async () => {
    const map = await storedMap(new Types.ObjectId());
    await refreshMapPreview(map, context);
    const drawn = await model('CyberiaMap').findById(map._id).lean();
    expect(await refreshMapPreview(drawn, context)).toBeInstanceOf(Buffer);
    expect(await previewOf(map)).toBe(String(drawn.preview));
    expect(await model('File').countDocuments()).toBe(1);
  });

  it('replaces a preview that names a missing File', async () => {
    const map = await storedMap(new Types.ObjectId());
    await refreshMapPreview(map, context);
    expect(await model('File').exists({ _id: await previewOf(map) })).toBeTruthy();
    expect(await model('File').countDocuments()).toBe(1);
  });

  it('keeps the preview a save stored meanwhile, and leaves no File of its own', async () => {
    const old = await file('old-preview');
    const map = await storedMap(old._id);
    const saved = await file('map-preview');
    await model('CyberiaMap').updateOne({ _id: map._id }, { $set: { preview: saved._id } });
    expect(await refreshMapPreview(map, context)).toBeNull();
    expect(await previewOf(map)).toBe(String(saved._id));
    expect(await model('File').countDocuments()).toBe(2);
  });
});
