import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readObjectLayerBackup } from '../../src/projects/cyberia/instance-backup.js';

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
    expect(files.map((f) => f._id).sort()).toEqual(['f-full', 'f-min']);
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
