import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import Underpost from '../../../../src/index.js';

let cwd;
let fixture;
const conf = 'engine-private/conf/dd-volume-test';
const build = `${conf}/build/development`;
const mirror = 'manifests/deployment/dd-volume-test-development';

beforeEach(() => {
  cwd = process.cwd();
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-volume-test-'));
  process.chdir(fixture);
  fs.outputJsonSync('package.json', { version: '1.0.0' });
  fs.outputJsonSync(`${conf}/conf.server.json`, {});
  fs.outputJsonSync(`${conf}/conf.volume.json`, []);
  vi.spyOn(Underpost.deploy, 'routerFactory').mockResolvedValue({ 'example.test': 'http://localhost:3001' });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(cwd);
  fs.removeSync(fixture);
});

it('removes stale volume manifests when a deployment has no volumes', async () => {
  fs.outputFileSync(`${build}/pv-pvc.yaml`, 'stale');
  fs.outputFileSync(`${mirror}/pv-pvc.yaml`, 'stale');
  for (let run = 0; run < 2; run++) {
    await Underpost.deploy.buildManifest('dd-volume-test', 'development', { versions: 'blue', replicas: 1 });
    expect(fs.existsSync(`${build}/pv-pvc.yaml`)).toBe(false);
    expect(fs.existsSync(`${mirror}/pv-pvc.yaml`)).toBe(false);
    expect(fs.readFileSync(`${build}/deployment.yaml`, 'utf8')).not.toContain('persistentVolumeClaim');
  }
});
