/**
 * The local dd-cyberia Docker stack: the dev images of engine-cyberia, cyberia-server and
 * cyberia-client, built from one source, and the compose stack run on them. Nothing is published.
 *
 *   local  the working trees of this workspace: the engine, the deployment, the content artifact
 *          and the game checkouts.
 *   clone  the repositories of a source channel: the deployment at its branch tip, every other
 *          repository at the revision its lock pins.
 *
 * @module src/projects/cyberia/local-stack.js
 * @namespace CyberiaLocalStack
 */

import fs from 'fs-extra';
import nodePath from 'path';
import Underpost from '../../index.js';
import { API_BASE_PATH } from '../../server/domain/api-contract.js';
import { git } from '../../server/release/release-workspace.js';
import { openContentArtifact } from './content-artifact.js';
import { SERVER_READY_PATH, STACK_IMAGES } from './compose-stack.js';
import { RELEASE_CONTENT } from './release-content.js';

/**
 * The sources an image build can take.
 * @memberof CyberiaLocalStack
 */
const STACK_SOURCES = Object.freeze(['local', 'clone']);

/**
 * The images of the stack, in build order.
 * @memberof CyberiaLocalStack
 */
const STACK_IMAGE_IDS = Object.freeze(Object.keys(STACK_IMAGES));

/**
 * The work directory of the local stack: build contexts, clones and image archives.
 * @memberof CyberiaLocalStack
 */
const STACK_WORKDIR = nodePath.resolve('build', 'dev-env');

/**
 * @param {string} source
 * @returns {string} The source.
 * @throws {Error} When the source is unknown.
 * @memberof CyberiaLocalStack
 */
const assertStackSource = (source) => {
  if (!STACK_SOURCES.includes(source)) throw new Error(`--source is ${STACK_SOURCES.join(' or ')}, not "${source}"`);
  return source;
};

/**
 * @param {string[]} ids
 * @returns {string[]} The ids, or every stack image when none is named.
 * @throws {Error} When an id names no stack image.
 * @memberof CyberiaLocalStack
 */
const assertStackImages = (ids) => {
  const unknown = ids.filter((id) => !STACK_IMAGE_IDS.includes(id));
  if (unknown.length) throw new Error(`${unknown.join(', ')}: not a stack image; use ${STACK_IMAGE_IDS.join(', ')}`);
  return ids.length ? ids : [...STACK_IMAGE_IDS];
};

/**
 * The stage every stack Dockerfile builds its image in. Its tagged image is the build cache.
 * @memberof CyberiaLocalStack
 */
const STACK_BUILDER_STAGE = 'builder';

/**
 * The local dev image of a stack image: the name its build gives it, the reference compose runs, and
 * the name of its builder stage, which keeps one tag across versions.
 * @param {string} id
 * @returns {{name:string, repository:string, tag:string, builder:string}}
 * @memberof CyberiaLocalStack
 */
const localImage = (id) => ({
  name: `${id}-dev:${Underpost.version}`,
  repository: `localhost/${id}-dev`,
  tag: Underpost.version,
  builder: `${id}-dev:${STACK_BUILDER_STAGE}`,
});

/**
 * The compose variables that run the stack on the local dev images. They go in the process
 * environment of the compose command, which wins over compose.env.
 * @returns {Object<string,string>}
 * @memberof CyberiaLocalStack
 */
const localImageEnv = () =>
  Object.fromEntries(
    Object.entries(STACK_IMAGES).flatMap(([id, prefix]) => {
      const { repository, tag } = localImage(id);
      return [
        [`${prefix}_IMAGE`, repository],
        [`${prefix}_TAG`, tag],
      ];
    }),
  );

/**
 * The build args of an engine image that clones its sources: the engine repository of the channel,
 * and the channel's repositories of the deployment and the content.
 * @param {object} params
 * @param {string} params.channel - `public` or `private`.
 * @param {string} params.deploymentRepository - The public deployment repository, `owner/repo`.
 * @param {string} params.contentRepository - The public content repository, `owner/repo`.
 * @returns {Object<string,string>}
 * @memberof CyberiaLocalStack
 */
const engineCloneArgs = ({ channel, deploymentRepository, contentRepository }) => {
  const [owner] = deploymentRepository.split('/');
  return {
    CYBERIA_SOURCE: 'clone',
    ENGINE_REPOSITORY: `${owner}/${Underpost.repo.engineRepoFactory('dd-cyberia', { test: channel === 'private' })}`,
    DEPLOYMENT_REPOSITORY: Underpost.repo.sourceRepoFactory(deploymentRepository, channel),
    CONTENT_REPOSITORY: Underpost.repo.sourceRepoFactory(contentRepository, channel),
  };
};

/**
 * Copies the tracked and untracked files of a working tree; the ignored ones stay out.
 * @param {string} from - A git working tree.
 * @param {string} to
 * @memberof CyberiaLocalStack
 */
const copyWorkingTree = (from, to) => {
  for (const file of git(from, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0'))
    if (file && fs.existsSync(nodePath.join(from, file)))
      fs.copySync(nodePath.join(from, file), nodePath.join(to, file));
};

/**
 * Stages the local sources of the engine image under `<context>/source`: the engine and deployment
 * working trees, and the content artifact once it opens intact.
 * @param {object} params
 * @param {string} params.context - The build context.
 * @param {string} params.engineRoot
 * @param {string} params.deploymentRoot
 * @param {string} params.contentRoot
 * @returns {string} The staged source directory.
 * @memberof CyberiaLocalStack
 */
const stageLocalEngineSource = ({ context, engineRoot, deploymentRoot, contentRoot }) => {
  openContentArtifact(contentRoot);
  const source = nodePath.join(context, 'source');
  fs.removeSync(source);
  copyWorkingTree(engineRoot, nodePath.join(source, 'engine'));
  copyWorkingTree(deploymentRoot, nodePath.join(source, 'cyberia-deployment'));
  fs.copySync(nodePath.join(contentRoot, 'dist'), nodePath.join(source, 'cyberia-content', 'dist'));
  return source;
};

/**
 * The requests that show the running stack serves: the engine, then each world's client and server,
 * by the gateway names.
 * @returns {Array<{name:string, url:string}>}
 * @memberof CyberiaLocalStack
 */
const stackProbes = () => [
  { name: 'engine-cyberia', url: `http://engine-cyberia/${API_BASE_PATH}/cyberia-content-release/active` },
  ...RELEASE_CONTENT.instances.flatMap(({ path, instanceCode }) => {
    const prefix = path === '/' ? '' : path;
    return [
      { name: `cyberia-client ${instanceCode}`, url: `http://cyberia-client${prefix}/` },
      { name: `cyberia-server ${instanceCode}`, url: `http://cyberia-server${prefix}${SERVER_READY_PATH}` },
    ];
  }),
];

export {
  STACK_BUILDER_STAGE,
  STACK_IMAGE_IDS,
  STACK_SOURCES,
  STACK_WORKDIR,
  assertStackImages,
  assertStackSource,
  copyWorkingTree,
  engineCloneArgs,
  localImage,
  localImageEnv,
  stackProbes,
  stageLocalEngineSource,
};
