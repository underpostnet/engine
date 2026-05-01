/**
 * Release orchestrator module for managing version builds and deployments of the Underpost CLI.
 *
 * Provides automated workflows for building new versions (bumping version numbers across
 * all package files, manifests, and configurations) and deploying releases (committing,
 * pushing, and syncing secrets to remote repositories).
 *
 * @module src/cli/release.js
 * @namespace UnderpostRelease
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import { pbcopy, shellCd, shellExec } from '../server/process.js';
import { loggerFactory } from '../server/logger.js';
import { timer } from '../client/components/core/CommonJs.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * Kills any Node.js dev-server or nodemon processes that may hold file locks
 * (e.g. overwriting package.json). Skips VSCode internals and the current process.
 */
function killDevServers() {
  // shellExec(
  //   `kill -9 $(pgrep -f 'nodemon|node.*src/server|node.*dev' | grep -v '^${process.pid}$') 2>/dev/null || true`,
  // );
  shellExec(`node bin run kill 4001`);
  shellExec(`node bin run kill 4002`);
  shellExec(`node bin run kill 4003`);
  shellExec(`node bin run kill 3000`);
}

/**
 * @class UnderpostRelease
 * @description Orchestrates version builds and release deployments for the Underpost CLI.
 * This class provides static methods to automate the full release lifecycle:
 * building a new version (testing, bumping versions, rebuilding manifests)
 * and deploying a release (syncing secrets, committing, and pushing to remotes).
 * @memberof UnderpostRelease
 */
class UnderpostRelease {
  static API = {
    /**
     * Builds a new version of the Underpost engine.
     *
     * Performs the full version build pipeline:
     * 1. Loads production environment and pulls latest code.
     * 2. Kills running dev servers on ports 4001-4003.
     * 3. Builds and tests the pwa-microservices-template.
     * 4. Bumps version in package.json, package-lock.json, and all conf package files.
     * 5. Updates deployment YAML manifests and Docker image CI workflow with new version.
     * 6. Updates src/index.js version string.
     * 7. Rebuilds CLI docs, dependencies, client builds, deploy manifests, and default confs.
     * 8. Syncs cron setup-start scripts and builds changelog.
     *
     * @method build
     * @param {string} [newVersion] - The new version string to set. Defaults to current version if not provided.
     * @param {object} [options] - Commander options object (unused, reserved for future flags).
     * @memberof UnderpostRelease
     */
    async build(newVersion, options) {
      dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
      shellCd(`/home/dd/engine`);
      killDevServers();
      Underpost.repo.clean({ paths: ['/home/dd/engine', '/home/dd/engine/engine-private '] });
      shellExec(`node bin pull . ${process.env.GITHUB_USERNAME}/engine`);
      shellExec(`npm run update:template`);
      shellExec(`cd ../pwa-microservices-template && npm install && npm run build`);
      console.log(fs.existsSync(`../pwa-microservices-template/engine-private/conf/dd-default`));
      shellExec(`cd ../pwa-microservices-template && ENABLE_FILE_LOGS=true timeout 5s npm run dev`, {
        async: true,
      });
      await timer(5500);
      const templateRunnerResult = fs.readFileSync(`../pwa-microservices-template/logs/start.js/all.log`, 'utf8');
      logger.info('Test template runner result');
      console.log(templateRunnerResult);
      if (!templateRunnerResult || templateRunnerResult.toLowerCase().match('error')) {
        logger.error('Test template runner result failed');
        return;
      }
      killDevServers();
      shellCd(`/home/dd/engine`);
      Underpost.repo.clean({ paths: ['/home/dd/engine', '/home/dd/engine/engine-private '] });
      const originPackageJson = JSON.parse(fs.readFileSync(`package.json`, 'utf8'));
      if (!newVersion) newVersion = originPackageJson.version;
      const { version } = originPackageJson;
      originPackageJson.version = newVersion;
      fs.writeFileSync(`package.json`, JSON.stringify(originPackageJson, null, 4), 'utf8');

      const originPackageLockJson = JSON.parse(fs.readFileSync(`package-lock.json`, 'utf8'));
      originPackageLockJson.version = newVersion;
      originPackageLockJson.packages[''].version = newVersion;
      fs.writeFileSync(`package-lock.json`, JSON.stringify(originPackageLockJson, null, 4), 'utf8');

      if (fs.existsSync(`./engine-private/conf`)) {
        const files = await fs.readdir(`./engine-private/conf`, { recursive: true });
        for (const relativePath of files) {
          const filePah = `./engine-private/conf/${relativePath.replaceAll(`\\`, '/')}`;
          if (filePah.split('/').pop() === 'package.json') {
            const originPackage = JSON.parse(fs.readFileSync(filePah, 'utf8'));
            originPackage.version = newVersion;
            fs.writeFileSync(filePah, JSON.stringify(originPackage, null, 4), 'utf8');
          }
          if (filePah.split('/').pop() === 'deployment.yaml') {
            fs.writeFileSync(
              filePah,
              fs
                .readFileSync(filePah, 'utf8')
                .replaceAll(`v${version}`, `v${newVersion}`)
                .replaceAll(`engine.version: ${version}`, `engine.version: ${newVersion}`),
              'utf8',
            );
          }
        }
      }

      fs.writeFileSync(
        `./manifests/deployment/dd-default-development/deployment.yaml`,
        fs
          .readFileSync(`./manifests/deployment/dd-default-development/deployment.yaml`, 'utf8')
          .replaceAll(`underpost-engine:v${version}`, `underpost-engine:v${newVersion}`),
        'utf8',
      );

      if (fs.existsSync(`./.github/workflows/docker-image.ci.yml`))
        fs.writeFileSync(
          `./.github/workflows/docker-image.ci.yml`,
          fs
            .readFileSync(`./.github/workflows/docker-image.ci.yml`, 'utf8')
            .replaceAll(`underpost-engine:v${version}`, `underpost-engine:v${newVersion}`),
          'utf8',
        );

      // Update underpost/* image versions in all engine-*.cd.yml workflows.
      for (const wf of fs.readdirSync(`./.github/workflows`)) {
        if (!wf.match(/^engine-.+\.cd\.yml$/)) continue;
        const wfPath = `./.github/workflows/${wf}`;
        const updated = fs
          .readFileSync(wfPath, 'utf8')
          .replace(/underpost\/([^:'"]+):v[0-9]+\.[0-9]+\.[0-9]+/g, `underpost/$1:v${newVersion}`);
        fs.writeFileSync(wfPath, updated, 'utf8');
      }

      // Update version tag in all runtime docker image workflows (type=raw,value=v<version>).
      for (const wf of fs.readdirSync(`./.github/workflows`)) {
        if (!wf.match(/^docker-image\..+\.ci\.yml$/) || wf === 'docker-image.ci.yml') continue;
        const wfPath = `./.github/workflows/${wf}`;
        fs.writeFileSync(
          wfPath,
          fs.readFileSync(wfPath, 'utf8').replaceAll(`type=raw,value=v${version}`, `type=raw,value=v${newVersion}`),
          'utf8',
        );
      }

      // Update image version in all conf.instances.json files for underpost/* images.
      if (fs.existsSync(`./engine-private/conf`)) {
        const confFiles = await fs.readdir(`./engine-private/conf`, { recursive: true });
        for (const relativePath of confFiles) {
          const filePath = `./engine-private/conf/${relativePath.replaceAll('\\', '/')}`;
          if (filePath.split('/').pop() !== 'conf.instances.json' || !fs.existsSync(filePath)) continue;

          let instances;
          try {
            instances = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          } catch {
            logger.warn(`Skipping invalid JSON file: ${filePath}`);
            continue;
          }

          if (!Array.isArray(instances)) continue;

          let updated = false;
          for (const instance of instances) {
            if (!instance || typeof instance !== 'object') continue;
            if (!instance.image || typeof instance.image !== 'string') continue;
            if (!instance.image.startsWith('underpost/')) continue;

            const baseImage = instance.image.split('@')[0].split(':')[0];
            const nextImage = `${baseImage}:v${newVersion}`;
            if (instance.image !== nextImage) {
              instance.image = nextImage;
              updated = true;
            }
          }

          if (updated) fs.writeFileSync(filePath, JSON.stringify(instances, null, 2), 'utf8');
        }
      }

      fs.writeFileSync(
        `./src/index.js`,
        fs.readFileSync(`./src/index.js`, 'utf8').replaceAll(`${version}`, `${newVersion}`),
        'utf8',
      );
      shellExec(`node bin/deploy cli-docs ${version} ${newVersion}`);
      shellExec(`node bin/deploy update-dependencies`);
      shellExec(`node bin/build dd`);
      shellExec(`node bin deploy --build-manifest --sync --info-router --replicas 1 dd production`);
      shellExec(`node bin deploy --build-manifest --sync --info-router --replicas 1 dd development`);
      shellExec(`node bin/deploy build-default-confs`);
      shellExec(`sudo rm -rf ./engine-private/conf/dd-default`);
      shellExec(`node bin new --deploy-id dd-default`);
      console.log(fs.existsSync(`./engine-private/conf/dd-default`));
      shellExec(`sudo rm -rf ./engine-private/conf/dd-default`);
      shellExec(`node bin cron --kubeadm --setup-start --git`); // --apply
      shellExec(`node bin cmt --changelog-build`);
    },

    /**
     * Runs the local equivalent of an engine-*.ci.yml GitHub Actions workflow.
     *
     * Mirrors the CI pipeline locally:
     * 1. Loads production environment (for GITHUB_TOKEN / GITHUB_USERNAME).
     * 2. Clones pwa-microservices-template and engine-{suffix} (bare) into the parent dir (/home/dd).
     * 3. Builds dd-{suffix} development from the engine directory.
     * 4. Replaces .git in pwa-microservices-template with the bare-cloned git, then commits and pushes
     *    to the underpostnet/engine-{suffix} remote repository.
     *
     * @method ci
     * @param {string} deployId - The deploy-id suffix (e.g., "cyberia", "core", "lampp", "test").
     *   Accepts "cyberia", "dd-cyberia", or "engine-cyberia" — the prefix is stripped automatically.
     * @param {string} [message] - Optional commit message. Defaults to the last commit message of pwa-microservices-template.
     * @param {object} [options] - Commander options object (unused, reserved for future flags).
     * @memberof UnderpostRelease
     */
    async ci(deployId, message, options) {
      dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
      const suffix = deployId.replace(/^(dd-|engine-)/, '');
      const repoName = `engine-${suffix}`;
      const buildTarget = `dd-${suffix}`;
      const githubOrg = process.env.GITHUB_USERNAME || 'underpostnet';
      shellCd('/home/dd');
      shellExec(`sudo rm -rf /home/dd/pwa-microservices-template`);
      shellExec(`node engine/bin clone ${githubOrg}/pwa-microservices-template`);
      // Use the message passed from the caller (engine repo changelog);
      // fall back to the engine repo's last commit if not provided.
      let commitMsg = message;
      if (!commitMsg) {
        shellCd('/home/dd/engine');
        const rawMsg = shellExec(`node bin cmt --changelog 1 --changelog-no-hash`, {
          stdout: true,
          silent: true,
        }).trim();
        commitMsg = Underpost.repo.sanitizeChangelogMessage(rawMsg);
        shellCd('/home/dd');
      }
      commitMsg = (commitMsg || '').trim() || `Update ${repoName} repository`;
      logger.info(`CI push commit message: ${commitMsg}`);
      shellExec(`node engine/bin clone --bare ${githubOrg}/${repoName}`);
      shellCd('/home/dd/engine');
      shellExec(`node bin/build ${buildTarget}`);
      shellCd('/home/dd/pwa-microservices-template');
      shellExec(`rm -rf ./.git`);
      shellExec(`mv ../${repoName}.git ./.git`);
      shellExec(`git config --local core.bare false`);
      shellExec(`git reset`);
      Underpost.repo.initLocalRepo({ path: '/home/dd/pwa-microservices-template' });
      return {
        triggerCmd: `cd /home/dd/pwa-microservices-template && git add . && git commit -m "${commitMsg}" && node ../engine/bin push . ${githubOrg}/${repoName}`,
      };
    },

    /**
     * Runs the pwa-microservices-template update and push flow locally.
     *
     * Always removes and re-clones pwa-microservices-template, then:
     * 1. Runs update:template (node bin/file update-template) to sync engine sources.
     * 2. Installs dependencies and builds the template.
     * 3. Commits and pushes to the pwa-microservices-template remote repository.
     *
     * @method pwa
     * @param {string} [message] - Optional commit message. Defaults to last commit message of pwa-microservices-template.
     * @param {object} [options] - Commander options object (unused, reserved for future flags).
     * @memberof UnderpostRelease
     */
    async pwa(message, options) {
      dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
      const githubOrg = process.env.GITHUB_USERNAME || 'underpostnet';
      // Use the message passed from the caller (engine repo changelog);
      // fall back to the engine repo's last commit if not provided.
      let commitMsg = message;
      if (!commitMsg) {
        shellCd('/home/dd/engine');
        const rawMsg = shellExec(`node bin cmt --changelog 1 --changelog-no-hash`, {
          stdout: true,
          silent: true,
        }).trim();
        commitMsg = Underpost.repo.sanitizeChangelogMessage(rawMsg);
      }
      commitMsg = (commitMsg || '').trim() || `Update pwa-microservices-template repository`;
      shellCd('/home/dd');
      shellExec(`sudo rm -rf /home/dd/pwa-microservices-template`);
      shellExec(`node engine/bin clone ${githubOrg}/pwa-microservices-template`);
      shellCd('/home/dd/engine');
      shellExec(`npm run update:template`);
      shellExec(`cd ../pwa-microservices-template && npm install && npm run build`);
      shellCd('/home/dd/pwa-microservices-template');
      shellExec(`git add .`);
      // shellExec(`git commit -m "${commitMsg}"`);
      return {
        triggerCmd: `node bin push . ${githubOrg}/engine && cd /home/dd/pwa-microservices-template && git commit -m "${commitMsg}" && node ../engine/bin push . ${githubOrg}/pwa-microservices-template`,
      };
    },

    /**
     * Deploys a new version release to remote repositories.
     *
     * Performs the release deployment pipeline:
     * 1. Loads production environment from dd-cron.
     * 2. Syncs Underpost secrets from the production env file.
     * 3. Builds the dd configuration.
     * 4. Stages all changes in both engine and engine-private repositories.
     * 5. Commits with a release message including the version tag.
     * 6. Pushes both repositories to their respective GitHub remotes.
     *
     * @method deploy
     * @param {string} [version] - The version string for the release commit message (e.g., "3.1.4").
     * @param {object} [options] - Commander options object (unused, reserved for future flags).
     * @memberof UnderpostRelease
     */
    async deploy(version, options) {
      dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
      killDevServers();
      shellExec(
        `node bin secret underpost --create-from-file /home/dd/engine/engine-private/conf/dd-cron/.env.production`,
      );
      shellExec(`node bin/build dd conf`);
      shellExec(`git add . && cd ./engine-private && git add .`);
      shellExec(`node bin cmt . ci package-pwa-microservices-template 'New release v:${version}'`);
      shellExec(`node bin cmt ./engine-private ci package-pwa-microservices-template`);
      shellExec(`node bin push . ${process.env.GITHUB_USERNAME}/engine`);
      shellExec(`cd ./engine-private && node ../bin push . ${process.env.GITHUB_USERNAME}/engine-private`);
    },
  };
}

export { UnderpostRelease };
export default UnderpostRelease;
