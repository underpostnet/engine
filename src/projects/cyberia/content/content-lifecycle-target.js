/**
 * The execution targets a host observes for the content lifecycle: the Development Sandbox that
 * serves its development database, and its cyberia-content checkout. Underpost reports the sandbox;
 * this module adds the database a command writes, so a sandbox target names the data as well as the
 * cluster. A target carries what this host observes of it now beside its identity, so a stage can
 * check its evidence against the target again.
 *
 * @module src/projects/cyberia/content/content-lifecycle-target.js
 * @namespace CyberiaContentLifecycleTarget
 */
import fs from 'node:fs';
import os from 'node:os';
import Underpost from '../../../index.js';
import { MongooseDB } from '../../../db/mongo/mongoose-db.js';
import { checkoutGit, contentRoot, hasContentSources } from './content-artifact.js';
import { replicaSetIdOf } from './content-baseline.js';
import { executionTarget, failure } from './content-lifecycle.js';
import { CONTENT_PARTITION } from './content-release.js';

/**
 * The name a target of this host starts with: its WireGuard peer, which a share authenticates, or its
 * node name or hostname off the WireGuard network.
 * @param {{nodeName:string, peerId:string}} node
 * @returns {string}
 * @memberof CyberiaContentLifecycleTarget
 */
const hostName = (node) => node.peerId || node.nodeName || os.hostname();

/**
 * The Development Sandbox target of a development database: the session of this host that serves it,
 * and the replica set and databases it holds. `databases` lists the databases the server holds now.
 * @param {Object} params
 * @param {{nodeName:string, peerId:string}} params.node - The node identity of this host.
 * @param {string} params.deployId
 * @param {string} params.environment
 * @param {Object} params.db - The database configuration of the deploy.
 * @param {import('mongodb').MongoClient} params.client - Connected to that database.
 * @returns {Promise<Object>} An execution target of kind `sandbox`, with `databases`.
 * @throws {Error} `blocked` when no MongoDB forward of a live sandbox session of this host serves the
 *   database, or the server holds no replica set.
 * @memberof CyberiaContentLifecycleTarget
 */
export async function sandboxTarget({ node, deployId, environment, db, client }) {
  const hosts = MongooseDB.normalizeHosts(db.host);
  const [host, port = '27017'] = (hosts[0] ?? '').split(':');
  const served = hosts.length === 1 ? Underpost.sandbox.serving({ host, port }) : null;
  if (served?.forward.id !== 'mongodb')
    throw failure(
      'blocked',
      `The development database ${hosts.join(',') || 'of this deploy'} is not the MongoDB of a Development Sandbox ` +
        'session of this host: start one with underpost sandbox up',
    );
  const replicaSetId = await replicaSetIdOf(client);
  if (!replicaSetId)
    throw failure('blocked', `${hosts[0]} answers with no replica set: a Development Sandbox serves its replica set`);
  const { descriptor } = served.session;
  const target = executionTarget('sandbox', `${hostName(node)}/${descriptor.sandboxId}`, {
    sandboxId: descriptor.sandboxId,
    provider: descriptor.provider,
    kubeContext: descriptor.kubeContext,
    kubeSystemUid: descriptor.kubeSystemUid,
    namespace: descriptor.namespaces.mongodb,
    sandbox: descriptor.fingerprint,
    deployId,
    environment,
    replicaSetId,
    database: db.name,
    contentDatabase: db.partitions?.[CONTENT_PARTITION]?.name ?? '',
  });
  const { databases } = await client.db('admin').admin().listDatabases({ nameOnly: true });
  return { ...target, databases: databases.map(({ name }) => name) };
}

/**
 * The checkout target of this host: its cyberia-content checkout by path, remote, branch and git
 * directory. `revision` and `changed` are what the checkout holds now.
 * @param {{node:{nodeName:string, peerId:string}}} params
 * @returns {?Object} An execution target of kind `source`; null on a host with no content sources.
 * @memberof CyberiaContentLifecycleTarget
 */
export function sourceTarget({ node }) {
  if (!hasContentSources()) return null;
  const root = fs.realpathSync(contentRoot());
  const git = (...args) => checkoutGit(root, ...args);
  const target = executionTarget('source', `${hostName(node)}${root}`, {
    root,
    remote: git('remote', 'get-url', 'origin').replace(/\/\/[^@/]*@/, '//'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    gitDir: git('rev-parse', '--absolute-git-dir'),
  });
  return { ...target, revision: git('rev-parse', 'HEAD'), changed: Boolean(git('status', '--porcelain', '--', 'src')) };
}
