'use strict';

import { expect } from 'chai';
import os from 'os';
import nodePath from 'path';
import fs from 'fs-extra';
import Underpost from '../../../src/index.js';
import { redactSensitiveText } from '../../../src/server/ops/logger.js';

// The pod shell is the boundary: the suite reads the commands kubectl would send, never a pod.
const PASSWORD = `Zq'x$9;k "Wv`;
const FRAGMENTS = ['Zq', 'x$9', 'k "Wv'];
const POD = { NAME: 'mongodb-0' };

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

describe('database pod commands', () => {
  let commands;
  let scratch;

  beforeEach(async () => {
    commands = [];
    scratch = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'db-pod-commands-'));
    vi.spyOn(Underpost.kubectl, 'run').mockImplementation((command) => {
      commands.push(command);
      return '';
    });
    vi.spyOn(Underpost.kubectl, 'ensureExecReady').mockReturnValue(true);
    vi.spyOn(Underpost.kubectl, 'cpTo').mockReturnValue(true);
    vi.spyOn(Underpost.kubectl, 'cpFrom').mockReturnValue(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(scratch);
  });

  const expectRedacted = () => {
    for (const command of commands)
      for (const fragment of FRAGMENTS) expect(redactSensitiveText(command), command).to.not.include(fragment);
  };

  it('passes the MariaDB password as one literal argument on import and export', async () => {
    const sqlPath = nodePath.join(scratch, 'app.sql');
    await fs.outputFile(sqlPath, 'SELECT 1;');
    const credentials = { pod: POD, namespace: 'default', dbName: 'app', user: 'root', password: PASSWORD };

    expect(Underpost.db._importMariaDB({ ...credentials, sqlPath })).to.equal(true);
    expect(
      await Underpost.db._exportMariaDB({ ...credentials, outputPath: nodePath.join(scratch, 'out', 'app.sql') }),
    ).to.equal(true);

    const argvs = commands.map(podArgv);
    expect(argvs).to.deep.include(['mariadb', '-u', 'root', `-p${PASSWORD}`, 'app', '<', '/app.sql']);
    expect(argvs).to.deep.include([
      'mariadb-dump',
      '--user=root',
      `--password=${PASSWORD}`,
      '--lock-tables',
      'app',
      '>',
      '/home/app.sql',
    ]);
    expect(argvs.find((argv) => argv.includes('-e'))).to.include(`-p${PASSWORD}`);
    expectRedacted();
  });

  it('passes the MongoDB credentials as literal arguments on restore and dump', async () => {
    const bsonPath = nodePath.join(scratch, 'app');
    await fs.ensureDir(bsonPath);
    const credentials = { pod: POD, namespace: 'default', dbName: 'app', user: 'root', password: PASSWORD };

    expect(Underpost.db._importMongoDB({ ...credentials, bsonPath, drop: true })).to.equal(true);
    expect(
      Underpost.db._exportMongoDB({ ...credentials, outputPath: nodePath.join(scratch, 'out'), collections: 'a,b' }),
    ).to.equal(true);

    const tools = commands.map(podArgv).filter(([tool]) => tool === 'mongorestore' || tool === 'mongodump');
    expect(tools.map(([tool]) => tool)).to.deep.equal(['mongorestore', 'mongodump', 'mongodump']);
    for (const argv of tools) {
      expect(valueAfter(argv, '-d')).to.equal('app');
      expect(valueAfter(argv, '--username')).to.equal('root');
      expect(valueAfter(argv, '--password')).to.equal(PASSWORD);
      expect(valueAfter(argv, '--authenticationDatabase')).to.equal('admin');
    }
    expect(tools.slice(1).map((argv) => valueAfter(argv, '--collection'))).to.deep.equal(['a', 'b']);
    expectRedacted();
  });
});
