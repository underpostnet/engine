import { describe, it, expect } from 'vitest';
import { fetchInstanceObjectLayerItemIds } from '../../src/projects/cyberia/instance-data.js';

const lean = (value) => ({ lean: async () => value, populate: () => lean(value) });

const buildModels = ({ instance, maps = [], storedItemIds = [] }) => ({
  CyberiaInstance: { findOne: () => lean(instance) },
  CyberiaInstanceConf: { findOne: () => lean({ instanceCode: instance?.code, entityDefaults: [] }) },
  CyberiaMap: { find: () => lean(maps) },
  CyberiaEntityTypeDefault: { find: () => lean([]) },
  CyberiaAction: { find: () => lean([]) },
  CyberiaQuest: { find: () => lean([]) },
  CyberiaSkill: { find: () => lean([]) },
  ObjectLayer: {
    find: (filter) => {
      const wanted = new Set(filter['data.item.id'].$in);
      return lean(storedItemIds.filter((id) => wanted.has(id)).map((id) => ({ _id: id, data: { item: { id } } })));
    },
  },
});

describe('instance object layer item ids', () => {
  it('collects the item ids the instance maps place, limited to stored documents', async () => {
    const models = buildModels({
      instance: { _id: 'i1', code: 'FOREST', cyberiaMapCodes: ['forest-1'] },
      maps: [
        {
          code: 'forest-1',
          entities: [{ objectLayerItemIds: ['anon', 'hatchet'] }, { objectLayerItemIds: ['hatchet', '$runtime'] }],
        },
      ],
      storedItemIds: ['anon', 'hatchet', 'unrelated'],
    });
    const itemIds = await fetchInstanceObjectLayerItemIds(models, 'FOREST');
    expect(itemIds).toContain('anon');
    expect(itemIds).toContain('hatchet');
    expect(itemIds).not.toContain('unrelated');
    expect(itemIds).not.toContain('$runtime');
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  it('fails on an unknown instance code instead of returning the fallback world', async () => {
    const models = buildModels({ instance: null });
    await expect(fetchInstanceObjectLayerItemIds(models, 'GHOST')).rejects.toThrow('"GHOST" not found');
  });
});
