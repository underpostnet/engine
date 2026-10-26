'use strict';

/**
 * @module test/support/procedural-engine
 * @description A Procedural Engine on a real MongoDB for the integration suites: one host that is
 * its own Object Layer authority with the maps, instances, instance confs and entity-type defaults a
 * map population reads, the shipped profiles, the procedural content of `procedural-content.js` with the foundation
 * of three items, and a few existing Cyberia items to target. Needs a mongod binary
 * (`UNDERPOST_MONGOD_BIN`); IPFS points at a closed port, so a pin failure is a warning, never a
 * failed write.
 */

import { DataBaseProviderService } from '../../src/db/DataBaseProvider.js';
import {
  bindItem,
  catalogModels,
  publishItemDefinition,
} from '../../src/projects/cyberia/catalog/object-layer-catalog.js';
import { ObjectLayerEngine } from '../../src/projects/cyberia/object-layer/object-layer.js';
import { PROCEDURAL_APIS, proceduralModels } from '../../src/projects/cyberia/procedural/engine.js';
import { createJob } from '../../src/projects/cyberia/procedural/jobs/job.js';
import { RANDOM_PALETTE } from '../../src/projects/cyberia/procedural/spec.js';
import { ensureDefaultProfiles } from '../../src/projects/cyberia/procedural/profiles/registry.js';
import { drainQueue } from '../../src/projects/cyberia/procedural/jobs/worker.js';
import { resolveTemplate } from '../../src/projects/cyberia/procedural/templates.js';
import { paletteRoles } from '../../src/projects/cyberia/procedural/palettes/resolver.js';
import { CyberiaObjectLayerProfile } from '../../src/client/components/cyberia/ObjectLayerProfileCyberia.js';
import {
  framesByDirection,
  sourceFromDirectionFrames,
  toWire,
} from '../../src/client/components/objectlayer-studio/RenderSource.js';
import { startMongod } from './mongod.js';
import { SKIN_TEMPLATE, VIOLET_STRATA, paletteFixture, writeProceduralArtifact } from './procedural-content.js';
import { skinSource } from './procedural-skin.js';

export const host = { host: 'procedural.test', path: '/', consumes: {} };
export const APIS = [
  'object-layer',
  'object-layer-render-frames',
  'atlas-sprite-sheet',
  'file',
  'ipfs',
  'cyberia-item-catalog',
  'cyberia-map',
  'cyberia-instance',
  'cyberia-entity-type-default',
  'cyberia-instance-conf',
  ...PROCEDURAL_APIS,
];
export const MODERATOR = '64b000000000000000000001';

/** The existing items of the engine: label → cid, filled by {@link startEngine}. */
export const cids = {};
let mongod;

export const models = () => proceduralModels(host);

/** What the foundation says of three existing items: two art briefs that name colors, and a biome. */
export const FOUNDATION_ITEMS = Object.freeze({
  'aether-agent': {
    artBrief: {
      silhouette: 'Straight figure in a fitted suit.',
      paletteDirection: 'Black #000000 and #2a2a2a, white #EEEEEE, violets #350035 and #420042, black #000000.',
    },
  },
  'ash-raider': {
    artBrief: { silhouette: 'A hooded raider.', paletteDirection: 'Ash grey #c0c0c0 and rust #8b3a1a.' },
  },
  'violet-skin': { locations: [VIOLET_STRATA.id] },
});

/** The color slots that set the base of every role of the humanoid template from a palette. */
export const slotsOf = (paletteId) =>
  Object.fromEntries(
    Object.entries(paletteRoles(resolveTemplate(SKIN_TEMPLATE), paletteFixture(paletteId))).map(([role, color]) => [
      ['outline', 'accent'].includes(role) ? role : `${role}.base`,
      color,
    ]),
  );

/** An update request for `base-skin` with every field set. */
export const updateRequest = (overrides = {}) => ({
  mode: 'update-existing',
  source: { itemIds: ['base-skin'] },
  output: { variantsPerItem: 2 },
  palette: { items: [] },
  variation: { level: 0.6 },
  seed: { mode: 'fixed', value: 424242 },
  ...overrides,
});

/** A create request with every field set. */
export const createRequest = (overrides = {}) => ({
  mode: 'create-new',
  itemType: 'skin',
  template: { id: 'skin.humanoid' },
  palette: { paletteId: RANDOM_PALETTE },
  output: { variants: 3, itemIdPrefix: 'human-skin' },
  variation: { level: 0.6 },
  seed: { mode: 'fixed', value: 424242 },
  ...overrides,
});

export const create = (request) => createJob({ models: models(), request, actor: MODERATOR });
export const itemsOf = (job) => models().CyberiaProceduralJobItem.find({ jobId: job._id }).sort({ ordinal: 1 }).lean();
export const itemOf = (id) => models().CyberiaProceduralJobItem.findById(id).lean();
export const auditOf = async (filter) =>
  await models().CyberiaProceduralAudit.find(filter).sort({ createdAt: 1 }).lean();
export const actionsOf = async (filter) => (await auditOf(filter)).map(({ action }) => action);
export const drain = (extra = {}) => drainQueue({ models: models(), options: host, holder: 'worker-a', ...extra });
export const boundCid = async (itemId) =>
  (await models().CyberiaItemCatalog.findOne({ itemId }).lean())?.objectLayerCid;
/** Binds an item to a definition over whatever it runs, as a moderator's bind does. */
export const rebind = async (itemId, objectLayerCid) =>
  await models().CyberiaItemCatalog.bind(itemId, objectLayerCid, {
    expectedCid: (await boundCid(itemId)) ?? null,
    source: 'studio',
  });
export const rejection = async (promise) =>
  promise.then(
    () => null,
    (error) => error,
  );

/**
 * The save of the Studio: the stored revision of a candidate with one cell painted, and with its
 * data changed as `change` returns it.
 * @param {Object} item - A candidate.
 * @param {{x:number,y:number,color:number[]}} paint
 * @param {(data:Object)=>Object} [change]
 * @returns {Promise<{data:Object,objectLayerRenderFramesData:Object}>}
 */
export const edited = async (item, paint, change = (data) => data) => {
  const stored = await models().ObjectLayerRenderFrames.findOne({ objectLayerCid: item.candidateCid }).lean();
  const byCode = framesByDirection(models().ObjectLayerRenderFrames.sourceOf(stored));
  byCode['08'][0][paint.y][paint.x] = paint.color;
  const definition = await models().ObjectLayer.findByCid(item.candidateCid).lean();
  return {
    data: change({ item: { ...definition.data.item }, stats: { ...definition.data.stats } }),
    objectLayerRenderFramesData: toWire(sourceFromDirectionFrames({ framesByCode: byCode, frameDurationMs: 250 })),
  };
};

/** Effect 1 and agility 4, each kept inside the bounds of the item type. */
const statsOf = (type) => {
  const bounds = CyberiaObjectLayerProfile.statBounds(type);
  const wanted = { effect: 1, agility: 4 };
  return CyberiaObjectLayerProfile.validateStats(
    Object.fromEntries(
      Object.entries(bounds).map(([key, [min, max]]) => [key, Math.min(max, Math.max(min, wanted[key] ?? 0))]),
    ),
  );
};

/** The data of a Cyberia item definition. */
export const definitionOf = (id, type = 'skin') => ({
  item: { id, type, description: `the ${id}`, activable: true },
  stats: statsOf(type),
});

/**
 * Publishes an existing Cyberia item and binds its label to it.
 * @param {string} itemId
 * @param {Object} [params]
 * @param {boolean} [params.render] - Whether it has a render: the source skin of the humanoid template.
 * @param {string} [params.type] - Its item type.
 * @param {Object} [params.renderSource] - The render it has, over the source skin.
 * @returns {Promise<string>} The cid it runs.
 */
export async function publishItem(itemId, { render = true, type = 'skin', renderSource } = {}) {
  const definition = await (render || renderSource
    ? ObjectLayerEngine.persistObjectLayerDocuments({
        models: catalogModels(host),
        objectLayerRenderFramesData: renderSource ?? skinSource(resolveTemplate(SKIN_TEMPLATE)).renderSource,
        objectLayerData: { data: definitionOf(itemId, type) },
        persistOptions: { options: host },
      })
    : publishItemDefinition({
        models: catalogModels(host),
        payload: { data: definitionOf(itemId, type) },
        options: host,
      }));
  await bindItem({
    models: catalogModels(host),
    itemId,
    objectLayerCid: definition.cid,
    expectedCid: null,
    source: 'content',
    options: host,
  });
  return definition.cid;
}

/**
 * Starts mongod, serves the procedural content, loads the host and stores the shipped profiles and the existing items.
 * @param {Object} [world] - What the content holds besides the items; see {@link writeProceduralArtifact}.
 * @param {Object} [world.maps]
 * @param {Object[]} [world.entities]
 * @param {Object[]} [world.baseline]
 */
export async function startEngine({ maps = {}, entities = [], baseline = [] } = {}) {
  for (const key of ['DB_USER', 'DB_PASSWORD', 'DB_AUTH_SOURCE', 'DB_REPLICA_SET', 'DEFAULT_DEPLOY_ID'])
    delete process.env[key];
  process.env.CYBERIA_CONTENT_ROOT = writeProceduralArtifact(FOUNDATION_ITEMS, { maps, entities, baseline });
  process.env.IPFS_API_URL = 'http://127.0.0.1:9';
  process.env.IPFS_CLUSTER_API_URL = 'http://127.0.0.1:9';
  mongod = await startMongod('cyberia', { replSet: 'proceduralset' });
  await DataBaseProviderService.load({
    apis: APIS,
    ...host,
    db: { provider: 'mongoose', host: mongod.host, replicaSet: 'proceduralset', name: 'cyberia-procedural' },
  });
  for (const model of Object.values(models())) await model.init();
  await ensureDefaultProfiles(models());
  Object.assign(cids, {
    'base-skin': await publishItem('base-skin'),
    'violet-skin': await publishItem('violet-skin'),
    'bare-skin': await publishItem('bare-skin', { render: false }),
    'iron-sword': await publishItem('iron-sword', { render: false, type: 'weapon' }),
    'aether-agent': await publishItem('aether-agent'),
    'ash-raider': await publishItem('ash-raider', { render: false }),
  });
}

/** Closes the host and stops mongod. */
export async function stopEngine() {
  await DataBaseProviderService.getProvider(host)
    ?.close()
    .catch(() => {});
  delete DataBaseProviderService.instance[`${host.host}${host.path}`];
  await mongod?.stop();
}
