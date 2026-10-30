/**
 * Directory publication: an artifact is generated beside its published directory, checked, and only
 * then replaces it.
 *
 * Staging, backup and target share one parent, so every move is a rename on one filesystem. A first
 * publication is one rename, so the directory appears whole. A replacement is two renames: the
 * published directory moves to a backup, then the staging directory moves in. Between them the path
 * is absent, so a reader can miss it for that moment: publication recovers from a crash, but its
 * visibility is not atomic. A failed second rename moves the backup back, and
 * {@link recoverPublication} restores a backup an interrupted process left. The caller holds the
 * artifact lock of the target for the whole cycle.
 *
 * @module src/server/build/publication.js
 * @namespace Publication
 */
import fs from 'fs-extra';
import nodePath from 'node:path';

const siblingFactory = (target, kind) =>
  nodePath.join(nodePath.dirname(target), `.${kind}-${nodePath.basename(target)}-${process.pid}-${Date.now()}`);

const LEFTOVER = /^\.(staging|backup)-(.+)-\d+-\d+$/;

/**
 * A new staging directory for a target, beside it.
 * @param {string} target - Published directory.
 * @returns {string} Path of the staging directory, not yet created.
 * @memberof Publication
 */
export const stagingDirectoryFactory = (target) => siblingFactory(target, 'staging');

/**
 * Repairs what an interrupted cycle left beside a target: a backup comes back when the target is
 * missing and is dropped otherwise, and a staging directory is dropped.
 * @param {string} target - Published directory.
 * @returns {{restored: boolean, removed: string[]}} What the repair did.
 * @memberof Publication
 */
export const recoverPublication = (target) => {
  const parent = nodePath.dirname(target);
  const name = nodePath.basename(target);
  const result = { restored: false, removed: [] };
  if (!fs.existsSync(parent)) return result;
  const leftovers = fs.readdirSync(parent).filter((entry) => LEFTOVER.exec(entry)?.[2] === name);
  for (const entry of leftovers) {
    const path = nodePath.join(parent, entry);
    if (LEFTOVER.exec(entry)[1] === 'backup' && !fs.existsSync(target)) {
      fs.renameSync(path, target);
      result.restored = true;
      continue;
    }
    fs.removeSync(path);
    result.removed.push(entry);
  }
  return result;
};

/**
 * Repairs every interrupted cycle in a directory, as {@link recoverPublication} does for each target
 * that a staging or backup directory names.
 * @param {string} parent - Directory that holds the published directories.
 * @returns {{restored: string[], removed: string[]}} Targets restored, and leftovers removed.
 * @memberof Publication
 */
export const recoverPublications = (parent) => {
  const result = { restored: [], removed: [] };
  if (!fs.existsSync(parent)) return result;
  const targets = new Set(
    fs
      .readdirSync(parent)
      .map((entry) => LEFTOVER.exec(entry)?.[2])
      .filter(Boolean),
  );
  for (const name of targets) {
    const { restored, removed } = recoverPublication(nodePath.join(parent, name));
    if (restored) result.restored.push(name);
    result.removed.push(...removed);
  }
  return result;
};

/**
 * Replaces a published directory with a checked staging directory.
 * @param {object} params
 * @param {string} params.staging - Staging directory, beside the target.
 * @param {string} params.target - Published directory.
 * @returns {{replaced: boolean}} Whether a previous version was replaced.
 * @throws {Error} When a rename fails; the previous version is back in place.
 * @memberof Publication
 */
export const publishDirectory = ({ staging, target }) => {
  const backup = siblingFactory(target, 'backup');
  const replaced = fs.existsSync(target);
  if (replaced) fs.renameSync(target, backup);
  try {
    fs.renameSync(staging, target);
  } catch (error) {
    if (replaced) fs.renameSync(backup, target);
    throw error;
  }
  if (replaced) fs.removeSync(backup);
  return { replaced };
};
