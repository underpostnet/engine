'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import Underpost from '../../../../src/index.js';
import { program } from '../../../../src/cli/index.js';
import { shellHarness } from '../../../support/shell-harness.js';

const host = () => Underpost.host;

describe('underpost-config secret', () => {
  describe('env file sanitization', () => {
    it('keeps NODE_ENV so the pod resolves the deployed environment', () => {
      // Regression: NODE_ENV matched the `NODE_` reserved prefix and was stripped, so the
      // Secret carried no environment, `--create-from-env` never saw one, and loadConf fell
      // back to `development` on every deploy.
      const sanitized = host().sanitizeEnvFile('NODE_ENV=production\nDEPLOY_ID=dd-core\n');
      expect(sanitized).to.match(/^NODE_ENV=production$/m);
      expect(sanitized).to.match(/^DEPLOY_ID=dd-core$/m);
    });

    it('still strips shell- and Kubernetes-critical keys', () => {
      const sanitized = host().sanitizeEnvFile(
        ['PATH=/injected/bin', 'HOME=/injected', 'NODE_OPTIONS=--max-old-space-size=8192', 'KUBERNETES_PORT=443'].join(
          '\n',
        ),
      );
      for (const key of ['PATH', 'HOME', 'NODE_OPTIONS', 'KUBERNETES_PORT'])
        expect(sanitized, key).to.not.match(new RegExp(`^${key}=`, 'm'));
    });

    it('preserves blank lines and comments', () => {
      expect(host().sanitizeEnvFile('# header\n\nA=1\n')).to.equal('# header\n\nA=1\n');
    });
  });

  describe('published env file selection', () => {
    it('targets the cron deploy env file for the requested environment', () => {
      for (const env of ['production', 'development', 'test'])
        expect(host().envPath(env)).to.match(new RegExp(`^\\./engine-private/conf/[a-zA-Z0-9._-]+/\\.env\\.${env}$`));
    });

    it('resolves the same cron deploy for every environment', () => {
      const deployOf = (env) => host().envPath(env).split('/')[3];
      expect(deployOf('production')).to.equal(deployOf('development'));
    });
  });

  it('is owned by the secret layer, with no parallel deploy-side implementation', () => {
    expect(host().apply).to.be.a('function');
    expect(Underpost.deploy.configMap).to.equal(undefined);
    // Every domain carries the identical canonical action set.
    for (const domain of [Underpost.secret, Underpost.host, Underpost.app])
      for (const action of ['setup', 'load', 'publish', 'apply', 'status', 'rotate', 'clean'])
        expect(domain[action], action).to.be.a('function');
  });

  // Regression: `apply`, `status` and `publish` read/wrote `envPath()` directly — the legacy,
  // now-retired unsplit file — instead of composing through `read()`/`sourceLabel()`. On a node
  // the scope migration has already run on, `deploy sync` failed at the exact line the real hub
  // hit: `[host] configuration source not found: ./engine-private/conf/dd-cron/.env.production`,
  // even though 86 keys were sitting right there in the scoped sources.
  describe('post-migration source resolution', () => {
    // The migrated node is a fixture rather than this checkout's private tree: what is asserted
    // is how the three actions compose their source, and reading the real tree made these cases
    // answer to a migration an operator may not have run, may be part-way through, or may not
    // have cloned at all — the same reason `config-scope.test.js` fixes the state it asserts on.
    const MIGRATED_NODE = {
      host: { GITHUB_TOKEN: 'host-github' },
      cron: { DDNS_API_KEY: 'cron-ddns' },
      app: { DB_PASSWORD: 'app-secret' },
    };
    const scopedValues = () => Object.assign({}, ...Object.values(MIGRATED_NODE));
    const renderScope = (values) =>
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}\n`)
        .join('');

    beforeEach(() => {
      const table = new Map(
        Object.entries(MIGRATED_NODE).map(([scope, values]) => [
          host().scopePath(scope, 'production'),
          renderScope(values),
        ]),
      );
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => table.has(`${filePath}`));
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        const key = `${filePath}`;
        if (!table.has(key)) throw Object.assign(new Error(`ENOENT: ${key}`), { code: 'ENOENT' });
        return table.get(key);
      });
      vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, value) => table.set(`${filePath}`, `${value}`));
      vi.spyOn(fs, 'mkdirpSync').mockImplementation(() => undefined);
      vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);
      // `publish` writes the node's loaded runtime back out, so the store answers for it here.
      vi.spyOn(host().store, 'list').mockReturnValue(scopedValues());
      // `status` probes the cluster for the projection; the fixture answers for that too.
      shellHarness();
    });

    afterEach(() => vi.restoreAllMocks());

    it('does not require the legacy file once scoped sources cover the environment', () => {
      expect(host().hasDualSource('production')).to.equal(false);
      expect(fs.existsSync(host().envPath('production'))).to.equal(false);
      expect(Object.keys(host().read('production')).length).to.be.greaterThan(0);
    });

    it('apply resolves the source through read(), not the legacy path', () => {
      expect(() => host().apply({ env: 'production', namespace: 'default', dryRun: true })).to.not.throw();
    });

    it('status reports the scoped sources as present and authoritative', () => {
      const report = host().status({ env: 'production', namespace: 'default' });
      expect(report.sourcePresent).to.equal(true);
      expect(report.keys).to.be.greaterThan(0);
      expect(report.source).to.include('/scopes/');
      expect(report.dualSource).to.equal(false);
    });

    it('publish refuses to silently overwrite an existing scoped source', () => {
      expect(() => host().publish({ env: 'production' })).to.throw('already exist');
      expect(fs.existsSync(host().envPath('production'))).to.equal(false);
    });

    it('publish never recreates the legacy source, even when forced', () => {
      expect(() => host().publish({ env: 'production', force: true, dryRun: true })).to.not.throw();
      expect(fs.existsSync(host().envPath('production'))).to.equal(false);
    });
  });
});

describe('ipfs cluster origin credentials', () => {
  const secret = () => Underpost.secret;

  it('registers an origin for every managed secret, leaving none unmapped', () => {
    // `--status` reports which source each managed Secret deploys from; a managed secret with
    // no registered origin and no env mapping reports `unmapped` and tells an operator nothing.
    for (const name of secret().managedSecrets()) {
      const seeded = Object.keys(secret().seedSources(name)).length > 0;
      const envMapped = Object.keys(secret().seedEnvKeys(name)).length > 0;
      expect(seeded || envMapped, `${name} has no registered origin`).to.equal(true);
    }
  });

  it('resolves both IPFS origin files from the deploy secret area', () => {
    const sources = secret().seedSources('ipfs-cluster-secret');
    expect(Object.keys(sources).sort()).to.deep.equal(['bootstrap-peer-priv-key', 'cluster-secret']);
    for (const path of Object.values(sources))
      expect(path, path).to.match(/^\.\/engine-private\/(deploy\/)?ipfs-cluster-/);
  });

  it('projects exactly the data keys the StatefulSet mounts', () => {
    const statefulset = fs.readFileSync(
      new URL('../../../../manifests/ipfs/statefulset.yaml', import.meta.url),
      'utf8',
    );
    const mounted = [...statefulset.matchAll(/name: ipfs-cluster-secret\s*\n\s*key: ([\w-]+)/g)].map((m) => m[1]);
    expect(mounted.sort()).to.deep.equal(Object.keys(secret().seedSources('ipfs-cluster-secret')).sort());
  });

  it('keeps the public peer id in the ConfigMap and out of the Secret', () => {
    const ipfsSource = fs.readFileSync(new URL('../../../../src/cli/ipfs.js', import.meta.url), 'utf8');
    expect(ipfsSource).to.include('--from-literal=bootstrap-peer-id=${IDENTITY_JSON.id}');
    // The private half must never be spelled into a command string.
    expect(ipfsSource).to.not.include('--from-literal=bootstrap-peer-priv-key');
    expect(ipfsSource).to.not.include('--from-literal=cluster-secret');
  });

  it('names no credential path of its own', () => {
    const ipfsSource = fs.readFileSync(new URL('../../../../src/cli/ipfs.js', import.meta.url), 'utf8');
    expect(ipfsSource).to.include('Underpost.secret.seedSources(IPFS_SECRET_NAME)');
    expect(ipfsSource).to.not.match(/['"`][^'"`]*engine-private\/ipfs-cluster/);
  });
});

describe('host configuration store access boundary', () => {
  const cliSource = fs.readFileSync(new URL('../../../../src/cli/index.js', import.meta.url), 'utf8');
  const hostSource = fs.readFileSync(new URL('../../../../src/cli/host.js', import.meta.url), 'utf8');

  it('reaches the store through the host domain rather than a command of its own', () => {
    const domainsSource = fs.readFileSync(new URL('../../../../src/cli/domains.js', import.meta.url), 'utf8');
    // A second top-level command over the same file is what `underpost config` was. The
    // operators are the host domain's now, so there is one command addressing that store.
    expect(cliSource).to.not.include("command('config')");
    expect(domainsSource).to.include("const DOMAIN_STORE_OPERATORS = ['get', 'set', 'delete', 'list'];");
    for (const operator of ['get', 'set', 'delete', 'list'])
      expect(typeof Underpost.host[operator], operator).to.equal('function');
    // `clean` is a canonical lifecycle action over the same file; `isInsideContainer` is a
    // runtime predicate. Neither is a per-key operation, so neither is a store operator.
    const operators = /const DOMAIN_STORE_OPERATORS = \[([^\]]*)\]/.exec(domainsSource)[1];
    for (const operator of ['clean', 'isInsideContainer']) expect(operators, operator).to.not.include(operator);
  });

  it('offers the key-level operators only to the domains that own a store', () => {
    const domainsSource = fs.readFileSync(new URL('../../../../src/cli/domains.js', import.meta.url), 'utf8');
    // The canonical seven are symmetric across every domain by construction; the operators are
    // opt-in, so a domain owning no key-value store never grows a key argument. `host` and
    // `state` own one each; `secret` and `app` own none.
    expect(domainsSource).to.include('store = false');
    const declared = (name) => {
      const start = cliSource.indexOf(`name: '${name}',`);
      return cliSource.slice(start, cliSource.indexOf('},', start)).includes('store: true');
    };
    for (const domain of ['host', 'state']) expect(declared(domain), domain).to.equal(true);
    for (const domain of ['secret', 'app']) expect(declared(domain), domain).to.equal(false);
    // And the command surface follows the declaration, not the API: `secret` happens to export
    // a `list` of its own, which must stay off the command as an operator.
    for (const domain of ['secret', 'app'])
      expect(program.commands.find((command) => command.name() === domain).registeredArguments).to.have.lengthOf(1);
    for (const domain of ['host', 'state'])
      expect(program.commands.find((command) => command.name() === domain).registeredArguments).to.have.lengthOf(3);
  });

  it('writes only the host configuration store, never a deployment env file', () => {
    // A deployment env file is the app domain's durable source; the host store never writes one.
    const storeBlock = hostSource.slice(
      hostSource.indexOf('store: dotenvStoreFactory({'),
      hostSource.indexOf('envPath(env = '),
    );
    expect(storeBlock).to.not.include('engine-private/conf/');
    expect(storeBlock).to.include('${getUnderpostRootPath()}/.env');
  });

  it('keeps the operators the instance status transport depends on', () => {
    // Lifecycle hooks stamp `container-status` and the monitor reads it back over kubectl exec.
    for (const operator of ['get', 'set']) expect(Underpost.host.store[operator]).to.be.a('function');
  });
});

describe('container state store', () => {
  const cliSource = fs.readFileSync(new URL('../../../../src/cli/index.js', import.meta.url), 'utf8');
  const statusSource = fs.readFileSync(
    new URL('../../../../src/server/runtime/runtime-status.js', import.meta.url),
    'utf8',
  );

  it('resolves to its own file, never the host configuration store', () => {
    expect(Underpost.state.path()).to.not.equal(Underpost.host.store.path());
    expect(Underpost.state.path()).to.match(/\.state$/);
    expect(Underpost.host.store.path()).to.match(/\.env$/);
  });

  it('holds the boot latch, not the host configuration store', () => {
    // `await-deploy` is container-scoped: set when a runtime starts configuring itself, cleared
    // when it is listening. Held in the host store it was erased by `host load` (which cleans
    // the file before repopulating it) and by the `host clean` the start pipeline runs once a
    // production deployment is serving — both host-domain operations that know nothing about it.
    const confSource = fs.readFileSync(new URL('../../../../src/server/runtime/conf.js', import.meta.url), 'utf8');
    const runtimeSource = fs.readFileSync(
      new URL('../../../../src/server/runtime/runtime.js', import.meta.url),
      'utf8',
    );
    for (const [name, source] of [
      ['conf.js', confSource],
      ['runtime.js', runtimeSource],
      ['runtime-status.js', statusSource],
    ])
      expect(source, name).to.not.include("store.set('await-deploy'");
    expect(statusSource).to.include('Underpost.state.set(AWAIT_DEPLOY_KEY');
    expect(statusSource).to.include('Underpost.state.delete(AWAIT_DEPLOY_KEY)');
    // The key reaches the store through the contract module alone, never a literal at a call site.
    for (const [name, source] of [
      ['conf.js', confSource],
      ['runtime.js', runtimeSource],
    ])
      expect(source, name).to.not.include("'await-deploy'");
  });

  it('routes every lifecycle transition through the state store', () => {
    expect(statusSource).to.not.include('Underpost.host.store.');
    for (const call of ['Underpost.state.set(CONTAINER_STATUS_KEY', 'Underpost.state.get(CONTAINER_STATUS_KEY'])
      expect(statusSource, call).to.include(call);
  });

  it('carries the key-level operators and the full canonical action set', () => {
    // The fourth domain: the same seven verbs as the other three, plus the store operators the
    // in-pod lifecycle hooks and the monitor transport call.
    for (const operator of ['get', 'set', 'delete', 'list'])
      expect(typeof Underpost.state[operator], operator).to.equal('function');
    for (const action of ['setup', 'load', 'publish', 'apply', 'status', 'rotate', 'clean'])
      expect(typeof Underpost.state[action], action).to.equal('function');
  });

  it('is registered as a domain rather than as a command of its own', () => {
    expect(cliSource).to.not.include("command('state')");
    expect(cliSource).to.include("name: 'state',");
  });

  it('is the only location the monitor exec transport reads', () => {
    const monitorSource = fs.readFileSync(new URL('../../../../src/cli/monitor.js', import.meta.url), 'utf8');
    expect(monitorSource).to.include('underpost state get container-status --plain');
    expect(monitorSource).to.not.include('underpost config');
  });

  it('latches a failure through one helper rather than a literal in each module', () => {
    for (const module of [
      '../../../../src/server/runtime/process.js',
      '../../../../src/db/DataBaseProvider.js',
      '../../../../src/db/valkey/Valkey.js',
      '../../../../src/db/mariadb/MariaDB.js',
    ]) {
      const source = fs.readFileSync(new URL(module, import.meta.url), 'utf8');
      expect(source, module).to.include('latchRuntimeError()');
      expect(source, module).to.not.include("set('container-status'");
    }
  });
});

describe('image bootstrap ABI', () => {
  const deploySource = fs.readFileSync(new URL('../../../../src/cli/deploy.js', import.meta.url), 'utf8');
  const cmdBlock = deploySource.slice(deploySource.indexOf('if (!cmd)'), deploySource.indexOf('const packageJson'));

  it('names only `start` in the pod command', () => {
    // The pod command is executed by whatever underpost the image ships, which is only as new
    // as the last npm publish. Naming a newer command there kills the pod before it can pull
    // the source that would have defined it.
    const invoked = [...cmdBlock.matchAll(/`underpost ([a-z-]+)/g)].map((m) => m[1]);
    expect(invoked.length).to.be.greaterThan(0);
    expect([...new Set(invoked)]).to.deep.equal(['start']);
  });

  it('keeps the commands a deployed image drives the pulled source through', () => {
    // A released `start` lifecycle shells out to these against the checkout it just cloned.
    // `app` replaced the `env` alias here: any image whose baked lifecycle still names `env`
    // must be rebuilt, so a re-added alias would hide that rather than fix it.
    const names = program.commands.map((command) => command.name());
    for (const command of ['app', 'client', 'run', 'start']) expect(names, command).to.include(command);
    expect(names).to.not.include('env');
  });
});

describe('container status read', () => {
  const monitorSource = fs.readFileSync(new URL('../../../../src/cli/monitor.js', import.meta.url), 'utf8');
  const read = monitorSource.slice(
    monitorSource.indexOf('const CONTAINER_STATUS_READ'),
    monitorSource.indexOf('const grafanaAdminSyncState'),
  );

  it('reads container status from the state domain and from nowhere else', () => {
    // The host configuration store is node-scoped and survives the container; container status
    // is neither. Reading it there once let a stale value from a previous workload answer for
    // the current one, so that path is gone rather than kept as a fallback.
    expect(read).to.include('underpost state get container-status');
    expect(read).to.not.include('underpost config');
    expect(read).to.not.include('host get container-status');
  });

  it('never fails the read itself when the pod has recorded nothing yet', () => {
    // An image that has the command but has not recorded a status exits zero with empty
    // output; one too old to carry it exits non-zero. Both must reach the caller as "no
    // reading", which classifies the pod as unreadable rather than as a status.
    expect(read).to.include('|| true');
  });

  it('reports what the pod said instead of collapsing every failure to one label', () => {
    const start = monitorSource.indexOf('readRuntimeStatusViaExec(podName, namespace) {');
    const exec = monitorSource.slice(start, monitorSource.indexOf('async readRuntimeStatusViaHttp(', start));
    expect(exec).to.include('result?.stderr');
    expect(exec).to.include('exit ${result?.code');
  });

  it('prints nothing for an absent key so an empty read is unambiguous', () => {
    const storeSource = fs.readFileSync(new URL('../../../../src/cli/dotenv-store.js', import.meta.url), 'utf8');
    expect(storeSource).to.include("console.log(stored ?? '')");
  });
});
