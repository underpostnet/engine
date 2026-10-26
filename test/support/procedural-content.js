'use strict';

/**
 * @module test/support/procedural-content
 * @description The procedural content the Procedural Engine suites run on: the humanoid, terrain and
 * vortex Genesis Templates, four skin, one floor and one portal Palette Template, the baseline items,
 * the Violet Strata biome, and a content artifact that holds them with the foundation definition
 * of some items.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTENT_FAMILIES, CONTENT_SCHEMA_VERSION } from '../../src/projects/cyberia/content/content-artifact.js';

/** The front region map of the humanoid: hair, head, skin, torso and two legs. */
const HUMANOID_FRONT = Object.freeze([
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '..........hhhhhh.........',
  '.........heeeeeeh........',
  '........heeeeeeeeh.......',
  '.......heeeeeeeeeeh......',
  '......heeeeeeeeeeeeh.....',
  '......heeeeeeeeeeeeh.....',
  '.....heeeeeeeeeeeeeeh....',
  '......eee...ee...eee.....',
  '......eeee.eeee.eeee.....',
  '......eeeeeeeeeeeeee.....',
  '......eeeeeeeeeeeeee.....',
  '.......sssss..sssss......',
  '.......s.ssssssss.s......',
  '..........ssssss.........',
  '.......tttttttttttt......',
  '.......s.tttttttt.s......',
  '.......s.tttttttt.s......',
  '.......s.llllrrrr.s......',
  '.........lll..rrr........',
  '.........ll....rr........',
  '.........................',
]);

/** The side region map of the humanoid, facing right. */
const HUMANOID_SIDE = Object.freeze([
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '..........hhhhhh.........',
  '.........heeeeeeh........',
  '........heeeeeeeeh.......',
  '.......heeeeeeeeeeh......',
  '......heeeeeeeeeeeeh.....',
  '......heeeeeeeeeeeeh.....',
  '.....heeeeeeeeeeeeeeh....',
  '......eeeeeeee...eee.....',
  '......eeeeeeeeee.eee.....',
  '......eeeeeeeeeeeeee.....',
  '......eee.eeeeeeeeee.....',
  '.......ss.sssssss..s.....',
  '.......sss.sssssssss.....',
  '.........tt..............',
  '.......t.tttttttt........',
  '.......s.tttttttt........',
  '.......s.tttttttt........',
  '.......s.llllrrrr........',
  '.........lll..rrr........',
  '.........ll....rr........',
  '.........................',
]);

/** A frame with the lowest row of one leg cleared: that foot is lifted. */
const liftLeg = (rows, letter) => {
  const lowest = rows.findLastIndex((row) => row.includes(letter));
  return rows.map((row, y) => (y === lowest ? row.replaceAll(letter, '.') : row));
};

/** The back view: the head above row 13 turns to hair, with no face holes. */
const backOf = (rows) =>
  rows.map((row, y) =>
    y < 13 && row.includes('e')
      ? row.slice(0, row.indexOf('e')) +
        row.slice(row.indexOf('e'), row.lastIndexOf('e') + 1).replace(/[e.]/g, 'h') +
        row.slice(row.lastIndexOf('e') + 1)
      : row,
  );

const walkOf = (rows) => [liftLeg(rows, 'l'), liftLeg(rows, 'r')];
const HUMANOID_BACK = backOf(HUMANOID_FRONT);
const HUMANOID_LEFT = HUMANOID_SIDE.map((row) => [...row].reverse().join(''));

/** The humanoid Genesis Template as content holds it. */
export const SKIN_TEMPLATE = Object.freeze({
  id: 'skin.humanoid',
  name: 'Humanoid',
  description: 'A standing figure with hair, a head, a torso and two legs, idle and walking in four facings.',
  itemType: 'skin',
  canvas: { width: 25, height: 25 },
  frameDurationMs: 250,
  outline: '#14110f',
  legend: { e: 'head', h: 'hair', l: 'leftLeg', r: 'rightLeg', s: 'skin', t: 'torso' },
  roles: {
    hair: { regions: ['hair'], palette: 'detail', tones: { shadow: '#261a11', base: '#3a2a1d', highlight: '#5a4430' } },
    skin: {
      regions: ['head', 'skin'],
      palette: 'feature',
      tones: { shadow: '#b07a5f', base: '#d9a78b', highlight: '#f0c4a8' },
    },
    torso: {
      regions: ['torso'],
      palette: 'primary',
      tones: { shadow: '#2b3f66', base: '#3b5b8f', highlight: '#5a7fb8' },
      artDirection: true,
    },
    legs: {
      regions: ['leftLeg', 'rightLeg'],
      palette: 'secondary',
      tones: { shadow: '#2a2a33', base: '#3a3a46', highlight: '#54546a' },
      artDirection: true,
    },
  },
  directions: {
    '08': [HUMANOID_FRONT],
    18: walkOf(HUMANOID_FRONT),
    '02': [HUMANOID_BACK],
    12: walkOf(HUMANOID_BACK),
    '04': [HUMANOID_LEFT],
    14: walkOf(HUMANOID_LEFT),
    '06': [HUMANOID_SIDE],
    16: walkOf(HUMANOID_SIDE),
  },
});

/** A seamless floor Genesis Template as content holds it: ground with patches that cross the edges. */
export const FLOOR_TEMPLATE = Object.freeze({
  id: 'floor.terrain',
  name: 'Terrain',
  description: 'A seamless ground tile with patches of a second material.',
  itemType: 'floor',
  canvas: { width: 12, height: 12 },
  frameDurationMs: 1000,
  outline: '#1d1a16',
  legend: { g: 'ground', p: 'patch' },
  roles: {
    ground: {
      regions: ['ground'],
      palette: 'primary',
      tones: { shadow: '#3e3226', base: '#5a4a3a', highlight: '#74624e' },
      artDirection: true,
    },
    patch: {
      regions: ['patch'],
      palette: 'secondary',
      tones: { shadow: '#4b5a33', base: '#667a45', highlight: '#83985d' },
      artDirection: true,
    },
  },
  directions: {
    '08': [
      [
        'ggpggggggggg',
        'pppppggggggg',
        'pppppggggggg',
        'pppppggggggg',
        'ggpggggpppgg',
        'ggggggpppppg',
        'ggggggpppppg',
        'ggggggpppppg',
        'pppggggpppgp',
        'pppggggggggp',
        'pppggggggggp',
        'gggggggggggg',
      ],
    ],
  },
});

/** A portal Genesis Template as content holds it: a vortex whose arms turn in three idle frames. */
export const PORTAL_TEMPLATE = Object.freeze({
  id: 'portal.vortex',
  name: 'Vortex',
  description: 'A rim around three arms that turn into a bright core.',
  itemType: 'portal',
  canvas: { width: 12, height: 12 },
  frameDurationMs: 200,
  outline: '#140d1f',
  legend: { r: 'ring', s: 'swirl', d: 'depth', c: 'core' },
  roles: {
    rim: {
      regions: ['ring'],
      palette: 'secondary',
      tones: { shadow: '#2e2350', base: '#4a3a7a', highlight: '#6a58a6' },
      artDirection: true,
    },
    swirl: {
      regions: ['swirl'],
      palette: 'primary',
      tones: { shadow: '#5b3fa8', base: '#8a63e0', highlight: '#b896ff' },
      artDirection: true,
    },
    depth: {
      regions: ['depth'],
      palette: 'detail',
      tones: { shadow: '#160f2c', base: '#241a45', highlight: '#352760' },
    },
    core: {
      regions: ['core'],
      palette: 'feature',
      tones: { shadow: '#c9b6ff', base: '#e6dcff', highlight: '#ffffff' },
    },
  },
  directions: {
    '08': [
      [
        '.....rr.....',
        '...rrrrrr...',
        '..rssssddr..',
        '.rsdddssddr.',
        '.rdddddsddr.',
        'rrdssccsddrr',
        'rrdsdccddsrr',
        '.rssdssdssr.',
        '.rdsddsssdr.',
        '..rssddddr..',
        '...rrrrrr...',
        '.....rr.....',
      ],
      [
        '.....rr.....',
        '...rrrrrr...',
        '..rddddsdr..',
        '.rdddddssdr.',
        '.rdsssddsdr.',
        'rrsddccdsdrr',
        'rrsddccsddrr',
        '.rsdssddddr.',
        '.rsddssdssr.',
        '..rdddsssr..',
        '...rrrrrr...',
        '.....rr.....',
      ],
      [
        '.....rr.....',
        '...rrrrrr...',
        '..rdddddsr..',
        '.rsssssddsr.',
        '.rsdddsddsr.',
        'rrdddccddsrr',
        'rrddsccdssrr',
        '.rdssdssddr.',
        '.rddsdddddr.',
        '..rdsssdsr..',
        '...rrrrrr...',
        '.....rr.....',
      ],
    ],
  },
});

/** An obstacle Genesis Template as content holds it: a rock pile whose pebbles roll in three idle frames. */
export const OBSTACLE_TEMPLATE = Object.freeze({
  id: 'obstacle.rock-pile',
  name: 'Rock pile',
  description: 'Three rounded rocks with cracks and loose pebbles over a dust shadow.',
  itemType: 'obstacle',
  canvas: { width: 12, height: 12 },
  frameDurationMs: 320,
  outline: '#1c120a',
  legend: { r: 'chunk', c: 'seam', p: 'loose', d: 'dust' },
  roles: {
    chunk: {
      regions: ['chunk'],
      palette: 'primary',
      tones: { shadow: '#5a3b22', base: '#8a5d36', highlight: '#b48553' },
      artDirection: true,
    },
    seam: { regions: ['seam'], palette: 'detail', tones: { shadow: '#2e1d10', base: '#43301e', highlight: '#5a4330' } },
    loose: {
      regions: ['loose'],
      palette: 'secondary',
      tones: { shadow: '#6e4a2c', base: '#9c7046', highlight: '#c39563' },
      artDirection: true,
    },
    dust: {
      regions: ['dust'],
      palette: 'feature',
      tones: { shadow: '#3a2c20', base: '#4d3c2c', highlight: '#614e3b' },
    },
  },
  directions: {
    '08': [0, 1, 2].map((shift) => [
      '............',
      '............',
      '....rrrr....',
      '...rrrcrr...',
      '..rrrrcrrr..',
      '.rrrrrrrrrr.',
      'rrrcrrrrcrrr',
      'rrrrcrrrrcrr',
      'rrrrrrrrrrrr',
      `${'.'.repeat(shift)}pp${'d'.repeat(8 - 2 * shift)}pp${'.'.repeat(shift)}`,
      '.dddddddddd.',
      '............',
    ]),
  },
});

/** The palette families, in order. */
export const PALETTE_FAMILIES = Object.freeze(['natural', 'dark', 'light', 'warm', 'cool', 'biome', 'exotic']);

/** Seven palettes of the global library as content holds them. */
export const PALETTES = Object.freeze([
  {
    id: 'natural-deep',
    name: 'Deep',
    family: 'natural',
    biomeTags: [],
    roles: {
      primary: '#2f4a5e',
      secondary: '#26262e',
      detail: '#120d0a',
      feature: '#4a2e22',
      outline: '#14110f',
      accent: '#c9a24a',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['feature', 'primary', 'secondary'] },
  },
  {
    id: 'natural-medium',
    name: 'Medium',
    family: 'natural',
    biomeTags: [],
    roles: {
      primary: '#3b5b8f',
      secondary: '#3a3a46',
      detail: '#5a3a22',
      feature: '#d9a78b',
      outline: '#14110f',
      accent: '#e8c45e',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['feature', 'primary', 'secondary'] },
  },
  {
    id: 'biome-ash-wastes',
    name: 'Ash Wastes',
    family: 'biome',
    biomeTags: ['ash-wastes'],
    roles: {
      primary: '#8a8a86',
      secondary: '#6e6d69',
      detail: '#2b2a27',
      feature: '#b9b5aa',
      outline: '#141311',
      accent: '#c9b93a',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['feature', 'primary', 'secondary'] },
  },
  {
    id: 'exotic-teal',
    name: 'Teal',
    family: 'exotic',
    biomeTags: [],
    roles: {
      primary: '#0f766e',
      secondary: '#134e4a',
      detail: '#06302f',
      feature: '#4fd1c5',
      outline: '#14110f',
      accent: '#f2f58a',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['feature', 'primary', 'secondary'] },
  },
  {
    id: 'dark-basalt',
    name: 'Dark Basalt',
    family: 'dark',
    biomeTags: ['ash-wastes'],
    roles: {
      primary: '#2e2b2f',
      secondary: '#433d44',
      outline: '#0e0c0f',
      accent: '#d0602e',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['primary', 'secondary'] },
  },
  {
    id: 'ember-rift',
    name: 'Ember Rift',
    family: 'warm',
    biomeTags: ['ash-wastes'],
    roles: {
      primary: '#e0702e',
      secondary: '#6a2f1c',
      detail: '#2b120a',
      feature: '#ffe2a8',
      outline: '#1a0b06',
      accent: '#ffd166',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['primary', 'detail'] },
  },
  {
    id: 'ruin-concrete',
    name: 'Ruin concrete',
    family: 'cool',
    biomeTags: ['ash-wastes'],
    roles: {
      primary: '#8a8e94',
      secondary: '#a6aab0',
      detail: '#5a3d30',
      feature: '#4a4d52',
      outline: '#17181b',
      accent: '#d0b48a',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['primary', 'detail'] },
  },
]);

/** The palette of the library an id names. */
export const paletteFixture = (id) => PALETTES.find((palette) => palette.id === id);

/** The item a new skin takes its function from. */
export const BASELINE_SKIN = Object.freeze({
  id: 'skin.drifter',
  itemId: 'drifter',
  payload: {
    data: {
      item: {
        id: 'drifter',
        type: 'skin',
        description: 'A wanderer in a magenta coat, one of the countless drifters of the frontier.',
        activable: true,
      },
      stats: { effect: 1, resistance: 9, agility: 3, range: 0, intelligence: 2, utility: 0 },
    },
  },
});

/** The item a new floor takes its function from. */
export const BASELINE_FLOOR = Object.freeze({
  id: 'floor.frontier-grass',
  itemId: 'frontier-grass',
  payload: {
    data: {
      item: { id: 'frontier-grass', type: 'floor', description: 'Short frontier grass.', activable: false },
      stats: { effect: 0, resistance: 0, agility: 0, range: 0, intelligence: 0, utility: 0 },
    },
  },
});

/** The item a new portal takes its function from. */
export const BASELINE_PORTAL = Object.freeze({
  id: 'portal.violet-gate',
  itemId: 'violet-gate',
  payload: {
    data: {
      item: { id: 'violet-gate', type: 'portal', description: 'A crossing in the undergrowth.', activable: false },
      stats: { effect: 0, resistance: 0, agility: 0, range: 0, intelligence: 0, utility: 0 },
    },
  },
});

/** The item a new obstacle takes its function from. */
export const BASELINE_OBSTACLE = Object.freeze({
  id: 'rock.rust-boulder',
  itemId: 'rust-boulder',
  payload: {
    data: {
      item: { id: 'rust-boulder', type: 'obstacle', description: 'An iron-rich boulder.', activable: false },
      stats: { effect: 0, resistance: 0, agility: 0, range: 0, intelligence: 0, utility: 0 },
    },
  },
});

/** A biome and its palette, as the foundation holds it. */
export const VIOLET_STRATA = Object.freeze({
  id: 'biome.violet-strata',
  name: 'Violet Strata',
  palette: {
    base: ['#2f5a34', '#6a3fa0', '#4f4a6b'],
    shadow: ['#1c3620', '#3a2160'],
    highlight: ['#9b6fe0', '#8fbf5a'],
    outline: ['#120d1c'],
    accent: ['#b57bff'],
    special: ['#6fae3a'],
  },
});

/** A second biome, for maps of another biome. */
export const ASH_WASTES = Object.freeze({
  id: 'biome.ash-wastes',
  name: 'Ash Wastes',
  palette: {
    base: ['#6e6d69', '#8a8a86'],
    shadow: ['#3c3b38'],
    highlight: ['#b9b5aa'],
    outline: ['#141311'],
    accent: ['#c9b93a'],
  },
});

const sha256 = (data) => `sha256:${createHash('sha256').update(data).digest('hex')}`;

/**
 * Writes a content artifact that holds the procedural content, the baseline items, two
 * biomes, a skin definition for each item `items` names, the composed entities `entities` names, and
 * a map definition for each map `maps` names. Every other family is empty.
 * @param {Object<string,{artBrief?:Object,locations?:string[]}>} [items] - Item id → its art brief and locations.
 * @param {Object} [world]
 * @param {Object<string,{biome:string|null,composition?:Array<{entity:string,count:number}>}>} [world.maps] - Map code →
 *   the id of its biome and its composition.
 * @param {Array<{id:string,entityType:string,objectLayerItemIds:string[],itemType?:string}>} [world.entities] - Composed
 *   entities; one with an `itemType` is also the item its slug labels.
 * @param {Object[]} [world.baseline] - The entity-type defaults every world resolves against.
 * @returns {string} The content root.
 */
export function writeProceduralArtifact(items = {}, { maps = {}, entities = [], baseline = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-procedural-content-'));
  const skins = Object.fromEntries(
    Object.entries(items).map(([itemId, item]) => [
      `skin.${itemId}`,
      { id: `skin.${itemId}`, name: itemId, description: '', role: '', ...item, objectLayer: { itemType: 'skin' } },
    ]),
  );
  const definitions = {
    ...skins,
    ...Object.fromEntries(
      [VIOLET_STRATA, ASH_WASTES].map((biome) => [biome.id, { ...biome, description: '', role: '' }]),
    ),
    ...Object.fromEntries(
      Object.entries(maps).map(([code, { biome, composition = [] }]) => [
        `map.${code}`,
        { id: `map.${code}`, name: code, description: '', role: '', biome, composition },
      ]),
    ),
    ...Object.fromEntries(
      entities.map(({ id, itemType }) => [
        id,
        { id, name: id, description: '', role: '', ...(itemType && { objectLayer: { itemType } }) },
      ]),
    ),
  };
  const slug = (id) => id.slice(id.indexOf('.') + 1);
  const files = {
    ...Object.fromEntries(Object.values(CONTENT_FAMILIES).map((family) => [`foundation/${family}.json`, []])),
    'foundation/object-layers.json': [BASELINE_SKIN, BASELINE_FLOOR, BASELINE_PORTAL, BASELINE_OBSTACLE],
    'foundation/baseline.json': baseline,
    'foundation/item-baseline.json': {
      skin: BASELINE_SKIN.itemId,
      floor: BASELINE_FLOOR.itemId,
      portal: BASELINE_PORTAL.itemId,
      obstacle: BASELINE_OBSTACLE.itemId,
    },
    'procedural/genesis-templates.json': [SKIN_TEMPLATE, FLOOR_TEMPLATE, PORTAL_TEMPLATE, OBSTACLE_TEMPLATE],
    'procedural/palettes.json': {
      families: PALETTE_FAMILIES,
      palettes: PALETTES,
    },
    'context.json': {
      definitions,
      labels: Object.fromEntries(
        [...Object.keys(skins), ...entities.filter(({ itemType }) => itemType).map(({ id }) => id)].map((id) => [
          slug(id),
          id,
        ]),
      ),
      sources: {},
      entities: Object.fromEntries(
        entities.map(({ id, entityType, objectLayerItemIds }) => [id, { entityType, objectLayerItemIds }]),
      ),
      references: {},
      referencedBy: {},
    },
  };
  const digests = {};
  for (const [file, value] of Object.entries(files)) {
    const data = Buffer.from(JSON.stringify(value));
    fs.mkdirSync(path.dirname(path.join(root, 'dist', file)), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', file), data);
    digests[file] = sha256(data);
  }
  const manifest = {
    repository: 'underpostnet/cyberia-content',
    contentVersion: '1.0.0',
    sourceRevision: 'a'.repeat(40),
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentDigest: sha256(
      Object.keys(digests)
        .sort()
        .map((file) => `${file} ${digests[file]}\n`)
        .join(''),
    ),
    build: {},
    instances: [],
    sagas: [],
    files: digests,
  };
  fs.writeFileSync(path.join(root, 'dist', 'manifest.json'), JSON.stringify(manifest));
  return root;
}
