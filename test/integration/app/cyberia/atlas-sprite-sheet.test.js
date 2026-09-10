import { describe, it, expect } from 'vitest';
import { Jimp } from 'jimp';
import { AtlasSpriteSheetGenerator as Atlas } from '../../../../src/projects/cyberia/atlas-sprite-sheet-generator.js';

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
    const { minifyBuffer, metadata } = await Atlas.generateAtlas(source, 'test');
    const image = await Jimp.read(minifyBuffer);
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
    const { minifyBuffer, metadata } = await Atlas.generateAtlas(
      { colors, frames: { down_idle: Array(26).fill(pixels) } },
      'character',
      1,
    );
    expect([metadata.atlasWidth, metadata.atlasHeight]).toEqual([250, 75]);
    expect((await Jimp.read(minifyBuffer)).bitmap.data.byteLength).toBe(75000);
    expect(metadata.frames.down_idle).toHaveLength(26);
  });

  it('describes the minified render, whatever the upscale factor', async () => {
    const source = { colors, frames: { down_idle: [frame], up_idle: [frame] } };
    const { metadata } = await Atlas.generateAtlas(source, 'scaled', 20);
    expect(metadata.cellPixelDim).toBe(1);
    expect(metadata.upscaleFactor).toBe(20);
    expect(metadata.frames.down_idle[0].width).toBe(2);
  });

  it('renders the upscaled atlas as an exact multiple of the minified one', async () => {
    const source = { colors, frames: { down_idle: [frame], up_idle: [frame] } };
    const { buffer, minifyBuffer, metadata } = await Atlas.generateAtlas(source, 'scaled', 3);
    const minified = await Jimp.read(minifyBuffer);
    const upscaled = await Jimp.read(buffer);

    expect([upscaled.bitmap.width, upscaled.bitmap.height]).toEqual([
      metadata.atlasWidth * 3,
      metadata.atlasHeight * 3,
    ]);
    for (let y = 0; y < minified.bitmap.height; y++) {
      for (let x = 0; x < minified.bitmap.width; x++) {
        expect(upscaled.getPixelColor(x * 3, y * 3)).toBe(minified.getPixelColor(x, y));
        expect(upscaled.getPixelColor(x * 3 + 2, y * 3 + 2)).toBe(minified.getPixelColor(x, y));
      }
    }
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
