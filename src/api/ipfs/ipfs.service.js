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
 * @param {object}  opts.options  – Router options ({ host, path }) for DB lookup.
 * @returns {Promise<import('mongoose').Document>}
 */
const createPinRecord = async ({ cid, userId, options }) => {
  const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

  // Upsert: if a record for this user + CID already exists, just touch it.
  const record = await Ipfs.findOneAndUpdate(
    { cid, userId },
    { cid, userId },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(`IPFS pin record upserted – CID: ${cid}, userId: ${userId}`);
  return record;
};

/**
 * Remove all DB pin records for a CID, then best-effort unpin from IPFS node/cluster.
 * Always deletes the DB records first so that even if the IPFS node is unreachable
 * the database stays clean.
 *
 * @param {string} cid     – IPFS Content Identifier to clean up.
 * @param {object} options – Router options ({ host, path }) for DB lookup.
 * @returns {Promise<void>}
 */
const removePinRecordsAndUnpin = async (cid, options) => {
  const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

  // 1. Remove all DB pin records for this CID first
  await Ipfs.deleteMany({ cid });
  logger.info(`Removed all IPFS pin records for CID: ${cid}`);

  // 2. Best-effort unpin from IPFS node/cluster (ignore "not pinned" errors)
  try {
    await IpfsClient.unpinCid(cid);
  } catch (err) {
    logger.warn(`Best-effort IPFS unpin failed for CID ${cid}: ${err.message}`);
  }
};

const IpfsService = {
  /** Expose helpers so other modules can import them directly. */
  createPinRecord,
  removePinRecordsAndUnpin,

  // ──────────────────────────────────────────────
  //  Standard CRUD
  // ──────────────────────────────────────────────

  post: async (req, res, options) => {
    /** @type {import('./ipfs.model.js').IpfsModel} */
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;

    // Accept { cid, userId? } in body.
    // If userId is omitted, fall back to the authenticated user.
    const body = { ...req.body };
    if (!body.userId && req.auth && req.auth.user) {
      body.userId = req.auth.user._id;
    }
    // Strip pinType if sent by legacy clients
    delete body.pinType;

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
        // Remove DB record first, then best-effort unpin
        await Ipfs.findByIdAndDelete(req.params.id);
        try {
          // Only unpin from IPFS if no other records reference this CID
          const remaining = await Ipfs.countDocuments({ cid: record.cid });
          if (remaining === 0) {
            await IpfsClient.unpinCid(record.cid);
          }
        } catch (err) {
          logger.warn(`Failed to unpin CID ${record.cid} from IPFS node: ${err.message}`);
        }
        return record;
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
   * Body: { data: <string|object>, userId? }
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

    // Remove DB record first
    await Ipfs.findByIdAndDelete(record._id);

    // Only unpin from the IPFS node when nobody else has a record for this CID
    const remaining = await Ipfs.countDocuments({ cid });
    if (remaining === 0) {
      try {
        await IpfsClient.unpinCid(cid);
      } catch (err) {
        logger.warn(`Best-effort IPFS unpin failed for CID ${cid}: ${err.message}`);
      }
    }

    return { success: true, cid };
  },
};

export { IpfsService, createPinRecord, removePinRecordsAndUnpin };
