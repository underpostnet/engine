/**
 * IPFS storage of Object Layer definitions, CID first.
 *
 * A definition is stored under its own CID: `/object-layer/cid/<objectLayerCid>/` lists its
 * canonical bytes (`object-layer.json`), its primary render (`atlas.png`) and the layout of that
 * render (`atlas.json`). Each file has a CID of its own; the directory is only a name for the
 * definition's revision. An item id never names a path: the item catalog binds an item to a CID,
 * and a CID many items run is stored once.
 *
 * The four concerns stay apart: the CID is the content identity, the registry records what this
 * host pinned (`ipfs.model.js`), the pin keeps the content, and the MFS path only lists it. The
 * canonical bytes are the Object Layer authority's to pin; a host pins the render it stores.
 *
 * @module src/api/object-layer/object-layer.ipfs.js
 * @namespace ObjectLayerIpfs
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { IpfsClient } from '../ipfs/ipfs.client.js';
import { createPinRecord } from '../ipfs/ipfs.service.js';
import {
  MAX_CANONICAL_BYTES,
  canonicalObjectLayerBytes,
  canonicalRender,
  parseIdentityJson,
  payloadCid,
} from './object-layer.identity.js';

const logger = loggerFactory(import.meta);

/** The MFS directory every definition is listed under, by its CID. */
export const OBJECT_LAYER_MFS_ROOT = '/object-layer/cid';

/**
 * The files of a definition's bundle: its MFS name and the registry type of its content.
 * @memberof ObjectLayerIpfs
 */
export const BUNDLE_RESOURCES = Object.freeze({
  'object-layer.json': 'object-layer-data',
  'atlas.png': 'atlas-sprite-sheet',
  'atlas.json': 'atlas-metadata',
});

/**
 * The MFS paths of a definition's bundle, derived from its CID alone.
 * @param {string} objectLayerCid
 * @returns {{root:string,'object-layer.json':string,'atlas.png':string,'atlas.json':string}}
 * @memberof ObjectLayerIpfs
 */
export const objectLayerMfsPaths = (objectLayerCid) => {
  const root = `${OBJECT_LAYER_MFS_ROOT}/${objectLayerCid}`;
  return {
    root,
    ...Object.fromEntries(Object.keys(BUNDLE_RESOURCES).map((name) => [name, `${root}/${name}`])),
  };
};

/**
 * Pins bytes under the CID their contract names, records them and lists them under an MFS path.
 * Idempotent: the node answers known bytes with their CID, and the path is replaced.
 * @param {Object} params
 * @param {Buffer} params.bytes
 * @param {string} params.cid - The CID the content contract names for the bytes.
 * @param {string} params.resourceType - One of `IPFS_RESOURCE_TYPES`.
 * @param {string} params.mfsPath
 * @param {Object} [params.options] - Router options ({ host, path }).
 * @returns {Promise<{cid:string,path:string,pinned:boolean,listed:boolean}>}
 * @throws {Error} When IPFS assigns another CID than the contract names.
 * @memberof ObjectLayerIpfs
 */
export async function storeResource({ bytes, cid, resourceType, mfsPath, options }) {
  const added = await IpfsClient.addToIpfs(bytes, mfsPath.slice(mfsPath.lastIndexOf('/') + 1));
  if (!added) return { cid, path: mfsPath, pinned: false, listed: false };
  if (added.cid !== cid) throw new Error(`IPFS stored ${resourceType} as ${added.cid}; its contract names ${cid}`);
  await createPinRecord({ cid, resourceType, size: added.size, options });
  return { cid, path: mfsPath, pinned: true, listed: await IpfsClient.copyToMfs(cid, mfsPath) };
}

/**
 * The bytes of each file of a definition's bundle this host holds: the canonical bytes of a
 * published definition with `canonical`, and the render of the atlas stored under the definition
 * when it is the render the definition names.
 * @returns {Promise<Array<{name:string,cid:string,bytes:Buffer}>>}
 */
async function bundleContent({ definition, canonical, options }) {
  const content = [];
  if (canonical && definition.origin !== 'draft')
    content.push({ name: 'object-layer.json', cid: definition.cid, bytes: canonicalObjectLayerBytes(definition) });
  const named = definition.data?.render;
  if (!named?.cid) return content;
  const atlas = await DataBaseProviderService.getModel('AtlasSpriteSheet', options)
    .findOne({ objectLayerCid: definition.cid }, { fileId: 1, metadata: 1 })
    .lean();
  // Hydrated, not lean: a lean read hands back a BSON Binary.
  const primary = atlas?.fileId
    ? await DataBaseProviderService.getModel('File', options).findById(atlas.fileId, { data: 1 })
    : null;
  if (!primary?.data) return content;
  const { payloads, contract } = canonicalRender({ primary: Buffer.from(primary.data), metadata: atlas.metadata });
  if (contract.cid !== named.cid || contract.metadataCid !== named.metadataCid) {
    logger.warn(`The atlas of ${definition.cid} is not the render it names; its render is not stored`);
    return content;
  }
  content.push({ name: 'atlas.png', cid: contract.cid, bytes: payloads.primary });
  content.push({ name: 'atlas.json', cid: contract.metadataCid, bytes: payloads.metadata });
  return content;
}

/**
 * Stores the bundle of a stored definition on IPFS: pins each file this host holds, records it,
 * and lists it under `/object-layer/cid/<objectLayerCid>/`. The catalog stays as it is: binding is
 * a separate step. Idempotent.
 * @param {Object} params
 * @param {Object} params.definition - A stored definition, document or lean.
 * @param {boolean} [params.canonical=false] - This host pins the canonical bytes: it is the Object Layer authority.
 * @param {Object} [params.options] - Router options ({ host, path }).
 * @returns {Promise<{objectLayerCid:string,root:string,resources:Array<{name:string,cid:string,path:string,pinned:boolean,listed:boolean}>}>}
 * @memberof ObjectLayerIpfs
 */
export async function publishObjectLayerBundle({ definition, canonical = false, options }) {
  const paths = objectLayerMfsPaths(definition.cid);
  const resources = [];
  for (const { name, cid, bytes } of await bundleContent({ definition, canonical, options }))
    resources.push({
      name,
      ...(await storeResource({ bytes, cid, resourceType: BUNDLE_RESOURCES[name], mfsPath: paths[name], options })),
    });
  return { objectLayerCid: definition.cid, root: paths.root, resources };
}

/** The bytes IPFS holds under a raw CID: null when it holds none, or bytes the CID does not name. */
const readNamedBytes = async (cid) => {
  const bytes = await IpfsClient.getFromIpfs(cid);
  return bytes && bytes.length <= MAX_CANONICAL_BYTES && payloadCid(bytes) === cid ? bytes : null;
};

/**
 * The render a definition names, read from IPFS: its primary render and its layout, each the bytes
 * its CID names, so any node may serve them.
 * @param {{cid:string,metadataCid:string}} render - `data.render` of a definition.
 * @returns {Promise<{primary:Buffer,metadata:Object}|null>} Null when IPFS does not hold both.
 * @throws {Error} When the layout is not identity JSON.
 * @memberof ObjectLayerIpfs
 */
export async function readRender({ cid, metadataCid }) {
  const [primary, metadata] = await Promise.all([readNamedBytes(cid), readNamedBytes(metadataCid)]);
  return primary && metadata ? { primary, metadata: parseIdentityJson(metadata.toString('utf8')) } : null;
}

/**
 * Removes the MFS listing of a definition. Its pins stay: a prune unpins content no kept store
 * references.
 * @param {string} objectLayerCid
 * @returns {Promise<boolean>} True when the directory is gone or was never there.
 * @memberof ObjectLayerIpfs
 */
export const removeObjectLayerBundle = (objectLayerCid) =>
  IpfsClient.removeMfsPath(objectLayerMfsPaths(objectLayerCid).root);

/**
 * The IPFS state of each file of a definition's bundle, kept apart by concern: whether the
 * registry records the CID, whether the Kubo node and the Cluster pin it, and which CID its MFS
 * path lists. `null` is a state the node did not answer.
 * @param {Object} params
 * @param {Object} params.definition - A stored definition, lean.
 * @param {Object} [params.options] - Router options ({ host, path }).
 * @returns {Promise<Array<{name:string,cid:string,path:string,registered:boolean,pinned:boolean,cluster:boolean|null,listedCid:string|null}>>}
 * @memberof ObjectLayerIpfs
 */
export async function objectLayerIpfsState({ definition, options }) {
  const paths = objectLayerMfsPaths(definition.cid);
  const files = [{ name: 'object-layer.json', cid: definition.cid }];
  if (definition.data?.render?.cid)
    files.push(
      { name: 'atlas.png', cid: definition.data.render.cid },
      { name: 'atlas.json', cid: definition.data.render.metadataCid },
    );
  const registered = new Set(
    await DataBaseProviderService.getModel('Ipfs', options).distinct('cid', {
      cid: { $in: files.map(({ cid }) => cid) },
    }),
  );
  return await Promise.all(
    files.map(async ({ name, cid }) => ({
      name,
      cid,
      path: paths[name],
      registered: registered.has(cid),
      pinned: await IpfsClient.isCidPinned(cid),
      cluster: await IpfsClient.isClusterPinned(cid),
      listedCid: (await IpfsClient.statMfsPath(paths[name]))?.cid ?? null,
    })),
  );
}

/**
 * Collects the render content no kept store references: a render CID stays pinned while any kept
 * store holds a definition that names it, and a definition's MFS listing stays while any kept
 * store holds the definition. A definition a player owns counts as kept. Reachability decides,
 * never an item id. The canonical bytes and `object-layer.json` are the Object Layer authority's:
 * they stay.
 * @param {Object} params
 * @param {Array<{ObjectLayer:import('mongoose').Model,Ipfs:import('mongoose').Model}>} params.stores - Every kept store.
 * @param {Array<{cid:string,data:Object}>} [params.owned=[]] - The definitions players own.
 * @returns {Promise<{records:number,unpinned:number,listings:number}>} Registry records removed,
 *   CIDs the node unpinned, and MFS files removed.
 * @memberof ObjectLayerIpfs
 */
export async function pruneUnreferencedContent({ stores, owned = [] }) {
  const defined = new Set();
  const referenced = new Set();
  const keep = ({ cid, data }) => {
    defined.add(cid);
    if (data?.render?.cid) referenced.add(data.render.cid);
    if (data?.render?.metadataCid) referenced.add(data.render.metadataCid);
  };
  for (const { ObjectLayer } of stores) (await ObjectLayer.find({}, { cid: 1, 'data.render': 1 }).lean()).forEach(keep);
  owned.forEach(keep);
  const report = { records: 0, unpinned: 0, listings: 0 };
  const unreferenced = new Set();
  for (const { Ipfs } of stores) {
    const orphans = (await Ipfs.find({ resourceType: { $ne: 'object-layer-data' } }, { cid: 1 }).lean())
      .map(({ cid }) => cid)
      .filter((cid) => !referenced.has(cid));
    if (orphans.length === 0) continue;
    report.records += (await Ipfs.deleteMany({ cid: { $in: orphans } })).deletedCount ?? 0;
    for (const cid of orphans) unreferenced.add(cid);
  }
  for (const cid of unreferenced) if (await IpfsClient.unpinCid(cid)) report.unpinned++;
  for (const cid of (await IpfsClient.listMfsDirectory(OBJECT_LAYER_MFS_ROOT)) ?? []) {
    if (defined.has(cid)) continue;
    const paths = objectLayerMfsPaths(cid);
    const listed = (await IpfsClient.listMfsDirectory(paths.root)) ?? [];
    for (const name of ['atlas.png', 'atlas.json'])
      if (listed.includes(name) && (await IpfsClient.removeMfsPath(paths[name]))) report.listings++;
  }
  return report;
}

/**
 * Moves IPFS storage to the CID-first layout. The registry keeps one record per CID, without an
 * MFS path. Every stored definition gets its bundle under `/object-layer/cid/<cid>/`, from the
 * definition and the atlas this host stores, never from a file name. Every other entry of
 * `/object-layer/` is a listing by item id and goes. Without `apply` it only reports. Idempotent.
 * @param {Object} params
 * @param {import('mongoose').Model} params.ObjectLayer
 * @param {import('mongoose').Model} params.Ipfs
 * @param {boolean} [params.canonical=false] - This host pins the canonical bytes: it is the Object Layer authority.
 * @param {boolean} [params.apply=false]
 * @param {Object} [params.options] - Router options ({ host, path }).
 * @returns {Promise<{applied:boolean,registry:{records:number,duplicates:number},definitions:number,stored:number,failed:Array<{cid:string,message:string}>,legacy:string[]}>}
 * @memberof ObjectLayerIpfs
 */
export async function migrateObjectLayerStorage({ ObjectLayer, Ipfs, canonical = false, apply = false, options }) {
  const records = await Ipfs.collection.find({}, { projection: { cid: 1 } }).toArray();
  const seen = new Set();
  const duplicates = [];
  for (const { _id, cid } of records) {
    if (seen.has(cid)) duplicates.push(_id);
    seen.add(cid);
  }
  const definitions = await ObjectLayer.find({}).lean();
  const legacy = ((await IpfsClient.listMfsDirectory('/object-layer')) ?? [])
    .filter((name) => `/object-layer/${name}` !== OBJECT_LAYER_MFS_ROOT)
    .map((name) => `/object-layer/${name}`);
  const report = {
    applied: apply,
    registry: { records: records.length, duplicates: duplicates.length },
    definitions: definitions.length,
    stored: 0,
    failed: [],
    legacy,
  };
  if (!apply) return report;

  if (duplicates.length > 0) await Ipfs.collection.deleteMany({ _id: { $in: duplicates } });
  await Ipfs.collection.updateMany({ mfsPath: { $exists: true } }, { $unset: { mfsPath: '' } });
  await Ipfs.syncIndexes();
  for (const definition of definitions)
    try {
      const { resources } = await publishObjectLayerBundle({ definition, canonical, options });
      if (resources.every(({ pinned, listed }) => pinned && listed)) report.stored++;
      else report.failed.push({ cid: definition.cid, message: 'IPFS did not pin or list every file' });
    } catch (error) {
      report.failed.push({ cid: definition.cid, message: error.message });
    }
  for (const directory of legacy) await IpfsClient.removeMfsPath(directory);
  return report;
}
