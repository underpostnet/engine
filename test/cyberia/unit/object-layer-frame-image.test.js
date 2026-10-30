import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { ObjectLayerEngine } from '../../../src/projects/cyberia/object-layer/object-layer.js';
import { sourceFromIndexedFrames } from '../../../src/client/components/objectlayer-studio/RenderSource.js';

// A frame PNG is what the asset tree serves and what an import decodes back into cells.
const colors = [
  [0, 0, 0, 0],
  [255, 0, 0, 255],
  [0, 128, 255, 255],
  [16, 16, 16, 128],
];
const cells = Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) => (x * y + x) % colors.length));
const source = sourceFromIndexedFrames({ frames: { down_idle: [cells] }, colors, frameDurationMs: 100 });

let directory;
let imagePath;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-image-'));
  imagePath = join(directory, '0.png');
  await ObjectLayerEngine.writeFrameImage({ source, pixels: source.frames.down_idle[0], imagePath, cellPixelDim: 20 });
});

afterAll(() => rm(directory, { recursive: true, force: true }));

describe('object layer frame images', () => {
  it('writes the bytes it has always written', async () => {
    const digest = crypto
      .createHash('sha256')
      .update(await readFile(imagePath))
      .digest('hex');
    expect(digest).toBe('c752058eddbd8f3b203c6fdbf483e7d0cc5e9831af40b24f6a2c781936396d76');
  });

  it('repeats every cell into a block, with its exact color and alpha', async () => {
    const { width, height, data } = PNG.sync.read(await readFile(imagePath));
    expect([width, height]).toEqual([480, 480]);
    for (const [x, y] of [
      [0, 0],
      [3, 1],
      [23, 23],
      [5, 2],
    ])
      for (const [dx, dy] of [
        [0, 0],
        [19, 19],
      ]) {
        const at = ((y * 20 + dy) * width + x * 20 + dx) * 4;
        expect([...data.subarray(at, at + 4)], `${x},${y}`).toEqual(colors[cells[y][x]]);
      }
  });

  it('decodes a written frame back into the same cells and colors', async () => {
    const { frame, colors: decoded } = await ObjectLayerEngine.frameFactory(imagePath, []);
    expect(frame.map((row) => row.map((index) => decoded[index]))).toEqual(
      cells.map((row) => row.map((index) => colors[index])),
    );
  });

  it('decodes no cell from a file that is not a PNG', async () => {
    const notPng = join(directory, '1.png');
    await writeFile(notPng, '<svg/>');
    expect(await ObjectLayerEngine.frameFactory(notPng, [])).toEqual({
      frame: [],
      colors: [],
    });
  });
});
