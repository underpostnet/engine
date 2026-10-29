'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  dispatchBuildInstanceEnv,
  etcHostFactory,
  instanceEnvFilePath,
  instancePortFactory,
  resolveEnvScoped,
  sortInstancesByPath,
  splitFileFactory,
} from '../../../src/server/runtime/conf.js';

describe('instance helpers', () => {
  it('prefers the debug port in development, on the proxy side and the container side', () => {
    const instance = { fromPort: 4000, fromDebugPort: 9229, toPort: 3000, toDebugPort: 9230 };
    expect(instancePortFactory({ instance, env: 'development' })).to.equal(9229);
    expect(instancePortFactory({ instance, env: 'production' })).to.equal(4000);
    expect(instancePortFactory({ instance, env: 'development', container: true })).to.equal(9230);
    expect(instancePortFactory({ instance: { toPort: 3000 }, env: 'development', container: true })).to.equal(3000);
  });

  it('orders instances longest path first, so the root never shadows a sub-path', () => {
    const ordered = sortInstancesByPath([{ id: 'root', path: '/' }, { id: 'none' }, { id: 'forest', path: '/FOREST' }]);
    expect(ordered.map(({ id }) => id)).to.deep.equal(['forest', 'root', 'none']);
  });

  it('picks the block of an environment and passes a shared block through', () => {
    expect(resolveEnvScoped({ development: 'dev', production: 'prod' }, 'production')).to.equal('prod');
    expect(resolveEnvScoped({ shared: true }, 'production')).to.deep.equal({ shared: true });
    expect(resolveEnvScoped(undefined, 'production')).to.equal(undefined);
  });

  it('builds the instance env through the deploy builder and stamps the container deploy id', () => {
    const builders = { 'dd-a': ({ env, instance }) => ({ ...env, INSTANCE: instance.id }) };
    expect(
      dispatchBuildInstanceEnv({
        deployId: 'dd-a',
        instance: { id: 'forest' },
        environment: 'production',
        baseEnv: { PORT: '3000' },
        containerDeployId: 'dd-a-forest',
        builders,
      }),
    ).to.deep.equal({ PORT: '3000', INSTANCE: 'forest', CONTAINER_DEPLOY_ID: 'dd-a-forest' });
    // A deploy without a builder keeps the base env.
    expect(dispatchBuildInstanceEnv({ deployId: 'dd-b', baseEnv: { A: '1' }, containerDeployId: 'x' })).to.deep.equal({
      A: '1',
      CONTAINER_DEPLOY_ID: 'x',
    });
    expect(() =>
      dispatchBuildInstanceEnv({ deployId: 'dd-a', builders: { 'dd-a': () => [] }, containerDeployId: 'x' }),
    ).to.throw(/must return an env object/);
  });

  it('places an instance env file under its deploy and environment', () => {
    expect(instanceEnvFilePath('dd-a', 'forest', 'development')).to.match(
      /engine-private\/conf\/dd-a\/instances\/forest\/env\/development\.env$/,
    );
    expect(instanceEnvFilePath('dd-a', 'forest', '')).to.match(/\/production\.env$/);
  });
});

describe('host files and split files', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-conf-hosts-'));
  });

  afterEach(() => fs.removeSync(root));

  it('writes the hosts file, appends to one and keeps an owned block idempotent', () => {
    const hostsPath = path.join(root, 'hosts');
    const written = etcHostFactory(['https://a.test/path', 'b.test', 'b.test', 'http://[bad'], { path: hostsPath });
    expect(written.changed).to.equal(true);
    expect(fs.readFileSync(hostsPath, 'utf8')).to.match(/^127\.0\.0\.1 +a\.test b\.test http:\/\/\[bad localhost/);

    etcHostFactory(['c.test'], { path: hostsPath, append: true });
    expect(fs.readFileSync(hostsPath, 'utf8')).to.include('a.test').and.include('c.test');

    fs.writeFileSync(hostsPath, '10.0.0.1 router\n');
    expect(etcHostFactory(['d.test'], { path: hostsPath, blockId: 'dd-a' }).changed).to.equal(true);
    expect(etcHostFactory(['d.test'], { path: hostsPath, blockId: 'dd-a' }).changed).to.equal(false);
    etcHostFactory(['e.test'], { path: hostsPath, blockId: 'dd-a' });
    const hosts = fs.readFileSync(hostsPath, 'utf8');
    expect(hosts.startsWith('10.0.0.1 router\n# underpost hosts dd-a:begin\n')).to.equal(true);
    expect(hosts).to.include('e.test').and.not.include('d.test');
    expect(() => etcHostFactory(['x.test'], { path: hostsPath, blockId: 'bad id' })).to.throw(/Invalid \/etc\/hosts/);
  });

  it('leaves a file under the split size whole', async () => {
    const file = path.join(root, 'small.bin');
    fs.writeFileSync(file, 'small');
    expect(await splitFileFactory('small', file)).to.equal(false);
    expect(fs.existsSync(file)).to.equal(true);
  });
});
