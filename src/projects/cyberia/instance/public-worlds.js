/**
 * The data of the Cyberia public website. The build renders it into the static landing page, so
 * the page holds the published worlds and asks no service at request time.
 *
 * @module src/projects/cyberia/instance/public-worlds.js
 * @namespace CyberiaPublicWorlds
 */
import fs from 'node:fs';
import path from 'node:path';
import { optionalContentArtifact } from '../content/content-artifact.js';
import { RELEASE_CONTENT } from '../content/release-content.js';
import { gameOrigins } from '../runtime/game-origins.js';

/** The client of the Cyberia public website. */
export const PUBLIC_SITE_CLIENT = 'cyberia-public';

/** The content status of a world the public website lists. */
export const LISTED_STATUS = 'published';

/**
 * The listed worlds of the released instance records, in release order. Each one enters through
 * the launch bridge of the services host, which takes a world code and never a URL.
 * @param {Array<{code: string, name: string, description?: string, status?: string}>} records
 * @param {string} services - The services origin.
 * @returns {Array<{code: string, name: string, description: string, href: string}>}
 * @memberof CyberiaPublicWorlds
 */
export const listedWorlds = (records, services) =>
  records
    .filter((record) => record?.status === LISTED_STATUS && record.code)
    .map(({ code, name, description }) => ({
      code,
      name: name || code,
      description: description || '',
      href: `${services}/launch?world=${encodeURIComponent(code)}`,
    }));

/**
 * The instance record of each released world the content artifact holds.
 * @param {ReturnType<typeof optionalContentArtifact>} artifact
 * @returns {Object[]}
 */
const releasedRecords = (artifact) =>
  RELEASE_CONTENT.instances
    .map(({ instanceCode }) => instanceCode)
    .filter((code) => artifact.manifest.instances.includes(code))
    .map((code) => JSON.parse(fs.readFileSync(path.join(artifact.instanceDir(code), 'cyberia-instance.json'), 'utf8')));

/**
 * The build-time data of the SSR components of a dd-cyberia client: the services entry points and
 * the listed worlds for the public website, nothing for any other client.
 * @param {{deployId: string, client: string, development: boolean}} params
 * @returns {{services: string, links: Object<string, string>, worlds: Array<Object>}|undefined}
 * @memberof CyberiaPublicWorlds
 */
export const ssrData = ({ deployId, client, development }) => {
  if (client !== PUBLIC_SITE_CLIENT) return undefined;
  const { portal: services } = gameOrigins(deployId, development ? 'development' : 'production');
  const artifact = optionalContentArtifact();
  return {
    services,
    links: {
      play: `${services}/launch`,
      worlds: `${services}/instance-selection`,
      logIn: `${services}/log-in`,
      signUp: `${services}/sign-up`,
      studio: `${services}/cyberia-studio`,
      docs: `${services}/docs`,
    },
    worlds: artifact ? listedWorlds(releasedRecords(artifact), services) : [],
  };
};
