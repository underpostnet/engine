/**
 * The sagas each item label and map code belongs to. A map belongs to the saga that defines it in
 * the content artifact and to every stored saga that lists it. An item belongs to the saga that
 * defines it, and to the saga of every map whose stored entities carry it. A label or a code may
 * belong to several sagas.
 *
 * @module src/projects/cyberia/saga-associations.js
 * @namespace CyberiaSagaAssociations
 */
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { DataQuery } from '../../server/storage/data-query.js';
import { SAGA_FILTER_KEY } from '../../client/components/cyberia/SharedDefaultsCyberia.js';
import { contentArtifact } from './content-artifact.js';

/**
 * The saga codes of each item label and map code, sorted.
 * @param {Object} stored
 * @param {Object[]} [stored.maps] - Stored maps: `code`, `entities[].objectLayerItemIds`.
 * @param {Object[]} [stored.sagas] - Stored sagas: `code`, `mapCodes`.
 * @param {Object} [index] - Context index; the artifact's by default.
 * @returns {{items: Object<string,string[]>, maps: Object<string,string[]>}}
 * @memberof CyberiaSagaAssociations
 */
export function sagaAssociations({ maps = [], sagas = [] }, index = contentArtifact().context) {
  const items = {};
  const mapSagas = {};
  const add = (bucket, key, code) => {
    if (!(bucket[key] ?? []).includes(code)) bucket[key] = [...(bucket[key] ?? []), code].sort();
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
  return { items, maps: mapSagas };
}

/**
 * {@link sagaAssociations} of the stored maps and sagas of a host.
 * @param {import('../../api/types.js').RouterOptions} options
 * @returns {Promise<{items: Object<string,string[]>, maps: Object<string,string[]>}>}
 * @memberof CyberiaSagaAssociations
 */
export async function loadSagaAssociations(options) {
  const model = (name) => DataBaseProviderService.getModel(name, options);
  const [maps, sagas] = await Promise.all([
    model('CyberiaMap').find({}, { code: 1, 'entities.objectLayerItemIds': 1 }).lean(),
    model('CyberiaSaga').find({}, { code: 1, mapCodes: 1 }).lean(),
  ]);
  return sagaAssociations({ maps, sagas });
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
