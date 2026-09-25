/**
 * The API contract every host serves and every first-party client calls: `/api/<version>/<api>`.
 * Nothing configures it: `DOMAIN_API_VERSION` is the one authority, and a breaking change of the
 * contract bumps it.
 *
 * @module src/server/domain/api-contract.js
 * @namespace ApiContract
 */

/**
 * Semantic version of the API contract.
 * @memberof ApiContract
 */
export const DOMAIN_API_VERSION = 'v1';

/**
 * Path of the API contract below a host path, `api/v1`.
 * @memberof ApiContract
 */
export const API_BASE_PATH = `api/${DOMAIN_API_VERSION}`;

/**
 * The path a host path serves its APIs under.
 * @param {string} [path='/'] - Host path.
 * @returns {string} `/api/v1`, or `/<path>/api/v1`.
 * @memberof ApiContract
 */
export const apiPathOf = (path = '/') => `${path === '/' ? '' : path}/${API_BASE_PATH}`;
