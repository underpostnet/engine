/**
 * The release content of dd-cyberia: what a release carries — the foundation, its sagas and the
 * worlds it serves, one instance code per public path — and the operations that check, select and
 * apply it. Importing this module runs nothing.
 * @module src/projects/cyberia/release-content.js
 * @namespace CyberiaReleaseContent
 */

import { normalizeInstanceTopology } from '../../server/runtime/conf.js';
import { DEFAULT_INSTANCE_CODE } from '../../client/components/cyberia/SharedDefaultsCyberia.js';

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The content set of a release. `/` serves the default world, which the portal reads too.
 * @type {Readonly<{foundation: true, sagas: ReadonlyArray<string>, instances: ReadonlyArray<Readonly<{path:string, instanceCode:string}>>}>}
 * @memberof CyberiaReleaseContent
 */
const RELEASE_CONTENT = Object.freeze({
  foundation: true,
  sagas: Object.freeze(['amethyst-strata-expansion']),
  instances: Object.freeze(
    [
      { path: '/', instanceCode: DEFAULT_INSTANCE_CODE },
      { path: '/test', instanceCode: 'test' },
    ].map((instance) => Object.freeze(instance)),
  ),
});

/**
 * Checks a release content set: the foundation, valid saga codes, and instances with `/` first,
 * a valid path and a valid code each, none twice.
 * @param {Object} [content=RELEASE_CONTENT]
 * @returns {Object} The same content set.
 * @throws {Error} On the first defect.
 * @memberof CyberiaReleaseContent
 */
const validateReleaseContent = (content = RELEASE_CONTENT) => {
  if (content.foundation !== true) throw new Error('A release carries the foundation');
  const assertCodes = (kind, codes) => {
    const invalid = codes.find((code) => !CODE_PATTERN.test(`${code ?? ''}`));
    if (invalid !== undefined) throw new Error(`Invalid release ${kind} code "${invalid}"`);
    if (new Set(codes).size !== codes.length) throw new Error(`The release names one ${kind} code twice`);
  };
  assertCodes('saga', content.sagas);
  if (content.instances[0]?.path !== '/') throw new Error('The first release instance must serve /');
  normalizeInstanceTopology({ variants: content.instances.map(({ path }) => path) }, 'release instances');
  assertCodes(
    'instance',
    content.instances.map(({ instanceCode }) => instanceCode),
  );
  return content;
};

/**
 * The instance codes a release carries: the named ones, else the release instances.
 * @param {string[]} [requested=[]] - Codes the caller names.
 * @param {Object} [content=RELEASE_CONTENT]
 * @returns {string[]}
 * @memberof CyberiaReleaseContent
 */
const releaseInstanceCodes = (requested = [], content = RELEASE_CONTENT) =>
  requested.length > 0 ? [...requested] : content.instances.map(({ instanceCode }) => instanceCode);

/**
 * What a release imports from a content artifact: the release sagas and the selected instances.
 * Any other saga or instance of the artifact stays out.
 * @param {Object} params
 * @param {{sagas: string[], instances: string[]}} params.manifest - The content artifact manifest.
 * @param {string[]} [params.instances=[]] - Instance codes to import; the release instances when empty.
 * @param {Object} [params.content=RELEASE_CONTENT]
 * @returns {{sagas: string[], instances: string[]}}
 * @throws {Error} When the content set is invalid, or the artifact lacks a selected saga or instance.
 * @memberof CyberiaReleaseContent
 */
const selectReleaseContent = ({ manifest, instances = [], content = RELEASE_CONTENT }) => {
  validateReleaseContent(content);
  const held = (kind, codes, available) => {
    const missing = codes.filter((code) => !available.includes(code));
    if (missing.length > 0)
      throw new Error(
        `The content artifact holds no ${kind} ${missing.join(', ')}; it holds ${available.join(', ') || 'none'}`,
      );
    return codes;
  };
  return {
    sagas: held('saga', [...content.sagas], manifest.sagas),
    instances: held('instance', releaseInstanceCodes(instances, content), manifest.instances),
  };
};

/**
 * The code of the world a path serves.
 * @param {string} path - A release path.
 * @returns {string}
 * @throws {Error} When no release instance serves the path.
 * @memberof CyberiaReleaseContent
 */
const releaseInstanceCode = (path) => {
  const instance = RELEASE_CONTENT.instances.find((entry) => entry.path === path);
  if (!instance) throw new Error(`No dd-cyberia release instance serves ${path}`);
  return instance.instanceCode;
};

/**
 * Sets the release paths as the variants of each named instance family.
 * @param {Array<object>} confInstances - The raw entries of conf.instances.json.
 * @param {string[]} familyIds - The template ids to set.
 * @returns {Array<object>} New entries.
 * @throws {Error} When the release content is invalid, or the conf declares no entry for a family.
 * @memberof CyberiaReleaseContent
 */
const withReleaseVariants = (confInstances, familyIds) => {
  validateReleaseContent();
  const missing = familyIds.filter((id) => !confInstances.some((entry) => entry.id === id));
  if (missing.length) throw new Error(`conf.instances.json declares no ${missing.join(', ')}`);
  const variants = RELEASE_CONTENT.instances.map(({ path }) => path);
  return confInstances.map((entry) =>
    familyIds.includes(entry.id) ? { ...entry, multiInstance: { variants } } : entry,
  );
};

/**
 * Builds the runtime env of one game instance: the instance keys its runtime reads, from the world
 * its path serves. Other runtimes keep their env.
 * @param {object} context
 * @param {{runtime?:string, path?:string}} [context.instance] - Expanded instance descriptor.
 * @param {Object<string,string>} [context.env] - Canonical env values.
 * @returns {Object<string,string>}
 * @memberof CyberiaReleaseContent
 */
function buildCyberiaMmoInstanceEnv({ instance = {}, env = {} }) {
  if (instance.runtime === 'cyberia-server')
    return { ...env, INSTANCE_CODE: releaseInstanceCode(instance.path), CYBERIA_BASE_PATH: instance.path };
  if (instance.runtime === 'cyberia-client')
    return {
      ...env,
      CYBERIA_INSTANCE_CODE: releaseInstanceCode(instance.path),
      CYBERIA_DEFAULT_INSTANCE: RELEASE_CONTENT.instances[0].instanceCode,
      CYBERIA_BASE_PATH: instance.path,
    };
  return { ...env };
}

export {
  RELEASE_CONTENT,
  buildCyberiaMmoInstanceEnv,
  releaseInstanceCode,
  releaseInstanceCodes,
  selectReleaseContent,
  validateReleaseContent,
  withReleaseVariants,
};
