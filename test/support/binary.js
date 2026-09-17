'use strict';

/**
 * @module test/support/binary
 * @description Locates an external program a suite may drive — `mongod`, `firefox` — so the
 * suite can skip itself where the program is absent. Walks `PATH` in-process rather than
 * shelling out to `which`, which the Rocky CI container does not install.
 */

import nodePath from 'path';
import fs from 'fs-extra';

/**
 * @param {string} name Program name as it would be typed at a shell prompt.
 * @param {string} [envVar] Environment variable that names the binary outright, taking
 * precedence over `PATH` when it points at an existing file.
 * @returns {string|null} Absolute path of the first executable match, or `null`.
 */
const findBinary = (name, envVar) => {
  if (envVar && process.env[envVar] && fs.existsSync(process.env[envVar])) return process.env[envVar];
  for (const dir of (process.env.PATH || '').split(nodePath.delimiter)) {
    if (!dir) continue;
    const candidate = nodePath.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // not here — keep walking PATH
    }
  }
  return null;
};

export { findBinary };
