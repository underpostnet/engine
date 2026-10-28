/**
 * The working graph of a map population: the maps, instances and universes as its publication would
 * leave them. A document resolves to the draft the population saved for it, else to its persisted
 * baseline; an editor shows its unsaved changes over that in the browser. The graph is read from the
 * population and the canonical documents each time: it is no second store.
 *
 * | state       | the document                                                  |
 * | ----------- | ------------------------------------------------------------- |
 * | `persisted` | the canonical document; the population proposes no change       |
 * | `draft`     | a canonical document the population proposes a change to        |
 * | `new`       | a document the population proposes to create                    |
 *
 * A population drafts its own map (`draft`), whole instance and universe documents (`instanceDrafts`,
 * `universeDrafts`) and entity-type default rows (`defaultDrafts`): each entry holds the revision of
 * the canonical document it starts from, or none for a new one, and its own revision for each save.
 * An instance draft holds the fields the Instance Studio edits, the conf fields it edits with the
 * default rows it references, and the instance-specific variants it references (`variant:<key>`).
 * Each entry is checked against the typed contract of the population model. The same graph feeds the
 * runtime context step, the Studios a population opens, their previews, the portal connector and
 * topology, the map ownership checks, the defaults workspace, the publish review, the preflight, the
 * commit and the refresh targets.
 *
 * @module src/projects/cyberia/procedural/population/working-graph.js
 * @namespace CyberiaPopulationWorkingGraph
 */
import { randomUUID } from 'node:crypto';
import canonicalize from 'canonicalize';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../../db/DataBaseProvider.js';
import {
  CONTENT_CODE_PATTERN,
  graphLayoutDefect,
  resolveGraphLayout,
} from '../../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { connectPortals, portalTopology } from '../../../../api/cyberia-instance/cyberia-portal-connector.js';
import {
  CONF_FIELDS,
  DEFAULT_ROW_FIELDS,
  INSTANCE_FIELDS,
  UNIVERSE_FIELDS,
} from '../../../../api/cyberia-procedural-population/cyberia-procedural-population.model.js';
import { topologyOf, universeDefect } from '../../../../api/cyberia-universe/cyberia-universe.service.js';
import { liveEndpoints } from '../../../../api/cyberia-server-registry/cyberia-server-registry.service.js';
import { registryDefects } from '../../instance/map-registry.js';
import { renderMapPreviewPng } from '../../instance/map-preview-generator.js';
import { composeWorldPreview, storedMapsWithPictures, storedPictures } from '../../instance/world-preview.js';
import { confEconomyCode, universeWalletDefect } from '../../economy/economy-policy.js';
import { requestError } from '../engine.js';
import { STILL_OPEN, dropDraftThumbnails, findPopulation, only, openPopulation } from './population.js';

/** The reference to a row a draft proposes, and the key a reference of that form names ('' for another form). */
const keyedRef = (prefix) => [
  (key) => `${prefix}${key}`,
  (ref) => (String(ref).startsWith(prefix) ? String(ref).slice(prefix.length) : ''),
];
/** An instance conf draft references a variant it proposes as `variant:<key>`. */
export const [variantRef, variantKeyOf] = keyedRef('variant:');
/** An instance conf draft references a new row a default draft proposes as `draft:<key>`. */
export const [defaultRef, defaultKeyOf] = keyedRef('draft:');
/** Whether a reference names a stored row. */
export const storedRef = (ref) => /^[0-9a-f]{24}$/.test(String(ref));

const MAP_FIELDS = Object.freeze({
  code: 1,
  name: 1,
  status: 1,
  revision: 1,
  gridX: 1,
  gridY: 1,
  worldX: 1,
  worldY: 1,
  preview: 1,
  media: 1,
  'entities.entityType': 1,
  'entities.initCellX': 1,
  'entities.initCellY': 1,
  'entities.portalSubtype': 1,
});

/**
 * A model of the host as its readers read it, from the database each partition serves; null when the host
 * loads no such model.
 * @param {string} name - Model name.
 * @param {Object} options - Router options.
 * @returns {import('mongoose').Model|null}
 * @memberof CyberiaPopulationWorkingGraph
 */
export const servedModel = (name, options) => DataBaseProviderService.servedModels(options)[name] ?? null;
const pick = (value, fields) =>
  Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, value[field]]));
const plain = (value) => JSON.parse(JSON.stringify(value ?? null));

/** The fields of an instance a draft proposes, as its model holds them: the form drafts and bases compare in. */
const instanceFields = (models, instance) => {
  const fields = pick(new models.CyberiaInstance(instance).toObject(), INSTANCE_FIELDS);
  return plain({
    ...fields,
    mapLayout: fields.mapLayout.filter(({ mapCode }) => fields.cyberiaMapCodes.includes(mapCode)),
  });
};

/** The fields of an instance conf a draft proposes, as its model holds them. */
const confFields = (models, code, { aoiRadius, economyCode, entityDefaults = [] } = {}) => {
  const conf = new models.CyberiaInstanceConf({
    instanceCode: code,
    ...(aoiRadius !== undefined && aoiRadius !== null && { aoiRadius }),
    ...(economyCode && { economyCode }),
  });
  return { aoiRadius: conf.aoiRadius, economyCode: conf.economyCode, entityDefaults: entityDefaults.map(String) };
};

/** The fields of a universe a draft proposes. */
const universeFields = (universe) => ({
  name: String(universe.name ?? ''),
  description: String(universe.description ?? ''),
  ...topologyOf(universe),
});

/** A persisted instance with the conf fields a draft proposes. */
const persistedInstance = (models, instance, conf) => ({
  ...instanceFields(models, instance),
  code: instance.code,
  revision: instance.revision ?? 1,
  conf: confFields(models, instance.code, conf ?? {}),
  variants: [],
  state: 'persisted',
});

/**
 * The instances of the working graph of a population: `persisted` holds the canonical instances with
 * the conf fields a draft proposes, and `instances` the same with the instance drafts over them.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} population - A lean population.
 * @returns {Promise<{persisted: Map<string,Object>, instances: Map<string,Object>}>}
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function workingInstances(models, population) {
  const [instances, confs] = await Promise.all([
    models.CyberiaInstance.find({}, { code: 1, revision: 1, ...Object.fromEntries(INSTANCE_FIELDS.map((f) => [f, 1])) })
      .sort({ code: 1 })
      .lean(),
    models.CyberiaInstanceConf.find({}, Object.fromEntries(['instanceCode', ...CONF_FIELDS].map((f) => [f, 1]))).lean(),
  ]);
  const confOf = new Map(confs.map((conf) => [conf.instanceCode, conf]));
  const persisted = new Map(
    instances.map((instance) => [instance.code, persistedInstance(models, instance, confOf.get(instance.code))]),
  );
  const working = new Map(persisted);
  for (const entry of population.instanceDrafts ?? [])
    working.set(entry.code, {
      ...entry.document,
      code: entry.code,
      revision: persisted.get(entry.code)?.revision ?? null,
      conf: entry.conf,
      variants: entry.variants ?? [],
      state: entry.baseRevision === null ? 'new' : 'draft',
      baseRevision: entry.baseRevision,
      draftRevision: entry.revision,
    });
  return { persisted, instances: working };
}

/**
 * The working graph of a population: `persisted` holds the canonical maps, instances and universes,
 * and `maps`, `instances` and `universes` the same documents with the drafts of the population over
 * them. Each document carries its `state`.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} population - A lean population.
 * @param {Object} options - Router options of the host: its universes.
 * @returns {Promise<Object>}
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function workingGraph(models, population, options) {
  const Universe = servedModel('CyberiaUniverse', options);
  const [maps, instances, universes] = await Promise.all([
    models.CyberiaMap.find({}, MAP_FIELDS).sort({ code: 1 }).lean(),
    workingInstances(models, population),
    Universe
      ? Universe.find({}, { code: 1, name: 1, description: 1, instances: 1, links: 1, revision: 1 })
          .sort({ code: 1 })
          .lean()
      : [],
  ]);
  const persisted = {
    maps: new Map(maps.map((map) => [map.code, { ...map, state: 'persisted' }])),
    instances: instances.persisted,
    universes: new Map(
      universes.map((universe) => [
        universe.code,
        { code: universe.code, ...universeFields(universe), revision: universe.revision, state: 'persisted' },
      ]),
    ),
  };
  const graph = {
    population: { _id: String(population._id), revision: population.revision, mapCode: population.mapCode },
    persisted,
    maps: new Map(persisted.maps),
    instances: instances.instances,
    universes: new Map(persisted.universes),
    defaults: population.defaultDrafts ?? [],
    hostsUniverses: Boolean(Universe),
  };
  const map = persisted.maps.get(population.mapCode);
  if (map && population.draft)
    graph.maps.set(map.code, {
      ...map,
      ...population.draft.grid,
      entities: population.draft.entities,
      state: 'draft',
      draftRevision: population.draft.revision,
    });
  for (const entry of population.universeDrafts ?? [])
    graph.universes.set(entry.code, {
      ...entry.document,
      code: entry.code,
      revision: persisted.universes.get(entry.code)?.revision ?? null,
      state: entry.baseRevision === null ? 'new' : 'draft',
      baseRevision: entry.baseRevision,
      draftRevision: entry.revision,
    });
  return graph;
}

/** The universe whose members hold an instance, or null. */
export const universeOf = (universes, instanceCode) =>
  [...universes.values()].find(({ instances }) => instances.some((member) => member.instanceCode === instanceCode)) ??
  null;

/** The stored rows an instance draft references that no stored conf references: global rows the graph makes local. */
const localizedRows = (graph) => {
  const referenced = (instances) => new Set([...instances.values()].flatMap(({ conf }) => conf.entityDefaults));
  const before = referenced(graph.persisted.instances);
  return [...referenced(graph.instances)].filter((ref) => storedRef(ref) && !before.has(ref));
};

/**
 * The instances whose world the population changes through its instance and map drafts: a drafted or
 * new instance, and each instance that lists a drafted map now or did before. `defaultWorlds` adds the
 * worlds its entity-type defaults change.
 */
export function changedWorlds(graph) {
  const drafted = [...graph.maps.values()].filter(({ state }) => state === 'draft').map(({ code }) => code);
  const lists = (instance) => instance?.cyberiaMapCodes?.some((code) => drafted.includes(code));
  const codes = new Set();
  for (const instance of graph.instances.values())
    if (instance.state !== 'persisted' || lists(instance) || lists(graph.persisted.instances.get(instance.code)))
      codes.add(instance.code);
  return [...codes].sort();
}

/** The instances of the map of the population: those that list it now or did before, and every drafted one. */
function mapInstances(graph) {
  const { mapCode } = graph.population;
  const codes = new Set();
  for (const [code, instance] of graph.instances)
    if (instance.state !== 'persisted' || instance.cyberiaMapCodes.includes(mapCode)) codes.add(code);
  for (const [code, instance] of graph.persisted.instances)
    if (instance.cyberiaMapCodes.includes(mapCode)) codes.add(code);
  return [...codes].sort();
}

/** The defects of the topology of an instance that are not defects of its persisted one. */
function portalProblems(graph, instance) {
  const maps = [...graph.maps.values()];
  const now = portalTopology(instance.cyberiaMapCodes, maps, instance.portals ?? []);
  const before = graph.persisted.instances.get(instance.code);
  const was = before
    ? portalTopology(before.cyberiaMapCodes, [...graph.persisted.maps.values()], before.portals ?? [])
    : { invalid: [], unresolved: [], unreachable: [] };
  const key = ({ sourceMapCode, sourceCellX, sourceCellY, targetMapCode }) =>
    [sourceMapCode, sourceCellX, sourceCellY, targetMapCode].join(':');
  const fresh = (list, previous) => list.filter((entry) => !previous.map(key).includes(key(entry)));
  return {
    errors: [
      ...fresh(now.invalid, was.invalid).map(
        (portal) =>
          `Instance ${instance.code}: the portal from ${portal.sourceMapCode} to ${portal.targetMapCode} names a map outside the instance or a deleted map`,
      ),
      ...fresh(now.unresolved, was.unresolved).map(
        ({ sourceMapCode, sourceCellX, sourceCellY }) =>
          `Instance ${instance.code}: no portal entity stands at (${sourceCellX}, ${sourceCellY}) of map ${sourceMapCode}, where a portal starts`,
      ),
    ],
    warnings: now.unreachable
      .filter((code) => !was.unreachable.includes(code))
      .map((code) => `Instance ${instance.code}: no portal leads to map ${code}`),
  };
}

/**
 * Everything that stops the working graph, and what it only warns about, by the rules the canonical
 * writes apply: each draft starts from the revision its document is at; the maps of each instance
 * have one owner and do not overlap; the portals of each changed instance start on a portal entity
 * and name maps of the instance; each universe holds valid members of one wallet, and no instance
 * joins two universes; each entity-type default an instance references exists. A defect the
 * persisted documents hold already is not the population's.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} graph - {@link workingGraph}.
 * @param {Object} options - Router options of the host: its economies.
 * @returns {Promise<{errors:string[], warnings:string[]}>}
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function graphProblems(models, graph, options) {
  const errors = [];
  const warnings = [];
  for (const [kind, drafts, persisted, editor] of [
    ['Instance', graph.instances, graph.persisted.instances, 'Instance Studio'],
    ['Universe', graph.universes, graph.persisted.universes, 'Universe Studio'],
  ])
    for (const document of drafts.values()) {
      if (document.state === 'persisted') continue;
      const stored = persisted.get(document.code);
      if (document.state === 'new' && stored)
        errors.push(
          `${kind} ${document.code} was created after the draft: discard the draft, or open the stored ${kind.toLowerCase()}`,
        );
      else if (document.state === 'draft' && !stored)
        errors.push(`${kind} ${document.code} was deleted after the draft`);
      else if (document.state === 'draft' && stored.revision !== document.baseRevision)
        errors.push(
          `${kind} ${document.code} moved to revision ${stored.revision}; the draft starts from revision ${document.baseRevision}: reopen it in the ${editor}`,
        );
    }

  const baseline = new Set(
    registryDefects([...graph.persisted.maps.values()], [...graph.persisted.instances.values()]),
  );
  for (const defect of registryDefects([...graph.maps.values()], [...graph.instances.values()]))
    if (!baseline.has(defect)) errors.push(defect);

  for (const code of changedWorlds(graph)) {
    const instance = graph.instances.get(code);
    const found = portalProblems(graph, instance);
    errors.push(...found.errors);
    warnings.push(...found.warnings);
    const rows = new Set(
      (
        await models.CyberiaEntityTypeDefault.find(
          { _id: { $in: instance.conf.entityDefaults.filter(storedRef) } },
          { _id: 1 },
        ).lean()
      ).map(({ _id }) => String(_id)),
    );
    for (const ref of instance.conf.entityDefaults) {
      const exists = variantKeyOf(ref)
        ? instance.variants.some(({ key }) => key === variantKeyOf(ref))
        : defaultKeyOf(ref)
          ? graph.defaults.some(({ key, rowId }) => !rowId && key === defaultKeyOf(ref))
          : rows.has(ref);
      if (!exists) errors.push(`Instance ${code} references entity-type default ${ref}, which does not exist`);
    }
  }

  const edited = graph.defaults.filter(({ rowId }) => rowId);
  const stored = new Map(
    (
      await models.CyberiaEntityTypeDefault.find(
        { _id: { $in: edited.map(({ rowId }) => rowId) } },
        { updatedAt: 1 },
      ).lean()
    ).map((row) => [String(row._id), row]),
  );
  for (const { rowId, baseUpdatedAt } of edited) {
    const row = stored.get(rowId);
    if (!row) errors.push(`Entity-type default ${rowId} was deleted after the draft: discard its edit`);
    else if (row.updatedAt?.getTime() !== new Date(baseUpdatedAt).getTime())
      errors.push(`Entity-type default ${rowId} changed after the draft: discard its edit, then edit it again`);
  }

  for (const ref of localizedRows(graph)) {
    const codes = [...graph.instances.values()]
      .filter(({ conf }) => conf.entityDefaults.includes(ref))
      .map(({ code }) => code);
    warnings.push(
      `Entity-type default ${ref} runs in every world now; once ${codes.join(', ')} references it, only ${codes.join(', ')} runs it`,
    );
  }

  const referenced = (instances) => new Set([...instances.values()].flatMap(({ conf }) => conf.entityDefaults));
  const kept = referenced(graph.instances);
  const chosenGlobal = new Set(graph.defaults.filter(({ global }) => global).map(({ rowId }) => rowId));
  for (const ref of referenced(graph.persisted.instances))
    if (!kept.has(ref) && !chosenGlobal.has(ref))
      errors.push(
        `Entity-type default ${ref} loses its last instance reference and would run in every world: drop the variant that replaces it`,
      );

  const CyberiaEconomy = servedModel('CyberiaEconomy', options);
  const economies = Object.fromEntries(
    [...graph.instances.values()]
      .filter(({ state }) => state !== 'persisted')
      .map(({ code, conf }) => [code, confEconomyCode(conf)]),
  );
  if (CyberiaEconomy && Object.keys(economies).length > 0) {
    const held = new Map(
      (
        await CyberiaEconomy.find(
          { code: { $in: [...new Set(Object.values(economies))] } },
          { code: 1, status: 1 },
        ).lean()
      ).map(({ code, status }) => [code, status]),
    );
    for (const [code, economy] of Object.entries(economies)) {
      const status = held.get(economy);
      if (status !== 'active')
        errors.push(
          `Instance ${code}: its draft conf names economy ${economy}, which content database ${CyberiaEconomy.db.name} ${status ? `holds ${status}` : 'does not hold'}`,
        );
    }
  }

  const owners = new Map();
  for (const universe of graph.universes.values()) {
    for (const { instanceCode } of universe.instances) {
      if (owners.has(instanceCode) && owners.get(instanceCode) !== universe.code)
        errors.push(`Instance ${instanceCode} joins universes ${owners.get(instanceCode)} and ${universe.code}`);
      owners.set(instanceCode, universe.code);
    }
    if (universe.state === 'persisted') continue;
    const defect = universeDefect(universe);
    if (defect) errors.push(`Universe ${universe.code}: ${defect}`);
    const codes = universe.instances.map(({ instanceCode }) => instanceCode);
    for (const code of codes.filter((member) => !graph.instances.has(member)))
      errors.push(`Universe ${universe.code} names instance ${code}, which neither exists nor is drafted`);
  }
  for (const universe of CyberiaEconomy ? graph.universes.values() : []) {
    const codes = universe.instances
      .map(({ instanceCode }) => instanceCode)
      .filter((code) => graph.instances.has(code));
    if (universe.state === 'persisted' && !codes.some((code) => code in economies)) continue;
    const defect = await universeWalletDefect(
      { CyberiaInstanceConf: models.CyberiaInstanceConf, CyberiaEconomy },
      codes,
      { confs: economies, pending: 'in its draft conf' },
    );
    if (defect) errors.push(`Universe ${universe.code}: ${defect}`);
  }
  return { errors, warnings };
}

/**
 * What the portals of one instance would connect in the working graph: the topology of its maps as
 * the population drafts them, with the portals an editor holds.
 * @param {Object} graph - {@link workingGraph}.
 * @param {{mapCodes:string[], portals:Object[]}} instance
 * @returns {Object} The answer of `portalTopology`.
 * @memberof CyberiaPopulationWorkingGraph
 */
export const graphTopology = (graph, { mapCodes, portals }) =>
  portalTopology(mapCodes, [...graph.maps.values()], portals);

/**
 * The portals the Portal Connector proposes for `mapCodes` in the working graph: a ring through the
 * portal entities of the maps as the population drafts them, then the other portal entities by their
 * subtype. Nothing is stored: the editor saves the portals to its draft.
 * @param {Object} graph - {@link workingGraph}.
 * @param {string[]} mapCodes
 * @returns {Object} The answer of `connectPortals`.
 * @memberof CyberiaPopulationWorkingGraph
 */
export const graphPortals = (graph, mapCodes) => connectPortals(mapCodes, [...graph.maps.values()]);

/** How a document a population drafts shows: the source of its preview and its revisions. */
const documentState = ({ state, revision, baseRevision, draftRevision }) => ({
  state,
  revision: revision ?? null,
  baseRevision: baseRevision ?? null,
  draftRevision: draftRevision ?? null,
});

/** Whether the world preview of an instance is a draft: the instance or one of its maps is drafted. */
const draftsWorld = (graph, instance) =>
  instance.state !== 'persisted' || instance.cyberiaMapCodes.some((code) => graph.maps.get(code)?.state === 'draft');

/**
 * The runtime context of the map of a population, from its working graph: each instance that lists
 * the map now or did before, and each instance the population drafts, with how its association with
 * the map and its universe membership change, the source of its preview, its live servers, the economy
 * its conf names and its entity-type defaults; each universe of those instances and each universe the population drafts,
 * with the members it gains and loses.
 * @param {Object} graph - {@link workingGraph}.
 * @param {Object} options - Router options of the host: its server registry.
 * @returns {Promise<Object>}
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function runtimeContextOf(graph, options) {
  const { mapCode } = graph.population;
  const codes = mapInstances(graph);
  const endpoints =
    codes.length && servedModel('CyberiaServerRegistry', options)
      ? await liveEndpoints(options, { instanceCodes: codes })
      : [];
  const instances = codes.map((code) => {
    const now = graph.instances.get(code);
    const before = graph.persisted.instances.get(code);
    const lists = Boolean(now?.cyberiaMapCodes.includes(mapCode));
    const listed = Boolean(before?.cyberiaMapCodes.includes(mapCode));
    const universe = universeOf(graph.universes, code);
    const was = universeOf(graph.persisted.universes, code);
    const servers = endpoints.filter((endpoint) => endpoint.instanceCode === code);
    return {
      code,
      name: now.name || code,
      status: now.status,
      ...documentState(now),
      maps: now.cyberiaMapCodes.length,
      economy: confEconomyCode(now.conf),
      thumbnail: now.thumbnail ?? null,
      association: lists === listed ? (lists ? 'listed' : 'none') : lists ? 'adds' : 'removes',
      universe: universe && { code: universe.code, name: universe.name || universe.code, state: universe.state },
      membership:
        (universe?.code ?? '') === (was?.code ?? '') ? 'same' : !universe ? 'leaves' : was ? 'moves' : 'joins',
      preview: draftsWorld(graph, now) ? 'draft' : 'persisted',
      servers: { available: servers.filter(({ status }) => status === 'available').length, total: servers.length },
      defaults: { rows: now.conf.entityDefaults.length, variants: now.variants.length },
    };
  });
  const universes = [...graph.universes.values()]
    .filter(
      (universe) =>
        universe.state !== 'persisted' ||
        universe.instances.some(({ instanceCode }) => codes.includes(instanceCode)) ||
        graph.persisted.universes
          .get(universe.code)
          ?.instances.some(({ instanceCode }) => codes.includes(instanceCode)),
    )
    .map((universe) => {
      const members = universe.instances.map(({ instanceCode }) => instanceCode);
      const before = (graph.persisted.universes.get(universe.code)?.instances ?? []).map(
        ({ instanceCode }) => instanceCode,
      );
      return {
        code: universe.code,
        name: universe.name || universe.code,
        ...documentState(universe),
        members,
        instances: members.filter((member) => codes.includes(member)),
        joins: members.filter((member) => !before.includes(member)),
        leaves: before.filter((member) => !members.includes(member)),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const map = graph.maps.get(mapCode);
  return {
    mapCode,
    populationRevision: graph.population.revision,
    map: { state: map?.state ?? 'persisted', draftRevision: map?.draftRevision ?? null },
    instances,
    universes,
  };
}

/**
 * The instance an Instance Studio opened from a population edits: its document as the working graph
 * holds it, its state and revisions, the maps its stored document lists, and the map of the population
 * with its state.
 * @param {Object} graph - {@link workingGraph}.
 * @param {string} code
 * @returns {Object}
 * @throws {Error} 404 when neither the canonical documents nor the population hold the instance.
 * @memberof CyberiaPopulationWorkingGraph
 */
export function instanceDraftView(graph, code) {
  const instance = graph.instances.get(code);
  if (!instance) throw requestError(`There is no instance ${code}`, 404);
  const map = graph.maps.get(graph.population.mapCode);
  return {
    code,
    document: pick(instance, INSTANCE_FIELDS),
    conf: instance.conf,
    variants: instance.variants,
    ...documentState(instance),
    preview: draftsWorld(graph, instance) ? 'draft' : 'persisted',
    persistedMapCodes: graph.persisted.instances.get(code)?.cyberiaMapCodes ?? [],
    populationRevision: graph.population.revision,
    map: {
      code: graph.population.mapCode,
      state: map?.state ?? 'persisted',
      draftRevision: map?.draftRevision ?? null,
    },
  };
}

/**
 * The universe a Universe Studio opened from a population edits: its document as the working graph
 * holds it, its state and revisions, and each member as the graph holds it with the source of its
 * preview.
 * @param {Object} graph - {@link workingGraph}.
 * @param {string} code
 * @returns {Object}
 * @throws {Error} 404 when neither the canonical documents nor the population hold the universe.
 * @memberof CyberiaPopulationWorkingGraph
 */
export function universeDraftView(graph, code) {
  const universe = graph.universes.get(code);
  if (!universe) throw requestError(`There is no universe ${code}`, 404);
  return {
    code,
    document: pick(universe, UNIVERSE_FIELDS),
    ...documentState(universe),
    populationRevision: graph.population.revision,
    persistedMembers: graph.persisted.universes.get(code)?.instances.map(({ instanceCode }) => instanceCode) ?? [],
    members: universe.instances.map(({ instanceCode }) => {
      const instance = graph.instances.get(instanceCode);
      return {
        instanceCode,
        ...(instance ? documentState(instance) : { state: 'missing' }),
        preview: instance && draftsWorld(graph, instance) ? 'draft' : 'persisted',
      };
    }),
  };
}

/** The instances and maps of the working graph a universe view of its members reads. */
export const universeContent = (graph) => ({
  instances: [...graph.instances.values()],
  maps: [...graph.maps.values()],
});

/** Reads the working graph of a population. */
export async function populationGraph(models, id, options) {
  return await workingGraph(models, await findPopulation(models, id), options);
}

/** The plain copy of an object a request names. */
function objectOf(body, name) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw requestError(`${name} is an object`);
  return plain(body);
}

/**
 * An entry of a draft list as the typed contract of the population holds it: its defaults applied and
 * each value cast. A field the contract does not have, at any depth, or a value it refuses is a 400.
 * @param {Object} models - {@link populationModels}.
 * @param {'instanceDrafts'|'universeDrafts'|'defaultDrafts'} field
 * @param {Object} entry
 * @returns {Promise<Object>}
 */
export async function checkedEntry(models, field, entry) {
  try {
    const population = new models.CyberiaProceduralPopulation({ [field]: [entry] });
    await population.validate([field]);
    return population.toObject({ depopulate: true })[field][0];
  } catch (error) {
    const reasons = Object.values(error.errors ?? {}).map(
      ({ path, reason, message }) => `${path.replace(/^\w+\.0\./, '')}: ${(reason ?? { message }).message}`,
    );
    throw requestError(reasons.length > 0 ? [...new Set(reasons)].join('; ') : error.message);
  }
}

/**
 * Writes one draft of a population under the revision the editor read, checked by its typed contract:
 * a new entry when no entry has its `identity` and none has the values of `exclusive`, else the entry
 * at its revision. It lands only while the population takes changes, and each write is one revision of
 * the population more.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {Object} params.population - The population as read.
 * @param {'instanceDrafts'|'universeDrafts'|'defaultDrafts'} params.field
 * @param {Object<string,string>} params.identity - `{ code }` or `{ key }`.
 * @param {number} params.revision - The draft revision the editor read; 0 for none.
 * @param {Object} params.next - The entry to write.
 * @param {Object<string,*>} [params.exclusive] - Values no other entry may hold; null values are skipped.
 * @returns {Promise<Object>} The entry as written.
 * @throws {Error} 400 for an entry the contract refuses; 409 for a stale revision or a closed population.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function writeDraft({ models, population, field, identity, revision, next, exclusive = identity }) {
  const [[name, value]] = Object.entries(identity);
  const label = next.code ?? `entity-type default ${next.rowId ?? 'draft'}`;
  const current = (population[field] ?? []).find((entry) => entry[name] === value);
  if ((current?.revision ?? 0) !== revision)
    throw requestError(
      `The draft of ${label} is at revision ${current?.revision ?? 0}, not ${revision}: reload it`,
      409,
    );
  const checked = await checkedEntry(models, field, next);
  const absent = Object.entries(exclusive)
    .filter(([, held]) => held !== null && held !== undefined)
    .map(([path, held]) => [`${field}.${path}`, { $ne: held }]);
  const written = current
    ? await models.CyberiaProceduralPopulation.updateOne(
        { _id: population._id, [field]: { $elemMatch: { [name]: value, revision: current.revision } }, ...STILL_OPEN },
        { $set: { [`${field}.$`]: checked }, $inc: { revision: 1 } },
      )
    : await models.CyberiaProceduralPopulation.updateOne(
        { _id: population._id, ...Object.fromEntries(absent), ...STILL_OPEN },
        { $push: { [field]: checked }, $inc: { revision: 1 } },
      );
  if (!written.matchedCount) throw requestError(`The draft of ${label} changed while saving: reload it`, 409);
  return checked;
}

/**
 * A default row a draft holds, checked as a canonical write checks it over the row it changes.
 * @param {Object} models - {@link populationModels}.
 * @param {Object} row - The fields of a row.
 * @param {Object} [stored] - The stored row it changes.
 * @returns {Promise<Object>} The row.
 * @throws {Error} 400 for a row the canonical model refuses.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function checkedRow(models, row, stored = {}) {
  try {
    await new models.CyberiaEntityTypeDefault({ ...stored, ...row }).validate();
  } catch (error) {
    throw requestError(error.message);
  }
  return row;
}

/** The revision a first draft starts from: the one of the stored document, which the editor must have read. */
function baseRevisionOf(current, stored, body, kind) {
  if (current) return current.baseRevision;
  const baseRevision = stored ? (stored.revision ?? 1) : null;
  if ((body.baseRevision ?? null) !== baseRevision)
    throw requestError(
      `${kind} is at revision ${baseRevision ?? 'none (not stored)'}, not ${body.baseRevision ?? 'none'}: reload it`,
      409,
    );
  return baseRevision;
}

/**
 * Saves the draft of an instance in a population, `{ document, conf, baseRevision, revision }`: the
 * fields the Instance Studio edits and the conf fields it edits, checked as a canonical write checks
 * them. The canonical instance does not change: the publication of the population writes it.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.code - Instance code.
 * @param {Object} params.body
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} {@link instanceDraftView}.
 * @throws {Error} 400 for a defect; 409 for a stale revision or a closed population.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function saveInstanceDraft({ models, id, code, body, actor, options }) {
  const population = await openPopulation(models, id);
  only(body, ['document', 'conf', 'baseRevision', 'revision'], 'An instance draft');
  if (!CONTENT_CODE_PATTERN.test(String(code))) throw requestError(`"${code}" is not an instance code`);
  const current = (population.instanceDrafts ?? []).find((entry) => entry.code === code);
  const [stored, storedConf] = await Promise.all([
    models.CyberiaInstance.findOne({ code }).lean(),
    models.CyberiaInstanceConf.findOne({ instanceCode: code }).lean(),
  ]);
  const baseRevision = baseRevisionOf(current, stored, body, `Instance ${code}`);
  const base = current ? current.base : stored && instanceBase(models, stored, storedConf);
  const document = { ...(base?.document ?? {}), ...objectOf(body.document, 'An instance document') };
  const conf = { ...(current?.conf ?? base?.conf ?? {}), ...objectOf(body.conf ?? {}, 'An instance conf') };
  const variants = current?.variants ?? [];
  const unknown = (conf.entityDefaults ?? []).find(
    (ref) => variantKeyOf(ref) && !variants.some(({ key }) => key === variantKeyOf(ref)),
  );
  if (unknown) throw requestError(`${unknown} is not a variant of this instance`);
  const next = await checkedEntry(models, 'instanceDrafts', {
    code,
    baseRevision,
    base,
    revision: (current?.revision ?? 0) + 1,
    document: {
      ...document,
      mapLayout: (document.mapLayout ?? []).filter(({ mapCode }) => document.cyberiaMapCodes?.includes(mapCode)),
    },
    conf,
    variants,
    savedAt: new Date(),
    savedBy: actor,
  });
  const defect = graphLayoutDefect(next.document.cyberiaMapCodes, next.document.mapLayout, 'mapCode');
  if (defect) throw requestError(`Invalid map layout: ${defect}`);
  await writeDraft({ models, population, field: 'instanceDrafts', identity: { code }, revision: body.revision, next });
  if (current && String(current.document.thumbnail ?? '') !== String(next.document.thumbnail ?? ''))
    await dropDraftThumbnails(models, [current], { options });
  return instanceDraftView(await populationGraph(models, id, options), code);
}

/**
 * Saves the draft of a universe in a population, `{ document, baseRevision, revision }`: the fields the
 * Universe Studio edits. A member may be an instance the population drafts. The canonical universe
 * does not change: the publication of the population writes it.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.code - Universe code.
 * @param {Object} params.body
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} {@link universeDraftView}.
 * @throws {Error} 400 for a defect; 409 for a stale revision or a closed population; 503 on a host with no universes.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function saveUniverseDraft({ models, id, code, body, actor, options }) {
  const Universe = servedModel('CyberiaUniverse', options);
  if (!Universe) throw requestError('This host serves no universes', 503);
  const population = await openPopulation(models, id);
  only(body, ['document', 'baseRevision', 'revision'], 'A universe draft');
  const current = (population.universeDrafts ?? []).find((entry) => entry.code === code);
  const stored = await Universe.findOne({ code }).lean();
  const baseRevision = baseRevisionOf(current, stored, body, `Universe ${code}`);
  const base = current ? current.base : stored && universeFields(stored);
  const next = await checkedEntry(models, 'universeDrafts', {
    code,
    baseRevision,
    base,
    revision: (current?.revision ?? 0) + 1,
    document: objectOf(body.document, 'A universe document'),
    savedAt: new Date(),
    savedBy: actor,
  });
  const defect = universeDefect({ code, ...universeFields(next.document) });
  if (defect) throw requestError(`Invalid universe: ${defect}`);
  await writeDraft({ models, population, field: 'universeDrafts', identity: { code }, revision: body.revision, next });
  return universeDraftView(await populationGraph(models, id, options), code);
}

/** Whether two values hold the same data. */
const same = (a, b) => canonicalize(plain(a)) === canonicalize(plain(b));

/**
 * Whether an instance draft proposes no change: it holds the document and conf of the stored instance it
 * starts from, and no variant. Such a draft publishes nothing, so a write that leaves it drops it.
 * @param {Object} entry - An instance draft.
 * @returns {boolean}
 * @memberof CyberiaPopulationWorkingGraph
 */
export const unchangedDraft = (entry) =>
  entry.baseRevision !== null &&
  entry.variants.length === 0 &&
  same(entry.document, entry.base.document) &&
  same(entry.conf, entry.base.conf);

/** The base of a draft of a stored instance: its document and conf when the draft started. */
const instanceBase = (models, stored, conf) => {
  const { conf: storedConf, ...document } = persistedInstance(models, stored, conf);
  return { document: pick(document, INSTANCE_FIELDS), conf: storedConf };
};

/**
 * The fields of a draft over the fields of the stored document: a field the draft changed from its
 * base keeps the draft value, any other takes the stored one. A field both changed to different values
 * is a conflict, unless `prefer` is `draft`, which keeps the draft value.
 * @returns {{merged:Object, conflicts:string[]}}
 */
function mergeFields(base, draft, stored, prefer, prefix = '') {
  const merged = {};
  const conflicts = [];
  for (const field of new Set([...Object.keys(draft), ...Object.keys(stored)])) {
    const mine = !same(draft[field], base[field]);
    if (mine && !same(stored[field], base[field]) && !same(draft[field], stored[field]) && prefer !== 'draft')
      conflicts.push(`${prefix}${field}`);
    merged[field] = mine ? draft[field] : stored[field];
  }
  return { merged, conflicts };
}

/**
 * Moves the draft of a stored instance or universe onto the revision the stored document is at now: each
 * field the draft changed keeps its draft value and every other field takes the stored one, so a change
 * another editor saved meanwhile stays. A field both changed to different values is a conflict: nothing
 * moves until the moderator keeps the draft values with `{ prefer: 'draft' }`, or discards the draft.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {'instance'|'universe'} params.kind
 * @param {string} params.code
 * @param {{prefer?:'draft'}} [params.body]
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} {@link instanceDraftView} or {@link universeDraftView}.
 * @throws {Error} 404 for no such draft; 409 for a conflict, a new or deleted document, or a closed population.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function rebaseDocumentDraft({ models, id, kind, code, body = {}, actor, options }) {
  const population = await openPopulation(models, id);
  only(body, ['prefer'], 'A rebase');
  const universe = kind === 'universe';
  const field = universe ? 'universeDrafts' : 'instanceDrafts';
  const current = (population[field] ?? []).find((entry) => entry.code === code);
  if (!current) throw requestError(`The population drafts no ${kind} ${code}`, 404);
  if (current.baseRevision === null) throw requestError(`${code} is new: it has no stored revision to rebase on`, 409);
  const stored = universe
    ? await servedModel('CyberiaUniverse', options).findOne({ code }).lean()
    : await models.CyberiaInstance.findOne({ code }).lean();
  if (!stored) throw requestError(`${code} was deleted after the draft`, 409);
  const revision = stored.revision ?? 1;
  const next = {
    ...current,
    baseRevision: revision,
    revision: current.revision + 1,
    savedAt: new Date(),
    savedBy: actor,
  };
  let conflicts;
  if (universe) {
    const theirs = universeFields(stored);
    ({ merged: next.document, conflicts } = mergeFields(current.base, current.document, theirs, body.prefer));
    next.base = theirs;
  } else {
    const theirs = instanceBase(
      models,
      stored,
      await models.CyberiaInstanceConf.findOne({ instanceCode: code }).lean(),
    );
    const document = mergeFields(current.base.document, current.document, theirs.document, body.prefer);
    const conf = mergeFields(current.base.conf, current.conf, theirs.conf, body.prefer, 'conf.');
    conflicts = [...document.conflicts, ...conf.conflicts];
    Object.assign(next, { document: document.merged, conf: conf.merged, base: theirs });
  }
  if (conflicts.length > 0)
    throw requestError(
      `${code} changed ${conflicts.join(', ')} in the draft and at revision ${revision}: keep the draft values, or discard the draft`,
      409,
    );
  await writeDraft({ models, population, field, identity: { code }, revision: current.revision, next });
  const graph = await populationGraph(models, id, options);
  return universe ? universeDraftView(graph, code) : instanceDraftView(graph, code);
}

/**
 * Discards the draft of an instance or a universe: the working graph shows its persisted document
 * again. Nothing canonical changes.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {'instance'|'universe'} params.kind
 * @param {string} params.code
 * @param {Object} params.options - Router options.
 * @returns {Promise<{discarded:boolean}>}
 * @throws {Error} 409 for a closed population.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function discardDocumentDraft({ models, id, kind, code, options }) {
  const population = await openPopulation(models, id);
  const field = kind === 'universe' ? 'universeDrafts' : 'instanceDrafts';
  const written = await models.CyberiaProceduralPopulation.updateOne(
    { _id: population._id, [`${field}.code`]: code },
    { $pull: { [field]: { code } }, $inc: { revision: 1 } },
  );
  const entry = (population[field] ?? []).find((draft) => draft.code === code);
  if (written.modifiedCount > 0 && kind === 'instance') await dropDraftThumbnails(models, [entry], { options });
  return { discarded: written.modifiedCount > 0 };
}

/**
 * The next entry of the draft of an instance in the working graph: its current draft, or a first draft
 * of the stored instance, with the fields `change` gives from the instance as the graph holds it.
 * @returns {{revision:number, next:Object}} The draft revision the write names, and the entry.
 */
export function nextInstanceDraft(population, graph, code, change, actor) {
  const instance = instanceDraftView(graph, code);
  const current = (population.instanceDrafts ?? []).find((entry) => entry.code === code);
  const stored = graph.persisted.instances.get(code);
  return {
    revision: current?.revision ?? 0,
    next: {
      code,
      baseRevision: current ? current.baseRevision : instance.revision,
      base: current ? current.base : { document: pick(stored, INSTANCE_FIELDS), conf: stored.conf },
      revision: (current?.revision ?? 0) + 1,
      document: instance.document,
      conf: instance.conf,
      variants: instance.variants,
      ...change(instance),
      savedAt: new Date(),
      savedBy: actor,
    },
  };
}

/** The stored entity-type default `rowId` names, or a 404. */
async function storedDefault(models, rowId) {
  const row = /^[0-9a-f]{24}$/i.test(String(rowId)) && (await models.CyberiaEntityTypeDefault.findById(rowId).lean());
  if (!row) throw requestError(`There is no entity-type default ${rowId}`, 404);
  return row;
}

/**
 * Proposes an instance-specific variant of an entity-type default for one instance. For a shared row,
 * the copy takes the place of the row in the draft of that instance (scope `shared`); for a global row,
 * the draft adds a reference to the copy (scope `global`). Every other instance keeps the row. The copy
 * is created at the publication, with its reference, so it never runs as a global row.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.code - Instance code.
 * @param {string} params.rowId - A row the instance shares with other instances, or a global row.
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} {@link instanceDraftView}, with `key` of the variant.
 * @throws {Error} 404 for an unknown instance or row; 409 for a row the instance does not run, or runs alone.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function proposeVariant({ models, id, code, rowId, actor, options }) {
  const population = await openPopulation(models, id);
  const graph = await workingGraph(models, population, options);
  instanceDraftView(graph, code);
  const stored = await storedDefault(models, rowId);
  const row = graph.defaults.find((draft) => draft.rowId === String(rowId))?.row ?? stored;
  const runs = [...graph.instances.values()]
    .filter(({ conf }) => conf.entityDefaults.includes(String(rowId)))
    .map((entry) => entry.code);
  const orphan = await models.CyberiaInstanceConf.exists({
    entityDefaults: stored._id,
    instanceCode: { $nin: [...graph.instances.keys()] },
  });
  const scope = runs.length === 0 && !orphan ? 'global' : 'shared';
  if (scope === 'shared' && !runs.includes(code))
    throw requestError(
      `Instance ${code} does not run entity-type default ${rowId}: it runs in ${runs.join(', ')}`,
      409,
    );
  if (scope === 'shared' && runs.length === 1 && !orphan)
    throw requestError(
      `Entity-type default ${rowId} runs only in instance ${code}: edit it in the Entity Studio, a variant is for a shared or global row`,
      409,
    );
  const key = randomUUID();
  const { revision, next } = nextInstanceDraft(
    population,
    graph,
    code,
    (instance) => ({
      conf: {
        ...instance.conf,
        entityDefaults:
          scope === 'global'
            ? [...instance.conf.entityDefaults, variantRef(key)]
            : instance.conf.entityDefaults.map((ref) => (ref === String(rowId) ? variantRef(key) : ref)),
      },
      variants: [...instance.variants, { key, from: String(rowId), scope, row: plain(pick(row, DEFAULT_ROW_FIELDS)) }],
    }),
    actor,
  );
  await writeDraft({ models, population, field: 'instanceDrafts', identity: { code }, revision, next });
  return { ...instanceDraftView(await populationGraph(models, id, options), code), key };
}

/**
 * Saves the fields of a variant an instance draft proposes, `{ row, revision }`, checked as a canonical
 * entity-type default.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.code - Instance code.
 * @param {string} params.key - Variant key.
 * @param {Object} params.body
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} {@link instanceDraftView}.
 * @throws {Error} 400 for a defect; 404 for an unknown variant; 409 for a stale revision.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function saveVariant({ models, id, code, key, body, actor, options }) {
  const population = await openPopulation(models, id);
  only(body, ['row', 'revision'], 'A variant');
  const current = (population.instanceDrafts ?? []).find((entry) => entry.code === code);
  const variant = current?.variants.find((entry) => entry.key === key);
  if (!variant) throw requestError(`Instance ${code} proposes no variant ${key}`, 404);
  const row = await checkedRow(models, objectOf(body.row, 'A variant row'));
  await writeDraft({
    models,
    population,
    field: 'instanceDrafts',
    identity: { code },
    revision: body.revision,
    next: {
      ...current,
      revision: current.revision + 1,
      variants: current.variants.map((entry) => (entry.key === key ? { ...entry, row } : entry)),
      savedAt: new Date(),
      savedBy: actor,
    },
  });
  return instanceDraftView(await populationGraph(models, id, options), code);
}

/**
 * Drops a variant an instance draft proposes: the instance runs the row the variant copies again.
 * @param {Object} params
 * @param {Object} params.models - {@link populationModels}.
 * @param {string} params.id - Population id.
 * @param {string} params.code - Instance code.
 * @param {string} params.key - Variant key.
 * @param {string} params.actor
 * @param {Object} params.options - Router options.
 * @returns {Promise<Object>} {@link instanceDraftView}.
 * @throws {Error} 404 for an unknown variant; 409 for a closed population.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function dropVariant({ models, id, code, key, actor, options }) {
  const population = await openPopulation(models, id);
  const current = (population.instanceDrafts ?? []).find((entry) => entry.code === code);
  const variant = current?.variants.find((entry) => entry.key === key);
  if (!variant) throw requestError(`Instance ${code} proposes no variant ${key}`, 404);
  await writeDraft({
    models,
    population,
    field: 'instanceDrafts',
    identity: { code },
    revision: current.revision,
    next: {
      ...current,
      revision: current.revision + 1,
      conf: {
        ...current.conf,
        entityDefaults:
          variant.scope === 'global'
            ? current.conf.entityDefaults.filter((ref) => ref !== variantRef(key))
            : current.conf.entityDefaults.map((ref) => (ref === variantRef(key) ? variant.from : ref)),
      },
      variants: current.variants.filter((entry) => entry.key !== key),
      savedAt: new Date(),
      savedBy: actor,
    },
  });
  return instanceDraftView(await populationGraph(models, id, options), code);
}

/**
 * The picture of the map draft of a population, as the map preview draws a stored map.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id - Population id.
 * @param {Object} options - Router options.
 * @param {number|string} [revision] - The draft revision the picture is for.
 * @returns {Promise<Buffer|null>} Null when the draft draws nothing.
 * @throws {Error} 404 when the population drafts no map; 409 when the draft is at another revision.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function draftMapPicture(models, id, options, revision) {
  const { draft } = await findPopulation(models, id);
  if (!draft) throw requestError('The population drafts no map', 404);
  if (revision !== undefined && Number(revision) !== draft.revision)
    throw requestError(`The map draft is at revision ${draft.revision}, not ${revision}`, 409);
  return await renderMapPreviewPng({ ...draft.grid, entities: draft.entities }, { options });
}

/**
 * The preview of the world of an instance as the working graph holds it: its maps on their cells
 * with its portals, the drafted map of the population drawn from its draft and every other map from
 * its stored picture. Nothing is stored.
 * @param {Object} models - {@link populationModels}.
 * @param {string} id - Population id.
 * @param {string} code - Instance code.
 * @param {Object} options - Router options.
 * @param {number|string} [revision] - The population revision the picture is for.
 * @returns {Promise<Buffer>}
 * @throws {Error} 404 for an unknown instance, or a world with no map; 409 when the population is at another revision.
 * @memberof CyberiaPopulationWorkingGraph
 */
export async function draftWorldPicture(models, id, code, options, revision) {
  const population = await findPopulation(models, id);
  if (revision !== undefined && Number(revision) !== population.revision)
    throw requestError(`The population is at revision ${population.revision}, not ${revision}`, 409);
  const graph = await workingGraph(models, population, options);
  const instance = graph.instances.get(code);
  if (!instance) throw requestError(`There is no instance ${code}`, 404);
  const drafted = (map) => graph.maps.get(map.code)?.state === 'draft';
  const maps = (await storedMapsWithPictures(instance.cyberiaMapCodes, options)).map((map) =>
    drafted(map) ? { ...map, ...population.draft.grid } : map,
  );
  if (maps.length === 0) throw requestError(`World ${code} has no map`, 404);
  const pictures = await storedPictures(maps, options);
  for (const [index, map] of maps.entries())
    if (drafted(map))
      pictures[index] = await renderMapPreviewPng({ ...map, entities: population.draft.entities }, { options });
  const cells = resolveGraphLayout(
    maps.map((map) => map.code),
    instance.mapLayout ?? [],
    'mapCode',
  );
  return await composeWorldPreview({ maps, cells, portals: instance.portals ?? [], pictures });
}
