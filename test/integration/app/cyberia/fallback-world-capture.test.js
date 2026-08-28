'use strict';

import { expect } from 'chai';

import { generateFallbackWorld } from '../../../../src/api/cyberia-instance/cyberia-fallback-world.js';
import {
  planFallbackCapture,
  captureFallbackWorld,
  captureMapCode,
} from '../../../../src/api/cyberia-instance/cyberia-fallback-capture.js';
import {
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
  DefaultSkillConfig,
  ENTITY_TYPE_DEFAULTS,
} from '../../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';

const INSTANCE_CODE = 'CAPTURE-TEST';

// ── Minimal in-memory stand-ins for the Mongoose models the capture writes ───
// Only the query shapes cyberia-fallback-capture.js actually issues are
// supported: equality filters, `$in`, `$nin` and `$regex` on `code`.

const matchesValue = (docValue, expected) => {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (expected.$in && !expected.$in.includes(docValue)) return false;
    if (expected.$nin && expected.$nin.includes(docValue)) return false;
    if (expected.$regex && !expected.$regex.test(String(docValue ?? ''))) return false;
    return true;
  }
  if (Array.isArray(expected)) return JSON.stringify(docValue ?? []) === JSON.stringify(expected);
  return docValue === expected;
};

const readPath = (doc, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), doc);

const matchesFilter = (doc, filter) =>
  Object.entries(filter).every(([key, expected]) => matchesValue(readPath(doc, key), expected));

class FakeModel {
  constructor(docs = []) {
    this.docs = docs.map((doc) => ({ ...doc }));
    this.upserts = 0;
    this.inserts = 0;
  }
  find(filter = {}) {
    return { lean: async () => this.docs.filter((doc) => matchesFilter(doc, filter)) };
  }
  findOne(filter = {}) {
    return { lean: async () => this.docs.find((doc) => matchesFilter(doc, filter)) || null };
  }
  async findOneAndUpdate(filter, update, options = {}) {
    this.upserts++;
    let doc = this.docs.find((entry) => matchesFilter(entry, filter));
    if (!doc) {
      if (!options.upsert) return null;
      doc = { _id: `id-${this.docs.length + 1}`, ...filter, ...(update.$setOnInsert || {}) };
      this.docs.push(doc);
    }
    Object.assign(doc, update.$set || {});
    return doc;
  }
  async create(doc) {
    this.inserts++;
    this.docs.push({ _id: `id-${this.docs.length + 1}`, ...doc });
    return doc;
  }
  async deleteMany(filter = {}) {
    const kept = this.docs.filter((doc) => !matchesFilter(doc, filter));
    const deletedCount = this.docs.length - kept.length;
    this.docs = kept;
    return { deletedCount };
  }
}

const buildModels = ({ objectLayerItemIds = [], seeded = {} } = {}) => ({
  CyberiaInstance: new FakeModel(seeded.instances),
  CyberiaInstanceConf: new FakeModel(seeded.confs),
  CyberiaMap: new FakeModel(seeded.maps),
  CyberiaAction: new FakeModel(seeded.actions),
  CyberiaQuest: new FakeModel(seeded.quests),
  CyberiaSkill: new FakeModel(seeded.skills),
  CyberiaEntityTypeDefault: new FakeModel(seeded.entityTypeDefaults),
  CyberiaDialogue: new FakeModel(seeded.dialogues),
  ObjectLayer: new FakeModel(objectLayerItemIds.map((id) => ({ data: { item: { id } } }))),
});

describe('planFallbackCapture', () => {
  const world = generateFallbackWorld();
  const plan = planFallbackCapture({ world, instanceCode: INSTANCE_CODE });

  it('namespaces every map code under the instance code', () => {
    expect(plan.maps.map((m) => m.code)).to.deep.equal(world.maps.map((m) => captureMapCode(m.code, INSTANCE_CODE)));
    expect(plan.instance.cyberiaMapCodes).to.deep.equal(plan.maps.map((m) => m.code));
    for (const code of plan.instance.cyberiaMapCodes) expect(code).to.not.include('fallback-map-');
  });

  it('rewrites portal edges and the player spawn onto the captured map codes', () => {
    const captured = new Set(plan.instance.cyberiaMapCodes);
    expect(plan.instance.portals.length).to.equal(world.instance.portals.length);
    for (const portal of plan.instance.portals) {
      expect(captured.has(portal.sourceMapCode), portal.sourceMapCode).to.equal(true);
      expect(captured.has(portal.targetMapCode), portal.targetMapCode).to.equal(true);
    }
    expect(captured.has(plan.instance.playerSpawn.sourceMapCode)).to.equal(true);
    expect(plan.instance.playerSpawn.sourceCellX).to.equal(world.instance.playerSpawn.sourceCellX);
  });

  it('carries every generated entity onto the captured maps', () => {
    for (const [index, map] of plan.maps.entries()) {
      expect(map.entities.length).to.equal(world.maps[index].entities.length);
    }
  });

  it('keeps action and quest cross-references internally consistent', () => {
    expect(plan.actions.length).to.equal(DefaultCyberiaActions.length);
    expect(plan.quests.length).to.equal(DefaultCyberiaQuests.length);

    const questCodes = new Set(plan.quests.map((q) => q.code));
    const mapCodes = new Set(plan.instance.cyberiaMapCodes);

    for (const action of plan.actions) {
      expect(mapCodes.has(action.sourceMapCode), action.code).to.equal(true);
      for (const entry of action.questDialogueCodes || []) {
        expect(questCodes.has(entry.questCode), entry.questCode).to.equal(true);
      }
    }
    for (const quest of plan.quests) {
      expect(mapCodes.has(quest.sourceMapCode), quest.code).to.equal(true);
      for (const code of [...(quest.prerequisiteCodes || []), ...(quest.unlocksQuestCodes || [])]) {
        expect(questCodes.has(code), code).to.equal(true);
      }
    }
  });

  it('drops mission content bound to maps outside the captured world', () => {
    const foreign = { code: 'foreign-action', sourceMapCode: 'some-other-map' };
    const foreignQuest = { code: 'foreign-quest', sourceMapCode: 'some-other-map', steps: [] };
    const out = planFallbackCapture({
      world,
      instanceCode: INSTANCE_CODE,
      actions: [...DefaultCyberiaActions, foreign],
      quests: [...DefaultCyberiaQuests, foreignQuest],
    });
    expect(out.skippedActionCodes).to.deep.equal(['foreign-action']);
    expect(out.skippedQuestCodes).to.deep.equal(['foreign-quest']);
    expect(out.actions.some((a) => a.code.endsWith('foreign-action'))).to.equal(false);
  });

  it('collects every item id the captured world places or names in a catalog', () => {
    const itemIds = new Set(plan.itemIds);
    for (const map of plan.maps) {
      for (const entity of map.entities) {
        for (const id of entity.objectLayerItemIds || []) expect(itemIds.has(id), id).to.equal(true);
      }
    }
    // Assembler output: named only by a craft recipe, worn by no entity.
    expect(itemIds.has('hatchet')).to.equal(true);
    // Vendor stock and its price item.
    expect(itemIds.has('tim-knife')).to.equal(true);
    expect(itemIds.has('coin')).to.equal(true);
    // Runtime placeholders never reach the atlas resolver.
    expect(plan.itemIds.some((id) => id.startsWith('$'))).to.equal(false);
  });

  it('stamps the instance code onto a fully defaulted conf document', () => {
    expect(plan.conf.instanceCode).to.equal(INSTANCE_CODE);
    expect(plan.conf.tickRate).to.equal(world.config.tickRate);
    expect(plan.conf.entityDefaults).to.be.an('array').that.is.not.empty;
    expect(plan.conf.equipmentRules).to.be.an('object');
  });

  it('keeps the canonical codes verbatim under keepFallbackCodes', () => {
    const kept = planFallbackCapture({ world, instanceCode: INSTANCE_CODE, keepFallbackCodes: true });
    expect(kept.instance.cyberiaMapCodes).to.deep.equal(world.instance.cyberiaMapCodes);
    expect(kept.actions.map((a) => a.code)).to.deep.equal(DefaultCyberiaActions.map((a) => a.code));
    expect(kept.quests.map((q) => q.code)).to.deep.equal(DefaultCyberiaQuests.map((q) => q.code));
    expect(kept.instance.code).to.equal(INSTANCE_CODE);
  });

  it('rejects an instance code or world it cannot capture', () => {
    expect(() => planFallbackCapture({ world, instanceCode: '' })).to.throw(/instanceCode/);
    expect(() => planFallbackCapture({ world: {}, instanceCode: INSTANCE_CODE })).to.throw(/invalid world/);
  });
});

describe('captureFallbackWorld', () => {
  const world = generateFallbackWorld();
  const plan = planFallbackCapture({ world, instanceCode: INSTANCE_CODE });

  const run = async (overrides = {}) => {
    const models = buildModels({ objectLayerItemIds: plan.itemIds, ...overrides });
    const result = await captureFallbackWorld({ models, world, instanceCode: INSTANCE_CODE });
    return { models, result };
  };

  it('writes the instance, conf, maps and mission content', async () => {
    const { models, result } = await run();

    expect(models.CyberiaMap.docs.map((m) => m.code)).to.deep.equal(plan.maps.map((m) => m.code));
    expect(models.CyberiaAction.docs.length).to.equal(plan.actions.length);
    expect(models.CyberiaQuest.docs.length).to.equal(plan.quests.length);

    const [instanceDoc] = models.CyberiaInstance.docs;
    expect(instanceDoc.code).to.equal(INSTANCE_CODE);
    expect(instanceDoc.status).to.equal('unlisted');
    expect(instanceDoc.conf).to.equal(models.CyberiaInstanceConf.docs[0]._id);
    expect(instanceDoc.cyberiaMapCodes).to.deep.equal(plan.instance.cyberiaMapCodes);
    expect(models.CyberiaInstanceConf.docs[0].instanceCode).to.equal(INSTANCE_CODE);
    expect(result.missingObjectLayerItemIds).to.deep.equal([]);
  });

  it('inserts the content defaults the in-memory world serves from code', async () => {
    const { models, result } = await run();
    expect(result.inserted.skills).to.equal(DefaultSkillConfig.length);
    expect(result.inserted.entityTypeDefaults).to.equal(ENTITY_TYPE_DEFAULTS.length);
    expect(result.inserted.dialogues).to.be.greaterThan(0);
    expect(models.CyberiaSkill.docs.length).to.equal(DefaultSkillConfig.length);
  });

  it('never overwrites content defaults that already exist', async () => {
    const edited = { triggerItemId: DefaultSkillConfig[0].triggerItemId, logicEventIds: [], skills: [] };
    const { models, result } = await run({ seeded: { skills: [edited] } });
    expect(result.inserted.skills).to.equal(DefaultSkillConfig.length - 1);
    expect(models.CyberiaSkill.docs.find((d) => d.triggerItemId === edited.triggerItemId).skills).to.deep.equal([]);
  });

  it('is idempotent — a second capture converges on the same documents', async () => {
    const models = buildModels({ objectLayerItemIds: plan.itemIds });
    await captureFallbackWorld({ models, world, instanceCode: INSTANCE_CODE });
    const first = JSON.stringify(models.CyberiaMap.docs);
    const second = await captureFallbackWorld({ models, world, instanceCode: INSTANCE_CODE });

    expect(models.CyberiaInstance.docs.length).to.equal(1);
    expect(models.CyberiaMap.docs.length).to.equal(plan.maps.length);
    expect(JSON.stringify(models.CyberiaMap.docs)).to.equal(first);
    expect(second.inserted).to.deep.equal({ skills: 0, entityTypeDefaults: 0, dialogues: 0 });
  });

  it('prunes documents left in its own namespace by a wider previous capture', async () => {
    const stale = { code: `${INSTANCE_CODE}-map-99` };
    const foreign = { code: 'FOREST-A' };
    const { models, result } = await run({ seeded: { maps: [stale, foreign] } });
    expect(result.pruned.maps).to.equal(1);
    expect(models.CyberiaMap.docs.some((m) => m.code === stale.code)).to.equal(false);
    expect(models.CyberiaMap.docs.some((m) => m.code === foreign.code)).to.equal(true);
  });

  it('reports item ids that have no ObjectLayer instead of writing a broken backup', async () => {
    const { result } = await run({ objectLayerItemIds: plan.itemIds.filter((id) => id !== 'coin') });
    expect(result.missingObjectLayerItemIds).to.deep.equal(['coin']);
  });
});
