/**
 * The pixel templates Cyberia offers in the Object Layer editor: one role shape per kind of item,
 * painted in the palette the artist picks. Editor tooling only; the foundation defines no template.
 *
 * @module src/client/components/cyberia/ObjectLayerTemplatesCyberia.js
 */
import {
  ellipseRegion,
  lineRegion,
  outlineRegion,
  rectOutlineRegion,
  rectRegion,
} from '../objectlayer-studio/PixelRegion.js';

/** A role grid built from shapes, each painted over the ones before it. */
const shape = (width, height, layers) => {
  const roles = Array.from({ length: height }, () => Array(width).fill(null));
  for (const [cells, role] of layers)
    for (const [x, y] of cells) if (x >= 0 && y >= 0 && x < width && y < height) roles[y][x] = role;
  // An outline role around everything painted, so every shape reads on any floor.
  const frame = roles.map((row) => row.map((role) => (role ? [0, 0, 0, 255] : [0, 0, 0, 0])));
  for (const [x, y] of outlineRegion(frame)) roles[y][x] = 'outline';
  return roles;
};

/** Cells of a rectangle where `(x + y)` falls on every `step`-th diagonal: a texture of accents. */
const speckle = (x0, y0, x1, y1, step, offset = 0) =>
  rectRegion(x0, y0, x1, y1).filter(([x, y]) => (x * 3 + y * 5 + offset) % step === 0);

export const CyberiaObjectLayerTemplates = Object.freeze([
  {
    id: 'floor-tile',
    label: 'Floor tile',
    itemTypes: ['floor'],
    symmetry: '',
    // A floor tiles edge to edge: no outline, texture only.
    roles: (() => {
      const roles = Array.from({ length: 16 }, () => Array(16).fill('base'));
      for (const [x, y] of speckle(0, 0, 15, 15, 7)) roles[y][x] = 'shadow';
      for (const [x, y] of speckle(0, 0, 15, 15, 11, 4)) roles[y][x] = 'highlight';
      return roles;
    })(),
  },
  {
    id: 'tree',
    label: 'Tree',
    itemTypes: ['resource', 'static', 'obstacle'],
    kinds: ['tree'],
    symmetry: 'x',
    roles: shape(16, 24, [
      [rectRegion(7, 13, 8, 22), 'shadow'],
      [ellipseRegion(2, 1, 13, 15), 'base'],
      [ellipseRegion(4, 2, 8, 7), 'highlight'],
      [speckle(3, 9, 12, 14, 5), 'shadow'],
    ]),
  },
  {
    id: 'rock',
    label: 'Rock',
    itemTypes: ['resource', 'obstacle', 'static'],
    kinds: ['rock'],
    symmetry: '',
    roles: shape(16, 16, [
      [ellipseRegion(1, 4, 14, 14), 'base'],
      [ellipseRegion(3, 5, 8, 8), 'highlight'],
      [rectRegion(2, 12, 13, 13), 'shadow'],
      [speckle(4, 9, 11, 11, 6), 'accent'],
    ]),
  },
  {
    id: 'vegetation',
    label: 'Vegetation',
    itemTypes: ['resource', 'static', 'foreground', 'obstacle'],
    kinds: ['vegetation'],
    symmetry: 'x',
    roles: shape(16, 16, [
      [lineRegion(8, 14, 8, 5), 'base'],
      [lineRegion(7, 14, 3, 7), 'base'],
      [lineRegion(9, 14, 13, 7), 'base'],
      [lineRegion(6, 14, 5, 9), 'shadow'],
      [lineRegion(10, 14, 11, 9), 'shadow'],
      [[[8, 4]], 'highlight'],
    ]),
  },
  {
    id: 'structure-block',
    label: 'Structure block',
    itemTypes: ['obstacle', 'static', 'foreground'],
    kinds: ['structure', 'ruin', 'prop'],
    symmetry: 'x',
    roles: shape(16, 16, [
      [rectRegion(1, 1, 14, 14), 'base'],
      [rectRegion(1, 1, 14, 2), 'highlight'],
      [rectRegion(1, 13, 14, 14), 'shadow'],
      [[...lineRegion(1, 6, 14, 6), ...lineRegion(1, 10, 14, 10), ...lineRegion(7, 3, 7, 5)], 'shadow'],
      [lineRegion(4, 7, 4, 9), 'shadow'],
      [lineRegion(11, 7, 11, 9), 'shadow'],
    ]),
  },
  {
    id: 'portal-ring',
    label: 'Portal ring',
    itemTypes: ['portal'],
    symmetry: 'xy',
    roles: shape(16, 16, [
      [ellipseRegion(1, 1, 14, 14, { filled: false }), 'special'],
      [ellipseRegion(3, 3, 12, 12), 'base'],
      [ellipseRegion(5, 5, 10, 10, { filled: false }), 'accent'],
      [ellipseRegion(7, 7, 8, 8), 'highlight'],
    ]),
  },
  {
    id: 'blade',
    label: 'Blade',
    itemTypes: ['weapon'],
    symmetry: '',
    roles: shape(16, 16, [
      [[...lineRegion(4, 11, 13, 2), ...lineRegion(5, 11, 13, 3)], 'base'],
      [lineRegion(6, 9, 12, 3), 'highlight'],
      [lineRegion(2, 9, 6, 13), 'accent'],
      [lineRegion(1, 14, 3, 12), 'shadow'],
    ]),
  },
  {
    id: 'orb',
    label: 'Orb',
    itemTypes: ['skill', 'coin'],
    symmetry: 'xy',
    roles: shape(16, 16, [
      [ellipseRegion(4, 4, 11, 11), 'base'],
      [ellipseRegion(5, 5, 7, 7), 'highlight'],
      [rectOutlineRegion(6, 10, 9, 10), 'shadow'],
    ]),
  },
]);
