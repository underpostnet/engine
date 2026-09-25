import { describe, it, expect } from 'vitest';
import { Jimp } from 'jimp';
import {
  AtlasSpriteSheetGenerator as Atlas,
  IDLE_PREVIEW_SIZE,
} from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import {
  AtlasSpriteSheetDto,
  AtlasSpriteSheetModel,
  AtlasSpriteSheetSchema,
} from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.model.js';

const colors = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
];
const frame = [
  [0, 1],
  [null, 0],
];

const pixelsOf = async (png) => {
  const { bitmap } = await Jimp.read(png);
  return bitmap;
};

describe('Cyberia atlas generation', () => {
  it('keeps source pixels and frame positions without square padding', async () => {
    const source = { colors, frames: { down_idle: [frame], up_idle: [frame], down_walking: [frame] } };
    const { primary, metadata } = await Atlas.generateAtlas(source, 'test');
    const image = await Jimp.read(primary);
    expect(metadata.cellPixelDim).toBe(1);
    expect([image.bitmap.width, image.bitmap.height]).toEqual([4, 4]);
    for (const frames of Object.values(metadata.frames).filter((frames) => frames.length)) {
      const { x, y, width, height } = frames[0];
      expect([width, height]).toEqual([2, 2]);
      expect(image.getPixelColor(x, y)).toBe(0xff0000ff);
      expect(image.getPixelColor(x + 1, y)).toBe(0x00ff00ff);
      expect(image.getPixelColor(x, y + 1)).toBe(0);
    }
  });

  it('fits 26 character frames without scaling each source pixel', async () => {
    const pixels = Array.from({ length: 25 }, () => Array(25).fill(0));
    const { primary, metadata } = await Atlas.generateAtlas(
      { colors, frames: { down_idle: Array(26).fill(pixels) } },
      'character',
      1,
    );
    expect([metadata.atlasWidth, metadata.atlasHeight]).toEqual([250, 75]);
    expect((await Jimp.read(primary)).bitmap.data.byteLength).toBe(75000);
    expect(metadata.frames.down_idle).toHaveLength(26);
  });

  it('describes the primary render, whatever the upscale factor', async () => {
    const source = { colors, frames: { down_idle: [frame], up_idle: [frame] } };
    const { primary, metadata } = await Atlas.generateAtlas(source, 'scaled', 20);
    const image = await pixelsOf(primary);
    expect(metadata.cellPixelDim).toBe(1);
    expect(metadata.upscaleFactor).toBe(20);
    expect([image.width, image.height]).toEqual([metadata.atlasWidth, metadata.atlasHeight]);
    expect(metadata.frames.down_idle[0].width).toBe(2);
  });

  it('pins the layout it stores: every direction, empty ones included', async () => {
    const { metadata } = await Atlas.generateAtlas({ colors, frames: { down_idle: [frame] } }, 'stored');
    const stored = new AtlasSpriteSheetModel({ fileId: '64b000000000000000000001', metadata }).toObject().metadata;

    expect(Object.keys(metadata.frames)).toHaveLength(18);
    expect(metadata.frames.up_walking).toEqual([]);
    expect(stored).toStrictEqual(metadata);
  });

  it('rejects clipped frames and invalid dimensions', async () => {
    expect(() => Atlas.packFramesGrid([{ width: 5, height: 1 }], 4)).toThrow('exceed');
    expect(() =>
      Atlas.packFramesGrid(
        [
          { width: 4, height: 3 },
          { width: 4, height: 3 },
        ],
        4,
      ),
    ).toThrow('exceed');
    await expect(Atlas.generateAtlas({ colors, frames: { down_idle: [frame] } }, 'invalid', 0)).rejects.toThrow(
      'pixel scale',
    );
    await expect(Atlas.generateAtlas({ colors, frames: { down_idle: [frame] } }, 'invalid', 1, 8192)).rejects.toThrow(
      '4096',
    );
  });
});

describe('Cyberia derived renders', () => {
  const source = { colors, frames: { down_idle: [frame], up_idle: [frame] } };

  it('derives the upscaled render as an exact block copy of the primary render', async () => {
    const { primary, metadata } = await Atlas.generateAtlas(source, 'scaled', 3);
    const minified = await pixelsOf(primary);
    const upscaled = await Jimp.read(await Atlas.upscaledFromRender(primary, metadata));

    expect([upscaled.bitmap.width, upscaled.bitmap.height]).toEqual([
      metadata.atlasWidth * 3,
      metadata.atlasHeight * 3,
    ]);
    for (let y = 0; y < minified.height; y++) {
      for (let x = 0; x < minified.width; x++) {
        const at = (y * minified.width + x) * 4;
        const color = minified.data.readUInt32BE(at);
        expect(upscaled.getPixelColor(x * 3, y * 3) >>> 0).toBe(color);
        expect(upscaled.getPixelColor(x * 3 + 2, y * 3 + 2) >>> 0).toBe(color);
      }
    }
  });

  it('derives no upscaled render when the primary render is already at that density', async () => {
    const { primary, metadata } = await Atlas.generateAtlas(source, 'native', 1);
    expect(await Atlas.upscaledFromRender(primary, metadata)).toBeNull();
  });

  it('reads the density from the render, so any render of the layout derives the same still', async () => {
    const { primary, metadata } = await Atlas.generateAtlas(source, 'dense', 4);
    const upscaled = await Atlas.upscaledFromRender(primary, metadata);

    const fromPrimary = await pixelsOf(await Atlas.idlePreviewFromRender(primary, metadata));
    const fromUpscaled = await pixelsOf(await Atlas.idlePreviewFromRender(upscaled, metadata));
    expect([fromPrimary.width, fromPrimary.height]).toEqual([IDLE_PREVIEW_SIZE, IDLE_PREVIEW_SIZE]);
    expect(Buffer.from(fromUpscaled.data).equals(Buffer.from(fromPrimary.data))).toBe(true);
    expect(await Atlas.upscaledFromRender(upscaled, metadata)).toBeNull();
  });

  it('centres the idle preview on the standard square, each cell one whole block', async () => {
    // Three cells wide, one tall: 100 px per cell, with 100 px of transparency above and below.
    const { primary, metadata } = await Atlas.generateAtlas({ colors, frames: { down_idle: [[[0, 1, 0]]] } }, 'wide');
    const preview = await pixelsOf(await Atlas.idlePreviewFromRender(primary, metadata));
    const at = (x, y) => preview.data.readUInt32BE((y * preview.width + x) * 4);

    expect([preview.width, preview.height]).toEqual([IDLE_PREVIEW_SIZE, IDLE_PREVIEW_SIZE]);
    expect([at(150, 99), at(150, 200)]).toEqual([0, 0]);
    expect([at(0, 100), at(150, 150), at(299, 199)]).toEqual([0xff0000ff, 0x00ff00ff, 0xff0000ff]);
  });

  it('refuses a render that is no whole multiple of its layout', () => {
    expect(Atlas.pixelsPerCell(12, { atlasWidth: 4 })).toBe(3);
    expect(() => Atlas.pixelsPerCell(10, { atlasWidth: 4 })).toThrow('whole multiple');
  });

  it('animates one direction from the primary render', async () => {
    const { primary, metadata } = await Atlas.generateAtlas(source, 'animated', 2);
    expect(await Atlas.animationFromRender(primary, metadata, '08', 100)).toBeInstanceOf(Buffer);
    expect(await Atlas.animationFromRender(primary, metadata, '14', 100)).toBeNull();
  });
});

describe('the AtlasSpriteSheet materialization', () => {
  it('holds no render CID: the definition owns the render contract', () => {
    for (const path of ['cid', 'metadataCid', 'renderCid', 'atlasCid'])
      expect(AtlasSpriteSheetSchema.path(path), path).toBeUndefined();
    for (const select of [AtlasSpriteSheetDto.select.get(), AtlasSpriteSheetDto.select.getMetadataOnly()])
      expect(Object.keys(select).filter((key) => /cid/i.test(key))).toEqual(['objectLayerCid']);
  });

  it('belongs to one definition, named by its canonical CID, never by a label', () => {
    expect(new AtlasSpriteSheetModel({ metadata: {} }).validateSync().errors).toHaveProperty('objectLayerCid');
    const labelled = new AtlasSpriteSheetModel({ objectLayerCid: 'hatchet', metadata: {} }).validateSync();
    expect(labelled.errors).toHaveProperty('objectLayerCid');
  });

  it('requires the primary render and keeps every derived render optional', () => {
    const { errors } = new AtlasSpriteSheetModel({ metadata: {} }).validateSync();
    expect(errors).toHaveProperty('fileId');
    expect(errors).not.toHaveProperty('upscaleFileId');
    expect(errors).not.toHaveProperty('idlePreviewFileId');
  });

  it('indexes one atlas per definition, and the label for discovery only', () => {
    const indexes = AtlasSpriteSheetSchema.indexes();
    expect(indexes.filter(([, options]) => options?.unique).map(([fields]) => Object.keys(fields))).toEqual([
      ['objectLayerCid'],
    ]);
    expect(indexes.find(([fields]) => 'metadata.itemKey' in fields)?.[1]?.unique).not.toBe(true);
  });
});
