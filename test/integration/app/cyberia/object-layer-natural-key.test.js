import { describe, it, expect } from 'vitest';
import { DataQuery } from '../../../../src/server/storage/data-query.js';

const byItem = (key) => DataQuery.naturalKeyFilter('data.item.id', key);
const byCode = (key) => DataQuery.naturalKeyFilter('code', key);

describe('natural key addressing', () => {
  it('addresses an object layer by its item id', () => {
    expect(byItem('anon')).toEqual({ 'data.item.id': 'anon' });
    expect(byItem('wood-drop-1')).toEqual({ 'data.item.id': 'wood-drop-1' });
  });

  it('addresses an instance or a map by its code', () => {
    expect(byCode('TEST')).toEqual({ code: 'TEST' });
    expect(byCode('TEST-map-0')).toEqual({ code: 'TEST-map-0' });
  });

  it('matches either field when the key is shaped like a document id', () => {
    const key = '6a8fcb760faca8157bde4210';
    expect(byItem(key)).toEqual({ $or: [{ 'data.item.id': key }, { _id: key }] });
  });

  it('keeps a twelve-character item id out of the document id branch', () => {
    expect(byItem('wood-drop-12')).toEqual({ 'data.item.id': 'wood-drop-12' });
    expect(byItem('atlas_pistol')).toEqual({ 'data.item.id': 'atlas_pistol' });
  });

  it('treats a non-hex string of document id length as a natural key', () => {
    const key = 'zzzzzzzzzzzzzzzzzzzzzzzz';
    expect(byItem(key)).toEqual({ 'data.item.id': key });
  });
});
