import { describe, it, expect } from 'vitest';
import {
  registryChecksum,
  registryDefects,
  registryPlan,
  registryStatus,
} from '../../../src/projects/cyberia/instance/map-registry.js';
import { CyberiaGlobalMapCodeRegistrySchema } from '../../../src/api/cyberia-global-map-code-registry/cyberia-global-map-code-registry.model.js';

const catalog = 'release-a';
const maps = [
  { code: 'gate', status: 'published', gridX: 16, gridY: 16 },
  { code: 'draft', status: 'draft', gridX: 16, gridY: 16 },
  { code: 'loose', status: 'published', gridX: 16, gridY: 16 },
];
const world = { _id: 'owner', code: 'WORLD', status: 'published', cyberiaMapCodes: ['gate', 'draft'] };
const plan = (stored, instances = [world], catalogMaps = maps) =>
  registryPlan({ catalog, maps: catalogMaps, instances, stored });
const rowsOf = (changes) => changes.map(({ entry }, i) => ({ ...entry, _id: `r${i}`, version: 1 }));

describe('the map registry', () => {
  it('reads a status from the map and the instance that lists it', () => {
    expect(registryStatus('published', 'published')).toBe('active');
    expect(registryStatus('draft', 'published')).toBe('unlisted');
    expect(registryStatus('published', 'unlisted')).toBe('unlisted');
    expect(registryStatus(undefined, undefined)).toBe('unlisted');
    expect(registryStatus('archived', 'published')).toBe('deprecated');
    expect(registryStatus('published', 'archived')).toBe('deprecated');
  });

  it('checks a row by its catalog, code, owner and status only', () => {
    const row = { catalog, mapCode: 'gate', instanceCode: 'WORLD', instanceId: 'owner', status: 'active' };
    expect(registryChecksum({ ...row, version: 9, gridX: 99 })).toBe(registryChecksum(row));
    for (const change of [
      { catalog: 'release-b' },
      { instanceCode: 'OTHER' },
      { instanceId: 'x' },
      { status: 'unlisted' },
    ])
      expect(registryChecksum({ ...row, ...change })).not.toBe(registryChecksum(row));
  });

  it('names every defect a catalog holds', () => {
    const other = { _id: 'other', code: 'OTHER', cyberiaMapCodes: ['gate', 'ghost', 'loose', 'loose'] };
    expect(registryDefects([...maps, { code: 'gate' }, { code: ' bad' }], [world, other])).toEqual([
      'Duplicate map code: gate',
      'Invalid map code: " bad"',
      'Map gate has conflicting owners: WORLD, OTHER',
      'Instance OTHER lists missing map ghost',
      'Instance OTHER lists map loose twice',
    ]);
  });

  it('places maps that share an edge and refuses maps that overlap', () => {
    const placed = (code, worldX, worldY) => ({ code, gridX: 16, gridY: 16, worldX, worldY });
    const instance = { code: 'WORLD', cyberiaMapCodes: ['a', 'b', 'c'] };
    expect(registryDefects([placed('a', 0, 0), placed('b', 16, 0), placed('c', 0, 16)], [instance])).toEqual([]);
    expect(registryDefects([placed('a', 0, 0), placed('b', 15, 0), placed('c', 0, 16)], [instance])).toEqual([
      'Instance WORLD: Maps a and b overlap in their world',
    ]);
    expect(registryDefects([placed('a', 0, null)], [])).toEqual([
      'Map a: The world origin needs two integer cells within ±1000000',
    ]);
    // Maps of two worlds may share cells: a world origin places a map in its own world.
    expect(
      registryDefects(
        [placed('a', 0, 0), placed('b', 0, 0)],
        [
          { code: 'ONE', cyberiaMapCodes: ['a'] },
          { code: 'TWO', cyberiaMapCodes: ['b'] },
        ],
      ),
    ).toEqual([]);
  });

  it('registers the listed codes, a draft as unlisted, and nothing an instance does not list', () => {
    const { changes, defects } = plan([]);
    expect(defects).toEqual([]);
    expect(changes.map(({ kind, entry }) => [kind, entry.mapCode, entry.status])).toEqual([
      ['registered', 'draft', 'unlisted'],
      ['registered', 'gate', 'active'],
    ]);
    expect(plan(rowsOf(changes)).changes).toEqual([]);
  });

  it('repairs, reassigns, updates and deprecates rows', () => {
    const rows = rowsOf(plan([]).changes);
    const corrupt = rows.map((row) => (row.mapCode === 'gate' ? { ...row, status: 'unlisted' } : row));
    expect(plan(corrupt).changes.map(({ kind }) => kind)).toEqual(['repaired']);
    const moved = { ...world, _id: 'owner-2', code: 'MOVED' };
    expect(plan(rows, [moved]).changes.map(({ kind }) => kind)).toEqual(['reassigned', 'reassigned']);
    const archived = maps.map((map) => (map.code === 'gate' ? { ...map, status: 'archived' } : map));
    expect(plan(rows, [world], archived).changes.map(({ kind, entry }) => [kind, entry.status])).toEqual([
      ['updated', 'deprecated'],
    ]);
    const retired = plan(rows, []).changes;
    expect(retired.map(({ kind, entry }) => [kind, entry.instanceCode, entry.status])).toEqual([
      ['deprecated', 'WORLD', 'deprecated'],
      ['deprecated', 'WORLD', 'deprecated'],
    ]);
    expect(plan(rowsOf(retired), []).changes).toEqual([]);
  });

  it('keeps the stored owner of a code two instances claim', () => {
    const rows = rowsOf(plan([]).changes);
    const rival = { _id: 'rival', code: 'RIVAL', status: 'published', cyberiaMapCodes: ['gate'] };
    const { changes, defects } = plan(rows, [world, rival]);
    expect(defects).toEqual(['Map gate has conflicting owners: WORLD, RIVAL']);
    expect(changes).toEqual([]);
  });

  it('has one unique index, on catalog and map code, and no portal timestamp', () => {
    const indexes = CyberiaGlobalMapCodeRegistrySchema.indexes();
    expect(indexes).toEqual([[{ catalog: 1, mapCode: 1 }, expect.objectContaining({ unique: true })]]);
    expect(CyberiaGlobalMapCodeRegistrySchema.path('lastPortalUpdate')).toBeUndefined();
    expect(CyberiaGlobalMapCodeRegistrySchema.path('status').enumValues).toEqual(['active', 'unlisted', 'deprecated']);
  });
});
