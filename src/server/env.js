/**
 * Centralized environment variable loader.
 *
 * Priority (highest wins):
 *
 *   0 (highest) Shell / `process.env` values already set before this runs
 *   1           `options.nodeEnv` / `options.deployId` explicit overrides
 *   2           `./.env.<NODE_ENV>` — e.g. `.env.production`
 *   3           `engine-private/conf/<deployId>/.env.<NODE_ENV>`
 *   4           `./.env`
 *   5 (lowest)  `./.env.example`
 *
 * Files are loaded from highest to lowest priority using dotenv's default
 * (no-override) mode — the first value set for a variable wins.  Values
 * already in `process.env` (from the shell, npm scripts, etc.) are never
 * overwritten by file-based defaults.
 *
 * A bootstrap phase uses `dotenv.parse()` (read-only) to peek at NODE_ENV
 * and DEPLOY_ID from `.env.example` / `.env` so the full candidate list can
 * be built before any file touches `process.env`.
 *
 * @module src/server/env.js
 * @namespace UnderpostEnvLoader
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';

/**
 * Loads environment variables following the priority chain.
 *
 * @param {object} [options]
 * @param {string} [options.deployId] - Deploy ID used to resolve priority-3 path.
 * @param {string} [options.nodeEnv]  - Explicit NODE_ENV override (defaults to
 *        `process.env.NODE_ENV`).
 * @memberof UnderpostEnvLoader
 */
const loadEnv = (options = {}) => {
  // Apply explicit overrides first (priority 1).
  if (options.nodeEnv) process.env.NODE_ENV = options.nodeEnv;
  if (options.deployId) process.env.DEPLOY_ID = options.deployId;

  // --- Bootstrap: discover NODE_ENV and DEPLOY_ID without touching process.env ---
  const bootstrap = {};
  for (const p of ['./.env.example', './.env']) {
    if (fs.existsSync(p)) Object.assign(bootstrap, dotenv.parse(fs.readFileSync(p)));
  }

  const nodeEnv = process.env.NODE_ENV || bootstrap.NODE_ENV;
  const deployId = process.env.DEPLOY_ID || bootstrap.DEPLOY_ID;

  // --- Build candidate list from HIGHEST to LOWEST priority ---
  // dotenv's default (no-override) mode: first value set for each key wins.
  // process.env values from the shell are already present, so no file can
  // overwrite them.
  const candidates = [];

  if (nodeEnv) candidates.push(`./.env.${nodeEnv}`);
  if (deployId && nodeEnv) candidates.push(`./engine-private/conf/${deployId}/.env.${nodeEnv}`);
  candidates.push('./.env');
  candidates.push('./.env.example');

  // --- Single pass: first-loaded value for each key wins ---
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
};

export { loadEnv };
