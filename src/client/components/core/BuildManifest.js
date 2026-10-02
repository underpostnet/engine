/**
 * The Underpost Build Manifest on the client: the build and bootstrap metadata of the client build
 * that produced this document. The SSR document inlines it and links the copy the build writes
 * beside the application, under the relation {@link BUILD_MANIFEST_REL}.
 *
 * @module src/client/components/core/BuildManifest.js
 * @namespace PwaBuildManifest
 */

/**
 * The link relation type that names the manifest of an application.
 * @memberof PwaBuildManifest
 */
const BUILD_MANIFEST_REL = 'https://underpost.net/rel/build-manifest';

/**
 * The manifest file, under the application base path.
 * @memberof PwaBuildManifest
 */
const BUILD_MANIFEST_FILE = 'underpost.manifest';

/**
 * The id of the JSON data block that inlines the manifest in an SSR document.
 * @memberof PwaBuildManifest
 */
const BUILD_MANIFEST_ELEMENT_ID = 'underpost-build-manifest';

/**
 * The version of the manifest schema.
 * @memberof PwaBuildManifest
 */
const BUILD_MANIFEST_SCHEMA = 1;

/** The fields every manifest of this schema holds, and their type. */
const REQUIRED_FIELDS = {
  application: 'string',
  version: 'string',
  'build.id': 'string',
  'build.mode': 'string',
  'runtime.basePath': 'string',
  'runtime.apiBasePath': 'string',
};

const deepFreeze = (value) => {
  if (typeof value === 'object' && value !== null) Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

/**
 * Checks a manifest against the schema this client reads, and freezes it.
 * @param {*} value - A parsed manifest.
 * @param {string} source - Where the manifest comes from.
 * @returns {Readonly<Object>}
 * @throws {Error} When the manifest has another schema or lacks a required field.
 * @memberof PwaBuildManifest
 */
const assertBuildManifest = (value, source) => {
  if (value?.schema !== BUILD_MANIFEST_SCHEMA)
    throw new Error(`Build manifest ${source} has schema ${value?.schema}, this client reads ${BUILD_MANIFEST_SCHEMA}`);
  const missing = Object.entries(REQUIRED_FIELDS)
    .filter(([field, type]) => typeof field.split('.').reduce((node, key) => node?.[key], value) !== type)
    .map(([field]) => field);
  if (missing.length) throw new Error(`Build manifest ${source} lacks ${missing.join(', ')}`);
  return deepFreeze(value);
};

let manifest = null;
let linking = null;

/** The resolved manifest: the cached one, else the inline snapshot, parsed once. Null when neither exists. */
const resolvedBuildManifest = () => {
  if (manifest) return manifest;
  const element = document.getElementById(BUILD_MANIFEST_ELEMENT_ID);
  if (!element) return null;
  const source = `#${BUILD_MANIFEST_ELEMENT_ID}`;
  let value;
  try {
    value = JSON.parse(element.textContent);
  } catch (error) {
    throw new Error(`Build manifest ${source} is not JSON: ${error.message}`);
  }
  return (manifest = assertBuildManifest(value, source));
};

/** The manifest the document links. */
const linkedBuildManifest = async () => {
  const link = document.querySelector(`link[rel="${BUILD_MANIFEST_REL}"]`);
  if (!link) throw new Error('The document neither inlines nor links a build manifest');
  const response = await fetch(link.href).catch((error) => {
    throw new Error(`Build manifest ${link.href} is unreachable: ${error.message}`);
  });
  if (!response.ok) throw new Error(`Build manifest ${link.href} answered ${response.status}`);
  return assertBuildManifest(await response.json(), link.href);
};

/**
 * Resolves the build manifest: the inline snapshot, else the linked copy.
 * @returns {Promise<Readonly<Object>>}
 * @throws {Error} When the document has no manifest, the linked copy fails, or the schema does not match.
 * @memberof PwaBuildManifest
 */
const loadBuildManifest = async () =>
  resolvedBuildManifest() ?? (manifest ??= await (linking ??= linkedBuildManifest()));

/**
 * The build manifest of this document: one frozen object.
 * @returns {Readonly<Object>}
 * @throws {Error} Before {@link loadBuildManifest} resolves a document that only links its manifest.
 * @memberof PwaBuildManifest
 */
const buildManifest = () => {
  const resolved = resolvedBuildManifest();
  if (!resolved) throw new Error('The build manifest is not loaded: await loadBuildManifest() first');
  return resolved;
};

/**
 * True for a development build. False until the manifest resolves, so code that runs before the
 * bootstrap can call it.
 * @returns {boolean}
 * @memberof PwaBuildManifest
 */
const developmentBuild = () => resolvedBuildManifest()?.build.mode === 'development';

export {
  BUILD_MANIFEST_ELEMENT_ID,
  BUILD_MANIFEST_FILE,
  BUILD_MANIFEST_REL,
  BUILD_MANIFEST_SCHEMA,
  assertBuildManifest,
  buildManifest,
  developmentBuild,
  loadBuildManifest,
};
