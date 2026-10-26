import { describe, it, expect, vi } from 'vitest';
import { extractArtDirection, resolveProceduralContext } from '../../../src/projects/cyberia/procedural/context.js';
import { SKIN_DEFAULT_PROFILE as profile } from '../../../src/projects/cyberia/procedural/profiles/registry.js';
import { baselineSource, itemBaseline } from '../../../src/projects/cyberia/procedural/source.js';
import { resolveTemplate } from '../../../src/projects/cyberia/procedural/templates.js';
import {
  BASELINE_SKIN,
  SKIN_TEMPLATE,
  VIOLET_STRATA,
  writeProceduralArtifact,
} from '../../support/procedural-content.js';
import { bareSkin, skinSource } from '../../support/procedural-skin.js';

vi.stubEnv('CYBERIA_CONTENT_ROOT', writeProceduralArtifact());

const template = resolveTemplate(SKIN_TEMPLATE);

const FOUNDATION = {
  visual: {
    artBrief: {
      spriteScale: 'A character of a 2×2 cell footprint.',
      requiredVariants: ['8 directions, each with idle and walk frames'],
      silhouette: 'Straight figure in a fitted suit.',
      detail: 'Black suit and a violet pin.',
      distinctiveFeatures: ['violet lapel pin'],
      paletteDirection: 'Black and violets.',
    },
    palettes: [
      { id: 'skin.aether-agent', name: 'Aether Agent', group: 'foundation', roles: { base: ['#000000', '#2a2a2a'] } },
      {
        id: VIOLET_STRATA.id,
        name: VIOLET_STRATA.name,
        group: 'biome',
        roles: { ...VIOLET_STRATA.palette, extra: '#123456' },
      },
    ],
  },
  references: [{ field: 'faction', id: 'faction.aether-council', name: 'Aether Council', source: 'x' }],
};
const ART = extractArtDirection(FOUNDATION);

describe('art direction', () => {
  it('reads the brief, the required variants, every foundation palette in order and the references', () => {
    expect(ART.palettes.map(({ id, group }) => [id, group])).toEqual([
      ['skin.aether-agent', 'foundation'],
      ['biome.violet-strata', 'biome'],
    ]);
    expect(ART.palettes[1].roles).toEqual({ ...VIOLET_STRATA.palette, extra: ['#123456'] });
    expect(ART.requiredVariants).toEqual(['8 directions, each with idle and walk frames']);
    expect(ART.brief.silhouette).toBe('Straight figure in a fitted suit.');
    expect(ART.brief).not.toHaveProperty('requiredVariants');
    expect(ART.references).toEqual([{ field: 'faction', id: 'faction.aether-council', name: 'Aether Council' }]);
  });

  it('takes the palettes of an item with no art brief, and is null where the foundation holds neither', () => {
    const biomeOnly = extractArtDirection({ visual: { palettes: FOUNDATION.visual.palettes.slice(1) } });
    expect(biomeOnly).toMatchObject({ brief: null, requiredVariants: [], references: [] });
    expect(biomeOnly.palettes).toHaveLength(1);
    expect(extractArtDirection(null)).toBeNull();
    expect(extractArtDirection({ visual: { palettes: [] } })).toBeNull();
  });
});

describe('the source of a new item', () => {
  it('takes the function of the baseline item the content names for its type', () => {
    expect(itemBaseline('skin')).toEqual({
      itemId: 'drifter',
      activable: true,
      stats: BASELINE_SKIN.payload.data.stats,
    });
    expect(() => itemBaseline('weapon')).toThrow(/names no baseline weapon item/);
  });

  it('has no definition, no render and an empty description the moderator writes', () => {
    expect(baselineSource('skin', itemBaseline('skin'))).toEqual({
      cid: '',
      data: {
        item: { id: '', type: 'skin', description: '', activable: true },
        stats: BASELINE_SKIN.payload.data.stats,
      },
      renderSource: null,
    });
  });
});

describe('the procedural context', () => {
  it('resolves a source with a render: its identity, its directions, its art direction, the template and the profile', () => {
    const source = skinSource(template, { codes: ['08', '18', '06'] });
    const context = resolveProceduralContext({ source, template, profile, artDirection: ART });
    expect(context.source).toMatchObject({ itemId: 'base-skin', itemType: 'skin', activable: true });
    expect(context.source.renderSource).not.toBeNull();
    expect(context.directions).toEqual(['08', '18', '06']);
    expect(context.artDirection).toBe(ART);
    expect(context.template).toBe(template);
    expect(context.profile).toBe(profile);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('resolves a source with no render to the directions of the template', () => {
    const context = resolveProceduralContext({ source: bareSkin(template), template, profile });
    expect(context.source.renderSource).toBeNull();
    expect(context.directions).toEqual(['08', '18', '02', '12', '04', '14', '06', '16']);
    expect(context.artDirection).toBeNull();
  });

  it('resolves the source of a new item', () => {
    const context = resolveProceduralContext({
      source: baselineSource('skin', itemBaseline('skin')),
      template,
      profile,
    });
    expect(context.source).toMatchObject({ cid: '', itemType: 'skin', description: '' });
    expect(context.directions).toEqual(['08', '18', '02', '12', '04', '14', '06', '16']);
  });

  it('refuses an item that does not fit the template, and a template that does not fit the profile', () => {
    const weapon = {
      ...bareSkin(template),
      data: { ...bareSkin(template).data, item: { ...bareSkin(template).data.item, type: 'weapon' } },
    };
    expect(() => resolveProceduralContext({ source: weapon, template, profile })).toThrow(/item type is weapon/);
    expect(() => resolveProceduralContext({ source: skinSource(template, { codes: [] }), template, profile })).toThrow(
      /its render has no frame/,
    );
    const unranked = { ...profile, regionOrder: profile.regionOrder.filter((region) => region !== 'hair') };
    expect(() => resolveProceduralContext({ source: bareSkin(template), template, profile: unranked })).toThrow(
      /does not rank hair/,
    );
  });
});
