/**
 * The start of an API module on a real MongoDB: the user API seeds its administrator only from a
 * configured password and once, refuses to mount while its unique indexes cannot be built, and
 * refuses a host path that lacks a service. A token answers only on the host path that signed it.
 *
 * Needs a `mongod` binary: `UNDERPOST_MONGOD_BIN`, or one on PATH. Skipped otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/database-provider.js';
import { ApiModule as UserModule } from '../../../src/api/user/user.router.js';
import { buildApiModule } from '../../../src/server/domain/api-module.js';
import { authMiddlewareFactory, jwtSign } from '../../../src/server/security/auth.js';
import { mongodBinary, startMongod } from '../../support/mongod.js';
import { startTestApi } from '../../support/api-module.js';

const ENV = { JWT_SECRET: 'api-module-test-secret', DEFAULT_ADMIN_EMAIL: 'root@modules.test' };
const saved = Object.fromEntries([...Object.keys(ENV), 'DEFAULT_ADMIN_PASSWORD'].map((key) => [key, process.env[key]]));

/** The answer of the token check of a host path to one bearer token. */
const authenticate = (identity, token) =>
  new Promise((resolve) => {
    const res = {
      status: (code) => ({ json: (body) => resolve({ code, body }) }),
    };
    authMiddlewareFactory(identity)(
      { headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1', method: 'GET', params: {} },
      res,
      () => resolve({ code: 200 }),
    );
  });

describe.skipIf(!mongodBinary)('the start of an API module', () => {
  let mongod;
  let client;
  let index = 0;
  /** A fresh host path on its own database; `seed` writes to the database before any model binds. */
  const host = async (seed) => {
    const identity = { host: `modules-${++index}.test`, path: '/' };
    await seed?.(client.db(`modules-${index}`));
    await DataBaseProviderService.load({
      apis: ['user', 'file'],
      ...identity,
      db: { provider: 'mongoose', host: mongod.host, name: `modules-${index}` },
    });
    return { identity, User: DataBaseProviderService.getModel('User', identity), database: `modules-${index}` };
  };

  beforeAll(async () => {
    for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET']) delete process.env[key];
    Object.assign(process.env, ENV);
    mongod = await startMongod('modules');
    client = await new mongoose.mongo.MongoClient(`mongodb://${mongod.host}/?directConnection=true`).connect();
  }, 60000);

  beforeEach(() => {
    delete process.env.DEFAULT_ADMIN_PASSWORD;
  });

  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });

  it('leaves the administrator pending without a configured password, or with the template one', async () => {
    const plain = await host();
    await startTestApi(UserModule, plain.identity);
    expect(await plain.User.countDocuments({ role: 'admin' })).toBe(0);
    process.env.DEFAULT_ADMIN_PASSWORD = 'changethis';
    const template = await host();
    await startTestApi(UserModule, template.identity);
    expect(await template.User.countDocuments({ role: 'admin' })).toBe(0);
  });

  it('seeds one administrator, also when two instances start at once', async () => {
    process.env.DEFAULT_ADMIN_PASSWORD = 'Str0ng!Passw0rd';
    const first = await host();
    const second = { identity: { host: `twin-${index}.test`, path: '/' } };
    await DataBaseProviderService.load({
      apis: ['user', 'file'],
      ...second.identity,
      db: { provider: 'mongoose', host: mongod.host, name: first.database },
    });
    await Promise.all([startTestApi(UserModule, first.identity), startTestApi(UserModule, second.identity)]);
    const admins = await first.User.find({ role: 'admin' }).lean();
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ username: 'admin', email: 'root@modules.test', emailConfirmed: true });
    expect(admins[0].password).not.toContain('Str0ng');
  });

  it('refuses to start while two accounts share an email, and names the duplicate', async () => {
    const duplicate = await host((db) =>
      db.collection('users').insertMany([
        { email: 'twice@modules.test', username: 'one' },
        { email: 'twice@modules.test', username: 'two' },
      ]),
    );
    await expect(startTestApi(UserModule, duplicate.identity)).rejects.toThrow(
      /The unique user indexes cannot be built: \{"email":"twice@modules.test"\} repeats/,
    );
  });

  it('builds no router for a host path that lacks a declared service', async () => {
    await expect(
      buildApiModule({ api: 'user', host: 'bare.test', path: '/', consumes: {}, origins: [] }),
    ).rejects.toThrow(
      'API user of bare.test/: missing service: database (the host path loads no database provider), mailer (the host path loads no mailer)',
    );
    const loaded = await host();
    await expect(buildApiModule({ api: 'user', ...loaded.identity, consumes: {}, origins: [] })).rejects.toThrow(
      `API user of ${loaded.identity.host}/: missing service: mailer (the host path loads no mailer)`,
    );
  });

  it('answers a token only on the host path that signed it', async () => {
    const a = await host();
    const b = await host();
    const guest = (identity) =>
      jwtSign({ _id: 'guest-1', role: 'guest', host: identity.host, path: identity.path }, identity, 5, 10);
    expect(await authenticate(a.identity, guest(a.identity))).toEqual({ code: 200 });
    expect((await authenticate(b.identity, guest(a.identity))).code).toBe(401);
    // Signed for the audience of B, but naming A: the session of A is never read for B.
    const crossed = jwtSign({ _id: 'guest-1', role: 'guest', ...a.identity }, b.identity, 5, 10);
    expect(await authenticate(b.identity, crossed)).toEqual({
      code: 401,
      body: { status: 'error', message: 'unauthorized: host or path mismatch' },
    });
    // A recovery token names an email, no host path: it is no access token.
    const recovery = jwtSign({ email: 'root@modules.test' }, b.identity, 15);
    expect((await authenticate(b.identity, recovery)).code).toBe(401);
  });
});
