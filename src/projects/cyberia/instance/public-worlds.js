/**
 * The data of the Cyberia public website. The build renders it into the static landing page and
 * writes the world thumbnails beside the page, so the page asks no service at request time.
 *
 * @module src/projects/cyberia/instance/public-worlds.js
 * @namespace CyberiaPublicWorlds
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { contentArtifact, contentLockEntry, deploymentRoot } from '../content/content-artifact.js';
import { RELEASE_CONTENT } from '../content/release-content.js';
import { gameOrigins } from '../runtime/game-origins.js';
import { DOMAIN_HOSTS } from '../stack/domain-ownership.js';
import { fileFromBackup } from './instance-backup.js';
import { CONTENT_CODE_PATTERN } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { SOURCE_LOCK_FILE, readSourceLockFile, verifyLockedSource } from '../../../server/release/source-lock.js';
import { loggerFactory } from '../../../server/ops/logger.js';

const logger = loggerFactory(import.meta);

/** The client of the Cyberia public website. */
export const PUBLIC_SITE_CLIENT = 'cyberia-public';

/** The content status of a world the public website lists. */
export const LISTED_STATUS = 'published';

/** The directory of the world images, under the root of the public client. */
const IMAGE_DIRECTORY = 'worlds';

/** The widths of the smaller copies of a thumbnail, for the `srcset` of its image. */
const THUMBNAIL_WIDTHS = Object.freeze([480]);

/** The image formats a thumbnail may have, and the file extension of each. */
const IMAGE_EXTENSIONS = Object.freeze({ png: 'png', jpeg: 'jpg', webp: 'webp' });

/** The public origin of an ecosystem domain of the deploy. */
const publicSiteOf = (domain) =>
  `https://${Object.keys(DOMAIN_HOSTS).find((host) => DOMAIN_HOSTS[host].domain === domain)}`;

/**
 * The thumbnail of a world as image files: the File its record names as `thumbnail`, matched on
 * `_id` in the files of its instance, and a smaller copy for each width below its own. Each name
 * carries the digest of the thumbnail, so a changed thumbnail gets new names.
 * @param {string} instanceDir - The instance directory of the artifact.
 * @param {{code: string, thumbnail?: string}} record - The instance record.
 * @returns {Promise<{src: string, width: number, height: number, srcset: Array<{file: string, width: number}>,
 *   files: Object<string, Buffer>}|null>} Null when the record names none.
 * @throws {Error} When the named File is missing or is no PNG, JPEG or WebP image.
 * @memberof CyberiaPublicWorlds
 */
export const worldThumbnail = async (instanceDir, record) => {
  if (!record.thumbnail) return null;
  const filesDir = path.join(instanceDir, 'files');
  const document = (fs.existsSync(filesDir) ? fs.readdirSync(filesDir) : [])
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(filesDir, name), 'utf8')))
    .find((file) => String(file._id) === String(record.thumbnail));
  if (!document) throw new Error(`World ${record.code} names thumbnail ${record.thumbnail}, which its files lack`);
  const { data } = fileFromBackup(document);
  const { format, width, height } = await sharp(data)
    .metadata()
    .catch(() => ({}));
  const extension = IMAGE_EXTENSIONS[format];
  if (!extension) throw new Error(`The thumbnail of world ${record.code} is no PNG, JPEG or WebP image`);
  const digest = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  const fileOf = (size) => `${IMAGE_DIRECTORY}/${record.code}.${digest}.${size}.${extension}`;
  const sizes = [...THUMBNAIL_WIDTHS.filter((size) => size < width), width];
  const files = {};
  for (const size of sizes)
    files[fileOf(size)] = size === width ? data : await sharp(data).resize({ width: size }).toFormat(format).toBuffer();
  return {
    src: fileOf(width),
    width,
    height,
    srcset: sizes.map((size) => ({ file: fileOf(size), width: size })),
    files,
  };
};

/**
 * The listed worlds of the released instance records, in release order. Each one enters through
 * the launch bridge of the services host, which takes a world code and never a URL.
 * @param {Array<{record: Object, thumbnail?: Object|null}>} released - Each released record and its thumbnail images.
 * @param {string} services - The services origin.
 * @returns {Array<{code: string, name: string, description: string, href: string,
 *   thumbnail?: {src: string, width: number, height: number, srcset: Array<{file: string, width: number}>}}>}
 * @throws {Error} When a listed world has an invalid code, name or description.
 * @memberof CyberiaPublicWorlds
 */
export const listedWorlds = (released, services) =>
  released
    .filter(({ record }) => record?.status === LISTED_STATUS)
    .map(({ record, thumbnail }) => {
      const { code, name, description = '' } = record;
      if (!CONTENT_CODE_PATTERN.test(`${code ?? ''}`)) throw new Error(`Listed world code "${code}" is invalid`);
      if (typeof name !== 'string' || !name.trim()) throw new Error(`Listed world ${code} has no name`);
      if (typeof description !== 'string') throw new Error(`Listed world ${code} has an invalid description`);
      return {
        code,
        name: name.trim(),
        description: description.trim(),
        href: `${services}/launch?world=${encodeURIComponent(code)}`,
        ...(thumbnail
          ? {
              thumbnail: {
                src: thumbnail.src,
                width: thumbnail.width,
                height: thumbnail.height,
                srcset: thumbnail.srcset,
              },
            }
          : undefined),
      };
    });

/**
 * Each released world of the content artifact: its instance record, and the images of its thumbnail
 * when the world is listed.
 * @param {ReturnType<typeof contentArtifact>} artifact
 * @returns {Promise<Array<{record: Object, thumbnail: Object|null}>>}
 * @throws {Error} When the artifact lacks a released world.
 */
const releasedWorlds = (artifact) =>
  Promise.all(
    RELEASE_CONTENT.instances.map(async ({ instanceCode }) => {
      if (!artifact.manifest.instances.includes(instanceCode))
        throw new Error(`The content artifact lacks the released world ${instanceCode}`);
      const instanceDir = artifact.instanceDir(instanceCode);
      const record = JSON.parse(fs.readFileSync(path.join(instanceDir, 'cyberia-instance.json'), 'utf8'));
      return { record, thumbnail: record.status === LISTED_STATUS ? await worldThumbnail(instanceDir, record) : null };
    }),
  );

/**
 * Where the content artifact comes from: its source, version, revision, digest and schema, and
 * whether the deployment lock pins it. A production build reads only the locked artifact; a
 * development build may read a newer one, and says so.
 * @param {Object} manifest - Artifact manifest.
 * @param {boolean} development - A development build.
 * @returns {{repository: string, contentVersion: string, sourceRevision: string, contentDigest: string,
 *   schemaVersion: number, lock: 'locked'|'unlocked'|'none'}}
 * @throws {Error} When a production build reads an artifact the deployment lock does not pin.
 * @memberof CyberiaPublicWorlds
 */
export const artifactProvenance = (manifest, development) => {
  const { repository, contentVersion, sourceRevision, contentDigest, schemaVersion } = manifest;
  const provenance = { repository, contentVersion, sourceRevision, contentDigest, schemaVersion };
  const lockFile = path.join(deploymentRoot(), SOURCE_LOCK_FILE);
  if (!fs.existsSync(lockFile)) return { ...provenance, lock: 'none' };
  try {
    verifyLockedSource(readSourceLockFile(lockFile), 'cyberia-content', contentLockEntry(manifest));
    return { ...provenance, lock: 'locked' };
  } catch (error) {
    if (!development) throw new Error(`The public website reads no deployed content: ${error.message}`);
    logger.warn('Public worlds read an unlocked content artifact', { reason: error.message });
    return { ...provenance, lock: 'unlocked' };
  }
};

/**
 * The build-time data of the SSR components of a dd-cyberia client: the entry points of the
 * services host and the ecosystem, the listed worlds, and their thumbnail images as files. Nothing
 * for any other client. A missing, invalid or, in production, unlocked content artifact fails the
 * build; a valid one with no listed world gives an empty list. The build log states the source
 * and every count, so an empty page is visible before it is published.
 * @param {{deployId: string, client: string, development: boolean}} params
 * @returns {Promise<{data: {links: Object<string, string>, worlds: Array<Object>}, files: Object<string, Buffer>}|undefined>}
 * @throws {Error} When the content artifact is missing, invalid or unlocked in production.
 * @memberof CyberiaPublicWorlds
 */
export const ssrData = async ({ deployId, client, development }) => {
  if (client !== PUBLIC_SITE_CLIENT) return undefined;
  const { portal: services } = gameOrigins(deployId, development ? 'development' : 'production');
  const artifact = contentArtifact();
  const provenance = artifactProvenance(artifact.manifest, development);
  const released = await releasedWorlds(artifact);
  const worlds = listedWorlds(released, services);
  const files = Object.assign({}, ...released.map(({ thumbnail }) => thumbnail?.files ?? {}));
  const excluded = {};
  for (const { record } of released)
    if (record.status !== LISTED_STATUS)
      excluded[record.status ?? 'none'] = (excluded[record.status ?? 'none'] ?? 0) + 1;
  logger.info('Public worlds', {
    artifact: provenance,
    released: released.length,
    listed: worlds.map(({ code }) => code),
    excluded,
    thumbnails: { worlds: worlds.filter((world) => world.thumbnail).length, files: Object.keys(files).length },
  });
  return {
    data: {
      links: {
        play: `${services}/launch`,
        worlds: `${services}/instance-selection`,
        portal: `${services}/`,
        signUp: `${services}/sign-up`,
        studio: `${services}/cyberia-studio`,
        docs: `${services}/docs`,
        objectLayer: publicSiteOf('object-layer'),
        itemLedger: publicSiteOf('item-ledger'),
      },
      worlds,
    },
    files,
  };
};
