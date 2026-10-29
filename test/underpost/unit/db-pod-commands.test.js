'use strict';

import { expect } from 'chai';
import Underpost from '../../../src/index.js';
import { shellArgumentFactory } from '../../../src/server/runtime/process.js';
import { clientPodManifestFactory } from '../../../src/cli/kubectl.js';
import {
  backupStreamName,
  drillMongodCommandFactory,
  inventoryDefects,
  mongoDumpCommandFactory,
  mongoReplicaHostsFactory,
  mongoRestoreCommandFactory,
  mongoShellCommandFactory,
} from '../../../src/cli/db.js';

// The pod shell is the boundary: the suite reads the commands kubectl would send, never a pod.
const PASSWORD = `Zq'x$9;k "Wv`;
const FRAGMENTS = ['Zq', 'x$9', 'k "Wv'];

/**
 * Splits a command into the words a POSIX shell reads. It throws on an unquoted expansion or
 * separator, so a value that escapes its quotes fails the suite.
 */
const shellWords = (command) => {
  const words = [];
  let word = null;
  for (let index = 0; index < command.length; index++) {
    const character = command[index];
    if (character === "'") {
      const end = command.indexOf("'", index + 1);
      if (end < 0) throw new Error(`unterminated quote in ${command}`);
      word = `${word ?? ''}${command.slice(index + 1, end)}`;
      index = end;
    } else if (character === '\\') word = `${word ?? ''}${command[++index]}`;
    else if (/\s/.test(character)) {
      if (word !== null) words.push(word);
      word = null;
    } else if ('$;&|"`'.includes(character)) throw new Error(`unquoted ${character} in ${command}`);
    else word = `${word ?? ''}${character}`;
  }
  if (word !== null) words.push(word);
  return words;
};

/** The argv the pod runs: the `sh -c` payload of `kubectl.exec`, or the direct `kubectl exec` vector. */
const podArgv = (command) => {
  const words = shellWords(command);
  const direct = words.slice(words.indexOf('--') + 1);
  return direct[0] === 'sh' && direct[1] === '-c' ? shellWords(direct[2]) : direct;
};

const valueAfter = (argv, flag) => argv[argv.indexOf(flag) + 1];

describe('database client commands', () => {
  const HOSTS = ['mongodb-0.mongodb-service:27017', 'mongodb-1.mongodb-service:27017'];

  it('dumps one database, or one collection, from a secondary with credentials from the pod environment', () => {
    const argv = podArgv(
      `kubectl exec -i -n default pod -- sh -c ${shellArgumentFactory(
        mongoDumpCommandFactory({ hosts: HOSTS, principal: null, database: 'app', collection: 'users' }),
      )}`,
    );
    expect(argv[0]).toBe('mongodump');
    expect(valueAfter(argv, '--host')).toBe(`rs0/${HOSTS.join(',')}`);
    expect(argv).toContain('--readPreference=secondaryPreferred');
    expect(argv).toContain('--db=app');
    expect(argv).toContain('--collection=users');
    expect(argv).toEqual(expect.arrayContaining(['--archive', '--gzip', '--numParallelCollections=1']));
    const dump = mongoDumpCommandFactory({ hosts: HOSTS, principal: 0, database: 'app', readPreference: 'primary' });
    expect(dump).toContain('--username "$MONGO_USER_0" --password "$MONGO_PASSWORD_0" --authenticationDatabase admin');
    expect(dump).toContain('--readPreference=primary');
    expect(dump).not.toContain('--collection');
    expect(mongoDumpCommandFactory({ hosts: HOSTS, principal: null, database: 'app' })).not.toContain('--username');
  });

  it('restores an archive from stdin into the replica set, or into the drill mongod', () => {
    const restore = (principal) =>
      mongoRestoreCommandFactory({
        hosts: HOSTS,
        principal,
        namespaces: ['app.*', "o'k.users"],
        drop: true,
        preserveUUID: true,
      });
    const argv = podArgv(`kubectl exec -i -n default pod -- sh -c ${shellArgumentFactory(restore(null))}`);
    expect(argv[0]).toBe('mongorestore');
    expect(argv).toEqual(expect.arrayContaining(['--archive', '--gzip', '--drop', '--preserveUUID', '--stopOnError']));
    expect(argv.filter((word) => word.startsWith('--nsInclude='))).toEqual([
      '--nsInclude=app.*',
      "--nsInclude=o'k.users",
    ]);
    expect(restore(1)).toContain(
      '--username "$MONGO_USER_1" --password "$MONGO_PASSWORD_1" --authenticationDatabase admin',
    );
    const drill = mongoRestoreCommandFactory({ namespaces: ['*.*'] });
    expect(drill).toContain("--host '127.0.0.1:27018'");
    expect(drill).not.toContain('--drop');
    expect(mongoShellCommandFactory({ script: 'print(1)' })).toContain(
      'mongodb://127.0.0.1:27018/?directConnection=true',
    );
  });

  it('starts the drill mongod with no TTL monitor, so an expired document still counts as restored', () => {
    const [prepare, start] = drillMongodCommandFactory().split(' && ');
    expect(prepare).toBe('mkdir -p /scratch/db');
    expect(shellWords(start)).toEqual(
      expect.arrayContaining([
        'mongod',
        '--port',
        '27018',
        '--bind_ip',
        '127.0.0.1',
        '--setParameter',
        'ttlMonitorEnabled=false',
      ]),
    );
  });

  it('names the replica set members by their StatefulSet pods', () => {
    expect(
      mongoReplicaHostsFactory([{ NAME: 'mongodb-1' }, { NAME: 'mongodb-0' }, { NAME: 'mongo-express-x' }]),
    ).toEqual(['mongodb-0.mongodb-service:27017', 'mongodb-1.mongodb-service:27017']);
    expect(mongoReplicaHostsFactory([])).toHaveLength(3);
  });

  it('names streams in the characters an object key takes', () => {
    expect(backupStreamName('mongodb', 'app-content-v1')).toBe('mongodb-app-content-v1');
    expect(backupStreamName('mongodb', 'app', 'system.version')).toBe('mongodb-app--system_version');
    expect(backupStreamName('tree', 'www.site.com', '/')).toBe('tree-www_site_com--_');
  });

  it('lists the databases a partition serves, and nothing else on the server', () => {
    const listed = ['admin', 'app', 'app-content-v1', 'app-content', 'app-contentx', 'app-content-capture-1', 'other'];
    expect(Underpost.db.partitionDatabases(listed, ['app-content'])).toEqual([
      'app-content',
      'app-content-capture-1',
      'app-content-v1',
    ]);
    expect(Underpost.db.partitionDatabases(listed, [])).toEqual([]);
  });

  it('compares an inventory with the one a manifest records', () => {
    const recorded = { namespaces: { 'a.x': { documents: 2, indexes: 1 }, 'a.y': { documents: 0, indexes: 1 } } };
    expect(inventoryDefects(recorded, recorded)).toEqual([]);
    expect(
      inventoryDefects(recorded, {
        namespaces: { 'a.x': { documents: 1, indexes: 1 }, 'a.z': { documents: 0, indexes: 1 } },
      }),
    ).toEqual(['a.x: 1 document(s), 2 recorded', 'a.y: missing', 'a.z: not recorded']);
  });

  it('carries the credentials of a client pod in a Secret, never in its pod spec or a command', () => {
    const manifest = clientPodManifestFactory({
      name: 'underpost-db-client-dd-test',
      namespace: 'default',
      image: 'docker.io/library/mongo@sha256:abc',
      secretEnv: { MONGO_USER_0: 'root', MONGO_PASSWORD_0: PASSWORD },
      labels: { 'underpost-deploy-id': 'dd-test' },
      limits: { cpu: '1', memory: '1Gi' },
      scratchSize: '2Gi',
      activeDeadlineSeconds: 3600,
    });
    const [secret, pod] = manifest.split('\n---\n');
    expect(secret).toContain('kind: Secret');
    expect(secret).toContain(`MONGO_PASSWORD_0: ${Buffer.from(PASSWORD).toString('base64')}`);
    for (const fragment of FRAGMENTS) expect(manifest).not.toContain(fragment);
    expect(pod).toContain('activeDeadlineSeconds: 3600');
    expect(pod).toContain('memory: "1Gi"');
    expect(pod).toContain('sizeLimit: "2Gi"');
    expect(pod).toContain('name: underpost-db-client-dd-test');
    expect(pod).toContain('automountServiceAccountToken: false');
  });
});
