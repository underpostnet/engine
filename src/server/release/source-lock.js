/**
 * The source lock: the exact revision of every repository a deployment ships, and the identity of
 * the artifact a repository builds. The deployment repository holds it; no repository pins itself.
 *
 * @module src/server/release/source-lock.js
 * @namespace SourceLock
 */
import fs from 'fs-extra';
import { assertSourceRevision } from './source-release.js';

/** The file a deployment repository holds its lock in. */
export const SOURCE_LOCK_FILE = 'underpost.lock.json';

/** The version of the lock document. */
export const SOURCE_LOCK_VERSION = 1;

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const REPOSITORY_PATTERN = /^[^/\s]+\/[^/\s]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const assertKnownFields = (at, value, fields) => {
  const unknown = Object.keys(value).filter((field) => !fields.includes(field));
  if (unknown.length) throw new Error(`${at}: unknown field ${unknown.join(', ')}`);
};

/**
 * One locked source in canonical form.
 * @param {string} name - Repository name.
 * @param {Object} entry - `{repository, revision, artifact?: {version, digest}}`.
 * @returns {{repository:string, revision:string, artifact?:{version:string, digest:string}}}
 * @throws {Error} Naming the source and its first invalid field.
 * @memberof SourceLock
 */
export function lockedSourceFactory(name, entry) {
  const at = `${SOURCE_LOCK_FILE} ${name}`;
  if (!NAME_PATTERN.test(name)) throw new Error(`${SOURCE_LOCK_FILE}: "${name}" is not a repository name`);
  if (!isPlainObject(entry)) throw new Error(`${at} is not an object`);
  assertKnownFields(at, entry, ['repository', 'revision', 'artifact']);
  const { repository, revision, artifact } = entry;
  if (!REPOSITORY_PATTERN.test(repository ?? '') || repository.endsWith('-private'))
    throw new Error(`${at}: repository is not a public owner/name`);
  let exact;
  try {
    exact = assertSourceRevision(revision);
  } catch (error) {
    throw new Error(`${at}: ${error.message}`);
  }
  if (artifact === undefined) return { repository, revision: exact };
  if (!isPlainObject(artifact)) throw new Error(`${at}: artifact is not an object`);
  assertKnownFields(`${at} artifact`, artifact, ['version', 'digest']);
  if (!VERSION_PATTERN.test(artifact.version ?? '')) throw new Error(`${at}: artifact version is not a version`);
  if (!DIGEST_PATTERN.test(artifact.digest ?? '')) throw new Error(`${at}: artifact digest is not a sha256 digest`);
  return { repository, revision: exact, artifact: { version: artifact.version, digest: artifact.digest } };
}

/**
 * Reads a lock document: every source checked, in name order.
 * @param {Object} document
 * @returns {{lockVersion:number, sources:Object<string,Object>}}
 * @throws {Error} Naming the first invalid field.
 * @memberof SourceLock
 */
export function readSourceLock(document) {
  if (!isPlainObject(document)) throw new Error(`${SOURCE_LOCK_FILE} is not an object`);
  assertKnownFields(SOURCE_LOCK_FILE, document, ['lockVersion', 'sources']);
  if (document.lockVersion !== SOURCE_LOCK_VERSION)
    throw new Error(`${SOURCE_LOCK_FILE}: lockVersion ${document.lockVersion} is not ${SOURCE_LOCK_VERSION}`);
  if (!isPlainObject(document.sources) || !Object.keys(document.sources).length)
    throw new Error(`${SOURCE_LOCK_FILE} pins no source`);
  return {
    lockVersion: SOURCE_LOCK_VERSION,
    sources: Object.fromEntries(
      Object.keys(document.sources)
        .sort()
        .map((name) => [name, lockedSourceFactory(name, document.sources[name])]),
    ),
  };
}

/**
 * The locked source of a repository name.
 * @param {Object} lock - {@link readSourceLock} output.
 * @param {string} name
 * @returns {{repository:string, revision:string, artifact?:{version:string, digest:string}}}
 * @throws {Error} When the lock pins no such source.
 * @memberof SourceLock
 */
export function lockedSource(lock, name) {
  const entry = lock.sources[name];
  if (!entry) throw new Error(`${SOURCE_LOCK_FILE} pins no ${name}`);
  return entry;
}

const lockedFields = ({ repository, revision, artifact }) => ({
  repository,
  revision,
  'artifact version': artifact?.version,
  'artifact digest': artifact?.digest,
});

/**
 * Checks that a source is the one the lock pins.
 * @param {Object} lock - {@link readSourceLock} output.
 * @param {string} name
 * @param {Object} source - The source as found, in the form of a locked source.
 * @throws {Error} Naming every field that differs.
 * @memberof SourceLock
 */
export function verifyLockedSource(lock, name, source) {
  const locked = lockedFields(lockedSource(lock, name));
  const found = lockedFields(lockedSourceFactory(name, source));
  const differs = Object.keys(locked).filter((field) => locked[field] !== found[field]);
  if (differs.length)
    throw new Error(
      `${name} is not the locked one: ${differs.map((field) => `${field} ${found[field]} (lock: ${locked[field]})`).join(', ')}`,
    );
}

/**
 * Reads a lock file.
 * @param {string} file
 * @returns {{lockVersion:number, sources:Object<string,Object>}}
 * @memberof SourceLock
 */
export function readSourceLockFile(file) {
  if (!fs.existsSync(file)) throw new Error(`No ${SOURCE_LOCK_FILE} at ${file}`);
  return readSourceLock(fs.readJsonSync(file));
}

/**
 * Writes a lock file in canonical form.
 * @param {string} file
 * @param {Object<string,Object>} sources - Repository name → locked source.
 * @returns {{lockVersion:number, sources:Object<string,Object>}} The lock written.
 * @memberof SourceLock
 */
export function writeSourceLockFile(file, sources) {
  const lock = readSourceLock({ lockVersion: SOURCE_LOCK_VERSION, sources });
  fs.writeJsonSync(file, lock, { spaces: 2 });
  return lock;
}
