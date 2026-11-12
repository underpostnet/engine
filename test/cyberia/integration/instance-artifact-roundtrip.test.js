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
  'cyberia-economy',
  'cyberia-economic-item-policy',
];

const jsonFiles = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .sort()
    : [];

/** Every file of a directory and its text, by relative path. */
const tree = (dir) =>
  Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true })
      .filter((file) => fs.statSync(path.join(dir, file)).isFile())
      .sort()
      .map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')]),
  );

let mongod;
let pod;

/** Runs `fn` on the content database of the pod. */
const withContent = async (fn) => {
  const client = await new mongoose.mongo.MongoClient(mongod.uri).connect();
  try {
    return await fn(client.db('cyberia-content'));
  } finally {
    await client.close();
  }
};

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
    const child = spawn(process.execPath, [cli, 'instance', 'snapshot', CODE, ...args, '--mongo-host', mongod.host], {
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

    it('carries each item its economy names, also an item the world holds nowhere else', async () => {
      // The economy prices an item no map, default, action or quest names, and its burn salvages another.
      const [held] = jsonFiles(path.join(contentArtifact().instanceDir(CODE), 'object-layers')).map((file) =>
        path.basename(file, '.json'),
      );
      await withContent(async (db) => {
        const { economyCode } = await db.collection('cyberiainstanceconfs').findOne({ instanceCode: CODE });
        const { objectLayerCid } = await db.collection('cyberiaitemcatalogs').findOne({ itemId: held });
        await db
          .collection('cyberiaitemcatalogs')
          .insertMany(['policy-probe', 'salvage-probe'].map((itemId) => ({ itemId, objectLayerCid, history: [] })));
        await db.collection('cyberiaeconomicitempolicies').insertOne({
          economyCode,
          itemId: 'policy-probe',
          burn: true,
          salvage: [{ itemId: 'salvage-probe', qty: 1 }],
        });
      });

      const out = path.join(pod, 'export-economy', CODE);
      const exported = await run('--export', out);
      expect(exported.status, exported.output).toBe(0);
      expect(jsonFiles(path.join(out, 'object-layers'))).toEqual(
        expect.arrayContaining(['policy-probe.json', 'salvage-probe.json']),
      );
    }, 360000);

    it('replaces the whole snapshot of the world, and nothing beside it', async () => {
      const exports = path.join(pod, 'export-replace');
      const out = path.join(exports, CODE);
      const beside = {
        [path.join(exports, 'other-world/maps/kept.json')]: '{"code":"kept"}',
        [path.join(exports, 'global/kept.json')]: '{}',
      };
      for (const [file, text] of Object.entries(beside)) fs.outputFileSync(file, text);
      await withContent((db) => db.collection('cyberiasagas').insertOne({ code: CODE, name: CODE }));
      const first = await run('--export', out);
      expect(first.status, first.output).toBe(0);
      expect(jsonFiles(path.join(out, 'cyberia-sagas'))).toEqual([`${CODE}.json`]);
      const exported = tree(out);

      // The world drops its saga, and a market file of an earlier export has no document behind it.
      await withContent((db) => db.collection('cyberiasagas').deleteOne({ code: CODE }));
      fs.outputFileSync(path.join(out, 'cyberia-markets/retired.json'), '{}');
      const second = await run('--export', out);
      expect(second.status, second.output).toBe(0);
      const replaced = tree(out);
      expect(replaced).toEqual(
        Object.fromEntries(Object.entries(exported).filter(([file]) => !file.startsWith('cyberia-sagas/'))),
      );
      for (const [file, text] of Object.entries(beside)) expect(fs.readFileSync(file, 'utf8')).toBe(text);

      // The same world exports the same files again.
      const third = await run('--export', out);
      expect(third.status, third.output).toBe(0);
      expect(tree(out)).toEqual(replaced);
    }, 360000);

    it('leaves the snapshot as it was when an export fails, with no staging directory behind', async () => {
      const out = path.join(pod, 'export-replace', CODE);
      const before = tree(out);
      const staged = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(`instance-${CODE}-`)).length;
      const stagedBefore = staged();
      const confs = (db) => db.collection('cyberiainstanceconfs');
      const { economyCode } = await withContent((db) => confs(db).findOne({ instanceCode: CODE }));
      await withContent((db) => confs(db).updateOne({ instanceCode: CODE }, { $set: { economyCode: 'no-economy' } }));
      const failed = await run('--export', out);
      await withContent((db) => confs(db).updateOne({ instanceCode: CODE }, { $set: { economyCode } }));
      expect(failed.status).not.toBe(0);
      expect(failed.output).toContain('names economy no-economy, which does not exist');
      expect(tree(out)).toEqual(before);
      expect(staged()).toBe(stagedBefore);
    }, 360000);

    it('exports the definition the catalog binds: never an unbound edit, never a binding no definition holds', async () => {
      const out = path.join(pod, 'export-binding', CODE);
      const [held] = jsonFiles(path.join(contentArtifact().instanceDir(CODE), 'object-layers')).map((file) =>
        path.basename(file, '.json'),
      );
      const edited = `bafkrei${'z'.repeat(52)}`;
      const catalog = (db) => db.collection('cyberiaitemcatalogs');
      const bindings = (db) =>
        catalog(db)
          .find({}, { projection: { _id: 0 } })
          .sort({ itemId: 1 })
          .toArray();
      const bind = (cid) =>
        withContent((db) => catalog(db).updateOne({ itemId: held }, { $set: { objectLayerCid: cid } }));
      const cidOf = () => JSON.parse(fs.readFileSync(path.join(out, 'object-layers', `${held}.json`), 'utf8')).cid;

      // The edit is a new definition the catalog does not bind yet.
      const { bound, stored } = await withContent(async (db) => {
        const { objectLayerCid } = await catalog(db).findOne({ itemId: held });
        const definition = await db.collection('objectlayers').findOne({ cid: objectLayerCid });
        await db
          .collection('objectlayers')
          .insertOne({ ...definition, _id: new mongoose.Types.ObjectId(), cid: edited, contentHash: 'e'.repeat(64) });
        return { bound: objectLayerCid, stored: await bindings(db) };
      });
      const unbound = await run('--export', out);
      expect(unbound.status, unbound.output).toBe(0);
      expect(cidOf()).toBe(bound);
      expect(await withContent(bindings)).toEqual(stored);

      await bind(edited);
      const rebound = await run('--export', out);
      expect(rebound.status, rebound.output).toBe(0);
      expect(cidOf()).toBe(edited);

      const before = tree(out);
      const dangling = `bafkrei${'y'.repeat(52)}`;
      await bind(dangling);
      const refused = await run('--export', out);
      await bind(bound);
      expect(refused.status).not.toBe(0);
      expect(refused.output).toContain(`'${held}' is bound to ${dangling}, which no stored definition holds`);
      expect(tree(out)).toEqual(before);
    }, 360000);
  },
);
