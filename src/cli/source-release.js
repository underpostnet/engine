/**
 * `underpost source-release`: the source channel resolver, the private-to-public mirror, the
 * Release Job and the release store, for the deploy scripts on a host.
 *
 * @module src/cli/source-release.js
 * @namespace UnderpostSourceRelease
 */
import Underpost from '../index.js';
import { appSecretName } from './app.js';
import { assertReleaseId, assertSourceChannel } from '../server/release/source-release.js';
import { mirrorRevision } from '../server/release/source-mirror.js';
import { releaseJobManifestFactory, releaseJobName, runReleaseJob } from '../server/release/release-job.js';
import { RELEASE_STORE_ROOT, pruneReleaseStore, stageReleaseEngine } from '../server/release/release-workspace.js';
import { ensureContainerStorage } from '../server/security/container-storage.js';
import { shellExec } from '../server/runtime/process.js';

/**
 * Puts the staged engine over the image's engine and installs its dependencies, so a Release Job runs
 * the CLI the deploy runs, not the one its image was published with.
 */
const ENGINE_OVERLAY =
  'cp -r --no-preserve=mode "$UNDERPOST_RELEASE_STORE/.engine/." /home/dd/engine/ && ' +
  'cd /home/dd/engine && npm install --no-audit --no-fund';

/** Parses `KEY=value,KEY=value` into an object. */
const variablesFactory = (value = '') =>
  Object.fromEntries(
    `${value}`
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]),
  );

/**
 * @class UnderpostSourceRelease
 * @memberof UnderpostSourceRelease
 */
class UnderpostSourceRelease {
  static API = {
    /**
     * Prints the repository a source channel fetches a public repository from.
     * @param {string} repository - The public repository.
     * @param {{channel?: string}} [options]
     * @returns {string}
     * @memberof UnderpostSourceRelease
     */
    repository(repository, options = {}) {
      const slug = Underpost.repo.sourceRepoFactory(repository, assertSourceChannel(options.channel || 'public'));
      console.log(slug);
      return slug;
    },

    /**
     * Publishes the exact revision of a private release to the public repository.
     * @param {string} repository - The public repository.
     * @param {{revision: string, branch?: string}} options
     * @returns {{revision:string, branch:string, moved:boolean}}
     * @memberof UnderpostSourceRelease
     */
    mirror(repository, options = {}) {
      const privateRepository = Underpost.repo.sourceRepoFactory(repository, 'private');
      const result = mirrorRevision({
        revision: options.revision,
        from: Underpost.repo.gitAuthFactory(privateRepository),
        to: Underpost.repo.gitAuthFactory(Underpost.repo.sourceRepoFactory(repository, 'public')),
        branch: options.branch || Underpost.repo.getDefaultBranch(privateRepository),
      });
      console.log(`${repository} ${result.branch} holds ${result.revision}${result.moved ? '' : ' already'}`);
      return result;
    },

    /**
     * Runs one command in a Release Job on the engine the deploy runs, staged from this checkout, and
     * waits for its end.
     * @param {string} releaseId
     * @param {Object} options - `deployId`, `image`, `cmd`, `scope` (the `app apply` projection the Job
     *   reads its credentials from), and optionally `env`, `setEnv`, `nodeName`, `namespace`, `store`,
     *   `timeout`, `imagePullPolicy`, `dryRun`.
     * @returns {Promise<boolean>} Whether the Job succeeded.
     * @memberof UnderpostSourceRelease
     */
    async job(releaseId, options = {}) {
      const id = assertReleaseId(releaseId);
      for (const key of ['deployId', 'image', 'cmd', 'scope'])
        if (!options[key])
          throw new Error(`source-release job needs --${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
      const namespace = options.namespace || 'default';
      const timeoutSeconds = Number(options.timeout) || 3600;
      const name = releaseJobName({ deployId: options.deployId, releaseId: id });
      const storePath = options.store || RELEASE_STORE_ROOT;
      const manifest = releaseJobManifestFactory({
        name,
        namespace,
        image: options.image,
        command: `${ENGINE_OVERLAY} && ${options.cmd}`,
        secretName: appSecretName(options.deployId, options.env || 'production', '', options.scope),
        variables: variablesFactory(options.setEnv),
        deployId: options.deployId,
        releaseId: id,
        nodeName: options.nodeName || '',
        storePath,
        timeoutSeconds,
        imagePullPolicy: options.imagePullPolicy || 'IfNotPresent',
      });
      if (options.dryRun) {
        console.log(manifest);
        return true;
      }
      const engine = stageReleaseEngine({ root: storePath, deployId: options.deployId });
      // The Job reads the store through a hostPath, so the store carries the label a container reads.
      ensureContainerStorage(storePath, { execute: shellExec });
      console.log(`Release Job ${name} runs engine ${engine.revision}`);
      return await runReleaseJob({ manifest, name, namespace, timeoutSeconds });
    },

    /**
     * Removes the release workspaces of the store on this host, but the one of the kept release.
     * @param {string} releaseId - The release whose workspace stays.
     * @param {{store?: string}} [options]
     * @returns {string[]} The release ids whose workspaces were removed.
     * @memberof UnderpostSourceRelease
     */
    prune(releaseId, options = {}) {
      const removed = pruneReleaseStore({ root: options.store || RELEASE_STORE_ROOT, keep: [releaseId] });
      console.log(removed.length ? `Removed the workspaces of ${removed.join(', ')}` : 'No workspace to remove');
      return removed;
    },

    /**
     * Commander action: `source-release <operation> <subject>`.
     * @param {string} operation - `repository`, `mirror`, `job` or `prune`.
     * @param {string} subject - The public repository, or the release id.
     * @param {Object} options
     * @memberof UnderpostSourceRelease
     */
    async callback(operation, subject, options = {}) {
      if (operation === 'repository') return UnderpostSourceRelease.API.repository(subject, options);
      if (operation === 'mirror') return UnderpostSourceRelease.API.mirror(subject, options);
      if (operation === 'prune') return UnderpostSourceRelease.API.prune(subject, options);
      if (operation === 'job') {
        if (!(await UnderpostSourceRelease.API.job(subject, options))) process.exit(1);
        return;
      }
      throw new Error(`Unknown source-release operation "${operation}": use repository, mirror, job or prune`);
    },
  };
}

export default UnderpostSourceRelease;
