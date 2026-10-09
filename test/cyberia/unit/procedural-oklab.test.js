import { describe, it, expect } from 'vitest';
import { fromOklch, oklabDistance, toOklab, toOklch } from '../../../src/projects/cyberia/procedural/core/oklab.js';

describe('OKLab and OKLCH', () => {
  it('places black at lightness 0, white at 1 and a grey between, with no chroma', () => {
    expect(toOklab([0, 0, 0])[0]).toBeCloseTo(0, 3);
    expect(toOklab([255, 255, 255])[0]).toBeCloseTo(1, 3);
    const [lightness, chroma] = toOklch([128, 128, 128]);
    expect(lightness).toBeGreaterThan(0.5);
    expect(lightness).toBeLessThan(0.7);
    expect(chroma).toBeLessThan(0.001);
  });

  it('returns every sRGB color it is given', () => {
    for (const rgb of [
      [0, 0, 0],
      [255, 255, 255],
      [51, 102, 153],
      [255, 0, 0],
      [18, 200, 77],
      [250, 250, 5],
    ])
      expect(fromOklch(toOklch(rgb))).toEqual(rgb);
  });

  it('keeps the lightness and the hue and drops the chroma of a color outside the sRGB gamut', () => {
    const [lightness, , hue] = toOklch([20, 90, 230]);
    const fitted = fromOklch([lightness, 0.6, hue]);
    expect(fitted.every((byte) => byte >= 0 && byte <= 255)).toBe(true);
    const [fittedLightness, fittedChroma, fittedHue] = toOklch(fitted);
    expect(fittedLightness).toBeCloseTo(lightness, 1);
    expect(fittedChroma).toBeLessThan(0.6);
    expect(Math.abs(fittedHue - hue)).toBeLessThan(0.02);
  });

  it('measures the distance of two colors: 0 for the same, near 1 for black and white, symmetric', () => {
    expect(oklabDistance([10, 20, 30], [10, 20, 30])).toBe(0);
    expect(oklabDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(1, 2);
    expect(oklabDistance([200, 30, 30], [30, 30, 200])).toBe(oklabDistance([30, 30, 200], [200, 30, 30]));
  });

  it('measures a step of lightness alike in the dark and in the light', () => {
    const dark = oklabDistance(fromOklch([0.2, 0, 0]), fromOklch([0.3, 0, 0]));
    const light = oklabDistance(fromOklch([0.7, 0, 0]), fromOklch([0.8, 0, 0]));
    expect(Math.abs(dark - light)).toBeLessThan(0.01);
  });
});
