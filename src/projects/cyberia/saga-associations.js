/**
 * The sagas each item label and map code belongs to. A map belongs to the saga that defines it in
 * the content artifact and to every stored saga that lists it. An item belongs to the saga that
 * defines it, to the saga of every map whose stored entities carry it, to the sagas of the maps of
 * every instance whose entity-type defaults wire it, and to every saga of an item whose stored skill
 * summons it. A label or a code may belong to several sagas.
 *
 * @module src/projects/cyberia/saga-associations.js
 * @namespace CyberiaSagaAssociations
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { SAGA_FILTER_KEY } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { collectInstanceItemIds } from '../../api/cyberia-instance/cyberia-instance-items.js';
import { contentArtifact } from './content-artifact.js';

/**
 * The saga codes of each item label and map code, sorted.
 * @param {Object} stored
 * @param {Object[]} [stored.maps] - Stored maps: `code`, `entities[].objectLayerItemIds`.
 * @param {Object[]} [stored.sagas] - Stored sagas: `code`, `mapCodes`.
 * @param {Object[]} [stored.instances] - Stored instances: `cyberiaMapCodes`, and `entityDefaults`, the
 *   entity-type default documents their conf references.
 * @param {Object[]} [stored.skills] - Stored skills: `triggerItemId`, `skills[].summonedEntityItemId`.
 * @param {Object} [index] - Context index; the artifact's by default.
 * @returns {{items: Object<string,string[]>, maps: Object<string,string[]>}}
 * @memberof CyberiaSagaAssociations
 */
export function sagaAssociations(
  { maps = [], sagas = [], instances = [], skills = [] },
  index = contentArtifact().context,
) {
  const items = {};
  const mapSagas = {};
  const add = (bucket, key, code) => {
    if ((bucket[key] ?? []).includes(code)) return false;
    bucket[key] = [...(bucket[key] ?? []), code].sort();
    return true;
  };
  const sagaOf = (id) => (index.sources[id] === 'foundation' ? null : index.sources[id]);
  for (const [label, id] of Object.entries(index.labels)) if (sagaOf(id)) add(items, label, sagaOf(id));
  for (const id of Object.keys(index.definitions))
    if (id.startsWith('map.') && sagaOf(id)) add(mapSagas, id.slice('map.'.length), sagaOf(id));
  for (const saga of sagas) for (const mapCode of saga.mapCodes ?? []) add(mapSagas, mapCode, saga.code);
  for (const map of maps)
    for (const code of mapSagas[map.code] ?? [])
      for (const entity of map.entities ?? [])
        for (const itemId of entity.objectLayerItemIds ?? []) add(items, itemId, code);
  for (const instance of instances) {
    const codes = new Set((instance.cyberiaMapCodes ?? []).flatMap((mapCode) => mapSagas[mapCode] ?? []));
    for (const itemId of collectInstanceItemIds({ entityDefaults: instance.entityDefaults }))
      for (const code of codes) add(items, itemId, code);
  }
  // A summon may trigger a skill of its own, so the sagas pass along until none is new.
  const summons = skills.flatMap(({ triggerItemId, skills: entries = [] }) =>
    entries
      .filter(({ summonedEntityItemId }) => summonedEntityItemId)
      .map(({ summonedEntityItemId }) => [triggerItemId, summonedEntityItemId]),
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const [trigger, summoned] of summons)
      for (const code of items[trigger] ?? []) changed = add(items, summoned, code) || changed;
  }
  return { items, maps: mapSagas };
}

/**
 * {@link sagaAssociations} of what a host stores.
 * @param {import('../../api/types.js').RouterOptions} options
 * @returns {Promise<{items: Object<string,string[]>, maps: Object<string,string[]>}>}
 * @memberof CyberiaSagaAssociations
 */
export async function loadSagaAssociations(options) {
  const model = (name) => DataBaseProviderService.getModel(name, options);
  const [maps, sagas, skills, instances, confs, entityDefaults] = await Promise.all([
    model('CyberiaMap').find({}, { code: 1, 'entities.objectLayerItemIds': 1 }).lean(),
    model('CyberiaSaga').find({}, { code: 1, mapCodes: 1 }).lean(),
    model('CyberiaSkill').find({}, { triggerItemId: 1, 'skills.summonedEntityItemId': 1 }).lean(),
    model('CyberiaInstance').find({}, { cyberiaMapCodes: 1, conf: 1 }).lean(),
    model('CyberiaInstanceConf').find({}, { entityDefaults: 1 }).lean(),
    model('CyberiaEntityTypeDefault')
      .find({}, { liveItemIds: 1, deadItemIds: 1, dropItemIds: 1, inventoryItemsIds: 1 })
      .lean(),
  ]);
  const byId = (documents) => new Map(documents.map((document) => [String(document._id), document]));
  const confOf = byId(confs);
  const defaultOf = byId(entityDefaults);
  return sagaAssociations({
    maps,
    sagas,
    skills,
    instances: instances.map(({ cyberiaMapCodes, conf }) => ({
      cyberiaMapCodes,
      entityDefaults: (confOf.get(String(conf))?.entityDefaults ?? []).map((id) => defaultOf.get(String(id))),
    })),
  });
}

/**
 * The keys of a bucket that belong to a saga a filter names: comma-separated terms, each matching
 * the saga codes that contain it, ignoring case.
 * @param {Object<string,string[]>} bucket - Saga codes by key.
 * @param {string} filter
 * @returns {string[]}
 * @memberof CyberiaSagaAssociations
 */
export function keysOfSagas(bucket, filter) {
  const terms = String(filter ?? '')
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  return Object.keys(bucket).filter((key) =>
    bucket[key].some((code) => terms.some((term) => code.toLowerCase().includes(term))),
  );
}

/**
 * The list parameters of a table request with its saga filter moved onto a stored field: the keys
 * of the sagas it names, as a set filter joined to any filter the field has. The filter model stays
 * a string, so the list cache keys on it.
 * @param {Object} params - Request query: `filterModel` and the rest.
 * @param {{family: 'items'|'maps', field: string}} target - The bucket and the stored field of a row key.
 * @param {import('../../api/types.js').RouterOptions} options
 * @returns {Promise<Object>} The parameters to list with.
 * @memberof CyberiaSagaAssociations
 */
export async function withSagaFilter(params, { family, field }, options) {
  const { [SAGA_FILTER_KEY]: sagaFilter, ...filterModel } = DataQuery.filterModelOf(params.filterModel) ?? {};
  if (!sagaFilter) return params;
  const keys = {
    filterType: 'set',
    values: keysOfSagas((await loadSagaAssociations(options))[family], sagaFilter.filter),
  };
  filterModel[field] = filterModel[field]
    ? { filterType: 'multi', operator: 'AND', filterModels: [filterModel[field], keys] }
    : keys;
  return { ...params, filterModel: JSON.stringify(filterModel) };
}
