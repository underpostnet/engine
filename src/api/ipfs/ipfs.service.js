import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';
import { IpfsClient } from '../../server/ipfs-client.js';
import { IpfsDto } from './ipfs.model.js';

const logger = loggerFactory(import.meta);

/**
 * Create (or upsert) an IPFS pin record for a given user + CID pair.
 * This is a helper consumed by other services (ObjectLayer, AtlasSpriteSheet, …)
 * so they don't need to know about the Ipfs model directly.
 *
 * @param {object}  opts
 * @param {string}  opts.cid      – IPFS Content Identifier.
 * @param {string}  opts.userId   – Mongoose ObjectId string of the owning user.
 * @param {string}  [opts.pinType='recursive'] – 'recursive' | 'direct' | 'indirect'
 * @param {object}  opts.options  – Router options ({ host, path }) for DB lookup.
 * @returns {Promise<import('mongoose').Document>}
 */
const createPinRecord = async ({ cid, userId, pinType = 'recursive', options }) => {
  const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

  // Upsert: if a record for this user + CID already exists, just update the pinType.
  const record = await Ipfs.findOneAndUpdate(
    { cid, userId },
    { cid, userId, pinType },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(`IPFS pin record upserted – CID: ${cid}, userId: ${userId}, pinType: ${pinType}`);
  return record;
};

const IpfsService = {
  /** Expose the helper so other modules can import it directly. */
  createPinRecord,

  // ──────────────────────────────────────────────
  //  Standard CRUD
  // ──────────────────────────────────────────────

  post: async (req, res, options) => {
    /** @type {import('./ipfs.model.js').IpfsModel} */
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

    // Accept { cid, userId?, pinType? } in body.
    // If userId is omitted, fall back to the authenticated user.
    const body = { ...req.body };
    if (!body.userId && req.auth && req.auth.user) {
      body.userId = req.auth.user._id;
    }

    return await new Ipfs(body).save();
  },

  get: async (req, res, options) => {
    /** @type {import('./ipfs.model.js').IpfsModel} */
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

    if (req.params.id) {
      return await Ipfs.findById(req.params.id).select(IpfsDto.select.get()).populate(IpfsDto.populate.user());
    }

    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      Ipfs.find(query)
        .select(IpfsDto.select.get())
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate(IpfsDto.populate.user()),
      Ipfs.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  },

  put: async (req, res, options) => {
    /** @type {import('./ipfs.model.js').IpfsModel} */
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
    return await Ipfs.findByIdAndUpdate(req.params.id, req.body, { new: true });
  },

  delete: async (req, res, options) => {
    /** @type {import('./ipfs.model.js').IpfsModel} */
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

    if (req.params.id) {
      const record = await Ipfs.findById(req.params.id);
      if (record) {
        // Best-effort unpin from the IPFS node.
        try {
          await IpfsClient.unpinCid(record.cid);
        } catch (err) {
          logger.warn(`Failed to unpin CID ${record.cid} from IPFS node: ${err.message}`);
        }
        return await Ipfs.findByIdAndDelete(req.params.id);
      }
      return null;
    }

    return await Ipfs.deleteMany();
  },

  // ──────────────────────────────────────────────
  //  Pin / Unpin helpers (called via controller)
  // ──────────────────────────────────────────────

  /**
   * POST /ipfs/pin  – add content to IPFS, pin it, and create a DB record.
   * Body: { data: <string|object>, userId?, pinType? }
   */
  pin: async (req, res, options) => {
    const userId = req.body.userId || (req.auth && req.auth.user ? req.auth.user._id : undefined);
    if (!userId) throw new Error('userId is required to create a pin record');

    const content = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    const result = await IpfsClient.addToIpfs(Buffer.from(content, 'utf-8'), req.body.filename || 'data');

    if (!result) throw new Error('IPFS node is unreachable – content was not pinned');

    const record = await createPinRecord({
      cid: result.cid,
      userId,
      pinType: req.body.pinType || 'recursive',
      options,
    });

    return { cid: result.cid, size: result.size, record };
  },

  /**
   * DELETE /ipfs/pin/:cid  – unpin a CID and remove the DB record for the current user.
   */
  unpin: async (req, res, options) => {
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
    const userId = req.auth && req.auth.user ? req.auth.user._id : undefined;
    const cid = req.params.cid || req.params.id;

    const record = await Ipfs.findOne({ cid, ...(userId ? { userId } : {}) });
    if (!record) throw new Error(`No pin record found for CID ${cid}`);

    // Check if other users still pin this CID – only unpin from the node when nobody else needs it.
    const othersCount = await Ipfs.countDocuments({ cid, _id: { $ne: record._id } });
    if (othersCount === 0) {
      await IpfsClient.unpinCid(cid);
    }

    await Ipfs.findByIdAndDelete(record._id);
    return { success: true, cid };
  },
};

export { IpfsService, createPinRecord };
