/**
 * Graphify domain: the code graph of the checkout the CLI runs in.
 *
 * {@link module:src/server/release/graphify.js} owns the Graphify integration and the freshness
 * stamp; this domain is the operator surface over it for the engine graph, which
 * {@link module:src/projects/underpost/catalog-underpost.js} declares.
 * @module src/cli/graphify.js
 * @namespace UnderpostGraphify
 */

import nodePath from 'node:path';
import { ENGINE_GRAPH } from '../projects/underpost/catalog-underpost.js';
import { checkGraph, writeGraph } from '../server/release/graphify.js';
import { loggerFactory } from '../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostGraphify
 * @description Builds and checks the code graph of a checkout.
 * @memberof UnderpostGraphify
 */
class UnderpostGraphify {
  static API = {
    /**
     * @method build
     * @description Builds the code graph of a checkout, code only, and stamps it. A fresh graph
     * stays as it is, and needs no Graphify.
     * @param {object} [params]
     * @param {string} [params.root] - The checkout.
     * @returns {{built:boolean, version:string, seconds?:number, nodes?:number, links?:number}}
     * @memberof UnderpostGraphify
     */
    build({ root = process.cwd() } = {}) {
      const result = writeGraph({ root, ...ENGINE_GRAPH });
      logger.info(`Code graph ${nodePath.join(root, ENGINE_GRAPH.out)}`, result);
      return result;
    },

    /**
     * @method check
     * @description Checks the code graph of a checkout against its sources, without Graphify and
     * without a write.
     * @param {object} [params]
     * @param {string} [params.root] - The checkout.
     * @param {string} [params.revision] - A commit; the work tree when absent.
     * @returns {{fresh:true}|{fresh:false, reason:string}}
     * @memberof UnderpostGraphify
     */
    check({ root = process.cwd(), revision } = {}) {
      return checkGraph({ root, ...ENGINE_GRAPH, revision });
    },

    /**
     * @method callback
     * @description `underpost graphify` entrypoint. Without `--check` it builds the graph.
     * @param {object} [options]
     * @param {boolean} [options.check] - Check the graph; fail when it is stale.
     * @param {string} [options.revision] - Check the graph that this commit holds.
     * @returns {object} The build or check result.
     * @throws {Error} When the graph is stale, or Graphify is missing or fails.
     * @memberof UnderpostGraphify
     */
    callback(options = {}) {
      const root = process.cwd();
      if (!options.check && !options.revision) return UnderpostGraphify.API.build({ root });
      const result = UnderpostGraphify.API.check({ root, revision: options.revision });
      if (!result.fresh)
        throw new Error(
          `The code graph ${nodePath.join(root, ENGINE_GRAPH.out)} ${result.reason}: run underpost graphify`,
        );
      logger.info(`Code graph ${nodePath.join(root, ENGINE_GRAPH.out)} is fresh`, { revision: options.revision });
      return result;
    },
  };
}

export default UnderpostGraphify;
