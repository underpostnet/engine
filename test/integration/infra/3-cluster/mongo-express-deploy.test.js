'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
// Named import: js-yaml's ESM build exports no default.
import { load } from 'js-yaml';
import {
  MONGO_EXPRESS_BASE_URL,
  MONGO_EXPRESS_IMAGE,
  MONGO_EXPRESS_NAME,
  MONGO_EXPRESS_NODE_PORT,
  MONGO_EXPRESS_PORT,
  MONGO_EXPRESS_SECRET_NAME,
  MONGO_EXPRESS_SERVICE_NAME,
  mongoAuthEnabledFactory,
  mongoExpressManifestPathFactory,
  mongoExpressNodePortManifestFactory,
  parseMongodArgs,
} from '../../../../src/db/mongo/MongoExpress.js';

const MONGODB_AUTH_ARGS = load(fs.readFileSync('./manifests/mongodb/statefulset.yaml', 'utf8')).spec.template.spec
  .containers[0].args;
const MONGODB_4_4_ARGS = load(fs.readFileSync('./manifests/mongodb-4.4/statefulset.yaml', 'utf8')).spec.template.spec
  .containers[0].args;

const readYaml = (path) => load(fs.readFileSync(path, 'utf8'));
const manifestDir = (authEnabled) => mongoExpressManifestPathFactory({ authEnabled });
const container = (deployment) => deployment.spec.template.spec.containers[0];
const envEntry = (deployment, name) => container(deployment).env.find((entry) => entry.name === name);

describe('mongo-express auth mode selection', () => {
  it('reads authentication from the deployed statefulset, not from the invocation flags', () => {
    // The set that is running decides, whichever flag this invocation carries.
    expect(mongoAuthEnabledFactory({ args: MONGODB_AUTH_ARGS, options: { mongodb4: true } })).to.equal(true);
    expect(mongoAuthEnabledFactory({ args: MONGODB_4_4_ARGS, options: { mongodb: true } })).to.equal(false);
  });

  it('falls back to the flags only when no statefulset is deployed', () => {
    expect(mongoAuthEnabledFactory({ args: null, options: { mongodb4: true } })).to.equal(false);
    expect(mongoAuthEnabledFactory({ args: null, options: { mongodb: true } })).to.equal(true);
    expect(mongoAuthEnabledFactory({})).to.equal(true);
  });

  it('separates an undeployed statefulset from one that declares no arguments', () => {
    expect(parseMongodArgs('')).to.equal(null);
    expect(parseMongodArgs('   ')).to.equal(null);
    expect(parseMongodArgs('mongodb|--replSet|rs0|--auth|')).to.deep.equal(['--replSet', 'rs0', '--auth']);
    // An empty vector is a deployed server running on its defaults: no --auth, so no credentials,
    // and the flags of this invocation do not get to overrule it.
    expect(mongoAuthEnabledFactory({ args: parseMongodArgs('mongodb|'), options: { mongodb: true } })).to.equal(false);
    expect(mongoAuthEnabledFactory({ args: parseMongodArgs(''), options: { mongodb: true } })).to.equal(true);
  });

  it('routes each auth mode to a kustomization that exists', () => {
    for (const authEnabled of [true, false]) {
      const path = manifestDir(authEnabled);
      expect(fs.existsSync(`${path}/kustomization.yaml`), path).to.equal(true);
    }
    expect(manifestDir(true)).to.not.equal(manifestDir(false));
    expect(mongoExpressManifestPathFactory({ underpostRoot: '/npm/underpost', authEnabled: true })).to.equal(
      '/npm/underpost/manifests/deployment/mongo-express',
    );
  });
});

describe('mongo-express manifests', () => {
  const base = manifestDir(true);
  const deployment = readYaml(`${base}/deployment.yaml`);
  const service = readYaml(`${base}/service.yaml`);
  const kustomization = readYaml(`${base}/kustomization.yaml`);

  it('projects both credential pairs from the statefulset secret', () => {
    // The client owns no credential of its own: the same secret the StatefulSet consumes gates
    // the mongod connection and the UI session.
    for (const name of [
      'ME_CONFIG_MONGODB_ADMINUSERNAME',
      'ME_CONFIG_MONGODB_ADMINPASSWORD',
      'ME_CONFIG_BASICAUTH_USERNAME',
      'ME_CONFIG_BASICAUTH_PASSWORD',
    ]) {
      const entry = envEntry(deployment, name);
      expect(entry, name).to.be.an('object');
      expect(entry.value, name).to.equal(undefined);
      expect(entry.valueFrom.secretKeyRef.name, name).to.equal(MONGO_EXPRESS_SECRET_NAME);
      expect(entry.valueFrom.secretKeyRef.key, name).to.be.oneOf(['username', 'password']);
    }
  });

  it('targets the in-cluster statefulset identity, which is identical under kind, kubeadm and k3s', () => {
    expect(envEntry(deployment, 'ME_CONFIG_MONGODB_SERVER').value).to.equal('mongodb-0.mongodb-service');
    expect(envEntry(deployment, 'ME_CONFIG_MONGODB_PORT').value).to.equal('27017');
    expect(envEntry(deployment, 'ME_CONFIG_MONGODB_ENABLE_ADMIN').value).to.equal('true');
    // The deploy surface reports the URL operators open; the manifest decides what it is.
    expect(envEntry(deployment, 'ME_CONFIG_SITE_BASEURL').value).to.equal(MONGO_EXPRESS_BASE_URL);
  });

  it('pins the image the pull path preloads', () => {
    expect(container(deployment).image).to.equal(MONGO_EXPRESS_IMAGE);
    expect(MONGO_EXPRESS_IMAGE).to.match(/:.+$/);
  });

  it('keeps the service names and ports the deploy surface reports', () => {
    expect(deployment.metadata.name).to.equal(MONGO_EXPRESS_NAME);
    expect(service.metadata.name).to.equal(MONGO_EXPRESS_SERVICE_NAME);
    expect(service.spec.type).to.equal('ClusterIP');
    expect(service.spec.ports[0].port).to.equal(MONGO_EXPRESS_PORT);
    expect(container(deployment).ports[0].containerPort).to.equal(MONGO_EXPRESS_PORT);
  });

  it('leaves node exposure out of the kustomization', () => {
    // An admin UI reaches the node network only through `--node-port`.
    const nodePortManifest = mongoExpressNodePortManifestFactory({});
    expect(kustomization.resources).to.deep.equal(['deployment.yaml', 'service.yaml']);
    const nodePortService = readYaml(nodePortManifest);
    expect(nodePortService.spec.type).to.equal('NodePort');
    expect(nodePortService.spec.ports[0].nodePort).to.equal(MONGO_EXPRESS_NODE_PORT);
    expect(nodePortService.spec.selector).to.deep.equal(deployment.spec.selector.matchLabels);
  });

  it('drops only the credentials a no-auth mongod would reject', () => {
    const overlay = manifestDir(false);
    const overlayKustomization = readYaml(`${overlay}/kustomization.yaml`);
    expect(overlayKustomization.resources).to.deep.equal(['../mongo-express']);
    const patchPath = `${overlay}/${overlayKustomization.patches[0].path}`;
    const deleted = readYaml(patchPath)
      .spec.template.spec.containers[0].env.filter((entry) => entry.$patch === 'delete')
      .map((entry) => entry.name);
    expect(deleted).to.deep.equal([
      'ME_CONFIG_MONGODB_ADMINUSERNAME',
      'ME_CONFIG_MONGODB_ADMINPASSWORD',
      'ME_CONFIG_MONGODB_AUTH_DATABASE',
    ]);
    // The UI session stays gated: dropping the server credentials must not publish the client.
    expect(deleted).to.not.include('ME_CONFIG_BASICAUTH_USERNAME');
    expect(deleted).to.not.include('ME_CONFIG_BASICAUTH_PASSWORD');
  });
});

describe('mongo-express cluster wiring', () => {
  const clusterSource = fs.readFileSync('./src/cli/cluster.js', 'utf8');

  it('registers the flag on the cluster command', () => {
    expect(fs.readFileSync('./src/cli/index.js', 'utf8')).to.include("'--mongo-express'");
  });

  it('deploys the client after the statefulset branches', () => {
    expect(clusterSource).to.include('if (options.mongoExpress)');
    expect(clusterSource.indexOf('options.mongoExpress')).to.be.greaterThan(clusterSource.indexOf('options.mongodb4'));
  });

  it('keeps one deploy path shared with the service runner', () => {
    const runSource = fs.readFileSync('./src/cli/run.js', 'utf8');
    expect(runSource).to.include('MongoExpress.deploy(');
    expect(runSource).to.not.include('manifests/deployment/mongo-express/deployment.yaml');
  });
});
