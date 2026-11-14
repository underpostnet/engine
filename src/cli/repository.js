/**
 * The repository commands of the CLI and the Underpost repository domain.
 *
 * The commands (`clone`, `fetch`, `pull`, `push`, `sync`, `discard`, `init`, `status`, `cmt`)
 * parse their arguments and delegate to the Git runtime ({@link module:src/server/git/git.js}) and
 * the commit conventions ({@link module:src/server/release/commit-message.js}); they work on any
 * repository. The domain names the repositories of a deployment, pairs the engine with its private
 * configuration, scaffolds projects and provisions repository-backed site roots.
 * @module src/cli/repository.js
 * @namespace UnderpostRepository
 */

import {
  chownHostPath,
  hostOwner,
  pbcopy,
  shellArgumentFactory,
  shellCd,
  shellExec,
} from '../server/runtime/process.js';
import { actionInitLog, loggerFactory } from '../server/ops/logger.js';
import path from 'path';
import fs from 'fs-extra';
import {
  addWsConf,
  buildApiSrc,
  buildWsSrc,
  CLUSTER_CONF_PATH,
  Config,
  confManifestPath,
  readConfJson,
  readConfInstances,
} from '../server/runtime/conf.js';
import {
  confDraftFactory,
  deployConfFolder,
  siteDeployIdFactory,
  siteHostFactory,
  siteIdFactory,
  sitePathFactory,
} from '../server/site/site-conf.js';
import { readDeployRoutes, registerDeployRoute } from '../server/network/router.js';
import { assertSourceChannel } from '../server/release/source-release.js';
import { environmentValueFactory, getNpmRootPath } from '../server/runtime/environment.js';
import { githubCredential, isGithubHttpsUrl } from '../server/github/github-credential.js';
import { repositoryIdentityFactory } from '../server/storage/repository.js';
import {
  cloneRepository,
  commitChanges,
  commitHistory,
  currentBranch,
  declareSafeDirectory,
  discardChanges,
  fetchRepository,
  gitOutput,
  isReachable,
  mergeDependabot,
  pullRepository,
  pushRepository,
  remoteUrl,
  remoteUrlFactory,
  runGit,
  syncRepository,
  undoCommits,
  unpushedCommits,
} from '../server/git/git.js';
import { COMMIT_TYPES, commitMessageFactory } from '../server/release/commit-message.js';
import underpostConfig from '../../underpost.config.js';
import clusterConfig from '../../underpost.cluster.config.js';
import { readClusterConf } from './namespace.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/** The word diff a developer runs to read a commit, as `status --log` and `status --diff` print it. */
const WORD_DIFF = `-U0 -w --word-diff=color --word-diff-regex='[^[:space:]]' --color=always`;

const commaList = (value) =>
  `${value ?? ''}`
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Prints an answer, or copies it to the clipboard with `--copy`. */
const answer = (value, options = {}) => (options.copy ? pbcopy(value) : console.log(value));

/**
 * @class UnderpostRepository
 * @description The repository commands of the CLI and the Underpost repository domain.
 * @memberof UnderpostRepository
 */
class UnderpostRepository {
  static API = {
    /**
     * `underpost clone`: clones a repository into a directory that does not exist or is empty.
     * @param {string} repository - `owner/repo`, a clone URL or a path.
     * @param {string} [destination] - The repository name (`<name>.git` with `--bare`) otherwise.
     * @param {object} [options] - `bare`, `branch`, `depth`, `sparse` (comma-separated directories), `replace`.
     * @returns {{path: string, revision: string}}
     * @memberof UnderpostRepository
     */
    clone(repository, destination = '', options = {}) {
      return cloneRepository({
        repository,
        destination,
        branch: options.branch,
        bare: options.bare === true,
        depth: options.depth,
        sparse: commaList(options.sparse),
        replace: options.replace === true,
      });
    },

    /**
     * `underpost fetch`: updates the remote-tracking refs of a checkout; the working tree stays.
     * @param {string} [repoPath='.']
     * @param {object} [options] - `remote`, `branch`, `prune`.
     * @memberof UnderpostRepository
     */
    fetch(repoPath = '.', options = {}) {
      return fetchRepository({ path: repoPath, remote: options.remote, branch: options.branch, prune: options.prune });
    },

    /**
     * `underpost pull`: fast-forwards the current branch; a diverged history fails and nothing changes.
     * @param {string} [repoPath='.']
     * @param {string} [repository] - The tracked remote otherwise.
     * @param {object} [options] - `remote`, `branch`.
     * @memberof UnderpostRepository
     */
    pull(repoPath = '.', repository = '', options = {}) {
      return pullRepository({ path: repoPath, repository, remote: options.remote, branch: options.branch });
    },

    /**
     * `underpost push`: publishes HEAD to a remote branch, never forced unless asked.
     * @param {string} [repoPath='.']
     * @param {string} [repository] - The tracked remote otherwise.
     * @param {object} [options] - `remote`, `branch`, `forceWithLease`, `force`, `delete`.
     * @memberof UnderpostRepository
     */
    push(repoPath = '.', repository = '', options = {}) {
      return pushRepository({
        path: repoPath,
        repository,
        remote: options.remote,
        branch: options.branch,
        force: options.force === true,
        forceWithLease: options.forceWithLease === true,
        delete: options.delete,
      });
    },

    /**
     * `underpost sync`: brings a managed checkout to the tip of a repository branch, replacing its
     * working tree. Prints what the replacement discards; `--dry-run` stops there.
     * @param {string} repoPath
     * @param {string} repository
     * @param {object} [options] - `branch`, `dryRun`.
     * @memberof UnderpostRepository
     */
    sync(repoPath, repository, options = {}) {
      const result = syncRepository({ path: repoPath, repository, branch: options.branch, dryRun: options.dryRun });
      if (result.discarded)
        console.log(
          `${options.dryRun ? 'would discard' : 'discarded'}: ${result.discarded.commits} commits, ` +
            `${result.discarded.changed} changed files, ${result.discarded.untracked} untracked files`,
        );
      return result;
    },

    /**
     * `underpost merge-dependabot`: merges each `origin/dependabot/*` branch into the base branch and
     * prints ok or failed after each one. Exits non-zero when a merge or a step failed.
     * @param {string} [repoPath='.'] - The repository, or a directory inside it.
     * @param {object} [options] - `base`.
     * @memberof UnderpostRepository
     */
    mergeDependabot(repoPath = '.', options = {}) {
      const result = mergeDependabot({ path: repoPath, base: options.base });
      const width = Math.max(0, ...result.branches.map(({ branch }) => branch.length));
      console.log(`${result.root}: origin/dependabot/* into ${result.base}`);
      for (const { branch, status, reason } of result.branches)
        console.log(`  ${branch.padEnd(width)}  ${status}${reason ? `  ${reason}` : ''}`);
      if (!result.branches.length && !result.error) console.log('  no Dependabot branch');
      if (result.error) console.log(`  stopped: ${result.error}`);
      if (result.stash) console.log(`  your changes stay in ${result.stash}: git stash pop ${result.stash}`);
      else if (!result.restored) console.log('  the checkout did not return to the branch you were on');
      if (!result.ok) process.exitCode = 1;
      return result;
    },

    /**
     * `underpost discard`: lists the changes under each path; with `--force`, discards them.
     * @param {string[]} paths - Repository roots or directories inside one.
     * @param {object} [options] - `force`, `ignored`.
     * @memberof UnderpostRepository
     */
    discard(paths = [], options = {}) {
      for (const target of paths) {
        const { root, scope, entries, discarded } = discardChanges({
          path: target,
          force: options.force === true,
          ignored: options.ignored === true,
        });
        console.log(`${root} (${scope}): ${entries.length} ${discarded ? 'discarded' : 'to discard'}`);
        for (const entry of entries)
          console.log(`  ${entry.status} ${entry.from ? `${entry.from} -> ` : ''}${entry.path}`);
      }
      if (!options.force) console.log('Nothing changed: --force discards.');
    },

    /**
     * `underpost init`: initializes a repository with the commit identity and an optional origin.
     * @param {string} [repoPath='.']
     * @param {object} [options] - `origin`.
     * @memberof UnderpostRepository
     */
    init(repoPath = '.', options = {}) {
      Underpost.repo.initLocalRepo({ path: repoPath, origin: options.origin });
    },

    /**
     * `underpost status`: reads the state of a repository; nothing changes. One query per call, the
     * short status without one. `--copy` copies the answer instead of printing it.
     * @param {string} [repoPath='.']
     * @param {object} [options] - `branch`, `reflog`, `contains`, `log`, `unpushed`, `diff`, `staged`,
     *   `range`, `extension`, `message`, `remoteUrl`, `changes`, `reachable`, `copy`.
     * @memberof UnderpostRepository
     */
    status(repoPath = '.', options = {}) {
      const git = (args) => gitOutput(args, { cwd: repoPath });
      if (options.reachable) return answer(`${isReachable(options.reachable)}`, options);
      if (options.changes) return process.stdout.write(git(['status', '--porcelain']) ? '1' : '');
      if (options.branch) return answer(currentBranch(repoPath), options);
      if (options.remoteUrl) return answer(remoteUrlFactory(remoteUrl(repoPath)), options);
      if (options.reflog !== undefined) {
        const branch = options.reflog === true ? currentBranch(repoPath) : options.reflog;
        return answer(git(['reflog', 'show', `refs/heads/${branch}`]), options);
      }
      if (options.contains)
        return answer(git(['for-each-ref', `--contains=${options.contains}`, '--format=%(refname:short)']), options);
      if (options.message !== undefined) {
        const skip = Math.max(0, (Number.parseInt(options.message, 10) || 1) - 1);
        return answer(git(['log', '-1', `--skip=${skip}`, '--format=%B']), options);
      }
      if (options.diff) {
        const [from, to] = commaList(options.range);
        const command = from
          ? `git --no-pager diff ${from} ${to || 'HEAD'}${options.extension ? ` -- '*.${options.extension}'` : ''}`
          : `git --no-pager diff${options.staged ? ' --cached' : ''} ${WORD_DIFF}`;
        return answer(command, options);
      }
      if (options.log !== undefined || options.unpushed) {
        let count = Number.parseInt(options.log, 10) || 1;
        if (options.unpushed) {
          const unpushed = unpushedCommits({ path: repoPath });
          if (!unpushed.count) return logger.warn(unpushed.error || 'No unpushed commits found', { path: repoPath });
          count = unpushed.count;
        }
        const history = commitHistory({ path: repoPath, count });
        if (!history.length) return logger.warn('No commits found', { path: repoPath });
        history.forEach((commit, index) => {
          console.log(commit.date.green);
          console.log(`${history.length - index}`.magenta, commit.shortRevision.yellow, commit.subject);
          console.log(git(['show', '--name-status', '--format=', commit.revision]).red);
        });
        const show = history
          .toReversed()
          .map(
            ({ shortRevision }) =>
              `git -C ${shellArgumentFactory(repoPath)} --no-pager show ${WORD_DIFF} ${shortRevision}`,
          )
          .join(' && ');
        return options.copy ? pbcopy(show) : console.log('Show all:', show);
      }
      console.log(git(['status', '--short', '--branch']));
    },

    /**
     * `underpost cmt`: commits the staged changes with a Conventional Commit message. The index is
     * never changed.
     * @param {string} [repoPath='.']
     * @param {string} [type='feat'] - A type of {@link COMMIT_TYPES}, or a custom one.
     * @param {string} [scope]
     * @param {string} [description] - The default description of a known type otherwise.
     * @param {object} [options] - `empty`, `amend`, `copy`, `types`, `undo`.
     * @memberof UnderpostRepository
     */
    commit(repoPath = '.', type = 'feat', scope = '', description = '', options = {}) {
      if (options.types) {
        for (const [name, { emoji, description: summary }] of Object.entries(COMMIT_TYPES))
          console.log(`${name.padEnd(9)} ${emoji}  ${summary}`);
        return;
      }
      if (options.undo !== undefined) {
        if (options.copy) pbcopy(gitOutput(['log', '-1', '--format=%B'], { cwd: repoPath }));
        return undoCommits({ path: repoPath, count: options.undo === true ? 1 : options.undo });
      }
      if (options.amend) return commitChanges({ path: repoPath, amend: true, empty: options.empty === true });
      const message = commitMessageFactory({ type, scope, description });
      if (options.copy) return pbcopy(message);
      return commitChanges({ path: repoPath, message, empty: options.empty === true });
    },

    /**
     * Initializes the base cluster deploy folder `engine-private/deploy` from `./underpost.cluster.config.js`.
     *
     * Writes the minimum set required by the cluster runtime: `conf.event.json`, `conf.users.json`,
     * `conf.wireguard.json`, `conf.cluster.json` (a reference to a profile, no context), `dd.cron`, the
     * `conf.cron.json` of the cron deployment `dd.cron` names, `dd.routes`, `id_rsa`, `id_rsa.pub`.
     *
     * When a deploy ID is explicitly provided, it also writes the CI and CD workflows of the deploy from those of
     * `dd-test`, and regenerates its conf manifest ({@link UnderpostRepository.writeConfManifest}).
     *
     * Idempotent: existing files are never overwritten, so it is safe to rerun over a provisioned cluster.
     * An existing `conf.cluster.json` is validated first, and an invalid one stops the run before it writes a file.
     * @param {string} [deployId=''] - Deploy ID registered in the route table and used as default cron deploy ID (defaults to `dd-default`, `dd-` prefix is normalized).
     * @param {'recommended'|'legacy'} [placement='recommended'] - The placement profile of a new `conf.cluster.json`.
     * @returns {{ deployPath: string, created: string[], kept: string[] }} The deploy folder, the files
     *   created by this run and the configuration and workflow files it kept.
     * @memberof UnderpostRepository
     */
    clusterDeployFactory(deployId = '', placement = 'recommended') {
      const deployPath = './engine-private/deploy';
      const created = [];
      const kept = [];
      readClusterConf();

      const hasDeployId = `${deployId || ''}`.trim().length > 0;
      deployId = `${deployId || ''}`.trim() || 'dd-default';
      if (!deployId.startsWith('dd-')) deployId = `dd-${deployId}`;

      fs.mkdirSync(deployPath, { recursive: true });

      const cronPath = `${deployPath}/dd.cron`;
      if (!fs.existsSync(cronPath)) {
        fs.writeFileSync(cronPath, deployId, 'utf8');
        created.push(cronPath);
      }
      const cronDeployId = fs.readFileSync(cronPath, 'utf8').trim();

      const confFiles = {
        [`${deployPath}/conf.event.json`]: clusterConfig.event,
        [`${deployPath}/conf.users.json`]: clusterConfig.users,
        [`${deployPath}/conf.wireguard.json`]: clusterConfig.wireguard,
        [CLUSTER_CONF_PATH]: Underpost.namespace.template(placement),
        [`./engine-private/conf/${cronDeployId}/conf.cron.json`]: clusterConfig.cron,
      };

      for (const [confPath, conf] of Object.entries(confFiles)) {
        if (fs.existsSync(confPath)) {
          kept.push(confPath);
          continue;
        }
        fs.outputFileSync(confPath, JSON.stringify(conf, null, 4), 'utf8');
        created.push(confPath);
      }

      const routesPath = `${deployPath}/dd.routes`;
      const routesExists = fs.existsSync(routesPath);
      registerDeployRoute(deployId);
      if (!routesExists) created.push(routesPath);

      const keyPath = `${deployPath}/id_rsa`;
      const pubKeyPath = `${deployPath}/id_rsa.pub`;
      if (!fs.existsSync(keyPath)) {
        shellExec(`ssh-keygen -t ed25519 -f ${keyPath} -N "" -q -C "root@${deployId}"`, { disableLog: true });
        fs.chmodSync(keyPath, 0o600);
        created.push(keyPath);
        created.push(pubKeyPath);
      } else if (!fs.existsSync(pubKeyPath)) {
        shellExec(`ssh-keygen -y -f ${keyPath} -P "" > ${pubKeyPath}`, { disableLog: true });
        created.push(pubKeyPath);
      }

      if (hasDeployId) {
        const confId = deployId.slice('dd-'.length);
        for (const kind of ['cd', 'ci']) {
          const workflowPath = `./.github/workflows/engine-${confId}.${kind}.yml`;
          if (fs.existsSync(workflowPath)) {
            kept.push(workflowPath);
            continue;
          }
          // The word `test` in the dd-test workflow is its conf id.
          const template = fs.readFileSync(`./.github/workflows/engine-test.${kind}.yml`, 'utf8');
          fs.writeFileSync(workflowPath, template.replace(/\btest\b/g, confId), 'utf8');
          created.push(workflowPath);
        }
        UnderpostRepository.API.writeConfManifest({ deployId });
      }

      logger.info('Cluster deploy base', { deployPath, created, kept });

      return { deployPath, created, kept };
    },

    /**
     * Initializes a new Underpost repository, optionally setting up a deploy ID or sub-configuration.
     * @param {string} [projectName=''] - The name of the project to create.
     * @param {object} [options] - Initialization options.
     * @param {string} [options.deployId=''] - The deployment ID to set up.
     * @param {string} [options.subConf=''] - The sub-configuration to create.
     * @param {boolean} [options.cluster=false] - If true, initializes only the base cluster deploy folder (`engine-private/deploy`) from `./underpost.cluster.config.js` and returns; no project or deploy ID scaffolding runs.
     * @param {'recommended'|'legacy'} [options.placement='recommended'] - With `cluster`: the placement profile of a new `conf.cluster.json`.
     * @param {boolean} [options.dev=false] - If true, uses development settings.
     * @param {boolean} [options.buildRepos=false] - If true, creates the deployment repositories (engine-*, engine-*-private).
     * @param {boolean} [options.purge=false] - If true, removes the deploy ID conf and all related repositories (requires deployId).
     * @param {boolean} [options.cleanTemplate=false] - If true, cleans the pwa-microservices-template build directory.
     * @param {boolean} [options.build=false] - If true, builds the deployment to pwa-microservices-template (requires deployId).
     * @param {boolean} [options.syncConf=false] - If true, syncs configuration to private repositories (requires deployId).
     * @param {boolean} [options.defaultConf=false] - If true, writes the conf manifest of `deployId` or `confWorkflowId` ({@link UnderpostRepository.writeConfManifest}).
     * @param {string} [options.confWorkflowId=''] - If provided, uses this configuration workflow ID.
     * @returns {Promise<boolean>} A promise that resolves when the initialization is complete.
     * @memberof UnderpostRepository
     */
    new(
      projectName,
      options = {
        deployId: '',
        subConf: '',
        cluster: false,
        dev: false,
        buildRepos: false,
        purge: false,
        cleanTemplate: false,
        build: false,
        syncConf: false,
        defaultConf: false,
        confWorkflowId: '',
      },
    ) {
      return new Promise(async (resolve, reject) => {
        try {
          await logger.setUpInfo();
          actionInitLog();

          // Handle cluster deploy base operation (standalone: never scaffolds a project)
          if (options.cluster === true) {
            UnderpostRepository.API.clusterDeployFactory(options.deployId || projectName, options.placement);
            return resolve(true);
          }

          // Handle cleanTemplate operation
          if (options.cleanTemplate) {
            discardChanges({ path: '../pwa-microservices-template', force: true, root: true });
            return resolve(true);
          }

          if (options.defaultConf) {
            Underpost.repo.writeConfManifest(options);
            return resolve(true);
          }

          if (options.deployId) {
            let deployId = options.deployId;

            if (!deployId.startsWith('dd-')) deployId = `dd-${deployId}`;
            // Handle purge operation
            if (options.purge) {
              logger.info(`Purging deploy ID: ${deployId}`);

              const suffix = deployId.split('dd-')[1];
              const repoName = `engine-${suffix}`;
              const privateRepoName = `engine-${suffix}-private`;
              const confFolder = `./engine-private/conf/${deployId}`;

              // Remove conf folder
              if (fs.existsSync(confFolder)) {
                fs.removeSync(confFolder);
                logger.info(`Removed conf folder: ${confFolder}`);
              } else {
                logger.warn(`Conf folder not found: ${confFolder}`);
              }

              // Remove repositories
              const repos = [
                { path: `../${repoName}`, name: repoName },
                { path: `../${privateRepoName}`, name: privateRepoName },
              ];

              for (const repo of repos) {
                if (fs.existsSync(repo.path)) {
                  fs.removeSync(repo.path);
                  logger.info(`Removed repository: ${repo.path}`);
                } else {
                  logger.warn(`Repository not found: ${repo.path}`);
                }
              }

              logger.info(`Successfully purged deploy ID: ${deployId}`);
              return resolve(true);
            }

            // Handle sync-conf operation
            if (options.syncConf) {
              logger.info(`Syncing configuration for deploy ID: ${deployId}`);
              shellExec(`node bin/build ${deployId} --conf`);
              logger.info('Configuration synced successfully');
              return resolve(true);
            }

            // Handle build operation
            if (options.build) {
              logger.info(`Building deployment for deploy ID: ${deployId}`);
              shellExec(`node bin/build ${deployId}`);
              logger.info('Build completed successfully');
              return resolve(true);
            }

            // Normal deploy ID factory operation
            const { deployId: normalizedDeployId } = Config.deployIdFactory(deployId, options);

            if (options.buildRepos) {
              const suffix = normalizedDeployId.split('dd-')[1];
              const repoName = `engine-${suffix}`;
              const privateRepoName = `engine-${suffix}-private`;
              const repos = [
                { path: `../${repoName}`, name: repoName },
                { path: `../${privateRepoName}`, name: privateRepoName },
              ];

              const username = process.env.GITHUB_USERNAME;
              if (!username) {
                logger.error('GITHUB_USERNAME environment variable not set');
                return reject(false);
              }

              for (const repo of repos) {
                if (!fs.existsSync(repo.path)) {
                  fs.mkdirSync(repo.path, { recursive: true });
                  logger.info(`Created repository directory: ${repo.path}`);
                }

                const remoteUrl = `https://github.com/${username}/${repo.name}.git`;
                UnderpostRepository.API.initLocalRepo({ path: repo.path, origin: remoteUrl });
                logger.info(`Initialized git repository with remote: ${repo.name}`);
              }
            }
            return resolve(true);
          }
          if (projectName) {
            const npmRoot = getNpmRootPath();
            const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
            const destFolder = `./${projectName}`;
            const deployId = projectName.startsWith('dd-') ? projectName : `dd-${projectName}`;
            logger.info('build app', { destFolder, deployId });
            if (fs.existsSync(destFolder)) fs.removeSync(destFolder);
            fs.mkdirSync(destFolder, { recursive: true });
            if (!options.dev) {
              fs.copySync(underpostRoot, destFolder);
              fs.writeFileSync(
                `${destFolder}/.gitignore`,
                fs.readFileSync(`${underpostRoot}/.dockerignore`, 'utf8'),
                'utf8',
              );
              UnderpostRepository.API.initLocalRepo({ path: destFolder });
              shellExec(`cd ${destFolder} && git add . && git commit -m "Base template implementation"`);
            }
            shellExec(`cd ${destFolder} && node bin new --deploy-id ${deployId} --default-conf`);
            shellExec(`cd ${destFolder} && node bin client ${deployId}`);
            shellExec(`cd ${destFolder} && DEPLOY_ID=${deployId} npm run dev`);
          }
          return resolve(true);
        } catch (error) {
          console.error(error);
          logger.error(error, error.stack);
          return reject(false);
        }
      });
    },

    /**
     * Generates a new API from a template API: `src/api/<api-id>` and its client service. With a
     * deployment named, registers it there as `underpost site add-api` does.
     * @param {string} apiId - Id of the new API.
     * @param {object} [options]
     * @param {string} [options.from='default'] - Template API.
     * @param {string} [options.deployId] - Deployment the API is registered in.
     * @param {string} [options.client] - Client whose services list the API.
     * @param {string} [options.host] - Limits the registration to the routes of one hostname.
     * @param {boolean} [options.dryRun] - Prints the registration plan only.
     * @memberof UnderpostRepository
     */
    async newApi(apiId, options = {}) {
      const id = siteIdFactory(apiId, 'API id');
      const from = siteIdFactory(options.from || 'default', 'template API id');
      if (fs.existsSync(`./src/api/${id}`))
        throw new Error(`API already exists: src/api/${id} (use underpost site add-api to register it)`);
      if (!fs.existsSync(`./src/api/${from}`)) throw new Error(`Template API not found: src/api/${from}`);
      if (options.deployId) siteDeployIdFactory(options.deployId);
      await buildApiSrc({ toOptions: { apiId: id }, fromOptions: { apiId: from } });
      logger.info('API generated', { apiId: id, from });
      if (options.deployId) return Underpost.site.addApi(id, options);
    },

    /**
     * Generates a new WebSocket server from a template server: `src/ws/<ws-id>`, keeping files that
     * already exist. With a deployment named, binds it to routes of one hostname.
     * @param {string} wsId - Id of the new WebSocket server.
     * @param {object} [options]
     * @param {string} [options.from='default'] - Template WebSocket server.
     * @param {string} [options.deployId] - Deployment the server is bound in.
     * @param {string} [options.host] - Hostname of the routes; required with `deployId`.
     * @param {string} [options.paths='/'] - Comma-separated route paths.
     * @param {boolean} [options.dryRun] - Prints the binding plan only.
     * @memberof UnderpostRepository
     */
    async newWs(wsId, options = {}) {
      const id = siteIdFactory(wsId, 'WebSocket id');
      const from = siteIdFactory(options.from || 'default', 'template WebSocket id');
      if (!fs.existsSync(`./src/ws/${from}`)) throw new Error(`Template WebSocket server not found: src/ws/${from}`);
      const deployId = options.deployId ? siteDeployIdFactory(options.deployId) : '';
      const draft = confDraftFactory();
      const file = `${deployConfFolder(deployId)}/conf.server.json`;
      if (deployId) {
        const bound = addWsConf(draft.read(file), {
          wsId: id,
          host: siteHostFactory(options.host),
          paths: `${options.paths || '/'}`.split(',').map(sitePathFactory),
        });
        if (bound.length)
          draft.note(
            file,
            bound
              .map(({ route, previous }) => `bind ws ${id} to ${route}${previous ? ` (was ${previous})` : ''}`)
              .join('; '),
          );
      }
      await buildWsSrc({ toOptions: { wsId: id }, fromOptions: { wsId: from } });
      logger.info('WebSocket server generated', { wsId: id, from });
      if (!deployId) return;
      return Underpost.site.applyPlan({
        operation: 'new ws',
        changes: draft.changes(),
        deployIds: [deployId],
        dryRun: options.dryRun,
      });
    },

    /**
     * Replaces the private configuration repository of a deploy beside the engine with its remote
     * tip, and rebuilds its conf when its version matches the engine's.
     * @param {string} deployId - The deployment ID.
     * @returns {{validVersion: boolean, engineVersion: string, deployVersion: string}} An object indicating if the versions are valid.
     * @memberof UnderpostRepository
     */
    privateConfUpdate(deployId) {
      shellCd(`/home/dd/engine`);
      const privateRepoName = Underpost.repo.privateRepoFactory(deployId);
      cloneRepository({
        repository: `${process.env.GITHUB_USERNAME}/${privateRepoName}`,
        destination: `../${privateRepoName}`,
        replace: true,
      });
      const packageJsonDeploy = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/package.json`, 'utf8'));
      const packageJsonEngine = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      if (packageJsonDeploy.version !== packageJsonEngine.version) {
        logger.warn(
          `Version mismatch: deploy-version:${packageJsonDeploy.version} !== engine-version:${packageJsonEngine.version},
Prevent build private config repo.`,
        );
        return {
          validVersion: false,
          engineVersion: packageJsonEngine.version,
          deployVersion: packageJsonDeploy.version,
        };
      }
      shellExec(`node bin/build ${deployId} --conf`);
      return {
        validVersion: true,
        engineVersion: packageJsonEngine.version,
        deployVersion: packageJsonDeploy.version,
      };
    },

    /**
     * Writes a conf manifest: `underpost.config.<deploy-id>.js` from the conf files of a deploy id, or
     * `underpost.config.js` for a conf workflow (`dd-github-pages`, `template`). The text around the `/**\/`
     * markers of `underpost.config.js` stays, and `env:` references stay strings that `resolveConfSecrets`
     * resolves at runtime. The imported configuration is never changed.
     * @param {object} [options]
     * @param {string} [options.deployId=''] - The deploy id whose conf files the manifest holds.
     * @param {string} [options.confWorkflowId=''] - The conf workflow of the engine manifest.
     * @memberof UnderpostRepository
     */
    writeConfManifest({ deployId = '', confWorkflowId = '' } = {}) {
      const manifest = structuredClone(underpostConfig);
      // The conf workflows edit the default server of the engine manifest.
      const defaultServer = () => manifest.server['default.net']['/'];
      switch (confWorkflowId) {
        case '':
          break;
        case 'dd-github-pages': {
          const host = `${process.env.GITHUB_USERNAME ? process.env.GITHUB_USERNAME : 'underpostnet'}.github.io`;
          const path = '/pwa-microservices-template-ghpkg';
          manifest.server = {
            [host]: { [path]: { ...defaultServer(), apiBaseProxyPath: '/', apiBaseHost: 'www.nexodev.org' } },
          };
          break;
        }
        case 'template':
          defaultServer().valkey = { port: 'env:VALKEY_PORT:int:6379', host: 'env:VALKEY_HOST:127.0.0.1' };
          Object.assign(defaultServer().db, {
            host: 'env:DB_HOST:mongodb://127.0.0.1:27017',
            replicaSet: 'env:DB_REPLICA_SET:rs0',
            authSource: 'env:DB_AUTH_SOURCE:admin',
            user: 'env:DB_USER:',
            password: 'env:DB_PASSWORD:',
          });
          break;
        default:
          logger.error(`Unknown confWorkflowId: ${confWorkflowId}.`);
          return;
      }
      if (!confWorkflowId && deployId && fs.existsSync(`./engine-private/conf/${deployId}`))
        for (const type of ['client', 'server', 'ssr'])
          manifest[type] = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.${type}.json`, 'utf8'));
      else if (!confWorkflowId)
        logger.warn(
          `Deploy ID configuration not found: ./engine-private/conf/${deployId}, using default configuration.`,
        );

      const sepRender = '/**/';
      const confRawPaths = fs.readFileSync(confManifestPath(), 'utf8').split(sepRender);
      confRawPaths[1] = `${JSON.stringify(manifest)};`;
      const targetConfPath = confManifestPath(confWorkflowId ? '' : deployId);
      fs.writeFileSync(targetConfPath, confRawPaths.join(sepRender), 'utf8');
      // A host tool, not a dependency: without it the manifest stays valid, only unformatted.
      if (
        `${shellExec('command -v prettier', { silent: true, silentOnError: true, stdout: true, disableLog: true }) ?? ''}`.trim()
      )
        shellExec(`prettier --write ${shellArgumentFactory(targetConfPath)}`);
      else logger.warn('prettier is not on PATH; conf manifest left unformatted', { targetConfPath });
    },

    /**
     * Reduces a repository reference to its `owner/repo` slug, the form the deploy naming takes.
     * @param {string} url - Repository URL or `owner/repo` short form.
     * @returns {string} Slug.
     * @throws {Error} When no owner and repository can be read from the reference.
     * @memberof UnderpostRepository
     */
    repoSlugFactory(url = '') {
      const [owner, repo] = remoteUrlFactory(url)
        .replace(/^[^@/]+@[^:]+:/, '')
        .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, '')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '')
        .split('/');
      if (!owner || !repo) throw new Error(`[repo] '${url}' is not an owner/repo reference or a clone URL`);
      return `${owner}/${repo}`;
    },

    /**
     * Reduces any deploy-scoped reference to the conf id its repositories share.
     *
     * Single source of that parsing: deploy ids (`dd-lampp`), source repos (`engine-lampp`),
     * test source repos (`engine-test-lampp`) and private conf repos (`engine-lampp-private`)
     * all name the same deployment, and the monorepo (`engine` / `engine-private`) names none.
     * @param {string} reference - Deploy id, repository name, `owner/repo` slug, or clone URL.
     * @returns {string} Conf id, or `''` for the monorepo.
     * @memberof UnderpostRepository
     */
    confIdFactory(reference = '') {
      const name = `${reference || ''}`
        .trim()
        .split('/')
        .pop()
        .replace(/\.git$/, '');
      const confId = name
        .replace(/^dd-/, '')
        .replace(/^engine-test-/, '')
        .replace(/^engine-/, '')
        .replace(/-private$/, '');
      return confId === 'engine' || confId === 'private' ? '' : confId;
    },

    /**
     * Names the engine source repository a reference deploys from.
     * @param {string} reference - Deploy id or repository reference.
     * @param {object} [options] - Naming options.
     * @param {boolean} [options.test=false] - Name the private test source repo instead.
     * @returns {string} Repository name, without owner.
     * @memberof UnderpostRepository
     */
    engineRepoFactory(reference = '', options = { test: false }) {
      const confId = Underpost.repo.confIdFactory(reference);
      if (!confId) return 'engine';
      return options?.test === true ? `engine-test-${confId}` : `engine-${confId}`;
    },

    /**
     * Names the engine source repository of a reference on a source channel: `engine-<id>` on
     * `public`, its private mirror `engine-test-<id>` on `private`. The JS twin of the
     * `engine_source_repo` shell function.
     * @param {string} reference - Deploy id or repository reference.
     * @param {string} [channel='public'] - `public` or `private`.
     * @returns {string} Repository name, without owner.
     * @throws {Error} When the channel is unknown.
     * @memberof UnderpostRepository
     */
    engineSourceRepoFactory(reference = '', channel = 'public') {
      return Underpost.repo.engineRepoFactory(reference, { test: assertSourceChannel(channel) === 'private' });
    },

    /**
     * Names the repository a source channel fetches a product repository from: itself on
     * `public`, its private mirror `<name>-private` on `private`.
     * @param {string} repository - The public repository, as `owner/repo`.
     * @param {string} [channel='public'] - `public` or `private`.
     * @returns {string} The repository, as `owner/repo`.
     * @throws {Error} When the channel is unknown or the repository already names a private mirror.
     * @memberof UnderpostRepository
     */
    sourceRepoFactory(repository, channel = 'public') {
      if (!['public', 'private'].includes(channel))
        throw new Error(`[repo] unknown source channel '${channel}': use public or private`);
      const slug = Underpost.repo.repoSlugFactory(repository);
      if (slug.endsWith('-private'))
        throw new Error(`[repo] '${repository}' is a private mirror; give the public repository`);
      return channel === 'private' ? `${slug}-private` : slug;
    },

    /**
     * Names the private configuration repository a reference's conf lives in.
     * @param {string} reference - Deploy id or repository reference.
     * @returns {string} Repository name, without owner.
     * @memberof UnderpostRepository
     */
    privateRepoFactory(reference = '') {
      const confId = Underpost.repo.confIdFactory(reference);
      return confId ? `engine-${confId}-private` : 'engine-private';
    },

    /**
     * Names the canonical GitHub package repository a reference's engine mirrors into.
     *
     * The monorepo has none — `.github/workflows/ghpkg.ci.yml` builds `engine-ghpkg-<conf_id>`
     * per deploy, and the template lineage mirrors into `pwa-microservices-template-ghpkg`
     * instead — so an unnamed deploy resolves to `''` rather than an invented name.
     * @param {string} reference - Deploy id or repository reference.
     * @returns {string} Repository name without owner, or `''` for the monorepo.
     * @memberof UnderpostRepository
     */
    ghpkgRepoFactory(reference = '') {
      const confId = Underpost.repo.confIdFactory(reference);
      return confId ? `engine-ghpkg-${confId}` : '';
    },

    /**
     * Every distinct repository a deploy's instances are built from, as declared by
     * `metadata.repository` in its `conf.instances.json`.
     *
     * An instance is a separate product with its own repository and its own workflows —
     * `dd-cyberia` builds from `cyberia-server` and `cyberia-client` — so anything acting on
     * "the repositories of a deploy" has to include them or it covers only half the deploy.
     * The path is left to {@link readConfInstances} rather than rebuilt here.
     * @param {string} deployId - Deploy id (e.g. `dd-cyberia`).
     * @returns {Array<string>} Deduplicated `owner/repo` slugs, empty when the deploy declares none.
     * @memberof UnderpostRepository
     */
    instanceRepos(deployId = '') {
      const id = `${deployId || ''}`.trim();
      if (!id) return [];
      try {
        return [
          ...new Set(
            readConfInstances(id)
              .map((entry) => entry?.metadata?.repository)
              .filter(Boolean),
          ),
        ];
      } catch (error) {
        // A deploy that declares no instances has no file, which is not a fault; anything else is.
        if (error.code !== 'ENOENT')
          logger.warn(`[repo] unreadable conf.instances.json for ${id}`, { error: error.message });
        return [];
      }
    },

    /**
     * Resolves the repository pair a node checks out: the engine source and the private
     * configuration that belongs to it.
     *
     * One source of that pairing, because two callers compose it — `run pull` on the node
     * itself and `edge --sync` composing the same pull for a fleet — and a node whose engine
     * and conf came from two different resolutions reads a conf that does not describe it.
     * The private repository is derived from the conf id the two share and takes the engine's
     * owner, so naming only the source can never split the pair: `underpostnet/engine-test-lampp`
     * pairs with `underpostnet/engine-lampp-private`, as does `underpostnet/engine-lampp`.
     * Naming `enginePrivate` overrides that derivation with its own `owner/repo` or clone URL.
     * @param {object} [options] - Pair options.
     * @param {string} [options.engine] - Engine source, as `owner/repo` or a clone URL.
     * @param {string} [options.enginePrivate] - Private configuration repository, overriding the derivation.
     * @param {string} [options.account] - Owner the monorepo defaults to; `GITHUB_USERNAME` otherwise.
     * @returns {{engine: string, enginePrivate: string}} Both slugs.
     * @memberof UnderpostRepository
     */
    enginePairFactory({ engine = '', enginePrivate = '', account = '' } = {}) {
      const owner = `${account || ''}`.trim() || process.env.GITHUB_USERNAME || 'underpostnet';
      const source = Underpost.repo.repoSlugFactory(`${engine || ''}`.trim() || `${owner}/engine`);
      const conf = `${enginePrivate || ''}`.trim();
      return {
        engine: source,
        enginePrivate: conf
          ? Underpost.repo.repoSlugFactory(conf)
          : `${source.split('/')[0]}/${Underpost.repo.privateRepoFactory(source)}`,
      };
    },

    /**
     * Fast-forwards the engine and engine-private checkouts of the working directory ahead of a
     * template deploy, each from the remote branch it tracks. The deploy runners publish local
     * commits, so a diverged checkout stops the deploy instead of losing history: they never take
     * the replacing route of `run pull`.
     * @memberof UnderpostRepository
     */
    fastForwardEnginePair() {
      pullRepository({ path: '.' });
      pullRepository({ path: './engine-private' });
    },

    /**
     * @method gitIdentity
     * @description The commit identity: the repository owner (`GITHUB_USERNAME`) as `user.name` and
     * `GITHUB_EMAIL` as `user.email`. A value that is not set is left out, so the global git identity applies.
     * @returns {Array<[string, string]>} Git configuration keys and values.
     * @memberof UnderpostRepository
     */
    gitIdentity() {
      return Object.entries({
        'user.name': repositoryIdentityFactory().owner,
        'user.email': environmentValueFactory('GITHUB_EMAIL'),
      }).filter(([, value]) => value);
    },

    /**
     * @method gitIdentityCommands
     * @description The `git config` commands of {@link UnderpostRepository.API.gitIdentity}, for a script.
     * @returns {string[]} Commands with quoted values.
     * @memberof UnderpostRepository
     */
    gitIdentityCommands() {
      return Underpost.repo.gitIdentity().map(([key, value]) => `git config ${key} ${shellArgumentFactory(value)}`);
    },

    /**
     * Initializes a git repository at the given path, or keeps the one there, and sets the commit
     * identity of {@link UnderpostRepository.API.gitIdentityCommands} and `origin`.
     * @param {object} opts
     * @param {string} opts.path - Absolute or relative path to the repository.
     * @param {string} [opts.origin] - `owner/repo` or a clone URL `origin` points at.
     * @memberof UnderpostRepository
     */
    initLocalRepo({ path: repoPath, origin }) {
      const dir = path.resolve(repoPath);
      // Runtime document roots are chowned to the web server user, and git refuses to operate on
      // a tree owned by someone else until it is declared safe.
      declareSafeDirectory(dir);
      if (!fs.existsSync(`${dir}/.git`)) {
        fs.mkdirpSync(dir);
        runGit(['init', '--quiet', dir]);
      }
      for (const [key, value] of Underpost.repo.gitIdentity()) runGit(['config', key, value], { cwd: dir });
      runGit(['config', 'core.filemode', 'false'], { cwd: dir });
      if (!origin) return;
      const url = remoteUrlFactory(origin);
      const current = remoteUrl(dir);
      if (current !== url) runGit(['remote', current ? 'set-url' : 'add', 'origin', url], { cwd: dir });
    },

    /**
     * Materializes a runtime's document root from the repository its conf route declares.
     *
     * Shared by every repository-backed runtime — {@link WpService} for WordPress site roots and
     * {@link LamppService} for static Apache document roots — so one deployment can serve many
     * repositories on the same host through a single provisioning contract.
     *
     * Idempotent: an existing directory is left alone, and the clone lands on a temporary path
     * first so an interrupted run never leaves a partial tree at the document root.
     *
     * @param {object} opts
     * @param {string} opts.host - Virtual-host name, for logging.
     * @param {string} opts.siteRoot - Absolute path the checkout must occupy.
     * @param {string} opts.repository - Repository URL or `owner/repo` short form.
     * @param {string} [opts.owner='daemon:daemon'] - Filesystem owner of the served tree.
     * @returns {{accessible: boolean, cloned: boolean}} Whether the remote answered, and whether
     *   this call created the checkout.
     * @memberof UnderpostRepository
     */
    provisionSiteRoot({ host, siteRoot, repository, owner = 'daemon:daemon' }) {
      // An `env:` reference to a variable the process never received resolves to an empty string,
      // so a conf fault and an unreachable remote arrive here as the same falsy value. Reported
      // together they read as a GitHub problem and send the search to the wrong place.
      const reference = `${repository ?? ''}`.trim();
      if (!reference) {
        logger.error(
          `${host}: no repository resolved for ${siteRoot} — the conf route's reference is empty, ` +
            `so its 'env:' variable is missing from this process's environment`,
        );
        return { accessible: false, cloned: false };
      }

      if (!githubCredential() && isGithubHttpsUrl(remoteUrlFactory(reference)))
        logger.warn(`${host}: no GitHub credential — git operations will fail for private repositories`);

      if (!isReachable(reference)) {
        logger.warn(`${host}: remote repository not accessible (${reference})`);
        return { accessible: false, cloned: false };
      }
      // Provisioned means a checkout is there, not merely that the path is. The runtime image
      // ships the document-root directories, so an existence test calls every fresh pod already
      // provisioned, skips the clone, and leaves Apache serving 403 from a directory nothing
      // populates. `.git` is the only mark that the declared repository actually landed here.
      if (fs.existsSync(`${siteRoot}/.git`)) {
        logger.info(`${host}: repo already present at ${siteRoot}`);
        return { accessible: true, cloned: false };
      }
      const populateInPlace = fs.existsSync(siteRoot);
      if (populateInPlace) logger.warn(`${host}: ${siteRoot} holds no checkout; provisioning ${reference} into it`);

      logger.info(`${host}: cloning ${reference} → ${siteRoot}`);
      const tmp = `${siteRoot}.tmp`;
      fs.removeSync(tmp);
      cloneRepository({ repository: reference, destination: tmp });
      // Copied into a directory that already exists rather than renamed over it: that directory
      // can be image-provided or a mount point, and a rename onto one fails where a copy works.
      if (populateInPlace) {
        fs.copySync(tmp, siteRoot, { overwrite: true, preserveTimestamps: true });
        fs.removeSync(tmp);
      } else fs.moveSync(tmp, siteRoot);
      chownHostPath(siteRoot, {
        owner: hostOwner(owner),
        modes: { directory: '0755', file: '0755' },
        reason: 'gives the document root to the web server user',
      });
      return { accessible: true, cloned: true };
    },

    /**
     * Resolves the in-pod site-root directory where a conf route's repository lives.
     *
     * General-purpose resolution, independent of any single runtime:
     *   1. An explicit `directory` (the conf-declared document root) always wins.
     *   2. Otherwise the runtime's base directory is used (e.g. `wp` → `/opt/lampp/htdocs/wp/<host>`).
     *   3. A subdirectory route (e.g. `/wp`) appends `<subDir>` to the resolved root.
     *
     * This mirrors {@link WpService.createApp}'s `vhostDir`/`wpDir` layout so backups target the
     * exact directory provisioning created, including subdirectory installs and custom directories.
     *
     * @param {object} opts
     * @param {string} opts.runtime - The runtime identifier (e.g. 'wp').
     * @param {string} opts.host - The virtual-host name.
     * @param {string} [opts.routePath='/'] - The conf route path the repository is mounted under.
     * @param {string} [opts.directory] - Explicit document root from conf; overrides the runtime base.
     * @returns {string|null} Absolute path inside the pod, or null when neither a directory nor a
     *   known runtime base resolves.
     * @memberof UnderpostRepository
     */
    runtimeSiteRoot({ runtime, host, routePath = '/', directory } = {}) {
      const runtimeBase = {
        wp: `/opt/lampp/htdocs/wp/${host}`,
      };
      const vhostDir = directory || runtimeBase[runtime];
      if (!vhostDir) return null;
      const subDir = routePath && routePath !== '/' ? routePath.replace(/^\/+/, '').replace(/\/+$/, '') : '';
      return subDir ? `${vhostDir}/${subDir}` : vhostDir;
    },

    /**
     * Probes a running pod for the first candidate directory that is a git repository
     * (i.e. contains a `.git` entry). Used to locate a site root before backing it up so a
     * missing/unprovisioned directory is detected up-front instead of producing an opaque
     * shell `exit 1` from a failed `cd`.
     *
     * @param {object}   opts
     * @param {string}   opts.podName   - Target pod name.
     * @param {string}   opts.namespace - Kubernetes namespace.
     * @param {string[]} opts.candidates - Absolute paths to probe, most-specific first.
     * @returns {string|null} The first candidate that is a git repo, or null if none match.
     * @memberof UnderpostRepository
     */
    podRepoDir({ podName, namespace, candidates }) {
      const probe = candidates.map((dir) => `if [ -d '${dir}/.git' ]; then echo '${dir}'; exit 0; fi`).join('; ');
      let out = '';
      try {
        out = Underpost.kubectl.exec({ podName, namespace, command: `${probe}; echo ''` }) || '';
      } catch (err) {
        logger.warn(`podRepoDir: probe failed in pod ${podName}`, err.message);
        return null;
      }
      return (
        out
          .split('\n')
          .map((line) => line.trim())
          .find(Boolean) || null
      );
    },

    /**
     * The site roots of a deployment's repository entries in its live pod: one per
     * `server[host][path]` entry with a `repository`, where that pod holds a git repository.
     * An entry without a site-root mapping or without a provisioned repository is skipped.
     *
     * @param {object} opts
     * @param {string}  opts.deployId - Deployment ID.
     * @param {string}  [opts.namespace='default'] - Kubernetes namespace.
     * @param {string}  [opts.env='production'] - Deployment environment.
     * @returns {Array<{host:string, path:string, runtime:string, repository:string, podName:string, siteRoot:string}>}
     * @memberof UnderpostRepository
     */
    podSiteRoots({ deployId, namespace = 'default', env = 'production' }) {
      const confServer = readConfJson(deployId, 'server', { resolve: true });
      const entries = Object.entries(confServer).flatMap(([host, paths]) =>
        Object.entries(paths)
          .filter(([, entry]) => entry.repository)
          .map(([routePath, entry]) => ({ host, routePath, entry })),
      );
      if (!entries.length) return [];

      // The active blue/green colour names the pod that serves the site.
      const traffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace, env });
      if (!traffic) {
        logger.warn(`podSiteRoots: could not resolve current traffic for ${deployId} — skipping`);
        return [];
      }
      const pods = Underpost.kubectl.get(`${deployId}-${env}-${traffic}`, 'pods', namespace);
      const runningPod = pods.find((p) => p.STATUS === 'Running');
      if (!runningPod) {
        logger.warn(`podSiteRoots: no running ${traffic} pod found for ${deployId} in namespace ${namespace}`);
        return [];
      }
      const podName = runningPod.NAME;

      const roots = [];
      for (const { host, routePath, entry } of entries) {
        const siteRootArgs = { runtime: entry.runtime, host, directory: entry.directory };
        const repoRoot = Underpost.repo.runtimeSiteRoot({ ...siteRootArgs, routePath });
        if (!repoRoot) {
          logger.warn(`podSiteRoots: no site-root mapping for runtime '${entry.runtime}' (${host})`);
          continue;
        }
        // The vhost directory (root route) covers conf/path drift.
        const vhostRoot = Underpost.repo.runtimeSiteRoot({ ...siteRootArgs, routePath: '/' });
        const candidates = [...new Set([repoRoot, vhostRoot].filter(Boolean))];
        const siteRoot = Underpost.repo.podRepoDir({ podName, namespace, candidates });
        if (!siteRoot) {
          logger.warn(
            `podSiteRoots: no git repository found in pod ${podName} for ${host} (checked ${candidates.join(
              ', ',
            )}) — site may not be provisioned yet; skipping`,
          );
          continue;
        }
        roots.push({ host, path: routePath, runtime: entry.runtime, repository: entry.repository, podName, siteRoot });
      }
      return roots;
    },

    /**
     * Pushes the site repositories of a deployment from its live pod: `git commit` and `git push`
     * inside the pod via `kubectl exec`, before a redeploy replaces the pod. This is the source
     * workflow of a site repository; data backups go to the object store.
     *
     * GITHUB_TOKEN and GITHUB_USERNAME are injected as ephemeral environment variables in the exec
     * command — never persisted to the pod filesystem.
     *
     * @param {object} opts
     * @param {string}  opts.deployId   - Deployment ID (used to read conf.server.json and find pods).
     * @param {string}  [opts.namespace='default'] - Kubernetes namespace.
     * @param {string}  [opts.env='production'] - Deployment environment.
     * @returns {void}
     * @memberof UnderpostRepository
     */
    backupPodRepositories({ deployId, namespace = 'default', env = 'production' }) {
      const githubToken = githubCredential()?.token ?? '';
      const githubUsername = repositoryIdentityFactory().owner;

      if (!githubToken) {
        logger.warn('backupPodRepositories: no GitHub credential — git push will fail');
      }

      for (const { host, runtime, repository, podName, siteRoot } of Underpost.repo.podSiteRoots({
        deployId,
        namespace,
        env,
      })) {
        const repoName = repository.split('/').pop().split('.')[0];

        // Secrets are injected as env vars in the exec, never written to the filesystem.
        const backupScript = [
          `export GITHUB_TOKEN='${githubToken.replace(/'/g, "'\\''")}'`,
          `export GITHUB_USERNAME='${githubUsername.replace(/'/g, "'\\''")}'`,
          `git config --global --add safe.directory '${siteRoot}' 2>/dev/null || true`,
          `cd '${siteRoot}' && git add -A && git commit -m "backup $(date -u +%Y-%m-%dT%H:%M:%SZ)" || true`,
          `cd '${siteRoot}' && underpost push . ${githubUsername}/${repoName}`,
          `cd /home/dd/engine && node bin host clean --force`,
        ].join(' && ');

        try {
          logger.info(`backupPodRepositories: backing up ${host} (${runtime}) in pod ${podName}`);
          Underpost.kubectl.exec({ podName, namespace, command: backupScript });
          logger.info(`backupPodRepositories: git push done for ${host}`);
        } catch (err) {
          logger.error(`backupPodRepositories: backup failed for ${host}`, err.message);
        }
      }
    },

    /**
     * Clones the deploy-specific private repository into `./engine-private`
     * when it does not already exist on disk.  Returns `{ ephemeral: true }`
     * If `./engine-private` already exists, the call is a no-op unless
     * `options.force` is `true`, in which case the directory is removed and
     * re-cloned.
     *
     * @param {string} [deployId] - Deploy ID (e.g. `dd-core`) used to derive
     *        the repo name `engine-{component}-private`.  Falls back to
     *        `process.env.DEFAULT_DEPLOY_ID`.  When neither is available the
     *        default repo name `engine-private` is used.
     * @param {object} [options]
     * @param {boolean} [options.force=false] - Remove existing `engine-private`
     *        and re-clone.
     * @memberof UnderpostRepository
     */
    privateEngineRepoFactory(deployId, options = { force: false }) {
      if (fs.existsSync('./engine-private') && !options.force) return;

      if (options.force && fs.existsSync('./engine-private')) {
        fs.removeSync('./engine-private');
        logger.info('engine-private removed (force re-clone)');
      }

      const effectiveDeployId = deployId || process.env.DEFAULT_DEPLOY_ID;

      const username = process.env.GITHUB_USERNAME;
      if (!username) {
        throw new Error('privateEngineRepoFactory: GITHUB_USERNAME not set');
      }

      const repoName = Underpost.repo.privateRepoFactory(effectiveDeployId);
      logger.info(`engine-private missing — cloning ${username}/${repoName}`);
      cloneRepository({ repository: `${username}/${repoName}`, destination: './engine-private' });
    },

    /**
     * Removes the ephemeral `engine-private/` clone created by
     * `privateEngineRepoFactory()`.  No-op if the directory does not exist.
     * @memberof UnderpostRepository
     */
    cleanupPrivateEngineRepo() {
      if (fs.existsSync('./engine-private')) {
        fs.removeSync('./engine-private');
        logger.info('engine-private ephemeral clone removed');
      }
      if (fs.existsSync('/home/dd/engine-private')) {
        fs.removeSync('/home/dd/engine-private');
        logger.info('engine-private in /home/dd removed');
      }
    },

    /**
     * Resolves the GitHub repository for a given instance runtime by scanning
     * every `conf.instances.json` listed in `./engine-private/deploy/dd.routes`.
     *
     * Resolution order:
     *  1. If `runtime` is falsy, returns `${GITHUB_USERNAME}/engine`.
     *  2. Iterates each deploy ID found in `dd.routes` and looks for an instance
     *     whose `runtime` field matches the supplied value.
     *  3. When a match is found, returns `instance.metadata.repository`.
     *  4. Falls back to `${GITHUB_USERNAME}/engine` when no match is found.
     *
     * @param {string} [runtime=''] - The runtime identifier to look up (e.g. `'cyberia-server'`, `'cyberia-client'`).
     * @param {boolean} [ownRuntimeRepo=false] - Whether to check for the runtime's own repository.
     * @returns {string} The resolved `owner/repo` string.
     * @memberof UnderpostRepository
     */
    resolveInstanceRepo(runtime = '', ownRuntimeRepo = false) {
      const fallback = `${process.env.GITHUB_USERNAME}/engine`;
      if (!runtime) return fallback;
      // A `.dev` suffix selects the development image workflow
      // (docker-image.<runtime>.dev.ci.yml) but resolves to the same instance
      // repo as its production counterpart, so strip it before matching.
      runtime = runtime.replace(/\.dev$/, '');
      const deployIds = readDeployRoutes();
      for (const deployId of deployIds) {
        const confPath = `./engine-private/conf/${deployId}/conf.instances.json`;
        if (!fs.existsSync(confPath)) continue;
        try {
          // readConfInstances returns the bare array of entries. The template
          // entries carry runtime + metadata.repository, so the un-expanded list
          // is enough here (no need to expand variants).
          const match = readConfInstances(deployId).find((i) => i && i.runtime === runtime);
          if (match && match.metadata && match.metadata.repository) {
            logger.info(`[resolveInstanceRepo] resolved from ${confPath}`, {
              runtime,
              repo: match.metadata.repository,
            });
            return match.metadata.repository;
          }
        } catch (err) {
          logger.warn(`[resolveInstanceRepo] failed to parse ${confPath}: ${err.message}`);
        }
      }
      if (ownRuntimeRepo) {
        const runtimeRepo = isReachable(`${process.env.GITHUB_USERNAME}/${runtime}`);
        if (runtimeRepo) {
          logger.info(`[resolveInstanceRepo] resolved from ${process.env.GITHUB_USERNAME}/${runtime}`, {
            runtime,
            repo: `${process.env.GITHUB_USERNAME}/${runtime}`,
          });
          return `${process.env.GITHUB_USERNAME}/${runtime}`;
        }
      }
      return fallback;
    },

    /**
     * Checks out one directory of a GitHub repository, shallow and sparse, unless it is there.
     * @param {string} subPath - The directory inside the repository (e.g. `conf/dd-prototype`).
     * @param {object} [options]
     * @param {string} [options.repoOwner='underpostnet']
     * @param {string} [options.repoName='engine-private']
     * @param {string} [options.targetDir='./engine-private'] - The checkout; it must not hold another one.
     * @returns {boolean} `false` when the directory was already there.
     * @memberof UnderpostRepository
     */
    sparseCheckoutDirectory(subPath, options = {}) {
      const { repoOwner = 'underpostnet', repoName = 'engine-private', targetDir = './engine-private' } = options;
      if (fs.existsSync(`${targetDir}/${subPath}`)) return false;
      cloneRepository({ repository: `${repoOwner}/${repoName}`, destination: targetDir, depth: 1, sparse: [subPath] });
      return true;
    },

    /**
     * Ensures a deploy's public source repo (e.g. `engine-prototype`) is present next to the engine,
     * so catalog `sourceMoves` the engine tree lacks can be copied in: cloned when missing, otherwise
     * fast-forwarded. The working tree is never reset: it is the git view of edits made in the engine
     * tree, which ignores those paths, so a pending change there is review material.
     * @param {string} repoName - Public source repo name (e.g. `engine-prototype`).
     * @returns {boolean} `true` when the repo is available on disk.
     * @memberof UnderpostRepository
     */
    pullSourceRepo(repoName) {
      const username = process.env.GITHUB_USERNAME;
      if (!username || !repoName) return false;
      const repoPath = path.resolve(`../${repoName}`);
      if (!fs.existsSync(repoPath)) cloneRepository({ repository: `${username}/${repoName}`, destination: repoPath });
      else {
        declareSafeDirectory(repoPath);
        pullRepository({ path: repoPath });
      }
      return fs.existsSync(repoPath);
    },
  };
}

export default UnderpostRepository;
