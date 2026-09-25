'use strict';

/**
 * @module test/support/mongod
 * @description Starts a throwaway MongoDB server for a suite that needs the real database —
 * unique indexes, duplicate-key errors, cursors, transactions — rather than a fake of it. Uses
 * the binary `UNDERPOST_MONGOD_BIN` names, or `mongod` on PATH; `mongodBinary` is `null` without
 * one, so a suite can `describe.skipIf(!mongodBinary)` and still run where no server can be started.
 */

import os from 'os';
import net from 'net';
import nodePath from 'path';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import { findBinary } from './binary.js';

const mongodBinary = findBinary('mongod', 'UNDERPOST_MONGOD_BIN');

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** Makes a started `mongod` the one member of replica set `name` and waits until it is primary. */
const initiateReplicaSet = async (host, name) => {
  const client = await new mongoose.mongo.MongoClient(`mongodb://${host}/?directConnection=true`).connect();
  try {
    const admin = client.db('admin');
    await admin.command({ replSetInitiate: { _id: name, members: [{ _id: 0, host }] } });
    for (let attempt = 0; attempt < 300; attempt++) {
      if ((await admin.command({ hello: 1 })).isWritablePrimary) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Replica set ${name} elected no primary`);
  } finally {
    await client.close();
  }
};

/**
 * @param {string} [dbName='test']
 * @param {{ replSet?: string }} [options] - `replSet` starts a one-member replica set of that name.
 * @returns {Promise<{ host: string, port: number, uri: string, stop: () => Promise<void> }>}
 */
const startMongod = async (dbName = 'test', { replSet = '' } = {}) => {
  const dbPath = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'underpost-mongod-'));
  const port = await freePort();
  const args = ['--dbpath', dbPath, '--port', `${port}`, '--bind_ip', '127.0.0.1', '--quiet'];
  if (replSet) args.push('--replSet', replSet);
  const child = spawn(mongodBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk;
      if (output.includes('Waiting for connections')) resolve();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`mongod exited with ${code}\n${output}`)));
    setTimeout(() => reject(new Error(`mongod did not start\n${output}`)), 30000);
  });
  const host = `127.0.0.1:${port}`;
  if (replSet) await initiateReplicaSet(host, replSet);
  return {
    host,
    port,
    uri: `mongodb://${host}/${dbName}?${replSet ? `replicaSet=${replSet}` : 'directConnection=true'}`,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('exit', resolve));
      await fs.remove(dbPath);
    },
  };
};

export { mongodBinary, freePort, startMongod };
