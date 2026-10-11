'use strict';

/**
 * @module test/support/process
 * @description Tells a suite whether a process it started still runs. A killed orphan stays a zombie
 * where PID 1 does not reap it, as in the CI container, so a zombie counts as dead.
 */

import fs from 'fs-extra';

/**
 * @param {number} pid Process id.
 * @returns {boolean} Whether the process exists and is not a zombie.
 */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return !fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').pop().startsWith('Z');
  } catch {
    return true;
  }
};

export { alive };
