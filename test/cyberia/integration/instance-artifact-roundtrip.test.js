import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import { contentArtifact, hasContentArtifact } from '../../../src/projects/cyberia/content/content-artifact.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

const cli = new URL('../../../bin/cyberia.js', import.meta.url).pathname;
const CODE = 'test';
const APIS = [
  'object-layer',
  'cyberia-item-catalog',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'ipfs',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-dialogue',
  'cyberia-map',
  'cyberia-entity',
  'cyberia-quest',
  'cyberia-action',
  'cyberia-skill',
  'cyberia-entity-type-default',
  'cyberia-saga',
  'cyberia-audio',
  'cyberia-map-audio-conf',
];

const jsonFiles = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .sort()
    : [];

let mongod;
let pod;

/** The environment of this process without the credentials of a real database. */
const baseEnv = () => {
  const env = { ...process.env };
  for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete env[key];
  return env;
};

/**
 * Runs the CLI as a pod does: a deploy conf of its own, its environment from the process. The run
 * is asynchronous, so this process keeps reading the output of the mongod it started.
 */
const run = (...args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'instance', CODE, ...args, '--mongo-host', mongod.host], {
      cwd: pod,
      env: {
        ...baseEnv(),
        DEFAULT_DEPLOY_ID: 'dd-x',
        DEFAULT_DEPLOY_HOST: 'h',
        DEFAULT_DEPLOY_PATH: '/',
        IPFS_API_URL: 'http://127.0.0.1:9',
        IPFS_CLUSTER_API_URL: 'http://127.0.0.1:9',
        npm_config_prefix: `${pod}/npm-global`,
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (status) => resolve({ status, output }));
  });

// The pod is its own Object Layer authority, so the import stores definitions locally. IPFS
// points at a closed port: a pin failure is a warning, never a failed write.
describe.skipIf(!mongodBinary || !hasContentArtifact())(
  'instance import and export of a content artifact backup',
  () => {
    beforeAll(async () => {
      mongod = await startMongod('cyberia', { replSet: 'podset' });
      pod = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-artifact-pod-'));
      fs.outputJsonSync(`${pod}/engine-private/conf/dd-x/conf.server.json`, {
        h: {
          '/': {
            apis: APIS,
            db: {
              provider: 'mongoose',
              host: mongod.host,
              name: 'cyberia',
              replicaSet: 'podset',
              partitions: { content: { name: 'cyberia-content', apis: APIS } },
            },
          },
        },
      });
    }, 60000);

    afterAll(async () => {
      await mongod?.stop();
      if (pod) fs.removeSync(pod);
    });

    it('imports the artifact backup by default and exports the same instance and bindings again', async () => {
      const imported = await run('--import');
      expect(imported.status, imported.output).toBe(0);

      // A conf an older schema wrote keeps the fields that schema had.
      const client = await new mongoose.mongo.MongoClient(mongod.uri).connect();
      await client
        .db('cyberia-content')
        .collection('cyberiainstanceconfs')
        .updateOne({ instanceCode: CODE }, { $set: { economyRules: { tradeFee: 1 }, snapshotRate: 20 } });
      await client.close();

      const out = path.join(pod, 'export', CODE);
      const exported = await run('--export', out);
      expect(exported.status, exported.output).toBe(0);

      const source = contentArtifact().instanceDir(CODE);
      expect(fs.readJsonSync(path.join(out, 'cyberia-instance.json')).code).toBe(CODE);
      const conf = fs.readJsonSync(path.join(out, 'cyberia-instance-conf.json'));
      expect(conf).not.toHaveProperty('economyRules');
      expect(conf).not.toHaveProperty('snapshotRate');
      // The world names the foundation economy: the import stored it, and the export carries it.
      const economy = fs.readJsonSync(path.join(out, 'cyberia-economy.json'));
      expect(economy.code).toBe(fs.readJsonSync(path.join(out, 'cyberia-instance-conf.json')).economyCode);
      expect(economy).toMatchObject(contentArtifact().foundation.economies.find(({ code }) => code === economy.code));
      for (const directory of ['maps', 'object-layers', 'cyberia-quests', 'cyberia-actions', 'cyberia-dialogues'])
        expect(jsonFiles(path.join(out, directory)), directory).toEqual(jsonFiles(path.join(source, directory)));

      // The snapshot binds each item to the definition it ran: an import into an empty database
      // restores that binding exactly, and an export captures it again.
      const cidOf = (dir, file) => fs.readJsonSync(path.join(dir, 'object-layers', file)).cid;
      for (const file of jsonFiles(path.join(source, 'object-layers')))
        expect(cidOf(out, file), file).toBe(cidOf(source, file));

      // Render sources travel as indexed frames: an import and an export keep every byte.
      const wire = (file) => {
        const { format, width, height, palette, frameDurationMs, frames } = fs.readJsonSync(file);
        return { format, width, height, palette, frameDurationMs, frames };
      };
      for (const file of jsonFiles(path.join(source, 'render-frames')))
        expect(wire(path.join(out, 'render-frames', file)), file).toEqual(
          wire(path.join(source, 'render-frames', file)),
        );
    }, 360000);
  },
);
