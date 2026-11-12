/**
 * The API module lifecycle of `src/server/domain/api-module.js`: the contract check, the services a
 * module receives, the frozen context, the single start per host path, and the contract of every
 * module of `src/api`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import os from 'node:os';
import nodePath from 'node:path';
import fs from 'fs-extra';
import { loadProductContexts } from '../../../src/server/build/catalog.js';
import {
  apiContextFactory,
  apiModuleDefects,
  apiModuleUrl,
  apiServicesOf,
  startApiModule,
} from '../../../src/server/domain/api-module.js';
import { testApiContext } from '../../support/api-module.js';

const definition = (fields = {}) => ({ id: 'thing', services: [], createRouter: () => {}, ...fields });

describe('the module contract', () => {
  it('accepts a module that states it, and names each defect of one that does not', () => {
    expect(apiModuleDefects('thing', definition())).toEqual([]);
    expect(apiModuleDefects('thing', undefined)).toEqual(['exports no ApiModule']);
    expect(
      apiModuleDefects(
        'thing',
        definition({
          id: 'other',
          createRouter: 'no',
          initialize: 1,
          services: ['database', 'database', 'cache'],
          assets: { logo: { file: '' } },
          dispose: () => {},
        }),
      ),
    ).toEqual([
      'ApiModule.id is "other", not "thing"',
      'ApiModule.createRouter is not a function',
      'ApiModule.initialize is not a function',
      'ApiModule.services names an unknown service "cache"',
      'ApiModule.services repeats a service',
      'ApiModule.assets and the assets service go together',
      'ApiModule.assets.logo needs a file and a contentType',
      'ApiModule.dispose is not part of the contract',
    ]);
  });

  it('builds only the declared services, and names each one the host path lacks', () => {
    const identity = { host: 'nowhere.test', path: '/' };
    expect(Object.keys(apiServicesOf(definition({ services: ['auth'] }), identity))).toEqual(['auth']);
    expect(() => apiServicesOf(definition({ services: ['database', 'mailer'] }), identity)).toThrow(
      'missing service: database (the host path loads no database provider), mailer (the host path loads no mailer)',
    );
  });

  it('freezes the context it builds', () => {
    const consumes = { 'object-layer': 'object-layer' };
    const context = apiContextFactory({ host: 'h.test', path: '/beta', consumes, origins: ['https://h.test'] });
    expect(context).toMatchObject({ host: 'h.test', path: '/beta', apiBasePath: '/beta/api/v1' });
    expect(Object.isFrozen(context) && Object.isFrozen(context.consumes) && Object.isFrozen(context.services)).toBe(
      true,
    );
    consumes.other = 'x';
    expect(context.consumes).toEqual({ 'object-layer': 'object-layer' });
    expect(() => {
      context.host = 'other.test';
    }).toThrow(TypeError);
  });
});

describe('the start of a module', () => {
  let directory;
  beforeAll(async () => {
    directory = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'api-module-'));
    await fs.writeFile(nodePath.join(directory, 'logo.png'), 'png');
  });
  afterAll(() => fs.remove(directory));

  it('reads the assets, then initializes once per host path', async () => {
    const calls = [];
    const module = definition({
      id: 'started',
      services: ['assets'],
      assets: { logo: { file: nodePath.join(directory, 'logo.png'), contentType: 'image/png' } },
      initialize: async (context) => calls.push([context.host, context.services.assets.get('logo').buffer.toString()]),
    });
    const a = testApiContext(module, { host: 'a.test' });
    await Promise.all([startApiModule(module, a), startApiModule(module, a)]);
    await startApiModule(module, testApiContext(module, { host: 'b.test' }));
    expect(calls).toEqual([
      ['a.test', 'png'],
      ['b.test', 'png'],
    ]);
  });

  it('forgets a failed start, and refuses a missing asset file', async () => {
    let attempts = 0;
    const module = definition({
      id: 'flaky',
      initialize: async () => {
        if (++attempts === 1) throw new Error('index build failed');
      },
    });
    const context = testApiContext(module);
    await expect(startApiModule(module, context)).rejects.toThrow('index build failed');
    await startApiModule(module, context);
    expect(attempts).toBe(2);
    const missing = definition({
      id: 'missing',
      services: ['assets'],
      assets: { logo: { file: nodePath.join(directory, 'gone.png'), contentType: 'image/png' } },
    });
    await expect(startApiModule(missing, testApiContext(missing))).rejects.toThrow(
      /Asset missing\/logo cannot be read/,
    );
  });
});

describe('every API module', async () => {
  const absent = new Set((await loadProductContexts()).flatMap(({ missing }) => missing));
  const apis = fs
    .readdirSync('src/api', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(`src/api/${entry.name}/${entry.name}.router.js`))
    .map(({ name }) => name);
  const env = {};
  beforeAll(() => {
    for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) env[key] = process.env[key];
    process.env.GOOGLE_CLIENT_ID = 'contract.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'contract-secret';
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(env))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });

  it.each(apis)('%s builds its router with the services it declares, and no other', async (api) => {
    let ApiModule;
    try {
      ({ ApiModule } = await import(apiModuleUrl(api).href));
    } catch (error) {
      // A product package this checkout does not declare: the product context runs the check.
      const missingPackage = /Cannot find package '([^']+)'/.exec(error.message)?.[1];
      if (missingPackage && absent.has(missingPackage)) return;
      throw error;
    }
    expect(apiModuleDefects(api, ApiModule)).toEqual([]);
    const router = ApiModule.createRouter(testApiContext(ApiModule, { host: `${api}.contract.test` }));
    expect(typeof router).toBe('function');
    expect(router.stack.length).toBeGreaterThan(0);
  });
});
