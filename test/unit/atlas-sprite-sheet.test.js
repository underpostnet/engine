import { describe, it, expect } from 'vitest';
import { Jimp } from 'jimp';
import { AtlasSpriteSheetGenerator as Atlas } from '../../src/projects/cyberia/atlas-sprite-sheet-generator.js';

const colors = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
];
const frame = [
  [0, 1],
  [null, 0],
];

describe('Cyberia atlas generation', () => {
  it('keeps source pixels and frame positions without square padding', async () => {
    const source = { colors, frames: { down_idle: [frame], up_idle: [frame], down_walking: [frame] } };
    const { buffer, metadata } = await Atlas.generateAtlas(source, 'test');
    const image = await Jimp.read(buffer);
    expect(metadata.cellPixelDim).toBe(1);
    expect([image.bitmap.width, image.bitmap.height]).toEqual([4, 4]);
    for (const frames of Object.values(metadata.frames)) {
      const { x, y, width, height } = frames[0];
      expect([width, height]).toEqual([2, 2]);
      expect(image.getPixelColor(x, y)).toBe(0xff0000ff);
      expect(image.getPixelColor(x + 1, y)).toBe(0x00ff00ff);
      expect(image.getPixelColor(x, y + 1)).toBe(0);
    }
  });

  it('fits 26 character frames without scaling each source pixel', async () => {
    const pixels = Array.from({ length: 25 }, () => Array(25).fill(0));
    const { buffer, metadata } = await Atlas.generateAtlas(
      { colors, frames: { down_idle: Array(26).fill(pixels) } },
      'character',
    );
    expect([metadata.atlasWidth, metadata.atlasHeight]).toEqual([250, 75]);
    expect((await Jimp.read(buffer)).bitmap.data.byteLength).toBe(75000);
    expect(metadata.frames.down_idle).toHaveLength(26);
  });

  it('keeps an explicit pixel scale consistent with frame metadata', async () => {
    const { buffer, metadata } = await Atlas.generateAtlas({ colors, frames: { down_idle: [frame] } }, 'scaled', 2);
    const image = await Jimp.read(buffer);
    expect(metadata.cellPixelDim).toBe(2);
    expect(metadata.frames.down_idle[0].width).toBe(4);
    expect(image.getPixelColor(1, 1)).toBe(0xff0000ff);
    expect(image.getPixelColor(2, 0)).toBe(0x00ff00ff);
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
