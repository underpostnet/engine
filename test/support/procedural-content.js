'use strict';

/**
 * @module test/support/procedural-content
 * @description The procedural content the Procedural Engine suites run on: the humanoid Genesis
 * Template, four Palette Templates, the baseline skin, the Violet Strata biome, and a content
 * artifact that holds them with the foundation definition of some items.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTENT_FAMILIES, CONTENT_SCHEMA_VERSION } from '../../src/projects/cyberia/content/content-artifact.js';

/** The humanoid Genesis Template as content holds it. */
export const SKIN_TEMPLATE = Object.freeze({
  id: 'skin.humanoid',
  name: 'Humanoid',
  description: 'A standing figure with hair, a head, a torso and two legs, drawn front and side.',
  itemType: 'skin',
  canvas: { width: 25, height: 25 },
  frameDurationMs: 250,
  outline: '#14110f',
  legend: { e: 'head', h: 'hair', l: 'leftLeg', r: 'rightLeg', s: 'skin', t: 'torso' },
  roles: {
    hair: { regions: ['hair'], tones: { shadow: '#261a11', base: '#3a2a1d', highlight: '#5a4430' } },
    skin: { regions: ['head', 'skin'], tones: { shadow: '#b07a5f', base: '#d9a78b', highlight: '#f0c4a8' } },
    torso: {
      regions: ['torso'],
      tones: { shadow: '#2b3f66', base: '#3b5b8f', highlight: '#5a7fb8' },
      artDirection: true,
    },
    legs: {
      regions: ['leftLeg', 'rightLeg'],
      tones: { shadow: '#2a2a33', base: '#3a3a46', highlight: '#54546a' },
      artDirection: true,
    },
  },
  directions: {
    '06': [
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
    ],
    '08': [
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
    ],
  },
});

/** The palette families, in order. */
export const PALETTE_FAMILIES = Object.freeze(['natural', 'dark', 'light', 'warm', 'cool', 'biome', 'exotic']);

/** Four skin Palette Templates as content holds them. */
export const SKIN_PALETTES = Object.freeze([
  {
    id: 'skin.natural-deep',
    name: 'Deep',
    itemType: 'skin',
    family: 'natural',
    biomeTags: [],
    roles: {
      hair: '#120d0a',
      skin: '#4a2e22',
      torso: '#2f4a5e',
      legs: '#26262e',
      outline: '#14110f',
      accent: '#c9a24a',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['skin', 'torso', 'legs'] },
  },
  {
    id: 'skin.natural-medium',
    name: 'Medium',
    itemType: 'skin',
    family: 'natural',
    biomeTags: [],
    roles: {
      hair: '#5a3a22',
      skin: '#d9a78b',
      torso: '#3b5b8f',
      legs: '#3a3a46',
      outline: '#14110f',
      accent: '#e8c45e',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['skin', 'torso', 'legs'] },
  },
  {
    id: 'skin.biome-ash-wastes',
    name: 'Ash Wastes',
    itemType: 'skin',
    family: 'biome',
    biomeTags: ['ash-wastes'],
    roles: {
      hair: '#2b2a27',
      skin: '#b9b5aa',
      torso: '#8a8a86',
      legs: '#6e6d69',
      outline: '#141311',
      accent: '#c9b93a',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['skin', 'torso', 'legs'] },
  },
  {
    id: 'skin.exotic-teal',
    name: 'Teal',
    itemType: 'skin',
    family: 'exotic',
    biomeTags: [],
    roles: {
      hair: '#06302f',
      skin: '#4fd1c5',
      torso: '#0f766e',
      legs: '#134e4a',
      outline: '#14110f',
      accent: '#f2f58a',
    },
    constraints: { minContrast: 0.04, contrastRoles: ['skin', 'torso', 'legs'] },
  },
]);

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

const sha256 = (data) => `sha256:${createHash('sha256').update(data).digest('hex')}`;

/**
 * Writes a content artifact that holds the procedural content, the baseline skin, the Violet Strata
 * biome and a skin definition for each item `items` names. Every other family is empty.
 * @param {Object<string,{artBrief?:Object,locations?:string[]}>} [items] - Item id → its art brief and locations.
 * @returns {string} The content root.
 */
export function writeProceduralArtifact(items = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-procedural-content-'));
  const skins = Object.fromEntries(
    Object.entries(items).map(([itemId, item]) => [
      `skin.${itemId}`,
      { id: `skin.${itemId}`, name: itemId, description: '', role: '', ...item, objectLayer: { itemType: 'skin' } },
    ]),
  );
  const definitions = { ...skins, [VIOLET_STRATA.id]: { ...VIOLET_STRATA, description: '', role: '' } };
  const files = {
    ...Object.fromEntries(Object.values(CONTENT_FAMILIES).map((family) => [`foundation/${family}.json`, []])),
    'foundation/object-layers.json': [BASELINE_SKIN],
    'foundation/baseline.json': [],
    'foundation/item-baseline.json': { skin: BASELINE_SKIN.itemId },
    'procedural/genesis-templates.json': [SKIN_TEMPLATE],
    'procedural/palettes.json': { families: PALETTE_FAMILIES, palettes: SKIN_PALETTES },
    'context.json': {
      definitions,
      labels: Object.fromEntries(Object.keys(skins).map((id) => [id.slice('skin.'.length), id])),
      sources: {},
      entities: {},
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
