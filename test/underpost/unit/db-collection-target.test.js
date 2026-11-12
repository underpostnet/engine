/**
 * The target resolution of `underpost db collection`: a selector names a declared host, one path
 * with a database and an optional database override. The resolution never picks among several.
 */
import { describe, expect, it } from 'vitest';
import { collectionOwnerOf, collectionTargetOf } from '../../../src/cli/db-collection.js';
import { dataOperationsProvider } from '../../../src/db/data-operations.js';

const db = (name) => ({ provider: 'mongoose', host: 'mongodb-0.mongodb-service:27017', name, password: 'secret' });
const conf = {
  'www.one.test': { '/': { apis: ['user', 'file'], db: db('one') } },
  'www.two.test': { '/': { apis: ['user'], db: db('two') }, '/beta': { apis: ['user'], db: db('two-beta') } },
  'static.test': { '/': { apis: [] } },
};

describe('a collection target', () => {
  it('takes the one path of a host that declares a database', () => {
    expect(collectionTargetOf(conf, { deployId: 'dd-test', host: 'www.one.test' })).toMatchObject({
      deployId: 'dd-test',
      host: 'www.one.test',
      path: '/',
      apis: ['user', 'file'],
      database: '',
      db: { name: 'one' },
    });
  });

  it('refuses to pick among several paths', () => {
    expect(() => collectionTargetOf(conf, { deployId: 'dd-test', host: 'www.two.test' }, '--source-')).toThrow(
      /several paths \(\/, \/beta\): give one with --source-path/,
    );
    expect(collectionTargetOf(conf, { deployId: 'dd-test', host: 'www.two.test', path: '/beta' }).db.name).toBe(
      'two-beta',
    );
  });

  it('refuses an undeclared host or path and a path without a database', () => {
    expect(() => collectionTargetOf(conf, { deployId: 'dd-test', host: 'nowhere.test' })).toThrow(
      /Host nowhere.test is not declared in dd-test/,
    );
    expect(() => collectionTargetOf(conf, { deployId: 'dd-test', host: 'www.one.test', path: '/x' })).toThrow(
      /Path \/x is not declared/,
    );
    expect(() => collectionTargetOf(conf, { deployId: 'dd-test', host: 'static.test' })).toThrow(
      /declares no database/,
    );
    expect(() => collectionTargetOf(conf, { deployId: 'dd-test' }, '--target-')).toThrow(/--target-host/);
  });

  it('takes a database override only when it is a database name', () => {
    expect(collectionTargetOf(conf, { deployId: 'dd-test', host: 'www.one.test', database: 'one-copy' }).database).toBe(
      'one-copy',
    );
    expect(() =>
      collectionTargetOf(conf, { deployId: 'dd-test', host: 'www.one.test', database: 'a.b' }, '--target-'),
    ).toThrow(/--target-database a.b is not a database name/);
  });

  it('names the API that owns a collection by API or by collection', async () => {
    expect(await collectionOwnerOf('user')).toEqual({ owner: 'user', collection: 'users' });
    expect(await collectionOwnerOf('documents')).toEqual({ owner: 'document', collection: 'documents' });
    expect(await collectionOwnerOf('loose')).toEqual({ owner: '', collection: 'loose' });
  });

  it('selects a provider by its capabilities', () => {
    expect(dataOperationsProvider('mongoose', 'move').provider).toBe('mongoose');
    expect(() => dataOperationsProvider('mariadb', 'clone')).toThrow(/"mariadb" has no collection operations/);
  });
});
