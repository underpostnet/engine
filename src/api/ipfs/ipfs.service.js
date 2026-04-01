import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/logger.js';
import { DataQuery } from '../../server/data-query.js';
import { IpfsClient } from '../../server/ipfs-client.js';
import { IpfsDto } from './ipfs.model.js';

const logger = loggerFactory(import.meta);

/**
 * Upsert a CID registry entry.
 * Called by asset services (ObjectLayer, AtlasSpriteSheet) after a successful
 * IPFS pin so the registry always reflects what is actually pinned.
 *
 * @param {object} opts
 * @param {string} opts.cid          - IPFS Content Identifier.
 * @param {string} opts.resourceType - Asset category ('object-layer-data' | 'atlas-sprite-sheet' | 'atlas-metadata').
 * @param {string} [opts.mfsPath]    - MFS path used when adding the content.
 * @param {object} opts.options      - Router options ({ host, path }) for DB lookup.
 * @returns {Promise<import('mongoose').Document>}
 */
const createPinRecord = async ({ cid, resourceType, mfsPath = '', options }) => {
  const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
  const record = await Ipfs.findOneAndUpdate(
    { cid, resourceType },
    { cid, resourceType, mfsPath },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  logger.info(`IPFS registry upserted – CID: ${cid}, type: ${resourceType}, mfsPath: ${mfsPath}`);
  return record;
};

/**
 * Remove all DB registry entries for a CID, then best-effort unpin from the IPFS node.
 * Always deletes DB records first so the registry stays clean even if the node is down.
 *
 * @param {string} cid     - IPFS Content Identifier to remove.
 * @param {object} options - Router options ({ host, path }) for DB lookup.
 * @returns {Promise<void>}
 */
const removePinRecordsAndUnpin = async (cid, options) => {
  const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
  await Ipfs.deleteMany({ cid });
  logger.info(`Removed IPFS registry entries for CID: ${cid}`);
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
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
    return await new Ipfs(req.body).save();
  },

  get: async (req, res, options) => {
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
    if (req.params.id) {
      return await Ipfs.findById(req.params.id).select(IpfsDto.select.get());
    }
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
    const [data, total] = await Promise.all([
      Ipfs.find(query).select(IpfsDto.select.get()).sort(sort).limit(limit).skip(skip),
      Ipfs.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  },

  put: async (req, res, options) => {
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
    return await Ipfs.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
  },

  delete: async (req, res, options) => {
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
    if (req.params.id) {
      const record = await Ipfs.findById(req.params.id);
      if (record) {
        await Ipfs.findByIdAndDelete(req.params.id);
        // Only unpin from the node when no other registry entries reference this CID.
        const remaining = await Ipfs.countDocuments({ cid: record.cid });
        if (remaining === 0) {
          try {
            await IpfsClient.unpinCid(record.cid);
          } catch (err) {
            logger.warn(`Failed to unpin CID ${record.cid}: ${err.message}`);
          }
        }
        return record;
      }
      return null;
    }
    return await Ipfs.deleteMany();
  },

  // ──────────────────────────────────────────────
  //  Health / audit
  // ──────────────────────────────────────────────

  /**
   * GET /ipfs/verify
   *
   * Iterates every CID in the registry and checks whether it is actually pinned
   * on the connected IPFS node. Returns a summary suitable for admin dashboards
   * and automated alerting.
   *
   * Response shape:
   *   { total, pinned, unpinned, errors, entries: [{ cid, resourceType, mfsPath, pinned, error? }] }
   */
  verify: async (req, res, options) => {
    const Ipfs = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.Ipfs;
    const records = await Ipfs.find({}).select(IpfsDto.select.get()).lean();

    let pinned = 0;
    let unpinned = 0;
    let errors = 0;
    const entries = await Promise.all(
      records.map(async (r) => {
        try {
          const isPinned = await IpfsClient.isCidPinned(r.cid);
          if (isPinned) pinned++;
          else unpinned++;
          return { cid: r.cid, resourceType: r.resourceType, mfsPath: r.mfsPath, pinned: isPinned };
        } catch (err) {
          errors++;
          return { cid: r.cid, resourceType: r.resourceType, mfsPath: r.mfsPath, pinned: false, error: err.message };
        }
      }),
    );

    return { total: records.length, pinned, unpinned, errors, entries };
  },
};

export { IpfsService, createPinRecord, removePinRecordsAndUnpin };
