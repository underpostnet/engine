import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  RELEASE_CONTENT,
  buildCyberiaMmoInstanceEnv,
  releaseInstanceCode,
  releaseInstanceCodes,
  selectReleaseContent,
  validateReleaseContent,
  withReleaseVariants,
} from '../../../src/projects/cyberia/content/release-content.js';
import { DEFAULT_INSTANCE_CODE } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { buildInstanceEnv } from '../../../src/projects/cyberia/instance-data.js';

const withInstances = (instances) => ({ ...RELEASE_CONTENT, instances });

describe('release content', () => {
  it('declares the foundation, the release sagas, and the default world at / and the test world at /test', () => {
    expect(RELEASE_CONTENT).toEqual({
      foundation: true,
      sagas: ['amethyst-strata-expansion'],
      instances: [
        { path: '/', instanceCode: DEFAULT_INSTANCE_CODE },
        { path: '/test', instanceCode: 'test' },
      ],
    });
    expect(Object.isFrozen(RELEASE_CONTENT.instances[0])).toBe(true);
    expect(validateReleaseContent()).toBe(RELEASE_CONTENT);
    expect(releaseInstanceCode('/')).toBe(DEFAULT_INSTANCE_CODE);
    expect(releaseInstanceCode('/test')).toBe('test');
    expect(() => releaseInstanceCode('/forest')).toThrow('No dd-cyberia release instance serves /forest');
  });

  it('runs nothing when imported: every check is an explicit call', () => {
    const source = fs.readFileSync(
      new URL('../../../src/projects/cyberia/content/release-content.js', import.meta.url),
      'utf8',
    );
    const statements = source.split('\n').filter((line) => /^[a-z]/i.test(line));
    expect(statements.every((line) => /^(import|const|function|export)\b/.test(line))).toBe(true);
  });

  it.each([
    [[{ path: '/test', instanceCode: 'test' }], 'must serve /'],
    [
      [
        { path: '/', instanceCode: 'a' },
        { path: '/a b', instanceCode: 'b' },
      ],
      'invalid instance variant path',
    ],
    [
      [
        { path: '/', instanceCode: 'a' },
        { path: '/x', instanceCode: 'b' },
        { path: '/x', instanceCode: 'c' },
      ],
      'duplicate path',
    ],
    [[{ path: '/', instanceCode: '' }], 'Invalid release instance code ""'],
    [
      [
        { path: '/', instanceCode: 'a' },
        { path: '/b', instanceCode: 'a' },
      ],
      'names one instance code twice',
    ],
    [[{ path: '/', instanceCode: 'a' }], 'Release instance a serves /; launch and travel reach it at /a'],
    [
      [
        { path: '/', instanceCode: DEFAULT_INSTANCE_CODE },
        { path: '/forest', instanceCode: 'test' },
      ],
      'Release instance test serves /forest; launch and travel reach it at /test',
    ],
  ])('refuses an invalid instance list (%#)', (instances, message) => {
    expect(() => validateReleaseContent(withInstances(instances))).toThrow(message);
  });

  it('refuses a content set without the foundation, or with an invalid saga list', () => {
    expect(() => validateReleaseContent({ ...RELEASE_CONTENT, foundation: false })).toThrow('carries the foundation');
    expect(() => validateReleaseContent({ ...RELEASE_CONTENT, sagas: ['a', 'a'] })).toThrow('saga code twice');
    expect(() => validateReleaseContent({ ...RELEASE_CONTENT, sagas: [''] })).toThrow('Invalid release saga code');
  });

  it('sets its paths as the variants of each named family, and leaves the others alone', () => {
    const conf = [
      { id: 'mmo-server', host: 'server.test', multiInstance: { variants: ['/', '/old'] } },
      { id: 'mmo-client', host: 'client.test' },
      { id: 'worker', host: 'worker.test' },
    ];
    const written = withReleaseVariants(conf, ['mmo-client', 'mmo-server']);
    expect(written[0]).toEqual({ id: 'mmo-server', host: 'server.test', multiInstance: { variants: ['/', '/test'] } });
    expect(written[1].multiInstance).toEqual({ variants: ['/', '/test'] });
    expect(written[2]).toBe(conf[2]);
    expect(conf[0].multiInstance.variants).toEqual(['/', '/old']);
    expect(() => withReleaseVariants(conf, ['mmo-gateway'])).toThrow('declares no mmo-gateway');
  });
});

describe('release selection', () => {
  const manifest = {
    sagas: ['amethyst-strata-expansion', 'another-saga'],
    instances: ['amethyst-strata-expansion', 'fallback', 'test'],
    global: [`bafkrei${'a'.repeat(52)}`],
  };

  it('imports the declared sagas and instances, and leaves every other one of the artifact out', () => {
    expect(selectReleaseContent({ manifest })).toEqual({
      sagas: ['amethyst-strata-expansion'],
      instances: ['amethyst-strata-expansion', 'test'],
      globalContent: manifest.global,
    });
  });

  it('takes the named instances instead of the release instances', () => {
    expect(releaseInstanceCodes()).toEqual([DEFAULT_INSTANCE_CODE, 'test']);
    expect(selectReleaseContent({ manifest, instances: ['fallback'] }).instances).toEqual(['fallback']);
  });

  it('fails on a declared instance or saga the artifact lacks', () => {
    expect(() => selectReleaseContent({ manifest: { ...manifest, instances: [DEFAULT_INSTANCE_CODE] } })).toThrow(
      'The content artifact holds no instance test',
    );
    expect(() => selectReleaseContent({ manifest: { ...manifest, sagas: [] } })).toThrow(
      'holds no saga amethyst-strata-expansion; it holds none',
    );
  });

  it('checks the content set it selects from', () => {
    expect(() => selectReleaseContent({ manifest, content: { ...RELEASE_CONTENT, foundation: false } })).toThrow(
      'carries the foundation',
    );
  });
});

describe('instance env', () => {
  it('derives the server and client keys from the world the path serves', () => {
    expect(
      buildCyberiaMmoInstanceEnv({ instance: { runtime: 'cyberia-server', path: '/test' }, env: { PORT: '4001' } }),
    ).toEqual({ PORT: '4001', INSTANCE_CODE: 'test', CYBERIA_BASE_PATH: '/test' });
    expect(buildCyberiaMmoInstanceEnv({ instance: { runtime: 'cyberia-client', path: '/test' } })).toEqual({
      CYBERIA_INSTANCE_CODE: 'test',
      CYBERIA_BASE_PATH: '/test',
    });
  });

  it('overrides a stale code with the release one', () => {
    const env = buildCyberiaMmoInstanceEnv({
      instance: { runtime: 'cyberia-client', path: '/', instanceCode: '' },
      env: { CYBERIA_INSTANCE_CODE: 'old' },
    });
    expect(env.CYBERIA_INSTANCE_CODE).toBe(DEFAULT_INSTANCE_CODE);
  });

  it('refuses a path no release instance serves', () => {
    expect(() => buildCyberiaMmoInstanceEnv({ instance: { runtime: 'cyberia-server', path: '/forest' } })).toThrow(
      '/forest',
    );
  });

  it('leaves a runtime it does not know alone', () => {
    expect(buildCyberiaMmoInstanceEnv({ instance: { runtime: 'nodejs', path: '/x' }, env: { A: '1' } })).toEqual({
      A: '1',
    });
    expect(buildCyberiaMmoInstanceEnv({})).toEqual({});
  });

  it.skipIf(!fs.existsSync('./engine-private/conf/dd-cyberia/conf.instances.json'))(
    'links each instance the runner builds to the origins of its environment',
    () => {
      const build = (runtime, environment, path = '/') =>
        buildInstanceEnv({ deployId: 'dd-cyberia', instance: { runtime, path }, environment, env: {} });
      expect(build('cyberia-client', 'development')).toMatchObject({
        CYBERIA_INSTANCE_CODE: DEFAULT_INSTANCE_CODE,
        CYBERIA_DATA_SERVER_URL: 'http://localhost:4008',
        CYBERIA_WS_ORIGIN: 'ws://localhost:8083',
      });
      expect(build('cyberia-client', 'production')).toMatchObject({
        CYBERIA_DATA_SERVER_URL: 'https://www.cyberiaonline.com',
        CYBERIA_WS_ORIGIN: 'wss://server.cyberiaonline.com',
      });
      expect(build('cyberia-server', 'development')).toMatchObject({
        CYBERIA_DATA_SERVER_URL: 'http://dd-cyberia-development-traffic-service:4008',
        CYBERIA_CORS_ALLOWED_ORIGINS: 'http://localhost:4008,http://localhost:8082',
        CYBERIA_PUBLIC_URL: 'http://localhost:8083',
      });
      expect(build('cyberia-server', 'production')).toMatchObject({
        CYBERIA_DATA_SERVER_URL: 'https://www.cyberiaonline.com',
        CYBERIA_CORS_ALLOWED_ORIGINS: 'https://www.cyberiaonline.com,https://client.cyberiaonline.com',
        CYBERIA_PUBLIC_URL: 'https://server.cyberiaonline.com',
      });
      expect(build('cyberia-server', 'production', '/test')).toMatchObject({
        INSTANCE_CODE: 'test',
        CYBERIA_PUBLIC_URL: 'https://server.cyberiaonline.com/test',
      });
    },
  );
});
