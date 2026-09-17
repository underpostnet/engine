'use strict';

/**
 * @module test/support/mongod
 * @description Starts a throwaway MongoDB server for a suite that needs the real database —
 * unique indexes, duplicate-key errors, cursors — rather than a fake of it. Uses the binary
 * `UNDERPOST_MONGOD_BIN` names, or `mongod` on PATH; `mongodBinary` is `null` without one, so a
 * suite can `describe.skipIf(!mongodBinary)` and still run where no server can be started.
 */

import os from 'os';
import net from 'net';
import nodePath from 'path';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs-extra';

const mongodBinary = (() => {
  if (process.env.UNDERPOST_MONGOD_BIN && fs.existsSync(process.env.UNDERPOST_MONGOD_BIN))
    return process.env.UNDERPOST_MONGOD_BIN;
  const found = spawnSync('which', ['mongod'], { encoding: 'utf8' }).stdout.trim();
  return found || null;
})();

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/**
 * @param {string} [dbName='test']
 * @returns {Promise<{ host: string, port: number, uri: string, stop: () => Promise<void> }>}
 */
const startMongod = async (dbName = 'test') => {
  const dbPath = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'underpost-mongod-'));
  const port = await freePort();
  const child = spawn(mongodBinary, ['--dbpath', dbPath, '--port', `${port}`, '--bind_ip', '127.0.0.1', '--quiet'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  return {
    host: `127.0.0.1:${port}`,
    port,
    uri: `mongodb://127.0.0.1:${port}/${dbName}?directConnection=true`,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.on('exit', resolve));
      await fs.remove(dbPath);
    },
  };
};

export { mongodBinary, freePort, startMongod };
