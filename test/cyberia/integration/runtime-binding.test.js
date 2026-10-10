import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  bindItem,
  findBoundDefinitions,
  itemBindingHistory,
  publishItemDefinition,
  unboundItems,
  writeDraftDefinition,
} from '../../../src/projects/cyberia/catalog/object-layer-catalog.js';
import { mongodBinary } from '../../support/mongod.js';
import {
  MODERATOR,
  boundCid,
  cids,
  definitionOf,
  host,
  models,
  rejection,
  startEngine,
  stopEngine,
} from '../../support/procedural-engine.js';

// The runtime binding on a real MongoDB: the catalog alone moves an item to a definition. A save
// publishes a new revision and binds nothing; a bind names the definition the moderator saw, so a
// concurrent bind answers 409 and changes nothing; the history records every binding.
const revision = (itemId, effect) =>
  publishItemDefinition({
    models: models(),
    payload: { data: { ...definitionOf(itemId), stats: { ...definitionOf(itemId).stats, effect } } },
    options: host,
  });
const bind = (itemId, objectLayerCid, expectedCid, by = MODERATOR) =>
  bindItem({ models: models(), itemId, objectLayerCid, expectedCid, source: 'studio', by, options: host });
const runs = async (itemId) => (await findBoundDefinitions(models(), [itemId])).map(({ cid }) => cid);

describe.skipIf(!mongodBinary)('the runtime binding on a real MongoDB', () => {
  beforeAll(startEngine, 60000);
  afterAll(stopEngine);

  it('keeps the item on its definition while a save publishes a new revision', async () => {
    const saved = await revision('base-skin', 9);
    expect(saved.cid).not.toBe(cids['base-skin']);
    expect(await boundCid('base-skin')).toBe(cids['base-skin']);
    expect(await runs('base-skin')).toEqual([cids['base-skin']]);
  });

  it('moves the item on an explicit bind, and the runtime resolves the new definition', async () => {
    const saved = await revision('base-skin', 9);
    await bind('base-skin', saved.cid, cids['base-skin']);
    expect(await runs('base-skin')).toEqual([saved.cid]);
    const { history, definitions } = await itemBindingHistory(models(), 'base-skin');
    expect(history[0]).toMatchObject({ objectLayerCid: saved.cid, previousCid: cids['base-skin'], source: 'studio' });
    expect(definitions.map(({ cid }) => cid)).toEqual(expect.arrayContaining([saved.cid, cids['base-skin']]));
    await bind('base-skin', cids['base-skin'], saved.cid);
  });

  it('answers 409 to the second of two moderators who saw the same definition, and keeps the first bind', async () => {
    const [first, second] = [await revision('violet-skin', 11), await revision('violet-skin', 12)];
    await bind('violet-skin', first.cid, cids['violet-skin'], 'moderator-a');
    const error = await rejection(bind('violet-skin', second.cid, cids['violet-skin'], 'moderator-b'));
    expect(error).toMatchObject({ status: 409 });
    expect(await boundCid('violet-skin')).toBe(first.cid);
    const { history } = await itemBindingHistory(models(), 'violet-skin');
    expect(history.map(({ by }) => by)).toEqual(['moderator-a', '']);
  });

  it('binds a new item once: binding it again is a no-op, another definition answers 409', async () => {
    const created = await publishItemDefinition({
      models: models(),
      payload: { data: definitionOf('generated-skin-001') },
      options: host,
    });
    expect(await boundCid('generated-skin-001')).toBeUndefined();
    await bind('generated-skin-001', created.cid, null);
    expect(await runs('generated-skin-001')).toEqual([created.cid]);
    await expect(bind('generated-skin-001', created.cid, null)).resolves.toMatchObject({ objectLayerCid: created.cid });
    expect(await rejection(bind('generated-skin-001', cids['base-skin'], null))).toMatchObject({ status: 409 });
  });

  it('offers an item with a published definition and no binding to Add binding, until it is bound', async () => {
    const offered = async (q) => (await unboundItems(models(), { q })).map(({ itemId }) => itemId);
    const created = await publishItemDefinition({
      models: models(),
      payload: { data: definitionOf('unbound-skin-001') },
      options: host,
    });
    await writeDraftDefinition({
      models: models(),
      payload: { data: definitionOf('unbound-skin-002') },
      options: host,
    });
    expect(await unboundItems(models(), { q: 'UNBOUND-SKIN' })).toEqual([
      { itemId: 'unbound-skin-001', itemType: 'skin', definitions: 1 },
    ]);
    expect(await offered('base-skin')).toEqual([]);
    await bind('unbound-skin-001', created.cid, '');
    expect(await offered('unbound-skin')).toEqual([]);
  });

  it('lets several items run one definition', async () => {
    await bind('alias-skin', cids['base-skin'], null);
    expect(await runs('alias-skin')).toEqual([cids['base-skin']]);
    expect(await runs('base-skin')).toEqual([cids['base-skin']]);
  });
});
