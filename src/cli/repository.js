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
import UnderpostStartUp from '../server/start.js';
import { Config } from '../server/conf.js';

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
     * @param {object} [options={ bare: false, g8: false }] - Cloning options.
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
     * @param {string} [options.msg=''] - If provided, outputs this message instead of committing.
     * @param {string} [options.deployId=''] - An optional deploy ID to include in the commit message.
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
      },
    ) {
      if (!repoPath) repoPath = '.';
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
            console.log(commit.hash.yellow, commit.message);
            console.log(
              shellExec(`git show --name-status --pretty="" ${commit.hash}`, {
                stdout: true,
                silent: true,
                disableLog: true,
              }).red,
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
      const _message = `${commitType}${subModule ? `(${subModule})` : ''}${process.argv.includes('!') ? '!' : ''}: ${
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
      const gExtension = options.g8 === true || options.G8 === true ? '.g8' : '.git';
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
     * @param {object} [options={ deployId: '', subConf: '', cluster: false, dev: false }] - Initialization options.
     * @param {string} [options.deployId=''] - The deployment ID to set up.
     * @param {string} [options.subConf=''] - The sub-configuration to create.
     * @param {boolean} [options.cluster=false] - If true, sets up a clustered configuration.
     * @param {boolean} [options.dev=false] - If true, uses development settings.
     * @returns {Promise<void>} A promise that resolves when the initialization is complete.
     * @memberof UnderpostRepository
     */
    new(projectName, options = { deployId: '', subConf: '', cluster: false, dev: false }) {
      return new Promise(async (resolve, reject) => {
        try {
          await logger.setUpInfo();
          actionInitLog();
          if (options.deployId) {
            Config.deployIdFactory(options.deployId, options);
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
      shellExec(`cd ${privateRepoPath} && underpost pull . ${process.env.GITHUB_USERNAME}/${privateRepoName}`);
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
  };
}

export default UnderpostRepository;
