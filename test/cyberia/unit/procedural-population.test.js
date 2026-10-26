import { describe, it, expect, vi } from 'vitest';
import { STAGES, stageOf } from '../../../src/projects/cyberia/procedural/population/stages.js';
import { themePalettes, themeSlots } from '../../../src/projects/cyberia/procedural/population/theme.js';
import {
  checkPopulationRequest,
  paletteChanges,
  targetRequest,
  targetState,
} from '../../../src/projects/cyberia/procedural/population/population.js';
import {
  RESOLUTIONS,
  checkResolution,
  recommendedOf,
  resolutionsOf,
} from '../../../src/projects/cyberia/procedural/population/resolution.js';
import { GENERATORS } from '../../../src/projects/cyberia/procedural/generator-registry.js';
import { resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_TO_ITEM_TYPES,
  ITEM_TYPES,
} from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import {
  FLOOR_TEMPLATE,
  SKIN_TEMPLATE,
  VIOLET_STRATA,
  paletteFixture,
  writeProceduralArtifact,
} from '../../support/procedural-content.js';

vi.stubEnv('CYBERIA_CONTENT_ROOT', writeProceduralArtifact());

const floor = resolveTemplate(FLOOR_TEMPLATE);
const skin = resolveTemplate(SKIN_TEMPLATE);
const palettes = [{ id: VIOLET_STRATA.id, name: VIOLET_STRATA.name, group: 'biome', roles: VIOLET_STRATA.palette }];
const [green, violet, slate] = VIOLET_STRATA.palette.base;

describe('the population stages', () => {
  it('lists floors, NPC skins, portals and obstacles, each on the entity types the runtime vocabulary gives its item type', () => {
    expect(STAGES.map(({ id, order }) => [id, order])).toEqual([
      ['floor', 0],
      ['npc-skin', 1],
      ['portal', 2],
      ['obstacle', 3],
      ['other', 4],
    ]);
    expect(stageOf('floor')).toMatchObject({ entityTypes: [ENTITY_TYPES.floor], itemTypes: [ITEM_TYPES.floor] });
    expect(stageOf('npc-skin')).toMatchObject({ entityTypes: [ENTITY_TYPES.bot], itemTypes: [ITEM_TYPES.skin] });
    expect(stageOf('portal')).toMatchObject({
      entityTypes: [ENTITY_TYPES.portal],
      itemTypes: [ITEM_TYPES.portal],
      generatorId: 'portal-variant',
    });
    expect(stageOf('obstacle')).toMatchObject({
      entityTypes: [ENTITY_TYPES.obstacle],
      itemTypes: [ITEM_TYPES.obstacle],
      generatorId: 'obstacle-variant',
    });
    for (const stage of STAGES.filter(({ generatorId }) => generatorId)) {
      expect(stage.itemTypes).toEqual([GENERATORS[stage.generatorId].itemType]);
      for (const entityType of stage.entityTypes)
        expect(ENTITY_TYPE_TO_ITEM_TYPES[entityType]).toContain(stage.itemTypes[0]);
    }
  });

  it('puts every item type no generator draws in other, on the entity types that place it, and no player type', () => {
    const generated = Object.values(GENERATORS).map(({ itemType }) => itemType);
    const other = stageOf('other');
    expect(other.generatorId).toBeNull();
    expect([...other.itemTypes].sort()).toEqual(
      Object.values(ITEM_TYPES)
        .filter((type) => !generated.includes(type))
        .sort(),
    );
    expect(STAGES.flatMap(({ itemTypes }) => itemTypes).sort()).toEqual(Object.values(ITEM_TYPES).sort());
    expect(other.entityTypes).not.toContain(ENTITY_TYPES.player);
    expect(other.entityTypes).not.toContain(ENTITY_TYPES.other_player);
    expect(other.entityTypes).toContain(ENTITY_TYPES.static);
    for (const entityType of other.entityTypes)
      expect(ENTITY_TYPE_TO_ITEM_TYPES[entityType].some((type) => other.itemTypes.includes(type))).toBe(true);
  });

  it('answers 404 for a stage it does not hold', () => {
    expect(() => stageOf('vegetation')).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('the map theme', () => {
  it('reads the bases, outline and accent of a biome, and rotates the bases', () => {
    const [read] = themePalettes(palettes, 1);
    expect(read.roles).toEqual({
      base: [violet, slate, green],
      outline: VIOLET_STRATA.palette.outline,
      accent: VIOLET_STRATA.palette.accent,
      special: VIOLET_STRATA.palette.special,
    });
  });

  it('gives each floor the biome bases, the outline and the accent', () => {
    expect(themeSlots(floor, { palettes })).toEqual({
      'ground.base': green,
      'patch.base': violet,
      outline: VIOLET_STRATA.palette.outline[0],
      accent: VIOLET_STRATA.palette.accent[0],
    });
  });

  it('gives each NPC its clothing from another start of the biome, and keeps hair and skin', () => {
    const first = themeSlots(skin, { palettes, offset: 0 });
    const second = themeSlots(skin, { palettes, offset: 1 });
    expect(first).toMatchObject({ 'torso.base': green, 'legs.base': violet });
    expect(second).toMatchObject({ 'torso.base': violet, 'legs.base': slate });
    for (const slot of Object.keys(first)) expect(slot).not.toMatch(/^(hair|skin)\./);
  });
});

describe('a population request', () => {
  it('takes a map code and a seed', () => {
    expect(checkPopulationRequest({ mapCode: 'violet-array', seed: { mode: 'fixed', value: 9 } })).toEqual({
      mapCode: 'violet-array',
      seed: { mode: 'fixed', value: 9 },
    });
    expect(checkPopulationRequest({ mapCode: 'a' }).seed.mode).toBe('auto');
  });

  it.each([
    ['no map code', {}, /mapCode/],
    ['an unknown key', { mapCode: 'a', stages: {} }, /does not take stages/],
    ['a seed out of range', { mapCode: 'a', seed: { mode: 'fixed', value: -1 } }, /seed is/],
  ])('refuses %s', (_, request, message) => {
    expect(() => checkPopulationRequest(request)).toThrow(message);
  });
});

describe('the resolutions of a target', () => {
  const skins = { templates: ['skin.humanoid'], usable: ['skin.humanoid'], modes: ['update-existing', 'create-new'] };
  const other = { templates: [], usable: [], modes: [] };
  const bound = { cid: 'bafk', revision: 2 };
  const of = (target, support) =>
    Object.fromEntries(resolutionsOf({ itemType: 'skin', ...target }, support).map(({ id, ...rest }) => [id, rest]));

  it('lists keep, render, template and author, each with its availability and the reason when it is not available', () => {
    expect(RESOLUTIONS).toEqual(['keep', 'render', 'template', 'author']);
    expect(of({ cid: 'bafk', hasRender: true, binding: bound }, skins)).toEqual({
      keep: { available: true, reason: '' },
      render: { available: true, reason: '' },
      template: { available: true, reason: '' },
      author: { available: true, reason: '' },
    });
    expect(of({ cid: 'bafk', hasRender: false, binding: bound }, skins).render).toEqual({
      available: false,
      reason: 'The current artwork has no render frames',
    });
    expect(of({ cid: null, hasRender: false, binding: null }, skins)).toMatchObject({
      keep: { available: false, reason: 'The item runs no definition: there is no artwork to keep' },
      render: { available: false, reason: 'There is no current artwork to generate from' },
      template: { available: true },
      author: { available: true },
    });
  });

  it('tells a missing Genesis Template, a generator that serves none, and a type no generator draws apart, and leaves out what a type cannot offer', () => {
    expect(of({ cid: 'bafk', hasRender: true, binding: bound }, { ...skins, templates: [], usable: [] })).toMatchObject(
      {
        render: { available: false, reason: 'No Genesis Template exists for skin items' },
        template: { available: false, reason: 'No Genesis Template exists for skin items' },
      },
    );
    expect(of({ cid: 'bafk', hasRender: true, binding: bound }, { ...skins, usable: [] })).toMatchObject({
      render: { available: false, reason: 'No skin Genesis Template serves its generator' },
      template: { available: false, reason: 'No skin Genesis Template serves its generator' },
    });
    const templateOnly = of({ cid: 'bafk', hasRender: true, binding: bound }, { ...skins, modes: [] });
    expect(templateOnly).toEqual({
      keep: { available: true, reason: '' },
      template: { available: false, reason: 'No generator builds skin items from a Genesis Template' },
      author: { available: true, reason: '' },
    });
    expect(of({ cid: null, hasRender: false, binding: null }, other)).toEqual({
      keep: { available: false, reason: 'The item runs no definition: there is no artwork to keep' },
      author: { available: true, reason: '' },
    });
  });

  it('recommends what changes nothing unasked: an authored definition, kept artwork, a template, else authoring', () => {
    const recommend = (target, support) =>
      recommendedOf(target, resolutionsOf({ itemType: 'skin', definitionCid: '', ...target }, support));
    expect(recommend({ cid: 'bafk', hasRender: true, binding: bound }, skins)).toBe('keep');
    expect(recommend({ cid: 'bafk', hasRender: false, binding: bound }, skins)).toBe('template');
    expect(recommend({ cid: null, hasRender: false, binding: null }, skins)).toBe('template');
    expect(recommend({ cid: 'bafk', hasRender: false, binding: bound }, other)).toBe('keep');
    expect(recommend({ cid: null, hasRender: false, binding: null }, other)).toBe('author');
    expect(recommend({ cid: 'bafk', hasRender: true, binding: bound, definitionCid: 'bafd' }, skins)).toBe('author');
  });

  it('refuses a resolution the target does not take, with its reason, whether it is offered or left out', () => {
    const relic = { itemType: 'static', cid: null, hasRender: false, binding: null };
    expect(() => checkResolution('relic', relic, other, 'author')).not.toThrow();
    expect(() => checkResolution('relic', relic, other, 'keep')).toThrow(
      'relic cannot take keep: The item runs no definition: there is no artwork to keep',
    );
    expect(() => checkResolution('relic', relic, other, 'render')).toThrow(
      'relic cannot take render: No generator makes variants of static items',
    );
    expect(() => checkResolution('relic', relic, other, 'definition')).toThrow(
      expect.objectContaining({
        status: 400,
        message: 'definition is not a resolution: keep, render, template, author',
      }),
    );
  });
});

describe('the job of a run of a target', () => {
  const population = { rootSeed: 7, fingerprint: 'f'.repeat(64) };
  const target = (fields) => ({
    itemId: 'moss',
    itemType: 'floor',
    stage: 'floor',
    templateId: 'floor.terrain',
    cid: 'bafk',
    palette: { paletteId: 'dark-basalt', slots: { 'ground.base': '#123456' } },
    variation: 0.4,
    ...fields,
  });

  it('updates its own item from its render or its template, with its own palette, variation and seed', () => {
    const fromRender = targetRequest(target({ resolution: 'render' }), population, 0);
    expect(fromRender).toMatchObject({
      mode: 'update-existing',
      generator: { id: 'floor-tile' },
      source: { itemIds: ['moss'], fromTemplate: [] },
      template: { id: 'floor.terrain' },
      palette: { items: [{ itemId: 'moss', paletteId: 'dark-basalt', slots: { 'ground.base': '#123456' } }] },
      output: { variantsPerItem: 1 },
      variation: { level: 0.4 },
    });
    expect(targetRequest(target({ resolution: 'template' }), population, 0).source.fromTemplate).toEqual(['moss']);
    expect(targetRequest(target({ resolution: 'render', itemId: 'stone' }), population, 0).seed.value).not.toBe(
      fromRender.seed.value,
    );
    expect(targetRequest(target({ resolution: 'render', variation: null }), population, 0).variation).toBeUndefined();
  });

  it('gives each run its own seed, and the same run the same seed', () => {
    const seedOf = (run) => targetRequest(target({ resolution: 'render' }), population, run).seed.value;
    expect(seedOf(0)).toBe(seedOf(0));
    expect(new Set([seedOf(0), seedOf(1), seedOf(2)]).size).toBe(3);
  });

  it('builds a new item with its exact id from the template when it has no artwork', () => {
    expect(
      targetRequest(target({ resolution: 'template', cid: null, itemId: 'new-moss' }), population, 0),
    ).toMatchObject({
      mode: 'create-new',
      itemType: 'floor',
      template: { id: 'floor.terrain' },
      palette: { paletteId: 'dark-basalt' },
      output: { itemIds: ['new-moss'] },
    });
  });
});

describe('the state of an item', () => {
  const entries = (...states) => states.map((state) => ({ state }));

  it('reads its decision first: a keep holds while the binding is the one observed', () => {
    const keep = { resolution: 'keep', observed: { cid: 'bafk', bindingRevision: 2 } };
    expect(targetState(keep, entries('ready'), { cid: 'bafk', revision: 2 })).toBe('kept');
    expect(targetState(keep, [], { cid: 'bafn', revision: 3 })).toBe('conflict');
    expect(targetState(keep, [], { cid: 'bafk', revision: 4 })).toBe('conflict');
    expect(targetState(keep, [], undefined)).toBe('conflict');
    expect(targetState({ resolution: 'author', definitionCid: 'bafd' }, entries('selected'))).toBe('authored');
    expect(targetState({ resolution: 'author', definitionCid: '' }, [])).toBe('author');
  });

  it('then reads its entries: a selection over work, work over a choice, a failure only when newest', () => {
    const render = { resolution: 'render' };
    expect(targetState(render, [])).toBe('new');
    expect(targetState(render, entries('ready', 'published'))).toBe('published');
    expect(targetState(render, entries('generating', 'selected'))).toBe('selected');
    expect(targetState(render, entries('ready', 'generating'))).toBe('generating');
    expect(targetState(render, entries('editing', 'discarded'))).toBe('choose');
    expect(targetState(render, entries('failed', 'discarded'))).toBe('failed');
    expect(targetState(render, entries('discarded', 'failed'))).toBe('new');
  });
});

describe('a bulk palette change', () => {
  const basalt = paletteFixture('dark-basalt');
  const item = (itemId, fields = {}) => ({
    itemId,
    itemType: 'floor',
    stage: 'floor',
    resolution: 'render',
    templateId: 'floor.terrain',
    observed: null,
    palette: { slots: {} },
    ...fields,
  });
  const population = {
    context: { palettes },
    targets: [
      item('moss', { palette: { slots: { 'patch.base': '#ff0000' } } }),
      item('stone'),
      item('kept-floor', { resolution: 'keep', observed: { cid: 'bafk', bindingRevision: 1 } }),
      item('npc', { itemType: 'skin', stage: 'npc-skin', templateId: 'skin.humanoid' }),
      item('npc-two', { itemType: 'skin', stage: 'npc-skin', templateId: 'skin.humanoid' }),
    ],
  };
  const change = (body) => paletteChanges(population, { itemIds: ['moss', 'stone'], overrides: 'keep', ...body });

  it('gives a palette, and keeps or replaces the slots an item sets', () => {
    const kept = change({ source: 'palette', paletteId: basalt.id });
    expect(kept.changes.map(({ itemId, after }) => [itemId, after])).toEqual([
      ['moss', { paletteId: basalt.id, slots: { 'patch.base': '#ff0000' } }],
      ['stone', { paletteId: basalt.id, slots: {} }],
    ]);
    expect(kept.changes[0].slots).toEqual([{ slot: 'patch.base', before: '#ff0000', after: '#ff0000', kept: true }]);
    const replaced = change({ source: 'palette', paletteId: basalt.id, overrides: 'replace' });
    expect(replaced.changes[0].after).toEqual({ paletteId: basalt.id, slots: {} });
    expect(replaced.changes[0].slots).toEqual([{ slot: 'patch.base', before: '#ff0000', after: null, kept: false }]);
  });

  it('gives the biome colors, with the slots an item sets over them unless replaced', () => {
    const { changes } = change({ source: 'biome' });
    expect(changes[0].after.slots).toMatchObject({ 'ground.base': green, 'patch.base': '#ff0000' });
    expect(changes[1].after.slots).toMatchObject({ 'ground.base': green, 'patch.base': violet });
    expect(change({ source: 'biome', overrides: 'replace' }).changes[0].after.slots['patch.base']).toBe(violet);
  });

  it('starts each NPC from another biome color, gives any palette to any item type, and skips what generates nothing', () => {
    const { changes, skipped } = paletteChanges(population, {
      itemIds: ['npc', 'npc-two', 'kept-floor', 'ghost'],
      source: 'biome',
      overrides: 'keep',
    });
    expect(changes.map(({ after }) => after.slots['torso.base'])).toEqual([green, violet]);
    expect(skipped).toEqual([
      { itemId: 'kept-floor', reason: 'it generates no artwork' },
      { itemId: 'ghost', reason: 'the population has no such item' },
    ]);
    const themed = paletteChanges(population, {
      itemIds: ['npc'],
      source: 'palette',
      paletteId: basalt.id,
      overrides: 'keep',
    });
    expect(themed).toEqual({
      changes: [{ itemId: 'npc', before: { slots: {} }, after: { paletteId: basalt.id, slots: {} }, slots: [] }],
      skipped: [],
    });
  });

  it.each([
    ['no item', { itemIds: [], source: 'biome', overrides: 'keep' }, /itemIds/],
    ['an unknown source', { itemIds: ['moss'], source: 'paint', overrides: 'keep' }, /source is one of/],
    ['an unknown policy', { itemIds: ['moss'], source: 'biome', overrides: 'merge' }, /overrides is one of/],
    ['a palette source with no id', { itemIds: ['moss'], source: 'palette', overrides: 'keep' }, /paletteId/],
    [
      'a palette the library does not hold',
      { itemIds: ['moss'], source: 'palette', paletteId: 'floor.dark-basalt', overrides: 'keep' },
      /paletteId of a palette of the library/,
    ],
  ])('refuses %s', (_, body, message) => {
    expect(() => paletteChanges(population, body)).toThrow(message);
  });

  it('refuses biome colors on a map with no biome', () => {
    expect(() =>
      paletteChanges(
        { ...population, context: { palettes: [] } },
        { itemIds: ['moss'], source: 'biome', overrides: 'keep' },
      ),
    ).toThrow(/no biome colors/);
  });
});
