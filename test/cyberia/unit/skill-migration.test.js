import { describe, expect, it } from 'vitest';
import { migrateSkills, migratedSkill } from '../../../src/projects/cyberia/content/skill-migration.js';
import { skillDefect } from '../../../src/api/cyberia-instance/cyberia-instance-items.js';
import { skillIdOf } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

const COMPILED = [
  { triggerItemId: 'hatchet', skills: [{ skillId: 'hatchet-throw', logicEventId: 'projectile' }] },
  { triggerItemId: 'coin', skills: [{ skillId: 'coin-scatter', logicEventId: 'coin_drop_or_transaction' }] },
];

describe('the id of a skill', () => {
  it('is the slug of its name, else its handler', () => {
    expect(skillIdOf('Pulse Shot', 'projectile')).toBe('pulse-shot');
    expect(skillIdOf('  Med Gel: Dose! ', 'zero-waste-auto-consume-heal')).toBe('med-gel-dose');
    expect(skillIdOf('', 'coin_drop_or_transaction')).toBe('coin_drop_or_transaction');
    expect(skillIdOf(undefined, 'projectile')).toBe('projectile');
  });
});

describe('the migration of a stored skill document', () => {
  it('takes the id of a free compiled skill of the same item and handler, else the id its item and name give', () => {
    const stored = {
      _id: 'a',
      triggerItemId: 'hatchet',
      logicEventIds: ['projectile', 'doppelganger'],
      skills: [
        { logicEventId: 'projectile', name: 'Projectile' },
        { logicEventId: 'doppelganger', name: 'Echo Double' },
        { logicEventId: 'projectile', name: '' },
      ],
    };
    const next = migratedSkill(stored, COMPILED);
    expect(next).not.toHaveProperty('logicEventIds');
    expect(next.skills.map(({ skillId }) => skillId)).toEqual([
      'hatchet-throw',
      'hatchet-echo-double',
      'hatchet-projectile',
    ]);
    expect(skillDefect(next)).toBe('');
  });

  it('never repeats an id and never changes one a skill holds', () => {
    const stored = {
      triggerItemId: 'staff',
      skills: [
        { skillId: 'bolt', logicEventId: 'projectile', name: 'Bolt' },
        { logicEventId: 'projectile', name: 'Bolt' },
        { logicEventId: 'projectile', name: 'Bolt' },
      ],
    };
    expect(migratedSkill(stored, COMPILED).skills.map(({ skillId }) => skillId)).toEqual([
      'bolt',
      'staff-bolt',
      'staff-bolt-2',
    ]);
  });

  it('leaves a current document alone', () => {
    expect(migratedSkill({ triggerItemId: 'coin', skills: [{ skillId: 'coin-scatter' }] }, COMPILED)).toBeNull();
  });

  it('reports without apply, writes with it, and changes nothing on a second run', async () => {
    const docs = [
      {
        _id: 1,
        triggerItemId: 'coin',
        logicEventIds: ['coin_drop_or_transaction'],
        skills: [{ logicEventId: 'coin_drop_or_transaction' }],
      },
      { _id: 2, triggerItemId: 'hatchet', skills: [{ skillId: 'hatchet-throw', logicEventId: 'projectile' }] },
    ];
    const writes = [];
    const CyberiaSkill = {
      find: () => ({ lean: async () => structuredClone(docs) }),
      updateOne: async (filter, update, options) => {
        writes.push({ filter, update, options });
        const doc = docs.find(({ _id }) => _id === filter._id);
        doc.skills = update.$set.skills;
        delete doc.logicEventIds;
      },
    };
    const dry = await migrateSkills({ CyberiaSkill, compiled: COMPILED });
    expect(dry).toEqual({
      migrated: [{ triggerItemId: 'coin', skillIds: ['coin-scatter'] }],
      current: 1,
      conflicts: [],
    });
    expect(writes).toEqual([]);

    await migrateSkills({ CyberiaSkill, compiled: COMPILED, apply: true });
    expect(writes).toEqual([
      {
        filter: { _id: 1 },
        update: {
          $set: { skills: [{ skillId: 'coin-scatter', logicEventId: 'coin_drop_or_transaction' }] },
          $unset: { logicEventIds: 1 },
        },
        options: { strict: false },
      },
    ]);
    expect(await migrateSkills({ CyberiaSkill, compiled: COMPILED, apply: true })).toEqual({
      migrated: [],
      current: 2,
      conflicts: [],
    });
  });

  it('writes nothing while one skill id names two definitions', async () => {
    const docs = [
      {
        _id: 1,
        triggerItemId: 'gun',
        skills: [{ skillId: 'shot', logicEventId: 'projectile', summonedEntityItemId: 'bullet' }],
      },
      {
        _id: 2,
        triggerItemId: 'bow',
        skills: [{ skillId: 'shot', logicEventId: 'projectile', summonedEntityItemId: 'arrow' }],
      },
      { _id: 3, triggerItemId: 'coin', skills: [{ logicEventId: 'coin_drop_or_transaction' }] },
    ];
    const writes = [];
    const CyberiaSkill = { find: () => ({ lean: async () => docs }), updateOne: async (...args) => writes.push(args) };
    const report = await migrateSkills({ CyberiaSkill, compiled: COMPILED, apply: true });
    expect(report.conflicts).toEqual(['skill id "shot" is projectile → bullet on gun and projectile → arrow on bow']);
    expect(writes).toEqual([]);
  });
});
