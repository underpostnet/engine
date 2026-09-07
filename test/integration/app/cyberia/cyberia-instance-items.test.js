import { describe, expect, it } from 'vitest';
import {
  collectInstanceItemIds,
  collectSummonedItemIds,
  isMaterialItemId,
  selectInstanceSkills,
} from '../../../../src/api/cyberia-instance/cyberia-instance-items.js';

const SKILLS = [
  { triggerItemId: 'atlas_pistol_mk2', skills: [{ summonedEntityItemId: 'atlas_pistol_mk2_bullet' }] },
  { triggerItemId: 'hatchet', skills: [{ summonedEntityItemId: 'hatchet-skill' }] },
  { triggerItemId: 'anon', skills: [{ summonedEntityItemId: '$active_skin' }] },
];

describe('what an instance names', () => {
  it('reads the four sources and nothing else', () => {
    const itemIds = collectInstanceItemIds({
      maps: [{ entities: [{ objectLayerItemIds: ['purple', 'atlas_pistol_mk2'] }] }],
      entityDefaults: [
        { liveItemIds: ['wood-1'], deadItemIds: ['wood-extracted-1'], dropItemIds: ['wood-drop-1'], inventoryItemsIds: ['tim-knife'] },
      ],
      actions: [
        {
          shopItems: [{ itemId: 'hatchet', priceItemId: 'coin' }],
          craftRecipes: [{ ingredients: [{ itemId: 'wood-1' }], outputItems: [{ itemId: 'plank' }] }],
        },
      ],
      quests: [{ steps: [{ objectives: [{ itemId: 'kishins' }] }], rewards: [{ itemId: 'lain' }] }],
    });
    expect([...itemIds].sort()).toEqual([
      'atlas_pistol_mk2',
      'coin',
      'hatchet',
      'kishins',
      'lain',
      'plank',
      'purple',
      'tim-knife',
      'wood-1',
      'wood-drop-1',
      'wood-extracted-1',
    ]);
  });

  it('is empty for an instance with no content, and survives ragged documents', () => {
    expect([...collectInstanceItemIds()]).toEqual([]);
    expect([...collectInstanceItemIds({ maps: [null, {}], entityDefaults: [{}], actions: [{}], quests: [{}] })]).toEqual(
      [],
    );
  });

  it('leaves runtime placeholders out — they name no document', () => {
    expect(isMaterialItemId('$active_skin')).toBe(false);
    expect(isMaterialItemId('anon')).toBe(true);
    expect([...collectInstanceItemIds({ quests: [{ rewards: [{ itemId: '$active_skin' }] }] })]).toEqual([]);
  });
});

describe('which skills an instance runs', () => {
  it('takes a skill whose trigger the world names, wherever it named it', () => {
    // The reported case: no entity wears a hatchet, a quest asks for one, and the skill belongs.
    const owned = collectInstanceItemIds({
      maps: [{ entities: [{ objectLayerItemIds: ['anon'] }] }],
      quests: [{ steps: [{ objectives: [{ itemId: 'hatchet' }] }] }],
    });
    expect(selectInstanceSkills(SKILLS, owned).map((skill) => skill.triggerItemId)).toEqual(['hatchet', 'anon']);
  });

  it('leaves out a skill nothing in the world triggers', () => {
    expect(selectInstanceSkills(SKILLS, new Set(['purple']))).toEqual([]);
    expect(selectInstanceSkills(SKILLS, new Set())).toEqual([]);
  });

  it('accepts a plain array of ids as well as a set', () => {
    expect(selectInstanceSkills(SKILLS, ['coin', 'hatchet']).map((skill) => skill.triggerItemId)).toEqual(['hatchet']);
  });

  it('collects what the selected skills summon, minus the placeholders', () => {
    // A summoned bullet needs an atlas; '$active_skin' is resolved by the simulation.
    expect([...collectSummonedItemIds(SKILLS)].sort()).toEqual(['atlas_pistol_mk2_bullet', 'hatchet-skill']);
    expect([...collectSummonedItemIds([])]).toEqual([]);
  });

  it('does not let a summoned item make its own skill belong', () => {
    // Membership is decided before summons are folded in, so a world that merely draws a bullet
    // does not thereby acquire the weapon skill that fires it.
    const owned = new Set(['atlas_pistol_mk2_bullet']);
    expect(selectInstanceSkills(SKILLS, owned)).toEqual([]);
  });
});
