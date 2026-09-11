import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../../src/db/DataBaseProvider.js';
import { CyberiaEntityTypeDefaultModel } from '../../../../src/api/cyberia-entity-type-default/cyberia-entity-type-default.model.js';
import {
  applyDefaultsToEntities,
  CyberiaEntityTypeDefaultService,
  findDuplicateBuilds,
} from '../../../../src/api/cyberia-entity-type-default/cyberia-entity-type-default.service.js';
import { CyberiaInstanceConfModel } from '../../../../src/api/cyberia-instance-conf/cyberia-instance-conf.model.js';
import {
  CYBERIA_INSTANCE_CONF_DEFAULTS,
  ENTITY_TYPE_DEFAULTS,
  resolveEntityInventory,
} from '../../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';

// Two worlds built on the same art: identical entityType, identical liveItemIds, different
// wiring. This is the shape that used to make item-id matching resolve one into the other.
const FOREST_BOT = {
  _id: new Types.ObjectId(),
  entityType: 'bot',
  liveItemIds: ['purple'],
  deadItemIds: ['forest-ghost'],
  dropItemIds: [],
  inventoryItemsIds: ['forest-coin'],
  behavior: 'hostile',
};
const CAVERN_BOT = {
  _id: new Types.ObjectId(),
  entityType: 'bot',
  liveItemIds: ['purple'],
  deadItemIds: ['cavern-ghost'],
  dropItemIds: ['amethyst'],
  inventoryItemsIds: [],
  behavior: 'passive',
};

describe('entity-type defaults are resolved by reference', () => {
  const options = { host: 'entity-default-test', path: '/' };
  let docs;

  beforeEach(() => {
    docs = new Map([FOREST_BOT, CAVERN_BOT].map((doc) => [String(doc._id), doc]));
    vi.spyOn(DataBaseProviderService, 'getModel').mockImplementation((name) => {
      if (name.toLowerCase() === 'cyberiaentitytypedefault') return CyberiaEntityTypeDefaultModel;
      throw new Error(`Unexpected model: ${name}`);
    });
    vi.spyOn(CyberiaEntityTypeDefaultModel, 'find').mockImplementation((query) => ({
      lean: async () => [...docs.values()].filter((doc) => query._id.$in.includes(String(doc._id))),
    }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('reads only the documents an instance names, never a lookalike', async () => {
    const forest = await CyberiaEntityTypeDefaultService.resolve([FOREST_BOT._id], options);
    expect(forest).toHaveLength(1);
    expect(forest[0]).toMatchObject({ deadItemIds: ['forest-ghost'], behavior: 'hostile' });
    // The other world shares entityType and liveItemIds and still cannot be reached from here.
    expect(forest[0].dropItemIds).toEqual([]);

    const cavern = await CyberiaEntityTypeDefaultService.resolve([CAVERN_BOT._id], options);
    expect(cavern[0]).toMatchObject({ deadItemIds: ['cavern-ghost'], behavior: 'passive' });
    expect(cavern[0].dropItemIds).toEqual(['amethyst']);
  });

  it('keeps reference order, so the most specific document an operator listed first stays first', async () => {
    const resolved = await CyberiaEntityTypeDefaultService.resolve([CAVERN_BOT._id, FOREST_BOT._id], options);
    expect(resolved.map((d) => d.behavior)).toEqual(['passive', 'hostile']);
  });

  it('drops a reference whose document is gone instead of resolving something else', async () => {
    const orphan = new Types.ObjectId();
    const resolved = await CyberiaEntityTypeDefaultService.resolve([orphan, FOREST_BOT._id], options);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].behavior).toBe('hostile');
  });

  it('resolves nothing for a conf that references nothing', async () => {
    for (const input of [[], null, undefined]) {
      expect(await CyberiaEntityTypeDefaultService.resolve(input, options)).toEqual([]);
    }
  });

  it('completes the referenced set with every canonical type it does not cover', async () => {
    const completed = await CyberiaEntityTypeDefaultService.resolveWithCanonical([FOREST_BOT._id], options);
    // The referenced document owns 'bot'; the canonical entry for that type must not come back too.
    expect(completed.filter((d) => d.entityType === 'bot')).toHaveLength(1);
    expect(completed[0]).toMatchObject({ behavior: 'hostile', deadItemIds: ['forest-ghost'] });
    for (const canonical of ENTITY_TYPE_DEFAULTS) {
      if (canonical.entityType === 'bot') continue;
      expect(completed.some((d) => d.entityType === canonical.entityType)).toBe(true);
    }
  });
});

describe('orphaned references are impossible to keep', () => {
  const options = { host: 'entity-default-test', path: '/' };
  let docs;
  let confs;

  const confModel = {
    find: (filter) => ({
      lean: async () =>
        [...confs.values()].filter((conf) => !filter?.instanceCode || conf.instanceCode === filter.instanceCode),
    }),
    updateOne: async ({ _id }, { $set }) => {
      confs.get(String(_id)).entityDefaults = $set.entityDefaults;
      return { modifiedCount: 1 };
    },
    updateMany: async (filter, update) => {
      let modifiedCount = 0;
      for (const conf of confs.values()) {
        if (update.$pull) {
          const before = conf.entityDefaults.length;
          conf.entityDefaults = conf.entityDefaults.filter((ref) => String(ref) !== update.$pull.entityDefaults);
          if (conf.entityDefaults.length !== before) modifiedCount++;
        } else if (update.$set?.entityDefaults) {
          if (conf.entityDefaults.length > 0) modifiedCount++;
          conf.entityDefaults = [...update.$set.entityDefaults];
        }
      }
      return { modifiedCount };
    },
  };

  beforeEach(() => {
    docs = new Map([FOREST_BOT, CAVERN_BOT].map((doc) => [String(doc._id), doc]));
    confs = new Map([
      ['c1', { _id: 'c1', instanceCode: 'forest', entityDefaults: [String(FOREST_BOT._id), String(CAVERN_BOT._id)] }],
      ['c2', { _id: 'c2', instanceCode: 'cavern', entityDefaults: [String(CAVERN_BOT._id)] }],
    ]);
    vi.spyOn(DataBaseProviderService, 'getModel').mockImplementation((name) => {
      if (name.toLowerCase() === 'cyberiaentitytypedefault') return CyberiaEntityTypeDefaultModel;
      if (name.toLowerCase() === 'cyberiainstanceconf') return confModel;
      throw new Error(`Unexpected model: ${name}`);
    });
    vi.spyOn(CyberiaEntityTypeDefaultModel, 'find').mockImplementation((query) => ({
      lean: async () => [...docs.values()].filter((doc) => query._id.$in.includes(String(doc._id))),
    }));
    vi.spyOn(CyberiaEntityTypeDefaultModel, 'findByIdAndDelete').mockImplementation(async (id) => {
      const doc = docs.get(String(id));
      docs.delete(String(id));
      return doc;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('unlinks a default from every conf before deleting it', async () => {
    await CyberiaEntityTypeDefaultService.delete({ params: { id: String(CAVERN_BOT._id) } }, null, options);
    // The document is gone and no conf still points at it — which is the only way this
    // collection produced orphans.
    expect(docs.has(String(CAVERN_BOT._id))).toBe(false);
    expect(confs.get('c1').entityDefaults).toEqual([String(FOREST_BOT._id)]);
    expect(confs.get('c2').entityDefaults).toEqual([]);
  });

  it('drops a reference whose document vanished behind its back', async () => {
    // A document removed straight from the collection, leaving both confs dangling.
    docs.delete(String(CAVERN_BOT._id));
    const compacted = await CyberiaEntityTypeDefaultService.compactInstanceRefs(options);
    expect(compacted).toEqual([
      { instanceCode: 'forest', dropped: [String(CAVERN_BOT._id)] },
      { instanceCode: 'cavern', dropped: [String(CAVERN_BOT._id)] },
    ]);
    expect(confs.get('c1').entityDefaults).toEqual([String(FOREST_BOT._id)]);
    expect(confs.get('c2').entityDefaults).toEqual([]);
  });

  it('compacts only the instance it is scoped to', async () => {
    docs.delete(String(CAVERN_BOT._id));
    const compacted = await CyberiaEntityTypeDefaultService.compactInstanceRefs(options, { instanceCode: 'cavern' });
    expect(compacted.map((entry) => entry.instanceCode)).toEqual(['cavern']);
    expect(confs.get('c1').entityDefaults).toHaveLength(2);
  });

  it('leaves a consistent collection untouched', async () => {
    expect(await CyberiaEntityTypeDefaultService.compactInstanceRefs(options)).toEqual([]);
    expect(confs.get('c1').entityDefaults).toHaveLength(2);
  });
});

describe('syncing an instance to the defaults its maps place', () => {
  const options = { host: 'entity-default-test', path: '/' };
  let docs;
  let confs;
  let maps;
  let actions;
  let quests;

  // A purple bot carrying the pistol matches both the bare-purple default and the armed one;
  // the runtime resolves the most specific, and the sync must reference both so it can.
  const ARMED_BOT = { _id: new Types.ObjectId(), entityType: 'bot', liveItemIds: ['purple', 'atlas_pistol_mk2'] };
  const PLAYER = { _id: new Types.ObjectId(), entityType: 'player', liveItemIds: ['anon'], inventoryItemsIds: ['coin'] };
  // What the collection defines: a skill for a trigger the world carries, and one for a trigger
  // nothing in it does.
  const SKILLS = [
    { triggerItemId: 'atlas_pistol_mk2', logicEventIds: ['projectile'] },
    { triggerItemId: 'coin', logicEventIds: ['coin_drop_or_transaction'] },
    { triggerItemId: 'hatchet', logicEventIds: ['projectile'] },
  ];

  const model = (store, project) => ({
    find: (filter) => ({
      lean: async () => [...store.values()].filter((doc) => !filter?.code || filter.code.$in.includes(doc.code)),
    }),
    findOne: (filter) => ({
      select: () => ({ lean: async () => [...store.values()].find((d) => d.code === filter.code) ?? null }),
    }),
  });

  beforeEach(() => {
    docs = new Map(
      [FOREST_BOT, CAVERN_BOT, ARMED_BOT, PLAYER].map((doc) => [String(doc._id), doc]),
    );
    confs = new Map([
      ['c1', { _id: 'c1', instanceCode: 'forest', entityDefaults: [String(PLAYER._id)] }],
      // Another world already owns its purple bot — same art, same live item ids.
      ['c2', { _id: 'c2', instanceCode: 'cavern', entityDefaults: [String(CAVERN_BOT._id)] }],
    ]);
    maps = new Map([
      ['m1', { _id: 'm1', code: 'm1', entities: [{ entityType: 'bot', objectLayerItemIds: ['purple', 'atlas_pistol_mk2'] }] }],
      ['m2', { _id: 'm2', code: 'm2', entities: [{ entityType: 'floor', objectLayerItemIds: ['grass'] }] }],
    ]);
    actions = [];
    quests = [];
    vi.spyOn(DataBaseProviderService, 'getModel').mockImplementation((name) => {
      switch (name.toLowerCase()) {
        case 'cyberiaentitytypedefault':
          return {
            find: (filter) => ({
              lean: async () =>
                [...docs.values()].filter(
                  (doc) => !filter?._id?.$in || filter._id.$in.includes(String(doc._id)),
                ),
            }),
          };
        case 'cyberiaskill':
          return { find: () => ({ lean: async () => SKILLS }) };
        case 'cyberiaaction':
          return { find: (filter) => ({ lean: async () => actions.filter((a) => filter.sourceMapCode.$in.includes(a.sourceMapCode)) }) };
        case 'cyberiaquest':
          return { find: (filter) => ({ lean: async () => quests.filter((q) => filter.sourceMapCode.$in.includes(q.sourceMapCode)) }) };
        case 'cyberiainstance':
          return model(new Map([['i1', { code: 'forest', cyberiaMapCodes: ['m1'] }]]));
        case 'cyberiamap':
          return model(maps);
        case 'objectlayer':
          // The types a contested equipment slot is settled by; this world's items are unarguable.
          return {
            find: () => ({
              lean: async () =>
                [
                  ['purple', 'skin'],
                  ['atlas_pistol_mk2', 'weapon'],
                  ['grass', 'floor'],
                  ['coin', 'coin'],
                  ['hatchet', 'weapon'],
                ].map(([id, type]) => ({ data: { item: { id, type } } })),
            }),
          };
        case 'cyberiainstanceconf':
          return {
            find: () => ({ lean: async () => [...confs.values()] }),
            updateOne: async ({ _id }, { $set }) => {
              Object.assign(confs.get(String(_id)), $set);
              return { modifiedCount: 1 };
            },
          };
        default:
          throw new Error(`Unexpected model: ${name}`);
      }
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('references every unclaimed default whose live items the maps actually place', async () => {
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    // Both purple defaults match the armed bot by subset containment; only the unclaimed ones
    // are linked.
    expect(result.linked.sort()).toEqual([String(FOREST_BOT._id), String(ARMED_BOT._id)].sort());
    // The hand-linked player default survives: a player is never placed on a map, so a wholesale
    // replace would have discarded it.
    expect(result.entityDefaults).toContain(String(PLAYER._id));
  });

  it('never adopts a default another instance already references', async () => {
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    // The cavern bot matches by item ids — identical live ids to the forest one — and is exactly
    // the cross-instance contamination the reference model exists to prevent.
    expect(result.skipped).toEqual([String(CAVERN_BOT._id)]);
    expect(result.entityDefaults).not.toContain(String(CAVERN_BOT._id));
    expect(confs.get('c2').entityDefaults).toEqual([String(CAVERN_BOT._id)]);
  });

  it('never displaces the default this instance already references with an unowned lookalike', async () => {
    // The reported bug: a second `resource`/`wood-1` document, edited later and referenced by no
    // world, matched the placed wood and was adopted — so the instance ran on, and exported,
    // wiring its operator never linked to it.
    const mine = { _id: new Types.ObjectId(), entityType: 'resource', liveItemIds: ['wood-1'] };
    const stray = {
      _id: new Types.ObjectId(),
      entityType: 'resource',
      liveItemIds: ['wood-1'],
      inventoryItemsIds: ['tim-knife'],
      overrideItemsIdsState: [{ itemId: 'tim-knife', active: true }],
    };
    docs.set(String(mine._id), mine);
    docs.set(String(stray._id), stray);
    confs.get('c1').entityDefaults = [String(mine._id)];
    maps.get('m1').entities.push({ entityType: 'resource', objectLayerItemIds: ['wood-1'] });

    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.conflicts).toEqual([String(stray._id)]);
    expect(result.linked).not.toContain(String(stray._id));
    expect(result.entityDefaults).toContain(String(mine._id));
    expect(result.entityDefaults).not.toContain(String(stray._id));
    // The instance's own reference is untouched, so nothing the stray declares reaches the map.
    const wood = maps.get('m1').entities.find((entity) => entity.entityType === 'resource');
    expect(wood.objectLayerItemIds).toEqual(['wood-1']);
  });

  it('links a lookalike no reference answers for, and only one of them', async () => {
    // The guard is about a build already answered, not about the item ids: with nothing
    // referenced for it, the first match is adopted the way every other match is. The second
    // would only add an ambiguity this sync invented, so it is reported instead.
    const first = { _id: new Types.ObjectId(), entityType: 'resource', liveItemIds: ['wood-1'] };
    const second = { _id: new Types.ObjectId(), entityType: 'resource', liveItemIds: ['wood-1'] };
    docs.set(String(first._id), first);
    docs.set(String(second._id), second);
    maps.get('m1').entities.push({ entityType: 'resource', objectLayerItemIds: ['wood-1'] });

    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.linked).toContain(String(first._id));
    expect(result.conflicts).toEqual([String(second._id)]);
    // The conf never ends up carrying two answers for one build unless an operator put them there.
    expect(result.duplicates).toEqual([]);
  });

  it('withdraws no reference an operator made, however redundant', async () => {
    // Two references for the same build inside one conf is an authoring mistake worth reporting,
    // and still not something to resolve by guessing which the operator meant.
    const a = { _id: new Types.ObjectId(), entityType: 'resource', liveItemIds: ['wood-1'] };
    const b = { _id: new Types.ObjectId(), entityType: 'resource', liveItemIds: ['wood-1'] };
    docs.set(String(a._id), a);
    docs.set(String(b._id), b);
    confs.get('c1').entityDefaults = [String(a._id), String(b._id)];

    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.duplicates).toEqual([String(b._id)]);
    expect(result.entityDefaults).toEqual(expect.arrayContaining([String(a._id), String(b._id)]));
    expect(confs.get('c1').entityDefaults).toEqual(expect.arrayContaining([String(a._id), String(b._id)]));
  });

  it('is idempotent — a second run links nothing new', async () => {
    await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    const again = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(again.linked).toEqual([]);
    expect(again.dropped).toEqual([]);
  });

  it('syncs against the map codes it is given, not only the stored ones', async () => {
    // m2 places nothing any default matches, so an explicit selection links nothing.
    const result = await CyberiaEntityTypeDefaultService.syncInstance(
      { instanceCode: 'forest', mapCodes: ['m2'] },
      options,
    );
    expect(result.mapCodes).toEqual(['m2']);
    expect(result.linked).toEqual([]);
  });

  it('drops a reference whose document is gone while it syncs', async () => {
    const orphan = String(new Types.ObjectId());
    confs.get('c1').entityDefaults = [String(PLAYER._id), orphan];
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.dropped).toEqual([orphan]);
    expect(result.entityDefaults).not.toContain(orphan);
  });

  it('runs the skills its entities trigger, and reports them without storing them', async () => {
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    // atlas_pistol_mk2 is carried by the armed bot this sync linked, and coin by the player
    // default's inventory. hatchet is triggered by nothing this world names.
    expect(result.skills).toEqual(['atlas_pistol_mk2', 'coin']);
    // Nothing is written: the conf owns references, not a second copy of the skill list.
    expect(confs.get('c1')).not.toHaveProperty('skillConfig');
  });

  it('runs a skill only a quest objective names', async () => {
    // The reported case. No entity in this world wears a hatchet and no default wires one, so a
    // rule reading entity loadouts alone called the skill unreachable — while the export shipped
    // it and the simulation ran it, because a player can be handed one to satisfy the quest.
    quests = [
      { sourceMapCode: 'm1', steps: [{ objectives: [{ itemId: 'hatchet' }] }], rewards: [] },
    ];
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.skills).toContain('hatchet');
  });

  it('runs a skill only a vendor or an assembler names', async () => {
    actions = [
      { sourceMapCode: 'm1', shopItems: [{ itemId: 'hatchet', priceItemId: 'coin' }], craftRecipes: [] },
    ];
    expect(
      (await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options)).skills,
    ).toContain('hatchet');

    actions = [
      {
        sourceMapCode: 'm1',
        shopItems: [],
        craftRecipes: [{ ingredients: [{ itemId: 'wood-1' }], outputItems: [{ itemId: 'hatchet' }] }],
      },
    ];
    expect(
      (await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options)).skills,
    ).toContain('hatchet');
  });

  it('leaves out a skill whose trigger nothing in the world names', async () => {
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.skills).not.toContain('hatchet');
  });

  it("ignores content bound to another instance's maps", async () => {
    quests = [{ sourceMapCode: 'elsewhere', steps: [{ objectives: [{ itemId: 'hatchet' }] }], rewards: [] }];
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.skills).not.toContain('hatchet');
  });

  it('keeps a skill whose trigger the canonical defaults supply', async () => {
    // The instance references no player default of its own, so anon/atlas_pistol_mk2 reach it
    // through the canonical set — leaving their skills out would disarm the player.
    confs.get('c1').entityDefaults = [];
    const result = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(result.skills).toContain('atlas_pistol_mk2');
  });

  it('reports the same skills on a second run', async () => {
    const first = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    const again = await CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'forest' }, options);
    expect(again.skills).toEqual(first.skills);
  });

  it('refuses an instance with no conf', async () => {
    await expect(CyberiaEntityTypeDefaultService.syncInstance({ instanceCode: 'absent' }, options)).rejects.toThrow(
      'cyberia-instance-conf not found',
    );
    await expect(CyberiaEntityTypeDefaultService.syncInstance({}, options)).rejects.toThrow('instanceCode is required');
  });
});

describe('one default answers for one set of entities', () => {
  const doc = (id, entityType, liveItemIds) => ({ _id: id, entityType, liveItemIds });

  it('names the second reference that answers for a build, and keeps both', () => {
    // Which of the two applies depends on where the conf lists them, and that is not a decision
    // anyone made — so it is reported. Choosing one by timestamp would throw away a reference an
    // operator deliberately made, which is the more expensive mistake.
    const defaults = [
      doc('mine', 'resource', ['wood-1']),
      doc('theirs', 'resource', ['wood-1']),
      doc('wood-2', 'resource', ['wood-2']),
    ];
    expect(findDuplicateBuilds(['mine', 'theirs', 'wood-2'], defaults)).toEqual(['theirs']);
  });

  it('leaves a genuinely more specific default alone', () => {
    // An armed bot requires a larger set than a bare one: different keys, both meaningful.
    const defaults = [
      doc('bare', 'bot', ['kishins']),
      doc('armed', 'bot', ['kishins', 'atlas_pistol_mk2']),
    ];
    expect(findDuplicateBuilds(['bare', 'armed'], defaults)).toEqual([]);
  });

  it('reads the same set in any order, and says nothing about a reference whose document is gone', () => {
    const defaults = [
      doc('a', 'bot', ['purple', 'atlas_pistol_mk2']),
      doc('b', 'bot', ['atlas_pistol_mk2', 'purple']),
    ];
    expect(findDuplicateBuilds(['a', 'b'], defaults)).toEqual(['b']);
    // A reference the collection no longer has is the `dropped` path's business, not this one.
    expect(findDuplicateBuilds(['ghost'], defaults)).toEqual([]);
  });
});

describe('placed entities carry what their default wears', () => {
  const defaults = [
    {
      entityType: 'resource',
      liveItemIds: ['wood-1'],
      deadItemIds: ['wood-extracted-1'],
      dropItemIds: ['wood-drop-1'],
      inventoryItemsIds: ['tim-knife'],
      overrideItemsIdsState: [
        { itemId: 'wood-drop-1', active: false, quantity: 2, dropChance: 1 },
        { itemId: 'tim-knife', active: true, quantity: 1, dropChance: 1 },
      ],
    },
    { entityType: 'resource', liveItemIds: ['wood-2'], deadItemIds: ['wood-extracted-2'], dropItemIds: ['wood-drop-2'] },
  ];
  const itemTypes = { 'wood-1': 'resource', 'wood-2': 'resource', 'tim-knife': 'weapon' };
  const entity = (objectLayerItemIds) => ({ entityType: 'resource', objectLayerItemIds });

  it('adds what an override activates to the entity that resolves to it', () => {
    const { entities, changed } = applyDefaultsToEntities([entity(['wood-1'])], defaults, itemTypes);
    expect(entities[0].objectLayerItemIds).toEqual(['wood-1', 'tim-knife']);
    expect(changed).toBe(1);
  });

  it('leaves an entity whose own default carries nothing extra', () => {
    const { entities, changed } = applyDefaultsToEntities([entity(['wood-2'])], defaults, itemTypes);
    expect(entities[0].objectLayerItemIds).toEqual(['wood-2']);
    expect(changed).toBe(0);
  });

  it('replaces what a matched entity carries, keeping nothing else', () => {
    // The map holds the projection of a default, not a scrapbook: an id no default names cannot be
    // told apart from one an earlier sync wrote, so a matched entity is stated whole.
    const { entities } = applyDefaultsToEntities([entity(['wood-1', 'banner'])], defaults, itemTypes);
    expect(entities[0].objectLayerItemIds).toEqual(['wood-1', 'tim-knife']);
  });

  it('takes an item back off the world when the default stops naming it', () => {
    const once = applyDefaultsToEntities([entity(['wood-1'])], defaults, itemTypes);
    expect(once.entities[0].objectLayerItemIds).toEqual(['wood-1', 'tim-knife']);
    expect(applyDefaultsToEntities(once.entities, defaults, itemTypes).changed).toBe(0);

    // The override withdrawn: still carried by the default, no longer worn.
    const unworn = defaults.map((entry, index) =>
      index === 0 ? { ...entry, overrideItemsIdsState: [{ itemId: 'tim-knife', active: false }] } : entry,
    );
    expect(applyDefaultsToEntities(once.entities, unworn, itemTypes).entities[0].objectLayerItemIds).toEqual([
      'wood-1',
    ]);

    // The item removed from the default outright — the case a merge could never undo.
    const gone = defaults.map((entry, index) =>
      index === 0 ? { ...entry, inventoryItemsIds: [], overrideItemsIdsState: [] } : entry,
    );
    const cleaned = applyDefaultsToEntities(once.entities, gone, itemTypes);
    expect(cleaned.entities[0].objectLayerItemIds).toEqual(['wood-1']);
    expect(cleaned.changed).toBe(1);
    expect(applyDefaultsToEntities(cleaned.entities, gone, itemTypes).changed).toBe(0);
  });

  it('leaves an entity that carries no default’s live set exactly as placed', () => {
    // resolveEntityDefaultBuild answers with the first of the type when nothing contains, which
    // describes the type rather than this entity — not something to rewrite an author's work with.
    const { entities, changed } = applyDefaultsToEntities([entity(['wood-9'])], defaults, itemTypes);
    expect(entities[0].objectLayerItemIds).toEqual(['wood-9']);
    expect(changed).toBe(0);
  });

  it('resolves the most specific default, the way the simulation does at spawn', () => {
    const armed = [
      { entityType: 'bot', liveItemIds: ['purple'], inventoryItemsIds: ['coin'] },
      {
        entityType: 'bot',
        liveItemIds: ['purple', 'atlas_pistol_mk2'],
        inventoryItemsIds: ['hatchet'],
        overrideItemsIdsState: [{ itemId: 'hatchet', active: true }],
      },
    ];
    const { entities } = applyDefaultsToEntities(
      [{ entityType: 'bot', objectLayerItemIds: ['purple', 'atlas_pistol_mk2'] }],
      armed,
      { purple: 'skin', atlas_pistol_mk2: 'weapon', hatchet: 'weapon' },
    );
    // The larger live set wins, and its hatchet joins. The pistol stays because it is half of the
    // key this entity resolves by — which of the two weapons is worn is settled at spawn.
    expect(entities[0].objectLayerItemIds).toEqual(['purple', 'atlas_pistol_mk2', 'hatchet']);
    // And it holds still: a second pass resolves the same default and writes the same set.
    expect(applyDefaultsToEntities(entities, armed, { purple: 'skin', atlas_pistol_mk2: 'weapon', hatchet: 'weapon' }).changed).toBe(0);
  });

  it('leaves an entity type no default covers alone', () => {
    const { entities, changed } = applyDefaultsToEntities(
      [{ entityType: 'portal', objectLayerItemIds: ['portal-gate'] }],
      defaults,
      itemTypes,
    );
    expect(entities[0].objectLayerItemIds).toEqual(['portal-gate']);
    expect(changed).toBe(0);
  });
});

describe('the canonical inventory contract', () => {
  it('carries the union of every list an entity default names, once each', () => {
    const inventory = resolveEntityInventory({
      liveItemIds: ['skin', 'weapon'],
      deadItemIds: ['ghost', 'skin'],
      dropItemIds: ['loot'],
      inventoryItemsIds: ['coin', 'weapon'],
    });
    // One slot per id, in list order: live, then dead, then drop, then the inventory-only extras.
    expect(inventory.map((row) => row.itemId)).toEqual(['skin', 'weapon', 'ghost', 'loot', 'coin']);
  });

  it('derives activation from the discriminator, never from a stored flag', () => {
    const inventory = resolveEntityInventory({
      liveItemIds: ['skin'],
      deadItemIds: ['ghost'],
      dropItemIds: ['loot'],
      inventoryItemsIds: ['coin'],
    });
    // Spawn state is alive, so the live ids are the worn ones. Inventory-only ids are stock the
    // entity holds, so they start as one unit a player can bank. Dead and drop ids are lifecycle
    // slots carried empty, which is what lets the runtime activate one instead of appending it.
    expect(inventory).toEqual([
      { itemId: 'skin', active: true, quantity: 1, dropChance: 1 },
      { itemId: 'ghost', active: false, quantity: 0, dropChance: 1 },
      { itemId: 'loot', active: false, quantity: 0, dropChance: 1 },
      { itemId: 'coin', active: false, quantity: 1, dropChance: 1 },
    ]);
  });

  it('gives every canonical default an inventory that covers its own lifecycle ids', () => {
    for (const entityDefault of ENTITY_TYPE_DEFAULTS) {
      const carried = new Set(resolveEntityInventory(entityDefault).map((row) => row.itemId));
      for (const id of [
        ...(entityDefault.liveItemIds || []),
        ...(entityDefault.deadItemIds || []),
        ...(entityDefault.dropItemIds || []),
        ...(entityDefault.inventoryItemsIds || []),
      ]) {
        expect(carried.has(id), `${entityDefault.entityType} must carry ${id}`).toBe(true);
      }
    }
  });

  it('forces the spawn state of a carried id', () => {
    const inventory = resolveEntityInventory({
      liveItemIds: ['skin'],
      deadItemIds: ['ghost'],
      overrideItemsIdsState: [{ itemId: 'ghost', active: true }],
    });
    // The equipment rules would leave a dead id inactive; the override says otherwise, and the
    // quantity follows the state it lands in.
    expect(inventory).toEqual([
      { itemId: 'skin', active: true, quantity: 1, dropChance: 1 },
      { itemId: 'ghost', active: true, quantity: 1, dropChance: 1 },
    ]);
  });

  it('sizes a drop stack without activating it', () => {
    const [, drop] = resolveEntityInventory({
      liveItemIds: ['wood'],
      dropItemIds: ['wood-drop'],
      overrideItemsIdsState: [{ itemId: 'wood-drop', quantity: 5 }],
    });
    // The stack the server scatters, still carried inactive by the resource itself.
    expect(drop).toEqual({ itemId: 'wood-drop', active: false, quantity: 5, dropChance: 1 });
  });

  it('states how often every row drops, and defaults to always', () => {
    // One field on every row, so the simulation never reads a missing one. A world that authored
    // nothing keeps scattering everything, which is what every world did before this existed.
    const inventory = resolveEntityInventory({
      liveItemIds: ['skin'],
      dropItemIds: ['common', 'rare'],
      overrideItemsIdsState: [{ itemId: 'rare', dropChance: 0.15 }],
    });
    expect(inventory.map(({ itemId, dropChance }) => [itemId, dropChance])).toEqual([
      ['skin', 1],
      ['common', 1],
      ['rare', 0.15],
    ]);
  });

  it('keeps a drop chance of zero, which is the whole point of authoring one', () => {
    const [drop] = resolveEntityInventory({
      dropItemIds: ['never'],
      overrideItemsIdsState: [{ itemId: 'never', dropChance: 0 }],
    });
    expect(drop.dropChance).toBe(0);
  });

  it('honours a drop chance only for an id the drop list carries', () => {
    // Drop chance answers "how often does this scatter on death". An id that never scatters has
    // no such question to answer, so an override naming one is inert rather than misleading.
    const inventory = resolveEntityInventory({
      liveItemIds: ['skin'],
      inventoryItemsIds: ['knife'],
      dropItemIds: ['loot'],
      overrideItemsIdsState: [
        { itemId: 'skin', dropChance: 0.1 },
        { itemId: 'knife', dropChance: 0.2 },
        { itemId: 'loot', dropChance: 0.3 },
      ],
    });
    expect(inventory.map(({ itemId, dropChance }) => [itemId, dropChance])).toEqual([
      ['skin', 1],
      ['loot', 0.3],
      ['knife', 1],
    ]);
  });

  it('clamps an out-of-range drop chance instead of passing it on', () => {
    const rows = resolveEntityInventory({
      dropItemIds: ['low', 'high'],
      overrideItemsIdsState: [
        { itemId: 'low', dropChance: -2 },
        { itemId: 'high', dropChance: 4 },
      ],
    });
    expect(rows.map((row) => row.dropChance)).toEqual([0, 1]);
  });

  it('ignores an override for an id no list carries', () => {
    // Membership is the union's to decide; an override only adjusts a member, so a rule naming an
    // id no list carries does nothing at all.
    expect(
      resolveEntityInventory({ liveItemIds: ['skin'], overrideItemsIdsState: [{ itemId: 'absent', quantity: 9 }] }),
    ).toEqual([{ itemId: 'skin', active: true, quantity: 1, dropChance: 1 }]);
    expect(
      resolveEntityInventory(
        { liveItemIds: ['skin'], overrideItemsIdsState: [{ itemId: 'absent', active: true }] },
        { itemTypes: { skin: 'skin', absent: 'skin' } },
      ),
    ).toEqual([{ itemId: 'skin', active: true, quantity: 1, dropChance: 1 }]);
  });

  it('puts an overridden carried item on a live entity, whatever its type', () => {
    // A resource whose default carries a knife: the knife is inventory, the override activates it,
    // and a skin and a weapon are different slots, so the equipment rules allow the combination.
    expect(
      resolveEntityInventory(
        {
          entityType: 'resource',
          liveItemIds: ['wood-1'],
          deadItemIds: ['wood-extracted-1'],
          dropItemIds: ['wood-drop-1'],
          inventoryItemsIds: ['tim-knife'],
          overrideItemsIdsState: [
            { itemId: 'wood-drop-1', active: false, quantity: 2, dropChance: 1 },
            { itemId: 'tim-knife', active: true, quantity: 1, dropChance: 1 },
          ],
        },
        { itemTypes: { 'wood-1': 'skin', 'wood-extracted-1': 'skin', 'wood-drop-1': 'weapon', 'tim-knife': 'weapon' } },
      ),
    ).toEqual([
      { itemId: 'wood-1', active: true, quantity: 1, dropChance: 1 },
      { itemId: 'wood-extracted-1', active: false, quantity: 0, dropChance: 1 },
      { itemId: 'wood-drop-1', active: false, quantity: 2, dropChance: 1 },
      { itemId: 'tim-knife', active: true, quantity: 1, dropChance: 1 },
    ]);
  });

  it('gives a contested slot to the item the override names', () => {
    const itemTypes = { anon: 'skin', punk: 'skin', pistol: 'weapon' };
    // One skin at a time: activating a carried skin is a decision about which skin is worn.
    expect(
      resolveEntityInventory(
        { liveItemIds: ['anon', 'pistol'], inventoryItemsIds: ['punk'], overrideItemsIdsState: [{ itemId: 'punk', active: true }] },
        { itemTypes },
      ),
    ).toEqual([
      // Taken off, not taken away: the skin stays in the inventory with its stack intact, which is
      // what lets the player bank it or put it back on.
      { itemId: 'anon', active: false, quantity: 1, dropChance: 1 },
      { itemId: 'pistol', active: true, quantity: 1, dropChance: 1 },
      { itemId: 'punk', active: true, quantity: 1, dropChance: 1 },
    ]);
    // With no types to read, every row keeps the state its list derives.
    expect(
      resolveEntityInventory({
        liveItemIds: ['anon'],
        inventoryItemsIds: ['punk'],
        overrideItemsIdsState: [{ itemId: 'punk', active: true }],
      }).map((row) => row.active),
    ).toEqual([true, true]);
  });

  it('keeps a deactivated skin storable, and an unworn slot empty', () => {
    // The reported player default: an override wears kaneki, so anon comes off — still carried,
    // quantity intact. A dead id nobody wears is a seeded empty slot, and stays one.
    expect(
      resolveEntityInventory(
        {
          entityType: 'player',
          liveItemIds: ['anon', 'atlas_pistol_mk2'],
          deadItemIds: ['fragmentation'],
          inventoryItemsIds: ['kaneki'],
          overrideItemsIdsState: [{ itemId: 'kaneki', active: true, quantity: 1, dropChance: 1 }],
        },
        { itemTypes: { anon: 'skin', kaneki: 'skin', atlas_pistol_mk2: 'weapon', fragmentation: 'skin' } },
      ),
    ).toEqual([
      { itemId: 'anon', active: false, quantity: 1, dropChance: 1 },
      { itemId: 'atlas_pistol_mk2', active: true, quantity: 1, dropChance: 1 },
      { itemId: 'fragmentation', active: false, quantity: 0, dropChance: 1 },
      { itemId: 'kaneki', active: true, quantity: 1, dropChance: 1 },
    ]);
  });

  it('leaves a type the rules do not govern alone', () => {
    // Two resource visuals are not equipment; nothing contests a slot neither of them claims.
    expect(
      resolveEntityInventory(
        { liveItemIds: ['wood-1', 'wood-2'] },
        { itemTypes: { 'wood-1': 'resource', 'wood-2': 'resource' } },
      ).map((row) => row.active),
    ).toEqual([true, true]);
  });

  it('leaves the derived state alone where an override says nothing', () => {
    const inventory = resolveEntityInventory({
      liveItemIds: ['skin'],
      inventoryItemsIds: ['coin'],
      overrideItemsIdsState: [{ itemId: 'coin', quantity: 250 }],
    });
    // Quantity only: coin stays inactive, as its list derives.
    expect(inventory.at(-1)).toEqual({ itemId: 'coin', active: false, quantity: 250, dropChance: 1 });
  });

  it('resolves nothing for a default that names no ids', () => {
    expect(resolveEntityInventory({})).toEqual([]);
    expect(resolveEntityInventory({ liveItemIds: [], deadItemIds: [] })).toEqual([]);
  });
});

describe('CyberiaInstanceConf.entityDefaults', () => {
  it('stores references and refuses an embedded document', () => {
    const id = new Types.ObjectId();
    const conf = new CyberiaInstanceConfModel({ instanceCode: 'forest', entityDefaults: [String(id)] });
    expect(conf.validateSync()).toBe(undefined);
    expect(conf.entityDefaults.map(String)).toEqual([String(id)]);

    // The shape that caused the duplication cannot be stored any more.
    const embedded = new CyberiaInstanceConfModel({
      instanceCode: 'forest',
      entityDefaults: [{ entityType: 'bot', liveItemIds: ['purple'] }],
    });
    expect(embedded.validateSync()?.errors).toHaveProperty('entityDefaults.0');
  });

  it('defaults to referencing nothing, which is a complete world', () => {
    expect(CYBERIA_INSTANCE_CONF_DEFAULTS.entityDefaults).toEqual([]);
    expect(new CyberiaInstanceConfModel({ instanceCode: 'fresh' }).entityDefaults).toEqual([]);
  });
});
