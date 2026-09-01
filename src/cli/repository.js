/**
 * Repository module for managing Git operations and configurations.
 * @module src/cli/repository.js
 * @namespace UnderpostRepository
 */

import dotenv from 'dotenv';
import { commitData } from '../client/components/core/CommonJs.js';
import { pbcopy, shellArgumentFactory, shellCd, shellExec } from '../server/runtime/process.js';
import { actionInitLog, loggerFactory, redactSensitiveText } from '../server/ops/logger.js';
import path from 'path';
import fs from 'fs-extra';
import { Config, readConfJson, readConfInstances } from '../server/runtime/conf.js';
import { readDeployRoutes, registerDeployRoute } from '../server/network/router.js';
import { getUnderpostRootPath } from '../server/runtime/environment.js';
import { githubCommitUrlFactory, repositoryIdentityFactory } from '../server/storage/repository.js';
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
      const auth = Underpost.repo.gitAuthFactory(`https://github.com/${gitUri}${gExtension}`);
      // A bare clone lands in `<repo>.git`: clearing `<repo>` instead would both leave the
      // real target in place and delete an unrelated work tree that happens to share the name.
      const clonePath = `./${repoName}${options?.bare === true ? gExtension : ''}`;
      if (fs.existsSync(clonePath)) fs.removeSync(clonePath);
      shellExec(`git clone ${options?.bare === true ? ` --bare ` : ''}"${auth.url}"`, {
        disableLog: true,
        env: auth.env,
      });
    },
    /**
     * Pulls updates from a GitHub repository.
     *
     * `--ff-only` because the reconcile strategy must not come from the host: without it git
     * refuses a divergent pull outright on a node that configured neither `pull.rebase` nor
     * `pull.ff`, and silently merges or rebases on one that did — the same command producing a
     * different history per machine. Advancing to the remote is what every caller wants; a
     * checkout that has drifted onto commits of its own is replaced through
     * {@link UnderpostRepository.switchRemote}, not reconciled here.
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
      const auth = Underpost.repo.gitAuthFactory(`https://github.com/${gitUri}${gExtension}`);
      shellExec(`cd ${repoPath} && git pull --ff-only "${auth.url}"`, {
        disableLog: true,
        env: auth.env,
      });
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
     * @param {boolean} [options.changelogBuild=false] - If true, scrapes git history and builds a CHANGELOG.md from the five latest versions. Commits containing 'New release v:' are used as version section titles. Only commits starting with '[<tag>]' are included as entries.
     * @param {string} [options.changelogMinVersion=''] - If set, overrides the default minimum version limit (2.85.0) for --changelog-build.
     * @param {boolean} [options.changelogNoHash=false] - If true, omits commit hashes from the changelog entries.
     * @param {boolean} [options.remoteUrl=false] - If true, prints the current git remote URL (origin) in plain text and returns.
     * @param {string} [options.switchRepo=''] - If set, switches the remote `origin` to this URL and force-pulls the target branch, overwriting the current working tree.
     * @param {string} [options.targetBranch=''] - Target branch for `switchRepo` (defaults to the remote's default branch).
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
        hasChanges: false,
        remoteUrl: false,
        switchRepo: '',
        targetBranch: '',
      },
    ) {
      if (!repoPath) repoPath = '.';

      if (options.initRepo) {
        Underpost.repo.initLocalRepo({
          path: repoPath,
          origin: typeof options.initRepo === 'string' ? options.initRepo : undefined,
        });
        return;
      }

      if (options.hasChanges) {
        const status = shellExec(`cd ${repoPath} && git status --porcelain`, {
          stdout: true,
          silent: true,
          disableLog: true,
        }).trim();
        process.stdout.write(status ? '1' : '');
        return;
      }

      if (options.isRemoteRepo) {
        const accessible = Underpost.repo.isRemoteRepo(options.isRemoteRepo);
        console.log(accessible);
        return;
      }

      if (options.remoteUrl) {
        const url = Underpost.repo.getRemoteUrl({ path: repoPath });
        if (options.copy) pbcopy(url);
        else console.log(url);
        return;
      }

      if (options.switchRepo) {
        Underpost.repo.switchRemote({
          path: repoPath,
          url: options.switchRepo,
          branch: options.targetBranch,
        });
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

      if (options.propagateMsg) {
        // Chain hop: carry the payload the previous workflow sent instead of regenerating it, so
        // every repository downstream of the dispatch commits the same entries.
        const propagated = Underpost.repo.resolvePropagationMessage(process.env.PROPAGATED_MESSAGE);
        if (propagated) {
          console.log(propagated);
          return;
        }
        // Nothing arrived — fall through to this repository's own changelog for the last N commits.
        options.changelogMsg = true;
        options.changelogNoHash = true;
      }

      if (options.changelog !== undefined || options.changelogBuild || options.changelogMsg !== undefined) {
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
            silentOnError: true,
          }).toString();
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

        const commitUrl = (shortHash, hash) => githubCommitUrlFactory({ shortHash, hash });

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
          // --changelog-build: retain the current changes and the five latest version sections.
          const allCommits = fetchHistory();
          const sections = buildVersionSections(allCommits);

          // Stop at either the fifth release section or the configured minimum-version boundary.
          const limitedSections = [];
          let versionCount = 0;
          for (const section of sections) {
            limitedSections.push(section);
            if (section.title) {
              versionCount++;
              const versionStr = section.title.replace(releaseMatch, '').trim();
              if (versionCount === 5 || versionStr === changelogMinVersion) break;
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
          // --changelog / --changelog-msg: message from the last N commits, where N is --from-n-commit
          // (default 1, last commit only). No auto-detection.
          const n = parseInt(options.fromNCommit) > 0 ? parseInt(options.fromNCommit) : 1;
          const sections = buildVersionSections(fetchHistory(n));
          const changelog = renderSections(sections);
          if (options.changelogMsg !== undefined) {
            // Sanitized, commit-ready message; empty string when there are no tagged entries so
            // callers fall back to their own generic default instead of a placeholder.
            console.log(Underpost.repo.sanitizeChangelogMessage(changelog));
          } else {
            console.log(changelog || `No changelog entries found.\n`);
          }
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
        `cd ${repoPath} && git commit ${options?.empty ? `--allow-empty ` : ''}${
          // A propagated payload is multi-line and may hold `$`: quoting keeps every entry intact.
          options.edit ? `--amend  --no-edit ` : `-m ${shellArgumentFactory(_message)}`
        }`,
      );
    },

    /**
     * Retrieves the message of the last Git commit.
     * @param {number} [skip=0] - Number of commits to skip from HEAD (0 = most recent).
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
      const auth = Underpost.repo.gitAuthFactory(`https://github.com/${gitUri}${gExtension}`);
      shellExec(`cd ${repoPath} && git push "${auth.url}"${options?.f === true ? ' --force' : ''}`, {
        disableLog: true,
        env: auth.env,
      });
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
     * Initializes the base cluster deploy folder `engine-private/deploy` from `./conf.js` (DefaultConf).
     *
     * Writes the minimum set required by the cluster runtime:
     * `conf.event.json`, `conf.users.json`, `conf.wireguard.json`, `dd.cron`, `dd.routes`, `id_rsa`, `id_rsa.pub`.
     *
     * When a deploy ID is explicitly provided, it also generates the deploy CI/CD workflows and its default conf.
     *
     * Idempotent: existing files are never overwritten, so it is safe to rerun over a provisioned cluster.
     * @param {string} [deployId=''] - Deploy ID registered in the route table and used as default cron deploy ID (defaults to `dd-default`, `dd-` prefix is normalized).
     * @returns {{ deployPath: string, created: string[] }} The deploy folder and the files created by this run.
     * @memberof UnderpostRepository
     */
    clusterDeployFactory(deployId = '') {
      const deployPath = './engine-private/deploy';
      const created = [];

      const hasDeployId = `${deployId || ''}`.trim().length > 0;
      deployId = `${deployId || ''}`.trim() || 'dd-default';
      if (!deployId.startsWith('dd-')) deployId = `dd-${deployId}`;

      fs.mkdirSync(deployPath, { recursive: true });

      const confFiles = {
        'conf.event.json': DefaultConf.event,
        'conf.users.json': DefaultConf.users,
        'conf.wireguard.json': DefaultConf.wireguard,
      };

      for (const [fileName, conf] of Object.entries(confFiles)) {
        const confPath = `${deployPath}/${fileName}`;
        if (fs.existsSync(confPath)) continue;
        fs.writeFileSync(confPath, JSON.stringify(conf, null, 4), 'utf8');
        created.push(confPath);
      }

      const cronPath = `${deployPath}/dd.cron`;
      if (!fs.existsSync(cronPath)) {
        fs.writeFileSync(cronPath, deployId, 'utf8');
        created.push(cronPath);
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
        const repoName = `engine-${deployId.split('dd-')[1]}`;
        fs.writeFileSync(
          `./.github/workflows/${repoName}.cd.yml`,
          fs
            .readFileSync(`./.github/workflows/engine-test.cd.yml`, 'utf8')
            .replaceAll('test', deployId.split('dd-')[1]),
          'utf8',
        );
        fs.writeFileSync(
          `./.github/workflows/${repoName}.ci.yml`,
          fs
            .readFileSync(`./.github/workflows/engine-test.ci.yml`, 'utf8')
            .replaceAll('test', deployId.split('dd-')[1]),
          'utf8',
        );
        shellExec(`node bin new --default-conf --deploy-id ${deployId}`);
      }

      logger.info('Cluster deploy base', { deployPath, created });

      return { deployPath, created };
    },

    /**
     * Initializes a new Underpost repository, optionally setting up a deploy ID or sub-configuration.
     * @param {string} [projectName=''] - The name of the project to create.
     * @param {object} [options] - Initialization options.
     * @param {string} [options.deployId=''] - The deployment ID to set up.
     * @param {string} [options.subConf=''] - The sub-configuration to create.
     * @param {boolean} [options.cluster=false] - If true, initializes only the base cluster deploy folder (`engine-private/deploy`) from `./conf.js` and returns; no project or deploy ID scaffolding runs.
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

          // Handle cluster deploy base operation (standalone: never scaffolds a project)
          if (options.cluster === true) {
            UnderpostRepository.API.clusterDeployFactory(options.deployId || projectName);
            return resolve(true);
          }

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
              const cronRepoName = `engine-${suffix}-cron-backups`;
              const repos = [
                { path: `../${repoName}`, name: repoName },
                { path: `../${privateRepoName}`, name: privateRepoName },
                { path: `../${cronRepoName}`, name: cronRepoName },
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
      const privateRepoName = Underpost.repo.privateRepoFactory(deployId);
      const privateRepoPath = `../${privateRepoName}`;
      if (fs.existsSync(privateRepoPath)) fs.removeSync(privateRepoPath);
      shellExec(`cd .. && underpost clone ${process.env.GITHUB_USERNAME}/${privateRepoName}`);
      shellExec(`cd ${privateRepoPath} && underpost pull . ${process.env.GITHUB_USERNAME}/${privateRepoName}`, {
        silent: true,
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
     * Retrieves the Git commit history.
     * @param {number} [sinceCommit=1] - The number of recent commits to retrieve.
     * @param {string} [repoPath='.'] - The path to the repository.
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
              port: 'env:VALKEY_PORT:int:6379',
              host: 'env:VALKEY_HOST:127.0.0.1',
            };
            DefaultConf.server[host][path].db.host = 'env:DB_HOST:mongodb://127.0.0.1:27017';
            DefaultConf.server[host][path].db.replicaSet = 'env:DB_REPLICA_SET:rs0';
            DefaultConf.server[host][path].db.authSource = 'env:DB_AUTH_SOURCE:admin';
            DefaultConf.server[host][path].db.user = 'env:DB_USER:';
            DefaultConf.server[host][path].db.password = 'env:DB_PASSWORD:';
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
        shellExec(`cd ${path} && git reset`, { silentOnError: true, silent: true, disableLog: true });
        shellExec(`cd ${path} && git checkout .`, { silentOnError: true, silent: true, disableLog: true });
        shellExec(`cd ${path} && git clean -f -d`, { silentOnError: true, silent: true, disableLog: true });
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
        const copiedFiles = await this.fetchAndCopyGitHubDirectory({
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
    async fetchAndCopyGitHubDirectory(options) {
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

      for (const item of contents) {
        const itemTargetPath = `${targetPath}/${item.name}`;

        if (item.type === 'file') {
          logger.info(`Downloading file: ${item.path}`);

          const fileResponse = await fetch(item.download_url);
          if (!fileResponse.ok) {
            logger.error(`Failed to download: ${item.download_url}`);
            throw new Error(`Failed to download file: ${item.path} (${fileResponse.status})`);
          }

          const fileContent = await fileResponse.text();
          fs.writeFileSync(itemTargetPath, fileContent);

          logger.info(`Saved: ${itemTargetPath}`);
          copiedFiles.push(itemTargetPath);
        } else if (item.type === 'dir') {
          logger.info(`Processing directory: ${item.path}`);

          fs.mkdirSync(itemTargetPath, { recursive: true });

          const subFiles = await this.fetchAndCopyGitHubDirectory({
            apiUrl: item.url,
            targetPath: itemTargetPath,
            basePath: item.path,
            branch,
          });

          copiedFiles.push(...subFiles);
          logger.info(`Completed directory: ${item.path} (${subFiles.length} files)`);
        } else {
          logger.warn(`Skipping unknown item type '${item.type}': ${item.path}`);
        }
      }

      return copiedFiles;
    },

    /**
     * Resolves the default branch for a remote GitHub repository by querying
     * `git ls-remote --symref` and extracting the HEAD ref target.
     * @param {string} repo - The GitHub repository (e.g., "owner/repo").
     * @returns {string} The default branch name (e.g. "main" or "master").
     * @memberof UnderpostRepository
     */
    getDefaultBranch(repo) {
      if (!repo) throw new Error('[repo] getDefaultBranch requires a repository reference');
      const auth = Underpost.repo.gitAuthFactory(repo);
      const raw = shellExec(`git ls-remote --symref "${auth.url}" HEAD 2>&1`, {
        stdout: true,
        silent: true,
        disableLog: true,
        silentOnError: true,
        env: auth.env,
      });
      // --symref emits a line like: ref: refs/heads/main	HEAD
      const match = typeof raw === 'string' ? raw.match(/^ref:\s*refs\/heads\/(\S+)\tHEAD$/m) : null;
      // Guessing here is worse than failing: `main` against a `master` remote
      // fetches a ref that does not exist, and the caller has already pointed
      // origin at the new URL by the time git says so.
      if (!match)
        throw new Error(
          `[repo] cannot read the default branch of '${repo}'; it may be empty, unreachable, ` +
            `or need credentials: ${redactSensitiveText(`${raw || ''}`.trim().split('\n').pop() || 'no ref reported')}`,
        );
      logger.info('getDefaultBranch', { repo, branch: match[1] });
      return match[1];
    },

    /**
     * Dispatches a GitHub Actions workflow using gh CLI or curl fallback.
     * @param {object} options - Dispatch options.
     * @param {string} options.repo - The GitHub repository (e.g., "owner/repo").
     * @param {string} options.workflowFile - The workflow file name (e.g., "engine-core.cd.yml").
     * @param {string} [options.ref] - The git ref to dispatch against. Auto-detects the remote's default branch when omitted.
     * @param {object} [options.inputs={}] - Key-value inputs for the workflow_dispatch event.
     * @memberof UnderpostRepository
     */
    dispatchWorkflow(options = { repo: '', workflowFile: '', ref: '', inputs: {} }) {
      const { repo, workflowFile, inputs } = options;
      const ref = options.ref || Underpost.repo.getDefaultBranch(repo);
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
          const envPath = `${getUnderpostRootPath()}/.env`;
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
     * Normalizes a repository reference to a clone URL, expanding the short
     * `owner/repo` form against GitHub.
     * @param {string} url - Repository URL or `owner/repo` short form.
     * @returns {string} Clone URL, unchanged when one was already given.
     * @memberof UnderpostRepository
     */
    repoUrlFactory(url = '') {
      const value = `${url || ''}`.trim();
      if (!value) return value;
      const remote = value.startsWith('http://') || value.startsWith('https://') || value.startsWith('git@');
      return remote ? value : `https://github.com/${value}`;
    },

    /**
     * Reduces a repository reference to its `owner/repo` slug, the form the
     * clone and pull commands take.
     * @param {string} url - Repository URL or `owner/repo` short form.
     * @returns {string} Slug.
     * @throws {Error} When no owner and repository can be read from the reference.
     * @memberof UnderpostRepository
     */
    repoSlugFactory(url = '') {
      const path = Underpost.repo
        .repoUrlFactory(url)
        .replace(/^git@[^:]+:/, '')
        .replace(/^https?:\/\/[^/]+\//, '')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '');
      const [owner, repo] = path.split('/');
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
     * Fast-forwards the engine and engine-private checkouts ahead of a template deploy.
     *
     * The deploy runners publish local commits, so they must not take the `run pull` route: that one
     * is for provisioning a node and force-replaces both trees at the remote tip, discarding the very
     * commits being published. `underpost pull` is `git pull --ff-only`, so a diverged checkout stops
     * the deploy instead of losing history.
     * @param {string} baseCommand - Resolved `underpost` CLI invocation.
     * @returns {void}
     */
    fastForwardEnginePair(baseCommand) {
      shellExec(`${baseCommand} pull . ${process.env.GITHUB_USERNAME}/engine`);
      shellExec(`${baseCommand} pull ./engine-private ${process.env.GITHUB_USERNAME}/engine-private`);
    },

    /**
     * Keeps GitHub credentials in the child environment instead of command arguments or remotes.
     * @param {string} url - Repository URL or owner/repo reference.
     * @returns {{url: string, env: NodeJS.ProcessEnv}} Token-free URL and Git child environment.
     * @memberof UnderpostRepository
     */
    gitAuthFactory(url) {
      const normalized = Underpost.repo.repoUrlFactory(url).replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/i, '$1');
      const env = {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'credential.helper',
        GIT_CONFIG_VALUE_0: '',
      };
      if (process.env.GITHUB_TOKEN && normalized.startsWith('https://github.com/')) {
        env.GIT_CONFIG_COUNT = '2';
        env.GIT_CONFIG_KEY_1 = 'http.https://github.com/.extraheader';
        env.GIT_CONFIG_VALUE_1 = `AUTHORIZATION: basic ${Buffer.from(
          `x-access-token:${process.env.GITHUB_TOKEN}`,
        ).toString('base64')}`;
      }
      return { url: normalized, env };
    },
    /**
     * Checks whether a remote Git repository URL is reachable.
     * Uses `silentOnError` so a non-reachable remote returns false instead of throwing.
     * Passes `GITHUB_TOKEN` to Git through its child environment when available.
     * @param {string} url - Full HTTPS clone URL to test (e.g. "https://github.com/org/repo.git").
     * @returns {boolean} `true` when the remote responded with at least one ref hash.
     * @memberof UnderpostRepository
     */
    isRemoteRepo(url) {
      if (!url) return false;
      const auth = Underpost.repo.gitAuthFactory(url);
      const raw = shellExec(`git ls-remote "${auth.url}" HEAD 2>&1`, {
        stdout: true,
        silent: true,
        disableLog: true,
        silentOnError: true,
        env: auth.env,
      });
      const refLine = typeof raw === 'string' ? (raw.match(/^[0-9a-f]{40}\t.*$/m) || [])[0] : undefined;
      const accessible = !!refLine;
      logger.info('isRemoteRepo', { url, accessible, ref: refLine || (raw || '').trim().split('\n').pop() });
      return accessible;
    },

    /**
     * Returns the current URL of a git remote in plain text.
     * @param {object} [opts]
     * @param {string} [opts.path='.'] - Path to the git repository.
     * @param {string} [opts.remote='origin'] - Remote name to query.
     * @returns {string} The remote URL, or '' when the remote is not configured.
     * @memberof UnderpostRepository
     */
    getRemoteUrl({ path: repoPath = '.', remote = 'origin' } = {}) {
      return shellExec(`cd "${repoPath}" && git remote get-url ${remote}`, {
        stdout: true,
        silent: true,
        disableLog: true,
        silentOnError: true,
      }).trim();
    },

    /**
     * Switches a local repository onto a different remote and force-syncs its
     * working tree to a target branch, discarding local commits and tracked
     * changes — effectively "switch repo to <url>#<branch>".
     *
     * Sequence (idempotent, re-runnable):
     *   1. Normalize the URL (`owner/repo` → full GitHub HTTPS) and set/add the
     *      remote, storing the token-free URL so no secret leaks into `.git/config`.
     *   2. Force-fetch the target branch with credentials isolated in the child environment.
     *   3. Reset the working tree to the fetched tip and check out the target
     *      branch, overwriting any current tracked content.
     *
     * Untracked files are intentionally left in place (no `git clean`).
     *
     * @param {object} opts
     * @param {string} opts.url - New remote URL (full URL or "owner/repo" short form).
     * @param {string} [opts.path='.'] - Path to the git repository.
     * @param {string} [opts.branch] - Target branch to overwrite the current tree with. Defaults to the remote's default branch.
     * @param {string} [opts.remote='origin'] - Remote name to set and fetch from.
     * @returns {void}
     * @memberof UnderpostRepository
     */
    switchRemote({ url, path: repoPath = '.', branch = '', remote = 'origin' }) {
      if (!url) throw new Error('switchRemote requires a target remote url');
      if (!fs.existsSync(`${repoPath}/.git`)) throw new Error(`switchRemote: not a git repository: ${repoPath}`);
      const targetBranch = branch || Underpost.repo.getDefaultBranch(url);
      const auth = Underpost.repo.gitAuthFactory(url);
      const current = Underpost.repo.getRemoteUrl({ path: repoPath, remote });
      if (!current) shellExec(`cd "${repoPath}" && git remote add ${remote} "${auth.url}"`);
      else shellExec(`cd "${repoPath}" && git remote set-url ${remote} "${auth.url}"`);
      logger.info('switchRemote', { path: repoPath, remote, branch: targetBranch, url: auth.url });
      shellExec(`cd "${repoPath}" && git fetch --force "${auth.url}" ${targetBranch}`, { env: auth.env });
      // reset --hard first clears the worktree so the checkout cannot be blocked
      // by conflicting local changes; -B points the target branch at the fetched tip.
      shellExec(`cd "${repoPath}" && git reset --hard FETCH_HEAD`);
      shellExec(`cd "${repoPath}" && git checkout -B ${targetBranch} FETCH_HEAD`);
    },

    /**
     * Brings a local checkout to the requested repository at its tip, whatever state it is in.
     *
     * Clones when the path is absent, and otherwise replaces the checkout through
     * {@link UnderpostRepository.switchRemote} — the same operation `underpost cmt --switch-repo`
     * runs, so a node reached by `run pull` and a node reached by `edge --sync` end on the same
     * commit by the same route.
     *
     * One operation covers both the retarget and the same-repository case, because they only
     * look different: an `--ff-only` pull refuses a checkout that has drifted onto commits of
     * its own, which is exactly the node that most needs bringing back. A deploy checkout is a
     * projection of its remote, never a place work is authored, so it is replaced rather than
     * reconciled.
     *
     * The clone lands under the repository's own name and is renamed into place, because the
     * checkout path is fixed by the deployment layout while the repository name is not.
     *
     * @param {object} opts
     * @param {string} opts.path - Absolute checkout path.
     * @param {string} opts.repo - Repository `owner/repo` slug or clone URL.
     * @param {string} [opts.branch] - Branch to land on; the remote's default branch otherwise.
     * @returns {'cloned'|'switched'} What the call had to do.
     * @memberof UnderpostRepository
     */
    syncCheckout({ path: checkoutPath, repo, branch = '' }) {
      const slug = Underpost.repo.repoSlugFactory(repo);
      const repoName = slug.split('/')[1];
      const parent = path.dirname(checkoutPath);

      if (!fs.existsSync(checkoutPath)) {
        fs.mkdirSync(parent, { recursive: true });
        shellExec(`cd ${parent} && underpost clone ${slug}`, { silent: true });
        if (`${parent}/${repoName}` !== checkoutPath) shellExec(`sudo mv ${parent}/${repoName} ${checkoutPath}`);
        return 'cloned';
      }

      Underpost.repo.switchRemote({ url: slug, path: checkoutPath, branch });
      return 'switched';
    },

    /**
     * Returns metadata about unpushed commits in a git repository.
     * Fetches from origin, then counts commits ahead of the remote branch.
     * @param {string} [repoPath='.'] - Path to the git repository.
     * @param {number} [fallback=1] - Value to return as `count` when no unpushed commits are detected.
     * @returns {{ count: number, branch: string, hasUnpushed: boolean }} Unpush metadata.
     * @memberof UnderpostRepository
     */
    getUnpushedCount(repoPath = '.', fallback = 1) {
      // Every git call is silentOnError: a detached HEAD (CI checkout) or a missing upstream must
      // degrade to the fallback, never throw — otherwise the thrown error is logged to stdout and
      // can be captured as a commit message by callers that read this command's output.
      const branch = shellExec(`cd ${repoPath} && git branch --show-current`, {
        stdout: true,
        silent: true,
        disableLog: true,
        silentOnError: true,
      })
        .toString()
        .trim();
      if (!branch) return { count: fallback, branch: '', hasUnpushed: false };
      shellExec(`cd ${repoPath} && git fetch origin 2>/dev/null`, {
        silent: true,
        disableLog: true,
        silentOnError: true,
      });
      const raw = shellExec(`cd ${repoPath} && git rev-list --count origin/${branch}..HEAD 2>/dev/null`, {
        stdout: true,
        silent: true,
        disableLog: true,
        silentOnError: true,
      })
        .toString()
        .trim();
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
      const sanitized = message
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
      // The empty-changelog placeholder must never become a commit message; return empty so
      // callers fall back to their own generic default.
      return sanitized === 'No changelog entries found.' ? '' : sanitized;
    },
    /**
     * Resolves the changelog payload a workflow received from the previous link of the
     * propagation chain.
     *
     * Every hop commits the payload with `cmt`, which wraps it as
     * `type(scope): <emoji> <first entry>` — the newest entry rides on the subject line, so a
     * downstream hop that drops the whole subject line loses it. This strips only the wrapper
     * and keeps every entry, on its own line, in order.
     *
     * @param {string} rawMessage - The message as received (a commit message or a dispatch input).
     * @returns {string} The propagated entries, or an empty string when there is nothing to carry.
     * @memberof UnderpostRepository
     */
    resolvePropagationMessage(rawMessage) {
      if (!rawMessage) return '';
      const types = Object.keys(commitData).join('|');
      const emojis = Object.values(commitData)
        .map(({ emoji }) => emoji)
        .filter(Boolean);
      const lines = `${rawMessage}`
        .replace(new RegExp(`^(${types})(\\([^)]*\\))?:\\s*`), '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines[0]) {
        for (const emoji of emojis)
          if (lines[0].startsWith(emoji)) {
            lines[0] = lines[0].slice(emoji.length).trim();
            break;
          }
        if (!lines[0]) lines.shift();
      }
      return lines.join('\n');
    },

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
      const gitUsername = repositoryIdentityFactory().owner;
      const gitEmail = process.env.GITHUB_EMAIL || `development@underpost.net`;

      // Runtime document roots are chowned to the web server user, and git refuses to operate on
      // a tree owned by someone else until it is declared safe.
      Underpost.repo.declareSafeDirectory(repoPath);

      if (!fs.existsSync(`${repoPath}/.git`)) {
        shellExec(`mkdir -p "${repoPath}" && git init "${repoPath}"`);
      }

      shellExec(`cd "${repoPath}" && git config user.name '${gitUsername}'`);
      shellExec(`cd "${repoPath}" && git config user.email '${gitEmail}'`);
      shellExec(`cd "${repoPath}" && git config core.filemode false`);
      if (origin) {
        const currentRemote = shellExec(`cd "${repoPath}" && git remote get-url origin`, {
          stdout: true,
          silent: true,
          silentOnError: true,
        }).trim();
        if (!currentRemote) {
          shellExec(`cd "${repoPath}" && git remote add origin "${origin}"`);
        } else if (currentRemote !== origin) {
          shellExec(`cd "${repoPath}" && git remote set-url origin "${origin}"`);
        }
      }
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
              // A backup run that produced no new bytes is a normal outcome, not a
              // failure: committing anyway exits non-zero and buries real errors.
              const pending = shellExec(`cd ${repoPath} && git status --porcelain`, {
                stdout: true,
                silent: true,
                disableLog: true,
                silentOnError: true,
              });
              if (!`${pending || ''}`.trim()) {
                logger.info(`No changes to commit: ${repoName}`, { message });
                break;
              }
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

    /**
     * Declares a path safe for git, skipping the write when it is already declared so repeated
     * provisioning does not append duplicate global config entries.
     * @param {string} repoPath - Absolute path to declare.
     * @returns {void}
     * @memberof UnderpostRepository
     */
    declareSafeDirectory(repoPath) {
      const declared = shellExec(`git config --global --get-all safe.directory`, {
        stdout: true,
        silent: true,
        disableLog: true,
        silentOnError: true,
      });
      if (`${declared ?? ''}`.split('\n').some((entry) => entry.trim() === repoPath)) return;
      shellExec(`git config --global --add safe.directory "${repoPath}"`, { silent: true });
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

      if (!process.env.GITHUB_TOKEN && Underpost.repo.repoUrlFactory(reference).startsWith('https://github.com/'))
        logger.warn(`${host}: GITHUB_TOKEN not set — git operations will fail for private repositories`);

      if (!Underpost.repo.isRemoteRepo(reference)) {
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
      if (fs.existsSync(tmp)) shellExec(`sudo rm -rf "${tmp}"`);
      fs.mkdirSync(path.dirname(siteRoot), { recursive: true });
      const auth = Underpost.repo.gitAuthFactory(reference);
      shellExec(`git clone "${auth.url}" "${tmp}"`, { env: auth.env });
      // Copied into a directory that already exists rather than renamed over it: that directory
      // can be image-provided or a mount point, and a rename onto one fails where a copy works.
      if (populateInPlace) {
        shellExec(`sudo cp -a "${tmp}/." "${siteRoot}/"`);
        shellExec(`sudo rm -rf "${tmp}"`);
      } else shellExec(`sudo mv "${tmp}" "${siteRoot}"`);
      shellExec(`sudo chmod -R 755 "${siteRoot}"`);
      shellExec(`sudo chown -R ${owner} "${siteRoot}"`);
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
     * Backs up all repositories defined in a deployment's conf.server.json by executing
     * git commit+push inside the running deployment pod via `kubectl exec`.
     *
     * Scans every `server[host][path]` entry for a `repository` field. For each match
     * the runtime-specific site root is resolved and a git backup script is executed
     * inside the pod. GITHUB_TOKEN and GITHUB_USERNAME are injected as ephemeral
     * environment variables in the exec command — never persisted to the pod filesystem.
     *
     * @param {object} opts
     * @param {string}  opts.deployId   - Deployment ID (used to read conf.server.json and find pods).
     * @param {string}  [opts.namespace='default'] - Kubernetes namespace.
     * @param {string}  [opts.env='production'] - Deployment environment.
     * @returns {void}
     * @memberof UnderpostRepository
     */
    backupPodRepositories({ deployId, namespace = 'default', env = 'production' }) {
      const confServer = readConfJson(deployId, 'server', { resolve: true });
      const githubToken = process.env.GITHUB_TOKEN || '';
      const githubUsername = repositoryIdentityFactory().owner;

      if (!githubToken) {
        logger.warn('backupPodRepositories: GITHUB_TOKEN not available — git push will fail');
      }

      // Resolve the active blue/green traffic colour so we target the correct pod
      const traffic = Underpost.deploy.getCurrentTraffic(deployId, { namespace, env });
      if (!traffic) {
        logger.warn(`backupPodRepositories: could not resolve current traffic for ${deployId} — skipping`);
        return;
      }

      // Find a running pod that matches the active traffic colour
      const pods = Underpost.kubectl.get(`${deployId}-${env}-${traffic}`, 'pods', namespace);
      const runningPod = pods.find((p) => p.STATUS === 'Running');
      if (!runningPod) {
        logger.warn(`backupPodRepositories: no running ${traffic} pod found for ${deployId} in namespace ${namespace}`);
        return;
      }
      const podName = runningPod.NAME;

      for (const host of Object.keys(confServer)) {
        for (const routePath of Object.keys(confServer[host])) {
          const entry = confServer[host][routePath];
          if (!entry.repository) continue;

          const siteRootArgs = { runtime: entry.runtime, host, directory: entry.directory };
          const repoRoot = Underpost.repo.runtimeSiteRoot({ ...siteRootArgs, routePath });
          if (!repoRoot) {
            logger.warn(`backupPodRepositories: no site-root mapping for runtime '${entry.runtime}' (${host})`);
            continue;
          }

          // Probe the pod for the actual git repo so an unprovisioned/missing site root is
          // detected and skipped cleanly instead of failing the in-pod `cd` with exit 1.
          // Fall back to the vhost dir (root route) to cover conf/path drift.
          const vhostRoot = Underpost.repo.runtimeSiteRoot({ ...siteRootArgs, routePath: '/' });
          const candidates = [...new Set([repoRoot, vhostRoot].filter(Boolean))];
          const siteRoot = Underpost.repo.podRepoDir({ podName, namespace, candidates });
          if (!siteRoot) {
            logger.warn(
              `backupPodRepositories: no git repository found in pod ${podName} for ${host} (checked ${candidates.join(
                ', ',
              )}) — site may not be provisioned yet; skipping`,
            );
            continue;
          }

          const repoName = entry.repository.split('/').pop().split('.')[0];

          // Build the backup script — secrets are injected as env vars in the exec,
          // never written to filesystem. The shell process inherits them ephemerally.
          const backupScript = [
            `export GITHUB_TOKEN='${githubToken.replace(/'/g, "'\\''")}'`,
            `export GITHUB_USERNAME='${githubUsername.replace(/'/g, "'\\''")}'`,
            `git config --global --add safe.directory '${siteRoot}' 2>/dev/null || true`,
            `cd '${siteRoot}' && git add -A && git commit -m 'backup $(date -u +%Y-%m-%dT%H:%M:%SZ)' || true`,
            `cd '${siteRoot}' && underpost push . ${githubUsername}/${repoName}`,
            `cd /home/dd/engine && node bin host clean --force`,
          ].join(' && ');

          try {
            logger.info(`backupPodRepositories: backing up ${host} (${entry.runtime}) in pod ${podName}`);
            Underpost.kubectl.exec({ podName, namespace, command: backupScript });
            logger.info(`backupPodRepositories: git push done for ${host}`);
          } catch (err) {
            logger.error(`backupPodRepositories: backup failed for ${host}`, err.message);
          }
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
      shellExec(`underpost clone ${username}/${repoName}`);
      if (!fs.existsSync(`./${repoName}`)) {
        throw new Error(`privateEngineRepoFactory: clone failed for ${username}/${repoName}`);
      }
      if (repoName !== 'engine-private') shellExec(`mv ./${repoName} ./engine-private`);
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
        const runtimeRepo = Underpost.repo.isRemoteRepo(`${process.env.GITHUB_USERNAME}/${runtime}`);
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
     * Performs a shallow sparse Git checkout of a single subdirectory from any
     * GitHub repository into a local target directory.
     *
     * Uses `--depth 1 --no-checkout` + `git sparse-checkout` so only the
     * requested path is fetched — no full clone of the remote repo.
     * Skips the clone entirely when `<targetDir>/<subPath>` already exists on
     * disk (idempotent).
     *
     * Requires `GITHUB_TOKEN` to be set in the environment for authenticated
     * access to private repositories.
     *
     * @param {string} subPath - The subdirectory path within the remote repo to
     *   check out (e.g. `'conf/dd-prototype'`, `'src/api/payments'`).
     * @param {object} [options]
     * @param {string} [options.repoOwner='underpostnet'] - GitHub organisation or
     *   user that owns the repository.
     * @param {string} [options.repoName='engine-private'] - Name of the
     *   repository on GitHub.
     * @param {string} [options.targetDir='./engine-private'] - Local directory
     *   where the repo will be cloned.
     * @returns {boolean} `true` when the checkout was performed, `false` when it
     *   was skipped because the target path already existed.
     * @memberof UnderpostRepository
     */
    sparseCheckoutDirectory(
      subPath,
      options = { repoOwner: 'underpostnet', repoName: 'engine-private', targetDir: './engine-private' },
    ) {
      const { repoOwner = 'underpostnet', repoName = 'engine-private', targetDir = './engine-private' } = options;
      const localPath = `${targetDir}/${subPath}`;
      if (fs.existsSync(localPath)) {
        logger.info('[sparseCheckoutDirectory] path already present, skipping', localPath);
        return false;
      }
      const auth = Underpost.repo.gitAuthFactory(`https://github.com/${repoOwner}/${repoName}.git`);
      shellExec(`git clone --depth 1 --no-checkout "${auth.url}" ${targetDir}`, {
        disableLog: true,
        env: auth.env,
      });
      shellExec(`cd ${targetDir} && git sparse-checkout set ${subPath} && git checkout`, { disableLog: true });
      logger.info('[sparseCheckoutDirectory] sparse checkout complete', localPath);
      return true;
    },

    /**
     * Ensures a deploy's public source repo (e.g. `engine-prototype`) is present
     * next to the engine and reset to a pristine HEAD, so catalog `sourceMoves`
     * can (re)pull custom sources even after a previous build moved them out of
     * the source tree.
     *
     * Clones `../<repoName>` when missing; otherwise restores a clean checkout
     * (`git checkout .` brings back any moved-out tracked files) and pulls latest.
     * Mirrors the sibling-repo handling used by `syncPrivateConf`.
     *
     * @param {string} repoName - Public source repo name (e.g. `engine-prototype`).
     * @returns {boolean} `true` when the repo is available on disk.
     * @memberof UnderpostRepository
     */
    pullSourceRepo(repoName) {
      const username = process.env.GITHUB_USERNAME;
      if (!username || !repoName) return false;
      const repoPath = `../${repoName}`;
      const gitUri = `${username}/${repoName}`;
      if (!fs.existsSync(repoPath)) {
        shellExec(`cd .. && underpost clone ${gitUri}`, { silent: true });
      } else {
        const repoAbsPath = path.resolve(repoPath);
        shellExec(`git config --global --add safe.directory '${repoAbsPath}'`);
        shellExec(`cd ${repoPath} && git checkout . && git clean -f -d && underpost pull . ${gitUri}`, {
          silent: true,
        });
      }
      return fs.existsSync(repoPath);
    },
  };
}

export default UnderpostRepository;
