import { describe, it, expect } from 'vitest';
import {
  PINNED_REFERENCES,
  collectPinnedCids,
  pinContentReferences,
  readItemRefs,
} from '../../../src/api/cyberia-item-catalog/item-ref.js';

const CID_A = 'bafkreibemx5yh25wpe44h2lmi2p3q7iexxa7ps532icfif34u2ebdjm7mq';
const CID_B = 'bafkreigq7pcfkqgq5na55eoyizggukvov6ovx2tsve2ot537vgs3s7r42i';

const quest = (overrides = {}) => ({
  code: 'first-blood',
  steps: [{ id: 's1', objectives: [{ type: 'collect', itemId: 'hatchet', objectLayerCid: CID_A }] }],
  rewards: [{ itemId: 'coin' }],
  ...overrides,
});

const action = () => ({
  code: 'shop',
  shopItems: [{ itemId: 'hatchet', priceItemId: 'coin' }],
  craftRecipes: [{ outputItems: [{ itemId: 'plank' }], ingredients: [{ itemId: 'wood' }] }],
});

describe('pinned content references', () => {
  it('declares every path that names a definition', () => {
    expect(readItemRefs(quest(), PINNED_REFERENCES.CyberiaQuest).map((r) => [r.itemId, r.cid])).toEqual([
      ['hatchet', CID_A],
      ['coin', ''],
    ]);
    expect(readItemRefs(action(), PINNED_REFERENCES.CyberiaAction).map((r) => r.itemId)).toEqual([
      'hatchet',
      'coin',
      'plank',
      'wood',
    ]);
  });

  it('collects the definitions content pins, by label', () => {
    const pinned = collectPinnedCids([quest()], PINNED_REFERENCES.CyberiaQuest);
    expect([...pinned]).toEqual([['hatchet', new Set([CID_A])]]);
  });

  it('reports a label two documents pin to different definitions', () => {
    const other = quest({ code: 'second', steps: [{ id: 's1', objectives: [{ type: 'collect', itemId: 'hatchet', objectLayerCid: CID_B }] }] });
    const pinned = collectPinnedCids([quest(), other], PINNED_REFERENCES.CyberiaQuest);
    expect(pinned.get('hatchet')).toEqual(new Set([CID_A, CID_B]));
  });
});

// A collection of documents that remembers what was saved.
const stubCollection = (documents) => {
  const saved = [];
  return {
    saved,
    find: async () =>
      documents.map((document) => ({
        ...document,
        markModified() {},
        async save() {
          saved.push(this);
        },
      })),
  };
};

describe('pinContentReferences', () => {
  const catalog = (bindings) => ({
    resolve: async (itemIds) => new Map(itemIds.filter((id) => bindings[id]).map((id) => [id, bindings[id]])),
  });

  it('pins every unpinned reference to the definition its label is bound to', async () => {
    const CyberiaQuest = stubCollection([quest()]);
    const result = await pinContentReferences({
      models: { CyberiaQuest, CyberiaItemCatalog: catalog({ hatchet: CID_B, coin: CID_A }) },
    });
    expect(result.pinned).toBe(1);
    const [saved] = CyberiaQuest.saved;
    // The pinned objective keeps CID A; only the unpinned reward takes a binding.
    expect(saved.steps[0].objectives[0].objectLayerCid).toBe(CID_A);
    expect(saved.rewards[0].objectLayerCid).toBe(CID_A);
  });

  it('is idempotent: a second run pins nothing', async () => {
    const models = { CyberiaQuest: stubCollection([quest({ rewards: [{ itemId: 'coin', objectLayerCid: CID_A }] })]), CyberiaItemCatalog: catalog({ coin: CID_B }) };
    expect((await pinContentReferences({ models })).pinned).toBe(0);
    expect(models.CyberiaQuest.saved).toHaveLength(0);
  });

  it('reports a reference whose label the catalog does not bind', async () => {
    const models = { CyberiaQuest: stubCollection([quest()]), CyberiaItemCatalog: catalog({}) };
    const result = await pinContentReferences({ models });
    expect(result.pinned).toBe(0);
    expect(result.unbound).toEqual([{ collection: 'CyberiaQuest', code: 'first-blood', itemId: 'coin' }]);
  });

  it('pins both the sold item and its currency of a shop entry', async () => {
    const CyberiaAction = stubCollection([action()]);
    await pinContentReferences({
      models: { CyberiaAction, CyberiaItemCatalog: catalog({ hatchet: CID_A, coin: CID_B, plank: CID_A, wood: CID_B }) },
    });
    const [saved] = CyberiaAction.saved;
    expect(saved.shopItems[0]).toMatchObject({ objectLayerCid: CID_A, priceObjectLayerCid: CID_B });
    expect(saved.craftRecipes[0].outputItems[0].objectLayerCid).toBe(CID_A);
    expect(saved.craftRecipes[0].ingredients[0].objectLayerCid).toBe(CID_B);
  });

  it('moves a reference to a replaced definition onto its replacement, once', async () => {
    const CyberiaQuest = stubCollection([quest({ rewards: [{ itemId: 'coin', objectLayerCid: CID_B }] })]);
    const models = { CyberiaQuest, CyberiaItemCatalog: catalog({}) };
    const replacements = new Map([[CID_A, CID_B]]);

    expect((await pinContentReferences({ models, replacements })).pinned).toBe(1);
    const [saved] = CyberiaQuest.saved;
    expect(saved.steps[0].objectives[0].objectLayerCid).toBe(CID_B);
    expect(saved.rewards[0].objectLayerCid).toBe(CID_B);

    const moved = stubCollection([saved]);
    expect((await pinContentReferences({ models: { ...models, CyberiaQuest: moved }, replacements })).pinned).toBe(0);
    expect(moved.saved).toHaveLength(0);
  });

  // The invariant the catalog exists for: rebinding a label never moves pinned content.
  it('leaves a quest on the definition it pinned after the label is rebound', async () => {
    const pinnedQuest = quest({ rewards: [{ itemId: 'coin', objectLayerCid: CID_A }] });
    const models = { CyberiaQuest: stubCollection([pinnedQuest]), CyberiaItemCatalog: catalog({ hatchet: CID_B, coin: CID_B }) };
    await pinContentReferences({ models });
    expect(collectPinnedCids([pinnedQuest], PINNED_REFERENCES.CyberiaQuest).get('hatchet')).toEqual(new Set([CID_A]));
  });
});
