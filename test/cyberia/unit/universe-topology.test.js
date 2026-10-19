/**
 * The topology checks of a universe: valid member codes, one cell per member on the shared layout
 * contract, and links between two distinct members, one per pair.
 */
import { describe, expect, it } from 'vitest';
import { universeDefect } from '../../../src/api/cyberia-universe/cyberia-universe.service.js';

const member = (instanceCode, x, y) => ({ instanceCode, x, y });
const link = (sourceInstanceCode, targetInstanceCode, bidirectional = true) => ({
  sourceInstanceCode,
  targetInstanceCode,
  bidirectional,
});

const universe = (instances, links = []) => ({ code: 'cyberia', instances, links });

describe('a universe topology', () => {
  it('passes with members on distinct cells and links between them', () => {
    expect(universeDefect(universe([member('a', 0, 0), member('b', 1, 0)], [link('a', 'b')]))).toBe('');
    expect(universeDefect(universe([member('a', 0, 0), member('b', 2, 2)], [link('b', 'a', false)]))).toBe('');
    expect(universeDefect(universe([]))).toBe('');
  });

  it.each([
    [{ code: 'bad code', instances: [], links: [] }, 'the code is invalid'],
    [universe([member('a b', 0, 0)]), 'the instance code "a b" is invalid'],
    [universe([member('a', 0, 0), member('a', 1, 0)]), 'a has two cells'],
    [universe([member('a', 0, 0), member('b', 0, 0)]), 'b shares the cell 0,0'],
    [universe([member('a', 0, 0)], [link('a', 'z')]), 'the link a → z names a non-member'],
    [universe([member('a', 0, 0)], [link('a', 'a')]), 'the link of a goes nowhere'],
    [
      universe([member('a', 0, 0), member('b', 1, 0)], [link('a', 'b', false), link('b', 'a', false)]),
      'b and a have two links',
    ],
  ])('fails on %j', (topology, defect) => {
    expect(universeDefect(topology)).toBe(defect);
  });
});
