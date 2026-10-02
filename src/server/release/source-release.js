/**
 * The source of a release: a repository, the channel it was fetched from, and an exact revision.
 * The channel selects only where the revision is fetched; it is provenance, never a lifecycle or
 * a target. Pure: no I/O.
 *
 * @module src/server/release/source-release.js
 * @namespace SourceRelease
 */

/** The source channels. `private` fetches from the private mirror of the same repository. */
export const SOURCE_CHANNELS = Object.freeze(['public', 'private']);

/** The release profiles: what releasing a repository means, and where it runs. */
export const RELEASE_PROFILES = Object.freeze({
  'application-release': 'The engine: source sync, configuration, image rollout and readiness, on its existing flow.',
  'data-release': 'Content built in a Release Job, ingested into its own database, validated and activated.',
  'container-release': 'An OCI image, pulled from CI or built on the host, deployed by digest.',
  'source-sync': 'The exact revision checked out on the node.',
});

/** Release ids name a database suffix and a Job name: lower-case letters, digits and dashes. */
export const RELEASE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

const REVISION_PATTERN = /^[0-9a-f]{40}$/;

/**
 * A valid release id, or an error.
 * @param {string} releaseId
 * @returns {string}
 * @memberof SourceRelease
 */
export function assertReleaseId(releaseId) {
  const id = String(releaseId ?? '').trim();
  if (!RELEASE_ID_PATTERN.test(id))
    throw new Error(`Invalid release id "${releaseId}": use lower-case letters, digits and dashes`);
  return id;
}

/**
 * A valid source channel, or an error.
 * @param {string} channel
 * @returns {string}
 * @memberof SourceRelease
 */
export function assertSourceChannel(channel) {
  if (!SOURCE_CHANNELS.includes(channel))
    throw new Error(`Invalid source channel "${channel}": use ${SOURCE_CHANNELS.join(' or ')}`);
  return channel;
}

/**
 * An exact source revision, or an error: never a branch or another moving reference.
 * @param {string} revision
 * @returns {string}
 * @memberof SourceRelease
 */
export function assertSourceRevision(revision) {
  const value = String(revision ?? '').trim();
  if (!REVISION_PATTERN.test(value))
    throw new Error(`Invalid source revision "${revision}": give the exact 40-character commit id`);
  return value;
}
