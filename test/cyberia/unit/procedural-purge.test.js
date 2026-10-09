import { describe, it, expect, vi, beforeEach } from 'vitest';

// The leftover revisions of a deleted job, on a host that consumes Object Layer: what goes, what
// stays, and which revisions the authority is asked to purge.
const calls = { authority: [], local: [] };
vi.mock('../../../src/api/object-layer/object-layer.purge.js', () => ({
  purgeObjectLayers: async ({ filter }) => {
    calls.local.push(filter.cid.$in);
    return { objectLayers: filter.cid.$in.length };
  },
}));
vi.mock('../../../src/server/domain/object-layer-resolver.js', () => ({
  purgeObjectLayer: async (cid) => {
    if (cid === 'unreachable') throw Object.assign(new Error('the authority does not answer'), { status: 503 });
    calls.authority.push(cid);
    return {};
  },
  resolveRegisteredCids: async (cids) => new Set(cids.filter((cid) => cid === 'registered')),
}));

const { purgeRevisions } = await import('../../../src/projects/cyberia/procedural/engine.js');

const consumer = { host: 'www.cyberiaonline.com', path: '/', consumes: { 'object-layer': 'object-layer' } };
const authority = { host: 'objectlayer.org', path: '/', consumes: {} };

/** Fake models: `distinct` answers the values of a field among the CIDs a query names. */
const modelsOf = ({ otherJobs = [], bound = [], history = [], published = [] } = {}) => {
  const among = (values) => (field, query) => values.filter((cid) => Object.values(query)[0].$in.includes(cid));
  return {
    CyberiaProceduralJobItem: { distinct: async (field, query) => among(otherJobs)(field, query) },
    CyberiaItemCatalog: {
      distinct: async (field, query) => among(field === 'objectLayerCid' ? bound : history)(field, query),
    },
    ObjectLayer: { distinct: async (field, query) => among(published)(field, query) },
  };
};

describe('the leftover revisions of a job', () => {
  beforeEach(() => {
    calls.authority.length = 0;
    calls.local.length = 0;
  });

  it('keeps what an item runs or ran and what another job names, and purges the rest here and at the authority', async () => {
    const models = modelsOf({
      otherJobs: ['shared'],
      bound: ['running'],
      history: ['ran'],
      published: ['published', 'registered'],
    });
    const cids = ['draft', 'published', 'registered', 'running', 'ran', 'shared'];
    expect(await purgeRevisions({ models, options: consumer, cids, besides: 'job' })).toBe(3);
    expect(calls.authority).toEqual(['published']);
    expect(calls.local).toEqual([['draft', 'published', 'registered']]);
  });

  it('asks no authority on the authority itself', async () => {
    const models = modelsOf({ published: ['published'] });
    await purgeRevisions({ models, options: authority, cids: ['draft', 'published'] });
    expect(calls.authority).toEqual([]);
    expect(calls.local).toEqual([['draft', 'published']]);
  });

  it('removes nothing here while the authority does not answer, so a delete can run again', async () => {
    const models = modelsOf({ published: ['unreachable'] });
    await expect(purgeRevisions({ models, options: consumer, cids: ['unreachable'] })).rejects.toThrow(
      /does not answer/,
    );
    expect(calls.local).toEqual([]);
  });
});
