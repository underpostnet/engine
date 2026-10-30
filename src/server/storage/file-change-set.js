/**
 * File change sets: a group of file writes that lands whole or not at all.
 *
 * Each new content is staged beside its target, and a journal records the set before the first
 * target changes. Each target then moves to a backup and its staged file takes its place by rename.
 * A failure puts every backup back and removes every file the set created. A process that stops
 * part way leaves its journal, and {@link recoverChangeSets} completes the rollback on the next run.
 *
 * @module src/server/storage/file-change-set.js
 * @namespace FileChangeSet
 */
import fs from 'fs-extra';
import nodePath from 'node:path';
import { activeExecutionProfile } from '../build/execution.js';
import { loggerFactory } from '../ops/logger.js';

const logger = loggerFactory(import.meta);

const JOURNAL_DIRECTORY = './.underpost/change-sets';

const sameContent = (path, content) => fs.existsSync(path) && fs.readFileSync(path).equals(Buffer.from(content));

/**
 * One file change: the target path, its new content, and a one-line reason for the plan.
 * @param {string} path - Target file.
 * @param {string|Buffer} content - New content.
 * @param {string} [summary] - What the change does, for the plan. Never the content itself.
 * @returns {{path: string, content: string|Buffer, summary: string}} The change.
 * @memberof FileChangeSet
 */
const fileChange = (path, content, summary = '') => ({ path: nodePath.normalize(path), content, summary });

/**
 * One JSON file change, serialized the way the private configuration tree stores its files.
 * @param {string} path - Target file.
 * @param {object} value - New value.
 * @param {string} [summary] - What the change does.
 * @returns {{path: string, content: string, summary: string}} The change.
 * @memberof FileChangeSet
 */
const jsonFileChange = (path, value, summary = '') => fileChange(path, JSON.stringify(value, null, 4), summary);

/**
 * The plan of a change set: the action each change takes against the current tree. A change that
 * leaves its file as it is plans `unchanged`, so a repeated run plans nothing to write.
 * @param {Array<{path: string, content: string|Buffer, summary: string}>} changes - The change set.
 * @returns {Array<{path: string, action: 'create'|'update'|'unchanged', summary: string}>} The plan.
 * @memberof FileChangeSet
 */
const changeSetPlan = (changes) =>
  changes.map(({ path, content, summary }) => ({
    path,
    action: !fs.existsSync(path) ? 'create' : sameContent(path, content) ? 'unchanged' : 'update',
    summary,
  }));

const journalPath = (id) => nodePath.join(JOURNAL_DIRECTORY, `${id}.json`);

const rollback = (entries) => {
  for (const { path, stage, backup, created } of entries) {
    fs.removeSync(stage);
    if (fs.existsSync(backup)) fs.renameSync(backup, path);
    else if (created) fs.removeSync(path);
  }
};

/**
 * Completes the rollback of every change set an interrupted process left.
 * @returns {string[]} The targets restored or removed.
 * @memberof FileChangeSet
 */
const recoverChangeSets = () => {
  if (!fs.existsSync(JOURNAL_DIRECTORY)) return [];
  const recovered = [];
  for (const name of fs.readdirSync(JOURNAL_DIRECTORY).filter((entry) => entry.endsWith('.json'))) {
    const journal = nodePath.join(JOURNAL_DIRECTORY, name);
    const entries = fs.readJsonSync(journal);
    rollback(entries);
    recovered.push(...entries.map(({ path }) => path));
    fs.removeSync(journal);
  }
  if (recovered.length) logger.warn('Rolled back an interrupted change set', { files: recovered });
  return recovered;
};

/**
 * Applies a change set. Files the plan marks `unchanged` are not touched. Under an execution
 * profile that permits no filesystem writes, nothing is written and the plan is returned as intent.
 * @param {Array<{path: string, content: string|Buffer, summary: string}>} changes - The change set.
 * @param {object} [options]
 * @param {boolean} [options.dryRun] - Returns the plan without writing.
 * @returns {{applied: boolean, plan: Array<object>}} Whether the set was written, and its plan.
 * @throws {Error} When a write fails; every target is back in its previous state.
 * @memberof FileChangeSet
 */
const applyChangeSet = (changes, { dryRun = false } = {}) => {
  const plan = changeSetPlan(changes);
  const pending = changes.filter((_, index) => plan[index].action !== 'unchanged');
  const profile = activeExecutionProfile();
  if (dryRun || pending.length === 0 || !profile.permits.includes('fs')) {
    if (!dryRun && pending.length > 0) logger.info(`[${profile.name}] elided change set`, { files: pending.length });
    return { applied: false, plan };
  }

  recoverChangeSets();
  const id = `${process.pid}-${Date.now()}`;
  const entries = pending.map(({ path }) => ({
    path,
    stage: `${path}.stage-${id}`,
    backup: `${path}.backup-${id}`,
    created: !fs.existsSync(path),
  }));
  try {
    pending.forEach(({ path, content }, index) => {
      fs.mkdirpSync(nodePath.dirname(path));
      fs.writeFileSync(entries[index].stage, content);
    });
    fs.outputJsonSync(journalPath(id), entries);
    for (const { path, stage, backup, created } of entries) {
      if (!created) fs.renameSync(path, backup);
      fs.renameSync(stage, path);
    }
    pending.forEach(({ path, content }) => {
      if (!sameContent(path, content)) throw new Error(`Change set verification failed: ${path}`);
    });
  } catch (error) {
    rollback(entries);
    fs.removeSync(journalPath(id));
    throw error;
  }
  // The journal removal is the commit point; a backup left after it is an orphan, never restored.
  fs.removeSync(journalPath(id));
  for (const { backup } of entries) fs.removeSync(backup);
  return { applied: true, plan };
};

export { applyChangeSet, changeSetPlan, fileChange, jsonFileChange, recoverChangeSets };
