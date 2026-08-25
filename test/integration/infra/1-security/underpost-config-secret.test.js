'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import Underpost from '../../../../src/index.js';
import { program } from '../../../../src/cli/index.js';

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

describe('root env store access boundary', () => {
  const cliSource = fs.readFileSync(new URL('../../../../src/cli/index.js', import.meta.url), 'utf8');
  const envSource = fs.readFileSync(new URL('../../../../src/cli/env.js', import.meta.url), 'utf8');

  it('exposes only key-level operators, leaving the lifecycle to the host domain', () => {
    expect(cliSource).to.include("const CONFIG_OPERATORS = ['get', 'set', 'delete', 'list'];");
    // `clean` is the host domain's canonical action over the same file; `isInsideContainer` is a
    // runtime predicate, not a configuration operation. Neither belongs on this command.
    for (const operator of ['clean', 'isInsideContainer'])
      expect(cliSource, operator).to.not.include(`'${operator}',\n];`);
  });

  it('rejects an operator outside the allowlist instead of indexing the API with it', () => {
    expect(cliSource).to.include('Unknown config operator');
    expect(cliSource).to.not.include('Underpost.env[args[0]]');
  });

  it('writes only the host root env store, never a deployment env file', () => {
    // The removed `--build` branch wrote ./engine-private/conf/<id>/.env.* — an app-domain
    // concern that had no caller and no place in a host-store command.
    expect(envSource).to.not.include('engine-private/conf/');
    expect(envSource).to.not.include('resolveDeployList');
  });

  it('keeps the operators the instance status transport depends on', () => {
    // Lifecycle hooks stamp `container-status` and the monitor reads it back over kubectl exec.
    for (const operator of ['get', 'set']) expect(Underpost.env[operator]).to.be.a('function');
  });
});

describe('container state store', () => {
  const cliSource = fs.readFileSync(new URL('../../../../src/cli/index.js', import.meta.url), 'utf8');
  const statusSource = fs.readFileSync(
    new URL('../../../../src/server/runtime/runtime-status.js', import.meta.url),
    'utf8',
  );

  it('resolves to its own file, never the host root env store', () => {
    expect(Underpost.state.path()).to.not.equal(Underpost.env.path());
    expect(Underpost.state.path()).to.match(/\.state$/);
    expect(Underpost.env.path()).to.match(/\.env$/);
  });

  it('routes every lifecycle transition through the state store', () => {
    expect(statusSource).to.not.include('Underpost.env.');
    for (const call of ['Underpost.state.set(CONTAINER_STATUS_KEY', 'Underpost.state.get(CONTAINER_STATUS_KEY'])
      expect(statusSource, call).to.include(call);
  });

  it('exposes the same key-level operators as config, under its own command', () => {
    expect(cliSource).to.include("const STATE_OPERATORS = ['get', 'set', 'delete', 'list'];");
    expect(cliSource).to.include('Unknown state operator');
  });

  it('is the first location the monitor exec transport reads', () => {
    const monitorSource = fs.readFileSync(new URL('../../../../src/cli/monitor.js', import.meta.url), 'utf8');
    expect(monitorSource).to.include('underpost state get container-status --plain');
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
    const names = program.commands.map((command) => command.name());
    for (const command of ['env', 'client', 'run', 'start']) expect(names, command).to.include(command);
  });
});

describe('container status read across image generations', () => {
  const monitorSource = fs.readFileSync(new URL('../../../../src/cli/monitor.js', import.meta.url), 'utf8');
  const read = monitorSource.slice(
    monitorSource.indexOf('const CONTAINER_STATUS_READ'),
    monitorSource.indexOf('const grafanaAdminSyncState'),
  );

  it('asks the current location first and the older one second', () => {
    expect(read.indexOf('underpost state get')).to.be.lessThan(read.indexOf('underpost config get'));
  });

  it('falls through on an empty answer, not only on a failed one', () => {
    // An image without `state` exits non-zero; one that has it but has recorded nothing exits
    // zero with empty output. Only testing the exit status would strand the second case.
    expect(read).to.include('[ -n "$s" ] ||');
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
