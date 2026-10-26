import { describe, it, expect } from 'vitest';
import { connectPortals, portalTopology } from '../../../src/api/cyberia-instance/cyberia-portal-connector.js';

const portalAt = (initCellX, initCellY) => ({ entityType: 'portal', initCellX, initCellY });
const maps = [
  { code: 'ruins', entities: [portalAt(1, 1), portalAt(5, 5), { entityType: 'floor', initCellX: 0, initCellY: 0 }] },
  { code: 'forest', entities: [portalAt(2, 2)] },
  { code: 'island', entities: [] },
];
const edge = (sourceMapCode, sourceCellX, sourceCellY, targetMapCode) => ({
  sourceMapCode,
  sourceCellX,
  sourceCellY,
  targetMapCode,
  targetCellX: 0,
  targetCellY: 0,
  portalMode: 'inter-portal',
});

describe('the portal topology of an instance', () => {
  it('counts maps, portal entities and connections, and walks from the first map', () => {
    const report = portalTopology(['ruins', 'forest'], maps, [
      edge('ruins', 1, 1, 'forest'),
      edge('forest', 2, 2, 'ruins'),
    ]);
    expect(report).toMatchObject({
      maps: 2,
      portalEntities: 3,
      connections: 2,
      unreachable: [],
      unresolved: [],
      invalid: [],
    });
    expect(report.unconnected).toEqual([{ mapCode: 'ruins', cellX: 5, cellY: 5 }]);
  });

  it('names the maps a player cannot reach, by the direction of each portal', () => {
    expect(portalTopology(['ruins', 'forest', 'island'], maps, [edge('forest', 2, 2, 'ruins')]).unreachable).toEqual([
      'forest',
      'island',
    ]);
  });

  it('names a portal with no portal entity at its source, and a portal to a map outside the instance', () => {
    const report = portalTopology(['ruins', 'forest'], maps, [
      edge('ruins', 9, 9, 'forest'),
      edge('ruins', 1, 1, 'island'),
    ]);
    expect(report.unresolved).toEqual([expect.objectContaining({ at: 0, sourceCellX: 9, sourceCellY: 9 })]);
    expect(report.invalid).toEqual([expect.objectContaining({ at: 1, targetMapCode: 'island' })]);
    expect(report.connections).toBe(1);
  });

  it('reads only the maps of the instance', () => {
    expect(portalTopology(['forest'], maps, []).portalEntities).toBe(1);
  });
});

describe('the portal connector', () => {
  it('rings every map from its portal entities, and the report finds every map reachable', () => {
    const codes = ['ruins', 'forest'];
    const { portals, topology } = connectPortals(codes, maps);
    expect(topology).toBe('ring+mixed');
    expect(portals.slice(0, 2).map(({ sourceMapCode, targetMapCode }) => [sourceMapCode, targetMapCode])).toEqual([
      ['ruins', 'forest'],
      ['forest', 'ruins'],
    ]);
    const report = portalTopology(codes, maps, portals);
    expect(report.unreachable).toEqual([]);
    expect(report.unresolved).toEqual([]);
  });
});
