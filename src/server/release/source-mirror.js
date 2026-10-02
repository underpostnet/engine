/**
 * The source mirror: after a release from the private channel, its exact revision is published to
 * the public repository. Fast-forward only: public history is never rewritten, no new commit is
 * made, and nothing is rebuilt.
 *
 * @module src/server/release/source-mirror.js
 * @namespace SourceMirror
 */
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { git } from './release-workspace.js';
import { assertSourceRevision } from './source-release.js';

const isAncestor = (dir, ancestor, descendant) => {
  try {
    git(dir, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
};

const branchTip = (remote, branch) =>
  git(os.tmpdir(), ['ls-remote', remote.url, `refs/heads/${branch}`], remote.env ?? process.env).split(/\s+/)[0] ?? '';

/**
 * Publishes one exact revision from the private repository to the public one. The public branch
 * moves forward to it unless it already holds it; then the public repository must resolve it.
 * @param {Object} params
 * @param {string} params.revision - The released source revision.
 * @param {{url:string, env?:Object}} params.from - The private repository.
 * @param {{url:string, env?:Object}} params.to - The public repository.
 * @param {string} params.branch - The public branch.
 * @returns {{revision:string, branch:string, moved:boolean}}
 * @throws {Error} When the public branch has diverged from the revision, or the push fails.
 * @memberof SourceMirror
 */
export function mirrorRevision({ revision, from, to, branch }) {
  const exact = assertSourceRevision(revision);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-mirror-'));
  try {
    git(dir, ['init', '-q', '--bare']);
    git(dir, ['fetch', '-q', from.url, exact], from.env ?? process.env);
    const tip = branchTip(to, branch);
    if (tip) git(dir, ['fetch', '-q', to.url, `refs/heads/${branch}`], to.env ?? process.env);
    const held = !!tip && isAncestor(dir, exact, tip);
    if (tip && !held && !isAncestor(dir, tip, exact))
      throw new Error(`the public ${branch} at ${tip} has diverged from ${exact}`);
    if (!held) git(dir, ['push', '-q', to.url, `${exact}:refs/heads/${branch}`], to.env ?? process.env);
    const published = branchTip(to, branch);
    git(dir, ['fetch', '-q', to.url, `refs/heads/${branch}`], to.env ?? process.env);
    if (!isAncestor(dir, exact, published)) throw new Error(`the public ${branch} does not hold ${exact}`);
    return { revision: exact, branch, moved: !held };
  } catch (error) {
    throw new Error(
      `Mirror of ${exact} not published: ${`${error?.stderr || error?.message}`.trim().split('\n').pop()}`,
    );
  } finally {
    fs.removeSync(dir);
  }
}
