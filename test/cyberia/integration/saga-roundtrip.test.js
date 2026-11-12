import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/database-provider.js';
import {
  contentArtifact,
  contentSources,
  hasContentArtifact,
  hasContentSources,
  importContent,
} from '../../../src/projects/cyberia/content/content-artifact.js';
import { importSaga } from '../../../src/projects/cyberia/saga/saga-import.js';
import { checkSagaPackage } from '../../../src/projects/cyberia/saga/content-cli.js';
import { artifactSemantic, buildReport } from '../../../src/projects/cyberia/saga/saga-report.js';
import { findingPaths, packageDigest } from '../../../src/projects/cyberia/saga/saga-workflow.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';

// A saga package from the content source to the report: the real cyberia-content CLI checks and
// compiles it, the content import stores it, and the report reads it back as imported. It needs the
// workspace checkout of cyberia-content with its sources and a built artifact.
const host = { host: 'cyberia-saga-roundtrip.test', path: '/', consumes: {} };
const APIS = [
  'object-layer',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'cyberia-item-catalog',
  'cyberia-skill',
  'cyberia-saga',
  'cyberia-instance',
  'cyberia-instance-conf',
  'cyberia-universe',
  'cyberia-map',
  'cyberia-quest',
  'cyberia-dialogue',
  'cyberia-market',
  'cyberia-action',
  'cyberia-entity-type-default',
  'cyberia-economy',
  'cyberia-economic-item-policy',
  'cyberia-global-map-code-registry',
  'cyberia-procedural-job',
  'cyberia-procedural-job-item',
  'cyberia-procedural-population',
];
const models = () => DataBaseProviderService.getProvider(host, 'mongoose').models;
const rowOf = (report, key) => report.rows.find((row) => row.key === key);

describe.skipIf(!mongodBinary || !hasContentSources() || !hasContentArtifact())(
  'a saga package from check to report',
  () => {
    let mongod;
    let code;
    let pkg;
    let checked;

    beforeAll(async () => {
      [code] = contentArtifact().manifest.sagas;
      pkg = JSON.parse(fs.readFileSync(path.join(contentSources(), 'content', 'sagas', `${code}.json`), 'utf8'));
      for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET', 'DEFAULT_DEPLOY_ID'])
        delete process.env[key];
      process.env.IPFS_API_URL = 'http://127.0.0.1:9';
      process.env.IPFS_CLUSTER_API_URL = 'http://127.0.0.1:9';
      mongod = await startMongod('cyberia', { replSet: 'roundtrip' });
      await DataBaseProviderService.load({
        apis: APIS,
        ...host,
        db: { provider: 'mongoose', host: mongod.host, replicaSet: 'roundtrip', name: 'cyberia-saga-roundtrip' },
      });
    });

    afterAll(async () => {
      await DataBaseProviderService.getProvider(host)
        ?.close()
        .catch(() => {});
      delete DataBaseProviderService.instance[`${host.host}${host.path}`];
      await mongod?.stop();
    });

    it('checks and compiles the package with the content rules, as the artifact builds it', async () => {
      checked = await checkSagaPackage(pkg);
      expect(checked.findings).toEqual([]);
      expect(checked.compiled.saga.definitions).toEqual(contentArtifact().saga(code).saga.definitions);
      expect(checked.context.sources[pkg.definitions[0].id]).toBe(code);
    });

    it('gives a finding of a broken package the JSON path it concerns', async () => {
      const broken = structuredClone(pkg);
      const index = broken.definitions.findIndex(({ id }) => id.startsWith('quest.'));
      broken.definitions[index].provider = 'character.nobody';
      const { findings } = await checkSagaPackage(broken);
      expect(findingPaths(broken, findings)).toContainEqual({
        id: broken.definitions[index].id,
        message: 'provider names unknown definition character.nobody',
        path: ['definitions', index, 'provider'],
      });
    });

    it('reads the imported saga back as imported and built', async () => {
      await importContent({ families: contentArtifact().foundation, models: models(), context: host });
      await importSaga({ saga: checked.compiled, models: models(), context: host });
      const report = await buildReport({
        options: host,
        semantic: {
          code,
          source: { kind: 'candidate', revision: 1, digest: packageDigest(pkg) },
          findings: [],
          compiled: checked.compiled,
          context: checked.context,
          package: pkg,
        },
      });
      expect(report.gates.find(({ id }) => id === 'semantic').status).toBe('pass');
      expect(rowOf(report, 'release:imported')).toMatchObject({ status: 'ready', level: 'ok' });
      expect(rowOf(report, 'release:built')).toMatchObject({ status: 'ready', level: 'ok' });
      for (const quest of checked.compiled.families.quests) expect(rowOf(report, `quest:${quest.code}`)).toBeTruthy();
      for (const itemId of checked.compiled.saga.itemIds) expect(rowOf(report, `item:${itemId}`)).toBeTruthy();

      const served = await buildReport({ options: host, semantic: artifactSemantic(code) });
      expect(rowOf(served, 'release:imported').status).toBe('ready');
      expect(served.rows.map(({ key }) => key).sort()).toEqual(
        report.rows
          .map(({ key }) => key)
          .filter((key) => key !== 'release:applied')
          .sort(),
      );
    });
  },
);
