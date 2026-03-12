/**
 * Centralized environment variable loader with dotenv override.
 *
 * Priority (first found wins):
 *   1. `./.env.<NODE_ENV>` — e.g. `.env.production`
 *   2. `engine-private/conf/<deployId>/.env.<NODE_ENV>`
 *   3. `./.env`
 *   4. `<underpost npm root>/.env`
 *   5. `./.env.example`
 *
 * Every file that exists in the chain is loaded with `override: true` so that
 * lower-priority values are overwritten by higher-priority ones. The loading
 * order is reversed (lowest-priority first) so that the highest-priority file
 * has the final say.
 *
 * @module src/server/env.js
 * @namespace UnderpostEnvLoader
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import { execSync } from 'node:child_process';

/**
 * Resolves the underpost npm global root path without depending on conf.js
 * (which itself calls loadEnv).
 *
 * @returns {string|null} The `<npm root -g>/underpost` path, or null when the
 *   command fails (e.g. npm is not installed or running in a CI image).
 */
const getUnderpostRoot = () => {
  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    return `${npmRoot}/underpost`;
  } catch {
    return null;
  }
};

/**
 * Loads environment variables following the priority chain.
 *
 * @param {object} [options]
 * @param {string} [options.deployId] - Deploy ID used to resolve priority-2 path.
 * @param {string} [options.nodeEnv]  - Explicit NODE_ENV override (defaults to
 *        `process.env.NODE_ENV`).
 * @memberof UnderpostEnvLoader
 */
const loadEnv = (options = {}) => {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV;
  const deployId = options.deployId || process.env.DEPLOY_ID;

  // Build candidate paths from lowest to highest priority.
  // We load lowest first so that higher-priority files override via
  // `override: true`.
  const candidates = [];

  // Priority 5 — fallback example
  candidates.push('./.env.example');

  // Priority 4 — underpost global root
  const underpostRoot = getUnderpostRoot();
  if (underpostRoot) candidates.push(`${underpostRoot}/.env`);

  // Priority 3 — project root .env
  candidates.push('./.env');

  // Priority 2 — deploy-specific env
  if (deployId && nodeEnv) {
    candidates.push(`./engine-private/conf/${deployId}/.env.${nodeEnv}`);
  }

  // Priority 1 — root-level NODE_ENV-specific env
  if (nodeEnv) {
    candidates.push(`./.env.${nodeEnv}`);
  }

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
    }
  }
};

export { loadEnv };
