import { describe, it, expect } from 'vitest';
import { DataQuery } from '../../../src/server/storage/data-query.js';

describe('DataQuery filter models', () => {
  it('reads a filter model from its JSON string or itself, and nothing else', () => {
    const model = { code: { filterType: 'text', type: 'equals', filter: 'cave' } };
    expect(DataQuery.filterModelOf(JSON.stringify(model))).toEqual(model);
    expect(DataQuery.filterModelOf(model)).toBe(model);
    expect(DataQuery.filterModelOf('not json')).toBe(null);
    expect(DataQuery.filterModelOf('[]')).toBe(null);
    expect(DataQuery.filterModelOf('')).toBe(null);
  });

  it('matches no row with an empty set, as AG Grid does', () => {
    const { query } = DataQuery.parse({ filterModel: JSON.stringify({ code: { filterType: 'set', values: [] } }) });
    expect(query).toEqual({ code: { $in: [] } });
  });

  it('joins a text filter and a set filter on one field', () => {
    const { query } = DataQuery.parse({
      filterModel: {
        code: {
          filterType: 'multi',
          operator: 'AND',
          filterModels: [
            { filterType: 'text', type: 'equals', filter: 'cave' },
            { filterType: 'set', values: ['cave', 'ruin'] },
          ],
        },
      },
    });
    expect(query).toEqual({ $and: [{ code: 'cave' }, { code: { $in: ['cave', 'ruin'] } }] });
  });
});
