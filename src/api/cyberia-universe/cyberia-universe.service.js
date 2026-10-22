/**
 * @module src/api/cyberia-universe/cyberia-universe.service.js
 *
 * Universes: their membership, their graph layout and their links.
 *
 * Membership and layout are authored here. The content of each member comes from the served
 * content, and its availability from the server registry; neither changes the universe. A member
 * stays in its universe while its server is offline or a release lacks it.
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { assertOwnerOrAdmin } from '../../server/security/auth.js';
import { apiPathOf } from '../../server/domain/api-contract.js';
import {
  CONTENT_CODE_PATTERN,
  graphLayoutDefect,
  worldPathOf,
  worldPicture,
  worldPreviewPicture,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { liveEndpoints } from '../cyberia-server-registry/cyberia-server-registry.service.js';
import { worldPreviewSize } from '../../projects/cyberia/instance/world-preview.js';
import { entrySpawn } from '../../projects/cyberia/instance/entry-spawn.js';
import { universeWalletDefect } from '../../projects/cyberia/economy/economy-policy.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

const model = (name, options) => DataBaseProviderService.getModel(name, options);

const linkKey = (a, b) => [a, b].sort().join('\u0000');

/**
 * The first defect of a universe topology, or ''.
 * @param {{code: string, instances: Object[], links: Object[]}} universe - In its stored shape.
 * @returns {string}
 */
const universeDefect = ({ code, instances, links }) => {
  if (!CONTENT_CODE_PATTERN.test(String(code ?? ''))) return 'the code is invalid';
  const codes = instances.map((member) => member?.instanceCode);
  const invalid = codes.find((member) => !CONTENT_CODE_PATTERN.test(String(member ?? '')));
  if (invalid !== undefined) return `the instance code "${invalid}" is invalid`;
  const layout = graphLayoutDefect(codes, instances, 'instanceCode');
  if (layout) return layout;
  const linked = new Set();
  for (const { sourceInstanceCode: source, targetInstanceCode: target } of links) {
    if (!codes.includes(source) || !codes.includes(target)) return `the link ${source} → ${target} names a non-member`;
    if (source === target) return `the link of ${source} goes nowhere`;
    if (linked.has(linkKey(source, target))) return `${source} and ${target} have two links`;
    linked.add(linkKey(source, target));
  }
  return '';
};

/**
 * Checks a topology and the members it adds: each one exists in the served content and belongs to
 * no other universe, and every member holds one wallet, since the universe shares one profile.
 * @throws {Error} 400 on a defect, 404 on an unknown instance, 409 on an instance of another universe
 *   or on members of different wallets.
 */
const assertTopology = async (universe, previous, options) => {
  const defect = universeDefect(universe);
  if (defect) throw httpError(400, `Invalid universe: ${defect}`);
  const codes = universe.instances.map(({ instanceCode }) => instanceCode);
  const known = new Set((previous?.instances ?? []).map(({ instanceCode }) => instanceCode));
  const added = codes.filter((code) => !known.has(code));
  if (added.length > 0) {
    const found = await model('CyberiaInstance', options).distinct('code', { code: { $in: added } });
    const missing = added.filter((code) => !found.includes(code));
    if (missing.length > 0) throw httpError(404, `The served content holds no instance ${missing.join(', ')}`);
  }
  const other = await model('CyberiaUniverse', options)
    .findOne({ code: { $ne: universe.code }, 'instances.instanceCode': { $in: codes } }, { code: 1, instances: 1 })
    .lean();
  if (other) {
    const shared = other.instances.find(({ instanceCode }) => codes.includes(instanceCode)).instanceCode;
    throw httpError(409, `Instance ${shared} belongs to universe ${other.code}`);
  }
  const wallet = await universeWalletDefect(
    { CyberiaInstanceConf: model('CyberiaInstanceConf', options), CyberiaEconomy: model('CyberiaEconomy', options) },
    codes,
  );
  if (wallet) throw httpError(409, `Universe wallet: ${wallet}`);
};

/** The stored shape of a topology. @throws {Error} 400 when the members or the links are not lists. */
const topologyOf = ({ instances = [], links = [] }) => {
  if (!Array.isArray(instances) || !Array.isArray(links)) throw httpError(400, 'instances and links are lists');
  return {
    instances: instances.map((member) => ({ instanceCode: member?.instanceCode, x: member?.x, y: member?.y })),
    links: links.map((link) => ({
      sourceInstanceCode: link?.sourceInstanceCode,
      targetInstanceCode: link?.targetInstanceCode,
      bidirectional: link?.bidirectional !== false,
    })),
  };
};

/** A concurrent write of a member another universe took fails on the unique index. */
const memberConflict = (error) => {
  if (error?.code === 11000) throw httpError(409, 'An instance of this universe joined another universe meanwhile');
  throw error;
};

/** The API URL of a picture, or '' without one. */
const pictureUrl = (picture) => (picture ? `${apiPathOf()}/${picture.endpoint}/${picture.id}` : '');

/**
 * The universe with what each member is now: its content name, its preview with the size of its card
 * (`w`, `h`, its longest side 1), the thumbnail its author set, its entry spawn, whether the served
 * content holds it, and the best live endpoint of its world.
 * @param {Object} universe - Lean `CyberiaUniverse`.
 * @param {object} options Router options (host/path context).
 */
const universeView = async (universe, options) => {
  const codes = universe.instances.map(({ instanceCode }) => instanceCode);
  const [instances, endpoints] = await Promise.all([
    model('CyberiaInstance', options)
      .find(
        { code: { $in: codes } },
        { code: 1, name: 1, description: 1, thumbnail: 1, cyberiaMapCodes: 1, mapLayout: 1, playerSpawn: 1 },
      )
      .lean(),
    liveEndpoints(options, { instanceCodes: codes }),
  ]);
  const maps = await model('CyberiaMap', options)
    .find(
      { code: { $in: instances.flatMap(({ cyberiaMapCodes }) => cyberiaMapCodes ?? []) } },
      { code: 1, name: 1, gridX: 1, gridY: 1, worldX: 1, worldY: 1 },
    )
    .lean();
  const contentOf = new Map(instances.map((instance) => [instance.code, instance]));
  const rank = { available: 2, draining: 1 };
  const endpointOf = new Map();
  for (const endpoint of endpoints) {
    const best = endpointOf.get(endpoint.instanceCode);
    if (!best || rank[endpoint.status] > rank[best.status]) endpointOf.set(endpoint.instanceCode, endpoint);
  }
  return {
    code: universe.code,
    name: universe.name || universe.code,
    description: universe.description ?? '',
    revision: universe.revision,
    instances: universe.instances.map(({ instanceCode, x, y }) => {
      const content = contentOf.get(instanceCode);
      const endpoint = endpointOf.get(instanceCode);
      return {
        instanceCode,
        x,
        y,
        name: content?.name || instanceCode,
        description: content?.description ?? '',
        mapCodes: content?.cyberiaMapCodes ?? [],
        ...(content ? worldPreviewSize(content, maps) : { w: 1, h: 1 }),
        previewUrl: pictureUrl(content && worldPreviewPicture(instanceCode)),
        thumbnailUrl: pictureUrl(content?.thumbnail && worldPicture(content)),
        ...(content && { entrySpawn: entrySpawn(content, maps) }),
        served: !!content,
        status: endpoint?.status ?? 'offline',
        url: endpoint?.url ?? '',
        build: endpoint?.build ?? '',
        path: worldPathOf(instanceCode),
      };
    }),
    links: topologyOf(universe).links,
  };
};

/**
 * Removes an instance from its universe, with its links.
 * @param {string} instanceCode
 * @param {object} options Router options (host/path context).
 */
const removeUniverseMember = async (instanceCode, options) =>
  await model('CyberiaUniverse', options).updateOne(
    { 'instances.instanceCode': instanceCode },
    {
      $pull: {
        instances: { instanceCode },
        links: { $or: [{ sourceInstanceCode: instanceCode }, { targetInstanceCode: instanceCode }] },
      },
      $inc: { revision: 1 },
    },
  );

/**
 * The code of the universe an instance belongs to, or ''.
 * @param {string} instanceCode
 * @param {object} options Router options (host/path context).
 * @returns {Promise<string>}
 */
const universeCodeOf = async (instanceCode, options) =>
  (await model('CyberiaUniverse', options).findOne({ 'instances.instanceCode': instanceCode }, { code: 1 }).lean())
    ?.code ?? '';

/**
 * Whether a route of their universe leads from one world to another: a link from it, or a
 * bidirectional link between them.
 * @param {string} from - Instance code of the world a player leaves.
 * @param {string} to - Instance code of the world it travels to.
 * @param {object} options Router options (host/path context).
 * @returns {Promise<boolean>}
 */
const routeLeads = async (from, to, options) => {
  const universe = await model('CyberiaUniverse', options)
    .findOne({ 'instances.instanceCode': from }, { instances: 1, links: 1 })
    .lean();
  if (!universe?.instances.some(({ instanceCode }) => instanceCode === to)) return false;
  return universe.links.some(
    ({ sourceInstanceCode: source, targetInstanceCode: target, bidirectional }) =>
      (source === from && target === to) || (bidirectional !== false && source === to && target === from),
  );
};

class CyberiaUniverseService {
  static post = async (req, res, options) => {
    const { code, name = '', description = '' } = req.body ?? {};
    const universe = { code, name, description, ...topologyOf(req.body ?? {}) };
    await assertTopology(universe, null, options);
    return await model('CyberiaUniverse', options)
      .create({ ...universe, creator: req.auth.user._id })
      .catch(memberConflict);
  };

  static get = async (req, res, options) => {
    const Universe = model('CyberiaUniverse', options);
    if (req.params.id) return await Universe.findOne(DataQuery.naturalKeyFilter('code', req.params.id)).lean();
    return await DataQuery.findPage(Universe, req.query);
  };

  /** GET /:id/view — the universe with the content and the availability of each member. */
  static view = async (req, res, options) => {
    const universe = await model('CyberiaUniverse', options)
      .findOne(DataQuery.naturalKeyFilter('code', req.params.id))
      .lean();
    if (!universe) throw httpError(404, `No universe ${req.params.id}`);
    return await universeView(universe, options);
  };

  /** GET /instance/:instanceCode — the view of the universe an instance belongs to. */
  static ofInstance = async (req, res, options) => {
    const { instanceCode } = req.params;
    const universe = await model('CyberiaUniverse', options).findOne({ 'instances.instanceCode': instanceCode }).lean();
    if (!universe) throw httpError(404, `Instance ${instanceCode} belongs to no universe`);
    return await universeView(universe, options);
  };

  static put = async (req, res, options) => {
    const Universe = model('CyberiaUniverse', options);
    const stored = await Universe.findById(req.params.id).lean();
    if (!stored) throw httpError(404, 'universe not found');
    assertOwnerOrAdmin(req.auth.user, stored.creator);
    // The owner and the code are set once, by the write that created the universe; the revision only moves forward.
    const { code, revision, name = stored.name, description = stored.description } = req.body ?? {};
    if (code !== undefined && code !== stored.code)
      throw httpError(400, `The code of universe ${stored.code} never changes`);
    if (revision !== stored.revision)
      throw httpError(
        409,
        `Universe ${stored.code} is at revision ${stored.revision}, not ${revision}: reload it before saving`,
      );
    const universe = { code: stored.code, name, description, ...topologyOf({ ...stored, ...req.body }) };
    await assertTopology(universe, stored, options);
    const updated = await Universe.findOneAndUpdate(
      { _id: stored._id, revision: stored.revision },
      { $set: { name, description, ...topologyOf(universe) }, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true },
    )
      .lean()
      .catch(memberConflict);
    if (!updated) throw httpError(409, `Universe ${stored.code} changed while saving: reload it before saving`);
    return updated;
  };

  static delete = async (req, res, options) => {
    const Universe = model('CyberiaUniverse', options);
    if (!req.params.id) return await Universe.deleteMany();
    const stored = await Universe.findById(req.params.id).lean();
    if (!stored) throw httpError(404, 'universe not found');
    assertOwnerOrAdmin(req.auth.user, stored.creator);
    return await Universe.findByIdAndDelete(stored._id).lean();
  };
}

export { CyberiaUniverseService, removeUniverseMember, routeLeads, universeCodeOf, universeDefect, universeView };
