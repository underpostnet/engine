import { describe, it, expect } from 'vitest';
import {
  diversityAgainst,
  diversityBetween,
  signatureOf,
} from '../../../src/projects/cyberia/procedural/core/diversity.js';

const PLAN = {
  outline: '#000000',
  accent: '#ff00ff',
  regions: { body: { shadow: '#202020', base: '#808080', highlight: '#e0e0e0' } },
};
const OWNED = { '08': { body: Array.from({ length: 16 }, (_, i) => [2 + (i % 4), 2 + Math.floor(i / 4)]) } };
const paint = (hex) => [...[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)), 255];
const frameOf = ({ base = '#808080', wide = 4 } = {}) =>
  Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => (x >= 2 && x < 2 + wide && y >= 2 && y < 6 ? paint(base) : [0, 0, 0, 0])),
  );
const planOf = (base) => ({ ...PLAN, regions: { body: { ...PLAN.regions.body, base } } });
const signature = ({ plan = PLAN, ...options } = {}) =>
  signatureOf({ firstFrames: { '08': frameOf(options) }, ownedByCode: OWNED, regionIds: ['body'], plan });

describe('diversity', () => {
  it('keeps a compact signature, never frames', () => {
    const { silhouette, light, tones, palette } = signature();
    expect(silhouette['08']).toHaveLength(64);
    expect(light['08']).toHaveLength(64);
    expect(tones).toHaveLength(6);
    expect(palette).toHaveLength(3);
    expect(palette.every((color) => color.length === 3)).toBe(true);
    expect(JSON.stringify(signature()).length).toBeLessThan(1500);
  });

  it('gives the distance 0 to the same signature and each metric from 0 to 1', () => {
    expect(diversityBetween(signature(), signature())).toEqual({
      silhouette: 0,
      frame: 0,
      regionPattern: 0,
      palette: 0,
      score: 0,
    });
    const far = diversityBetween(signature(), signature({ base: '#ff2020', wide: 2, plan: planOf('#ff2020') }));
    for (const metric of ['silhouette', 'frame', 'regionPattern', 'palette', 'score']) {
      expect(far[metric]).toBeGreaterThanOrEqual(0);
      expect(far[metric]).toBeLessThanOrEqual(1);
    }
    expect(far.score).toBeGreaterThan(0);
  });

  it('tells a recolor, a reshape and both apart: each metric moves with its cause', () => {
    const recolored = diversityBetween(signature(), signature({ base: '#2040d0', plan: planOf('#2040d0') }));
    expect(recolored.palette).toBeGreaterThan(0);
    expect(recolored.silhouette).toBe(0);
    const reshaped = diversityBetween(signature(), signature({ wide: 2 }));
    expect(reshaped.silhouette).toBeGreaterThan(0);
    expect(reshaped.palette).toBe(0);
  });

  it('measures the palette in OKLab: a small step is a small distance, a big step a big one', () => {
    const palette = (base) => diversityBetween(signature(), signature({ plan: planOf(base) })).palette;
    expect(palette('#848484')).toBeGreaterThan(0);
    expect(palette('#848484')).toBeLessThan(0.05);
    expect(palette('#2040d0')).toBeGreaterThan(palette('#a08080'));
    expect(palette('#00ff00')).toBeLessThanOrEqual(1);
  });

  it('compares a signature with the nearest reference', () => {
    const references = [
      { id: 'source', signature: signature({ base: '#ff2020', wide: 2, plan: planOf('#ff2020') }) },
      { id: 'sibling', signature: signature({ base: '#7c7c7c', plan: planOf('#7c7c7c') }) },
    ];
    const result = diversityAgainst(signature(), references);
    expect(result.nearest).toBe('sibling');
    expect(result.score).toBe(diversityBetween(signature(), references[1].signature).score);
    expect(diversityAgainst(signature(), [{ id: 'same', signature: signature() }]).score).toBe(0);
    expect(diversityAgainst(signature(), [])).toEqual({ score: 1, nearest: '', metrics: {} });
  });
});
