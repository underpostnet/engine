/**
 * Repository module for managing Git operations and configurations.
 * @module src/cli/repository.js
 * @namespace UnderpostRepository
 */

import { commitData } from '../client/components/core/CommonJs.js';
import dotenv from 'dotenv';
import { pbcopy, shellCd, shellExec } from '../server/process.js';
import { actionInitLog, loggerFactory } from '../server/logger.js';
import fs from 'fs-extra';
import { getNpmRootPath } from '../server/conf.js';
import { Config } from '../server/conf.js';
import { DefaultConf } from '../../conf.js';

dotenv.config();

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
    clone(gitUri = `${process.env.GITHUB_USERNAME}/pwa-microservices-template`, options = { bare: false, G8: false }) {
      const gExtension = options.G8 === true ? '.g8' : '.git';
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
     * @param {object} [options={ G8: false }] - Pulling options.
     * @param {boolean} [options.g8=false] - If true, uses the .g8 extension.
     * @memberof UnderpostRepository
     */
    pull(
      repoPath = './',
      gitUri = `${process.env.GITHUB_USERNAME}/pwa-microservices-template`,
      options = { G8: false },
    ) {
      const gExtension = options.G8 === true ? '.g8' : '.git';
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
     * @param {string} [options.msg=''] - If provided, outputs this message instead of committing.
     * @param {string} [options.deployId=''] - An optional deploy ID to include in the commit message.
     * @param {string} [options.hashes=''] - If provided with diff option, shows the diff between two hashes.
     * @param {string} [options.extension=''] - If provided with diff option, filters the diff by this file extension.
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
        msg: '',
        deployId: '',
        hashes: '',
        extension: '',
      },
    ) {
      if (!repoPath) repoPath = '.';
      if (options.diff && options.hashes) {
        const hashes = options.hashes.split(',');
        const cmd = `git --no-pager diff ${hashes[0]} ${hashes[1] ? hashes[1] : 'HEAD'}${options.extension ? ` -- '*.${options.extension}'` : ''}`;
        if (options.copy) {
          pbcopy(cmd);
        } else console.log(cmd);
        return;
      }
      if (options.msg) {
        options.msg = options.msg.replaceAll('"', '').replaceAll(`'`, '').replaceAll('`', '');
        let key = Object.keys(commitData).find((k) => k && options.msg.toLocaleLowerCase().slice(0, 16).match(k));
        if (!key) key = Object.keys(commitData).find((k) => k && options.msg.toLocaleLowerCase().match(k));
        if (!key || key === undefined) key = 'chore';
        shellExec(
          `underpost cmt ${repoPath} ${key} ${options.deployId ? options.deployId : `''`} '${options.msg.replaceAll(`${key}(${key}`, '')}'`,
        );
        return;
      }
      if (options.lastMsg) {
        if (options.copy) {
          pbcopy(UnderpostRepository.API.getLastCommitMsg(options.lastMsg - 1));
        } else console.log(UnderpostRepository.API.getLastCommitMsg(options.lastMsg - 1));
        return;
      }
      if (options.diff) {
        const _diffCmd = `git ${diffCmd.replace('show', `diff${options.cached ? ` --cached` : ''}`)}`;
        if (options.copy) pbcopy(_diffCmd);
        else console.log('Diff command:', _diffCmd);
        return;
      }
      if (options.log) {
        const history = UnderpostRepository.API.getHistory(options.log);
        const chainCmd = history
          .reverse()
          .map((commitData, i) => `${i === 0 ? '' : ' && '}git ${diffCmd} ${commitData.hash}`)
          .join('');
        if (history[0]) {
          for (const commit of history) {
            console.log(
              shellExec(`git show -s --format=%ci ${commit.hash}`, {
                stdout: true,
                silent: true,
                disableLog: true,
              }).trim().green,
            );
            console.log(commit.hash.yellow, commit.message);
            console.log(
              shellExec(`git show --name-status --pretty="" ${commit.hash}`, {
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
        if (options.copy) pbcopy(UnderpostRepository.API.getLastCommitMsg());
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
      return shellExec(`git --no-pager log -1 --skip=${skip} --pretty=%B`, { stdout: true });
    },

    /**
     * Pushes commits to a remote GitHub repository.
     * @param {string} [repoPath='./'] - The local path to the repository.
     * @param {string} [gitUri=`${process.env.GITHUB_USERNAME}/pwa-microservices-template`] - The URI of the GitHub repository.
     * @param {object} [options={ f: false, G8: false }] - Push options.
     * @param {boolean} [options.f=false] - If true, forces the push.
     * @param {boolean} [options.g8=false] - If true, uses the .g8 extension.
     * @memberof UnderpostRepository
     */
    push(
      repoPath = './',
      gitUri = `${process.env.GITHUB_USERNAME}/pwa-microservices-template`,
      options = { f: false, G8: false },
    ) {
      const gExtension = options.G8 === true ? '.g8' : '.git';
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
            UnderpostRepository.API.updateDefaultConf(options);
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

                // Initialize git repository
                shellExec(`cd ${repo.path} && git init`, { disableLog: false });
                logger.info(`Initialized git repository in: ${repo.path}`);

                // Add remote origin
                const remoteUrl = `https://${token ? `${token}@` : ''}github.com/${username}/${repo.name}.git`;
                shellExec(`cd ${repo.path} && git remote add origin ${remoteUrl}`, { disableLog: false });
                logger.info(`Added remote origin for: ${repo.name}`);
              }
            }
            return resolve(true);
          }
          if (projectName) {
            const npmRoot = getNpmRootPath();
            const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
            const destFolder = `./${projectName}`;
            logger.info('Note: This process may take several minutes to complete');
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
              shellExec(`cd ${destFolder} && git init && git add . && git commit -m "Base template implementation"`);
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
      const deleteFiles = UnderpostRepository.API.getDeleteFiles(path);
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
    getHistory(sinceCommit = 1) {
      return shellExec(`git log -1 --pretty=format:"%h %s" -n ${sinceCommit}`, {
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
          line.files = shellExec(`git show --name-status --pretty="" ${line.hash}`, {
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
        // DefaultConf.cron = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.cron.json`, 'utf8'));

        for (const host of Object.keys(DefaultConf.server)) {
          for (const path of Object.keys(DefaultConf.server[host])) {
            DefaultConf.server[host][path].db = defaultServer.db;
            DefaultConf.server[host][path].mailer = defaultServer.mailer;

            delete DefaultConf.server[host][path]._wp_client;
            delete DefaultConf.server[host][path]._wp_git;
            delete DefaultConf.server[host][path]._wp_directory;
            delete DefaultConf.server[host][path].wp;
            delete DefaultConf.server[host][path].git;
            delete DefaultConf.server[host][path].directory;
          }
        }
      } else
        logger.warn(
          `Deploy ID configuration not found: ./engine-private/conf/${deployId}, using default configuration.`,
        );
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
  };
}

export default UnderpostRepository;
