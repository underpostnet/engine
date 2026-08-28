'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import shell from 'shelljs';
import {
  DEFAULT_DEPLOY_ID,
  awaitDeployMonitor,
  buildCliDoc,
  buildReplicaId,
  clusterContextFactory,
  clusterTypeFactory,
  devProxyHostFactory,
  ensureTemplateCheckout,
  exposePartialMatchesFactory,
  exposePathPartsFactory,
  exposePortListFactory,
  exposePortPlanFactory,
  exposeTcpPortsFactory,
  gatewayApiEnabledFactory,
  generateSecurePassword,
  getConfFilePath,
  getConfFolder,
  getInstanceContext,
  getPathsSSR,
  getTlsHosts,
  gitOriginRepositoryName,
  isDevProxyContext,
  isTlsDevProxy,
  pruneTemplateWorkTree,
  readConfJson,
  resolveConfSecrets,
  resolveHostKeyContext,
  resolveReplicaCount,
  syncDeployIdSources,
  syncPrivateConf,
  updatePrivateEngineTestRepo,
  updatePrivateTemplateRepo,
  waitForPort,
} from '../../src/server/runtime/conf.js';
import UnderpostState from '../../src/cli/state.js';

const withArgv = (argv, run) => {
  const previous = process.argv;
  process.argv = [...previous.slice(0, 2), ...argv];
  try {
    return run();
  } finally {
    process.argv = previous;
  }
};

const withEnv = (values, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('host key context', () => {
  it('joins a host and path into the key the conf is indexed by', () => {
    expect(resolveHostKeyContext({ host: 'app.test', path: '/admin' })).to.equal('app.test/admin');
    expect(resolveHostKeyContext({ host: 'app.test' })).to.equal('app.test');
    expect(resolveHostKeyContext()).to.equal('');
  });

  it('passes a prebuilt key through unchanged', () => {
    expect(resolveHostKeyContext('app.test/admin')).to.equal('app.test/admin');
  });
});

describe('conf secret references', () => {
  it('leaves everything that is not an env reference alone', () => {
    const conf = { port: 3000, enabled: true, name: 'core', nothing: null, missing: undefined };
    expect(resolveConfSecrets(conf)).to.deep.equal(conf);
    expect(resolveConfSecrets(null)).to.equal(null);
    expect(resolveConfSecrets(undefined)).to.equal(undefined);
    expect(resolveConfSecrets(7)).to.equal(7);
  });

  it('resolves a bare reference from the environment', () => {
    withEnv({ CONF_FIXTURE_SECRET: 'supersecret' }, () => {
      expect(resolveConfSecrets({ db: { password: 'env:CONF_FIXTURE_SECRET' } })).to.deep.equal({
        db: { password: 'supersecret' },
      });
    });
  });

  // An unresolved credential must not reach a connection string as the literal
  // `env:` reference; empty is the value a caller can detect.
  it('resolves an unset reference with no default to an empty string', () => {
    withEnv({ CONF_FIXTURE_SECRET: undefined }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_SECRET')).to.equal('');
    });
  });

  it('falls back to a declared default', () => {
    withEnv({ CONF_FIXTURE_PROVIDER: undefined }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_PROVIDER:mongoose')).to.equal('mongoose');
    });
  });

  it('coerces an int reference from either the environment or its default', () => {
    withEnv({ CONF_FIXTURE_PORT: '587' }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_PORT:int:465')).to.equal(587);
    });
    withEnv({ CONF_FIXTURE_PORT: undefined }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_PORT:int:465')).to.equal(465);
    });
    withEnv({ CONF_FIXTURE_PORT: 'not-a-number' }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_PORT:int:465')).to.equal(465);
    });
    withEnv({ CONF_FIXTURE_PORT: 'nope' }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_PORT:int:zero')).to.equal(0);
    });
  });

  it('coerces a bool reference, treating only the literal false as false', () => {
    withEnv({ CONF_FIXTURE_SECURE: 'false' }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_SECURE:bool:true')).to.equal(false);
    });
    withEnv({ CONF_FIXTURE_SECURE: '0' }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_SECURE:bool:true')).to.equal(true);
    });
    withEnv({ CONF_FIXTURE_SECURE: undefined }, () => {
      expect(resolveConfSecrets('env:CONF_FIXTURE_SECURE:bool:false')).to.equal(false);
      expect(resolveConfSecrets('env:CONF_FIXTURE_SECURE:bool:true')).to.equal(true);
    });
  });

  it('walks arrays and nested objects', () => {
    withEnv({ CONF_FIXTURE_ORIGIN: 'https://app.test' }, () => {
      expect(
        resolveConfSecrets({
          origins: ['env:CONF_FIXTURE_ORIGIN', 'literal'],
          nested: [{ a: 'env:CONF_FIXTURE_ORIGIN' }],
        }),
      ).to.deep.equal({ origins: ['https://app.test', 'literal'], nested: [{ a: 'https://app.test' }] });
    });
  });

  it('returns a new object rather than resolving secrets into the conf it was given', () => {
    const conf = { db: { password: 'env:CONF_FIXTURE_SECRET' } };
    withEnv({ CONF_FIXTURE_SECRET: 'x' }, () => resolveConfSecrets(conf));
    expect(conf.db.password).to.equal('env:CONF_FIXTURE_SECRET');
  });
});

describe('conf file resolution', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the default deploy', () => {
    expect(DEFAULT_DEPLOY_ID).to.equal('dd-default');
  });

  it('prefers a replica folder over the deploy conf folder', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) =>
      `${filePath}`.startsWith('./engine-private/replica/dd-core'),
    );
    expect(getConfFolder('dd-core')).to.equal('./engine-private/replica/dd-core');
    expect(getConfFolder('dd-other')).to.equal('./engine-private/conf/dd-other');
  });

  it('resolves the canonical conf path', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(getConfFilePath('dd-core', 'cron')).to.equal('./engine-private/conf/dd-core/conf.cron.json');
  });

  it('prefers a development sub-conf variant of the server conf when one exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.endsWith('conf.server.dev.local.json'));
    withEnv({ NODE_ENV: 'development' }, () => {
      expect(getConfFilePath('dd-core', 'server', 'local')).to.equal(
        './engine-private/conf/dd-core/conf.server.dev.local.json',
      );
    });
  });

  it('honors an explicitly named sub-conf whatever the ambient environment says', () => {
    // Regression: `underpost` loads the host configuration store with `override: true`, and on a
    // provisioned node that store carries NODE_ENV=production. Gating the explicit sub-conf on
    // development therefore discarded it on every CLI call — `node bin client dd-core nexodev`
    // built conf.server.json, every host in it, rather than conf.server.dev.nexodev.json.
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.endsWith('conf.server.dev.local.json'));
    for (const NODE_ENV of ['production', 'test', undefined])
      withEnv({ NODE_ENV }, () => {
        expect(getConfFilePath('dd-core', 'server', 'local'), `NODE_ENV=${NODE_ENV}`).to.equal(
          './engine-private/conf/dd-core/conf.server.dev.local.json',
        );
      });
  });

  it('falls back to the base conf when the named sub-conf has no variant file', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    withEnv({ NODE_ENV: 'development' }, () => {
      expect(getConfFilePath('dd-core', 'server', 'absent')).to.equal('./engine-private/conf/dd-core/conf.server.json');
    });
  });

  it('reads the sub-conf from the environment when none is passed', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.endsWith('conf.server.dev.envsub.json'));
    withEnv({ NODE_ENV: 'development', DEPLOY_SUB_CONF: 'envsub' }, () => {
      expect(getConfFilePath('dd-core', 'server')).to.equal(
        './engine-private/conf/dd-core/conf.server.dev.envsub.json',
      );
    });
  });

  it('never takes the development variant for a sub-conf only inherited from the environment', () => {
    // The env-var fallback keeps its gate: a production deploy that merely carries
    // DEPLOY_SUB_CONF must not start reading a dev conf because of it. Only a caller that
    // names the sub-conf overrides the environment.
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    withEnv({ NODE_ENV: 'production', DEPLOY_SUB_CONF: 'envsub' }, () => {
      expect(getConfFilePath('dd-core', 'server')).to.equal('./engine-private/replica/dd-core/conf.server.json');
    });
  });

  it('never takes a development variant for a conf type that has none', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    withEnv({ NODE_ENV: 'development' }, () => {
      for (const confType of ['client', 'ssr', 'cron'])
        expect(getConfFilePath('dd-core', confType, 'local'), confType).to.equal(
          `./engine-private/replica/dd-core/conf.${confType}.json`,
        );
    });
  });

  it('carries the sub-conf into the build rather than re-deriving it from the environment', () => {
    // `client` accepts `[sub-conf]` but the two reads that actually drive the build used to take
    // it from DEPLOY_SUB_CONF, so a build could read a different conf.server than the loadConf
    // its caller had just run — and did, whenever the ambient environment was not development.
    const clientSource = fs.readFileSync(new URL('../../src/cli/client.js', import.meta.url), 'utf8');
    const buildSource = fs.readFileSync(new URL('../../src/client-builder/client-build.js', import.meta.url), 'utf8');
    expect(clientSource).to.include(
      "readConfJson(resolvedDeployId, 'server', { subConf: subConf ?? '', loadReplicas: true })",
    );
    expect(clientSource).to.include("subConf: subConf ?? '',");
    for (const call of [
      "readConfJson(deployId, 'client', { subConf })",
      "readConfJson(deployId, 'server', { subConf, loadReplicas: true })",
      "readConfJson(deployId, 'ssr', { subConf })",
    ])
      expect(buildSource, call).to.include(call);
  });

  it('names the missing file rather than failing on a parse', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(() => readConfJson('dd-core', 'cron')).to.throw('configuration file not found');
  });

  it('resolves env references only when asked to', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ token: 'env:CONF_FIXTURE_TOKEN' }));
    withEnv({ CONF_FIXTURE_TOKEN: 'abc', NODE_ENV: 'production' }, () => {
      expect(readConfJson('dd-core', 'cron')).to.deep.equal({ token: 'env:CONF_FIXTURE_TOKEN' });
      expect(readConfJson('dd-core', 'cron', { resolve: true })).to.deep.equal({ token: 'abc' });
    });
  });
});

describe('deploy value helpers', () => {
  it('derives the replica deploy id from the replica path', () => {
    expect(buildReplicaId({ deployId: 'dd-core', replica: '/blue' })).to.equal('dd-core-blue');
  });

  // A floor would silently override an explicit lower request, which is what
  // made `--replicas 2` deploy three MongoDB members.
  it('takes a positive integer replica count and falls back otherwise', () => {
    expect(resolveReplicaCount('3')).to.equal(3);
    expect(resolveReplicaCount(2, 5)).to.equal(2);
    expect(resolveReplicaCount('0', 5)).to.equal(5);
    expect(resolveReplicaCount('-1', 5)).to.equal(5);
    expect(resolveReplicaCount(undefined)).to.equal(1);
    expect(resolveReplicaCount('abc', 4)).to.equal(4);
  });

  it('generates a password satisfying every validation class', () => {
    for (const length of [8, 16, 32]) {
      const password = generateSecurePassword(length);
      expect(password.length).to.equal(length);
      expect(/[a-z]/.test(password), password).to.equal(true);
      expect(/[A-Z]/.test(password), password).to.equal(true);
      expect(/[0-9]/.test(password), password).to.equal(true);
      expect(/[@#$%^&*()_+]/.test(password), password).to.equal(true);
    }
  });

  it('raises a password shorter than the minimum rather than emitting one', () => {
    expect(generateSecurePassword(4).length).to.equal(8);
    expect(generateSecurePassword().length).to.equal(16);
  });

  it('never repeats a generated password', () => {
    const generated = new Set(Array.from({ length: 25 }, () => generateSecurePassword(16)));
    expect(generated.size).to.equal(25);
  });

  it('lists every SSR source a conf declares', () => {
    expect(
      getPathsSSR({
        head: ['Meta'],
        body: ['Menu'],
        mailer: { confirm: 'ConfirmEmail' },
        views: [{ client: 'Home' }],
      }),
    ).to.deep.equal([
      'src/client/ssr/RootDocument.js',
      'src/client/ssr/head/Meta.js',
      'src/client/ssr/body/Menu.js',
      'src/client/ssr/mailer/ConfirmEmail.js',
      'src/client/ssr/views/Home.js',
    ]);
  });

  it('tolerates a conf that declares no views', () => {
    expect(getPathsSSR({ head: [], body: [], mailer: {} })).to.deep.equal(['src/client/ssr/RootDocument.js']);
  });
});

describe('deploy monitor wait', () => {
  afterEach(() => vi.restoreAllMocks());

  // Both keys this reads — `container-status` and the `await-deploy` boot latch — are
  // container-scoped, so the whole wait resolves against the state store and never touches the
  // host configuration store a host-domain action is free to clear underneath it.
  it('returns false as soon as a container reports an error', async () => {
    vi.spyOn(UnderpostState.API, 'get').mockImplementation((key) => (key === 'container-status' ? 'error' : ''));
    vi.spyOn(UnderpostState.API, 'set').mockImplementation(() => undefined);
    expect(await awaitDeployMonitor(true, 1)).to.equal(false);
  });

  it('returns true once nothing is awaiting a deploy', async () => {
    vi.spyOn(UnderpostState.API, 'set').mockImplementation(() => undefined);
    vi.spyOn(UnderpostState.API, 'get').mockReturnValue('');
    expect(await awaitDeployMonitor(false, 1)).to.equal(true);
  });

  it('keeps polling while a deploy is still marked awaiting', async () => {
    vi.spyOn(UnderpostState.API, 'set').mockImplementation(() => undefined);
    let remaining = 2;
    vi.spyOn(UnderpostState.API, 'get').mockImplementation((key) => {
      if (key === 'container-status') return '';
      return remaining-- > 0 ? '2026-01-01T00:00:00.000Z' : '';
    });
    expect(await awaitDeployMonitor(false, 1)).to.equal(true);
    expect(remaining).to.be.below(0);
  });

  it('never reaches for the host configuration store', () => {
    // `host load` cleans that file before repopulating it and `host clean` removes it outright,
    // both while a deployment may be mid-boot. A latch held there is one a host operation can
    // silently drop.
    const source = readFileSync(new URL('../../src/server/runtime/conf.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('const awaitDeployMonitor ='), source.indexOf('const mergeFile ='));
    expect(body).to.not.include('Underpost.host');
    expect(body).to.include('latchAwaitDeploy()');
    expect(body).to.include('isAwaitingDeploy()');
  });
});

describe('single replica port offsets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reserves no ports when the path declares no replicas', async () => {
    expect(await getInstanceContext({ deployId: 'dd-core', singleReplica: false, replicas: [] })).to.deep.equal({
      redirectTarget: undefined,
      singleReplicaOffsetPortSum: 0,
    });
  });

  it('estimates one port per replica, plus one for peer, before the replicas are built', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { singleReplicaOffsetPortSum } = await getInstanceContext({
      deployId: 'dd-core',
      singleReplica: true,
      replicas: ['/blue', '/green'],
      peer: true,
    });
    expect(singleReplicaOffsetPortSum).to.equal(4);
  });

  it('counts the ports the built replica conf actually declares', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ 'a.test': { '/': { peer: true }, '/admin': {} } }));
    const { singleReplicaOffsetPortSum } = await getInstanceContext({
      deployId: 'dd-core',
      singleReplica: true,
      replicas: ['/blue'],
    });
    expect(singleReplicaOffsetPortSum).to.equal(3);
  });

  it('strips the trailing slash off a redirect target', async () => {
    const { redirectTarget } = await getInstanceContext({ deployId: 'dd-core', redirect: 'https://www.app.test/' });
    expect(redirectTarget).to.equal('https://www.app.test');
    expect(
      (await getInstanceContext({ deployId: 'dd-core', redirect: 'https://www.app.test' })).redirectTarget,
    ).to.equal('https://www.app.test');
  });
});

describe('dev proxy context', () => {
  it('detects the proxy invocation off the command line', () => {
    expect(withArgv(['proxy', 'dd-core'], isDevProxyContext)).to.equal(true);
    expect(withArgv(['dd-core'], isDevProxyContext)).to.equal(false);
  });

  it('enables TLS only outside production and only when asked', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
      expect(withArgv(['proxy', 'tls'], isTlsDevProxy)).to.equal(true);
      expect(withArgv(['proxy'], isTlsDevProxy)).to.equal(false);
    });
    withEnv({ NODE_ENV: 'production' }, () => {
      expect(withArgv(['proxy', 'tls'], isTlsDevProxy)).to.equal(false);
    });
  });

  it('drops the port from the host when the offset lands on the default one', () => {
    withEnv({ DEV_PROXY_PORT_OFFSET: '0' }, () => {
      expect(devProxyHostFactory({ host: 'app.test', port: 80 })).to.equal('app.test');
      expect(devProxyHostFactory({ host: 'app.test', port: 443, tls: true })).to.equal('app.test');
    });
  });

  it('carries the offset port and the scheme when asked', () => {
    withEnv({ DEV_PROXY_PORT_OFFSET: '8000' }, () => {
      expect(devProxyHostFactory({ host: 'app.test', port: 80, includeHttp: true })).to.equal('http://app.test:8080');
      expect(devProxyHostFactory({ host: 'app.test', port: 443, tls: true, includeHttp: true })).to.equal(
        'https://app.test:8443',
      );
    });
  });

  it('falls back to localhost and the scheme default port', () => {
    withEnv({ DEV_PROXY_PORT_OFFSET: '0' }, () => {
      expect(devProxyHostFactory({ host: '', tls: true })).to.equal('localhost');
      expect(devProxyHostFactory({})).to.equal('localhost');
    });
  });

  it('reduces the conf hosts to their unique hostnames', () => {
    expect(getTlsHosts({ 'app.test': {}, 'app.test:443': {}, 'api.test': {} })).to.deep.equal(['app.test', 'api.test']);
  });
});

describe('cluster context', () => {
  it('names the selected cluster runtime, defaulting to kind', () => {
    expect(clusterTypeFactory({ k3s: true })).to.equal('k3s');
    expect(clusterTypeFactory({ kubeadm: true })).to.equal('kubeadm');
    expect(clusterTypeFactory({})).to.equal('kind');
    expect(clusterTypeFactory({}, 'kubeadm')).to.equal('kubeadm');
  });

  it('turns a cluster type back into mutually exclusive runner flags', () => {
    expect(clusterContextFactory('kubeadm')).to.deep.equal({ kind: false, kubeadm: true, k3s: false });
    expect(clusterContextFactory('kind')).to.deep.equal({ kind: true, kubeadm: false, k3s: false });
    expect(clusterContextFactory('k3s')).to.deep.equal({ kind: false, kubeadm: false, k3s: true });
  });

  // The Gateway API is the platform routing stack; the Contour set is what a
  // caller opts into, never what a missing flag falls back to.
  it('routes through the Gateway API unless it is explicitly disabled', () => {
    expect(gatewayApiEnabledFactory({})).to.equal(true);
    expect(gatewayApiEnabledFactory({ gatewayApi: true })).to.equal(true);
    expect(gatewayApiEnabledFactory({ disableGatewayApi: true })).to.equal(false);
    expect(gatewayApiEnabledFactory({ gatewayApi: true, disableGatewayApi: true })).to.equal(true);
  });
});

describe('expose port planning', () => {
  const RESOURCE = { NAME: 'app-svc', 'PORT(S)': '8080:32080/TCP,53/UDP,9090/TCP' };

  it('reads only TCP service ports off a kubectl row', () => {
    expect(exposeTcpPortsFactory(RESOURCE)).to.deep.equal([8080, 9090]);
    expect(exposeTcpPortsFactory({})).to.deep.equal([]);
    expect(exposeTcpPortsFactory()).to.deep.equal([]);
  });

  it('parses a comma separated resource path into literal name fragments', () => {
    expect(exposePathPartsFactory('app, worker ')).to.deep.equal(['app', 'worker']);
  });

  it('refuses an empty path and any fragment that is not a literal resource name', () => {
    expect(() => exposePathPartsFactory('')).to.throw('requires a Service or Pod name');
    expect(() => exposePathPartsFactory(' , ')).to.throw('requires a Service or Pod name');
    expect(() => exposePathPartsFactory('app;rm -rf /')).to.throw('Invalid Kubernetes resource name match');
    expect(() => exposePathPartsFactory('app*')).to.throw('Invalid Kubernetes resource name match');
  });

  it('orders matches by requested fragment, exact name first, then lexically', () => {
    const resources = [
      { NAME: 'worker-2' },
      { NAME: 'app-blue' },
      { NAME: 'app' },
      { NAME: 'worker-1' },
      { NAME: 'unrelated' },
    ];
    expect(exposePartialMatchesFactory(resources, ['app', 'worker']).map(({ NAME }) => NAME)).to.deep.equal([
      'app',
      'app-blue',
      'worker-1',
      'worker-2',
    ]);
    expect(resources[0].NAME).to.equal('worker-2');
  });

  it('parses a CLI port list and rejects anything outside a TCP port', () => {
    expect(exposePortListFactory('8080, 9090')).to.deep.equal([8080, 9090]);
    expect(exposePortListFactory('')).to.deep.equal([]);
    expect(exposePortListFactory(undefined)).to.deep.equal([]);
    expect(exposePortListFactory(null)).to.deep.equal([]);
    expect(exposePortListFactory(8080)).to.deep.equal([8080]);
    expect(() => exposePortListFactory('8080,')).to.throw('Invalid ports');
    expect(() => exposePortListFactory('0')).to.throw('Invalid ports');
    expect(() => exposePortListFactory('65536')).to.throw('Invalid ports');
    expect(() => exposePortListFactory('abc', 'host-ports')).to.throw('Invalid host-ports');
  });

  it('forwards every declared port of a single resource onto the same local port', () => {
    expect(exposePortPlanFactory({ resources: [RESOURCE], kindType: 'svc' })).to.deep.equal([
      { kindType: 'svc', name: 'app-svc', localPort: 8080, remotePort: 8080 },
      { kindType: 'svc', name: 'app-svc', localPort: 9090, remotePort: 9090 },
    ]);
  });

  it('maps explicit container and host ports pairwise for one resource', () => {
    expect(
      exposePortPlanFactory({
        resources: [RESOURCE],
        kindType: 'svc',
        containerPorts: [8080, 9090],
        hostPorts: [18080, 19090],
      }),
    ).to.deep.equal([
      { kindType: 'svc', name: 'app-svc', localPort: 18080, remotePort: 8080 },
      { kindType: 'svc', name: 'app-svc', localPort: 19090, remotePort: 9090 },
    ]);
  });

  it('maps host ports onto the declared ports they name', () => {
    expect(exposePortPlanFactory({ resources: [RESOURCE], kindType: 'svc', hostPorts: [9090] })).to.deep.equal([
      { kindType: 'svc', name: 'app-svc', localPort: 9090, remotePort: 9090 },
    ]);
  });

  it('falls back to the declared ports when a host port names none of them', () => {
    expect(exposePortPlanFactory({ resources: [RESOURCE], kindType: 'svc', hostPorts: [19090] })).to.deep.equal([
      { kindType: 'svc', name: 'app-svc', localPort: 19090, remotePort: 8080 },
    ]);
  });

  it('maps ports by resource index across several resources', () => {
    const resources = [{ NAME: 'a' }, { NAME: 'b' }];
    expect(
      exposePortPlanFactory({ resources, kindType: 'pod', containerPorts: [80, 81], hostPorts: [8080, 8081] }),
    ).to.deep.equal([
      { kindType: 'pod', name: 'a', localPort: 8080, remotePort: 80 },
      { kindType: 'pod', name: 'b', localPort: 8081, remotePort: 81 },
    ]);
  });

  it('walks an automatic host port past one already taken', () => {
    const resources = [
      { NAME: 'a', 'PORT(S)': '8080/TCP' },
      { NAME: 'b', 'PORT(S)': '8080/TCP' },
    ];
    expect(exposePortPlanFactory({ resources, kindType: 'svc' })).to.deep.equal([
      { kindType: 'svc', name: 'a', localPort: 8080, remotePort: 8080 },
      { kindType: 'svc', name: 'b', localPort: 8081, remotePort: 8080 },
    ]);
  });

  it('refuses a port list that cannot map onto the matched resources', () => {
    const resources = [{ NAME: 'a' }, { NAME: 'b' }];
    expect(() => exposePortPlanFactory({ resources, kindType: 'svc', containerPorts: [80] })).to.throw(
      'requires 2 ports for 2 resources',
    );
    expect(() => exposePortPlanFactory({ resources, kindType: 'svc', hostPorts: [80] })).to.throw(
      'requires 2 ports for 2 resources',
    );
  });

  it('refuses a resource with no declared port and no explicit one', () => {
    expect(() => exposePortPlanFactory({ resources: [{ NAME: 'a' }], kindType: 'svc' })).to.throw(
      'No declared TCP port for svc/a',
    );
  });

  it('refuses mismatched host and container port counts on one resource', () => {
    expect(() =>
      exposePortPlanFactory({
        resources: [RESOURCE],
        kindType: 'svc',
        containerPorts: [8080, 9090],
        hostPorts: [18080],
      }),
    ).to.throw('Host/container port counts differ');
  });

  it('refuses to bind one explicit host port twice', () => {
    const resources = [{ NAME: 'a' }, { NAME: 'b' }];
    expect(() =>
      exposePortPlanFactory({ resources, kindType: 'svc', containerPorts: [80, 81], hostPorts: [8080, 8080] }),
    ).to.throw('Duplicate --expose-host-ports value: 8080');
  });

  it('refuses when no automatic host port remains below the top of the range', () => {
    const resources = [{ NAME: 'a' }, { NAME: 'b' }];
    expect(() => exposePortPlanFactory({ resources, kindType: 'svc', portsOf: () => [65535] })).to.throw(
      'No valid host port remains',
    );
  });

  it('takes a declared-port resolver of its own', () => {
    expect(
      exposePortPlanFactory({ resources: [{ NAME: 'a' }], kindType: 'pod', portsOf: () => [3000, 3000] }),
    ).to.deep.equal([{ kindType: 'pod', name: 'a', localPort: 3000, remotePort: 3000 }]);
  });
});

describe('port readiness wait', () => {
  it('reports a listening port as soon as it accepts', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      expect(await waitForPort({ port: server.address().port, timeoutMs: 2000, intervalMs: 10 })).to.equal(true);
    } finally {
      server.close();
    }
  });

  it('reports a closed port when waiting for one to go down', async () => {
    expect(await waitForPort({ port: 1, open: false, timeoutMs: 2000, intervalMs: 10 })).to.equal(true);
  });

  it('gives up once the window closes', async () => {
    expect(await waitForPort({ port: 1, open: true, timeoutMs: 30, intervalMs: 10, connectTimeoutMs: 10 })).to.equal(
      false,
    );
  });
});

describe('private conf sync', () => {
  const CRON_ID_PATH = './engine-private/deploy/dd.cron';
  let commands;

  // `existsSync` is answered per path, never blanket-true: the sync reads the cron deploy id
  // straight after its own existence check, so a blanket answer fabricates
  // `engine-private/deploy/dd.cron` and sends the read at whatever the runner happens to have
  // cloned — present on a full checkout, absent in CI. `cronId` states which case is under test.
  const checkout = ({ present, cronId = null }) => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) =>
      `${filePath}` === CRON_ID_PATH ? cronId !== null : present,
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...rest) => {
      if (`${filePath}` === CRON_ID_PATH) return `${cronId}\n`;
      return readFileSync(filePath, ...rest);
    });
  };

  beforeEach(() => {
    commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      return { code: 0, stdout: '', stderr: '', toString: () => '' };
    });
    vi.spyOn(fs, 'removeSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'copySync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'moveSync').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('clones the private repository when the checkout is missing', () => {
    checkout({ present: false });
    withEnv({ GITHUB_USERNAME: 'fixture-org' }, () => syncPrivateConf('dd-core'));
    expect(commands[0]).to.equal('cd .. && underpost clone fixture-org/engine-core-private');
    expect(commands.some((command) => command.includes('underpost push . fixture-org/engine-core-private'))).to.equal(
      true,
    );
  });

  it('resets an existing checkout rather than cloning over it', () => {
    checkout({ present: true, cronId: 'dd-cron' });
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    withEnv({ GITHUB_USERNAME: 'fixture-org' }, () => syncPrivateConf('dd-core'));
    expect(commands.some((command) => command.includes('git checkout . && git clean -f -d'))).to.equal(true);
    expect(commands.some((command) => command.includes('underpost clone'))).to.equal(false);
  });

  it('mirrors only the payload entries belonging to the deploy', () => {
    const copied = [];
    checkout({ present: true, cronId: 'dd-cron' });
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['dd-core-blue', 'dd-other-green']);
    vi.spyOn(fs, 'copySync').mockImplementation((src, dest) => copied.push(`${src} -> ${dest}`));
    withEnv({ GITHUB_USERNAME: 'fixture-org' }, () => syncPrivateConf('dd-core', ['catalog/items.json']));
    expect(copied).to.include('./engine-private/replica/dd-core-blue -> ../engine-core-private/replica/dd-core-blue');
    expect(copied.some((entry) => entry.includes('dd-other-green'))).to.equal(false);
    expect(copied).to.include('./engine-private/catalog/items.json -> ../engine-core-private/catalog/items.json');
  });

  it('mirrors the cron conf the checkout declares', () => {
    const copied = [];
    checkout({ present: true, cronId: 'dd-cron' });
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'copySync').mockImplementation((src, dest) => copied.push(`${src} -> ${dest}`));
    withEnv({ GITHUB_USERNAME: 'fixture-org' }, () => syncPrivateConf('dd-core'));
    expect(copied).to.include('./engine-private/conf/dd-cron -> ../engine-core-private/conf/dd-cron');
  });

  // A checkout with no `deploy/dd.cron` is the CI one. Mirroring `conf/null` fails the whole
  // sync over an optional the deploy never declared.
  it('mirrors no cron conf when the checkout declares none', () => {
    const copied = [];
    checkout({ present: true });
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
    vi.spyOn(fs, 'copySync').mockImplementation((src, dest) => copied.push(`${src} -> ${dest}`));
    withEnv({ GITHUB_USERNAME: 'fixture-org' }, () => syncPrivateConf('dd-core'));
    expect(copied.some((entry) => entry.includes('null'))).to.equal(false);
    expect(commands.some((command) => command.includes('underpost push . fixture-org/engine-core-private'))).to.equal(
      true,
    );
  });

  it('reports that a deploy declares no public sources to move', () => {
    expect(syncDeployIdSources()).to.equal(false);
    expect(syncDeployIdSources([])).to.equal(false);
  });

  it('moves every declared source that is present, skipping the rest', () => {
    const moved = [];
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => `${filePath}`.includes('present'));
    vi.spyOn(fs, 'moveSync').mockImplementation((src, dest) => moved.push(`${src} -> ${dest}`));
    expect(
      syncDeployIdSources([
        ['src/present.js', 'src/api/present.js'],
        ['src/absent.js', 'src/api/absent.js'],
      ]),
    ).to.equal(true);
    expect(moved).to.deep.equal(['src/present.js -> src/api/present.js']);
  });
});

describe('template checkout identity', () => {
  let commands;

  beforeEach(() => {
    commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const stdout = command.includes('remote.origin.url')
        ? 'https://github.com/underpostnet/pwa-microservices-template.git\n'
        : '';
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reads the repository name off the checkout origin', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(gitOriginRepositoryName('../pwa-microservices-template')).to.equal('pwa-microservices-template');
  });

  it('reports no repository for a path that is not a work tree', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(gitOriginRepositoryName('../nothing')).to.equal(null);
  });

  it('reports no repository when the checkout declares no origin', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(shell, 'exec').mockReturnValue({ code: 1, stdout: '', stderr: '', toString: () => '' });
    expect(gitOriginRepositoryName('../detached')).to.equal(null);
  });

  it('leaves a checkout that already is the template alone', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(ensureTemplateCheckout({ toPath: '../pwa-microservices-template' })).to.equal(false);
    expect(commands.some((command) => command.includes('clone'))).to.equal(false);
  });

  // Publishing steps swap the checkout's `.git` for a product repository's, so
  // a build that trusted whatever it found would read another product's identity
  // back into the base template package.json.
  it('refuses to reuse a foreign checkout under --no-clone', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(shell, 'exec').mockReturnValue({
      code: 0,
      stdout: 'git@github.com:o/engine-core.git\n',
      toString: () => '',
    });
    expect(() => ensureTemplateCheckout({ toPath: '../x', noClone: true })).to.throw('is not a');
  });

  it('stages a clone and swaps it in only once it is complete', () => {
    const origins = new Map();
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix) => `${prefix}stage`);
    vi.spyOn(fs, 'removeSync').mockImplementation(() => undefined);
    const moved = [];
    vi.spyOn(fs, 'moveSync').mockImplementation((src, dest) => moved.push(`${src} -> ${dest}`));
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const stdout = command.includes('remote.origin.url')
        ? origins.get(command) || (command.includes('stage') ? 'o/pwa-microservices-template.git' : 'o/engine-core.git')
        : '';
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });

    expect(ensureTemplateCheckout({ toPath: '../pwa-microservices-template', githubUsername: 'fixture-org' })).to.equal(
      true,
    );
    expect(commands.some((command) => command.includes('clone fixture-org/pwa-microservices-template'))).to.equal(true);
    expect(moved.length).to.equal(1);
  });

  it('fails when the staged clone is not the template either', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix) => `${prefix}stage`);
    vi.spyOn(fs, 'removeSync').mockImplementation(() => undefined);
    vi.spyOn(shell, 'exec').mockReturnValue({ code: 0, stdout: 'o/engine-core.git', toString: () => '' });
    expect(() => ensureTemplateCheckout({ toPath: '../x' })).to.throw('could not clone');
  });

  it('empties the work tree of everything a build reconstructs', () => {
    const removed = [];
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['.git', 'node_modules', 'src', 'package.json']);
    vi.spyOn(fs, 'removeSync').mockImplementation((filePath) => removed.push(`${filePath}`));
    pruneTemplateWorkTree('../template', ['.git', 'node_modules']);
    expect(removed).to.deep.equal(['../template/src', '../template/package.json']);
  });
});

describe('private template publishing', () => {
  let commands;

  const stubShell = (hasChanges) => {
    commands = [];
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      commands.push(command);
      const stdout = command.includes('--has-changes') ? hasChanges : '';
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });
  };

  afterEach(() => vi.restoreAllMocks());

  it('commits and pushes the private template only when it changed', async () => {
    stubShell('1');
    await updatePrivateTemplateRepo();
    expect(commands.some((command) => command.includes("git commit -m 'Update template'"))).to.equal(true);
  });

  it('leaves the private template alone when nothing changed', async () => {
    stubShell('0');
    await updatePrivateTemplateRepo();
    expect(commands.some((command) => command.includes('git commit'))).to.equal(false);
  });

  it('refuses to publish a test repo before the template is assembled', async () => {
    stubShell('1');
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    await expect(updatePrivateEngineTestRepo('dd-core')).rejects.toThrow('assemble the template first');
  });

  it('publishes the assembled template from a work tree of its own', async () => {
    stubShell('1');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const copied = [];
    vi.spyOn(fs, 'copySync').mockImplementation((src, dest, options) => copied.push({ src, dest, options }));
    await withEnv({ GITHUB_USERNAME: 'fixture-org' }, () => updatePrivateEngineTestRepo('dd-core'));

    expect(
      commands.some((command) => command.includes('underpost clone --bare fixture-org/engine-test-core')),
    ).to.equal(true);
    expect(copied[0].dest).to.equal('/home/dd/engine-test-core');
    // The template's own git history and installed modules belong to the
    // checkout, not to the published source.
    expect(copied[0].options.filter('/home/dd/pwa-microservices-template/.git')).to.equal(false);
    expect(copied[0].options.filter('/home/dd/pwa-microservices-template/node_modules/x')).to.equal(false);
    expect(copied[0].options.filter('/home/dd/pwa-microservices-template/src/index.js')).to.equal(true);
    expect(commands.some((command) => command.includes("git commit -m 'Update engine-test-core'"))).to.equal(true);
  });

  it('reports nothing to publish when the test repo is up to date', async () => {
    stubShell('0');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'copySync').mockImplementation(() => undefined);
    await updatePrivateEngineTestRepo('dd-core');
    expect(commands.some((command) => command.includes('git commit'))).to.equal(false);
  });
});

describe('CLI documentation', () => {
  const HELP_ROOT = [
    'Usage: underpost [options] [command]',
    'Underpost CI/CD CLI v3.2.9',
    '',
    'Options:',
    '  -V, --version          output the version number',
    '  -h, --help             display help',
    '',
    'Commands:',
    '  cron [options] <deploy-list>   Cron jobs management,',
    '                                 scheduled on the cluster',
    '  help [command]                 display help for command',
    '',
  ].join('\n');

  const HELP_CRON = [
    'Usage: underpost cron [options] <deploy-list> <job-list>',
    'Cron jobs management',
    '',
    'Arguments:',
    '  deploy-list            Comma separated deploy ids',
    '',
    'Options:',
    '  --apply                Apply the manifests',
    '',
  ].join('\n');

  afterEach(() => vi.restoreAllMocks());

  it('renders the command index and per command reference from commander help', () => {
    const written = new Map();
    vi.spyOn(shell, 'exec').mockImplementation((command) => {
      const stdout = command.includes('help cron') ? HELP_CRON : HELP_ROOT;
      return { code: 0, stdout, stderr: '', toString: () => stdout };
    });
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      ['# Engine v3.2.9', '<!-- cli-index-start -->', 'stale', '<!-- cli-index-end -->', 'tail'].join('\n'),
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));

    buildCliDoc({ commands: [{ _name: 'cron' }, { _name: 'help' }] }, '3.2.9', '3.3.0');

    const cliHelp = written.get('./CLI-HELP.md');
    expect(cliHelp).to.include('## Underpost CLI');
    expect(cliHelp).to.include('> Underpost CI/CD CLI v3.3.0');
    expect(cliHelp).to.include('| [`cron`](#underpost-cron) | Cron jobs management, scheduled on the cluster |');
    expect(cliHelp).to.include('### underpost cron');
    expect(cliHelp).to.include('#### Arguments');
    expect(cliHelp).to.include('#### Options');
    // The index only lists commands; `help` is commander's own and never a
    // documented one.
    expect(cliHelp).not.to.include('### underpost help');
    expect(written.get('./src/client/public/nexodev/docs/references/Command Line Interface.md')).to.equal(cliHelp);

    const readme = written.get('./README.md');
    expect(readme).to.include('# Engine v3.3.0');
    expect(readme).to.include('(CLI-HELP.md#underpost-cron)');
    expect(readme).not.to.include('stale');
    expect(readme.endsWith('tail')).to.equal(true);
  });

  it('leaves a README carrying no CLI index tags alone apart from the version', () => {
    const written = new Map();
    vi.spyOn(shell, 'exec').mockReturnValue({ code: 0, stdout: HELP_ROOT, toString: () => HELP_ROOT });
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# Engine v3.2.9\n');
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => written.set(`${filePath}`, `${value}`));

    buildCliDoc({ commands: [] }, '3.2.9', '3.3.0');

    expect(written.get('./README.md')).to.equal('# Engine v3.3.0\n');
  });
});
