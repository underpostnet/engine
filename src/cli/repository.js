/**
 * Repository module for managing Git operations and configurations.
 * @module src/cli/repository.js
 * @namespace UnderpostRepository
 */

import dotenv from 'dotenv';
import { commitData } from '../client/components/core/CommonJs.js';
import { pbcopy, shellCd, shellExec } from '../server/process.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';
import fs from 'fs-extra';
import {
  getNpmRootPath,
  Config,
  loadConf,
  readConfJson,
  getConfFilePath,
  loadReplicas,
  loadConfServerJson,
  getDataDeploy,
  buildReplicaId,
  writeEnv,
} from '../server/conf.js';
import { buildClient } from '../server/client-build.js';
import { DefaultConf } from '../../conf.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

const diffCmd = `--no-pager show -U0 -w --word-diff=color --word-diff-regex='[^[:space:]]' --color=always`;

/**
 * @class UnderpostRepository
 * @description Manages Git operations and configurations.
 * This class provides a set of static methods to automate various
 * Git operations, including cloning, pulling, and committing changes.
 * @memberof UnderpostRepository
 */
class UnderpostRepository {
  static API = {
    /**
     * Clones a Git repository from GitHub.
     * @param {string} [gitUri=`${process.env.GITHUB_USERNAME}/pwa-microservices-template`] - The URI of the GitHub repository (e.g., "username/repository").
     * @param {object} [options={ bare: false, G8: false }] - Cloning options.
     * @param {boolean} [options.bare=false] - If true, performs a bare clone.
     * @param {boolean} [options.g8=false] - If true, uses the .g8 extension.
     * @memberof UnderpostRepository
     */
    clone(gitUri = `${process.env.GITHUB_USERNAME}/pwa-microservices-template`, options = { bare: false, g8: false }) {
      const gExtension = options.g8 === true ? '.g8' : '.git';
      const repoName = gitUri.split('/').pop();
      if (fs.existsSync(`./${repoName}`)) fs.removeSync(`./${repoName}`);
      shellExec(
        `git clone ${options?.bare === true ? ` --bare ` : ''}https://${
          process.env.GITHUB_TOKEN ? `${process.env.GITHUB_TOKEN}@` : ''
        }github.com/${gitUri}${gExtension}`,
        {
          disableLog: true,
        },
      );
    },
    /**
     * Pulls updates from a GitHub repository.
     * @param {string} [repoPath='./'] - The local path to the repository.
     * @param {string} [gitUri=`${process.env.GITHUB_USERNAME}/pwa-microservices-template`] - The URI of the GitHub repository.
     * @param {object} [options={ g8: false }] - Pulling options.
     * @param {boolean} [options.g8=false] - If true, uses the .g8 extension.
     * @memberof UnderpostRepository
     */
    pull(
      repoPath = './',
      gitUri = `${process.env.GITHUB_USERNAME}/pwa-microservices-template`,
      options = { g8: false },
    ) {
      const gExtension = options.g8 === true ? '.g8' : '.git';
      shellExec(
        `cd ${repoPath} && git pull https://${
          process.env.GITHUB_TOKEN ? `${process.env.GITHUB_TOKEN}@` : ''
        }github.com/${gitUri}${gExtension}`,
        {
          disableLog: true,
        },
      );
    },
    /**
     * Creates a Git commit with a conventional commit message.
     * @param {string} [repoPath='./'] - The local path to the repository.
     * @param {string} [commitType='feat'] - The type of commit (e.g., 'feat', 'fix', 'docs', 'reset').
     * @param {string} [subModule=''] - The submodule or scope of the commit.
     * @param {string} [message=''] - The commit message.
     * @param {object} [options={ copy: false, info: false, empty: false }] - Commit options.
     * @param {boolean} [options.copy=false] - If true, copies the commit message to the clipboard.
     * @param {boolean} [options.info=false] - If true, displays information about commit types.
     * @param {boolean} [options.empty=false] - If true, allows an empty commit.
     * @param {boolean} [options.diff=false] - If true, shows the diff of the last commit.
     * @param {boolean} [options.edit=false] - If true, amends the last commit without changing the message.
     * @param {boolean} [options.cached=false] - If true, commits only staged changes.
     * @param {number} [options.log=0] - If greater than 0, shows the last N commits with diffs.
     * @param {boolean} [options.lastMsg=0] - If greater than 0, copies or show the last last single n commit message to clipboard.
     * @param {boolean} [options.unpush=false] - If true with --log, automatically detects unpushed commits ahead of remote and uses that count.
     * @param {string} [options.deployId=''] - An optional deploy ID to include in the commit message.
     * @param {string} [options.hashes=''] - If provided with diff option, shows the diff between two hashes.
     * @param {string} [options.extension=''] - If provided with diff option, filters the diff by this file extension.
     * @param {boolean|string} [options.changelog=undefined] - If true, prints the changelog since the last CI integration commit (starting with 'ci(package-pwa-microservices-'). If a number string, prints the changelog of the last N commits split by version sections. Only considers commits starting with '[<tag>]'.
     * @param {boolean} [options.changelogBuild=false] - If true, scrapes all git history and builds a full CHANGELOG.md. Commits containing 'New release v:' are used as version section titles. Only commits starting with '[<tag>]' are included as entries.
     * @param {string} [options.changelogMinVersion=''] - If set, overrides the default minimum version limit (2.85.0) for --changelog-build.
     * @param {boolean} [options.changelogNoHash=false] - If true, omits commit hashes from the changelog entries.
     * @memberof UnderpostRepository
     */
    commit(
      repoPath = undefined,
      commitType = 'feat',
      subModule = '',
      message = '',
      options = {
        copy: false,
        info: false,
        empty: false,
        diff: false,
        edit: false,
        cached: false,
        lastMsg: 0,
        log: 0,
        deployId: '',
        hashes: '',
        extension: '',
        changelog: undefined,
        changelogBuild: false,
        changelogMinVersion: '',
        changelogNoHash: false,
        unpush: false,
        b: false,
        p: undefined,
        bc: '',
        isRemoteRepo: '',
      },
    ) {
      if (!repoPath) repoPath = '.';

      if (options.isRemoteRepo) {
        const accessible = Underpost.repo.isRemoteRepo(options.isRemoteRepo);
        console.log(accessible);
        return;
      }

      if (options.bc) {
        console.log(
          shellExec(`cd ${repoPath} && git for-each-ref --contains ${options.bc} --format='%(refname:short)'`, {
            stdout: true,
            silent: true,
            disableLog: true,
          }).trim(),
        );
        return;
      }

      if (options.p !== undefined) {
        const branch =
          options.p === true
            ? shellExec(`cd ${repoPath} && git branch --show-current`, {
                stdout: true,
                silent: true,
                disableLog: true,
              }).trim()
            : options.p;
        console.log(
          shellExec(`cd ${repoPath} && git --no-pager reflog show refs/heads/${branch}`, {
            stdout: true,
            silent: true,
            disableLog: true,
          }).trim(),
        );
        return;
      }

      if (options.b) {
        const currentBranch = shellExec(`cd ${repoPath} && git branch --show-current`, {
          stdout: true,
          silent: true,
          disableLog: true,
        }).trim();
        if (options.copy) pbcopy(currentBranch);
        else console.log(currentBranch);
        return;
      }

      if (options.changelog !== undefined || options.changelogBuild) {
        const releaseMatch = 'New release v:';
        // Helper: parse [<tag>] commits into grouped sections
        const buildSectionChangelog = (commits) => {
          const groups = {};
          const tagOrder = [];
          for (const commit of commits) {
            if (!commit.message.startsWith('[')) continue;
            const match = commit.message.match(/^\[([^\]]+)\]\s*(.*)/);
            if (match) {
              const tag = match[1].trim();
              const context = match[2].trim().replaceAll('"', '');
              if (!groups[tag]) {
                groups[tag] = [];
                tagOrder.push(tag);
              }
              groups[tag].push({ ...commit, context });
            }
          }
          let out = '';
          for (const tag of tagOrder) {
            out += `### ${tag}\n\n`;
            for (const entry of groups[tag]) {
              out += `- ${entry.context}${options.changelogNoHash ? '' : ` (${commitUrl(entry.hash, entry.fullHash)})`}\n`;
            }
            out += '\n';
          }
          return out;
        };

        // Helper: fetch git log as structured array
        const fetchHistory = (limit) => {
          const limitArg = limit ? ` -n ${limit}` : '';
          const rawLog = shellExec(`git log --pretty=format:"%h||%H||%s||%ci"${limitArg}`, {
            stdout: true,
            silent: true,
            disableLog: true,
          });
          return rawLog
            .split('\n')
            .map((line) => {
              const parts = line.split('||');
              return {
                hash: (parts[0] || '').trim(),
                fullHash: (parts[1] || '').trim(),
                message: parts[2] || '',
                date: parts[3] || '',
              };
            })
            .filter((c) => c.hash);
        };

        const githubUser = process.env.GITHUB_USERNAME || 'underpostnet';
        const commitUrl = (shortHash, fullHash) =>
          `[${shortHash}](https://github.com/${githubUser}/engine/commit/${fullHash})`;

        // Helper: extract version from commit message containing 'New release v:'
        const extractVersion = (message) => {
          const idx = message.indexOf(releaseMatch);
          if (idx === -1) return null;
          return message.substring(idx + releaseMatch.length).trim();
        };

        // Helper: split commits array into version sections by 'New release v:' boundary
        const buildVersionSections = (commits) => {
          const sections = [];
          let currentSection = { title: null, date: new Date().toISOString().split('T')[0], commits: [] };

          for (const commit of commits) {
            const version = extractVersion(commit.message);
            if (version) {
              // Push accumulated commits as a section
              sections.push(currentSection);
              // Start new version section; commits below this one belong to it
              const commitDate = commit.date ? commit.date.split(' ')[0] : '';
              currentSection = { title: `${releaseMatch}${version}`, date: commitDate, hash: commit.hash, commits: [] };
            } else {
              currentSection.commits.push(commit);
            }
          }
          // Push the last (oldest) section
          if (currentSection.commits.length > 0) sections.push(currentSection);
          return sections;
        };

        // Helper: render sections array into changelog markdown string
        const renderSections = (sections) => {
          let changelog = '';
          for (const section of sections) {
            const sectionBody = buildSectionChangelog(section.commits);
            if (!sectionBody) continue;
            if (section.title) {
              changelog += `## ${section.title}${options.changelogNoHash ? '' : ` (${section.date})`}\n\n`;
            } else {
              changelog += `## ${section.date}\n\n`;
            }
            changelog += sectionBody;
          }
          return changelog;
        };

        const changelogMinVersion = options.changelogMinVersion || '2.97.1';

        if (options.changelogBuild) {
          // --changelog-build: scrape ALL history, split by 'New release v:' commits as version sections
          const allCommits = fetchHistory();
          const sections = buildVersionSections(allCommits);

          // Filter sections: stop at changelogMinVersion boundary
          const limitedSections = [];
          for (const section of sections) {
            limitedSections.push(section);
            if (section.title) {
              const versionStr = section.title.replace(releaseMatch, '').trim();
              if (versionStr === changelogMinVersion) break;
            }
          }

          let changelog = renderSections(limitedSections);

          if (!changelog) {
            changelog = `No changelog entries found.\n`;
          }

          const changelogPath = `${repoPath === '.' ? '.' : repoPath}/CHANGELOG.md`;
          fs.writeFileSync(changelogPath, `# Changelog\n\n${changelog}`);
          logger.info('CHANGELOG.md built at', changelogPath);
        } else {
          // --changelog [latest-n]: print changelog of last N commits (default: 1)
          const hasExplicitCount =
            options.changelog !== undefined && options.changelog !== true && !isNaN(parseInt(options.changelog));
          const scanLimit = hasExplicitCount ? parseInt(options.changelog) : 1;
          const allCommits = fetchHistory(scanLimit);

          const sections = buildVersionSections(allCommits);
          let changelog = renderSections(sections);
          console.log(changelog || `No changelog entries found.\n`);
        }

        return;
      }
      if (options.diff && options.hashes) {
        const hashes = options.hashes.split(',');
        const cmd = `git --no-pager diff ${hashes[0]} ${hashes[1] ? hashes[1] : 'HEAD'}${options.extension ? ` -- '*.${options.extension}'` : ''}`;
        if (options.copy) {
          pbcopy(cmd);
        } else console.log(cmd);
        return;
      }
      if (options.lastMsg) {
        if (options.copy) {
          pbcopy(Underpost.repo.getLastCommitMsg(options.lastMsg - 1));
        } else console.log(Underpost.repo.getLastCommitMsg(options.lastMsg - 1));
        return;
      }
      if (options.diff) {
        const _diffCmd = `git ${diffCmd.replace('show', `diff${options.cached ? ` --cached` : ''}`)}`;
        if (options.copy) pbcopy(_diffCmd);
        else console.log('Diff command:', _diffCmd);
        return;
      }
      if (options.log || options.unpush) {
        if (options.unpush) {
          const { count, hasUnpushed } = Underpost.repo.getUnpushedCount(repoPath);
          if (!hasUnpushed) {
            logger.warn('No unpushed commits found');
            return;
          }
          options.log = count;
        }
        const history = Underpost.repo.getHistory(options.log, repoPath);
        const chainCmd = history
          .reverse()
          .map((commitData, i) => `${i === 0 ? '' : ' && '}git -C ${repoPath} ${diffCmd} ${commitData.hash}`)
          .join('');
        if (history[0]) {
          let index = history.length;
          for (const commit of history) {
            console.log(
              shellExec(`cd ${repoPath} && git show -s --format=%ci ${commit.hash}`, {
                stdout: true,
                silent: true,
                disableLog: true,
              }).trim().green,
            );
            console.log(`${index}`.magenta, commit.hash.yellow, commit.message);
            index--;
            console.log(
              shellExec(`cd ${repoPath} && git show --name-status --pretty="" ${commit.hash}`, {
                stdout: true,
                silent: true,
                disableLog: true,
              }).trim().red,
            );
          }
          if (options.copy) pbcopy(chainCmd);
          else console.log('Show all:', chainCmd);
        } else logger.warn('No commits found');
        return;
      }
      if (commitType === 'reset') {
        if (options.copy) pbcopy(Underpost.repo.getLastCommitMsg());
        shellExec(`cd ${repoPath} && git reset --soft HEAD~${isNaN(parseInt(subModule)) ? 1 : parseInt(subModule)}`);
        return;
      }
      if (options.info) return logger.info('', commitData);
      const _message = `${commitType}${subModule ? `(${subModule})` : ''}: ${
        commitData[commitType].emoji
      } ${message ? message : commitData[commitType].description}`;
      if (options.copy) return pbcopy(_message);
      shellExec(
        `cd ${repoPath} && git commit ${options?.empty ? `--allow-empty ` : ''}${options.edit ? `--amend  --no-edit ` : `-m "${_message}"`}`,
      );
    },

    /**
     * Retrieves the message of the last Git commit.
     * @returns {string} The last commit message.
     * @memberof UnderpostRepository
     */
    getLastCommitMsg(skip = 0) {
      return shellExec(`git --no-pager log -1 --skip=${skip} --pretty=%B`, {
        stdout: true,
        silent: true,
        disableLog: true,
      });
    },

    /**
     * Pushes commits to a remote GitHub repository.
     * @param {string} [repoPath='./'] - The local path to the repository.
     * @param {string} [gitUri=`${process.env.GITHUB_USERNAME}/pwa-microservices-template`] - The URI of the GitHub repository.
     * @param {object} [options={ f: false, g8: false }] - Push options.
     * @param {boolean} [options.f=false] - If true, forces the push.
     * @param {boolean} [options.g8=false] - If true, uses the .g8 extension.
     * @memberof UnderpostRepository
     */
    push(
      repoPath = './',
      gitUri = `${process.env.GITHUB_USERNAME}/pwa-microservices-template`,
      options = { f: false, g8: false },
    ) {
      const gExtension = options.g8 === true ? '.g8' : '.git';
      shellExec(
        `cd ${repoPath} && git push https://${process.env.GITHUB_TOKEN}@github.com/${gitUri}${gExtension}${
          options?.f === true ? ' --force' : ''
        }`,
        {
          disableLog: true,
        },
      );
      logger.info(
        'commit url',
        `http://github.com/${gitUri}${gExtension === '.g8' ? '.g8' : ''}/commit/${shellExec(
          `cd ${repoPath} && git rev-parse --verify HEAD`,
          {
            stdout: true,
          },
        ).trim()}`,
      );
    },

    /**
     * Initializes a new Underpost repository, optionally setting up a deploy ID or sub-configuration.
     * @param {string} [projectName=''] - The name of the project to create.
     * @param {object} [options] - Initialization options.
     * @param {string} [options.deployId=''] - The deployment ID to set up.
     * @param {string} [options.subConf=''] - The sub-configuration to create.
     * @param {boolean} [options.cluster=false] - If true, sets up a clustered configuration.
     * @param {boolean} [options.dev=false] - If true, uses development settings.
     * @param {boolean} [options.buildRepos=false] - If true, creates the deployment repositories (engine-*, engine-*-private, engine-*-cron-backups).
     * @param {boolean} [options.purge=false] - If true, removes the deploy ID conf and all related repositories (requires deployId).
     * @param {boolean} [options.cleanTemplate=false] - If true, cleans the pwa-microservices-template build directory.
     * @param {boolean} [options.build=false] - If true, builds the deployment to pwa-microservices-template (requires deployId).
     * @param {boolean} [options.syncConf=false] - If true, syncs configuration to private repositories (requires deployId).
     * @param {boolean} [options.syncStart=false] - If true, syncs start scripts in deploy ID package.json with root package.json.
     * @param {boolean} [options.defaultConf=false] - If true, updates the default configuration file (requires deployId).
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
        syncStart: false,
        defaultConf: false,
        confWorkflowId: '',
      },
    ) {
      return new Promise(async (resolve, reject) => {
        try {
          await logger.setUpInfo();
          actionInitLog();

          // Handle cleanTemplate operation
          if (options.cleanTemplate) {
            logger.info('Cleaning build directory');
            const basePath = '../pwa-microservices-template';
            shellExec(`cd ${basePath} && git reset`);
            shellExec(`cd ${basePath} && git checkout .`);
            shellExec(`cd ${basePath} && git clean -f -d`);
            logger.info('Build directory cleaned successfully');
            return resolve(true);
          }

          // Handle defaultConf operation
          if (options.defaultConf) {
            Underpost.repo.updateDefaultConf(options);
            return resolve(true);
          }

          if (options.deployId) {
            let deployId = options.deployId;

            // Handle sync-start operation (before dd- prefix normalization to support 'dd' special case)
            if (options.syncStart) {
              shellExec(`node bin/deploy sync-start ${deployId}`);
              return resolve(true);
            }

            if (!deployId.startsWith('dd-')) deployId = `dd-${deployId}`;
            // Handle purge operation
            if (options.purge) {
              logger.info(`Purging deploy ID: ${deployId}`);

              const suffix = deployId.split('dd-')[1];
              const repoName = `engine-${suffix}`;
              const privateRepoName = `engine-${suffix}-private`;
              const cronRepoName = `engine-${suffix}-cron-backups`;
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
                { path: `../${cronRepoName}`, name: cronRepoName },
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
              shellExec(`node bin/build ${deployId} conf`);
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
              const cronRepoName = `engine-${suffix}-cron-backups`;
              const repos = [
                { path: `../${repoName}`, name: repoName },
                { path: `../${privateRepoName}`, name: privateRepoName },
                { path: `../${cronRepoName}`, name: cronRepoName },
              ];

              const username = process.env.GITHUB_USERNAME;
              const token = process.env.GITHUB_TOKEN;

              if (!username) {
                logger.error('GITHUB_USERNAME environment variable not set');
                return reject(false);
              }

              for (const repo of repos) {
                if (!fs.existsSync(repo.path)) {
                  fs.mkdirSync(repo.path, { recursive: true });
                  logger.info(`Created repository directory: ${repo.path}`);
                }

                const remoteUrl = `https://${token ? `${token}@` : ''}github.com/${username}/${repo.name}.git`;
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
            logger.info('build app', { destFolder });
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
            shellExec(`cd ${destFolder} && npm run build`);
            shellExec(`cd ${destFolder} && npm run dev`);
          }
          return resolve(true);
        } catch (error) {
          console.log(error);
          logger.error(error, error.stack);
          return reject(false);
        }
      });
    },

    /**
     * Builds client assets, single replicas, and/or syncs environment ports.
     * @param {string} [deployId='dd-default'] - The deployment ID.
     * @param {string} [subConf=''] - The sub-configuration for the build.
     * @param {string} [host=''] - Comma-separated hosts to filter the build.
     * @param {string} [path=''] - Comma-separated paths to filter the build.
     * @param {object} [options] - Build options.
     * @param {boolean} [options.syncEnvPort=false] - If true, syncs environment port assignments across all deploy IDs.
     * @param {boolean} [options.singleReplica=false] - If true, builds single replica folders instead of full client.
     * @param {boolean} [options.buildZip=false] - If true, creates zip files of the builds.
     * @param {boolean} [options.liteBuild=false] - If true, skips full build (default is full build).
     * @param {boolean} [options.iconsBuild=false] - If true, builds icons.
     * @returns {Promise<boolean>} A promise that resolves when the build is complete.
     * @memberof UnderpostRepository
     */
    client(
      deployId = 'dd-default',
      subConf = '',
      host = '',
      path = '',
      options = {
        syncEnvPort: false,
        singleReplica: false,
        buildZip: false,
        liteBuild: false,
        iconsBuild: false,
      },
    ) {
      return new Promise(async (resolve, reject) => {
        try {
          // Handle singleReplica operation (must run before syncEnvPort to ensure replica dirs exist)
          if (options.singleReplica) {
            const replicaPath = path;
            if (!deployId || !host || !replicaPath) {
              logger.error('client --single-replica requires deploy-id, host, and path arguments');
              return reject(false);
            }
            const serverConf = loadReplicas(
              deployId,
              loadConfServerJson(`./engine-private/conf/${deployId}/conf.server.json`),
            );

            if (serverConf[host][replicaPath].replicas) {
              {
                let replicaIndex = -1;
                for (const replica of serverConf[host][replicaPath].replicas) {
                  replicaIndex++;
                  const replicaDeployId = `${deployId}-${serverConf[host][replicaPath].replicas[replicaIndex].slice(1)}`;
                  await fs.copy(`./engine-private/conf/${deployId}`, `./engine-private/replica/${replicaDeployId}`);
                  fs.writeFileSync(
                    `./engine-private/replica/${replicaDeployId}/package.json`,
                    fs
                      .readFileSync(`./engine-private/replica/${replicaDeployId}/package.json`, 'utf8')
                      .replaceAll(`${deployId}`, `${replicaDeployId}`),
                    'utf8',
                  );
                  const replicaFolder = `./engine-private/replica/${replicaDeployId}`;
                  for (const envFile of ['.env.production', '.env.development', '.env.test']) {
                    const envFilePath = `${replicaFolder}/${envFile}`;
                    if (fs.existsSync(envFilePath)) {
                      fs.writeFileSync(
                        envFilePath,
                        fs
                          .readFileSync(envFilePath, 'utf8')
                          .replaceAll(`DEPLOY_ID=${deployId}`, `DEPLOY_ID=${replicaDeployId}`),
                        'utf8',
                      );
                    }
                  }
                }
              }
              {
                let replicaIndex = -1;
                for (const replica of serverConf[host][replicaPath].replicas) {
                  replicaIndex++;
                  const replicaDeployId = `${deployId}-${serverConf[host][replicaPath].replicas[replicaIndex].slice(1)}`;
                  let replicaServerConf = JSON.parse(
                    fs.readFileSync(`./engine-private/replica/${replicaDeployId}/conf.server.json`, 'utf8'),
                  );

                  const singleReplicaConf = replicaServerConf[host][replicaPath];
                  singleReplicaConf.replicas = undefined;
                  singleReplicaConf.singleReplica = undefined;

                  replicaServerConf = {};
                  replicaServerConf[host] = {};
                  replicaServerConf[host][replica] = singleReplicaConf;

                  fs.writeFileSync(
                    `./engine-private/replica/${replicaDeployId}/conf.server.json`,
                    JSON.stringify(replicaServerConf, null, 4),
                    'utf8',
                  );
                }
              }
            }
            if (!options.syncEnvPort) return resolve(true);
          }

          // Handle syncEnvPort operation
          if (options.syncEnvPort) {
            const dataDeploy = await getDataDeploy({ disableSyncEnvPort: true });
            const dataEnv = [
              { env: 'production', port: 3000 },
              { env: 'development', port: 4000 },
              { env: 'test', port: 5000 },
            ];
            let portOffset = 0;
            const singleReplicaPortOffsets = {};
            for (const deployIdObj of dataDeploy) {
              const { deployId } = deployIdObj;
              const baseConfPath = fs.existsSync(`./engine-private/replica/${deployId}`)
                ? `./engine-private/replica`
                : `./engine-private/conf`;

              const effectivePortOffset =
                singleReplicaPortOffsets[deployId] !== undefined ? singleReplicaPortOffsets[deployId] : portOffset;

              let skipDeploy = false;
              for (const envInstanceObj of dataEnv) {
                const envPath = `${baseConfPath}/${deployId}/.env.${envInstanceObj.env}`;
                if (!fs.existsSync(envPath)) {
                  logger.warn(`Skipping ${deployId}: ${envPath} not found`);
                  skipDeploy = true;
                  break;
                }
                const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
                envObj.PORT = `${envInstanceObj.port + effectivePortOffset}`;
                writeEnv(envPath, envObj);
              }

              if (skipDeploy) continue;
              if (singleReplicaPortOffsets[deployId] !== undefined) continue;

              const serverConf = loadReplicas(
                deployId,
                loadConfServerJson(`${baseConfPath}/${deployId}/conf.server.json`),
              );
              for (const host of Object.keys(serverConf)) {
                let deferredSingleReplicaSlots = [];
                for (const path of Object.keys(serverConf[host])) {
                  if (serverConf[host][path].singleReplica && serverConf[host][path].replicas) {
                    deferredSingleReplicaSlots.push({
                      replicas: serverConf[host][path].replicas,
                      peer: !!serverConf[host][path].peer,
                    });
                    continue;
                  }
                  portOffset++;
                  if (serverConf[host][path].peer) portOffset++;
                }
                for (const slot of deferredSingleReplicaSlots) {
                  for (const replica of slot.replicas) {
                    const replicaDeployId = buildReplicaId({ deployId, replica });
                    singleReplicaPortOffsets[replicaDeployId] = portOffset;
                    portOffset++;
                    if (slot.peer) portOffset++;
                  }
                }
              }
            }
            return resolve(true);
          }

          // Handle buildFullClient operation (default)
          {
            const { deployId: resolvedDeployId } = loadConf(deployId, subConf ?? '');

            let argHost = host ? host.split(',') : [];
            let argPath = path ? path.split(',') : [];
            let deployIdSingleReplicas = [];
            let singleReplicaHosts = [];
            const serverConf = resolvedDeployId
              ? readConfJson(resolvedDeployId, 'server', { loadReplicas: true })
              : Config.default.server;
            const confFilePath = resolvedDeployId ? getConfFilePath(resolvedDeployId, 'server') : null;
            const originalConfBackup = confFilePath ? fs.readFileSync(confFilePath, 'utf8') : null;
            for (const host of Object.keys(serverConf)) {
              for (const path of Object.keys(serverConf[host])) {
                if (argHost.length && argPath.length && (!argHost.includes(host) || !argPath.includes(path))) {
                  delete serverConf[host][path];
                } else {
                  if (serverConf[host][path].singleReplica && serverConf[host][path].replicas) {
                    singleReplicaHosts.push({ host, path });
                    deployIdSingleReplicas = deployIdSingleReplicas.concat(
                      serverConf[host][path].replicas.map((replica) =>
                        buildReplicaId({ deployId: resolvedDeployId, replica }),
                      ),
                    );
                  }
                }
              }
            }
            await buildClient({
              buildZip: options.buildZip || false,
              fullBuild: options.liteBuild ? false : true,
              iconsBuild: options.iconsBuild || false,
            });
            for (const replicaDeployId of deployIdSingleReplicas) await Underpost.repo.client(replicaDeployId);

            return resolve(true);
          }
        } catch (error) {
          console.log(error);
          logger.error(error, error.stack);
          return reject(false);
        }
      });
    },

    /**
     * Gets a list of deleted files from a Git repository.
     * @param {string} [path='.'] - The path to the repository.
     * @returns {string[]} An array of deleted file paths.
     * @memberof UnderpostRepository
     */
    getDeleteFiles(path = '.') {
      const commandUntrack = `cd ${path} && git ls-files --deleted`;
      const diffUntrackOutput = shellExec(commandUntrack, { stdout: true, silent: true });
      return diffUntrackOutput.toString().split('\n').filter(Boolean);
    },

    /**
     * Gets a list of changed (modified and untracked) files in a Git repository.
     * @param {string} [path='.'] - The path to the repository.
     * @param {string} [extension=''] - An optional file extension to filter by.
     * @param {boolean} [head=false] - If true, diffs against HEAD^.
     * @returns {string[]} An array of changed file paths.
     * @memberof UnderpostRepository
     */
    getChangedFiles(path = '.', extension = '', head = false) {
      const extensionFilter = extension ? `-- '***.${extension}'` : '';
      const command = `cd ${path} && git diff ${head ? 'HEAD^ HEAD ' : ''}--name-only ${extensionFilter}`;
      const commandUntrack = `cd ${path} && git ls-files --others --exclude-standard`;
      const diffOutput = shellExec(command, { stdout: true, silent: true });
      const diffUntrackOutput = shellExec(commandUntrack, { stdout: true, silent: true });
      const deleteFiles = Underpost.repo.getDeleteFiles(path);
      return diffOutput
        .toString()
        .split('\n')
        .filter(Boolean)
        .concat(diffUntrackOutput.toString().split('\n').filter(Boolean))
        .filter((f) => !deleteFiles.includes(f));
    },
    /**
     * Updates the private configuration repository for a given deployId.
     * @param {string} deployId - The deployment ID.
     * @returns {{validVersion: boolean, engineVersion: string, deployVersion: string}} An object indicating if the versions are valid.
     * @memberof UnderpostRepository
     */
    privateConfUpdate(deployId) {
      shellCd(`/home/dd/engine`);
      const privateRepoName = `engine-${deployId.split('dd-')[1]}-private`;
      const privateRepoPath = `../${privateRepoName}`;
      if (fs.existsSync(privateRepoPath)) fs.removeSync(privateRepoPath);
      shellExec(`cd .. && underpost clone ${process.env.GITHUB_USERNAME}/${privateRepoName}`);
      shellExec(`cd ${privateRepoPath} && underpost pull . ${process.env.GITHUB_USERNAME}/${privateRepoName}`, {
        silent: true,
      });
      shellExec(`underpost run secret`);
      shellExec(`underpost run underpost-config`);
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
      shellExec(`node bin/build ${deployId} conf`);
      return {
        validVersion: true,
        engineVersion: packageJsonEngine.version,
        deployVersion: packageJsonDeploy.version,
      };
    },

    /**
     * Retrieves the Git commit history.
     * @param {number} [sinceCommit=1] - The number of recent commits to retrieve.
     * @returns {Array<{hash: string, message: string, files: string}>} An array of commit objects with hash, message, and files.
     * @memberof UnderpostRepository
     */
    getHistory(sinceCommit = 1, repoPath = '.') {
      return shellExec(`cd ${repoPath} && git log -1 --pretty=format:"%h %s" -n ${sinceCommit}`, {
        stdout: true,
        silent: true,
        disableLog: true,
      })
        .split(`\n`)
        .map((line) => {
          const hash = line.split(' ')[0];
          return {
            hash,
            message: line.split(`${hash} `)[1],
          };
        })
        .filter((line) => line.hash)
        .map((line) => {
          line.files = shellExec(`cd ${repoPath} && git show --name-status --pretty="" ${line.hash}`, {
            stdout: true,
            silent: true,
            disableLog: true,
          });
          return line;
        });
    },
    /**
     * Updates the default configuration file based on the provided options.
     * @param {object} [options={ deployId: '' }] - The options for updating the configuration.
     * @param {string} [options.deployId=''] - The deployment ID to use for configuration.
     * @param {string} [options.confWorkflowId=''] - The configuration workflow ID to use.
     * @memberof UnderpostRepository
     */
    updateDefaultConf(options = { deployId: '', confWorkflowId: '' }) {
      const defaultServer = DefaultConf.server['default.net']['/'];
      let { deployId, confWorkflowId } = options;
      let defaultConf = false;

      // Custom workflow configurations
      if (confWorkflowId)
        switch (confWorkflowId) {
          case 'dd-github-pages': {
            const host = `${process.env.GITHUB_USERNAME ? process.env.GITHUB_USERNAME : 'underpostnet'}.github.io`;
            const path = '/pwa-microservices-template-ghpkg';
            DefaultConf.server = {
              [host]: { [path]: defaultServer },
            };
            DefaultConf.server[host][path].apiBaseProxyPath = '/';
            DefaultConf.server[host][path].apiBaseHost = 'www.nexodev.org';
            defaultConf = true;
            break;
          }
          case 'template': {
            const host = 'default.net';
            const path = '/';
            DefaultConf.server[host][path].valkey = {
              port: 6379,
              host: 'valkey-service.default.svc.cluster.local',
            };
            // mongodb-0.mongodb-service
            DefaultConf.server[host][path].db.host = 'mongodb://mongodb-service:27017';
            defaultConf = true;
            break;
          }
          default:
            logger.error(`Unknown confWorkflowId: ${confWorkflowId}.`);
            return;
        }
      else if (deployId && fs.existsSync(`./engine-private/conf/${deployId}`)) {
        DefaultConf.client = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.client.json`, 'utf8'));
        DefaultConf.server = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
        DefaultConf.ssr = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.ssr.json`, 'utf8'));
      } else
        logger.warn(
          `Deploy ID configuration not found: ./engine-private/conf/${deployId}, using default configuration.`,
        );

      // Serialize the configuration into the conf.*.js manifest file.
      // env: references from JSON configs are preserved as 'env:KEY' strings.
      // At runtime, resolveConfSecrets() in conf.js resolves them via process.env.
      const sepRender = '/**/';
      const confRawPaths = fs.readFileSync('./conf.js', 'utf8').split(sepRender);
      confRawPaths[1] = `${JSON.stringify(DefaultConf)};`;
      const targetConfPath = `./conf${defaultConf ? '' : `.${deployId}`}.js`;
      fs.writeFileSync(targetConfPath, confRawPaths.join(sepRender), 'utf8');
      shellExec(`prettier --write ${targetConfPath}`);
    },

    /**
     * Cleans the specified paths in the repository by resetting, checking out, and cleaning untracked files.
     * @param {object} [options={ paths: [''] }] - The options for cleaning.
     * @param {string[]} [options.paths=['']] - The paths to clean.
     * @memberof UnderpostRepository
     */
    clean(options = { paths: [''] }) {
      for (const path of options.paths) {
        shellExec(`cd ${path} && git reset`, { silent: true });
        shellExec(`cd ${path} && git checkout .`, { silent: true });
        shellExec(`cd ${path} && git clean -f -d`, { silent: true });
      }
    },

    /**
     * Copies files recursively from a Git repository URL directory path.
     * @param {object} options - Configuration options for copying files.
     * @param {string} options.gitUrl - The GitHub repository URL (e.g., 'https://github.com/canonical/packer-maas').
     * @param {string} options.directoryPath - The directory path within the repository to copy (e.g., 'rocky-9').
     * @param {string} options.targetPath - The local target path where files should be copied.
     * @param {string} [options.branch='main'] - The git branch to use (default: 'main').
     * @param {boolean} [options.overwrite=false] - Whether to overwrite existing target directory.
     * @returns {Promise<object>} A promise that resolves with copied files information.
     * @memberof UnderpostRepository
     */
    async copyGitUrlDirectoryRecursive(options) {
      const { gitUrl, directoryPath, targetPath, branch = 'main', overwrite = false } = options;

      // Validate inputs
      if (!gitUrl) {
        throw new Error('gitUrl is required');
      }
      if (!directoryPath) {
        throw new Error('directoryPath is required');
      }
      if (!targetPath) {
        throw new Error('targetPath is required');
      }

      // Parse GitHub URL to extract owner and repo
      const urlMatch = gitUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!urlMatch) {
        throw new Error(`Invalid GitHub URL: ${gitUrl}`);
      }
      const [, owner, repo] = urlMatch;

      logger.info(`Copying from ${owner}/${repo}/${directoryPath} to ${targetPath}`);

      // Check if target directory exists
      if (fs.existsSync(targetPath) && !overwrite) {
        throw new Error(`Target directory already exists: ${targetPath}. Use overwrite option to replace.`);
      }

      // Create target directory
      fs.mkdirSync(targetPath, { recursive: true });

      // GitHub API base URL
      const githubApiBase = 'https://api.github.com/repos';
      const apiUrl = `${githubApiBase}/${owner}/${repo}/contents/${directoryPath}`;

      logger.info(`Fetching directory contents from: ${apiUrl}`);

      try {
        // Fetch directory contents recursively
        const copiedFiles = await this._fetchAndCopyGitHubDirectory({
          apiUrl,
          targetPath,
          basePath: directoryPath,
          branch,
        });

        logger.info(`Successfully copied ${copiedFiles.length} files to ${targetPath}`);

        return {
          success: true,
          filesCount: copiedFiles.length,
          files: copiedFiles,
          targetPath,
        };
      } catch (error) {
        // Clean up on error
        if (fs.existsSync(targetPath)) {
          fs.removeSync(targetPath);
          logger.warn(`Cleaned up target directory after error: ${targetPath}`);
        }
        throw new Error(`Failed to copy directory: ${error.message}`);
      }
    },

    /**
     * Internal method to recursively fetch and copy files from GitHub API.
     * @method
     * @param {object} options - Fetch options.
     * @param {string} options.apiUrl - The GitHub API URL.
     * @param {string} options.targetPath - The local target path.
     * @param {string} options.basePath - The base path in the repository.
     * @param {string} options.branch - The git branch.
     * @returns {Promise<array>} Array of copied file paths.
     * @memberof UnderpostRepository
     */
    async _fetchAndCopyGitHubDirectory(options) {
      const { apiUrl, targetPath, basePath, branch } = options;
      const copiedFiles = [];

      const response = await fetch(apiUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'underpost-cli',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(`GitHub API request failed for: ${apiUrl}`);
        logger.error(`Status: ${response.status} ${response.statusText}`);
        logger.error(`Response: ${errorBody}`);
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const contents = await response.json();

      if (!Array.isArray(contents)) {
        logger.error(`Expected directory but got: ${typeof contents}`);
        logger.error(`API URL: ${apiUrl}`);
        logger.error(`Response keys: ${Object.keys(contents).join(', ')}`);
        if (contents.message) {
          logger.error(`GitHub message: ${contents.message}`);
        }
        throw new Error(
          `Path is not a directory: ${basePath}. Response: ${JSON.stringify(contents).substring(0, 200)}`,
        );
      }

      logger.info(`Found ${contents.length} items in directory: ${basePath}`);

      // Process each item in the directory
      for (const item of contents) {
        const itemTargetPath = `${targetPath}/${item.name}`;

        if (item.type === 'file') {
          logger.info(`Downloading file: ${item.path}`);

          // Download file content
          const fileResponse = await fetch(item.download_url);
          if (!fileResponse.ok) {
            logger.error(`Failed to download: ${item.download_url}`);
            throw new Error(`Failed to download file: ${item.path} (${fileResponse.status})`);
          }

          const fileContent = await fileResponse.text();
          fs.writeFileSync(itemTargetPath, fileContent);

          logger.info(`✓ Saved: ${itemTargetPath}`);
          copiedFiles.push(itemTargetPath);
        } else if (item.type === 'dir') {
          logger.info(`📁 Processing directory: ${item.path}`);

          // Create subdirectory
          fs.mkdirSync(itemTargetPath, { recursive: true });

          // Recursively process subdirectory
          const subFiles = await this._fetchAndCopyGitHubDirectory({
            apiUrl: item.url,
            targetPath: itemTargetPath,
            basePath: item.path,
            branch,
          });

          copiedFiles.push(...subFiles);
          logger.info(`✓ Completed directory: ${item.path} (${subFiles.length} files)`);
        } else {
          logger.warn(`Skipping unknown item type '${item.type}': ${item.path}`);
        }
      }

      return copiedFiles;
    },

    /**
     * Dispatches a GitHub Actions workflow using gh CLI or curl fallback.
     * @param {object} options - Dispatch options.
     * @param {string} options.repo - The GitHub repository (e.g., "owner/repo").
     * @param {string} options.workflowFile - The workflow file name (e.g., "engine-core.cd.yml").
     * @param {string} [options.ref='master'] - The git ref to dispatch against.
     * @param {object} [options.inputs={}] - Key-value inputs for the workflow_dispatch event.
     * @memberof UnderpostRepository
     */
    dispatchWorkflow(options = { repo: '', workflowFile: '', ref: 'master', inputs: {} }) {
      const { repo, workflowFile, ref, inputs } = options;
      const ghAvailable = shellExec('command -v gh 2>/dev/null', {
        stdout: true,
        silent: true,
        disableLog: true,
      }).trim();

      if (ghAvailable) {
        let cmd = `gh workflow run ${workflowFile} --repo ${repo} --ref ${ref}`;
        for (const [key, value] of Object.entries(inputs)) {
          if (value !== undefined && value !== '') {
            const escaped = String(value).replace(/'/g, "'\\''");
            cmd += ` -f ${key}='${escaped}'`;
          }
        }
        shellExec(cmd);
      } else {
        let token = process.env.GITHUB_TOKEN;
        if (!token) {
          const envPath = `${getNpmRootPath()}/underpost/.env`;
          if (fs.existsSync(envPath) && fs.statSync(envPath).isFile()) {
            const envVars = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
            token = envVars.GITHUB_TOKEN;
          }
        }
        if (!token) {
          logger.error('GITHUB_TOKEN is required for workflow dispatch (gh CLI not available)');
          return;
        }
        const payload = { ref };
        if (Object.keys(inputs).length > 0) payload.inputs = inputs;
        const payloadJson = JSON.stringify(payload).replace(/'/g, "'\\''");
        shellExec(
          `curl -s -f -X POST ` +
            `-H "Accept: application/vnd.github.v3+json" ` +
            `-H "Authorization: token ${token}" ` +
            `"https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches" ` +
            `-d '${payloadJson}'`,
        );
      }
      logger.info('Dispatched workflow', `${repo} -> ${workflowFile}`, inputs.job ? `(job: ${inputs.job})` : '');
    },

    /**
     * Returns metadata about unpushed commits in a git repository.
     * Fetches from origin, then counts commits ahead of the remote branch.
     * @param {string} [repoPath='.'] - Path to the git repository.
     * @param {number} [fallback=1] - Value to return as `count` when no unpushed commits are detected.
     * @returns {{ count: number, branch: string, hasUnpushed: boolean }} Unpush metadata.
     * @memberof UnderpostRepository
     */
    /**
     * Checks whether a remote Git repository URL is reachable.
     * Uses `git ls-remote` with `|| true` so the process always exits 0.
     * Injects `GITHUB_TOKEN` into GitHub HTTPS URLs when available.
     * @param {string} url - Full HTTPS clone URL to test (e.g. "https://github.com/org/repo.git").
     * @returns {boolean} `true` when the remote responded with at least one ref hash.
     * @memberof UnderpostRepository
     */
    isRemoteRepo(url) {
      if (!url) return false;
      // Normalize short form "owner/repo" → full GitHub HTTPS URL
      let normalized = url;
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('git@')) {
        normalized = `https://github.com/${url}`;
      }
      let authUrl = normalized;
      if (process.env.GITHUB_TOKEN && normalized.startsWith('https://github.com/')) {
        authUrl = normalized.replace('https://github.com/', `https://${process.env.GITHUB_TOKEN}@github.com/`);
      }
      // GIT_TERMINAL_PROMPT=0 prevents git from hanging on credential prompts inside containers.
      const raw = shellExec(`GIT_TERMINAL_PROMPT=0 git ls-remote "${authUrl}" HEAD 2>&1 || true`, {
        stdout: true,
        silent: true,
        disableLog: true,
      });
      logger.info('isRemoteRepo', { url: normalized, raw: (raw || '').slice(0, 120) });
      return typeof raw === 'string' && /^[0-9a-f]{40}\t/m.test(raw);
    },

    getUnpushedCount(repoPath = '.', fallback = 1) {
      const branch = shellExec(`cd ${repoPath} && git branch --show-current`, {
        stdout: true,
        silent: true,
        disableLog: true,
      }).trim();
      shellExec(`cd ${repoPath} && git fetch origin 2>/dev/null`, { silent: true, disableLog: true });
      const raw = shellExec(`cd ${repoPath} && git rev-list --count origin/${branch}..HEAD 2>/dev/null`, {
        stdout: true,
        silent: true,
        disableLog: true,
      }).trim();
      const count = parseInt(raw);
      const hasUnpushed = !isNaN(count) && count > 0;
      return { count: hasUnpushed ? count : fallback, branch, hasUnpushed };
    },

    /**
     * Sanitizes a markdown changelog string into a compact message format.
     * Strips date headers, converts section tags to `[tag]` prefixes, removes bullet markers and special characters.
     * @param {string} message - The raw markdown changelog output.
     * @returns {string} The sanitized single-line or multi-line compact message.
     * @memberof UnderpostRepository
     */
    sanitizeChangelogMessage(message) {
      if (!message) return '';
      return message
        .replace(/^##\s+\d{4}-\d{2}-\d{2}\s*/gm, '')
        .replace(/^###\s+(\S+)\s*/gm, '[$1] ')
        .replace(/^- /gm, '')
        .replaceAll('"', '')
        .replaceAll('`', '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n')
        .trim()
        .replaceAll('] - ', '] ');
    },

    /**
     * Manages a cron-backup Git repository: clone, pull, commit, or push.
     * Resolves the repository path as `../<repoName>` relative to the CWD.
     * Requires the `GITHUB_USERNAME` environment variable to be set.
     * @param {object} params
     * @param {string} params.repoName - Repository name (e.g. `engine-cyberia-cron-backups`).
     * @param {'clone'|'pull'|'commit'|'push'} params.operation - Git operation to perform.
     * @param {string} [params.message=''] - Commit message (used by the `commit` operation).
     * @param {boolean} [params.forceClone=false] - Remove existing clone before re-cloning.
     * @returns {boolean} `true` on success, `false` if GITHUB_USERNAME is unset or on error.
     * @memberof UnderpostRepository
     */
    /**
     * Initializes a git repository at the given path and configures user identity
     * from environment variables (`GITHUB_USERNAME` / `GITHUB_EMAIL`).
     * Safe to call on an already-initialized repo — only runs `git init` when
     * `.git` is absent and always ensures user.name / user.email are set.
     * @param {object} opts
     * @param {string} opts.path       - Absolute or relative path to the repository.
     * @param {string} [opts.origin]   - If provided, sets or updates git remote `origin`.
     * @memberof UnderpostRepository
     */
    initLocalRepo({ path: repoPath, origin }) {
      const gitUsername = process.env.GITHUB_USERNAME || 'underpostnet';
      const gitEmail = process.env.GITHUB_EMAIL || `development@underpost.net`;

      if (!fs.existsSync(`${repoPath}/.git`)) {
        shellExec(`cd "${repoPath}" && git init`);
      }
      shellExec(`cd "${repoPath}" && git config user.name '${gitUsername}'`);
      shellExec(`cd "${repoPath}" && git config user.email '${gitEmail}'`);

      if (origin) {
        const currentRemote = shellExec(`cd "${repoPath}" && git remote get-url origin 2>/dev/null || true`, {
          stdout: true,
          silent: true,
        }).trim();
        if (!currentRemote) {
          shellExec(`cd "${repoPath}" && git remote add origin "${origin}"`);
        } else if (currentRemote !== origin) {
          shellExec(`cd "${repoPath}" && git remote set-url origin "${origin}"`);
        }
      }
    },

    manageBackupRepo({ repoName, operation, message = '', forceClone = false }) {
      try {
        const username = process.env.GITHUB_USERNAME;
        if (!username) {
          logger.error('GITHUB_USERNAME environment variable not set');
          return false;
        }

        const repoPath = `../${repoName}`;

        switch (operation) {
          case 'clone':
            if (forceClone && fs.existsSync(repoPath)) {
              logger.info(`Force clone: removing existing repository: ${repoName}`);
              fs.removeSync(repoPath);
            }
            if (!fs.existsSync(repoPath)) {
              shellExec(`cd .. && underpost clone ${username}/${repoName}`);
              logger.info(`Cloned repository: ${repoName}`);
            }
            break;

          case 'pull':
            if (fs.existsSync(repoPath)) {
              shellExec(`cd ${repoPath} && git checkout . && git clean -f -d`);
              shellExec(`cd ${repoPath} && underpost pull . ${username}/${repoName}`, { silent: true });
              logger.info(`Pulled repository: ${repoName}`);
            }
            break;

          case 'commit':
            if (fs.existsSync(repoPath)) {
              shellExec(`cd ${repoPath} && git add .`);
              shellExec(`underpost cmt ${repoPath} backup '' '${message}'`);
              logger.info(`Committed to repository: ${repoName}`, { message });
            }
            break;

          case 'push':
            if (fs.existsSync(repoPath)) {
              shellExec(`cd ${repoPath} && underpost push . ${username}/${repoName}`, { silent: true });
              logger.info(`Pushed repository: ${repoName}`);
            }
            break;

          default:
            logger.warn(`Unknown git operation: ${operation}`);
            return false;
        }

        return true;
      } catch (error) {
        logger.error(`Git operation failed`, { repoName, operation, error: error.message });
        return false;
      }
    },
  };
}

export default UnderpostRepository;
