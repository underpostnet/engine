import { describe, it, expect } from 'vitest';
import {
  RENDER_SOURCE_FORMAT,
  fromWire,
  hexToRgba,
  rgbaFrame,
  rgbaToHex,
  sameSource,
  sourceFromIndexedFrames,
  sourceFromRgbaFrames,
  toWire,
} from '../../../src/client/components/objectlayer-studio/RenderSource.js';

const CLEAR = [0, 0, 0, 0];
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 128];
const painted = () => ({
  down_idle: [
    [
      [CLEAR, RED],
      [BLUE, RED],
    ],
    [
      [RED, CLEAR],
      [CLEAR, BLUE],
    ],
  ],
  up_idle: [
    [
      [RED, RED],
      [RED, RED],
    ],
  ],
});

describe('render source', () => {
  it('indexes painted frames into one palette of first-seen colors and one byte per cell', () => {
    const source = sourceFromRgbaFrames({ frames: painted(), frameDurationMs: 120 });
    expect(source).toEqual({
      format: RENDER_SOURCE_FORMAT,
      width: 2,
      height: 2,
      palette: ['#00000000', '#ff0000ff', '#0000ff80'],
      frameDurationMs: 120,
      frames: {
        down_idle: [Uint8Array.from([0, 1, 2, 1]), Uint8Array.from([1, 0, 0, 2])],
        up_idle: [Uint8Array.from([1, 1, 1, 1])],
      },
    });
    expect(rgbaFrame(source, source.frames.down_idle[1])).toEqual(painted().down_idle[1]);
  });

  it('serializes to base64 wire form and back without loss, in one canonical order', () => {
    const source = sourceFromRgbaFrames({ frames: painted(), frameDurationMs: 120 });
    const wire = toWire(source);
    expect(Object.keys(wire)).toEqual(['format', 'width', 'height', 'palette', 'frameDurationMs', 'frames']);
    expect(Object.keys(wire.frames)).toEqual(['down_idle', 'up_idle']);
    expect(typeof wire.frames.down_idle[0]).toBe('string');
    expect(fromWire(JSON.parse(JSON.stringify(wire)))).toEqual(source);
    const reordered = { ...source, frames: { up_idle: source.frames.up_idle, down_idle: source.frames.down_idle } };
    expect(sameSource(source, reordered)).toBe(true);
    expect(sameSource(source, { ...source, frameDurationMs: 121 })).toBe(false);
  });

  it('reads frames decoded from images: index rows and an rgba palette', () => {
    const source = sourceFromIndexedFrames({
      frames: { down_idle: [[[0, 1]]] },
      colors: [CLEAR, RED],
      frameDurationMs: 250,
    });
    expect(source.palette).toEqual(['#00000000', '#ff0000ff']);
    expect(source.frames.down_idle[0]).toEqual(Uint8Array.from([0, 1]));
    expect(hexToRgba('#0000ff')).toEqual([0, 0, 255, 255]);
    expect(rgbaToHex(BLUE)).toBe('#0000ff80');
  });

  it('refuses a palette over one byte and frames of two sizes', () => {
    const colors = Array.from({ length: 257 }, (_, index) => [index % 256, Math.floor(index / 256), 0, 255]);
    const row = colors.map((_, index) => index);
    expect(() => sourceFromIndexedFrames({ frames: { down_idle: [[row]] }, colors, frameDurationMs: 1 })).toThrow(
      'at most 256 colors',
    );
    const frames = painted();
    frames.up_idle[0].push([RED, RED]);
    expect(() => sourceFromRgbaFrames({ frames, frameDurationMs: 1 })).toThrow('Every frame of a render is 2×2');
  });

  it('refuses a wire form that is not a valid source', () => {
    const wire = toWire(sourceFromRgbaFrames({ frames: painted(), frameDurationMs: 120 }));
    expect(() => fromWire({ ...wire, format: 'rgba32' })).toThrow('format indexed8');
    expect(() => fromWire({ ...wire, palette: ['red'] })).toThrow('#rrggbbaa');
    expect(() => fromWire({ ...wire, width: 3 })).toThrow('is not 3×2 palette indexes');
    expect(() => fromWire({ ...wire, palette: wire.palette.slice(0, 2) })).toThrow('palette indexes');
    expect(() => fromWire({ ...wire, frameDurationMs: -1 })).toThrow('frame duration');
  });
});
