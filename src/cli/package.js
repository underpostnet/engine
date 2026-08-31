/**
 * Package domain: the manifests a deploy id owns.
 *
 * Every generated `package.json` in the project comes from one builder,
 * {@link module:src/server/build/package.js}: a deploy id's own manifest under
 * `engine-private/conf/<deploy-id>/`, the standalone product CLI's, and the copy published with
 * a product's instances. This domain is the operator surface over that builder — the place a
 * person or a workflow asks for those manifests by deploy id, rather than each build script
 * merging dependency maps its own way.
 *
 * What a deploy adds to the engine's manifest is declared in its product catalog
 * (`packageName`, `packageBin`, `packageDependencies`, `packageScripts`); a deploy id without a
 * catalog is the engine manifest under its own identity, which is the default and needs no
 * declaration.
 * @module src/cli/package.js
 * @namespace UnderpostPackage
 */

import { loggerFactory } from '../server/ops/logger.js';
import {
  installDeployDependencies,
  renamePackage,
  setPackageRepository,
  syncDeployPackages,
} from '../server/build/package.js';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostPackage
 * @description Generates the package manifests a deploy id owns, and installs what its catalog pins.
 * @memberof UnderpostPackage
 */
class UnderpostPackage {
  static API = {
    /**
     * @method callback
     * @description Runs the requested package operations for a deploy id, or for every deploy id
     * in the private configuration tree when none is named. With no operation selected, `--sync`
     * is what the command is for and is what it does.
     * @param {string} [deployId] - Deploy id to act on; every deploy id with a manifest otherwise.
     * @param {object} [options] - Command options.
     * @param {boolean} [options.sync] - Regenerate the deploy manifests from the engine's and the catalog.
     * @param {boolean} [options.install] - Install the deploy catalog's pinned dependencies into this checkout.
     * @param {string} [options.rename] - Rename this checkout's package, manifest and lockfile together.
     * @param {string} [options.setRepo] - Point this checkout's package at a repository.
     * @param {boolean} [options.dryRun] - Resolve what `--sync` would write without writing it.
     * @returns {Promise<{synced: Array<object>, installed: string[], renamed: string, repository: object}>} What the run resolved.
     * @memberof UnderpostPackage
     */
    async callback(deployId = '', options = {}) {
      const deployIds = `${deployId ?? ''}`
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const install = options.install === true;
      const rename = `${options.rename ?? ''}`.trim();
      const setRepo = `${options.setRepo ?? ''}`.trim();
      const sync = options.sync === true || !(install || rename || setRepo);

      const synced = sync ? await syncDeployPackages({ deployIds, dryRun: options.dryRun === true }) : [];

      const installed = [];
      if (install) {
        // The pins are a deploy's own declaration, so there is no meaningful "install every
        // deploy's dependencies" into one checkout.
        if (deployIds.length === 0) throw new Error('[package] --install requires a deploy id');
        for (const id of deployIds) installed.push(...(await installDeployDependencies(id)));
      }

      const renamed = rename ? renamePackage({ name: rename }).name : '';
      const { repository } = setRepo
        ? setPackageRepository({ slug: Underpost.repo.repoSlugFactory(setRepo) })
        : { repository: null };

      logger.info('Package operations complete', {
        deployIds: deployIds.length > 0 ? deployIds : 'all',
        synced: synced.map(({ deployId: id, name }) => `${id} → ${name}`),
        installed,
        renamed: renamed || null,
        repository: repository?.url ?? null,
        dryRun: options.dryRun === true,
      });
      return { synced, installed, renamed, repository };
    },
  };
}

export default UnderpostPackage;
